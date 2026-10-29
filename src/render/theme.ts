import { PIXEL_ART } from '../assets/pixel';

/**
 * Presentation-only theme. Gameplay values never live here: the renderer gets
 * symbols, strips and paylines from the compiled configuration. Artwork is
 * looked up by symbol id, so replacing a sprite never touches game logic.
 */
export const SYMBOL_ART: Readonly<Record<string, string>> = PIXEL_ART;

/** Fallback art for symbols added to the configuration without artwork. */
export function symbolArt(id: string): string | undefined {
  return SYMBOL_ART[id];
}

/**
 * Payline colours (felt-tip pens). They are drawn with a dark outline so they stay visible
 * on the paper cells and on the chalkboard; every drawn line also carries its number, so
 * identity never relies on colour alone.
 */
export const PAYLINE_COLORS = [
  0xe63946, 0x1d6fe0, 0x2a9d47, 0xf77f00, 0x8e44ad, 0xd81b60, 0x0f8b8d, 0xb5651d, 0x5c6bc0, 0xc9a400,
] as const;

export function paylineColor(lineIndex: number): number {
  return PAYLINE_COLORS[lineIndex % PAYLINE_COLORS.length]!;
}

export function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** Classroom palette used by the reel scene. */
export const SCHOOL = {
  woodLight: 0xb47a45,
  wood: 0x8a5530,
  woodDark: 0x5a3518,
  woodDeep: 0x2e1a0a,
  board: 0x2f4a3a,
  boardDark: 0x1f3428,
  chalk: 0xf4f1e6,
  chalkYellow: 0xffd166,
  redPen: 0xd62828,
  outline: 0x1c1410,
} as const;

/** Pixel font used for every text drawn by the renderer and the UI. */
export const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';
