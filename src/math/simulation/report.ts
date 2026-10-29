import type { CompiledGame } from '../../config/compile';
import type { ExactAnalysis } from '../exact-analysis/analysis';
import {
  batchMeansInterval,
  meanInterval,
  stdDev,
  trialsForRelativePrecision,
  twoSidedP,
  wilsonInterval,
  type Interval,
} from '../statistics';
import { HIGH_PAYOUT_THRESHOLDS, STREAK_BINS, bandLabels, type SimulationState } from './accumulator';

export const SIMULATION_REPORT_SCHEMA = 'pixel-pauker/simulation-report@2';

/** Events observed fewer times than this are flagged as unreliable. */
export const MIN_RELIABLE_EVENTS = 100;

export interface ProportionEstimate {
  readonly count: number;
  readonly trials: number;
  readonly estimate: number;
  readonly ci95: Interval;
  readonly reliable: boolean;
  readonly warning: string | null;
}

export interface SimulationMeta {
  readonly seed: string | null;
  readonly rngKind: 'seeded' | 'crypto';
  readonly chunkSize: number;
  readonly workers: number;
  readonly elapsedMs: number;
  readonly preset?: string | undefined;
  readonly generatedAt: string;
}

export interface SimulationReport {
  readonly schema: typeof SIMULATION_REPORT_SCHEMA;
  readonly game: { readonly id: string; readonly version: string; readonly configHash: string };
  readonly meta: SimulationMeta & {
    readonly rounds: number;
    readonly roundsPerSecond: number;
    readonly lineBet: number;
    readonly totalBet: number;
  };
  readonly totals: {
    readonly rounds: number;
    readonly baseSpins: number;
    readonly freeSpins: number;
    readonly totalStake: number;
    readonly totalPayout: number;
    readonly basePayout: number;
    readonly featurePayout: number;
    readonly net: number;
  };
  readonly rtp: {
    readonly estimate: number;
    readonly base: number;
    readonly feature: number;
    readonly standardError: number;
    readonly ci95: Interval;
    readonly ci99: Interval;
    readonly baseCi95: Interval;
    readonly featureCi95: Interval;
    readonly batchMeansCi95: Interval & { readonly batches: number };
    readonly note: string;
  };
  readonly roundPayout: { readonly mean: number; readonly sd: number; readonly variance: number };
  readonly hitFrequency: ProportionEstimate;
  readonly baseSpinWinProbability: ProportionEstimate;
  readonly lineWinProbability: ProportionEstimate;
  readonly netPositiveProbability: ProportionEstimate;
  readonly feature: {
    readonly triggers: ProportionEstimate;
    readonly baseSpinsPerTrigger: number | null;
    readonly freeSpinsPerTrigger: { readonly mean: number; readonly ci95: Interval } | null;
    readonly retriggerEvents: number;
    readonly retriggerProbabilityPerFreeSpin: ProportionEstimate;
    readonly featuresWithRetrigger: ProportionEstimate;
    readonly winPerTrigger: { readonly mean: number; readonly sd: number; readonly ci95: Interval } | null;
    readonly maxFeatureWin: number;
  };
  readonly extremes: {
    readonly maxRoundWin: number;
    readonly maxBaseSpinWin: number;
    readonly maxFreeSpinWin: number;
    readonly capHits: ProportionEstimate;
  };
  readonly thresholds: readonly (ProportionEstimate & { readonly multiplier: number })[];
  readonly bands: readonly {
    readonly label: string;
    readonly count: number;
    readonly probability: number;
    readonly rtpContribution: number;
  }[];
  readonly symbolContributions: readonly { readonly symbol: string; readonly base: number; readonly free: number }[];
  readonly scatterContributions: { readonly base: number; readonly free: number };
  readonly losingStreaks: {
    readonly longest: number;
    readonly winsObserved: number;
    readonly meanNoWinRoundsBeforeWin: number;
    readonly atLeast: readonly { readonly rounds: number; readonly observedFraction: number }[];
    readonly histogram: readonly number[];
    readonly censoredLosses: number;
  };
  readonly warnings: readonly string[];
}

function proportion(count: number, trials: number, label: string, theoretical?: number): ProportionEstimate {
  const estimate = trials > 0 ? count / trials : 0;
  let warning: string | null = null;
  if (count === 0) {
    warning = `${label}: no events in ${trials.toLocaleString('en-US')} trials; the 95% upper bound is about ${(3 / Math.max(trials, 1)).toExponential(2)} (rule of three).`;
  } else if (count < MIN_RELIABLE_EVENTS) {
    warning = `${label}: only ${count} events observed; the estimate is unreliable (relative standard error about ${(100 / Math.sqrt(count)).toFixed(0)}%).`;
  }
  if (warning && theoretical !== undefined && theoretical > 0) {
    const need = trialsForRelativePrecision(theoretical, 0.1);
    warning += ` About ${need.toExponential(2)} trials are needed for +/-10% precision at the theoretical probability ${theoretical.toExponential(3)}.`;
  }
  return {
    count,
    trials,
    estimate,
    ci95: wilsonInterval(count, trials, 0.95),
    reliable: count >= MIN_RELIABLE_EVENTS,
    warning,
  };
}

