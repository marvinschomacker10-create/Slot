import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, canonicalJson, compileGame, configHash, sha256Hex, validateConfig } from '../../src/config';
import type { GameConfig } from '../../src/config/types';
import { cloneConfig } from '../helpers';

function errorsFor(mutate: (c: GameConfig & Record<string, unknown>) => void) {
  const c = cloneConfig() as GameConfig & Record<string, unknown>;
  mutate(c);
  return validateConfig(c).errors;
}

function expectError(
  mutate: (c: GameConfig & Record<string, unknown>) => void,
  path: string | RegExp,
  message?: RegExp,
) {
  const errors = errorsFor(mutate);
  const hit = errors.find(
    (e) => (typeof path === 'string' ? e.path === path : path.test(e.path)) && (!message || message.test(e.message)),
  );
  expect(hit, `expected an error at ${String(path)}; got ${JSON.stringify(errors)}`).toBeDefined();
}

describe('configuration validation', () => {
  it('accepts the bundled configuration without errors or warnings', () => {
    const r = validateConfig(cloneConfig());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('defines the required initial design: 5x3, 20 paylines, 10 symbols, one Wild, one Scatter', () => {
    const c = cloneConfig();
    expect(c.grid).toEqual({ reels: 5, rows: 3 });
    expect(c.paylines).toHaveLength(20);
    expect(c.symbols).toHaveLength(10);
    expect(c.symbols.filter((s) => s.kind === 'wild')).toHaveLength(1);
    expect(c.symbols.filter((s) => s.kind === 'scatter')).toHaveLength(1);
    expect(Object.values(c.freeSpins.triggerAwards)).toContain(10);
  });

  it('rejects non-objects', () => {
    expect(validateConfig(null).ok).toBe(false);
    expect(validateConfig([]).errors[0]!.path).toBe('$');
  });

  it('reports unknown top-level keys as warnings', () => {
    const c = cloneConfig() as unknown as Record<string, unknown>;
    c.paytabel = {};
    const r = validateConfig(c);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.path)).toContain('paytabel');
  });

  it.each([
    ['grid.reels', (c: GameConfig) => (c.grid.reels = 2)],
    ['grid.rows', (c: GameConfig) => (c.grid.rows = 0)],
    ['meta.name', (c: GameConfig) => (c.meta.name = '')],
  ])('rejects invalid %s', (path, mutate) => expectError(mutate, path));

  it('rejects duplicate symbol ids and bad identifiers', () => {
    expectError((c) => (c.symbols[1]!.id = 'RULER'), 'symbols[1].id', /duplicate/);
    expectError((c) => (c.symbols[0]!.id = 'jade'), 'symbols[0].id', /upper-case/);
  });

  it('requires exactly one wild and one scatter', () => {
    expectError((c) => (c.symbols[0]!.kind = 'wild'), 'symbols', /exactly one symbol with kind "wild"/);
    expectError((c) => (c.symbols.find((s) => s.kind === 'scatter')!.kind = 'regular'), 'symbols', /scatter/);
  });

  it('rejects line pays for scatters, unknown symbols and missing regular pays', () => {
    expectError(
      (c) => (c.paytable.line.SCATTER = { '3': 1 }),
      'paytable.line.SCATTER',
      /scatter symbols cannot have line pays/,
    );
    expectError((c) => (c.paytable.line.GHOST = { '3': 1 }), 'paytable.line.GHOST', /unknown symbol/);
    expectError((c) => delete c.paytable.line.APPLE, 'paytable.line', /"APPLE" has no line pays/);
  });

  it('rejects longer combinations paying less than shorter ones', () => {
    expectError(
      (c) => (c.paytable.line.TEACHER = { '3': 50, '4': 40, '5': 1000 }),
      'paytable.line.TEACHER.4',
      /must not pay less/,
    );
  });

  it('rejects invalid count keys and pay values', () => {
    expectError((c) => (c.paytable.line.TEACHER = { '6': 50 }), 'paytable.line.TEACHER.6', /between 1 and 5/);
    expectError((c) => (c.paytable.line.TEACHER = { '3': -1 }), 'paytable.line.TEACHER.3', /non-negative integer/);
    expectError((c) => (c.paytable.line.TEACHER = { '3': 1.5 }), 'paytable.line.TEACHER.3', /non-negative integer/);
  });

  it('validates every payline has exactly five valid row indices and no duplicates', () => {
    expectError((c) => (c.paylines[3] = [0, 1, 2, 1]), 'paylines[3]', /exactly 5 row indices/);
    expectError((c) => (c.paylines[4] = [0, 1, 3, 1, 0]), 'paylines[4][2]', /row index/);
    expectError((c) => (c.paylines[5] = [...c.paylines[0]!]), 'paylines[5]', /duplicates paylines\[0\]/);
  });

  it('validates reel strips', () => {
    expectError((c) => (c.reelSets.base!.length = 4), 'reelSets.base', /exactly 5 strips/);
    expectError((c) => (c.reelSets.base![0]!.symbols[3] = 'GHOST'), 'reelSets.base[0].symbols[3]', /unknown symbol/);
    expectError(
      (c) => (c.reelSets.base![1]!.symbols = ['RULER', 'ERASER']),
      'reelSets.base[1].symbols',
      /at least 3 stops/,
    );
    expectError((c) => (c.reelSets.base![2]!.weights = [1, 2]), 'reelSets.base[2].weights', /one weight per stop/);
    expectError(
      (c) => (c.reelSets.base![2]!.weights = c.reelSets.base![2]!.symbols.map((_, i) => (i === 0 ? 0 : 1))),
      'reelSets.base[2].weights[0]',
      /positive integer/,
    );
  });

  it('warns when one reel can show two scatters', () => {
    const c = cloneConfig();
    const s = c.reelSets.base![0]!.symbols;
    const i = s.indexOf('SCATTER');
    s[(i + 1) % s.length] = 'SCATTER';
    const r = validateConfig(c);
    expect(r.warnings.some((w) => /two scatters/.test(w.message))).toBe(true);
  });

  it('validates modes, free spins, bets, limits and session', () => {
    expectError((c) => (c.modes.free.reelSet = 'nope'), 'modes.free.reelSet', /existing reel set/);
    expectError((c) => (c.modes.base.wildMultiplier = 0), 'modes.base.wildMultiplier');
    expectError(
      (c) => (c.freeSpins.retrigger.maxTotalSpins = 5),
      'freeSpins.retrigger.maxTotalSpins',
      /at least the largest initial award/,
    );
    expectError(
      (c) => ((c.freeSpins.retrigger as { enabled: unknown }).enabled = 'yes'),
      'freeSpins.retrigger.enabled',
    );
    expectError((c) => (c.bet.lineBetOptions = [1, 1, 2]), 'bet.lineBetOptions[1]', /strictly increasing/);
    expectError((c) => (c.bet.defaultLineBetIndex = 99), 'bet.defaultLineBetIndex');
    expectError((c) => (c.limits.maxWinMultiplier = 0), 'limits.maxWinMultiplier');
    expectError((c) => (c.session.startingBalance = 10.5), 'session.startingBalance');
    expectError((c) => (c.math.targetRtp = 2), 'math.targetRtp');
  });

  it('rejects unlimited retriggers whose mean award per free spin is >= 1 (infinite expected payout)', () => {
    const c = cloneConfig();
    c.freeSpins.retrigger.maxTotalSpins = null;
    c.freeSpins.retrigger.awards = { '1': 30 };
    expect(() => compileGame(c)).toThrow(/expected feature length and payout are infinite/);
    c.freeSpins.retrigger.awards = { '3': 10 };
    expect(() => compileGame(c)).not.toThrow();
  });

  it('compileGame throws a ConfigError listing every problem', () => {
    const c = cloneConfig();
    c.grid.rows = 0;
    c.paylines[0] = [9];
    let caught: unknown;
    try {
      compileGame(c);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const err = caught as ConfigError;
    expect(err.issues.length).toBeGreaterThanOrEqual(2);
    expect(err.message).toMatch(/grid\.rows/);
  });
});

describe('compiled configuration', () => {
  it('maps count tables with "N or more" semantics', () => {
    const c = cloneConfig();
    c.paytable.line.TEACHER = { '3': 50, '4': 200 };
    const g = compileGame(c);
    const sun = g.symbolIndex.get('TEACHER')!;
    expect(Array.from(g.linePay[sun]!)).toEqual([0, 0, 0, 50, 200, 200]);
    expect(g.scatterPay[5]).toBe(c.paytable.scatter['5']);
    expect(g.scatterPay[7]).toBe(c.paytable.scatter['5']);
    expect(g.scatterPay[2]).toBe(0);
  });

  it('fills gaps between count keys with the largest listed count below ("N or more")', () => {
    const c = cloneConfig();
    c.paytable.line.WILD = { '2': 5, '3': 60, '5': 5000 };
    const g = compileGame(c);
    expect(Array.from(g.linePay[g.wild]!)).toEqual([0, 0, 5, 60, 60, 5000]);
  });

  it('builds cumulative weights for virtual reels', () => {
    const c = cloneConfig();
    c.reelSets.base![0]!.weights = c.reelSets.base![0]!.symbols.map((_, i) => (i % 3) + 1);
    const g = compileGame(c);
    const strip = g.modes.base.reelSet.strips[0]!;
    expect(strip.uniform).toBe(false);
    expect(strip.totalWeight).toBe(c.reelSets.base![0]!.weights!.reduce((a, b) => a + b, 0));
    expect(strip.cumulative[strip.length - 1]).toBe(strip.totalWeight);
  });
});

describe('configuration hash', () => {
  it('matches node:crypto SHA-256 on assorted inputs', () => {
    for (const s of [
      '',
      'abc',
      'a'.repeat(55),
      'b'.repeat(56),
      'c'.repeat(64),
      'Ünïcødé ✓ 🎰',
      JSON.stringify(cloneConfig()),
    ]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });

  it('is independent of key order and sensitive to any value change', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    const c = cloneConfig();
    const h = configHash(c);
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverseKeys)
        : v !== null && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, x]) => [k, reverseKeys(x)]),
            )
          : v;
    const reordered = reverseKeys(c);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(c));
    expect(configHash(reordered)).toBe(h);
    c.paytable.line.RULER!['3'] = 6;
    expect(configHash(c)).not.toBe(h);
  });
});
