import type { CompiledGame } from '../../config/compile';
import { HIGH_PAYOUT_THRESHOLDS, PAYOUT_BAND_EDGES, bandIndex, bandLabels } from '../simulation/accumulator';
import { trialsForRelativePrecision } from '../statistics';
import { computeRoundDistribution, type RoundDistribution } from './distribution';
import type { SpinDistribution } from './enumerate';
import { analyzeMarginals, type MarginalAnalysis, type ModeMarginals } from './marginal';

export const EXACT_ANALYSIS_SCHEMA = 'gilded-orbit/exact-analysis@3';

export const DEFINITIONS = {
  rtpDenominator:
    'RTP = expected total payout of a game round divided by the base-game stake of that round. A round is one paid base-game spin plus every free spin it triggers, including retriggers. Free spins have no stake and are not part of the denominator.',
  units:
    'Internally all wins are integers in line-bet units. Multipliers ("x bet") in reports are multiples of the total bet (line bet x 20 paylines).',
  displayedWins:
    'Displayed wins are the credits paid to the balance. They do NOT include the stake: the stake is debited separately when the round starts. Net result of a round = win - stake.',
  hit: 'A hit is a round with a payout greater than zero (any line win, scatter win or feature win).',
  netPositive: 'A net-positive round pays strictly more than its stake.',
  losingRound: 'A losing (no-win) round pays nothing. A net-losing round pays less than its stake.',
  capRule:
    'The total payout of one round is capped at limits.maxWinMultiplier x total bet. When the cap is reached the round ends immediately and remaining free spins are forfeited (they could not pay anything).',
} as const;

export interface ProbabilityRow {
  readonly multiplier: number;
  readonly probability: number;
  readonly oneIn: number | null;
  /** True when the value is below the numerical resolution of the distribution computation. */
  readonly belowNumericalFloor: boolean;
  /** Rounds needed to estimate this probability within +/-10% (95% confidence) by simulation. */
  readonly roundsFor10PctPrecision: number | null;
}

export interface BandRow {
  readonly label: string;
  readonly fromMultiplier: number;
  readonly toMultiplier: number | null;
  readonly probability: number;
  readonly rtpContribution: number;
}

