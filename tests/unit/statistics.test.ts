import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FFT, convolveDirect, lumpAtCap, nextPow2 } from '../../src/math/exact-analysis/fft';
import {
  batchMeansInterval,
  emptyMoments,
  mergeMoments,
  meanInterval,
  normalCdf,
  normalQuantile,
  pushMoment,
  stdDev,
  tQuantile,
  trialsForRelativePrecision,
  variance,
  wilsonInterval,
} from '../../src/math/statistics';

describe('running moments', () => {
  it('match a two-pass computation and merge exactly', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -1e3, max: 1e3, noNaN: true }), { minLength: 2, maxLength: 200 }), fc.nat(), (xs, cut) => {
        const k = cut % xs.length;
        const all = emptyMoments();
        const a = emptyMoments();
        const b = emptyMoments();
        xs.forEach((x, i) => {
          pushMoment(all, x);
          pushMoment(i < k ? a : b, x);
        });
        const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
        const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
        const merged = mergeMoments(a, b);
        expect(all.mean).toBeCloseTo(mean, 8);
        expect(variance(all)).toBeCloseTo(v, 6);
        expect(merged.n).toBe(xs.length);
        expect(merged.mean).toBeCloseTo(mean, 8);
        expect(variance(merged)).toBeCloseTo(v, 6);
      }),
    );
  });
});

describe('distributions and intervals', () => {
  it('normal quantiles match reference values', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963985, 8);
    expect(normalQuantile(0.995)).toBeCloseTo(2.575829304, 8);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 12);
    expect(normalQuantile(1e-6)).toBeCloseTo(-4.753424309, 7);
    expect(normalCdf(1.959963985)).toBeCloseTo(0.975, 6);
    expect(() => normalQuantile(1)).toThrow(RangeError);
  });

  it('t quantiles match reference values', () => {
    expect(tQuantile(0.975, 9)).toBeCloseTo(2.262157, 2);
    expect(tQuantile(0.975, 30)).toBeCloseTo(2.042272, 3);
    expect(tQuantile(0.975, 999)).toBeCloseTo(1.962341, 4);
  });

  it('Wilson intervals match reference values and handle zero counts', () => {
    const w = wilsonInterval(50, 100);
    expect(w.low).toBeCloseTo(0.403832, 5);
    expect(w.high).toBeCloseTo(0.596168, 5);
    const z = wilsonInterval(0, 1000);
    expect(z.low).toBe(0);
    expect(z.high).toBeGreaterThan(0.003);
    expect(z.high).toBeLessThan(0.0045);
  });

  it('mean and batch-means intervals are centred and scale with 1/sqrt(n)', () => {
    const a = meanInterval(1, 2, 100);
    const b = meanInterval(1, 2, 400);
    expect((a.high - a.low) / (b.high - b.low)).toBeCloseTo(2, 10);
    const batches = batchMeansInterval([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], new Array(10).fill(1));
    expect((batches.low + batches.high) / 2).toBeCloseTo(5.5, 10);
    expect(batches.batches).toBe(10);
  });

  it('computes the trials needed for a relative precision', () => {
    // p = 0.01, +/-10% at 95%: 1.959964^2 * 0.99 / (0.01 * 0.1)^2 = 38,030.44 -> 38,031
    expect(trialsForRelativePrecision(0.01, 0.1)).toBe(38031);
    expect(trialsForRelativePrecision(0, 0.1)).toBe(Infinity);
    expect(stdDev(emptyMoments())).toBe(0);
  });
});

describe('FFT convolution', () => {
  it('matches direct convolution', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 60 }), fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 60 }), (a, b) => {
        const fft = new FFT(nextPow2(a.length + b.length));
        const viaFft = fft.inverseProduct(fft.forwardReal(a), fft.forwardReal(b));
        const direct = convolveDirect(a, b);
        direct.forEach((v, i) => expect(Math.abs(viaFft[i]! - v)).toBeLessThan(1e-12));
      }),
      { numRuns: 200 },
    );
  });

  it('lumps mass at or above the cap without losing probability', () => {
    const pmf = [0.1, 0.2, 0.3, 0.25, 0.15];
    const l = lumpAtCap(pmf, 2);
    expect(Array.from(l)).toEqual([0.1, 0.2, 0.3 + 0.25 + 0.15]);
    expect(Array.from(lumpAtCap([-1e-18, 0.5, 0.5], 5)).slice(0, 3)).toEqual([0, 0.5, 0.5]);
    expect(() => new FFT(6)).toThrow(RangeError);
  });

  it('capped sums: min(x + y, cap) equals lumping before and after the convolution', () => {
    const x = [0.5, 0.2, 0.2, 0.1];
    const y = [0.4, 0.3, 0.2, 0.1];
    const cap = 3;
    const exact = new Array(cap + 1).fill(0);
    x.forEach((px, i) => y.forEach((py, j) => (exact[Math.min(i + j, cap)] += px * py)));
    const lumped = lumpAtCap(convolveDirect(lumpAtCap(x, cap), lumpAtCap(y, cap)), cap);
    lumped.forEach((v, i) => expect(v).toBeCloseTo(exact[i], 15));
  });
});
