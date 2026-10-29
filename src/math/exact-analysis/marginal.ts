import type { CompiledGame, CompiledMode, CompiledStrip } from '../../config/compile';
import type { GameMode } from '../../config/types';
import { evaluateLine } from '../../game/payouts';

/**
 * Exact expected values from per-reel marginal distributions ("marginal method").
 *
 * Because the reels stop independently, the symbols on one payline are
 * independent across reels, and each has the marginal distribution of its
 * (reel, row) position. The expected win of a payline is therefore the sum over
 * all symbol tuples of (product of marginal probabilities) x (line pay), and the
 * expected total line win is the sum over paylines (linearity of expectation;
 * correlations between lines do not affect the mean). Scatter counts are summed
 * over independent reels, so their distribution is the convolution of the
 * per-reel scatter-count distributions.
 *
 * This yields exact (up to floating-point rounding) uncapped RTP, trigger
 * probabilities and feature expectations in milliseconds. It cannot produce
 * the payout distribution (variance, hit frequency, cap effects); that is done
 * by full enumeration in `enumerate.ts` + `distribution.ts`.
 *
 * Line pays are evaluated with the game engine's own `evaluateLine`, so this
 * method and the independent enumerator cross-validate each other.
 */

export interface AwardProbability {
  readonly award: number;
  readonly probability: number;
}

export interface CombinationStat {
  readonly symbol: string;
  readonly count: number;
  /** Paytable value x mode multipliers actually applied, averaged per hit (line-bet units). */
  readonly averageUnits: number;
  /** Average over paylines of P(this payline pays exactly this combination). */
  readonly probabilityPerLine: number;
  /** Contribution of this combination to the mode's expected win per spin, all lines, per unit of total bet. */
  readonly rtpContribution: number;
}

export interface ModeMarginals {
  readonly mode: GameMode;
  readonly reelSet: string;
  /** Number of equally likely reel-stop combinations (product of strip weights). */
  readonly combinations: number;
  /** Expected line win per spin, all lines, in line-bet units (includes mode multipliers). */
  readonly expectedLineUnits: number;
  readonly expectedScatterUnits: number;
  readonly expectedUnits: number;
  /** P(payline l pays) for each line. */
  readonly lineHitProbability: readonly number[];
  /** Expected line-win units per spin attributed to each paying symbol id (Wild = Wild-only combinations). */
  readonly symbolLineUnits: Readonly<Record<string, number>>;
  /** Probability and RTP contribution of every paying (symbol, count) combination. */
  readonly lineCombinations: readonly CombinationStat[];
  /** P(exactly c scatters visible), c = 0..cells. */
  readonly scatterCountPmf: readonly number[];
  /** Distribution of the raw free-spin award from this mode's award table (trigger in base, retrigger in free). */
  readonly awardPmf: readonly AwardProbability[];
  /** P(raw award > 0). */
  readonly awardProbability: number;
}

export interface FeatureExpectation {
  readonly initialAward: number;
  /** P(feature starts with this award | base spin). */
  readonly probability: number;
  readonly expectedSpins: number;
  readonly expectedRetriggers: number;
  readonly probabilityAnyRetrigger: number;
  /** Distribution of the total number of free spins awarded (initial + retriggers). */
  readonly spinsPmf: readonly { spins: number; probability: number }[];
  /** Probability mass not resolved when retriggers are unlimited (truncation bound), else 0. */
  readonly unresolvedMass: number;
  /** Uncapped expected feature win in line-bet units (Wald's identity: E[spins] x E[free-spin win]). */
  readonly expectedUnits: number;
}

export interface MarginalAnalysis {
  readonly lineCount: number;
  /** Total bet in line-bet units (= number of paylines). */
  readonly totalBetUnits: number;
  readonly base: ModeMarginals;
  readonly free: ModeMarginals;
  readonly features: readonly FeatureExpectation[];
  readonly triggerProbability: number;
  readonly expectedSpinsBetweenTriggers: number;
  readonly expectedFeatureUnitsPerTrigger: number;
  readonly expectedFreeSpinsPerTrigger: number;
  /** RTP per unit of base-game stake, ignoring the round win cap. */
  readonly rtpUncapped: { readonly base: number; readonly feature: number; readonly total: number };
}

/** P(symbol at (reel, row)) for each symbol index. */
export function cellMarginal(game: CompiledGame, strip: CompiledStrip, row: number): Float64Array {
  const p = new Float64Array(game.symbolIds.length);
  for (let s = 0; s < strip.length; s++) {
    p[strip.symbols[(s + row) % strip.length]!]! += strip.weights[s]! / strip.totalWeight;
  }
  return p;
}

/** Distribution of the number of scatters visible on one reel. */
export function reelScatterPmf(game: CompiledGame, strip: CompiledStrip): Float64Array {
  const pmf = new Float64Array(game.rows + 1);
  for (let s = 0; s < strip.length; s++) {
    let c = 0;
    for (let r = 0; r < game.rows; r++) if (strip.symbols[(s + r) % strip.length] === game.scatter) c++;
    pmf[c]! += strip.weights[s]! / strip.totalWeight;
  }
  return pmf;
}