export interface ExactAnalysis {
  readonly schema: typeof EXACT_ANALYSIS_SCHEMA;
  readonly game: { readonly id: string; readonly name: string; readonly version: string; readonly configHash: string };
  readonly generatedAt: string;
  readonly definitions: typeof DEFINITIONS;
  readonly method: {
    readonly summary: string;
    readonly baseCombinations: number;
    readonly freeCombinations: number;
    readonly enumerationMs: { readonly base: number; readonly free: number };
    readonly distributionMs: number;
    readonly fftSize: number;
    readonly fftCount: number;
    readonly featureStates: number;
    readonly horizonUnits: number;
    readonly capped: boolean;
    readonly horizonCoversAllOutcomes: boolean;
    readonly totalMassError: number;
    readonly numericalFloor: number;
    readonly unresolvedFeatureMass: number;
  };
  readonly configSummary: {
    readonly reels: number;
    readonly rows: number;
    readonly paylines: number;
    readonly reelLengths: Readonly<Record<string, readonly number[]>>;
    readonly maxWinMultiplier: number | null;
    readonly targetRtp: number;
    readonly freeSpinsMaxTotal: number | null;
    readonly retriggerEnabled: boolean;
  };
  readonly rtp: {
    readonly total: number;
    readonly base: number;
    readonly feature: number;
    readonly baseLine: number;
    readonly baseScatter: number;
    readonly totalUncapped: number;
    readonly capEffect: number;
    readonly target: number;
    readonly deviationFromTarget: number;
    readonly expectedPayoutPerUnitStake: number;
    readonly expectedNetPerUnitStake: number;
  };
  readonly baseGame: SpinSection;
  readonly freeGame: SpinSection & { readonly retriggerProbabilityPerSpin: number };
  readonly feature: {
    readonly triggerProbability: number;
    readonly expectedBaseSpinsBetweenTriggers: number;
    readonly triggerByScatterCount: readonly { scatters: number; probability: number; award: number }[];
    /** Free spins awarded per trigger (initial + retriggers), ignoring early termination by the cap. */
    readonly expectedFreeSpinsPerTrigger: number;
    /** Free spins actually played per trigger: the round stops when the win cap is reached. */
    readonly expectedFreeSpinsPlayedPerTrigger: number;
    readonly freeSpinsPmf: readonly { spins: number; probability: number }[];
    /** P(a feature retriggers at least once), cap-aware. */
    readonly probabilityAnyRetrigger: number;
    /** Same, ignoring early termination by the cap. */
    readonly probabilityAnyRetriggerUncapped: number;
    readonly expectedRetriggersPerFeature: number;
    /** Uncapped expected feature win per trigger (Wald's identity), x total bet. */
    readonly expectedWinUncapped: number;
    /** Expected free-spins payout per trigger after the round cap: feature RTP / trigger probability. */
    readonly expectedWin: number;
    /** Mean of the stand-alone feature win distribution (feature alone, capped at the round cap). */
    readonly standaloneMeanWin: number;
    /** SD, quantiles and tail probabilities below describe the stand-alone feature win distribution. */
    readonly sdWin: number;
    readonly quantiles: Readonly<Record<string, number>>;
    readonly probabilityWinAtLeast: readonly ProbabilityRow[];
    readonly maxPossibleWinUpperBound: number;
    /** Whole-round payout (triggering spin + feature) conditional on a trigger. */
    readonly roundGivenTrigger: {
      readonly meanWin: number;
      readonly triggeringSpinMeanWin: number;
      readonly probabilityWinAtLeast: readonly ProbabilityRow[];
    };
  };
  readonly round: {
    readonly hitFrequency: number;
    readonly probabilityNoWin: number;
    readonly probabilityWinBelowStake: number;
    readonly probabilityReturnsStake: number;
    readonly probabilityNetPositive: number;
    readonly mean: number;
    readonly variance: number;
    readonly sd: number;
    readonly coefficientOfVariation: number;
    readonly skewness: number;
    readonly excessKurtosis: number;
    readonly quantiles: Readonly<Record<string, number>>;
    readonly bands: readonly BandRow[];
    readonly thresholds: readonly ProbabilityRow[];
    readonly capProbability: number;
    readonly capProbabilityBelowFloor: boolean;
    readonly maxPossibleWinUpperBound: number;
    readonly maxBaseSpinWin: number;
    readonly maxFreeSpinWin: number;
  };
  readonly losingStreaks: {
    readonly probabilityNoWinRound: number;
    readonly expectedNoWinRoundsBeforeWin: number;
    readonly noWinStreakAtLeast: readonly { rounds: number; probability: number }[];
    readonly probabilityNetLosingRound: number;
    readonly netLosingStreakAtLeast: readonly { rounds: number; probability: number }[];
    readonly note: string;
  };
  readonly volatility: {
    readonly sdPerUnitStake: number;
    readonly classification: 'low' | 'medium' | 'high' | 'very high';
    readonly scale: string;
    readonly rtpShareFromRoundsAtLeast: readonly { multiplier: number; share: number }[];
    readonly sessionRtpSd: readonly { rounds: number; sd: number }[];
    readonly caveats: readonly string[];
  };
  readonly crossChecks: {
    readonly baseMeanMarginal: number;
    readonly baseMeanEnumeration: number;
    readonly freeMeanMarginal: number;
    readonly freeMeanEnumeration: number;
    readonly maxAbsDifference: number;
    readonly agree: boolean;
  };
}

export interface SpinSection {
  readonly combinations: number;
  readonly hitFrequency: number;
  readonly lineWinProbability: number;
  readonly expectedWin: number;
  readonly sdWin: number;
  readonly maxWin: number;
  readonly winningLinesPmf: readonly { lines: number; probability: number }[];
  readonly scatterCountPmf: readonly { scatters: number; probability: number }[];
  readonly symbolContributions: readonly { symbol: string; rtp: number }[];
  readonly scatterContribution: number;
  readonly lineCombinations: readonly {
    symbol: string;
    count: number;
    pay: number;
    probabilityPerLine: number;
    oneInPerLine: number;
    rtpContribution: number;
  }[];
  readonly lineHitProbabilityByLine: readonly number[];
}

