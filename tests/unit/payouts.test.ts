import { describe, expect, it } from 'vitest';
import { evaluateLine, evaluateScatter, evaluateSpin } from '../../src/game/payouts';
import { cellsOf, compileWith, game, grid, referenceEvaluate } from '../helpers';

const base = game.modes.base;
const free = game.modes.free;

function lineWin(window: string[][], lineIndex: number, mode = base, g = game) {
  return evaluateLine(g, mode, cellsOf(g, window), lineIndex, 1);
}

/** Middle row (payline 0) gets `middle`; other rows hold blockers that pay nothing. */
function middle(...symbols: string[]): string[][] {
  return grid(['COMET MOON PLANET JADE SAPPHIRE', symbols.join(' '), 'RUBY AMETHYST SAPPHIRE PLANET MOON']);
}

describe('symbol payouts', () => {
  const regulars = game.config.symbols.filter((s) => s.kind === 'regular').map((s) => s.id);
  const cases = [...regulars, 'WILD'].flatMap((symbol) => [3, 4, 5].map((count) => [symbol, count] as const));

  it.each(cases)('%s x%i pays exactly the paytable value times the line bet', (symbol, count) => {
    const breaker = 'SCATTER';
    const cells = Array.from({ length: 5 }, (_, reel) => (reel < count ? symbol : breaker));
    const window = middle(...cells);
    const expected = game.config.paytable.line[symbol]![String(count)]!;
    for (const lineBet of game.lineBetOptions) {
      const result = evaluateSpin(game, base, cellsOf(game, window), lineBet);
      const w = result.lineWins.find((x) => x.lineIndex === 0)!;
      expect(w).toMatchObject({ symbol, count, basePay: expected, win: expected * lineBet });
      // The whole evaluation agrees with the independent reference evaluator.
      expect(result.totalUnits).toBe(referenceEvaluate(game, 'base', window).totalUnits);
    }
  });

  it('pays nothing for two of a kind or for a broken run', () => {
    expect(lineWin(middle('SUN', 'SUN', 'JADE', 'SUN', 'SUN'), 0)).toBeNull();
    expect(lineWin(middle('SUN', 'JADE', 'SUN', 'SUN', 'SUN'), 0)).toBeNull();
  });

  it('only counts combinations that start on reel 1 (left to right)', () => {
    expect(lineWin(middle('JADE', 'SUN', 'SUN', 'SUN', 'SUN'), 0)).toBeNull();
  });
});

describe('Wild substitution', () => {
  it('substitutes in any position of the combination', () => {
    expect(lineWin(middle('MOON', 'WILD', 'MOON', 'JADE', 'RUBY'), 0)).toMatchObject({
      symbol: 'MOON',
      count: 3,
      containsWild: true,
      win: 20,
    });
    expect(lineWin(middle('WILD', 'WILD', 'MOON', 'MOON', 'RUBY'), 0)).toMatchObject({
      symbol: 'MOON',
      count: 4,
      win: 75,
    });
    expect(lineWin(middle('MOON', 'MOON', 'MOON', 'MOON', 'WILD'), 0)).toMatchObject({
      symbol: 'MOON',
      count: 5,
      win: 300,
    });
  });

  it('pays the Wild-only combination when it is worth more than the substituted one', () => {
    // WILD x3 = 50 beats JADE x4 = 15.
    expect(lineWin(middle('WILD', 'WILD', 'WILD', 'JADE', 'RUBY'), 0)).toMatchObject({
      symbol: 'WILD',
      count: 3,
      win: 50,
    });
  });

  it('pays the substituted combination when it is worth more than the Wild-only one', () => {
    // SUN x5 = 1000 beats WILD x3 = 50.
    expect(lineWin(middle('WILD', 'WILD', 'WILD', 'SUN', 'SUN'), 0)).toMatchObject({
      symbol: 'SUN',
      count: 5,
      win: 1000,
    });
  });

  it('pays five Wilds from the Wild row of the paytable', () => {
    expect(lineWin(middle('WILD', 'WILD', 'WILD', 'WILD', 'WILD'), 0)).toMatchObject({
      symbol: 'WILD',
      count: 5,
      win: 2000,
    });
  });

  it('prefers the regular symbol on an exact tie', () => {
    const g = compileWith((c) => (c.paytable.line.MOON = { '3': 20, '4': 50, '5': 300 }));
    const w = lineWin(middle('WILD', 'WILD', 'WILD', 'MOON', 'RUBY'), 0, g.modes.base, g);
    expect(w).toMatchObject({ symbol: 'MOON', count: 4, units: 50 });
  });

  it('never substitutes for Scatter, and Scatter breaks a line', () => {
    expect(lineWin(middle('SCATTER', 'WILD', 'WILD', 'WILD', 'WILD'), 0)).toBeNull();
    expect(lineWin(middle('WILD', 'SCATTER', 'SUN', 'SUN', 'SUN'), 0)).toBeNull();
    expect(lineWin(middle('SUN', 'SUN', 'SCATTER', 'SUN', 'SUN'), 0)).toBeNull();
    expect(lineWin(middle('WILD', 'WILD', 'WILD', 'SCATTER', 'SUN'), 0)).toMatchObject({ symbol: 'WILD', count: 3 });
  });

  it('applies the free-spins Wild multiplier once per line, not once per Wild', () => {
    const { wildMultiplier, winMultiplier } = game.config.modes.free;
    const one = lineWin(middle('PLANET', 'WILD', 'PLANET', 'JADE', 'RUBY'), 0, free)!;
    const three = lineWin(middle('PLANET', 'WILD', 'WILD', 'WILD', 'RUBY'), 0, free)!;
    expect(one).toMatchObject({
      count: 3,
      basePay: 25,
      wildMultiplier,
      modeMultiplier: winMultiplier,
      units: 25 * wildMultiplier * winMultiplier,
    });
    expect(three).toMatchObject({ count: 4, basePay: 100, units: 100 * wildMultiplier * winMultiplier });
    const plain = lineWin(middle('PLANET', 'PLANET', 'PLANET', 'JADE', 'RUBY'), 0, free)!;
    expect(plain).toMatchObject({ containsWild: false, wildMultiplier: 1, units: 25 * winMultiplier });
  });

  it('compares interpretations after the Wild multiplier', () => {
    const g = compileWith((c) => {
      c.modes.free.wildMultiplier = 3;
      c.paytable.line.WILD = { '3': 50, '4': 250, '5': 2000 };
    });
    // Free mode: WILD x3 = 50*3 = 150 vs SAPPHIRE x4 with wild = 20*3 = 60 -> Wild-only wins.
    const w = lineWin(middle('WILD', 'WILD', 'WILD', 'SAPPHIRE', 'RUBY'), 0, g.modes.free, g)!;
    expect(w).toMatchObject({ symbol: 'WILD', units: 150 * g.modes.free.winMultiplier });
  });
});

