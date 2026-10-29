import { compileGame, defaultConfig, getDefaultGame, type CompiledGame, type GameConfig } from '../src/config';
import type { GameMode } from '../src/config/types';
import { windowToCells } from '../src/game/reels';
import type { RandomSource } from '../src/rng';

export const game: CompiledGame = getDefaultGame();

export function cloneConfig(): GameConfig {
  return structuredClone(defaultConfig);
}

export function compileWith(mutate: (c: GameConfig) => void): CompiledGame {
  const c = cloneConfig();
  mutate(c);
  return compileGame(c);
}

/**
 * Builds a window from a row-major picture (top row first), e.g.
 *   grid(['RULER RULER RULER ERASER APPLE', '...', '...'])
 * and returns window[reel][row].
 */
export function grid(rows: readonly string[]): string[][] {
  const cells = rows.map((r) => r.trim().split(/\s+/));
  const reels = cells[0]!.length;
  return Array.from({ length: reels }, (_, reel) => cells.map((row) => row[reel]!));
}

export function cellsOf(g: CompiledGame, window: readonly (readonly string[])[]): Int16Array {
  return windowToCells(g, window);
}

/** Fills a whole window with a repeating "blocker" pattern that cannot form any line win. */
export function blockerWindow(g: CompiledGame): string[][] {
  // Each column uses symbols that never repeat across three consecutive columns.
  const cols = [
    ['RULER', 'PENCIL', 'ERASER'],
    ['CHALK', 'BOOK', 'APPLE'],
    ['GLOBE', 'TEACHER', 'RULER'],
    ['PENCIL', 'ERASER', 'CHALK'],
    ['BOOK', 'APPLE', 'GLOBE'],
  ];
  return Array.from({ length: g.reels }, (_, r) => [...cols[r % cols.length]!]);
}

/** RandomSource that replays a fixed list of 32-bit values (throws when exhausted). */
export class ScriptedRandom implements RandomSource {
  readonly kind = 'seeded' as const;
  private i = 0;
  constructor(private readonly values: readonly number[]) {}
  nextUint32(): number {
    if (this.i >= this.values.length) throw new Error('ScriptedRandom exhausted');
    return this.values[this.i++]! >>> 0;
  }
  get consumed(): number {
    return this.i;
  }
  describe(): string {
    return 'scripted test values';
  }
}

/** Finds the first stop on a strip whose window contains `symbol` in the given row (or any row when row is undefined). */
export function findStop(g: CompiledGame, mode: GameMode, reel: number, symbol: string, row?: number): number {
  const strip = g.modes[mode].reelSet.strips[reel]!;
  const idx = g.symbolIndex.get(symbol)!;
  for (let s = 0; s < strip.length; s++) {
    for (let r = 0; r < g.rows; r++) {
      if ((row === undefined || r === row) && strip.symbols[(s + r) % strip.length] === idx) return s;
    }
  }
  throw new Error(`no stop shows ${symbol} on reel ${reel}`);
}

/** Finds a stop whose window has no scatter. */
export function findStopWithout(g: CompiledGame, mode: GameMode, reel: number, symbol: string): number {
  const strip = g.modes[mode].reelSet.strips[reel]!;
  const idx = g.symbolIndex.get(symbol)!;
  for (let s = 0; s < strip.length; s++) {
    let has = false;
    for (let r = 0; r < g.rows; r++) if (strip.symbols[(s + r) % strip.length] === idx) has = true;
    if (!has) return s;
  }
  throw new Error(`every stop shows ${symbol} on reel ${reel}`);
}

export interface ReferenceLineWin {
  lineIndex: number;
  symbol: string;
  count: number;
  units: number;
}

/**
 * Brute-force reference evaluator written directly from the rules in
 * docs/MATHEMATICS.md, deliberately structured differently from the engine:
 * for every payline it tries every candidate paying symbol explicitly.
 */
export function referenceEvaluate(
  g: CompiledGame,
  mode: GameMode,
  window: readonly (readonly string[])[],
): { lines: ReferenceLineWin[]; scatterCount: number; scatterUnits: number; totalUnits: number; award: number } {
  const cfg = g.config;
  const m = cfg.modes[mode];
  const wild = cfg.symbols.find((s) => s.kind === 'wild')!.id;
  const scatter = cfg.symbols.find((s) => s.kind === 'scatter')!.id;
  const table = (t: Record<string, number> | undefined, count: number): number => {
    if (!t) return 0;
    const keys = Object.keys(t)
      .map(Number)
      .filter((k) => k <= count);
    return keys.length ? t[String(Math.max(...keys))]! : 0;
  };
  const lines: ReferenceLineWin[] = [];
  cfg.paylines.forEach((rowsOfLine, lineIndex) => {
    const syms = rowsOfLine.map((row, reel) => window[reel]![row]!);
    let best: ReferenceLineWin | null = null;
    const consider = (symbol: string, count: number, hasWild: boolean) => {
      const base = table(cfg.paytable.line[symbol], count);
      if (base === 0) return;
      const units = base * (hasWild ? m.wildMultiplier : 1) * m.winMultiplier;
      // Strictly greater replaces; on ties a regular symbol beats a Wild-only reading.
      if (!best || units > best.units || (units === best.units && best.symbol === wild && symbol !== wild)) {
        best = { lineIndex, symbol, count, units };
      }
    };
    // Wild-only reading.
    let w = 0;
    while (w < syms.length && syms[w] === wild) w++;
    if (w > 0) consider(wild, w, true);
    // Every regular symbol as the target.
    for (const s of cfg.symbols.filter((x) => x.kind === 'regular')) {
      let count = 0;
      let hasWild = false;
      while (count < syms.length && (syms[count] === s.id || syms[count] === wild)) {
        if (syms[count] === wild) hasWild = true;
        count++;
      }
      // The run must contain the target itself (a pure-Wild run is the Wild-only reading).
      if (!syms.slice(0, count).includes(s.id)) continue;
      consider(s.id, count, hasWild);
    }
    if (best) lines.push(best);
  });
  let scatterCount = 0;
  for (const col of window) for (const s of col) if (s === scatter) scatterCount++;
  const scatterPays = mode === 'base' || cfg.freeSpins.scatterPaysInFeature;
  const scatterUnits = scatterPays
    ? table(cfg.paytable.scatter, scatterCount) * cfg.paylines.length * m.winMultiplier
    : 0;
  const awards =
    mode === 'base'
      ? cfg.freeSpins.triggerAwards
      : cfg.freeSpins.retrigger.enabled
        ? cfg.freeSpins.retrigger.awards
        : {};
  const award = table(awards, scatterCount);
  return {
    lines,
    scatterCount,
    scatterUnits,
    totalUnits: lines.reduce((a, l) => a + l.units, 0) + scatterUnits,
    award,
  };
}

/** Stops for a base or free spin showing exactly `n` scatters (on reels 0..n-1). */
export function scatterStops(g: CompiledGame, mode: GameMode, n: number): number[] {
  return Array.from({ length: g.reels }, (_, reel) =>
    reel < n ? findStop(g, mode, reel, 'SCATTER') : findStopWithout(g, mode, reel, 'SCATTER'),
  );
}