export function buildSimulationReport(
  game: CompiledGame,
  s: SimulationState,
  meta: SimulationMeta,
  theory?: ExactAnalysis,
): SimulationReport {
  const n = s.rounds;
  const T = s.totalBet;
  const sd = stdDev(s.roundMoments);
  const rtp = s.payout / s.stake;
  const se = sd / Math.sqrt(n);
  const warnings: string[] = [];
  if (s.configHash !== game.hash) warnings.push('Simulation state was produced with a different configuration hash.');

  const batch = batchMeansInterval(
    s.batches.map((b) => b.payout / (b.rounds * T)),
    s.batches.map((b) => b.rounds),
  );
  if (batch.batches < 10)
    warnings.push(`Only ${batch.batches} batch(es): the batch-means interval is not meaningful below 10 batches.`);

  const tTheory = (m: number) => theory?.round.thresholds.find((t) => t.multiplier === m)?.probability;
  const thresholds = HIGH_PAYOUT_THRESHOLDS.map((m, i) => ({
    multiplier: m,
    ...proportion(s.thresholdCounts[i]!, n, `Rounds paying >= ${m}x bet`, tTheory(m)),
  }));
  const capHits = proportion(
    s.capHits,
    n,
    'Rounds reaching the win cap',
    theory && theory.round.capProbability > 0 ? theory.round.capProbability : undefined,
  );

  const triggers = proportion(s.triggers, n, 'Free-spin triggers', theory?.feature.triggerProbability);
  const retrig = proportion(
    s.retriggerScatterSpins,
    s.freeSpins,
    'Retrigger-qualifying free spins',
    theory?.freeGame.retriggerProbabilityPerSpin,
  );
  const withRetrig = proportion(
    s.featuresWithRetrigger,
    s.triggers,
    'Features with at least one retrigger',
    theory?.feature.probabilityAnyRetrigger,
  );

  for (const p of [triggers, retrig, withRetrig, capHits, ...thresholds]) if (p.warning) warnings.push(p.warning);
  const roundsFor = (halfWidth: number) => Math.ceil(((1.959963984540054 * sd) / halfWidth) ** 2);
  const halfWidthPts = 1.959963984540054 * se * 100;
  if (halfWidthPts > 0.1) {
    warnings.push(
      `With ${n.toLocaleString('en-US')} rounds the 95% RTP interval is +/-${halfWidthPts.toFixed(2)} percentage points. At the observed SD of ${sd.toFixed(2)} per unit stake, about ${roundsFor(0.003).toExponential(2)} rounds are needed for +/-0.3 points and ${roundsFor(0.001).toExponential(2)} for +/-0.1 points.`,
    );
  }

  const featureMean = s.featureMoments.mean;
  const featureSd = stdDev(s.featureMoments);
  const winsObserved = s.lossesBeforeWin.reduce((a, b) => a + b, 0);
  const meanLosses = winsObserved > 0 ? s.lossesBeforeWin.reduce((a, c, k) => a + c * k, 0) / winsObserved : 0;
  const atLeast = [5, 10, 20, 30, 50, 100].map((k) => ({
    rounds: k,
    observedFraction:
      winsObserved > 0
        ? s.lossesBeforeWin.slice(Math.min(k, STREAK_BINS)).reduce((a, b) => a + b, 0) / winsObserved
        : 0,
  }));

  return {
    schema: SIMULATION_REPORT_SCHEMA,
    game: { id: game.config.meta.id, version: game.config.meta.version, configHash: s.configHash },
    meta: {
      ...meta,
      rounds: n,
      roundsPerSecond: meta.elapsedMs > 0 ? Math.round((n / meta.elapsedMs) * 1000) : 0,
      lineBet: s.lineBet,
      totalBet: T,
    },
    totals: {
      rounds: n,
      baseSpins: s.baseSpins,
      freeSpins: s.freeSpins,
      totalStake: s.stake,
      totalPayout: s.payout,
      basePayout: s.basePayout,
      featurePayout: s.featurePayout,
      net: s.payout - s.stake,
    },
    rtp: {
      estimate: rtp,
      base: s.basePayout / s.stake,
      feature: s.featurePayout / s.stake,
      standardError: se,
      ci95: meanInterval(rtp, sd, n, 0.95),
      ci99: meanInterval(rtp, sd, n, 0.99),
      baseCi95: meanInterval(s.basePayout / s.stake, stdDev(s.baseMoments), n, 0.95),
      featureCi95: meanInterval(s.featurePayout / s.stake, stdDev(s.featureRoundMoments), n, 0.95),
      batchMeansCi95: batch,
      note: 'Each complete round (paid spin plus its whole feature) is one independent observation; free spins inside a feature are never treated as independent samples. Intervals use the normal approximation (CLT) on round returns; the batch-means interval is a robustness check.',
    },
    roundPayout: { mean: s.roundMoments.mean, sd, variance: sd * sd },
    hitFrequency: proportion(s.hits, n, 'Hit frequency', theory?.round.hitFrequency),
    baseSpinWinProbability: proportion(s.baseSpinWins, n, 'Base-spin win'),
    lineWinProbability: proportion(s.baseLineWins, n, 'Base-spin line win', theory?.baseGame.lineWinProbability),
    netPositiveProbability: proportion(s.netPositive, n, 'Net-positive rounds', theory?.round.probabilityNetPositive),
    feature: {
      triggers,
      baseSpinsPerTrigger: s.triggers > 0 ? n / s.triggers : null,
      freeSpinsPerTrigger:
        s.triggers > 0
          ? {
              mean: s.featureSpinMoments.mean,
              ci95: meanInterval(s.featureSpinMoments.mean, stdDev(s.featureSpinMoments), s.triggers),
            }
          : null,
      retriggerEvents: s.retriggerEvents,
      retriggerProbabilityPerFreeSpin: retrig,
      featuresWithRetrigger: withRetrig,
      winPerTrigger:
        s.triggers > 0
          ? { mean: featureMean, sd: featureSd, ci95: meanInterval(featureMean, featureSd, s.triggers) }
          : null,
      maxFeatureWin: s.maxFeature / T,
    },
    extremes: {
      maxRoundWin: s.maxRound / T,
      maxBaseSpinWin: s.maxBaseSpin / T,
      maxFreeSpinWin: s.maxFreeSpin / T,
      capHits,
    },
    thresholds,
    bands: bandLabels().map((label, i) => ({
      label,
      count: s.bandCounts[i]!,
      probability: s.bandCounts[i]! / n,
      rtpContribution: s.bandPayout[i]! / s.stake,
    })),
    symbolContributions: game.symbolIds
      .map((symbol, i) => ({ symbol, base: s.symbolPayoutBase[i]! / s.stake, free: s.symbolPayoutFree[i]! / s.stake }))
      .filter((r) => r.base > 0 || r.free > 0),
    scatterContributions: { base: s.scatterPayoutBase / s.stake, free: s.scatterPayoutFree / s.stake },
    losingStreaks: {
      longest: s.longestLosingStreak,
      winsObserved,
      meanNoWinRoundsBeforeWin: meanLosses,
      atLeast,
      histogram: s.lossesBeforeWin,
      censoredLosses: s.censoredLosses,
    },
    warnings,
  };
}