export function convolvePmf(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j]! += a[i]! * b[j]!;
  return out;
}

export function analyzeModeMarginals(game: CompiledGame, modeName: GameMode): ModeMarginals {
  const mode: CompiledMode = game.modes[modeName];
  const strips = mode.reelSet.strips;
  const nSym = game.symbolIds.length;
  const symbolUnits = new Float64Array(nSym);
  const lineHit: number[] = [];
  let expectedLineUnits = 0;
  const cache = new Map<
    string,
    { units: number; hit: number; bySymbol: Float64Array; byCombo: Map<string, [number, number]> }
  >();
  const comboTotals = new Map<string, [number, number]>(); // key -> [probability summed over lines, units]

  // A probe window: only the cells on the evaluated line are filled in.
  const cells = new Int16Array(game.cells);

  for (let l = 0; l < game.lineCount; l++) {
    const line = game.paylines[l]!;
    const key = Array.from(line, (row, reel) => (strips[reel]!.uniform ? `${reel}:*` : `${reel}:${row}`)).join('|');
    let res = cache.get(key);
    if (!res) {
      const marg = Array.from(line, (row, reel) => cellMarginal(game, strips[reel]!, row));
      const bySymbol = new Float64Array(nSym);
      const byCombo = new Map<string, [number, number]>();
      let units = 0;
      let hit = 0;
      const record = (prob: number) => {
        const win = evaluateLine(game, mode, cells, l, 1);
        if (win) {
          units += prob * win.units;
          hit += prob;
          bySymbol[game.symbolIndex.get(win.symbol)!]! += prob * win.units;
          const ck = `${win.symbol}:${win.count}`;
          const acc = byCombo.get(ck) ?? [0, 0];
          acc[0] += prob;
          acc[1] += prob * win.units;
          byCombo.set(ck, acc);
        }
      };
      // Depth-first over symbol tuples. `target` is -1 while every symbol so far is Wild.
      // Once a symbol breaks every possible combination, later reels cannot change the
      // line's pay, so they are filled with Scatter (which extends nothing) and the
      // whole subtree is evaluated once with the prefix probability.
      const recurse = (reel: number, prob: number, target: number) => {
        if (reel === game.reels) return record(prob);
        const p = marg[reel]!;
        for (let s = 0; s < nSym; s++) {
          if (p[s]! === 0) continue;
          cells[reel * game.rows + line[reel]!] = s;
          let next = target;
          let extends_ = true;
          if (target === -1) {
            if (s === game.wild) next = -1;
            else if (game.kinds[s] === 'regular') next = s;
            else extends_ = false;
          } else if (s !== target && s !== game.wild) extends_ = false;
          if (extends_) recurse(reel + 1, prob * p[s]!, next);
          else {
            for (let r = reel + 1; r < game.reels; r++) cells[r * game.rows + line[r]!] = game.scatter;
            record(prob * p[s]!);
          }
        }
      };
      recurse(0, 1, -1);
      res = { units, hit, bySymbol, byCombo };
      cache.set(key, res);
    }
    expectedLineUnits += res.units;
    lineHit.push(res.hit);
    for (let s = 0; s < nSym; s++) symbolUnits[s]! += res.bySymbol[s]!;
    for (const [k, [pr, u]] of res.byCombo) {
      const acc = comboTotals.get(k) ?? [0, 0];
      acc[0] += pr;
      acc[1] += u;
      comboTotals.set(k, acc);
    }
  }
  const combinationStats: CombinationStat[] = [...comboTotals.entries()]
    .map(([k, [pr, u]]) => {
      const [symbol, count] = k.split(':') as [string, string];
      return {
        symbol,
        count: Number(count),
        averageUnits: u / pr,
        probabilityPerLine: pr / game.lineCount,
        rtpContribution: u / game.lineCount,
      };
    })
    .sort((a, b) => game.symbolIndex.get(a.symbol)! - game.symbolIndex.get(b.symbol)! || a.count - b.count);

  let scatterPmf: Float64Array = Float64Array.of(1);
  for (const strip of strips) scatterPmf = convolvePmf(scatterPmf, reelScatterPmf(game, strip));

  let expectedScatterUnits = 0;
  const awards = new Map<number, number>();
  for (let c = 0; c < scatterPmf.length; c++) {
    const p = scatterPmf[c]!;
    if (mode.scatterPays) expectedScatterUnits += p * game.scatterPay[c]! * game.lineCount * mode.winMultiplier;
    const award = mode.awards[c]!;
    awards.set(award, (awards.get(award) ?? 0) + p);
  }
  const awardPmf = [...awards.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([award, probability]) => ({ award, probability }));

  const symbolLineUnits: Record<string, number> = {};
  game.symbolIds.forEach((id, i) => {
    if (symbolUnits[i]! > 0) symbolLineUnits[id] = symbolUnits[i]!;
  });

  return {
    mode: modeName,
    reelSet: mode.reelSet.name,
    combinations: strips.reduce((a, s) => a * s.totalWeight, 1),
    expectedLineUnits,
    expectedScatterUnits,
    expectedUnits: expectedLineUnits + expectedScatterUnits,
    lineHitProbability: lineHit,
    symbolLineUnits,
    lineCombinations: combinationStats,
    scatterCountPmf: Array.from(scatterPmf),
    awardPmf,
    awardProbability: awardPmf.filter((a) => a.award > 0).reduce((acc, a) => acc + a.probability, 0),
  };
}

