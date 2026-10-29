import type { CompiledGame } from '../../config/compile';
import type { GameMode } from '../../config/types';
import type { RandomSource } from '../../rng';
import {
  grantRetrigger,
  isFeatureComplete,
  recordFreeSpin,
  remainingFreeSpins,
  startFreeSpins,
  type FreeSpinsState,
} from '../bonus';
import { GameStateError } from '../errors';
import { evaluateSpin } from '../payouts';
import { buildCells, cellsToWindow, drawStops } from '../reels';
import type { SpinOutcome } from '../types';

export function totalBetFor(game: CompiledGame, lineBet: number): number {
  return lineBet * game.lineCount;
}

export function assertLineBet(game: CompiledGame, lineBet: number): void {
  if (!game.lineBetOptions.includes(lineBet)) {
    throw new GameStateError(`line bet ${lineBet} is not one of the configured options [${game.lineBetOptions.join(', ')}]`);
  }
}

/** Round win cap in credits, or null if uncapped. */
export function roundWinCap(game: CompiledGame, lineBet: number): number | null {
  return game.maxWinMultiplier === null ? null : game.maxWinMultiplier * totalBetFor(game, lineBet);
}

/** Deterministic: the same stops, mode, configuration and bet always give the same outcome. */
export function outcomeFromStops(
  game: CompiledGame,
  mode: GameMode,
  stops: readonly number[],
  lineBet: number,
): SpinOutcome {
  const compiledMode = game.modes[mode];
  const cells = buildCells(game, compiledMode.reelSet, stops);
  const evaluation = evaluateSpin(game, compiledMode, cells, lineBet);
  return {
    ...evaluation,
    mode,
    reelSet: compiledMode.reelSet.name,
    stops: [...stops],
    window: cellsToWindow(game, cells),
    lineBet,
    totalBet: totalBetFor(game, lineBet),
  };
}

/** RNG -> stops -> evaluation. Random numbers are consumed only by `drawStops`. */
export function resolveSpin(game: CompiledGame, mode: GameMode, rng: RandomSource, lineBet: number): SpinOutcome {
  const stops = drawStops(game.modes[mode].reelSet, rng);
  return outcomeFromStops(game, mode, stops, lineBet);
}

export type RoundStatus = 'awaiting-base-spin' | 'free-spins' | 'complete';

/**
 * A game round = one paid base-game spin plus every free spin it triggers
 * (including retriggers). The stake is charged once per round; the round win cap
 * applies to the sum of all wins in the round.
 */
export interface RoundState {
  readonly lineBet: number;
  readonly totalBet: number;
  readonly stake: number;
  readonly cap: number | null;
  readonly status: RoundStatus;
  readonly feature: FreeSpinsState | null;
  readonly totalWin: number;
  readonly capReached: boolean;
  readonly spinsPlayed: number;
  readonly featureTriggered: boolean;
}

export interface PlayedSpin {
  /** 0 = paid base spin, 1..n = free spins in order. */
  readonly index: number;
  readonly outcome: SpinOutcome;
  /** Credits actually paid for this spin (after the round cap). */
  readonly credited: number;
  readonly cappedBy: number;
  /** Free spins granted by this spin (trigger or retrigger, after truncation). */
  readonly freeSpinsGranted: number;
  /** Free spins lost on this spin because the win cap ended the round. */
  readonly freeSpinsForfeited: number;
  readonly featureAfter: FreeSpinsState | null;
  readonly roundWinAfter: number;
  readonly roundComplete: boolean;
}

export function startRound(game: CompiledGame, lineBet: number): RoundState {
  assertLineBet(game, lineBet);
  const totalBet = totalBetFor(game, lineBet);
  return {
    lineBet,
    totalBet,
    stake: totalBet,
    cap: roundWinCap(game, lineBet),
    status: 'awaiting-base-spin',
    feature: null,
    totalWin: 0,
    capReached: false,
    spinsPlayed: 0,
    featureTriggered: false,
  };
}

function applyCap(round: RoundState, win: number): number {
  if (round.cap === null) return win;
  return Math.max(0, Math.min(win, round.cap - round.totalWin));
}

