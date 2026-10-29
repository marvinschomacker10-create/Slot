import { describe, expect, it } from 'vitest';
import { evaluateSpin } from '../../src/game/payouts';
import { paylineDiagram, paylinePositions } from '../../src/game/paylines';
import { cellsOf, game } from '../helpers';

/** Blocker columns: no symbol repeats in adjacent columns, and TEACHER never appears. */
const BLOCKERS = [
  ['RULER', 'PENCIL', 'ERASER'],
  ['CHALK', 'BOOK', 'APPLE'],
  ['GLOBE', 'RULER', 'PENCIL'],
  ['ERASER', 'CHALK', 'BOOK'],
  ['APPLE', 'GLOBE', 'RULER'],
];

describe('paylines', () => {
  it('defines 20 distinct paylines of exactly five valid row indices', () => {
    expect(game.lineCount).toBe(20);
    const keys = new Set<string>();
    for (const line of game.config.paylines) {
      expect(line).toHaveLength(5);
      for (const r of line) expect(Number.isInteger(r) && r >= 0 && r < 3).toBe(true);
      keys.add(line.join(','));
    }
    expect(keys.size).toBe(20);
  });

  it('paylinePositions and diagrams follow the configured rows', () => {
    expect(paylinePositions(game, 3)).toEqual([0, 1, 2, 1, 0].map((row, reel) => ({ reel, row })));
    expect(paylineDiagram(game, 3)).toEqual(['X . . . X', '. X . X .', '. . X . .']);
    expect(() => paylinePositions(game, 20)).toThrow(RangeError);
  });

  it.each(game.config.paylines.map((line, i) => [i, line] as const))(
    'payline %i %j pays a five-of-a-kind placed on it',
    (lineIndex, line) => {
      const window = BLOCKERS.map((col) => [...col]);
      line.forEach((row, reel) => (window[reel]![row] = 'TEACHER'));
      const result = evaluateSpin(game, game.modes.base, cellsOf(game, window), 1);

      const target = result.lineWins.find((w) => w.lineIndex === lineIndex);
      expect(target).toMatchObject({ symbol: 'TEACHER', count: 5, basePay: 1000, win: 1000 });
      expect(target!.positions).toEqual(line.map((row, reel) => ({ reel, row })));

      // Every other line wins exactly when it shares the first >= 3 cells with this line.
      for (const [k, other] of game.config.paylines.entries()) {
        if (k === lineIndex) continue;
        let agree = 0;
        while (agree < 5 && other[agree] === line[agree]) agree++;
        const w = result.lineWins.find((x) => x.lineIndex === k);
        if (agree >= 3) expect(w).toMatchObject({ symbol: 'TEACHER', count: agree });
        else expect(w).toBeUndefined();
      }
    },
  );
});
