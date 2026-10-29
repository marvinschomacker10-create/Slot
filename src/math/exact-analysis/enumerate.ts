import type { CompiledGame, CompiledMode } from '../../config/compile';
import type { GameMode } from '../../config/types';

/**
 * Full exact enumeration of every reel-stop combination of one mode.
 *
 * This is an independent implementation of the payout rules (it does not call
 * the game engine's evaluator). It walks the reels depth-first, keeps an
 * incremental per-payline state, settles a line as soon as no interpretation can
 * extend it, and records the exact weighted joint distribution of
 * (total spin win, visible scatter count). The tests check that it reproduces the
 * engine's evaluation exactly on small configurations and that its mean equals
 * the marginal method on the real configuration.
 */

export interface SpinDistribution {
  readonly mode: GameMode;
  readonly reelSet: string;
  /** Number of weighted stop combinations (product of strip total weights). */
  readonly combinations: number;
  /** Largest scatter count that can occur (index range of the scatter dimension). */
  readonly maxScatter: number;
  /** Largest total win (line-bet units) that occurs in at least one combination. */
  readonly maxUnits: number;
  /** weight[u * (maxScatter + 1) + c] = number of combinations with total win u and c scatters. */
  readonly weight: Float64Array;
  /** Combinations with at least one winning payline. */
  readonly lineWinCombinations: number;
  /** winningLines[k] = combinations with exactly k winning paylines. */
  readonly winningLines: Float64Array;
  /** Sum over combinations of line-win units credited to each symbol (Wild = Wild-only combos), after multipliers. */
  readonly symbolUnits: Float64Array;
  /** Sum over combinations of scatter-win units. */
  readonly scatterUnits: number;
  /** Sum over combinations of all win units. */
  readonly totalUnits: number;
  readonly elapsedMs: number;
}

const DEAD = -2;
const ALL_WILD = -1;

/** Upper bound on the win of one spin in line-bet units (sizes the histogram). */
export function maxSpinUnitsBound(game: CompiledGame, mode: CompiledMode): number {
  let maxLine = 0;
  for (const row of game.linePay) for (const v of row) maxLine = Math.max(maxLine, v);
  const maxScatter = mode.scatterPays ? Math.max(...game.scatterPay) : 0;
  return (maxLine * mode.wildMultiplier * game.lineCount + maxScatter * game.lineCount) * mode.winMultiplier;
}

