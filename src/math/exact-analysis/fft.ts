/**
 * Iterative radix-2 complex FFT on Float64Arrays, used to convolve probability
 * mass functions on an integer payout grid. Round-off is O(1e-16) relative to the
 * largest mass; the analysis clamps the resulting tiny negative values to zero
 * and reports the total-mass error.
 */
export class FFT {
  readonly size: number;
  private readonly rev: Uint32Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new RangeError('FFT size must be a power of two >= 2');
    this.size = size;
    const bits = Math.log2(size);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >>> b) & 1) << (bits - 1 - b);
      this.rev[i] = r >>> 0;
    }
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((2 * Math.PI * i) / size);
    }
  }

  /** In-place transform. inverse=true computes the unnormalized inverse; `inverse()` divides by size. */
  transform(re: Float64Array, im: Float64Array, inverse = false): void {
    const n = this.size;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i]!;
      if (j > i) {
        let t = re[i]!;
        re[i] = re[j]!;
        re[j] = t;
        t = im[i]!;
        im[i] = im[j]!;
        im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const stride = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * stride]!;
          const wi = sign * this.sin[k * stride]!;
          const a = i + k;
          const b = a + half;
          const xr = re[b]! * wr - im[b]! * wi;
          const xi = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - xr;
          im[b] = im[a]! - xi;
          re[a] = re[a]! + xr;
          im[a] = im[a]! + xi;
        }
      }
    }
  }

  forwardReal(input: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
    const re = new Float64Array(this.size);
    const im = new Float64Array(this.size);
    for (let i = 0; i < input.length; i++) re[i] = input[i]!;
    this.transform(re, im, false);
    return { re, im };
  }

  /** Inverse of the pointwise product a * b, returning the real part (normalized). */
  inverseProduct(a: { re: Float64Array; im: Float64Array }, b: { re: Float64Array; im: Float64Array }): Float64Array {
    const n = this.size;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = a.re[i]! * b.re[i]! - a.im[i]! * b.im[i]!;
      im[i] = a.re[i]! * b.im[i]! + a.im[i]! * b.re[i]!;
    }
    this.transform(re, im, true);
    for (let i = 0; i < n; i++) re[i] = re[i]! / n;
    return re;
  }
}

export function nextPow2(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/**
 * Folds a pmf on 0..(len-1) into 0..cap by moving all mass at values >= cap onto
 * `cap`. Exact for capped sums of non-negative variables:
 * min(x + y, cap) = min(min(x, cap) + y, cap).
 */
export function lumpAtCap(pmf: ArrayLike<number>, cap: number, clampNegative = true): Float64Array {
  const out = new Float64Array(cap + 1);
  const n = Math.min(pmf.length, cap);
  for (let i = 0; i < n; i++) out[i] = pmf[i]!;
  let tail = 0;
  for (let i = cap; i < pmf.length; i++) tail += pmf[i]!;
  out[cap] = tail;
  if (clampNegative) for (let i = 0; i <= cap; i++) if (out[i]! < 0) out[i] = 0;
  return out;
}

/** Direct convolution for small inputs (reference implementation used in tests). */
export function convolveDirect(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    if (ai === 0) continue;
    for (let j = 0; j < b.length; j++) out[i + j]! += ai * b[j]!;
  }
  return out;
}
