import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GameMode } from '../../src/config/types';
import { evaluateSpin } from '../../src/game/payouts';
import { cellsOf, compileWith, game, referenceEvaluate } from '../helpers';

const symbolIds = game.symbolIds as string[];
const windowArb = fc.array(fc.array(fc.constantFrom(...symbolIds), { minLength: 3, maxLength: 3 }), {
  minLength: 5,
  maxLength: 5,
});
// Wild-heavy windows exercise substitution edge cases far more often than uniform ones.
const wildHeavyArb = fc.array(
  fc.array(
    fc.oneof(
      { weight: 3, arbitrary: fc.constant('WILD') },
      { weight: 1, arbitrary: fc.constant('SCATTER') },
      { weight: 4, arbitrary: fc.constantFrom('TEACHER', 'APPLE', 'RULER') },
    ),
    { minLength: 3, maxLength: 3 },
  ),
  { minLength: 5, maxLength: 5 },
);
const modeArb = fc.constantFrom<GameMode>('base', 'free');

describe('property-based checks of the payout evaluator', () => {
  it('agrees with the independent brute-force reference on random windows', () => {
    fc.assert(
      fc.property(fc.oneof(windowArb, wildHeavyArb), modeArb, (window, mode) => {
        const r = evaluateSpin(game, game.modes[mode], cellsOf(game, window), 1);
        const ref = referenceEvaluate(game, mode, window);
        expect(r.lineWins.map((w) => [w.lineIndex, w.symbol, w.count, w.units])).toEqual(
          ref.lines.map((w) => [w.lineIndex, w.symbol, w.count, w.units]),
        );
        expect(r.scatter.count).toBe(ref.scatterCount);
        expect(r.scatterUnits).toBe(ref.scatterUnits);
        expect(r.totalUnits).toBe(ref.totalUnits);
        expect(r.scatter.freeSpinsAwarded).toBe(ref.award);
      }),
      { numRuns: 3000 },
    );
  });

  it('agrees with the reference under alternative rule settings', () => {
    const alt = compileWith((c) => {
      c.modes.base.wildMultiplier = 2;
      c.modes.free.wildMultiplier = 5;
      c.modes.free.winMultiplier = 3;
      c.paytable.line.WILD = { '2': 5, '3': 60, '5': 5000 };
      c.paytable.scatter = { '2': 1, '3': 5 };
    });
    fc.assert(
      fc.property(fc.oneof(windowArb, wildHeavyArb), modeArb, (window, mode) => {
        const r = evaluateSpin(alt, alt.modes[mode], cellsOf(alt, window), 1);
        expect(r.totalUnits).toBe(referenceEvaluate(alt, mode, window).totalUnits);
      }),
      { numRuns: 1500 },
    );
  });

  it('is deterministic and scales exactly with the line bet', () => {
    fc.assert(
      fc.property(windowArb, modeArb, fc.constantFrom(...game.lineBetOptions), (window, mode, lineBet) => {
        const cells = cellsOf(game, window);
        const a = evaluateSpin(game, game.modes[mode], cells, lineBet);
        const b = evaluateSpin(game, game.modes[mode], cells, lineBet);
        const unit = evaluateSpin(game, game.modes[mode], cells, 1);
        expect(a).toEqual(b);
        expect(a.totalWin).toBe(unit.totalWin * lineBet);
        expect(Number.isSafeInteger(a.totalWin)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('reports winning positions that lie on the payline and form the combination', () => {
    fc.assert(
      fc.property(wildHeavyArb, (window) => {
        const r = evaluateSpin(game, game.modes.base, cellsOf(game, window), 1);
        for (const w of r.lineWins) {
          expect(w.positions).toHaveLength(w.count);
          w.positions.forEach((p, reel) => {
            expect(p).toEqual({ reel, row: game.config.paylines[w.lineIndex]![reel] });
            const s = window[p.reel]![p.row];
            expect(s === w.symbol || s === 'WILD').toBe(true);
          });
        }
      }),
      { numRuns: 500 },
    );
  });
});