function moments(pmf: Float64Array, scale: number) {
  let m1 = 0;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < pmf.length; i++) {
    const p = pmf[i]!;
    if (p === 0) continue;
    const x = i / scale;
    m1 += p * x;
    m2 += p * x * x;
    m3 += p * x * x * x;
    m4 += p * x * x * x * x;
  }
  const v = m2 - m1 * m1;
  const sd = Math.sqrt(Math.max(0, v));
  const skew = sd > 0 ? (m3 - 3 * m1 * v - m1 ** 3) / sd ** 3 : 0;
  const kurt = sd > 0 ? (m4 - 4 * m1 * m3 + 6 * m1 * m1 * m2 - 3 * m1 ** 4) / (v * v) - 3 : 0;
  return { mean: m1, variance: v, sd, skew, kurt };
}

function quantiles(pmf: Float64Array, scale: number, qs: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  let cum = 0;
  let qi = 0;
  const sorted = [...qs].sort((a, b) => a - b);
  for (let i = 0; i < pmf.length && qi < sorted.length; i++) {
    cum += Math.max(0, pmf[i]!);
    while (qi < sorted.length && cum >= sorted[qi]! - 1e-15) {
      out[`p${+(sorted[qi]! * 100).toFixed(4)}`] = i / scale;
      qi++;
    }
  }
  return out;
}

/** P(X >= t) for each threshold, from a pmf on a unit grid; tail sums use raw (unclamped) FFT output. */
function tailRows(pmf: Float64Array, scale: number, thresholds: readonly number[], floor: number): ProbabilityRow[] {
  const suffix = new Float64Array(pmf.length + 1);
  for (let i = pmf.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1]! + pmf[i]!;
  return thresholds.map((t) => {
    const idx = Math.ceil(t * scale);
    const p = idx < pmf.length ? Math.max(0, suffix[idx]!) : 0;
    const below = p < floor;
    return {
      multiplier: t,
      probability: below ? 0 : p,
      oneIn: !below && p > 0 ? 1 / p : null,
      belowNumericalFloor: below,
      roundsFor10PctPrecision: !below && p > 0 ? trialsForRelativePrecision(p, 0.1) : null,
    };
  });
}

function spinSection(game: CompiledGame, dist: SpinDistribution, marg: ModeMarginals): SpinSection {
  const T = game.lineCount;
  const S = dist.maxScatter + 1;
  let zero = 0;
  let m1 = 0;
  let m2 = 0;
  for (let u = 0; u <= dist.maxUnits; u++) {
    let w = 0;
    for (let c = 0; c < S; c++) w += dist.weight[u * S + c]!;
    if (u === 0) zero = w;
    m1 += w * u;
    m2 += w * u * u;
  }
  const n = dist.combinations;
  const mean = m1 / n / T;
  const v = m2 / n / (T * T) - mean * mean;
  const pay = (symbol: string, count: number) => game.linePay[game.symbolIndex.get(symbol)!]![count]!;
  return {
    combinations: n,
    hitFrequency: 1 - zero / n,
    lineWinProbability: dist.lineWinCombinations / n,
    expectedWin: mean,
    sdWin: Math.sqrt(Math.max(0, v)),
    maxWin: dist.maxUnits / T,
    winningLinesPmf: Array.from(dist.winningLines)
      .map((w, lines) => ({ lines, probability: w / n }))
      .filter((r) => r.probability > 0),
    scatterCountPmf: marg.scatterCountPmf
      .map((p, scatters) => ({ scatters, probability: p }))
      .filter((r) => r.probability > 0),
    symbolContributions: game.symbolIds
      .map((symbol, i) => ({ symbol, rtp: dist.symbolUnits[i]! / n / T }))
      .filter((r) => r.rtp > 0),
    scatterContribution: dist.scatterUnits / n / T,
    lineCombinations: marg.lineCombinations.map((c) => ({
      symbol: c.symbol,
      count: c.count,
      pay: pay(c.symbol, c.count),
      probabilityPerLine: c.probabilityPerLine,
      oneInPerLine: 1 / c.probabilityPerLine,
      rtpContribution: c.rtpContribution,
    })),
    lineHitProbabilityByLine: marg.lineHitProbability,
  };
}

export function classifyVolatility(sd: number): 'low' | 'medium' | 'high' | 'very high' {
  if (sd < 3) return 'low';
  if (sd < 7) return 'medium';
  if (sd < 15) return 'high';
  return 'very high';
}

export interface AnalyzeOptions {
  readonly onProgress?: (message: string) => void;
  readonly now?: () => Date;
  readonly distribution?: RoundDistribution;
}

