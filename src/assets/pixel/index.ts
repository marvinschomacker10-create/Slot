import { PIXEL_SPRITE_IDS, buildSprite } from './sprites';

/** SVG data URLs of the pixel-art symbols, keyed by symbol id (built once). */
export const PIXEL_ART: Readonly<Record<string, string>> = Object.fromEntries(
  PIXEL_SPRITE_IDS.map((id) => [
    id,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSprite(id)!.toSvg())}`,
  ]),
);
