import type { GameMode } from '../config/types';

/** A cell in the visible window. Rows are numbered 0 (top) to rows-1 (bottom). */
export interface Position {
  readonly reel: number;
  readonly row: number;
}

export interface LineWin {
  /** 0-based payline index into `config.paylines`. */
  readonly lineIndex: number;
  /** Paying symbol id. "WILD" (or the configured wild id) for a Wild-only combination. */
  readonly symbol: string;
  /** Length of the left-to-right combination. */
  readonly count: number;
  readonly positions: readonly Position[];
  /** Paytable value for (symbol, count), as a multiple of the line bet. */
  readonly basePay: number;
  /** Wild multiplier applied (1 when no Wild is part of the combination). */
  readonly wildMultiplier: number;
  /** Mode win multiplier applied (e.g. a free-spins multiplier). */
  readonly modeMultiplier: number;
  readonly containsWild: boolean;
  /** basePay x wildMultiplier x modeMultiplier, in line-bet units. */
  readonly units: number;
  /** Credits: units x line bet. */
  readonly win: number;
}

export interface ScatterResult {
  readonly symbol: string;
  readonly count: number;
  readonly positions: readonly Position[];
  /** Paytable value for the count, as a multiple of the total bet (0 if it does not pay). */
  readonly basePay: number;
  readonly modeMultiplier: number;
  /** Scatter win in line-bet units. */
  readonly units: number;
  readonly win: number;
  /** Free spins this scatter count is worth according to the mode's award table (before any truncation). */
  readonly freeSpinsAwarded: number;
}

/** Deterministic result of evaluating one window. Contains no randomness. */
export interface SpinEvaluation {
  readonly lineWins: readonly LineWin[];
  readonly scatter: ScatterResult;
  readonly lineUnits: number;
  readonly scatterUnits: number;
  /** Total win of the spin in line-bet units, before the round win cap. */
  readonly totalUnits: number;
  /** Total win of the spin in credits, before the round win cap. */
  readonly totalWin: number;
}

export interface SpinOutcome extends SpinEvaluation {
  readonly mode: GameMode;
  readonly reelSet: string;
  /** Physical stop index per reel (top visible row). */
  readonly stops: readonly number[];
  /** Visible symbols as window[reel][row]. */
  readonly window: readonly (readonly string[])[];
  readonly lineBet: number;
  readonly totalBet: number;
}
