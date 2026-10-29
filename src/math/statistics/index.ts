/**
 * Statistical helpers for simulation reports. Pure functions, no dependencies.
 */

/** Mergeable running mean/variance (Welford, merged with Chan et al.'s parallel formula). */
export interface RunningMoments {
  n: number;
  mean: number;
  m2: number;
}

export function emptyMoments(): RunningMoments {
  return { n: 0, mean: 0, m2: 0 };
}

export function pushMoment(m: RunningMoments, x: number): void {
  m.n += 1;
  const delta = x - m.mean;
  m.mean += delta / m.n;
  m.m2 += delta * (x - m.mean);
}

export function mergeMoments(a: RunningMoments, b: RunningMoments): RunningMoments {
  if (a.n === 0) return { ...b };
  if (b.n === 0) return { ...a };
  const n = a.n + b.n;
  const delta = b.mean - a.mean;
  return { n, mean: a.mean + (delta * b.n) / n, m2: a.m2 + b.m2 + (delta * delta * a.n * b.n) / n };
}

export function variance(m: RunningMoments): number {
  return m.n > 1 ? m.m2 / (m.n - 1) : 0;
}

export function stdDev(m: RunningMoments): number {
  return Math.sqrt(variance(m));
}

/**
 * Inverse of the standard normal CDF (P. J. Acklam's rational approximation,
 * relative error below 1.15e-9 over (0, 1)).
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)');
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  return x;
}

/** Complementary error function (Chebyshev fit from Numerical Recipes "erfcc"; fractional error < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** Two-sided critical value z_{1-(1-confidence)/2}. */
export function zCritical(confidence: number): number {
  return normalQuantile(1 - (1 - confidence) / 2);
}

/**
 * Student-t quantile via the Cornish-Fisher expansion around the normal quantile
 * (Abramowitz & Stegun 26.7.5). Accurate to ~1e-3 for df >= 4, ample for interval widths.
 */
export function tQuantile(p: number, df: number): number {
  if (df <= 0) throw new RangeError('df must be positive');
  const z = normalQuantile(p);
  const z3 = z ** 3;
  const z5 = z ** 5;
  const z7 = z ** 7;
  const z9 = z ** 9;
  return (
    z +
    (z3 + z) / (4 * df) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3) +
    (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / (92160 * df ** 4)
  );
}

export interface Interval {
  readonly low: number;
  readonly high: number;
}

/** Normal-approximation interval for a mean (valid by the CLT for i.i.d. observations with finite variance). */
export function meanInterval(mean: number, sd: number, n: number, confidence = 0.95): Interval {
  const half = n > 0 ? (zCritical(confidence) * sd) / Math.sqrt(n) : Infinity;
  return { low: mean - half, high: mean + half };
}

/** Wilson score interval for a binomial proportion. Well-behaved for small counts, including zero. */
export function wilsonInterval(successes: number, n: number, confidence = 0.95): Interval {
  if (n === 0) return { low: 0, high: 1 };
  const z = zCritical(confidence);
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  // The bounds are exactly 0 / 1 at the extremes; avoid floating-point residue there.
  return {
    low: successes === 0 ? 0 : Math.max(0, centre - half),
    high: successes === n ? 1 : Math.min(1, centre + half),
  };
}

/** Batch-means interval: treats each batch mean as one observation (t distribution with k-1 df). */
export function batchMeansInterval(
  batchMeans: readonly number[],
  weights: readonly number[],
  confidence = 0.95,
): Interval & { batches: number } {
  const k = batchMeans.length;
  if (k < 2) return { low: -Infinity, high: Infinity, batches: k };
  const totalW = weights.reduce((a, b) => a + b, 0);
  const mean = batchMeans.reduce((a, m, i) => a + m * weights[i]!, 0) / totalW;
  // Equal-size batches are the intended use; weights only correct a smaller final batch.
  let ss = 0;
  for (let i = 0; i < k; i++) ss += (weights[i]! / (totalW / k)) * (batchMeans[i]! - mean) ** 2;
  const se = Math.sqrt(ss / (k - 1) / k);
  const t = tQuantile(1 - (1 - confidence) / 2, k - 1);
  return { low: mean - t * se, high: mean + t * se, batches: k };
}

/**
 * Number of independent trials needed so that a proportion p is estimated with
 * relative half-width `relativeError` at the given confidence (normal approximation).
 */
export function trialsForRelativePrecision(p: number, relativeError: number, confidence = 0.95): number {
  if (p <= 0) return Infinity;
  const z = zCritical(confidence);
  return Math.ceil((z * z * (1 - p)) / (p * relativeError * relativeError));
}

/** Two-sided p-value of a z statistic. */
export function twoSidedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}
