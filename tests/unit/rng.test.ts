import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compileGame } from '../../src/config';
import { drawStop, physicalStopFromVirtual } from '../../src/game/reels';
import {
  CryptoRandomSource,
  SeededRandomSource,
  createRandomSource,
  deriveSeed,
  uniformInt,
  type RandomSource,
} from '../../src/rng';
import { cloneConfig, ScriptedRandom } from '../helpers';

describe('xoshiro128** seeded generator', () => {
  it('matches values derived by hand from the reference algorithm for state [1, 2, 3, 4]', () => {
    const rng = SeededRandomSource.fromState([1, 2, 3, 4]);
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual([11520, 0, 5927040]);
  });

  it('is deterministic per seed and differs between seeds and derived streams', () => {
    const a = new SeededRandomSource(42);
    const b = new SeededRandomSource(42);
    const c = new SeededRandomSource(43);
    const sa = Array.from({ length: 50 }, () => a.nextUint32());
    expect(Array.from({ length: 50 }, () => b.nextUint32())).toEqual(sa);
    expect(Array.from({ length: 50 }, () => c.nextUint32())).not.toEqual(sa);
    expect(deriveSeed('x', 1)).not.toBe(deriveSeed('x', 2));
  });

  it('round-trips its state and rejects the all-zero state', () => {
    const a = new SeededRandomSource('s');
    a.nextUint32();
    const st = a.getState();
    const b = SeededRandomSource.fromState(st);
    expect(b.nextUint32()).toBe(a.nextUint32());
    expect(() => SeededRandomSource.fromState([0, 0, 0, 0])).toThrow();
  });

  it('produces values in [0, 2^32)', () => {
    const r = new SeededRandomSource(1);
    for (let i = 0; i < 10_000; i++) {
      const x = r.nextUint32();
      expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true);
    }
  });
});

describe('uniformInt (rejection sampling)', () => {
  it('rejects values in the biased top block', () => {
    // n = 3: 2^32 mod 3 = 1, so the limit is 2^32 - 1 and 0xFFFFFFFF must be rejected.
    const rng = new ScriptedRandom([0xffffffff, 7]);
    expect(uniformInt(rng, 3)).toBe(7 % 3);
    expect(rng.consumed).toBe(2);
  });

  it('accepts the largest unbiased value', () => {
    const n = 40;
    const limit = 2 ** 32 - (2 ** 32 % n);
    const rng = new ScriptedRandom([limit - 1]);
    expect(uniformInt(rng, n)).toBe((limit - 1) % n);
    const rej = new ScriptedRandom([limit, 5]);
    expect(uniformInt(rej, n)).toBe(5);
    expect(rej.consumed).toBe(2);
  });

  it('every residue has exactly floor(2^32 / n) accepted pre-images (exact uniformity)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (n) => {
        const limit = 2 ** 32 - (2 ** 32 % n);
        // Accepted values are 0..limit-1, which is an exact multiple of n.
        return limit % n === 0 && limit / n === Math.floor(2 ** 32 / n);
      }),
    );
  });

  it('validates its argument', () => {
    const r = new SeededRandomSource(1);
    expect(() => uniformInt(r, 0)).toThrow(RangeError);
    expect(() => uniformInt(r, 2.5)).toThrow(RangeError);
    expect(() => uniformInt(r, 2 ** 32 + 1)).toThrow(RangeError);
    expect(uniformInt(r, 1)).toBe(0);
  });

  it('passes a chi-square uniformity check on 40 cells (seeded, 400k draws)', () => {
    const r = new SeededRandomSource('chi');
    const n = 40;
    const draws = 400_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < draws; i++) counts[uniformInt(r, n)]!++;
    const e = draws / n;
    const chi2 = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
    // 39 degrees of freedom: the 99.9th percentile is about 72.1.
    expect(chi2).toBeLessThan(72.1);
  });
});

describe('crypto random source', () => {
  it('uses crypto.getRandomValues and buffers values', () => {
    let calls = 0;
    const fake = {
      getRandomValues<T extends ArrayBufferView | null>(arr: T): T {
        calls++;
        const u = arr as unknown as Uint32Array;
        for (let i = 0; i < u.length; i++) u[i] = i;
        return arr;
      },
    } as unknown as Crypto;
    const r = new CryptoRandomSource(fake);
    expect(r.nextUint32()).toBe(0);
    expect(r.nextUint32()).toBe(1);
    expect(calls).toBe(1);
    expect(r.kind).toBe('crypto');
  });

  it('works with the platform CSPRNG and is the default when no seed is given', () => {
    const r = createRandomSource();
    expect(r.kind).toBe('crypto');
    const values = new Set(Array.from({ length: 100 }, () => r.nextUint32()));
    expect(values.size).toBeGreaterThan(95);
    expect(createRandomSource({ seed: 1 }).kind).toBe('seeded');
  });

  it('fails clearly without Web Crypto', () => {
    expect(() => new CryptoRandomSource({} as Crypto)).toThrow(/Web Crypto/);
  });
});

describe('RNG to reel position mapping', () => {
  it('maps an unweighted strip one-to-one', () => {
    const g = compileGame(cloneConfig());
    const strip = g.modes.base.reelSet.strips[0]!;
    for (let v = 0; v < strip.length; v++) expect(physicalStopFromVirtual(strip, v)).toBe(v);
    const rng = new ScriptedRandom([17]);
    expect(drawStop(strip, rng)).toBe(17);
  });

  it('gives each physical stop exactly its weight in virtual positions', () => {
    const c = cloneConfig();
    const weights = c.reelSets.base![0]!.symbols.map((_, i) => 1 + ((i * 7) % 5));
    c.reelSets.base![0]!.weights = weights;
    const strip = compileGame(c).modes.base.reelSet.strips[0]!;
    const counts = new Array<number>(strip.length).fill(0);
    for (let v = 0; v < strip.totalWeight; v++) counts[physicalStopFromVirtual(strip, v)]!++;
    expect(counts).toEqual(weights);
    expect(() => physicalStopFromVirtual(strip, strip.totalWeight)).toThrow(RangeError);
    expect(() => physicalStopFromVirtual(strip, -1)).toThrow(RangeError);
  });

  it('draws stops only through the RNG (same values -> same stops)', () => {
    const g = compileGame(cloneConfig());
    const strip = g.modes.base.reelSet.strips[2]!;
    const seq = (rng: RandomSource) => Array.from({ length: 20 }, () => drawStop(strip, rng));
    expect(seq(new SeededRandomSource(9))).toEqual(seq(new SeededRandomSource(9)));
  });
});