describe('Scatter', () => {
  const scatterWindow = (n: number) => {
    const w = grid([
      'COMET MOON PLANET JADE SAPPHIRE',
      'JADE AMETHYST SAPPHIRE RUBY MOON',
      'RUBY COMET JADE PLANET AMETHYST',
    ]);
    const spots: [number, number][] = [
      [0, 0],
      [1, 2],
      [2, 1],
      [3, 0],
      [4, 2],
    ];
    for (let i = 0; i < n; i++) w[spots[i]![0]]![spots[i]![1]] = 'SCATTER';
    return w;
  };

  it.each([
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [3, 2, 10],
    [4, 10, 10],
    [5, 100, 10],
  ])('%i scatters anywhere pay %i x total bet and award %i free spins', (n, pay, award) => {
    const result = evaluateSpin(game, base, cellsOf(game, scatterWindow(n)), 2);
    expect(result.scatter).toMatchObject({ count: n, basePay: pay, freeSpinsAwarded: award });
    expect(result.scatter.win).toBe(pay * game.lineCount * 2);
    expect(result.lineWins).toHaveLength(0);
    expect(result.totalWin).toBe(result.scatter.win);
  });

  it('records the scatter positions independently of paylines', () => {
    const s = evaluateScatter(game, base, cellsOf(game, scatterWindow(3)), 1);
    expect(s.positions).toEqual([
      { reel: 0, row: 0 },
      { reel: 1, row: 2 },
      { reel: 2, row: 1 },
    ]);
  });

  it('pays with the free-spins multiplier during the feature and uses the retrigger table', () => {
    const r = evaluateSpin(game, free, cellsOf(game, scatterWindow(3)), 1);
    expect(r.scatter.units).toBe(2 * game.lineCount * game.config.modes.free.winMultiplier);
    expect(r.scatter.freeSpinsAwarded).toBe(game.config.freeSpins.retrigger.awards['3']);
  });

  it('respects scatterPaysInFeature=false and retrigger.enabled=false', () => {
    const g = compileWith((c) => {
      c.freeSpins.scatterPaysInFeature = false;
      c.freeSpins.retrigger.enabled = false;
    });
    const r = evaluateSpin(g, g.modes.free, cellsOf(g, scatterWindow(4)), 1);
    expect(r.scatter.units).toBe(0);
    expect(r.scatter.freeSpinsAwarded).toBe(0);
  });
});

describe('combining wins', () => {
  it('adds simultaneous wins on several paylines and the scatter win', () => {
    const window = grid(['SUN SUN SUN SUN SUN', 'COMET SCATTER SCATTER SCATTER MOON', 'JADE JADE JADE JADE JADE']);
    const r = evaluateSpin(game, base, cellsOf(game, window), 1);
    const byLine = new Map(r.lineWins.map((w) => [w.lineIndex, w]));
    expect(byLine.get(1)).toMatchObject({ symbol: 'SUN', count: 5, win: 1000 });
    expect(byLine.get(2)).toMatchObject({ symbol: 'JADE', count: 5, win: 50 });
    expect(r.scatter).toMatchObject({ count: 3, units: 40 });
    expect(r.lineUnits).toBe(r.lineWins.reduce((a, w) => a + w.units, 0));
    expect(r.totalUnits).toBe(r.lineUnits + r.scatterUnits);
    expect(r.totalUnits).toBe(referenceEvaluate(game, 'base', window).totalUnits);
    // Each payline pays at most once.
    expect(new Set(r.lineWins.map((w) => w.lineIndex)).size).toBe(r.lineWins.length);
  });

  it('rejects invalid inputs', () => {
    const cells = cellsOf(game, middle('SUN', 'SUN', 'SUN', 'SUN', 'SUN'));
    expect(() => evaluateSpin(game, base, cells, 0)).toThrow(RangeError);
    expect(() => evaluateSpin(game, base, cells, 1.5)).toThrow(RangeError);
    expect(() => evaluateSpin(game, base, cells.subarray(0, 14), 1)).toThrow(RangeError);
  });
});