/**
 * Exact distribution of the number of free spins in a feature, by dynamic
 * programming over (spins played, spins awarded). Each free spin independently
 * yields a raw retrigger award with distribution `retriggerPmf`; awards are
 * truncated so the total never exceeds `maxTotalSpins`.
 */
export function featureSpinDistribution(
  initialAward: number,
  retriggerPmf: readonly AwardProbability[],
  maxTotalSpins: number | null,
  epsilon = 1e-16,
): { spinsPmf: Map<number, number>; expectedRetriggers: number; unresolvedMass: number } {
  const trunc = (a: number) => (maxTotalSpins === null ? a : Math.min(a, maxTotalSpins));
  let current = new Map<number, number>([[trunc(initialAward), 1]]);
  const spinsPmf = new Map<number, number>();
  let expectedRetriggers = 0;
  let played = 0;
  let unresolvedMass = 0;
  while (current.size > 0) {
    const next = new Map<number, number>();
    for (const [awarded, mass] of current) {
      for (const { award, probability } of retriggerPmf) {
        if (probability === 0) continue;
        const a2 = trunc(awarded + award);
        const m = mass * probability;
        if (a2 > awarded) expectedRetriggers += m;
        if (a2 === played + 1) spinsPmf.set(a2, (spinsPmf.get(a2) ?? 0) + m);
        else next.set(a2, (next.get(a2) ?? 0) + m);
      }
    }
    played += 1;
    current = next;
    if (maxTotalSpins === null) {
      let total = 0;
      for (const m of current.values()) total += m;
      if (total < epsilon) {
        unresolvedMass = total;
        break;
      }
      if (played >= 20_000) {
        throw new Error(
          `free-spins length distribution did not converge (mass ${total.toExponential(2)} still unresolved after ${played} spins)`,
        );
      }
    }
  }
  return { spinsPmf, expectedRetriggers, unresolvedMass };
}

export function analyzeMarginals(game: CompiledGame): MarginalAnalysis {
  const base = analyzeModeMarginals(game, 'base');
  const free = analyzeModeMarginals(game, 'free');
  const retriggerPmf = game.retriggerEnabled ? free.awardPmf : [{ award: 0, probability: 1 }];

  const features: FeatureExpectation[] = base.awardPmf
    .filter((a) => a.award > 0 && a.probability > 0)
    .map(({ award, probability }) => {
      const dist = featureSpinDistribution(award, retriggerPmf, game.maxTotalFreeSpins);
      const spinsPmf = [...dist.spinsPmf.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([spins, p]) => ({ spins, probability: p }));
      const expectedSpins = spinsPmf.reduce((acc, s) => acc + s.spins * s.probability, 0);
      const probabilityAnyRetrigger = spinsPmf
        .filter((s) => s.spins > award)
        .reduce((acc, s) => acc + s.probability, 0);
      return {
        initialAward: award,
        probability,
        expectedSpins,
        expectedRetriggers: dist.expectedRetriggers,
        probabilityAnyRetrigger,
        spinsPmf,
        unresolvedMass: dist.unresolvedMass,
        expectedUnits: expectedSpins * free.expectedUnits,
      };
    });

  const triggerProbability = features.reduce((a, f) => a + f.probability, 0);
  const featureUnits = features.reduce((a, f) => a + f.probability * f.expectedUnits, 0);
  const featureSpins = features.reduce((a, f) => a + f.probability * f.expectedSpins, 0);
  const totalBetUnits = game.lineCount;
  const rtpBase = base.expectedUnits / totalBetUnits;
  const rtpFeature = featureUnits / totalBetUnits;

  return {
    lineCount: game.lineCount,
    totalBetUnits,
    base,
    free,
    features,
    triggerProbability,
    expectedSpinsBetweenTriggers: triggerProbability > 0 ? 1 / triggerProbability : Infinity,
    expectedFeatureUnitsPerTrigger: triggerProbability > 0 ? featureUnits / triggerProbability : 0,
    expectedFreeSpinsPerTrigger: triggerProbability > 0 ? featureSpins / triggerProbability : 0,
    rtpUncapped: { base: rtpBase, feature: rtpFeature, total: rtpBase + rtpFeature },
  };
}
