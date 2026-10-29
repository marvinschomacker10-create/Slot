import type { CompiledGame } from '../../config/compile';
import { enumerateSpinDistribution, type SpinDistribution } from './enumerate';
import { FFT, lumpAtCap, nextPow2 } from './fft';

/**
 * Exact round-payout distribution.
 *
 * A round's payout is R = min(B + F, cap), where B is the base-spin win and F the
 * total win of the free spins it triggers (0 if none). Everything is measured
 * in line-bet units on an integer grid 0..cap ("cap" = round win cap in units).
 *
 * 1. Per-spin pmfs come from full enumeration, split by the free-spin award the
 *    spin produces (trigger award in base, retrigger award in free spins).
 * 2. The feature is a Markov chain over (spins played, spins awarded). Its win
 *    distribution is propagated level by level with FFT convolutions. Because
 *    all wins are non-negative, mass at or above the cap can be lumped onto the
 *    cap at every step without changing min(total, cap) (see `lumpAtCap`).
 * 3. R's pmf = P(no trigger, B=u) + sum over awards a of (P(trigger a, B) * F_a).
 *
 * When the configuration has no cap, an analysis horizon is used instead and the
 * mass beyond it is reported (it is then a lower bound on RTP).
 */

export interface FeatureDistribution {
  readonly initialAward: number;
  /** P(feature win = u), u = 0..horizon (top cell = "horizon or more"). */
  readonly pmf: Float64Array;
  /**
   * Expected free spins actually played, accounting for the round ending early when the
   * win cap is reached (spins are only played while base win + feature win < cap).
   */
  readonly expectedSpinsPlayed: number;
  /** P(at least one retrigger is granted), accounting for early termination by the cap. */
  readonly probabilityAnyRetrigger: number;
  /** Expected number of granted retriggers, accounting for early termination by the cap. */
  readonly expectedRetriggers: number;
  /** Free-spin states propagated through the convolution DP. */
  readonly states: number;
  readonly unresolvedMass: number;
}

export interface RoundDistribution {
  readonly base: SpinDistribution;
  readonly free: SpinDistribution;
  /** Grid top in line-bet units: the round cap, or the analysis horizon if uncapped. */
  readonly horizon: number;
  readonly capped: boolean;
  /** True when the grid includes every reachable payout (capped, or uncapped with a finite maximum). */
  readonly horizonCoversAllOutcomes: boolean;
  readonly roundPmf: Float64Array;
  /** P(min(B, cap) = u): the base spin alone (feature value excluded). */
  readonly baseSpinPmf: Float64Array;
  readonly features: readonly FeatureDistribution[];
  /** Base spin pmf conditioned on no trigger / trigger, unnormalised (joint with the event). */
  readonly noTriggerMass: number;
  readonly fftSize: number;
  readonly fftCount: number;
  readonly massError: number;
  readonly elapsedMs: number;
}

export interface DistributionOptions {
  /** Horizon (x total bet) when the configuration has no win cap. Default 20,000. */
  readonly uncappedHorizonMultiplier?: number;
  /** Pre-computed enumerations (lets callers reuse them). */
  readonly base?: SpinDistribution;
  readonly free?: SpinDistribution;
  readonly onProgress?: (message: string) => void;
}

/** Splits an enumerated spin distribution by the award its scatter count produces. */
export function splitByAward(dist: SpinDistribution, awards: Int32Array): Map<number, Float64Array> {
  const S = dist.maxScatter + 1;
  const out = new Map<number, Float64Array>();
  for (let u = 0; u <= dist.maxUnits; u++) {
    for (let c = 0; c < S; c++) {
      const w = dist.weight[u * S + c]!;
      if (w === 0) continue;
      const a = awards[c] ?? awards[awards.length - 1]!;
      let arr = out.get(a);
      if (!arr) {
        arr = new Float64Array(dist.maxUnits + 1);
        out.set(a, arr);
      }
      arr[u]! += w / dist.combinations;
    }
  }
  return out;
}

