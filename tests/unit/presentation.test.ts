import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { celebrationLevel, describeSpin, winSteps, winTier } from '../../src/app/presentation';
import { GameSession } from '../../src/game/state/session';
import { computeLayout, easeOutBack, planLanding, planSpinTiming, tapeSymbol, type TapeSegment } from '../../src/render/layout';
import { SeededRandomSource } from '../../src/rng';
import { ScriptedRandom, game, scatterStops } from '../helpers';

describe('reel landing (renderer tape model)', () => {
  const strips = game.config.reelSets.base!.map((s) => s.symbols);
  const freeStrips = game.config.reelSets.free!.map((s) => s.symbols);

  it('always lands exactly on the settled window, from any scroll position and strip', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.nat(),
        fc.nat(),
        fc.boolean(),
        (reel, position, prevStop, stop, toFree) => {
          const from = strips[reel]!;
          const to = (toFree ? freeStrips : strips)[reel]!;
          const current: TapeSegment[] = [{ minJ: -Infinity, strip: from, anchor: prevStop % from.length }];
          const visibleBefore = Array.from({ length: 4 }, (_, k) => tapeSymbol(current, Math.floor(-position) + k));
          const s = stop % to.length;
          const landing = planLanding(current, position, to, s, 3);
          expect(Number.isInteger(landing.end)).toBe(true);
          expect(landing.end).toBeGreaterThan(position);
          // Cells that may already be visible keep their symbols (no popping).
          visibleBefore.forEach((sym, k) => expect(tapeSymbol(landing.segments, Math.floor(-position) + k)).toBe(sym));
          // At the end position, row r shows strip[(stop + r) mod length], i.e. the engine's window.
          for (let r = 0; r < 3; r++) expect(tapeSymbol(landing.segments, r - landing.end)).toBe(to[(s + r) % to.length]);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('easeOutBack starts at 0, ends at 1 and overshoots slightly', () => {
    expect(easeOutBack(0)).toBe(0);
    expect(easeOutBack(1)).toBe(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
  });

  it('stops reels left to right and adds anticipation after two scatters', () => {
    const t = planSpinTiming([1, 1, 0, 0, 0], 'normal', 2);
    for (let i = 1; i < 5; i++) expect(t.stopAt[i]!).toBeGreaterThan(t.stopAt[i - 1]!);
    expect(t.anticipation).toEqual([false, false, true, true, true]);
    const turbo = planSpinTiming([0, 0, 0, 0, 0], 'turbo', 2);
    expect(turbo.stopAt[4]!).toBeLessThan(t.stopAt[4]!);
    expect(turbo.anticipation.every((a) => !a)).toBe(true);
  });

  it('lays out a 5x3 grid inside any canvas size', () => {
    fc.assert(
      fc.property(fc.integer({ min: 120, max: 4000 }), fc.integer({ min: 100, max: 3000 }), (w, h) => {
        const l = computeLayout(w, h, 5, 3);
        expect(l.frame.x).toBeGreaterThanOrEqual(-1);
        expect(l.frame.y).toBeGreaterThanOrEqual(-1);
        expect(l.frame.x + l.frame.w).toBeLessThanOrEqual(w + 1);
        expect(l.frame.y + l.frame.h).toBeLessThanOrEqual(h + 1);
        expect(l.pitch).toBeGreaterThanOrEqual(l.cell);
      }),
    );
  });
});

describe('win presentation', () => {
  it('classifies win tiers relative to the total bet', () => {
    expect(winTier(0, 20)).toBe('none');
    expect(winTier(100, 20)).toBe('small');
    expect(winTier(300, 20)).toBe('big');
    expect(winTier(1000, 20)).toBe('mega');
    expect(winTier(4000, 20)).toBe('epic');
    expect(celebrationLevel('epic')).toBe(3);
    expect(celebrationLevel('small')).toBe(0);
  });

  it('describes every win of a settled spin, with amounts equal to the engine values', () => {
    const s = new GameSession(game, { rng: new SeededRandomSource('present'), startingBalance: 1e7 });
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const r = s.spin();
      const steps = winSteps(game, r);
      if (r.credited > 0) {
        expect(steps[0]!.kind).toBe('all');
        expect(steps[0]!.text).toContain(r.credited.toLocaleString('en-US'));
        expect(steps.filter((x) => x.kind === 'line')).toHaveLength(r.outcome.lineWins.length);
        checked++;
      }
      expect(describeSpin(game, r)).toContain(r.balanceAfter.toLocaleString('en-US'));
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('announces free-spin triggers', () => {
    const s = new GameSession(game, { rng: new ScriptedRandom(scatterStops(game, 'base', 3)) });
    const r = s.spin();
    expect(describeSpin(game, r)).toMatch(/Free spins triggered: 10 spins/);
    expect(winSteps(game, r).some((x) => x.kind === 'scatter' && /\+ 10 free spins/.test(x.text))).toBe(true);
  });
});
