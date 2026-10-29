import type { CompiledGame } from '../../config/compile';
import type { RoundResult } from '../../game/engine';
import { emptyMoments, mergeMoments, pushMoment, type RunningMoments } from '../statistics';

/** Round-payout bands in multiples of the total bet: [from, to). Band 0 is exactly zero. */
export const PAYOUT_BAND_EDGES = [0, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;
/** High-payout thresholds (round payout >= t x total bet) tracked for rare-event estimates. */
export const HIGH_PAYOUT_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;
/** Losing-streak histogram resolution: exact counts for 0..STREAK_BINS-1, then one overflow bin. */
export const STREAK_BINS = 200;

export function bandLabels(): string[] {
  const e = PAYOUT_BAND_EDGES;
  const labels = ['0 (no win)'];
  labels.push(`(0, ${e[1]})`);
  for (let i = 1; i < e.length - 1; i++) labels.push(`[${e[i]}, ${e[i + 1]})`);
  labels.push(`>= ${e[e.length - 1]}`);
  return labels;
}

export function bandIndex(multiplier: number): number {
  if (multiplier === 0) return 0;
  const e = PAYOUT_BAND_EDGES;
  for (let i = 1; i < e.length; i++) if (multiplier < e[i]!) return i;
  return e.length;
}

/**
 * Plain, structured-clone-friendly simulation state. All money-like values are
 * integer credits at the simulated line bet. Moments are taken over the round
 * payout expressed as a multiple of the total bet (i.e. return per unit stake).
 */
export interface SimulationState {
  configHash: string;
  lineBet: number;
  totalBet: number;
  rounds: number;
  baseSpins: number;
  freeSpins: number;
  stake: number;
  payout: number;
  basePayout: number;
  featurePayout: number;
  roundMoments: RunningMoments;
  baseMoments: RunningMoments;
  featureRoundMoments: RunningMoments;
  /** Moments of the feature payout (x total bet) per qualifying trigger (forfeited features count as 0). */
  featureMoments: RunningMoments;
  featureSpinMoments: RunningMoments;
  hits: number;
  baseSpinWins: number;
  baseLineWins: number;
  netPositive: number;
  capHits: number;
  triggers: number;
  retriggerEvents: number;
  /** Free spins whose scatter count qualified for a retrigger award (before any total-spins truncation). */
  retriggerScatterSpins: number;
  featuresWithRetrigger: number;
  freeSpinsAwarded: number;
  maxRound: number;
  maxBaseSpin: number;
  maxFreeSpin: number;
  maxFeature: number;
  bandCounts: number[];
  bandPayout: number[];
  thresholdCounts: number[];
  symbolPayoutBase: number[];
  symbolPayoutFree: number[];
  scatterPayoutBase: number;
  scatterPayoutFree: number;
  scatterCountsBase: number[];
  /** lossesBeforeWin[k] = number of winning rounds preceded by exactly k non-winning rounds (k >= STREAK_BINS in the last bin). */
  lossesBeforeWin: number[];
  longestLosingStreak: number;
  /** Losing rounds at the end of a chunk that are not followed by a win (right-censored). */
  censoredLosses: number;
  /** Transient: current run of non-winning rounds in this chunk. */
  currentLosingStreak: number;
  batches: { rounds: number; payout: number }[];
}

export function createSimulationState(game: CompiledGame, lineBet: number): SimulationState {
  const nSym = game.symbolIds.length;
  return {
    configHash: game.hash,
    lineBet,
    totalBet: lineBet * game.lineCount,
    rounds: 0,
    baseSpins: 0,
    freeSpins: 0,
    stake: 0,
    payout: 0,
    basePayout: 0,
    featurePayout: 0,
    roundMoments: emptyMoments(),
    baseMoments: emptyMoments(),
    featureRoundMoments: emptyMoments(),
    featureMoments: emptyMoments(),
    featureSpinMoments: emptyMoments(),
    hits: 0,
    baseSpinWins: 0,
    baseLineWins: 0,
    netPositive: 0,
    capHits: 0,
    triggers: 0,
    retriggerEvents: 0,
    retriggerScatterSpins: 0,
    featuresWithRetrigger: 0,
    freeSpinsAwarded: 0,
    maxRound: 0,
    maxBaseSpin: 0,
    maxFreeSpin: 0,
    maxFeature: 0,
    bandCounts: new Array<number>(PAYOUT_BAND_EDGES.length + 1).fill(0),
    bandPayout: new Array<number>(PAYOUT_BAND_EDGES.length + 1).fill(0),
    thresholdCounts: new Array<number>(HIGH_PAYOUT_THRESHOLDS.length).fill(0),
    symbolPayoutBase: new Array<number>(nSym).fill(0),
    symbolPayoutFree: new Array<number>(nSym).fill(0),
    scatterPayoutBase: 0,
    scatterPayoutFree: 0,
    scatterCountsBase: new Array<number>(game.cells + 1).fill(0),
    lossesBeforeWin: new Array<number>(STREAK_BINS + 1).fill(0),
    longestLosingStreak: 0,
    censoredLosses: 0,
    currentLosingStreak: 0,
    batches: [],
  };
}

/**
 * Records one complete round (base spin + its whole feature) as ONE observation.
 * Spins inside a feature are never treated as independent observations.
 */
export function recordRound(game: CompiledGame, s: SimulationState, r: RoundResult): void {
  const T = s.totalBet;
  s.rounds += 1;
  s.baseSpins += 1;
  s.freeSpins += r.freeSpinsPlayed;
  s.stake += r.stake;
  s.payout += r.totalWin;
  s.basePayout += r.baseWin;
  s.featurePayout += r.featureWin;
  const x = r.totalWin / T;
  pushMoment(s.roundMoments, x);
  pushMoment(s.baseMoments, r.baseWin / T);
  pushMoment(s.featureRoundMoments, r.featureWin / T);

  // A "hit" is a round with a positive payout (same definition as the exact analysis).
  if (r.totalWin > 0) {
    s.hits += 1;
    s.lossesBeforeWin[Math.min(s.currentLosingStreak, STREAK_BINS)]! += 1;
    s.currentLosingStreak = 0;
  } else {
    s.currentLosingStreak += 1;
    if (s.currentLosingStreak > s.longestLosingStreak) s.longestLosingStreak = s.currentLosingStreak;
  }
  if (r.totalWin > r.stake) s.netPositive += 1;
  if (r.capReached) s.capHits += 1;
  if (r.totalWin > s.maxRound) s.maxRound = r.totalWin;

  const band = bandIndex(x);
  s.bandCounts[band]! += 1;
  s.bandPayout[band]! += r.totalWin;
  for (let i = 0; i < HIGH_PAYOUT_THRESHOLDS.length; i++) if (x >= HIGH_PAYOUT_THRESHOLDS[i]!) s.thresholdCounts[i]! += 1;

  const baseSpin = r.spins[0]!;
  const baseOutcome = baseSpin.outcome;
  if (baseOutcome.totalWin > 0) s.baseSpinWins += 1;
  if (baseOutcome.lineWins.length > 0) s.baseLineWins += 1;
  if (baseSpin.credited > s.maxBaseSpin) s.maxBaseSpin = baseSpin.credited;
  s.scatterCountsBase[baseOutcome.scatter.count]! += 1;

  // Symbol attribution uses evaluated (pre-cap) wins; the cap is accounted separately.
  for (const w of baseOutcome.lineWins) s.symbolPayoutBase[game.symbolIndex.get(w.symbol)!]! += w.win;
  s.scatterPayoutBase += baseOutcome.scatter.win;

  // A trigger is a qualifying scatter combination on the paid spin. If the base spin already
  // reached the win cap the feature is forfeited and counts as 0 spins / 0 win (as in the exact analysis).
  if (baseOutcome.scatter.freeSpinsAwarded > 0) {
    s.triggers += 1;
    s.freeSpinsAwarded += r.freeSpinsAwarded;
    s.retriggerEvents += r.retriggers;
    if (r.retriggers > 0) s.featuresWithRetrigger += 1;
    pushMoment(s.featureMoments, r.featureWin / T);
    pushMoment(s.featureSpinMoments, r.freeSpinsPlayed);
    if (r.featureWin > s.maxFeature) s.maxFeature = r.featureWin;
  }
  for (let i = 1; i < r.spins.length; i++) {
    const spin = r.spins[i]!;
    if (spin.credited > s.maxFreeSpin) s.maxFreeSpin = spin.credited;
    for (const w of spin.outcome.lineWins) s.symbolPayoutFree[game.symbolIndex.get(w.symbol)!]! += w.win;
    s.scatterPayoutFree += spin.outcome.scatter.win;
    if (spin.outcome.scatter.freeSpinsAwarded > 0) s.retriggerScatterSpins += 1;
  }
}

/** Closes a chunk: the open losing streak is right-censored and the chunk becomes one batch. */
export function closeBatch(s: SimulationState, rounds: number, payout: number): void {
  s.censoredLosses += s.currentLosingStreak;
  s.currentLosingStreak = 0;
  s.batches.push({ rounds, payout });
}

const sumArrays = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] ?? 0));

