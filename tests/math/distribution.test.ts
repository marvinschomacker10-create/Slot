import { describe, expect, it } from 'vitest';
import { compileGame, type CompiledGame } from '../../src/config';
import type { GameMode } from '../../src/config/types';
import { outcomeFromStops } from '../../src/game/engine';
import { computeRoundDistribution } from '../../src/math/exact-analysis/distribution';
import { analyzeMarginals } from '../../src/math/exact-analysis/marginal';
import { analyzeGame } from '../../src/math/exact-analysis/analysis';
import { toyConfig } from '../fixtures/toy-config';

/** Per-spin pmf split by award, computed by brute force through the engine (independent of enumerate.ts). */
function spinPmfByAward(g: CompiledGame, mode: GameMode): Map<number, Map<number, number>> {
  const strips = g.modes[mode].reelSet.strips;
  const total = strips.reduce((a, s) => a * s.totalWeight, 1);
  const out = new Map<number, Map<number, number>>();
  const stops = new Array<number>(g.reels).fill(0);
  const rec = (reel: number, w: number) => {
    if (reel === g.reels) {
      const o = outcomeFromStops(g, mode, stops, 1);
      const award = mode === 'free' && !g.retriggerEnabled ? 0 : o.scatter.freeSpinsAwarded;
      const m = out.get(award) ?? new Map<number, number>();
      m.set(o.totalUnits, (m.get(o.totalUnits) ?? 0) + w / total);
      out.set(award, m);
      return;
    }
    for (let i = 0; i < strips[reel]!.length; i++) {
      stops[reel] = i;
      rec(reel + 1, w * strips[reel]!.weights[i]!);
    }
  };
  rec(0, 1);
  return out;
}

/** Direct (non-FFT) dynamic programme over (spins played, spins awarded, capped win). */
function directRoundPmf(g: CompiledGame): Float64Array {
  const cap = g.maxWinMultiplier! * g.lineCount;
  const base = spinPmfByAward(g, 'base');
  const free = spinPmfByAward(g, 'free');
  const max = g.maxTotalFreeSpins!;
  const featureMemo = new Map<string, Float64Array>();
  // Distribution of the remaining feature win given (played, awarded).
  const feature = (played: number, awarded: number): Float64Array => {
    const key = `${played}/${awarded}`;
    const hit = featureMemo.get(key);
    if (hit) return hit;
    const res = new Float64Array(cap + 1);
    if (played === awarded) res[0] = 1;
    else {
      for (const [e, pmf] of free) {
        const next = feature(played + 1, Math.min(max, awarded + e));
        for (const [u, p] of pmf)
          for (let v = 0; v <= cap; v++) if (next[v]) res[Math.min(cap, u + v)]! += p * next[v]!;
      }
    }
    featureMemo.set(key, res);
    return res;
  };
  const round = new Float64Array(cap + 1);
  for (const [a, pmf] of base) {
    const f = a > 0 ? feature(0, Math.min(max, a)) : Float64Array.of(1);
    for (const [u, p] of pmf) for (let v = 0; v < f.length; v++) if (f[v]) round[Math.min(cap, u + v)]! += p * f[v]!;
  }
  return round;
}

describe('exact round distribution', () => {
  it('FFT propagation matches an independent direct dynamic programme (capped toy game)', () => {
    const g = compileGame(toyConfig());
    const dist = computeRoundDistribution(g);
    const direct = directRoundPmf(g);
    let maxDiff = 0;
    for (let i = 0; i < direct.length; i++) maxDiff = Math.max(maxDiff, Math.abs(direct[i]! - dist.roundPmf[i]!));
    expect(maxDiff).toBeLessThan(1e-12);
    // The toy cap is reachable, so the lumped cap cell carries real probability.
    expect(dist.roundPmf[dist.horizon]!).toBeGreaterThan(1e-4);
    expect(Math.abs(dist.massError)).toBeLessThan(1e-12);
  });

  it('capped mean is below the uncapped (Wald) mean exactly by the cap effect', () => {
    const g = compileGame(toyConfig());
    const a = analyzeGame(g);
    const m = analyzeMarginals(g);
    expect(a.rtp.totalUncapped).toBeCloseTo(m.rtpUncapped.total, 12);
    expect(a.rtp.total).toBeLessThan(m.rtpUncapped.total);
    expect(a.rtp.capEffect).toBeGreaterThan(0);
    // Without a cap, the grid is sized to the largest reachable payout, so the two coincide.
    const uncapped = compileGame(toyConfig({ noCap: true }));
    const dist = computeRoundDistribution(uncapped);
    expect(dist.horizonCoversAllOutcomes).toBe(true);
    const au = analyzeGame(uncapped, { distribution: dist });
    expect(Math.abs(au.rtp.total - au.rtp.totalUncapped)).toBeLessThan(1e-12 * au.rtp.total);
    // A horizon below the reachable maximum truncates: the mean becomes a lower bound.
    const short = computeRoundDistribution(uncapped, { uncappedHorizonMultiplier: 1000 });
    expect(short.horizonCoversAllOutcomes).toBe(false);
    expect(analyzeGame(uncapped, { distribution: short }).rtp.total).toBeLessThan(au.rtp.total);
  });

  it('handles unlimited retriggers by truncating negligible mass', () => {
    const g = compileGame(toyConfig({ unlimitedRetriggers: true, noCap: true }));
    const m = analyzeMarginals(g);
    const f = m.features[0]!;
    // Branching-process identity: E[spins] = a0 / (1 - E[award per spin]) when awards are 2 per qualifying spin.
    const q = m.free.awardProbability;
    expect(f.expectedSpins).toBeCloseTo(f.initialAward / (1 - 2 * q), 8);
    expect(f.unresolvedMass).toBeLessThan(1e-15);
  });

  it('feature spin-count distribution sums to one and respects the limit', () => {
    const g = compileGame(toyConfig());
    const m = analyzeMarginals(g);
    for (const f of m.features) {
      const total = f.spinsPmf.reduce((a, s) => a + s.probability, 0);
      expect(total).toBeCloseTo(1, 12);
      expect(Math.max(...f.spinsPmf.map((s) => s.spins))).toBeLessThanOrEqual(9);
    }
  });
});
