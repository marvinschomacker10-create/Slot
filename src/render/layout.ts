/**
 * Pure geometry and timing for the reel presentation. Nothing here can affect an
 * outcome: these functions only decide where and when already-settled symbols are drawn.
 */

export interface ReelLayout {
  readonly width: number;
  readonly height: number;
  readonly reels: number;
  readonly rows: number;
  /** Side length of one symbol cell, in canvas pixels. */
  readonly cell: number;
  /** Top-left corner of reel 0, row 0. */
  readonly originX: number;
  readonly originY: number;
  /** Horizontal distance between neighbouring reel columns (cell + gutter). */
  readonly pitch: number;
  readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

export function computeLayout(width: number, height: number, reels: number, rows: number, scale = 1): ReelLayout {
  const pad = Math.max(10 * scale, Math.min(width, height) * 0.035);
  const gutterRatio = 0.06;
  const byWidth = (width - 2 * pad) / (reels + (reels - 1) * gutterRatio);
  const byHeight = (height - 2 * pad) / rows;
  const cell = Math.max(8, Math.floor(Math.min(byWidth, byHeight)));
  const pitch = cell * (1 + gutterRatio);
  const gridW = pitch * (reels - 1) + cell;
  const gridH = cell * rows;
  const originX = (width - gridW) / 2;
  const originY = (height - gridH) / 2;
  const fp = cell * 0.08;
  return {
    width,
    height,
    reels,
    rows,
    cell,
    originX,
    originY,
    pitch,
    frame: { x: originX - fp, y: originY - fp, w: gridW + 2 * fp, h: gridH + 2 * fp },
  };
}

export function cellCenter(l: ReelLayout, reel: number, row: number): { x: number; y: number } {
  return { x: l.originX + reel * l.pitch + l.cell / 2, y: l.originY + row * l.cell + l.cell / 2 };
}

/** easeOutBack with a configurable overshoot: e(0)=0, e(1)=1, e'(0) = overshoot + 3. */
export function easeOutBack(u: number, overshoot = 1.0): number {
  const c3 = overshoot + 1;
  const x = Math.min(1, Math.max(0, u)) - 1;
  return 1 + c3 * x * x * x + overshoot * x * x;
}

export interface SpinTiming {
  /** Reel speed while spinning, in cells per second. */
  readonly speed: number;
  /** Time (ms after the spin starts) at which each reel begins to stop. */
  readonly stopAt: readonly number[];
  /** Reels that get an extended "anticipation" spin because a feature is possible. */
  readonly anticipation: readonly boolean[];
  /** Overshoot of the landing bounce. */
  readonly overshoot: number;
}

export type AnimationSpeed = 'normal' | 'turbo';

/**
 * Plans reel timing. Anticipation is purely cosmetic: when the reels that have
 * already landed show `anticipateFrom` or more scatters, the remaining reels spin longer.
 */
export function planSpinTiming(
  scattersPerReel: readonly number[],
  speed: AnimationSpeed,
  anticipateFrom: number,
): SpinTiming {
  const turbo = speed === 'turbo';
  const base = turbo ? 200 : 520;
  const stagger = turbo ? 70 : 170;
  const extra = turbo ? 250 : 750;
  const stopAt: number[] = [];
  const anticipation: boolean[] = [];
  let seen = 0;
  let delay = 0;
  for (let reel = 0; reel < scattersPerReel.length; reel++) {
    const anticipate = anticipateFrom > 0 && seen >= anticipateFrom;
    if (anticipate) delay += extra;
    anticipation.push(anticipate);
    stopAt.push(base + reel * stagger + delay);
    seen += scattersPerReel[reel]!;
  }
  return { speed: turbo ? 52 : 30, stopAt, anticipation, overshoot: turbo ? 0.6 : 1.0 };
}

/**
 * Tape model of one reel. At scroll position s, visible row r shows tape index
 * j = r - s (j decreases upwards), so increasing s moves symbols down. A segment
 * maps tape indices j >= minJ to strip[(anchor + j) mod length].
 */
export interface TapeSegment {
  readonly minJ: number;
  readonly strip: readonly string[];
  readonly anchor: number;
}

export function tapeSymbol(segments: readonly TapeSegment[], j: number): string {
  for (const seg of segments) {
    if (j >= seg.minJ) {
      const L = seg.strip.length;
      return seg.strip[(((seg.anchor + j) % L) + L) % L]!;
    }
  }
  const last = segments[segments.length - 1]!;
  const L = last.strip.length;
  return last.strip[(((last.anchor + j) % L) + L) % L]!;
}

/**
 * Plans the landing of a spinning reel at physical stop `stop`. Returns the end
 * position (an integer) and the tape after landing. Tape cells that may already be
 * visible keep their current symbols; cells further up come from the target strip,
 * so that at the end position row r shows strip[(stop + r) mod length] exactly.
 */
export function planLanding(
  current: readonly TapeSegment[],
  position: number,
  strip: readonly string[],
  stop: number,
  rows: number,
  extraCells = 1,
): { end: number; segments: TapeSegment[] } {
  const end = Math.ceil(position) + rows + extraCells;
  const split = Math.floor(-position);
  const kept = current.map((s) => ({ ...s, minJ: Math.max(s.minJ, split) }));
  return { end, segments: [...kept, { minJ: -Infinity, strip, anchor: stop + end }] };
}
