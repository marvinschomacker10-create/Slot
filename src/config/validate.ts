import type { GameConfig } from './types';

export interface ConfigIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ConfigIssue[];
  warnings: ConfigIssue[];
}

export class ConfigError extends Error {
  readonly issues: ConfigIssue[];
  constructor(issues: ConfigIssue[]) {
    super(
      `Invalid game configuration (${issues.length} error${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n'),
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const KNOWN_TOP_LEVEL = new Set([
  'meta',
  'grid',
  'symbols',
  'paytable',
  'paylines',
  'reelSets',
  'modes',
  'freeSpins',
  'bet',
  'limits',
  'session',
  'math',
]);

const SYMBOL_ID = /^[A-Z][A-Z0-9_]*$/;
const UINT32_RANGE = 2 ** 32;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

/**
 * Validates an untrusted configuration object. Never throws for malformed input;
 * every problem is reported with a JSON-path-like location so it can be fixed
 * without reading the engine source.
 */
export function validateConfig(raw: unknown): ValidationResult {
  const errors: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!isObject(raw)) {
    err('$', 'configuration must be a JSON object');
    return { ok: false, errors, warnings };
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL.has(key)) warn(key, 'unknown top-level key (ignored) - check for a typo');
  }

  // meta
  const meta = raw.meta;
  if (!isObject(meta)) err('meta', 'must be an object with id, name and version');
  else {
    for (const k of ['id', 'name', 'version'] as const) {
      if (typeof meta[k] !== 'string' || (meta[k] as string).trim() === '')
        err(`meta.${k}`, 'must be a non-empty string');
    }
  }

  // grid
  let reels = 0;
  let rows = 0;
  const grid = raw.grid;
  if (!isObject(grid)) err('grid', 'must be an object with reels and rows');
  else {
    if (!isInt(grid.reels) || grid.reels < 3 || grid.reels > 7) err('grid.reels', 'must be an integer between 3 and 7');
    else reels = grid.reels;
    if (!isInt(grid.rows) || grid.rows < 1 || grid.rows > 6) err('grid.rows', 'must be an integer between 1 and 6');
    else rows = grid.rows;
  }
  const cells = reels * rows;

  // symbols
  const symbolKinds = new Map<string, string>();
  if (!Array.isArray(raw.symbols) || raw.symbols.length === 0) err('symbols', 'must be a non-empty array');
  else {
    raw.symbols.forEach((s, i) => {
      const p = `symbols[${i}]`;
      if (!isObject(s)) {
        err(p, 'must be an object');
        return;
      }
      if (typeof s.id !== 'string' || !SYMBOL_ID.test(s.id)) {
        {
          err(`${p}.id`, 'must be an upper-case identifier such as "BOOK"');
          return;
        }
      }
      if (symbolKinds.has(s.id)) err(`${p}.id`, `duplicate symbol id "${s.id}"`);
      if (typeof s.name !== 'string' || s.name.trim() === '') err(`${p}.name`, 'must be a non-empty string');
      if (s.kind !== 'regular' && s.kind !== 'wild' && s.kind !== 'scatter') {
        err(`${p}.kind`, 'must be "regular", "wild" or "scatter"');
      }
      if (!['low', 'high', 'premium', 'special'].includes(s.tier as string)) {
        err(`${p}.tier`, 'must be "low", "high", "premium" or "special"');
      }
      symbolKinds.set(s.id, String(s.kind));
    });
    const wilds = [...symbolKinds.values()].filter((k) => k === 'wild').length;
    const scatters = [...symbolKinds.values()].filter((k) => k === 'scatter').length;
    const regulars = [...symbolKinds.values()].filter((k) => k === 'regular').length;
    if (wilds !== 1) err('symbols', `exactly one symbol with kind "wild" is required (found ${wilds})`);
    if (scatters !== 1) err('symbols', `exactly one symbol with kind "scatter" is required (found ${scatters})`);
    if (regulars < 1) err('symbols', 'at least one regular symbol is required');
  }

  const validateCountTable = (
    table: unknown,
    path: string,
    maxCount: number,
    opts: { monotonic: boolean; allowEmpty: boolean },
  ): Map<number, number> => {
    const out = new Map<number, number>();
    if (!isObject(table)) {
      err(path, 'must be an object mapping counts (e.g. "3") to non-negative integers');
      return out;
    }
    for (const [k, v] of Object.entries(table)) {
      const count = Number(k);
      if (!/^\d+$/.test(k) || count < 1 || (maxCount > 0 && count > maxCount)) {
        err(`${path}.${k}`, `count key must be an integer between 1 and ${maxCount}`);
        continue;
      }
      if (!isInt(v) || v < 0) {
        err(`${path}.${k}`, 'value must be a non-negative integer');
        continue;
      }
      out.set(count, v);
    }
    if (!opts.allowEmpty && out.size === 0) err(path, 'must define at least one count');
    if (opts.monotonic) {
      const keys = [...out.keys()].sort((a, b) => a - b);
      for (let i = 1; i < keys.length; i++) {
        const a = out.get(keys[i - 1]!)!;
        const b = out.get(keys[i]!)!;
        if (b < a) {
          err(
            `${path}.${keys[i]}`,
            `pays less (${b}) than the shorter combination "${keys[i - 1]}" (${a}); longer combinations must not pay less`,
          );
        }
      }
    }
    return out;
  };

  // paytable
  const paytable = raw.paytable;
  if (!isObject(paytable)) err('paytable', 'must be an object with "line" and "scatter" tables');
  else {
    if (!isObject(paytable.line)) err('paytable.line', 'must be an object keyed by symbol id');
    else {
      for (const [id, table] of Object.entries(paytable.line)) {
        const kind = symbolKinds.get(id);
        if (kind === undefined) err(`paytable.line.${id}`, `unknown symbol "${id}"`);
        else if (kind === 'scatter') {
          err(`paytable.line.${id}`, 'scatter symbols cannot have line pays; use paytable.scatter instead');
        }
        const t = validateCountTable(table, `paytable.line.${id}`, reels, {
          monotonic: true,
          allowEmpty: false,
        });
        for (const [count, pay] of t) {
          if (count < 3 && pay > 0) warn(`paytable.line.${id}.${count}`, 'combinations shorter than 3 are unusual');
        }
      }
      for (const [id, kind] of symbolKinds) {
        if (kind === 'regular' && !(id in paytable.line))
          err(`paytable.line`, `regular symbol "${id}" has no line pays`);
      }
    }
    validateCountTable(paytable.scatter, 'paytable.scatter', cells, {
      monotonic: true,
      allowEmpty: true,
    });
  }

  // paylines
  if (!Array.isArray(raw.paylines) || raw.paylines.length === 0) err('paylines', 'must be a non-empty array');
  else {
    const seen = new Map<string, number>();
    raw.paylines.forEach((line, i) => {
      const p = `paylines[${i}]`;
      if (!Array.isArray(line)) {
        err(p, 'must be an array of row indices');
        return;
      }
      if (reels > 0 && line.length !== reels)
        err(p, `must contain exactly ${reels} row indices (found ${line.length})`);
      line.forEach((r, j) => {
        if (!isInt(r) || r < 0 || (rows > 0 && r >= rows))
          err(`${p}[${j}]`, `row index must be an integer in [0, ${rows - 1}]`);
      });
      const key = JSON.stringify(line);
      const prev = seen.get(key);
      if (prev !== undefined)
        err(p, `duplicates paylines[${prev}]; a duplicated line would pay the same combination twice`);
      else seen.set(key, i);
    });
  }

  // reel sets
  if (!isObject(raw.reelSets) || Object.keys(raw.reelSets).length === 0)
    err('reelSets', 'must define at least one reel set');
  else {
    for (const [name, set] of Object.entries(raw.reelSets)) {
      const p = `reelSets.${name}`;
      if (!Array.isArray(set)) {
        err(p, 'must be an array of reel strips');
        continue;
      }
      if (reels > 0 && set.length !== reels) err(p, `must contain exactly ${reels} strips (found ${set.length})`);
      set.forEach((strip, i) => {
        const sp = `${p}[${i}]`;
        if (!isObject(strip) || !Array.isArray(strip.symbols)) {
          err(sp, 'must be an object with a "symbols" array');
          return;
        }
        const symbols = strip.symbols as unknown[];
        if (rows > 0 && symbols.length < rows) err(`${sp}.symbols`, `must contain at least ${rows} stops`);
        let hasRegular = false;
        symbols.forEach((s, j) => {
          if (typeof s !== 'string' || !symbolKinds.has(s))
            err(`${sp}.symbols[${j}]`, `unknown symbol ${JSON.stringify(s)}`);
          else if (symbolKinds.get(s) === 'regular') hasRegular = true;
        });
        if (!hasRegular && symbols.length > 0) warn(`${sp}.symbols`, 'strip contains no regular symbols');
        if (strip.weights !== undefined) {
          if (!Array.isArray(strip.weights) || strip.weights.length !== symbols.length) {
            err(`${sp}.weights`, 'must be an array with one weight per stop');
          } else {
            let total = 0;
            strip.weights.forEach((w, j) => {
              if (!isInt(w) || w < 1) err(`${sp}.weights[${j}]`, 'weight must be a positive integer');
              else total += w;
            });
            if (total > UINT32_RANGE) err(`${sp}.weights`, 'total weight must not exceed 2^32');
          }
        }
        // Scatter spacing: more than one scatter in a single window is legal but makes
        // per-reel scatter counts non-binary; flag it so it is a conscious decision.
        if (rows > 1 && symbols.length >= rows) {
          const scatterIdx = symbols
            .map((s, j) => (typeof s === 'string' && symbolKinds.get(s) === 'scatter' ? j : -1))
            .filter((j) => j >= 0);
          for (let a = 0; a < scatterIdx.length; a++) {
            const next = scatterIdx[(a + 1) % scatterIdx.length]!;
            const gap = (next - scatterIdx[a]! + symbols.length) % symbols.length || symbols.length;
            if (scatterIdx.length > 1 && gap < rows) {
              warn(`${sp}.symbols[${scatterIdx[a]}]`, 'two scatters can appear in the same window on this reel');
              break;
            }
          }
        }
      });
    }
  }

  // modes
  if (!isObject(raw.modes)) err('modes', 'must define "base" and "free" modes');
  else {
    for (const m of ['base', 'free'] as const) {
      const mode = raw.modes[m];
      const p = `modes.${m}`;
      if (!isObject(mode)) {
        err(p, 'must be an object');
        continue;
      }
      if (typeof mode.reelSet !== 'string' || !isObject(raw.reelSets) || !(mode.reelSet in raw.reelSets)) {
        err(`${p}.reelSet`, `must name an existing reel set (got ${JSON.stringify(mode.reelSet)})`);
      }
      for (const k of ['wildMultiplier', 'winMultiplier'] as const) {
        if (!isInt(mode[k]) || (mode[k] as number) < 1) err(`${p}.${k}`, 'must be a positive integer');
      }
    }
  }

  // free spins
  let maxInitialAward = 0;
  const fs = raw.freeSpins;
  if (!isObject(fs)) err('freeSpins', 'must be an object');
  else {
    const trig = validateCountTable(fs.triggerAwards, 'freeSpins.triggerAwards', cells, {
      monotonic: true,
      allowEmpty: true,
    });
    maxInitialAward = Math.max(0, ...trig.values());
    if (maxInitialAward === 0)
      warn('freeSpins.triggerAwards', 'no positive award: the free-spins feature can never trigger');
    const rt = fs.retrigger;
    if (!isObject(rt)) err('freeSpins.retrigger', 'must be an object');
    else {
      if (typeof rt.enabled !== 'boolean') err('freeSpins.retrigger.enabled', 'must be a boolean');
      validateCountTable(rt.awards, 'freeSpins.retrigger.awards', cells, {
        monotonic: true,
        allowEmpty: true,
      });
      if (rt.maxTotalSpins !== null) {
        if (!isInt(rt.maxTotalSpins) || rt.maxTotalSpins < 1) {
          err('freeSpins.retrigger.maxTotalSpins', 'must be null (unlimited) or a positive integer');
        } else if (rt.maxTotalSpins < maxInitialAward) {
          err('freeSpins.retrigger.maxTotalSpins', `must be at least the largest initial award (${maxInitialAward})`);
        }
      }
    }
    if (typeof fs.scatterPaysInFeature !== 'boolean') err('freeSpins.scatterPaysInFeature', 'must be a boolean');
  }

  // bet
  let minLineBet = 0;
  let maxLineBet = 0;
  const bet = raw.bet;
  if (!isObject(bet)) err('bet', 'must be an object');
  else {
    const opts = bet.lineBetOptions;
    if (!Array.isArray(opts) || opts.length === 0)
      err('bet.lineBetOptions', 'must be a non-empty array of positive integers');
    else {
      opts.forEach((o, i) => {
        if (!isInt(o) || o < 1) err(`bet.lineBetOptions[${i}]`, 'must be a positive integer (credits)');
        else if (i > 0 && isInt(opts[i - 1]) && o <= (opts[i - 1] as number)) {
          err(`bet.lineBetOptions[${i}]`, 'options must be strictly increasing');
        }
      });
      minLineBet = Math.min(...opts.filter(isInt));
      maxLineBet = Math.max(...opts.filter(isInt));
      if (!isInt(bet.defaultLineBetIndex) || bet.defaultLineBetIndex < 0 || bet.defaultLineBetIndex >= opts.length) {
        err('bet.defaultLineBetIndex', `must be an index into lineBetOptions (0..${opts.length - 1})`);
      }
    }
  }

  // limits
  if (!isObject(raw.limits)) err('limits', 'must be an object');
  else if (
    raw.limits.maxWinMultiplier !== null &&
    (!isInt(raw.limits.maxWinMultiplier) || raw.limits.maxWinMultiplier < 1)
  ) {
    err('limits.maxWinMultiplier', 'must be null (no cap) or a positive integer multiple of the total bet');
  }

  // session
  const lines = Array.isArray(raw.paylines) ? raw.paylines.length : 0;
  if (!isObject(raw.session)) err('session', 'must be an object');
  else if (!isInt(raw.session.startingBalance) || raw.session.startingBalance < 0) {
    err('session.startingBalance', 'must be a non-negative integer number of credits');
  } else if (minLineBet > 0 && lines > 0 && raw.session.startingBalance < minLineBet * lines) {
    warn('session.startingBalance', 'is smaller than the minimum total bet; the first spin will be rejected');
  }
  if (isObject(raw.session)) {
    const a = raw.session.allowance;
    if (a !== null && a !== undefined && !isObject(a)) {
      err('session.allowance', 'must be null (disabled) or an object with amount and intervalMinutes');
    } else if (a === undefined) {
      err('session.allowance', 'must be present: null (disabled) or { "amount": credits, "intervalMinutes": minutes }');
    } else if (a !== null) {
      if (!isInt(a.amount) || a.amount < 1)
        err('session.allowance.amount', 'must be a positive integer number of credits');
      if (typeof a.intervalMinutes !== 'number' || !(a.intervalMinutes > 0 && a.intervalMinutes <= 10_080)) {
        err(
          'session.allowance.intervalMinutes',
          'must be a number of minutes greater than 0 and at most 10080 (one week)',
        );
      }
    }
  }

  // math
  if (!isObject(raw.math)) err('math', 'must be an object');
  else if (typeof raw.math.targetRtp !== 'number' || !(raw.math.targetRtp > 0 && raw.math.targetRtp < 1.5)) {
    err('math.targetRtp', 'must be a number between 0 and 1.5 (e.g. 0.96)');
  }

  // Integer-safety of the largest conceivable single payout.
  if (errors.length === 0 && maxLineBet > 0 && lines > 0) {
    const cfg = raw as unknown as GameConfig;
    const maxLinePay = Math.max(0, ...Object.values(cfg.paytable.line).flatMap((t) => Object.values(t)));
    const maxScatter = Math.max(0, ...Object.values(cfg.paytable.scatter));
    const mult = Math.max(
      cfg.modes.base.wildMultiplier * cfg.modes.base.winMultiplier,
      cfg.modes.free.wildMultiplier * cfg.modes.free.winMultiplier,
    );
    const perSpin = (maxLinePay * lines + maxScatter * lines) * mult * maxLineBet;
    if (!Number.isSafeInteger(perSpin * 1000)) {
      err('bet.lineBetOptions', 'the largest possible payout is too large for exact integer arithmetic');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function assertValidConfig(raw: unknown): asserts raw is GameConfig {
  const result = validateConfig(raw);
  if (!result.ok) throw new ConfigError(result.errors);
}
