import { describe, expect, it } from 'vitest';
import { grantRetrigger, remainingFreeSpins, startFreeSpins, truncateAward } from '../../src/game/bonus';
import {
  assertLineBet,
  outcomeFromStops,
  playNextSpin,
  playRound,
  resolveSpin,
  roundWinCap,
  startRound,
} from '../../src/game/engine';
import { GameStateError } from '../../src/game/errors';
import { SeededRandomSource } from '../../src/rng';
import { ScriptedRandom, compileWith, game, scatterStops } from '../helpers';

describe('free-spins state machine', () => {
  it('starts a feature with the configured award', () => {
    const f = startFreeSpins(game, 10, 2);
    expect(f).toMatchObject({ lineBet: 2, totalAwarded: 10, played: 0, retriggers: 0, totalWin: 0 });
    expect(remainingFreeSpins(f)).toBe(10);
    expect(() => startFreeSpins(game, 0, 1)).toThrow(GameStateError);
  });

  it('adds retrigger awards and truncates at maxTotalSpins', () => {
    const g = compileWith((c) => (c.freeSpins.retrigger.maxTotalSpins = 15));
    let f = startFreeSpins(g, 10, 1);
    const r1 = grantRetrigger(g, f, 10);
    expect(r1.granted).toBe(5);
    expect(r1.state).toMatchObject({ totalAwarded: 15, retriggers: 1, truncatedSpins: 5 });
    f = r1.state;
    const r2 = grantRetrigger(g, f, 10);
    expect(r2.granted).toBe(0);
    expect(r2.state).toMatchObject({ totalAwarded: 15, retriggers: 1, truncatedSpins: 15 });
    expect(truncateAward(g, 0, 10)).toBe(10);
  });

  it('refuses retriggers when they are disabled', () => {
    const g = compileWith((c) => (c.freeSpins.retrigger.enabled = false));
    expect(() => grantRetrigger(g, startFreeSpins(g, 10, 1), 10)).toThrow(GameStateError);
    expect(grantRetrigger(g, startFreeSpins(g, 10, 1), 0).granted).toBe(0);
  });
});

describe('spin resolution', () => {
  it('is deterministic: the same stops always give the same outcome', () => {
    const stops = [3, 17, 25, 8, 39];
    expect(outcomeFromStops(game, 'base', stops, 5)).toEqual(outcomeFromStops(game, 'base', stops, 5));
  });

  it('turns RNG values into stops only (one draw per reel) and then evaluates', () => {
    const rng = new ScriptedRandom([3, 17, 25, 8, 39]);
    const o = resolveSpin(game, 'base', rng, 1);
    expect(rng.consumed).toBe(5);
    expect(o.stops).toEqual([3, 17, 25, 8, 39]);
    expect(o).toEqual(outcomeFromStops(game, 'base', [3, 17, 25, 8, 39], 1));
    // window[reel][row] = strip[(stop + row) mod length]
    const strip = game.config.reelSets.base![1]!.symbols;
    expect(o.window[1]).toEqual([strip[17], strip[18], strip[19]]);
  });

  it('wraps the window around the end of the strip', () => {
    const last = game.config.reelSets.base![0]!.symbols.length - 1;
    const o = outcomeFromStops(game, 'base', [last, 0, 0, 0, 0], 1);
    const strip = game.config.reelSets.base![0]!.symbols;
    expect(o.window[0]).toEqual([strip[last], strip[0], strip[1]]);
  });

  it('rejects out-of-range stops and bets', () => {
    expect(() => outcomeFromStops(game, 'base', [0, 0, 0, 0, 40], 1)).toThrow(RangeError);
    expect(() => outcomeFromStops(game, 'base', [0, 0, 0, 0], 1)).toThrow(RangeError);
    expect(() => assertLineBet(game, 3)).toThrow(GameStateError);
    expect(() => startRound(game, 3)).toThrow(GameStateError);
  });
});

