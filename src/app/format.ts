const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Credits are integers; formatting never rounds an authoritative value. */
export function credits(n: number): string {
  return intFmt.format(n);
}

export function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function multiple(x: number, digits = 2): string {
  return `${x.toLocaleString('en-US', { maximumFractionDigits: digits })}x`;
}

export function oneIn(p: number): string {
  return p > 0 ? `1 in ${(1 / p).toLocaleString('en-US', { maximumFractionDigits: p > 0.01 ? 1 : 0 })}` : 'n/a';
}

export function probability(p: number): string {
  if (p === 0) return '0';
  return p >= 0.001 ? pct(p, 3) : p.toExponential(2);
}
