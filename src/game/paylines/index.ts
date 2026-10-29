import type { CompiledGame } from '../../config/compile';
import type { Position } from '../types';

/** Cells covered by a payline, left to right. */
export function paylinePositions(game: CompiledGame, lineIndex: number): Position[] {
  const line = game.paylines[lineIndex];
  if (!line) throw new RangeError(`Payline ${lineIndex} does not exist (0..${game.lineCount - 1})`);
  return Array.from(line, (row, reel) => ({ reel, row }));
}

/** ASCII diagram of a payline (used by docs and the paytable), e.g. "X . . . X" per row. */
export function paylineDiagram(game: CompiledGame, lineIndex: number): string[] {
  const line = game.paylines[lineIndex]!;
  const out: string[] = [];
  for (let row = 0; row < game.rows; row++) {
    out.push(Array.from(line, (r) => (r === row ? 'X' : '.')).join(' '));
  }
  return out;
}
