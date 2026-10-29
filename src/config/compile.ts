import { configHash } from './hash';
import type { CountTable, GameConfig, GameMode, SymbolKind } from './types';
import { ConfigError, validateConfig, type ConfigIssue } from './validate';

/**
 * A reel strip compiled to numeric symbol indices.
 *
 * Virtual-reel mapping: the RNG draws a virtual stop v uniformly from
 * [0, totalWeight). The physical stop is the smallest index i with
 * cumulative[i] > v, i.e. physical stop i owns `weights[i]` consecutive virtual
 * positions. With no weights, virtual stop == physical stop. The visible window
 * for physical stop s shows strip positions s, s+1, ..., s+rows-1 (mod length)
 * from the top row down.
 */
export interface CompiledStrip {
  readonly length: number;
  readonly symbols: Int16Array;
  /** Per-stop weight; all ones when the config defines no weights. */
  readonly weights: Uint32Array;
  /** cumulative[i] = weights[0] + ... + weights[i]. */
  readonly cumulative: Float64Array;
  readonly totalWeight: number;
  readonly uniform: boolean;
}

export interface CompiledReelSet {
  readonly name: string;
  readonly strips: readonly CompiledStrip[];
}

export interface CompiledMode {
  readonly name: GameMode;
  readonly reelSet: CompiledReelSet;
  readonly wildMultiplier: number;
  readonly winMultiplier: number;
  readonly scatterPays: boolean;
  /** Free spins awarded, indexed by visible scatter count (retrigger table in free mode). */
  readonly awards: Int32Array;
}

export interface CompiledGame {
  readonly config: GameConfig;
  readonly hash: string;
  readonly warnings: readonly ConfigIssue[];
  readonly reels: number;
  readonly rows: number;
  readonly cells: number;
  readonly symbolIds: readonly string[];
  readonly symbolIndex: ReadonlyMap<string, number>;
  readonly kinds: readonly SymbolKind[];
  readonly wild: number;
  readonly scatter: number;
  /** linePay[symbol][count]: multiple of the line bet; Wild row holds Wild-only pays. */
  readonly linePay: readonly Int32Array[];
  /** scatterPay[count]: multiple of the total bet, already expanded to "N or more". */
  readonly scatterPay: Int32Array;
  /** paylines[line][reel] = row index. */
  readonly paylines: readonly Int8Array[];
  readonly lineCount: number;
  readonly modes: { readonly base: CompiledMode; readonly free: CompiledMode };
  readonly retriggerEnabled: boolean;
  readonly maxTotalFreeSpins: number | null;
  readonly maxWinMultiplier: number | null;
  readonly lineBetOptions: readonly number[];
  readonly defaultLineBetIndex: number;
  readonly startingBalance: number;
}

/**
 * Expands a count table to an array indexed 0..maxCount. With `carryUp`, a count that
 * is not listed takes the value of the largest listed count below it ("N or more"),
 * so gaps (e.g. keys 3 and 5 but no 4) and counts above the top key are well defined.
 * Counts below the smallest key are worth 0.
 */
export function expandCountTable(table: CountTable, maxCount: number, carryUp: boolean): Int32Array {
  const out = new Int32Array(maxCount + 1);
  let last = 0;
  for (let c = 0; c <= maxCount; c++) {
    const v = table[String(c)];
    if (v !== undefined) last = v;
    out[c] = v !== undefined ? v : carryUp ? last : 0;
  }
  return out;
}

/** P(exactly c scatters visible) for one reel set: per-reel distributions convolved across reels. */
export function scatterCountPmf(reelSet: CompiledReelSet, rows: number, scatter: number): number[] {
  let pmf = [1];
  for (const strip of reelSet.strips) {
    const reel = new Array<number>(rows + 1).fill(0);
    for (let s = 0; s < strip.length; s++) {
      let c = 0;
      for (let r = 0; r < rows; r++) if (strip.symbols[(s + r) % strip.length] === scatter) c++;
      reel[c]! += strip.weights[s]! / strip.totalWeight;
    }
    const next = new Array<number>(pmf.length + rows).fill(0);
    pmf.forEach((a, i) => reel.forEach((b, j) => (next[i + j]! += a * b)));
    pmf = next;
  }
  return pmf;
}