export function analyzeGame(game: CompiledGame, options: AnalyzeOptions = {}): ExactAnalysis {
  const log = options.onProgress ?? (() => {});
  log('computing marginal (fast exact) expectations');
  const marg: MarginalAnalysis = analyzeMarginals(game);
  const dist = options.distribution ?? computeRoundDistribution(game, { onProgress: log });
  const T = game.lineCount;
  const horizon = dist.horizon;

  // Numerical floor: FFT round-off shows up as tiny negative cells; the total of their
  // magnitudes bounds the noise level. Probabilities below 10x that (or 1e-13) are not resolved.
  let negative = 0;
  for (const p of dist.roundPmf) if (p < 0) negative -= p;
  for (const f of dist.features) for (const p of f.pmf) if (p < 0) negative -= p;
  const floor = Math.max(1e-13, 10 * negative);

  const roundM = moments(dist.roundPmf, T);
  const baseSpinM = moments(dist.baseSpinPmf, T);
  const p0 = Math.max(0, dist.roundPmf[0]!);
  let belowStake = 0;
  let exactlyStake = 0;
  for (let i = 1; i < T && i <= horizon; i++) belowStake += Math.max(0, dist.roundPmf[i]!);
  if (T <= horizon) exactlyStake = Math.max(0, dist.roundPmf[T]!);
  const netPositive = Math.max(0, 1 - p0 - belowStake - exactlyStake);

  const bandEdges = PAYOUT_BAND_EDGES;
  const labels = bandLabels();
  const bandProb = new Float64Array(labels.length);
  const bandContrib = new Float64Array(labels.length);
  for (let i = 0; i <= horizon; i++) {
    const b = bandIndex(i / T);
    bandProb[b]! += dist.roundPmf[i]!;
    bandContrib[b]! += (dist.roundPmf[i]! * i) / T;
  }
  const bands: BandRow[] = labels.map((label, b) => ({
    label,
    fromMultiplier: b <= 1 ? 0 : bandEdges[b - 1]!,
    toMultiplier: b === 0 ? 0 : b < bandEdges.length ? bandEdges[b]! : null,
    probability: Math.max(0, bandProb[b]!),
    rtpContribution: Math.max(0, bandContrib[b]!),
  }));

  const thresholds = tailRows(dist.roundPmf, T, HIGH_PAYOUT_THRESHOLDS, floor);
  const capProbabilityRaw = dist.capped ? Math.max(0, dist.roundPmf[horizon]!) : 0;

  // Feature distribution (mixture over initial awards weighted by trigger probability).
  const featurePmf = new Float64Array(horizon + 1);
  const trig = marg.triggerProbability;
  for (const f of dist.features) {
    const w = marg.features.find((m) => m.initialAward === f.initialAward)!.probability / trig;
    for (let i = 0; i <= horizon; i++) featurePmf[i]! += w * f.pmf[i]!;
  }
  const featureM = moments(featurePmf, T);
  /** P(initial award a | trigger). */
  const featureWeight = (a: number) => marg.features.find((m) => m.initialAward === a)!.probability / trig;
  const spinsPmf = new Map<number, number>();
  for (const f of marg.features)
    for (const s of f.spinsPmf)
      spinsPmf.set(s.spins, (spinsPmf.get(s.spins) ?? 0) + (f.probability / trig) * s.probability);

  const baseSec = spinSection(game, dist.base, marg.base);
  const freeSec = spinSection(game, dist.free, marg.free);
  const maxFree = dist.free.maxUnits;
  const maxTotalSpins = game.maxTotalFreeSpins;
  const featureBound = maxTotalSpins === null ? Infinity : maxTotalSpins * maxFree;
  const cap = game.maxWinMultiplier === null ? Infinity : game.maxWinMultiplier * T;
  const roundBound = Math.min(cap, dist.base.maxUnits + featureBound);

  const rtpTotal = roundM.mean;
  const rtpBase = baseSpinM.mean;
  const sdStreak = (p: number) => [5, 10, 20, 30, 50, 100].map((n) => ({ rounds: n, probability: p ** n }));
  const pNetLosing = p0 + belowStake;

  const crossDiff = Math.max(
    Math.abs(marg.base.expectedUnits - dist.base.totalUnits / dist.base.combinations),
    Math.abs(marg.free.expectedUnits - dist.free.totalUnits / dist.free.combinations),
  );

  const share = (t: number) => {
    let s = 0;
    for (let i = Math.ceil(t * T); i <= horizon; i++) s += (dist.roundPmf[i]! * i) / T;
    return { multiplier: t, share: rtpTotal > 0 ? Math.max(0, s) / rtpTotal : 0 };
  };

  return {
    schema: EXACT_ANALYSIS_SCHEMA,
    game: {
      id: game.config.meta.id,
      name: game.config.meta.name,
      version: game.config.meta.version,
      configHash: game.hash,
    },
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    definitions: DEFINITIONS,
    method: {
      summary:
        'Exact. Every reel-stop combination of the base and free-spin reel sets is enumerated with an independent evaluator. The free-spin feature (including retriggers and the total-spins limit) is solved as a Markov chain whose win distribution is propagated by FFT convolution on an integer grid capped at the round win cap. Means are cross-checked against the marginal (linearity-of-expectation) method that uses the game engine evaluator.',
      baseCombinations: dist.base.combinations,
      freeCombinations: dist.free.combinations,
      enumerationMs: { base: Math.round(dist.base.elapsedMs), free: Math.round(dist.free.elapsedMs) },
      distributionMs: Math.round(dist.elapsedMs),
      fftSize: dist.fftSize,
      fftCount: dist.fftCount,
      featureStates: dist.features.reduce((a, f) => a + f.states, 0),
      horizonUnits: horizon,
      capped: dist.capped,
      horizonCoversAllOutcomes: dist.horizonCoversAllOutcomes,
      totalMassError: dist.massError,
      numericalFloor: floor,
      unresolvedFeatureMass: dist.features.reduce((a, f) => a + f.unresolvedMass, 0),
    },
    configSummary: {
      reels: game.reels,
      rows: game.rows,
      paylines: T,
      reelLengths: Object.fromEntries(
        Object.entries(game.config.reelSets).map(([k, v]) => [k, v.map((s) => s.symbols.length)]),
      ),
      maxWinMultiplier: game.maxWinMultiplier,
      targetRtp: game.config.math.targetRtp,
      freeSpinsMaxTotal: game.maxTotalFreeSpins,
      retriggerEnabled: game.retriggerEnabled,
    },
    rtp: {
      total: rtpTotal,
      base: rtpBase,
      feature: rtpTotal - rtpBase,
      baseLine: marg.base.expectedLineUnits / T,
      baseScatter: marg.base.expectedScatterUnits / T,
      totalUncapped: marg.rtpUncapped.total,
      capEffect: marg.rtpUncapped.total - rtpTotal,
      target: game.config.math.targetRtp,
      deviationFromTarget: rtpTotal - game.config.math.targetRtp,
      expectedPayoutPerUnitStake: rtpTotal,
      expectedNetPerUnitStake: rtpTotal - 1,
    },
    baseGame: baseSec,
    freeGame: { ...freeSec, retriggerProbabilityPerSpin: game.retriggerEnabled ? marg.free.awardProbability : 0 },
    feature: {
      triggerProbability: trig,
      expectedBaseSpinsBetweenTriggers: marg.expectedSpinsBetweenTriggers,
      triggerByScatterCount: marg.base.scatterCountPmf
        .map((p, scatters) => ({ scatters, probability: p, award: game.modes.base.awards[scatters]! }))
        .filter((r) => r.award > 0 && r.probability > 0),
      expectedFreeSpinsPerTrigger: marg.expectedFreeSpinsPerTrigger,
      expectedFreeSpinsPlayedPerTrigger: dist.features.reduce(
        (acc, f) => acc + featureWeight(f.initialAward) * f.expectedSpinsPlayed,
        0,
      ),
      freeSpinsPmf: [...spinsPmf.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([spins, probability]) => ({ spins, probability })),
      probabilityAnyRetrigger: dist.features.reduce(
        (a, f) => a + featureWeight(f.initialAward) * f.probabilityAnyRetrigger,
        0,
      ),
      probabilityAnyRetriggerUncapped: marg.features.reduce(
        (a, f) => a + (f.probability / trig) * f.probabilityAnyRetrigger,
        0,
      ),
      expectedRetriggersPerFeature: dist.features.reduce(
        (a, f) => a + featureWeight(f.initialAward) * f.expectedRetriggers,
        0,
      ),
      expectedWinUncapped: marg.expectedFeatureUnitsPerTrigger / T,
      expectedWin: trig > 0 ? (rtpTotal - rtpBase) / trig : 0,
      standaloneMeanWin: featureM.mean,
      sdWin: featureM.sd,
      quantiles: quantiles(featurePmf, T, [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]),
      probabilityWinAtLeast: tailRows(featurePmf, T, [10, 25, 50, 100, 250, 500, 1000, 2500, 5000], floor),
      maxPossibleWinUpperBound: Math.min(cap, featureBound) / T,
      roundGivenTrigger: (() => {
        const cond = new Float64Array(horizon + 1);
        for (let i = 0; i <= horizon; i++) cond[i] = dist.triggeredRoundPmf[i]! / trig;
        const mean = moments(cond, T).mean;
        return {
          meanWin: mean,
          triggeringSpinMeanWin: mean - (rtpTotal - rtpBase) / trig,
          probabilityWinAtLeast: tailRows(cond, T, [10, 25, 50, 100, 250, 500, 1000], floor),
        };
      })(),
    },
    round: {
      hitFrequency: 1 - p0,
      probabilityNoWin: p0,
      probabilityWinBelowStake: belowStake,
      probabilityReturnsStake: exactlyStake,
      probabilityNetPositive: netPositive,
      mean: roundM.mean,
      variance: roundM.variance,
      sd: roundM.sd,
      coefficientOfVariation: roundM.mean > 0 ? roundM.sd / roundM.mean : 0,
      skewness: roundM.skew,
      excessKurtosis: roundM.kurt,
      quantiles: quantiles(dist.roundPmf, T, [0.5, 0.75, 0.9, 0.95, 0.99, 0.999, 0.9999]),
      bands,
      thresholds,
      capProbability: capProbabilityRaw < floor ? 0 : capProbabilityRaw,
      capProbabilityBelowFloor: dist.capped && capProbabilityRaw < floor,
      maxPossibleWinUpperBound: roundBound / T,
      maxBaseSpinWin: dist.base.maxUnits / T,
      maxFreeSpinWin: maxFree / T,
    },
    losingStreaks: {
      probabilityNoWinRound: p0,
      expectedNoWinRoundsBeforeWin: p0 / (1 - p0),
      noWinStreakAtLeast: sdStreak(p0),
      probabilityNetLosingRound: pNetLosing,
      netLosingStreakAtLeast: sdStreak(pNetLosing),
      note: 'Rounds are independent, so the number of consecutive no-win rounds before the next win is geometric: P(at least n in a row) = p^n, where p is the probability of a no-win round.',
    },
    volatility: {
      sdPerUnitStake: roundM.sd,
      classification: classifyVolatility(roundM.sd),
      scale:
        'Heuristic scale on the standard deviation of the round return per unit stake: < 3 low, 3-7 medium, 7-15 high, >= 15 very high.',
      rtpShareFromRoundsAtLeast: [10, 50, 100, 500, 1000].map(share),
      sessionRtpSd: [100, 1000, 10_000, 100_000].map((n) => ({ rounds: n, sd: roundM.sd / Math.sqrt(n) })),
      caveats: [
        'There is no regulatory or industry-standard volatility scale; the thresholds above are a documented convention of this project.',
        'A single number cannot describe a skewed payout distribution: two games with the same standard deviation can differ greatly in hit frequency and in how much of the RTP comes from rare large wins. Read the classification together with the band table, the RTP share from large wins and the tail probabilities.',
        'Session RTP spreads use sd/sqrt(n) (central limit theorem). For short sessions the heavy right tail makes the normal approximation optimistic about downside and pessimistic about rare upside.',
        'A large maximum win alone does not make a game volatile; its probability matters.',
      ],
    },
    crossChecks: {
      baseMeanMarginal: marg.base.expectedUnits / T,
      baseMeanEnumeration: dist.base.totalUnits / dist.base.combinations / T,
      freeMeanMarginal: marg.free.expectedUnits / T,
      freeMeanEnumeration: dist.free.totalUnits / dist.free.combinations / T,
      maxAbsDifference: crossDiff / T,
      agree: crossDiff / T < 1e-9,
    },
  };
}