/** Merges two states (order matters only for the batch list). */
export function mergeSimulationStates(a: SimulationState, b: SimulationState): SimulationState {
  if (a.configHash !== b.configHash) throw new Error('cannot merge simulations of different configurations');
  if (a.lineBet !== b.lineBet) throw new Error('cannot merge simulations with different line bets');
  return {
    ...a,
    rounds: a.rounds + b.rounds,
    baseSpins: a.baseSpins + b.baseSpins,
    freeSpins: a.freeSpins + b.freeSpins,
    stake: a.stake + b.stake,
    payout: a.payout + b.payout,
    basePayout: a.basePayout + b.basePayout,
    featurePayout: a.featurePayout + b.featurePayout,
    roundMoments: mergeMoments(a.roundMoments, b.roundMoments),
    baseMoments: mergeMoments(a.baseMoments, b.baseMoments),
    featureRoundMoments: mergeMoments(a.featureRoundMoments, b.featureRoundMoments),
    featureMoments: mergeMoments(a.featureMoments, b.featureMoments),
    featureSpinMoments: mergeMoments(a.featureSpinMoments, b.featureSpinMoments),
    hits: a.hits + b.hits,
    baseSpinWins: a.baseSpinWins + b.baseSpinWins,
    baseLineWins: a.baseLineWins + b.baseLineWins,
    netPositive: a.netPositive + b.netPositive,
    capHits: a.capHits + b.capHits,
    triggers: a.triggers + b.triggers,
    retriggerEvents: a.retriggerEvents + b.retriggerEvents,
    retriggerScatterSpins: a.retriggerScatterSpins + b.retriggerScatterSpins,
    featuresWithRetrigger: a.featuresWithRetrigger + b.featuresWithRetrigger,
    freeSpinsAwarded: a.freeSpinsAwarded + b.freeSpinsAwarded,
    maxRound: Math.max(a.maxRound, b.maxRound),
    maxBaseSpin: Math.max(a.maxBaseSpin, b.maxBaseSpin),
    maxFreeSpin: Math.max(a.maxFreeSpin, b.maxFreeSpin),
    maxFeature: Math.max(a.maxFeature, b.maxFeature),
    bandCounts: sumArrays(a.bandCounts, b.bandCounts),
    bandPayout: sumArrays(a.bandPayout, b.bandPayout),
    thresholdCounts: sumArrays(a.thresholdCounts, b.thresholdCounts),
    symbolPayoutBase: sumArrays(a.symbolPayoutBase, b.symbolPayoutBase),
    symbolPayoutFree: sumArrays(a.symbolPayoutFree, b.symbolPayoutFree),
    scatterPayoutBase: a.scatterPayoutBase + b.scatterPayoutBase,
    scatterPayoutFree: a.scatterPayoutFree + b.scatterPayoutFree,
    scatterCountsBase: sumArrays(a.scatterCountsBase, b.scatterCountsBase),
    lossesBeforeWin: sumArrays(a.lossesBeforeWin, b.lossesBeforeWin),
    longestLosingStreak: Math.max(a.longestLosingStreak, b.longestLosingStreak),
    censoredLosses: a.censoredLosses + b.censoredLosses,
    currentLosingStreak: 0,
    batches: [...a.batches, ...b.batches],
  };
}