export function compileGame(config: GameConfig): CompiledGame {
  const validation = validateConfig(config);
  if (!validation.ok) throw new ConfigError(validation.errors);

  const { reels, rows } = config.grid;
  const cells = reels * rows;
  const symbolIds = config.symbols.map((s) => s.id);
  const symbolIndex = new Map(symbolIds.map((id, i) => [id, i]));
  const kinds = config.symbols.map((s) => s.kind);
  const wild = kinds.indexOf('wild');
  const scatter = kinds.indexOf('scatter');

  const linePay = symbolIds.map((id) => {
    const t = config.paytable.line[id];
    // A combination longer than the largest defined count pays that largest count, so a
    // longer run can never pay less than a shorter one even when a key is omitted.
    return t ? expandCountTable(t, reels, true) : new Int32Array(reels + 1);
  });
  const scatterPay = expandCountTable(config.paytable.scatter, cells, true);

  const compiledSets = new Map<string, CompiledReelSet>();
  for (const [name, strips] of Object.entries(config.reelSets)) {
    compiledSets.set(name, {
      name,
      strips: strips.map((strip) => {
        const symbols = Int16Array.from(strip.symbols, (s) => symbolIndex.get(s)!);
        const weights = Uint32Array.from(strip.weights ?? strip.symbols.map(() => 1));
        const cumulative = new Float64Array(weights.length);
        let acc = 0;
        weights.forEach((w, i) => {
          acc += w;
          cumulative[i] = acc;
        });
        return {
          length: symbols.length,
          symbols,
          weights,
          cumulative,
          totalWeight: acc,
          uniform: weights.every((w) => w === 1),
        };
      }),
    });
  }

  const triggerAwards = expandCountTable(config.freeSpins.triggerAwards, cells, true);
  const retriggerAwards = config.freeSpins.retrigger.enabled
    ? expandCountTable(config.freeSpins.retrigger.awards, cells, true)
    : new Int32Array(cells + 1);

  const mode = (name: GameMode, awards: Int32Array, scatterPays: boolean): CompiledMode => {
    const def = config.modes[name];
    return {
      name,
      reelSet: compiledSets.get(def.reelSet)!,
      wildMultiplier: def.wildMultiplier,
      winMultiplier: def.winMultiplier,
      scatterPays,
      awards,
    };
  };

  // Semantic check: with unlimited retriggers the feature length is a branching process.
  // If a free spin awards one or more extra spins on average, the expected number of
  // free spins (and the expected payout) is infinite, so such a configuration is rejected.
  if (config.freeSpins.retrigger.enabled && config.freeSpins.retrigger.maxTotalSpins === null) {
    const freeSet = compiledSets.get(config.modes.free.reelSet)!;
    const pmf = scatterCountPmf(freeSet, rows, scatter);
    const meanAward = pmf.reduce((acc, p, c) => acc + p * retriggerAwards[Math.min(c, cells)]!, 0);
    if (meanAward >= 1) {
      throw new ConfigError([
        {
          path: 'freeSpins.retrigger.maxTotalSpins',
          message: `retriggers are unlimited and each free spin awards ${meanAward.toFixed(4)} extra spins on average (>= 1), so the expected feature length and payout are infinite; set a finite maxTotalSpins or lower the retrigger rate`,
        },
      ]);
    }
  }

  return {
    config,
    hash: configHash(config),
    warnings: validation.warnings,
    reels,
    rows,
    cells,
    symbolIds,
    symbolIndex,
    kinds,
    wild,
    scatter,
    linePay,
    scatterPay,
    paylines: config.paylines.map((l) => Int8Array.from(l)),
    lineCount: config.paylines.length,
    modes: {
      base: mode('base', triggerAwards, true),
      free: mode('free', retriggerAwards, config.freeSpins.scatterPaysInFeature),
    },
    retriggerEnabled: config.freeSpins.retrigger.enabled,
    maxTotalFreeSpins: config.freeSpins.retrigger.maxTotalSpins,
    maxWinMultiplier: config.limits.maxWinMultiplier,
    lineBetOptions: config.bet.lineBetOptions,
    defaultLineBetIndex: config.bet.defaultLineBetIndex,
    startingBalance: config.session.startingBalance,
  };
}