export interface ComparisonRow {
  readonly metric: string;
  readonly theoretical: number;
  readonly simulated: number;
  readonly ci95Low: number;
  readonly ci95High: number;
  readonly standardError: number;
  readonly difference: number;
  /** (simulated - theoretical) / standard error. */
  readonly z: number;
  readonly pValue: number;
  readonly withinCi95: boolean;
  readonly events: number | null;
  readonly reliable: boolean;
}

/** Theoretical (exact) vs simulated values with intervals and standardized discrepancies. */
export function compareWithTheory(theory: ExactAnalysis, sim: SimulationReport): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const meanRow = (metric: string, theo: number, est: number, ci: Interval, se: number) => {
    const z = se > 0 ? (est - theo) / se : 0;
    rows.push({
      metric,
      theoretical: theo,
      simulated: est,
      ci95Low: ci.low,
      ci95High: ci.high,
      standardError: se,
      difference: est - theo,
      z,
      pValue: twoSidedP(z),
      withinCi95: theo >= ci.low && theo <= ci.high,
      events: null,
      reliable: true,
    });
  };
  const propRow = (metric: string, theo: number, p: ProportionEstimate) => {
    const se = p.trials > 0 ? Math.sqrt((theo * (1 - theo)) / p.trials) : 0;
    const z = se > 0 ? (p.estimate - theo) / se : 0;
    rows.push({
      metric,
      theoretical: theo,
      simulated: p.estimate,
      ci95Low: p.ci95.low,
      ci95High: p.ci95.high,
      standardError: se,
      difference: p.estimate - theo,
      z,
      pValue: twoSidedP(z),
      withinCi95: theo >= p.ci95.low && theo <= p.ci95.high,
      events: p.count,
      reliable: p.reliable,
    });
  };
  const halfToSe = (ci: Interval) => (ci.high - ci.low) / (2 * 1.959963984540054);

  meanRow('Total RTP', theory.rtp.total, sim.rtp.estimate, sim.rtp.ci95, sim.rtp.standardError);
  meanRow('Base-game RTP', theory.rtp.base, sim.rtp.base, sim.rtp.baseCi95, halfToSe(sim.rtp.baseCi95));
  meanRow(
    'Free-spins RTP contribution',
    theory.rtp.feature,
    sim.rtp.feature,
    sim.rtp.featureCi95,
    halfToSe(sim.rtp.featureCi95),
  );
  propRow('Hit frequency (round pays > 0)', theory.round.hitFrequency, sim.hitFrequency);
  propRow('Base spin with a line win', theory.baseGame.lineWinProbability, sim.lineWinProbability);
  propRow('Net-positive round', theory.round.probabilityNetPositive, sim.netPositiveProbability);
  propRow('Free-spins trigger', theory.feature.triggerProbability, sim.feature.triggers);
  propRow(
    'Retrigger per free spin',
    theory.freeGame.retriggerProbabilityPerSpin,
    sim.feature.retriggerProbabilityPerFreeSpin,
  );
  propRow('Feature with >= 1 retrigger', theory.feature.probabilityAnyRetrigger, sim.feature.featuresWithRetrigger);
  if (sim.feature.freeSpinsPerTrigger) {
    const f = sim.feature.freeSpinsPerTrigger;
    meanRow(
      'Free spins played per trigger',
      theory.feature.expectedFreeSpinsPlayedPerTrigger,
      f.mean,
      f.ci95,
      halfToSe(f.ci95),
    );
  }
  if (sim.feature.winPerTrigger) {
    const f = sim.feature.winPerTrigger;
    meanRow('Feature win per trigger (x bet)', theory.feature.expectedWin, f.mean, f.ci95, halfToSe(f.ci95));
  }
  for (const t of sim.thresholds) {
    const th = theory.round.thresholds.find((x) => x.multiplier === t.multiplier);
    if (th && !th.belowNumericalFloor) propRow(`Round pays >= ${t.multiplier}x bet`, th.probability, t);
  }
  return rows;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

