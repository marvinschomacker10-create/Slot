import type { CompiledGame } from '../../config/compile';
import { GameStateError } from '../errors';

/**
 * Free-spins feature state. A feature belongs to exactly one game round and is
 * played at the line bet of the paid spin that triggered it. Free spins never
 * debit a stake.
 */
export interface FreeSpinsState {
  readonly lineBet: number;
  /** Initial award plus every retrigger award actually granted. */
  readonly totalAwarded: number;
  readonly played: number;
  /** Retrigger events that granted at least one additional spin. */
  readonly retriggers: number;
  /** Spins not granted because `maxTotalSpins` would have been exceeded. */
  readonly truncatedSpins: number;
  /** Credits won during the feature (after the round cap). */
  readonly totalWin: number;
}

export function remainingFreeSpins(state: FreeSpinsState): number {
  return state.totalAwarded - state.played;
}

export function isFeatureComplete(state: FreeSpinsState): boolean {
  return remainingFreeSpins(state) <= 0;
}

/** Applies the `maxTotalSpins` limit to an award. */
export function truncateAward(game: CompiledGame, alreadyAwarded: number, rawAward: number): number {
  if (rawAward < 0 || !Number.isSafeInteger(rawAward)) throw new RangeError(`invalid award ${rawAward}`);
  const max = game.maxTotalFreeSpins;
  return max === null ? rawAward : Math.max(0, Math.min(rawAward, max - alreadyAwarded));
}

export function startFreeSpins(game: CompiledGame, rawAward: number, lineBet: number): FreeSpinsState {
  if (rawAward <= 0) throw new GameStateError('a free-spins feature needs a positive award');
  const granted = truncateAward(game, 0, rawAward);
  return { lineBet, totalAwarded: granted, played: 0, retriggers: 0, truncatedSpins: rawAward - granted, totalWin: 0 };
}

/** Records one completed free spin and the credits it paid. */
export function recordFreeSpin(state: FreeSpinsState, credited: number): FreeSpinsState {
  if (isFeatureComplete(state)) throw new GameStateError('no free spins remaining');
  return { ...state, played: state.played + 1, totalWin: state.totalWin + credited };
}

/** Grants a retrigger award (subject to maxTotalSpins). Returns the new state and the spins actually granted. */
export function grantRetrigger(
  game: CompiledGame,
  state: FreeSpinsState,
  rawAward: number,
): { state: FreeSpinsState; granted: number } {
  if (rawAward === 0) return { state, granted: 0 };
  if (!game.retriggerEnabled) throw new GameStateError('retriggers are disabled in this configuration');
  const granted = truncateAward(game, state.totalAwarded, rawAward);
  return {
    granted,
    state: {
      ...state,
      totalAwarded: state.totalAwarded + granted,
      retriggers: state.retriggers + (granted > 0 ? 1 : 0),
      truncatedSpins: state.truncatedSpins + (rawAward - granted),
    },
  };
}
