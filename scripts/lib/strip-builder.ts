/**
 * Reel-strip design aid. Turns per-reel symbol counts into an ordered strip using a
 * seeded, constrained arrangement:
 *  - the same symbol never occupies two adjacent stops (including the wrap-around);
 *  - consecutive Scatters are at least `rows` stops apart, so one reel never shows two;
 *  - consecutive Wilds are at least `wildGap` stops apart.
 * The resulting strips are written verbatim into config/game.config.json; the game
 * never generates strips at runtime. Kept in the repository so the design is reproducible.
 */
import { SeededRandomSource, uniformInt } from '../../src/rng';

export interface StripDesign {
  counts: Record<string, number>;
}

export interface ArrangeOptions {
  seed: string;
  rows: number;
  scatter: string;
  wild: string;
  wildGap?: number;
  maxAttempts?: number;
}

function cyclicGapOk(strip: string[], symbol: string, minGap: number): boolean {
  const idx = strip.flatMap((s, i) => (s === symbol ? [i] : []));
  if (idx.length < 2) return true;
  for (let k = 0; k < idx.length; k++) {
    const a = idx[k]!;
    const b = idx[(k + 1) % idx.length]!;
    const gap = (b - a + strip.length) % strip.length || strip.length;
    if (gap < minGap) return false;
  }
  return true;
}

export function arrangeStrip(counts: Record<string, number>, opts: ArrangeOptions): string[] {
  const rng = new SeededRandomSource(opts.seed);
  const length = Object.values(counts).reduce((a, b) => a + b, 0);
  const wildGap = opts.wildGap ?? 2;
  const maxAttempts = opts.maxAttempts ?? 20000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = new Map(Object.entries(counts).filter(([, c]) => c > 0));
    const strip: string[] = [];
    let ok = true;
    while (strip.length < length) {
      const pos = strip.length;
      const candidates: [string, number][] = [];
      for (const [sym, c] of remaining) {
        if (strip[pos - 1] === sym) continue;
        if (pos === length - 1 && strip[0] === sym) continue;
        const minGap = sym === opts.scatter ? opts.rows : sym === opts.wild ? wildGap : 1;
        let clash = false;
        for (let d = 1; d < minGap; d++) {
          if (strip[pos - d] === sym) clash = true;
          if (pos + d >= length && strip[pos + d - length] === sym) clash = true;
        }
        if (!clash) candidates.push([sym, c]);
      }
      if (candidates.length === 0) {
        ok = false;
        break;
      }
      const total = candidates.reduce((a, [, c]) => a + c, 0);
      let pick = uniformInt(rng, total);
      let chosen = candidates[0]![0];
      for (const [sym, c] of candidates) {
        if (pick < c) {
          chosen = sym;
          break;
        }
        pick -= c;
      }
      strip.push(chosen);
      const left = remaining.get(chosen)! - 1;
      if (left === 0) remaining.delete(chosen);
      else remaining.set(chosen, left);
    }
    if (ok && cyclicGapOk(strip, opts.scatter, opts.rows) && cyclicGapOk(strip, opts.wild, wildGap)) return strip;
  }
  throw new Error(`could not arrange strip with counts ${JSON.stringify(counts)}`);
}
