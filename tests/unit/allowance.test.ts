import { describe, expect, it } from 'vitest';
import { compileGame, validateConfig } from '../../src/config';
import { GameStateError } from '../../src/game/errors';
import { allowanceStatus, formatCountdown } from '../../src/game/state/allowance';
import { parseSessionSave } from '../../src/game/state/persistence';
import { GameSession } from '../../src/game/state/session';
import { SeededRandomSource } from '../../src/rng';
import { ScriptedRandom, cloneConfig, game, scatterStops } from '../helpers';

const MIN = 60_000;
const rule = { amount: 1000, intervalMs: 10 * MIN };

describe('allowance timing', () => {
  it('becomes available exactly one interval after the last collection and does not accumulate', () => {
    const t0 = 1_700_000_000_000;
    expect(allowanceStatus(rule, t0, t0)).toMatchObject({
      available: false,
      remainingMs: 10 * MIN,
      nextAt: t0 + 10 * MIN,
    });
    expect(allowanceStatus(rule, t0, t0 + 10 * MIN - 1).available).toBe(false);
    expect(allowanceStatus(rule, t0, t0 + 10 * MIN)).toMatchObject({ available: true, remainingMs: 0, amount: 1000 });
    // Waiting three intervals still yields one collection, not three.
    expect(allowanceStatus(rule, t0, t0 + 30 * MIN)).toMatchObject({ available: true, amount: 1000 });
  });

  it('never locks up when the clock goes backwards or saved data lies in the future', () => {
    const now = 1_700_000_000_000;
    const s = allowanceStatus(rule, now + 365 * 24 * 60 * MIN, now);
    expect(s.remainingMs).toBe(10 * MIN);
    expect(allowanceStatus(rule, Number.NaN, now).remainingMs).toBe(10 * MIN);
  });

  it('reports a disabled allowance', () => {
    expect(allowanceStatus(null, 0, 0)).toMatchObject({ enabled: false, available: false, nextAt: null });
  });

  it('formats countdowns', () => {
    expect(formatCountdown(10 * MIN)).toBe('10:00');
    expect(formatCountdown(61_000)).toBe('1:01');
    expect(formatCountdown(500)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(3_723_000)).toBe('1:02:03');
  });
});

describe('allowance in the game session', () => {
  it('credits play money once per interval as a grant, never as a win', () => {
    let now = 1_000_000;
    const s = new GameSession(game, { rng: new SeededRandomSource('allow'), startingBalance: 500, now: () => now });
    expect(s.allowanceStatus().available).toBe(false);
    expect(() => s.collectAllowance()).toThrow(GameStateError);
    now += game.allowance!.intervalMs;
    expect(s.collectAllowance()).toBe(game.allowance!.amount);
    expect(s.balance).toBe(500 + game.allowance!.amount);
    expect(() => s.collectAllowance()).toThrow(/available in/);
    const snap = s.getSnapshot();
    expect(snap.stats).toMatchObject({ grants: 1, totalGranted: game.allowance!.amount, totalWon: 0 });
    expect(s.ledgerEntries.at(-1)).toMatchObject({ type: 'grant', amount: game.allowance!.amount });
    now += game.allowance!.intervalMs;
    s.collectAllowance();
    for (let i = 0; i < 20; i++) s.spin();
    expect(s.verifyIntegrity()).toEqual({ ok: true, problems: [] });
  });

  it('is refused when disabled in the configuration', () => {
    const c = cloneConfig();
    c.session.allowance = null;
    const s = new GameSession(compileGame(c), { rng: new SeededRandomSource(1) });
    expect(() => s.collectAllowance()).toThrow(/disabled/);
  });

  it('validates the allowance configuration', () => {
    const c = cloneConfig();
    c.session.allowance = { amount: 0, intervalMinutes: -1 };
    const paths = validateConfig(c).errors.map((e) => e.path);
    expect(paths).toContain('session.allowance.amount');
    expect(paths).toContain('session.allowance.intervalMinutes');
    const d = cloneConfig() as unknown as { session: Record<string, unknown> };
    delete d.session.allowance;
    expect(validateConfig(d).errors.map((e) => e.path)).toContain('session.allowance');
  });
});