/** Plays the next spin of a round: the base spin first, then free spins until none remain or the cap is hit. */
export function playNextSpin(
  game: CompiledGame,
  round: RoundState,
  rng: RandomSource,
): { round: RoundState; spin: PlayedSpin } {
  if (round.status === 'complete') throw new GameStateError('the round is already complete');

  if (round.status === 'awaiting-base-spin') {
    const outcome = resolveSpin(game, 'base', rng, round.lineBet);
    const credited = applyCap(round, outcome.totalWin);
    const totalWin = credited;
    const capReached = round.cap !== null && totalWin >= round.cap;
    const rawAward = outcome.scatter.freeSpinsAwarded;
    const feature = rawAward > 0 && !capReached ? startFreeSpins(game, rawAward, round.lineBet) : null;
    const next: RoundState = {
      ...round,
      status: feature ? 'free-spins' : 'complete',
      feature,
      totalWin,
      capReached,
      spinsPlayed: 1,
      featureTriggered: feature !== null,
    };
    return {
      round: next,
      spin: {
        index: 0,
        outcome,
        credited,
        cappedBy: outcome.totalWin - credited,
        freeSpinsGranted: feature ? feature.totalAwarded : 0,
        freeSpinsForfeited: capReached ? rawAward : 0,
        featureAfter: feature,
        roundWinAfter: totalWin,
        roundComplete: next.status === 'complete',
      },
    };
  }

  // Free spin: played at the triggering line bet, no stake is charged.
  const feature0 = round.feature;
  if (!feature0 || isFeatureComplete(feature0)) throw new GameStateError('no free spins remaining in this round');
  const outcome = resolveSpin(game, 'free', rng, feature0.lineBet);
  const credited = applyCap(round, outcome.totalWin);
  let feature = recordFreeSpin(feature0, credited);
  const retrigger = grantRetrigger(game, feature, outcome.scatter.freeSpinsAwarded);
  feature = retrigger.state;
  const totalWin = round.totalWin + credited;
  const capReached = round.cap !== null && totalWin >= round.cap;
  const forfeited = capReached ? remainingFreeSpins(feature) : 0;
  const complete = capReached || isFeatureComplete(feature);
  const next: RoundState = {
    ...round,
    status: complete ? 'complete' : 'free-spins',
    feature,
    totalWin,
    capReached,
    spinsPlayed: round.spinsPlayed + 1,
  };
  return {
    round: next,
    spin: {
      index: round.spinsPlayed,
      outcome,
      credited,
      cappedBy: outcome.totalWin - credited,
      freeSpinsGranted: retrigger.granted,
      freeSpinsForfeited: forfeited,
      featureAfter: feature,
      roundWinAfter: totalWin,
      roundComplete: complete,
    },
  };
}

export interface RoundResult {
  readonly lineBet: number;
  readonly totalBet: number;
  readonly stake: number;
  readonly totalWin: number;
  readonly baseWin: number;
  readonly featureWin: number;
  readonly spins: readonly PlayedSpin[];
  readonly featureTriggered: boolean;
  readonly freeSpinsAwarded: number;
  readonly freeSpinsPlayed: number;
  readonly retriggers: number;
  readonly capReached: boolean;
}

/** Plays a complete round. Used by the simulator; the interactive session uses the same `playNextSpin`. */
export function playRound(game: CompiledGame, lineBet: number, rng: RandomSource): RoundResult {
  let round = startRound(game, lineBet);
  const spins: PlayedSpin[] = [];
  while (round.status !== 'complete') {
    const step = playNextSpin(game, round, rng);
    round = step.round;
    spins.push(step.spin);
  }
  const baseWin = spins[0]!.credited;
  return {
    lineBet,
    totalBet: round.totalBet,
    stake: round.stake,
    totalWin: round.totalWin,
    baseWin,
    featureWin: round.totalWin - baseWin,
    spins,
    featureTriggered: round.featureTriggered,
    freeSpinsAwarded: round.feature?.totalAwarded ?? 0,
    freeSpinsPlayed: round.feature?.played ?? 0,
    retriggers: round.feature?.retriggers ?? 0,
    capReached: round.capReached,
  };
}