export function enumerateSpinDistribution(game: CompiledGame, modeName: GameMode): SpinDistribution {
  const t0 = performance.now();
  const mode = game.modes[modeName];
  const strips = mode.reelSet.strips;
  const R = game.reels;
  const ROWS = game.rows;
  const L = game.lineCount;
  const W = game.wild;
  const nSym = game.symbolIds.length;
  const wm = mode.wildMultiplier;
  const winMult = mode.winMultiplier;

  const isRegular = new Uint8Array(nSym);
  game.kinds.forEach((k, i) => (isRegular[i] = k === 'regular' ? 1 : 0));
  const pay = game.linePay.map((row) => Int32Array.from(row));
  const lineRows = game.paylines.map((l) => Int32Array.from(l));

  // Per reel: symbols visible at each (stop, row), scatter count per stop, weight per stop.
  const vis = strips.map((s) => {
    const a = new Int16Array(s.length * ROWS);
    for (let st = 0; st < s.length; st++) for (let r = 0; r < ROWS; r++) a[st * ROWS + r] = s.symbols[(st + r) % s.length]!;
    return a;
  });
  const sc = strips.map((s, i) => {
    const a = new Int8Array(s.length);
    for (let st = 0; st < s.length; st++) for (let r = 0; r < ROWS; r++) if (vis[i]![st * ROWS + r] === game.scatter) a[st]!++;
    return a;
  });
  const maxScatter = sc.reduce((acc, a) => acc + Math.max(...a), 0);
  const S = maxScatter + 1;
  const scatterUnitsByCount = new Float64Array(S);
  const scatterPays = mode.scatterPays;
  for (let c = 0; c < S; c++) scatterUnitsByCount[c] = scatterPays ? game.scatterPay[c]! * L * winMult : 0;

  const bound = maxSpinUnitsBound(game, mode);
  const weight = new Float64Array((bound + 1) * S);
  const winningLines = new Float64Array(L + 1);
  const symbolUnits = new Float64Array(nSym);
  let lineWinCombinations = 0;
  let scatterUnitsSum = 0;
  let totalUnitsSum = 0;
  let maxUnits = 0;

  // Weight of all combinations below a node at depth d: product of remaining reels' total weights.
  const tailWeight = new Float64Array(R + 1);
  tailWeight[R] = 1;
  for (let d = R - 1; d >= 0; d--) tailWeight[d] = tailWeight[d + 1]! * strips[d]!.totalWeight;

  // Incremental line state per depth: leading wilds, target symbol, run length, has-wild flag.
  const lw = new Int32Array(R * L);
  const tg = new Int32Array(R * L);
  const rn = new Int32Array(R * L);
  const hw = new Int32Array(R * L);
  const alive = new Int32Array(R * L);
  const aliveN = new Int32Array(R);
  const settledUnits = new Float64Array(R); // line units settled at depths <= d (before winMult)
  const settledLines = new Int32Array(R); // number of paying lines settled at depths <= d

  /** Final pay of a line state (before winMult); writes the paying symbol to paySym[0]. */
  const paySym = new Int32Array(1);
  const finalPay = (lwv: number, tgv: number, rnv: number, hwv: number): number => {
    const a = lwv > 0 ? pay[W]![lwv]! * wm : 0;
    const b = tgv >= 0 ? pay[tgv]![rnv]! * (hwv ? wm : 1) : 0;
    if (b > 0 && b >= a) {
      paySym[0] = tgv;
      return b;
    }
    paySym[0] = W;
    return a;
  };

  /** Advances line l from depth d-1 to depth d given symbol s; returns true if still alive. */
  const step = (d: number, l: number, s: number): boolean => {
    const o = d * L + l;
    if (d === 0) {
      if (s === W) {
        lw[o] = 1;
        tg[o] = ALL_WILD;
        rn[o] = 1;
        hw[o] = 1;
      } else if (isRegular[s]) {
        lw[o] = 0;
        tg[o] = s;
        rn[o] = 1;
        hw[o] = 0;
      } else {
        lw[o] = 0;
        tg[o] = DEAD;
        rn[o] = 0;
        hw[o] = 0;
      }
      return lw[o]! === 1 || rn[o]! === 1;
    }
    const p = o - L;
    let lwv = lw[p]!;
    let tgv = tg[p]!;
    let rnv = rn[p]!;
    let hwv = hw[p]!;
    const wildAlive = lwv === d;
    const runAlive = rnv === d && tgv !== DEAD;
    if (wildAlive && s === W) lwv = d + 1;
    if (runAlive) {
      if (tgv === ALL_WILD) {
        if (s === W) rnv = d + 1;
        else if (isRegular[s]) {
          tgv = s;
          rnv = d + 1;
        } else tgv = DEAD;
      } else if (s === tgv) rnv = d + 1;
      else if (s === W) {
        rnv = d + 1;
        hwv = 1;
      }
    }
    lw[o] = lwv;
    tg[o] = tgv;
    rn[o] = rnv;
    hw[o] = hwv;
    return lwv === d + 1 || (rnv === d + 1 && tgv !== DEAD);
  };

  const scAcc = new Int32Array(R + 1);
  const wAcc = new Float64Array(R + 1);
  wAcc[0] = 1;

  const descend = (d: number): void => {
    const strip = strips[d]!;
    const v = vis[d]!;
    const scd = sc[d]!;
    const prevN = d === 0 ? L : aliveN[d - 1]!;
    const prevSettled = d === 0 ? 0 : settledUnits[d - 1]!;
    const prevSettledLines = d === 0 ? 0 : settledLines[d - 1]!;

    if (d === R - 1) {
      // Leaf level: settle every remaining line and record the combination.
      for (let st = 0; st < strip.length; st++) {
        const w = wAcc[d]! * strip.weights[st]!;
        const c = scAcc[d]! + scd[st]!;
        let units = prevSettled;
        let lines = prevSettledLines;
        for (let k = 0; k < prevN; k++) {
          const l = d === 0 ? k : alive[(d - 1) * L + k]!;
          step(d, l, v[st * ROWS + lineRows[l]![d]!]!);
          const o = d * L + l;
          const pv = finalPay(lw[o]!, tg[o]!, rn[o]!, hw[o]!);
          if (pv > 0) {
            units += pv;
            lines++;
            symbolUnits[paySym[0]!]! += pv * winMult * w;
          }
        }
        const lineU = units * winMult;
        const total = lineU + scatterUnitsByCount[c]!;
        weight[total * S + c]! += w;
        winningLines[lines]! += w;
        if (lines > 0) lineWinCombinations += w;
        scatterUnitsSum += scatterUnitsByCount[c]! * w;
        totalUnitsSum += total * w;
        if (total > maxUnits) maxUnits = total;
      }
      return;
    }

    for (let st = 0; st < strip.length; st++) {
      let n = 0;
      let settled = prevSettled;
      let settledN = prevSettledLines;
      const wNode = wAcc[d]! * strip.weights[st]!;
      for (let k = 0; k < prevN; k++) {
        const l = d === 0 ? k : alive[(d - 1) * L + k]!;
        if (step(d, l, v[st * ROWS + lineRows[l]![d]!]!)) {
          alive[d * L + n++] = l;
        } else {
          const o = d * L + l;
          const pv = finalPay(lw[o]!, tg[o]!, rn[o]!, hw[o]!);
          if (pv > 0) {
            settled += pv;
            settledN++;
            // Credit the symbol for every combination below this node at once.
            symbolUnits[paySym[0]!]! += pv * winMult * wNode * tailWeight[d + 1]!;
          }
        }
      }
      aliveN[d] = n;
      settledUnits[d] = settled;
      settledLines[d] = settledN;
      scAcc[d + 1] = scAcc[d]! + scd[st]!;
      wAcc[d + 1] = wNode;
      descend(d + 1);
    }
  };

  descend(0);

  const combinations = tailWeight[0]!;
  return {
    mode: modeName,
    reelSet: mode.reelSet.name,
    combinations,
    maxScatter,
    maxUnits,
    weight: weight.subarray(0, (maxUnits + 1) * S).slice(),
    lineWinCombinations,
    winningLines,
    symbolUnits,
    scatterUnits: scatterUnitsSum,
    totalUnits: totalUnitsSum,
    elapsedMs: performance.now() - t0,
  };
}
