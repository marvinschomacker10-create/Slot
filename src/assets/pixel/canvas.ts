/**
 * Minimal pixel-art raster. Sprites are drawn on a small grid (32 x 32) with simple
 * primitives and exported as SVG made of axis-aligned rectangles with
 * `shape-rendering="crispEdges"`, so they stay pixel-sharp at any size.
 */

export type Color = string;

export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  private readonly px: (Color | null)[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.px = new Array<Color | null>(width * height).fill(null);
  }

  get(x: number, y: number): Color | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.px[y * this.width + x]!;
  }

  set(x: number, y: number, c: Color | null): this {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.px[y * this.width + x] = c;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Color | null): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }

  /** Filled ellipse: every pixel whose centre lies inside. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color | null): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Filled polygon (even-odd rule on pixel centres). */
  polygon(points: readonly (readonly [number, number])[], c: Color | null): this {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = 0; x < this.width; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i]!;
          const [xj, yj] = points[j]!;
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: Color | null): this {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /**
   * Rasterises an object along the axis A -> B. For every pixel the callback gets the
   * distance along the axis `u` (0 at A, in pixels) and the signed distance from the
   * axis `v` (pixels) and returns a colour or null. Used for diagonal pencils and rulers.
   */
  along(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    shade: (u: number, v: number, len: number) => Color | null,
  ): this {
    const len = Math.hypot(bx - ax, by - ay);
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const u = px * dx + py * dy;
        const v = px * -dy + py * dx;
        if (u < 0 || u > len) continue;
        const c = shade(u, v, len);
        if (c) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Draws a small ASCII picture; characters missing from the legend are transparent. */
  ascii(x: number, y: number, rows: readonly string[], legend: Readonly<Record<string, Color>>): this {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        const c = legend[ch];
        if (c) this.set(x + i, y + j, c);
      });
    });
    return this;
  }

  /** Adds a one-pixel outline around every opaque region (4-neighbourhood). */
  outline(c: Color): this {
    const add: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }

  /** Writes text with the 5-pixel-high font below. */
  text(x: number, y: number, s: string, c: Color): this {
    let cx = x;
    for (const ch of s) {
      const glyph = FONT[ch];
      if (!glyph) throw new Error(`no pixel glyph for "${ch}"`);
      glyph.forEach((row, j) => [...row].forEach((g, i) => g === '#' && this.set(cx + i, y + j, c)));
      cx += glyph[0]!.length + 1;
    }
    return this;
  }

  static textWidth(s: string): number {
    return [...s].reduce((w, ch) => w + FONT[ch]![0]!.length + 1, -1);
  }

  /** SVG with one rectangle per horizontal run of equal colour. */
  toSvg(): string {
    const parts: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let x = 0;
      while (x < this.width) {
        const c = this.get(x, y);
        let end = x + 1;
        while (end < this.width && this.get(end, y) === c) end++;
        if (c) parts.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${c}"/>`);
        x = end;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" shape-rendering="crispEdges">${parts.join('')}</svg>`;
  }
}

/** 5-pixel-high glyphs (variable width). */
const FONT: Readonly<Record<string, readonly string[]>> = {
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  D: ['###.', '#..#', '#..#', '#..#', '###.'],
  A: ['.##.', '#..#', '####', '#..#', '#..#'],
  B: ['###.', '#..#', '###.', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '.###'],
  '1': ['.#', '##', '.#', '.#', '.#'],
  '+': ['...', '.#.', '###', '.#.', '...'],
};
