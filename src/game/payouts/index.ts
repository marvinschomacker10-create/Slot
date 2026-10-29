import type { CompiledGame, CompiledMode } from '../../config/compile';
import type { LineWin, Position, ScatterResult, SpinEvaluation } from '../types';

/**
 * Payout rules (reference implementation; see docs/MATHEMATICS.md, "Evaluation rules").
 *
 * Line wins
 *  1. Every payline is evaluated independently, left to right, starting on reel 1.
 *  2. Wild substitutes for every regular symbol. It never substitutes for Scatter,
 *     and Scatter interrupts a line combination.
 *  3. Two interpretations are considered for each line:
 *       a) Wild-only: the run of leading Wilds, paid from the Wild row of the paytable;
 *       b) Substituted: the first non-Wild symbol S (if regular) and the run of
 *          positions from reel 1 that show S or Wild.
 *  4. Only the highest-paying interpretation is paid per line (after the Wild
 *     multiplier); on a tie the substituted (regular-symbol) interpretation is used.
 *  5. Wild multiplier: if the paid combination contains at least one Wild, its pay
 *     is multiplied once by the mode's wildMultiplier (it does not compound per Wild).
 *  6. Wins on different paylines are added together.
 *
 * Scatter wins
 *  - Scatters pay by the number visible anywhere in the window, independently of
 *    paylines, as a multiple of the total bet. The scatter count also selects the
 *    free-spins award. Scatter wins are added to line wins.
 *
 * All values are integers: pays are integer multiples of the line bet, scatter
 * pays are integer multiples of the total bet (= line bet x number of lines), and
 * multipliers are integers. The mode winMultiplier is applied to every win.
 */
export function evaluateSpin(
  game: CompiledGame,
  mode: CompiledMode,
  cells: ArrayLike<number>,
  lineBet: number,
): SpinEvaluation {
  if (!Number.isSafeInteger(lineBet) || lineBet < 1)
    throw new RangeError(`line bet must be a positive integer, got ${lineBet}`);
  if (cells.length !== game.cells) throw new RangeError(`expected ${game.cells} cells, got ${cells.length}`);

  const lineWins: LineWin[] = [];
  let lineUnits = 0;
  for (let l = 0; l < game.lineCount; l++) {
    const win = evaluateLine(game, mode, cells, l, lineBet);
    if (win) {
      lineWins.push(win);
      lineUnits += win.units;
    }
  }
  const scatter = evaluateScatter(game, mode, cells, lineBet);
  const totalUnits = lineUnits + scatter.units;
  return {
    lineWins,
    scatter,
    lineUnits,
    scatterUnits: scatter.units,
    totalUnits,
    totalWin: totalUnits * lineBet,
  };
}

export function evaluateLine(
  game: CompiledGame,
  mode: CompiledMode,
  cells: ArrayLike<number>,
  lineIndex: number,
  lineBet: number,
): LineWin | null {
  const { reels, rows, wild } = game;
  const line = game.paylines[lineIndex]!;
  const at = (reel: number) => cells[reel * rows + line[reel]!]!;

  let wildRun = 0;
  while (wildRun < reels && at(wildRun) === wild) wildRun++;

  let bestPay = 0;
  let bestSymbol = -1;
  let bestCount = 0;
  let bestHasWild = false;

  // (a) Wild-only combination.
  if (wildRun > 0) {
    const pay = game.linePay[wild]![wildRun]! * mode.wildMultiplier;
    if (pay > 0) {
      bestPay = pay;
      bestSymbol = wild;
      bestCount = wildRun;
      bestHasWild = true;
    }
  }

  // (b) Substituted combination of the first non-Wild symbol.
  if (wildRun < reels) {
    const target = at(wildRun);
    if (game.kinds[target] === 'regular') {
      let count = wildRun + 1;
      let hasWild = wildRun > 0;
      while (count < reels) {
        const s = at(count);
        if (s === target) count++;
        else if (s === wild) {
          hasWild = true;
          count++;
        } else break;
      }
      const pay = game.linePay[target]![count]! * (hasWild ? mode.wildMultiplier : 1);
      if (pay > 0 && pay >= bestPay) {
        bestPay = pay;
        bestSymbol = target;
        bestCount = count;
        bestHasWild = hasWild;
      }
    }
  }

  if (bestPay === 0) return null;
  const positions: Position[] = [];
  for (let reel = 0; reel < bestCount; reel++) positions.push({ reel, row: line[reel]! });
  const wildMultiplier = bestHasWild ? mode.wildMultiplier : 1;
  const units = bestPay * mode.winMultiplier;
  return {
    lineIndex,
    symbol: game.symbolIds[bestSymbol]!,
    count: bestCount,
    positions,
    basePay: game.linePay[bestSymbol]![bestCount]!,
    wildMultiplier,
    modeMultiplier: mode.winMultiplier,
    containsWild: bestHasWild,
    units,
    win: units * lineBet,
  };
}

export function evaluateScatter(
  game: CompiledGame,
  mode: CompiledMode,
  cells: ArrayLike<number>,
  lineBet: number,
): ScatterResult {
  const positions: Position[] = [];
  for (let reel = 0; reel < game.reels; reel++) {
    for (let row = 0; row < game.rows; row++) {
      if (cells[reel * game.rows + row] === game.scatter) positions.push({ reel, row });
    }
  }
  const count = positions.length;
  const basePay = mode.scatterPays ? game.scatterPay[count]! : 0;
  const units = basePay * game.lineCount * mode.winMultiplier;
  return {
    symbol: game.symbolIds[game.scatter]!,
    count,
    positions,
    basePay,
    modeMultiplier: mode.winMultiplier,
    units,
    win: units * lineBet,
    freeSpinsAwarded: mode.awards[count]!,
  };
}
