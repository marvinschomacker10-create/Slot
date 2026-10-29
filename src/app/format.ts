const intFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** Credits are integers; formatting never rounds an authoritative value. */
export function credits(n: number): string {
  return intFmt.format(n);
}

function decimal(x: number, digits: number): string {
  return x.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pct(x: number, digits = 2): string {
  return `${decimal(x * 100, digits)} %`;
}

export function multiple(x: number, digits = 2): string {
  return `${x.toLocaleString('de-DE', { maximumFractionDigits: digits })}×`;
}

export function oneIn(p: number): string {
  return p > 0 ? `1 zu ${(1 / p).toLocaleString('de-DE', { maximumFractionDigits: p > 0.01 ? 1 : 0 })}` : 'k. A.';
}

export function probability(p: number): string {
  if (p === 0) return '0';
  return p >= 0.001 ? pct(p, 3) : p.toExponential(2).replace('.', ',');
}
