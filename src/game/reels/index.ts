import type { CompiledGame, CompiledReelSet, CompiledStrip } from '../../config/compile';
import { uniformInt, type RandomSource } from '../../rng';

/**
 * Maps a virtual stop v in [0, totalWeight) to its physical stop: the smallest i
 * with cumulative[i] > v (binary search). For an unweighted strip this is the identity.
 */
export function physicalStopFromVirtual(strip: CompiledStrip, virtualStop: number): number {
  if (!Number.isInteger(virtualStop) || virtualStop < 0 || virtualStop >= strip.totalWeight) {
    throw new RangeError(`virtual stop ${virtualStop} outside [0, ${strip.totalWeight})`);
  }
  if (strip.uniform) return virtualStop;
  let lo = 0;
  let hi = strip.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (strip.cumulative[mid]! > virtualStop) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Draws one physical stop. This is the only place where randomness enters a spin. */
export function drawStop(strip: CompiledStrip, rng: RandomSource): number {
  return physicalStopFromVirtual(strip, uniformInt(rng, strip.totalWeight));
}

export function drawStops(reelSet: CompiledReelSet, rng: RandomSource): number[] {
  return reelSet.strips.map((strip) => drawStop(strip, rng));
}

/** Symbol index shown at `row` (0 = top) when the reel rests on physical stop `stop`. */
export function symbolAt(strip: CompiledStrip, stop: number, row: number): number {
  return strip.symbols[(stop + row) % strip.length]!;
}

/** Visible window as a flat array: cells[reel * rows + row] = symbol index. */
export function buildCells(game: CompiledGame, reelSet: CompiledReelSet, stops: readonly number[]): Int16Array {
  if (stops.length !== game.reels) throw new RangeError(`expected ${game.reels} stops, got ${stops.length}`);
  const cells = new Int16Array(game.cells);
  for (let reel = 0; reel < game.reels; reel++) {
    const strip = reelSet.strips[reel]!;
    const stop = stops[reel]!;
    if (!Number.isInteger(stop) || stop < 0 || stop >= strip.length) {
      throw new RangeError(`stop ${stop} out of range for reel ${reel} (length ${strip.length})`);
    }
    for (let row = 0; row < game.rows; row++) cells[reel * game.rows + row] = symbolAt(strip, stop, row);
  }
  return cells;
}

export function cellsToWindow(game: CompiledGame, cells: ArrayLike<number>): string[][] {
  const window: string[][] = [];
  for (let reel = 0; reel < game.reels; reel++) {
    const col: string[] = [];
    for (let row = 0; row < game.rows; row++) col.push(game.symbolIds[cells[reel * game.rows + row]!]!);
    window.push(col);
  }
  return window;
}

/** Converts a window given as symbol ids (window[reel][row]) to cells; used by tests and tools. */
export function windowToCells(game: CompiledGame, window: readonly (readonly string[])[]): Int16Array {
  if (window.length !== game.reels) throw new RangeError(`window must have ${game.reels} reels`);
  const cells = new Int16Array(game.cells);
  window.forEach((col, reel) => {
    if (col.length !== game.rows) throw new RangeError(`reel ${reel} must have ${game.rows} rows`);
    col.forEach((id, row) => {
      const idx = game.symbolIndex.get(id);
      if (idx === undefined) throw new Error(`unknown symbol "${id}" at reel ${reel}, row ${row}`);
      cells[reel * game.rows + row] = idx;
    });
  });
  return cells;
}
