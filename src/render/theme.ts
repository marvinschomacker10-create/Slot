import amethyst from '../assets/symbols/amethyst.svg';
import comet from '../assets/symbols/comet.svg';
import jade from '../assets/symbols/jade.svg';
import moon from '../assets/symbols/moon.svg';
import planet from '../assets/symbols/planet.svg';
import ruby from '../assets/symbols/ruby.svg';
import sapphire from '../assets/symbols/sapphire.svg';
import scatter from '../assets/symbols/scatter.svg';
import sun from '../assets/symbols/sun.svg';
import wild from '../assets/symbols/wild.svg';

/**
 * Presentation-only theme. Gameplay values never live here: the renderer gets
 * symbols, strips and paylines from the compiled configuration. Artwork is
 * looked up by symbol id, so replacing an SVG never touches game logic.
 */
export const SYMBOL_ART: Readonly<Record<string, string>> = {
  JADE: jade,
  SAPPHIRE: sapphire,
  RUBY: ruby,
  AMETHYST: amethyst,
  COMET: comet,
  MOON: moon,
  PLANET: planet,
  SUN: sun,
  WILD: wild,
  SCATTER: scatter,
};

/** Fallback art for symbols added to the configuration without artwork. */
export function symbolArt(id: string): string | undefined {
  return SYMBOL_ART[id];
}

/** Payline colours; every drawn line also carries its number, so identity never relies on colour alone. */
export const PAYLINE_COLORS = [
  0xf5c542, 0x4fc3f7, 0xef5350, 0x66bb6a, 0xba68c8, 0xffa726, 0x26c6da, 0xec407a, 0x9ccc65, 0x7e57c2,
] as const;

export function paylineColor(lineIndex: number): number {
  return PAYLINE_COLORS[lineIndex % PAYLINE_COLORS.length]!;
}

export function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

export const GOLD = 0xe9c46a;
export const GOLD_DEEP = 0xb8892f;
export const FEATURE_ACCENT = 0xb388ff;
