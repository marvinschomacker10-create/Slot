/**
 * Random number generation.
 *
 * The engine only ever consumes uniformly distributed unsigned 32-bit integers
 * through `RandomSource`. Mapping to discrete reel positions happens in
 * `uniformInt` (rejection sampling, no modulo bias) and is the only place where
 * random values are turned into game-relevant numbers. Payout evaluation never
 * sees the RNG; it receives the resulting reel stops.
 *
 * - `CryptoRandomSource` is used for real play in the prototype. It reads from
 *   the Web Crypto API (`crypto.getRandomValues`), which is a CSPRNG in modern
 *   browsers and in Node.js.
 * - `SeededRandomSource` (xoshiro128**) is deterministic and exists only for
 *   automated tests, development reproduction and reproducible simulations.
 *   It is NOT cryptographically secure and must never drive real play.
 */

export type RngKind = 'crypto' | 'seeded';

export interface RandomSource {
  readonly kind: RngKind;
  /** A uniformly distributed integer in [0, 2^32). */
  nextUint32(): number;
  describe(): string;
}

const TWO_POW_32 = 0x1_0000_0000;

/**
 * Uniform integer in [0, n) using rejection sampling.
 *
 * Values in the top partial block [2^32 - (2^32 mod n), 2^32) are discarded, so
 * every residue class has exactly floor(2^32 / n) pre-images and the result is
 * exactly uniform (given a uniform source). The expected number of draws is
 * below 2 for any n <= 2^32 and practically 1 for reel-sized n.
 */
export function uniformInt(rng: RandomSource, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_POW_32) {
    throw new RangeError(`uniformInt: n must be an integer in [1, 2^32], got ${n}`);
  }
  if (n === 1) return 0;
  const limit = TWO_POW_32 - (TWO_POW_32 % n);
  for (;;) {
    const x = rng.nextUint32();
    if (x < limit) return x % n;
  }
}

/** Cryptographically secure source backed by `crypto.getRandomValues`, buffered for throughput. */
export class CryptoRandomSource implements RandomSource {
  readonly kind = 'crypto' as const;
  private readonly buffer = new Uint32Array(256);
  private index = this.buffer.length;
  private readonly crypto: Crypto;

  constructor(cryptoImpl: Crypto | undefined = globalThis.crypto) {
    if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
      throw new Error('CryptoRandomSource requires the Web Crypto API (crypto.getRandomValues)');
    }
    this.crypto = cryptoImpl;
  }

  nextUint32(): number {
    if (this.index >= this.buffer.length) {
      this.crypto.getRandomValues(this.buffer);
      this.index = 0;
    }
    return this.buffer[this.index++]!;
  }

  describe(): string {
    return 'Web Crypto getRandomValues (CSPRNG), rejection-sampled';
  }
}

/** 128-bit string hash (cyrb128) used to turn an arbitrary seed into generator state. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export type Seed = number | string;

/**
 * xoshiro128** 1.1 (Blackman & Vigna), period 2^128 - 1.
 * Deterministic: for development, tests and reproducible simulations only.
 */
export class SeededRandomSource implements RandomSource {
  readonly kind = 'seeded' as const;
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  readonly seed: string;

  constructor(seed: Seed) {
    this.seed = String(seed);
    const [a, b, c, d] = cyrb128(`gilded-orbit:${this.seed}`);
    this.s0 = a;
    this.s1 = b;
    this.s2 = c;
    this.s3 = d;
    if ((a | b | c | d) === 0) this.s0 = 1; // the all-zero state is a fixed point
  }

  /** Creates a generator from an explicit 128-bit state (used by known-answer tests). */
  static fromState(state: readonly [number, number, number, number]): SeededRandomSource {
    const rng = new SeededRandomSource('state');
    rng.setState(state);
    return rng;
  }

  getState(): [number, number, number, number] {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  setState(state: readonly [number, number, number, number]): void {
    if (state.every((x) => x >>> 0 === 0)) throw new Error('xoshiro128** state must not be all zero');
    [this.s0, this.s1, this.s2, this.s3] = state.map((x) => x >>> 0) as [number, number, number, number];
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  describe(): string {
    return `xoshiro128** seeded with "${this.seed}" (deterministic, NOT for real play)`;
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * Derives an independent sub-stream seed (e.g. one per simulation chunk) so that
 * results do not depend on how work is split across worker threads.
 */
export function deriveSeed(seed: Seed, stream: number): string {
  return `${String(seed)}/stream-${stream}`;
}

export function createRandomSource(options: { seed?: Seed | undefined } = {}): RandomSource {
  return options.seed === undefined ? new CryptoRandomSource() : new SeededRandomSource(options.seed);
}
