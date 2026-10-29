import { describe, expect, it } from 'vitest';
import { compileGame, type CompiledGame } from '../../src/config';
import type { GameMode } from '../../src/config/types';
import { outcomeFromStops } from '../../src/game/engine';
import { enumerateSpinDistribution } from '../../src/math/exact-analysis/enumerate';
import { analyzeModeMarginals } from '../../src/math/exact-analysis/marginal';
import { compileWith, game } from '../helpers';
import { toyConfig } from '../fixtures/toy-config';

/** Brute force through the game engine: every stop combination, weighted. */
function bruteForce(g: CompiledGame, mode: GameMode) {
  const strips = g.modes[mode].reelSet.strips;
  const hist = new Map<string, number>();
  let total = 0;
  let lineWins = 0;
  const symbolWin = new Map<string, number>();
  const stops = new Array<number>(g.reels).fill(0);
  const rec = (reel: number, w: number) => {
    if (reel === g.reels) {
      const o = outcomeFromStops(g, mode, stops, 1);
      const key = `${o.totalUnits}:${o.scatter.count}`;
      hist.set(key, (hist.get(key) ?? 0) + w);
      total += w * o.totalUnits;
      if (o.lineWins.length > 0) lineWins += w;
      for (const lw of o.lineWins) symbolWin.set(lw.symbol, (symbolWin.get(lw.symbol) ?? 0) + w * lw.units);
      return;
    }
    const s = strips[reel]!;
    for (let i = 0; i < s.length; i++) {
      stops[reel] = i;
      rec(reel + 1, w * s.weights[i]!);
    }
  };
  rec(0, 1);
  return { hist, total, lineWins, symbolWin };
}

const variants: [string, CompiledGame][] = [
  ['toy', compileGame(toyConfig())],
  ['toy with virtual-reel weights', compileGame(toyConfig({ weights: true }))],
  [
    'toy with alternative multipliers and pays',
    (() => {
      const c = toyConfig();
      c.modes.base.wildMultiplier = 3;
      c.modes.free.wildMultiplier = 4;
      c.modes.free.winMultiplier = 5;
      c.paytable.line.WILD = { '2': 2, '3': 60, '5': 5000 };
      c.paytable.line.JADE = { '2': 1, '3': 5, '5': 50 };
      c.paytable.scatter = { '2': 1, '3': 3 };
      c.freeSpins.scatterPaysInFeature = false;
      return compileGame(c);
    })(),
  ],
];

describe.each(variants)('full enumeration (%s)', (_name, g) => {
  it.each(['base', 'free'] as const)('reproduces the engine exactly over every %s stop combination', (mode) => {
    const fast = enumerateSpinDistribution(g, mode);
    const brute = bruteForce(g, mode);
    const S = fast.maxScatter + 1;
    const fastHist = new Map<string, number>();
    for (let u = 0; u <= fast.maxUnits; u++) {
      for (let c = 0; c < S; c++) {
        const w = fast.weight[u * S + c]!;
        if (w > 0) fastHist.set(`${u}:${c}`, w);
      }
    }
    expect(fastHist).toEqual(brute.hist);
    expect(fast.totalUnits).toBe(brute.total);
    expect(fast.lineWinCombinations).toBe(brute.lineWins);
    for (const [sym, units] of brute.symbolWin) expect(fast.symbolUnits[g.symbolIndex.get(sym)!]).toBeCloseTo(units, 6);
    expect(fast.combinations).toBe(g.modes[mode].reelSet.strips.reduce((a, s) => a * s.totalWeight, 1));
  });

  it.each(['base', 'free'] as const)('agrees with the marginal method on the %s mean', (mode) => {
    const fast = enumerateSpinDistribution(g, mode);
    const marg = analyzeModeMarginals(g, mode);
    // Relative tolerance: both are sums of ~1e4-1e8 floating-point terms.
    const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-13 * Math.max(1, Math.abs(b)));
    close(fast.totalUnits / fast.combinations, marg.expectedUnits);
    close(fast.scatterUnits / fast.combinations, marg.expectedScatterUnits);
  });
});

describe('real configuration', () => {
  it('enumeration and marginal method agree on the expected win of both reel sets', () => {
    for (const mode of ['base', 'free'] as const) {
      const fast = enumerateSpinDistribution(game, mode);
      const marg = analyzeModeMarginals(game, mode);
      expect(fast.combinations).toBe(mode === 'base' ? 40 ** 5 : 38 * 39 * 39 * 39 * 38);
      expect(Math.abs(fast.totalUnits / fast.combinations - marg.expectedUnits)).toBeLessThan(1e-11);
      expect(Math.abs(fast.lineWinCombinations / fast.combinations - (1 - fast.winningLines[0]! / fast.combinations))).toBeLessThan(1e-15);
    }
  });

  it('per-reel-row marginals are used when strips are weighted (rows then differ)', () => {
    const g = compileWith((c) => (c.reelSets.base![0]!.weights = c.reelSets.base![0]!.symbols.map((_, i) => (i % 4) + 1)));
    const marg = analyzeModeMarginals(g, 'base');
    const fast = enumerateSpinDistribution(g, 'base');
    expect(Math.abs(fast.totalUnits / fast.combinations - marg.expectedUnits)).toBeLessThan(1e-11);
  });
});