describe('game rounds', () => {
  it('completes a round without a trigger after one paid spin', () => {
    const round0 = startRound(game, 2);
    expect(round0).toMatchObject({ stake: 40, totalBet: 40, status: 'awaiting-base-spin' });
    const { round, spin } = playNextSpin(game, round0, new ScriptedRandom(scatterStops(game, 'base', 0)));
    expect(round.status).toBe('complete');
    expect(round.featureTriggered).toBe(false);
    expect(spin.credited).toBe(spin.outcome.totalWin);
    expect(round.totalWin).toBe(spin.credited);
    expect(() => playNextSpin(game, round, new SeededRandomSource(1))).toThrow(GameStateError);
  });

  it('enters free spins on 3 scatters, plays exactly 10 free spins at the triggering bet, then exits', () => {
    const stops = [...scatterStops(game, 'base', 3)];
    for (let i = 0; i < 10; i++) stops.push(...scatterStops(game, 'free', 0));
    const rng = new ScriptedRandom(stops);
    let round = startRound(game, 5);
    const first = playNextSpin(game, round, rng);
    round = first.round;
    expect(first.spin.outcome.scatter.count).toBe(3);
    expect(first.spin.freeSpinsGranted).toBe(10);
    expect(round).toMatchObject({ status: 'free-spins', featureTriggered: true });
    expect(round.feature).toMatchObject({ totalAwarded: 10, played: 0, lineBet: 5 });
    let free = 0;
    let sum = first.spin.credited;
    while (round.status === 'free-spins') {
      const step = playNextSpin(game, round, rng);
      expect(step.spin.outcome.mode).toBe('free');
      expect(step.spin.outcome.lineBet).toBe(5);
      sum += step.spin.credited;
      round = step.round;
      free++;
    }
    expect(free).toBe(10);
    expect(round.status).toBe('complete');
    expect(round.totalWin).toBe(sum);
    expect(round.stake).toBe(5 * 20); // the stake is charged once for the whole round
    expect(rng.consumed).toBe(stops.length);
  });

  it('retriggers: 3 scatters during free spins add 10 spins', () => {
    const stops = [...scatterStops(game, 'base', 3), ...scatterStops(game, 'free', 3)];
    for (let i = 0; i < 19; i++) stops.push(...scatterStops(game, 'free', 0));
    const rng = new ScriptedRandom(stops);
    let round = playNextSpin(game, startRound(game, 1), rng).round;
    const re = playNextSpin(game, round, rng);
    expect(re.spin.freeSpinsGranted).toBe(10);
    expect(re.round.feature).toMatchObject({ totalAwarded: 20, played: 1, retriggers: 1 });
    round = re.round;
    while (round.status !== 'complete') round = playNextSpin(game, round, rng).round;
    expect(round.feature!.played).toBe(20);
  });

  it('does not retrigger when retriggers are disabled', () => {
    const g = compileWith((c) => (c.freeSpins.retrigger.enabled = false));
    const stops = [...scatterStops(g, 'base', 3), ...scatterStops(g, 'free', 3)];
    for (let i = 0; i < 9; i++) stops.push(...scatterStops(g, 'free', 0));
    const result = playRound(g, 1, new ScriptedRandom(stops));
    expect(result.freeSpinsPlayed).toBe(10);
    expect(result.retriggers).toBe(0);
  });

  it('applies the round win cap to the base spin and forfeits the feature', () => {
    const g = compileWith((c) => (c.limits.maxWinMultiplier = 1));
    expect(roundWinCap(g, 1)).toBe(20);
    const { round, spin } = playNextSpin(g, startRound(g, 1), new ScriptedRandom(scatterStops(g, 'base', 3)));
    expect(spin.outcome.totalWin).toBeGreaterThan(20);
    expect(spin.credited).toBe(20);
    expect(spin.cappedBy).toBe(spin.outcome.totalWin - 20);
    expect(spin.freeSpinsForfeited).toBe(10);
    expect(round).toMatchObject({ status: 'complete', capReached: true, totalWin: 20, featureTriggered: false });
  });

  it('ends the feature as soon as the cap is reached during free spins', () => {
    const g = compileWith((c) => (c.limits.maxWinMultiplier = 3));
    const cap = 60;
    // Search deterministic free-spin stops that pay at least 30 units without scatters.
    const rng = new SeededRandomSource('cap-search');
    let winning: number[] | null = null;
    for (let i = 0; i < 100_000 && !winning; i++) {
      const stops = g.modes.free.reelSet.strips.map((s) => rng.nextUint32() % s.length);
      const o = outcomeFromStops(g, 'free', stops, 1);
      if (o.totalWin >= 30 && o.scatter.count === 0) winning = stops;
    }
    expect(winning).not.toBeNull();
    const base = scatterStops(g, 'base', 3);
    const baseWin = outcomeFromStops(g, 'base', base, 1).totalWin;
    expect(baseWin).toBeLessThan(cap);
    const script = [...base, ...winning!, ...winning!, ...winning!];
    const result = playRound(g, 1, new ScriptedRandom(script));
    expect(result.capReached).toBe(true);
    expect(result.totalWin).toBe(cap);
    expect(result.freeSpinsPlayed).toBeLessThan(10);
    const last = result.spins[result.spins.length - 1]!;
    expect(last.freeSpinsForfeited).toBe(10 - result.freeSpinsPlayed);
    expect(result.spins.reduce((a, s) => a + s.credited, 0)).toBe(cap);
  });

  it('playRound accounts every credit exactly once', () => {
    const rng = new SeededRandomSource('accounting');
    for (let i = 0; i < 2000; i++) {
      const r = playRound(game, 2, rng);
      expect(r.totalWin).toBe(r.spins.reduce((a, s) => a + s.credited, 0));
      expect(r.baseWin + r.featureWin).toBe(r.totalWin);
      expect(r.spins.slice(1).every((s) => s.outcome.mode === 'free')).toBe(true);
      expect(r.freeSpinsPlayed).toBe(r.spins.length - 1);
      expect(r.stake).toBe(40);
    }
  });
});