export function simulationSummaryCsv(r: SimulationReport): string {
  const rows: unknown[][] = [
    ['rounds', r.totals.rounds, '', ''],
    ['free_spins', r.totals.freeSpins, '', ''],
    ['total_stake', r.totals.totalStake, '', ''],
    ['total_payout', r.totals.totalPayout, '', ''],
    ['rtp', r.rtp.estimate, r.rtp.ci95.low, r.rtp.ci95.high],
    ['rtp_base', r.rtp.base, r.rtp.baseCi95.low, r.rtp.baseCi95.high],
    ['rtp_feature', r.rtp.feature, r.rtp.featureCi95.low, r.rtp.featureCi95.high],
    ['rtp_batch_means', r.rtp.estimate, r.rtp.batchMeansCi95.low, r.rtp.batchMeansCi95.high],
    ['round_payout_sd', r.roundPayout.sd, '', ''],
    ['hit_frequency', r.hitFrequency.estimate, r.hitFrequency.ci95.low, r.hitFrequency.ci95.high],
    [
      'line_win_probability',
      r.lineWinProbability.estimate,
      r.lineWinProbability.ci95.low,
      r.lineWinProbability.ci95.high,
    ],
    [
      'net_positive_probability',
      r.netPositiveProbability.estimate,
      r.netPositiveProbability.ci95.low,
      r.netPositiveProbability.ci95.high,
    ],
    ['trigger_probability', r.feature.triggers.estimate, r.feature.triggers.ci95.low, r.feature.triggers.ci95.high],
    ['max_round_win_x_bet', r.extremes.maxRoundWin, '', ''],
    ...r.thresholds.map((t) => [`p_round_ge_${t.multiplier}x`, t.estimate, t.ci95.low, t.ci95.high]),
  ];
  return toCsv(['metric', 'value', 'ci95_low', 'ci95_high'], rows);
}

export function comparisonCsv(rows: readonly ComparisonRow[]): string {
  return toCsv(
    [
      'metric',
      'theoretical',
      'simulated',
      'ci95_low',
      'ci95_high',
      'standard_error',
      'difference',
      'z',
      'p_value',
      'within_ci95',
      'events',
      'reliable',
    ],
    rows.map((r) => [
      r.metric,
      r.theoretical,
      r.simulated,
      r.ci95Low,
      r.ci95High,
      r.standardError,
      r.difference,
      r.z,
      r.pValue,
      r.withinCi95,
      r.events ?? '',
      r.reliable,
    ]),
  );
}