describe('saving and restoring the wallet', () => {
  it('restores balance, bet and allowance timer', () => {
    let now = 5_000_000;
    const a = new GameSession(game, { rng: new SeededRandomSource('save'), now: () => now, lineBetIndex: 1 });
    for (let i = 0; i < 30 && a.phase === 'idle'; i++) a.spin();
    while (a.phase !== 'idle') a.spin();
    const saved = JSON.parse(JSON.stringify(a.save()));
    const { save, notes } = parseSessionSave(saved, game);
    expect(notes).toEqual([]);
    now += 1000;
    const b = new GameSession(game, { rng: new SeededRandomSource('other'), restore: save, now: () => now });
    expect(b.balance).toBe(a.balance);
    expect(b.getSnapshot().lineBet).toBe(2);
    expect(b.getSnapshot().lastAllowanceAt).toBe(a.getSnapshot().lastAllowanceAt);
  });

  it('resumes an unfinished free-spins round after a reload without charging another stake', () => {
    const script = [...scatterStops(game, 'base', 3)];
    for (let i = 0; i < 10; i++) script.push(...scatterStops(game, 'free', 0));
    const a = new GameSession(game, { rng: new ScriptedRandom(script), startingBalance: 1000 });
    a.spin(); // trigger
    a.spin();
    a.spin(); // two free spins played
    expect(a.phase).toBe('free-spins');
    const saved = parseSessionSave(JSON.parse(JSON.stringify(a.save())), game).save!;
    expect(saved.openRound).not.toBeNull();
    // "Reload": a new session continues with the remaining 8 free spins from the same stream position.
    const b = new GameSession(game, { rng: new ScriptedRandom(script.slice(15)), restore: saved });
    expect(b.phase).toBe('free-spins');
    expect(b.getSnapshot().feature).toMatchObject({ played: 2, remaining: 8 });
    let records = 0;
    while (b.phase === 'free-spins') {
      const r = b.spin();
      expect(r.stakeDebited).toBe(0);
      records++;
    }
    expect(records).toBe(8);
    // Same final balance as playing the whole round without a reload.
    const whole = new GameSession(game, { rng: new ScriptedRandom(script), startingBalance: 1000 });
    whole.spin();
    while (whole.phase === 'free-spins') whole.spin();
    expect(b.balance).toBe(whole.balance);
    expect(b.getSnapshot().history[0]).toMatchObject({ roundId: 'R1', freeSpinsPlayed: 10 });
    expect(b.verifyIntegrity()).toEqual({ ok: true, problems: [] });
  });

  it('rejects malformed or tampered saves', () => {
    expect(parseSessionSave(null, game).save).toBeNull();
    expect(parseSessionSave({ version: 2 }, game).save).toBeNull();
    expect(parseSessionSave({ version: 1, balance: -5 }, game).save).toBeNull();
    expect(parseSessionSave({ version: 1, balance: 1.5 }, game).save).toBeNull();
    const ok = parseSessionSave({ version: 1, balance: 100, lineBetIndex: 99 }, game).save!;
    expect(ok.lineBetIndex).toBe(game.defaultLineBetIndex);
    // An open round whose numbers do not add up is ignored.
    const script = [...scatterStops(game, 'base', 3), ...scatterStops(game, 'free', 0)];
    const a = new GameSession(game, { rng: new ScriptedRandom(script) });
    a.spin();
    const raw = JSON.parse(JSON.stringify(a.save()));
    raw.openRound.state.feature.played = 99;
    const parsed = parseSessionSave(raw, game);
    expect(parsed.save!.openRound).toBeNull();
    expect(parsed.notes.join()).toMatch(/inconsistent/);
    // A round saved under another configuration is not resumed.
    const other = JSON.parse(JSON.stringify(a.save()));
    other.configHash = 'different';
    expect(parseSessionSave(other, game).save!.openRound).toBeNull();
    // Malformed spin details are dropped; the round itself (state) is still resumed.
    const badSpins = JSON.parse(JSON.stringify(a.save()));
    badSpins.openRound.spins[0].stops = [999999, 0, 0, 0, 0];
    const dropped = parseSessionSave(badSpins, game);
    expect(dropped.save!.openRound).not.toBeNull();
    expect(dropped.save!.openRound!.spins).toEqual([]);
    expect(dropped.notes.join()).toMatch(/spin details/);
  });

  it('restarts the allowance timer on load when the saved timestamp lies in the future', () => {
    let now = 1_700_000_000_000;
    const save = parseSessionSave({ version: 1, balance: 0, lastAllowanceAt: now + 365 * 24 * 60 * MIN }, game).save;
    const s = new GameSession(game, { rng: new SeededRandomSource('clock'), restore: save, now: () => now });
    expect(s.getSnapshot().lastAllowanceAt).toBe(now);
    now += 10 * MIN;
    expect(s.allowanceStatus().available).toBe(true);
    expect(s.collectAllowance()).toBe(1000);
  });
});
