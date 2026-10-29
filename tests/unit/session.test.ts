import { describe, expect, it } from 'vitest';
import { DoubleSettlementError, GameStateError, InsufficientBalanceError } from '../../src/game/errors';
import { Ledger } from '../../src/game/state/ledger';
import { GameSession } from '../../src/game/state/session';
import { SeededRandomSource } from '../../src/rng';
import { ScriptedRandom, game, scatterStops } from '../helpers';

describe('ledger', () => {
  it('debits stakes and credits wins exactly once per reference', () => {
    const l = new Ledger(1000);
    l.debitStake('R1', 20);
    l.creditWin('R1-S0', 50);
    expect(l.balance).toBe(1030);
    expect(() => l.debitStake('R1', 20)).toThrow(DoubleSettlementError);
    expect(() => l.creditWin('R1-S0', 50)).toThrow(DoubleSettlementError);
    expect(l.balance).toBe(1030);
    expect(l.verify()).toEqual({ ok: true, recomputed: 1030 });
  });

  it('rejects non-integer, negative and overdrawing amounts', () => {
    const l = new Ledger(10);
    expect(() => l.creditWin('a', -1)).toThrow(RangeError);
    expect(() => l.creditWin('b', 0.5)).toThrow(RangeError);
    expect(() => l.debitStake('c', 0)).toThrow(RangeError);
    expect(() => l.debitStake('d', 11)).toThrow(InsufficientBalanceError);
    expect(() => new Ledger(-5)).toThrow(RangeError);
    expect(l.entries).toHaveLength(0);
  });
});

describe('game session', () => {
  it('starts idle with the configured play-money balance', () => {
    const s = new GameSession(game, { rng: new SeededRandomSource(1) });
    const snap = s.getSnapshot();
    expect(snap).toMatchObject({
      balance: game.startingBalance,
      phase: 'idle',
      lineBet: 1,
      totalBet: 20,
      rngKind: 'seeded',
    });
  });

  it('debits the stake and credits the win of a paid spin', () => {
    const s = new GameSession(game, { rng: new SeededRandomSource(2), startingBalance: 1000 });
    const r = s.spin();
    expect(r.stakeDebited).toBe(20);
    expect(r.balanceAfterStake).toBe(980);
    expect(r.balanceAfter).toBe(980 + r.credited);
    expect(s.balance).toBe(r.balanceAfter);
  });

  it('rejects a spin the balance cannot cover without changing state', () => {
    const s = new GameSession(game, { rng: new SeededRandomSource(3), startingBalance: 19 });
    expect(s.canSpin()).toBe(false);
    expect(() => s.spin()).toThrow(InsufficientBalanceError);
    expect(s.balance).toBe(19);
    expect(s.ledgerEntries).toHaveLength(0);
    expect(s.getSnapshot().stats.rounds).toBe(0);
  });

  it('does not deduct a stake for free spins and locks the bet during the feature', () => {
    const script = [...scatterStops(game, 'base', 3)];
    for (let i = 0; i < 10; i++) script.push(...scatterStops(game, 'free', 0));
    const s = new GameSession(game, { rng: new ScriptedRandom(script), startingBalance: 10_000, lineBetIndex: 2 });
    const trigger = s.spin();
    expect(trigger.startedFeature).toBe(true);
    expect(s.phase).toBe('free-spins');
    expect(() => s.setLineBetIndex(0)).toThrow(GameStateError);
    for (let i = 0; i < 10; i++) {
      const r = s.spin();
      expect(r.mode).toBe('free');
      expect(r.stakeDebited).toBe(0);
      expect(r.balanceAfterStake).toBe(r.balanceBefore);
      expect(r.outcome.lineBet).toBe(5);
      expect(r.feature!.remaining).toBe(9 - i);
    }
    expect(s.phase).toBe('idle');
    const snap = s.getSnapshot();
    expect(snap.stats).toMatchObject({
      rounds: 1,
      paidSpins: 1,
      freeSpins: 10,
      featuresTriggered: 1,
      totalStaked: 100,
    });
    expect(snap.history[0]).toMatchObject({ roundId: 'R1', freeSpinsPlayed: 10, featureTriggered: true });
    expect(snap.history[0]!.spins).toHaveLength(11);
    expect(s.balance).toBe(10_000 - 100 + snap.stats.totalWon);
    s.setLineBetIndex(0);
    expect(s.getSnapshot().lineBet).toBe(1);
  });

  it('settles every spin exactly once and keeps the ledger consistent', () => {
    const s = new GameSession(game, { rng: new SeededRandomSource('integrity'), startingBalance: 1_000_000 });
    for (let i = 0; i < 3000; i++) s.spin();
    const entries = s.ledgerEntries;
    const refs = entries.map((e) => `${e.type}:${e.reference}`);
    expect(new Set(refs).size).toBe(refs.length);
    const stats = s.getSnapshot().stats;
    expect(entries.filter((e) => e.type === 'win')).toHaveLength(stats.paidSpins + stats.freeSpins);
    expect(s.balance).toBe(1_000_000 - stats.totalStaked + stats.totalWon);
    expect(s.verifyIntegrity()).toEqual({ ok: true, problems: [] });
  });

  it('returns frozen records so presentation code cannot alter a settled outcome', () => {
    const s = new GameSession(game, { rng: new SeededRandomSource(5) });
    const r = s.spin();
    const balance = s.balance;
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.outcome.window[0])).toBe(true);
    expect(() => {
      (r as { credited: number }).credited = 1e9;
    }).toThrow(TypeError);
    expect(s.balance).toBe(balance);
  });

  it('notifies subscribers and publishes a new snapshot per change', () => {
    const s = new GameSession(game, { rng: new SeededRandomSource(6) });
    let calls = 0;
    const unsubscribe = s.subscribe(() => calls++);
    const before = s.getSnapshot();
    s.spin();
    expect(calls).toBe(1);
    expect(s.getSnapshot()).not.toBe(before);
    expect(s.getSnapshot().version).toBe(before.version + 1);
    unsubscribe();
    s.spin();
    expect(calls).toBe(1);
  });

  it('validates bet indices and bounds the history', () => {
    expect(() => new GameSession(game, { rng: new SeededRandomSource(7), lineBetIndex: 99 })).toThrow(GameStateError);
    const s = new GameSession(game, { rng: new SeededRandomSource(7), historyLimit: 5, startingBalance: 100_000 });
    expect(() => s.setLineBetIndex(-1)).toThrow(GameStateError);
    for (let i = 0; i < 40; i++) s.spin();
    expect(s.getSnapshot().history.length).toBeLessThanOrEqual(5);
  });
});