export function computeRoundDistribution(game: CompiledGame, options: DistributionOptions = {}): RoundDistribution {
  const t0 = performance.now();
  const log = options.onProgress ?? (() => {});
  const totalBetUnits = game.lineCount;
  const capped = game.maxWinMultiplier !== null;

  log('enumerating base-game reel stops');
  const base = options.base ?? enumerateSpinDistribution(game, 'base');
  log(`base: ${base.combinations.toLocaleString('en-US')} combinations in ${(base.elapsedMs / 1000).toFixed(1)} s`);
  log('enumerating free-spin reel stops');
  const free = options.free ?? enumerateSpinDistribution(game, 'free');
  log(`free: ${free.combinations.toLocaleString('en-US')} combinations in ${(free.elapsedMs / 1000).toFixed(1)} s`);

  // Grid top: the cap if there is one. Otherwise the largest reachable round payout when it is
  // finite and below the default horizon (then the grid covers every outcome exactly), else the horizon.
  const maxTotal = game.maxTotalFreeSpins;
  const reachable = maxTotal === null ? Infinity : base.maxUnits + maxTotal * free.maxUnits;
  const horizon = capped
    ? game.maxWinMultiplier! * totalBetUnits
    : Math.min(reachable, (options.uncappedHorizonMultiplier ?? 20_000) * totalBetUnits);
  const horizonCoversAllOutcomes = capped || reachable <= horizon;

  const baseByAward = splitByAward(base, game.modes.base.awards);
  const freeAwards = game.retriggerEnabled ? game.modes.free.awards : new Int32Array(game.modes.free.awards.length);
  const freeByAward = splitByAward(free, freeAwards);

  const fftSize = nextPow2(2 * horizon + 1);
  const fft = new FFT(fftSize);
  let fftCount = 0;
  const freeMass = new Map<number, number>();
  for (const [e, pmf] of freeByAward) freeMass.set(e, pmf.reduce((a, b) => a + b, 0));
  const freeHat = new Map<number, { re: Float64Array; im: Float64Array }>();
  const freeLumped = new Map<number, Float64Array>();
  for (const [e, pmf] of freeByAward) {
    const lumped = lumpAtCap(pmf, horizon);
    freeLumped.set(e, lumped);
    freeHat.set(e, fft.forwardReal(lumped));
    fftCount++;
  }

  const trunc = (a: number) => (maxTotal === null ? a : Math.min(a, maxTotal));
  const features: FeatureDistribution[] = [];

  for (const a0 of [...baseByAward.keys()].filter((a) => a > 0).sort((x, y) => x - y)) {
    log(`propagating free-spin feature with initial award ${a0}`);
    const result = new Float64Array(horizon + 1);
    // CDF of the triggering base-spin win, conditional on this award: P(B <= k | trigger a0).
    const trig = lumpAtCap(baseByAward.get(a0)!, horizon);
    let trigMass = 0;
    for (const v of trig) trigMass += v;
    const cdf = new Float64Array(horizon + 1);
    for (let k = 0, acc = 0; k <= horizon; k++) cdf[k] = acc += trig[k]! / trigMass;
    // P(round still below the cap) for feature-win distribution x: sum_i x[i] * P(B <= cap - 1 - i).
    const stillRunning = (x: Float64Array) => {
      if (!capped) {
        let m = 0;
        for (let i = 0; i < horizon; i++) m += x[i]!;
        return m;
      }
      let m = 0;
      for (let i = 0; i < horizon; i++) m += x[i]! * cdf[horizon - 1 - i]!;
      return m;
    };
    let expectedSpinsPlayed = 0;
    let expectedRetriggers = 0;
    let probabilityAnyRetrigger = 0;
    let level = new Map<number, Float64Array>();
    const start = new Float64Array(horizon + 1);
    start[0] = 1;
    level.set(trunc(a0), start);
    let played = 0;
    let states = 0;
    let unresolvedMass = 0;
    while (level.size > 0) {
      const next = new Map<number, Float64Array>();
      for (const [awarded, x] of level) {
        states++;
        // A spin is played from this state only while the round is below the cap.
        const alive = stillRunning(x);
        expectedSpinsPlayed += alive;
        let pGranted = 0;
        for (const [e, mass] of freeMass) if (trunc(awarded + e) > awarded) pGranted += mass;
        expectedRetriggers += alive * pGranted;
        if (awarded === trunc(a0)) probabilityAnyRetrigger += alive * pGranted;
        const isDelta = played === 0;
        const xHat = isDelta ? null : fft.forwardReal(x);
        if (xHat) fftCount++;
        for (const [e, dHat] of freeHat) {
          const y = isDelta ? freeLumped.get(e)! : lumpAtCap(fft.inverseProduct(xHat!, dHat), horizon, false);
          if (!isDelta) fftCount++;
          const a2 = trunc(awarded + e);
          const target = a2 === played + 1 ? result : (next.get(a2) ?? next.set(a2, new Float64Array(horizon + 1)).get(a2)!);
          for (let i = 0; i <= horizon; i++) target[i]! += y[i]!;
        }
      }
      played++;
      level = next;
      if (maxTotal === null) {
        let mass = 0;
        for (const x of level.values()) for (let i = 0; i <= horizon; i++) mass += x[i]!;
        if (mass < 1e-15) {
          unresolvedMass = mass;
          break;
        }
        if (played >= 20_000) throw new Error('free-spins win distribution did not converge');
      }
    }
    features.push({ initialAward: a0, pmf: result, expectedSpinsPlayed, probabilityAnyRetrigger, expectedRetriggers, states, unresolvedMass });
  }

  log('combining base game and feature distributions');
  const roundPmf = new Float64Array(horizon + 1);
  const baseSpinPmf = new Float64Array(horizon + 1);
  let noTriggerMass = 0;
  for (const [a, pmf] of baseByAward) {
    const lumped = lumpAtCap(pmf, horizon);
    for (let i = 0; i <= horizon; i++) baseSpinPmf[i]! += lumped[i]!;
    if (a === 0) {
      for (let i = 0; i <= horizon; i++) {
        roundPmf[i]! += lumped[i]!;
        noTriggerMass += lumped[i]!;
      }
      continue;
    }
    const feature = features.find((f) => f.initialAward === a)!;
    const conv = lumpAtCap(fft.inverseProduct(fft.forwardReal(lumped), fft.forwardReal(feature.pmf)), horizon, false);
    fftCount += 3;
    for (let i = 0; i <= horizon; i++) roundPmf[i]! += conv[i]!;
  }

  let mass = 0;
  for (let i = 0; i <= horizon; i++) mass += roundPmf[i]!;

  return {
    base,
    free,
    horizon,
    capped,
    horizonCoversAllOutcomes,
    roundPmf,
    baseSpinPmf,
    features,
    noTriggerMass,
    fftSize,
    fftCount,
    massError: mass - 1,
    elapsedMs: performance.now() - t0,
  };
}
