import { symbolArt } from './theme';

/**
 * Rasterises symbol artwork into canvases before the scene starts. Works for
 * file URLs and inlined data URIs alike, and lets us pick the resolution.
 * Symbols without artwork (or whose artwork fails to load) are simply omitted;
 * the scene draws a labelled placeholder for them.
 */
export async function rasterizeSymbols(ids: readonly string[], size: number): Promise<Map<string, HTMLCanvasElement>> {
  const out = new Map<string, HTMLCanvasElement>();
  await Promise.all(
    ids.map(async (id) => {
      const url = symbolArt(id);
      if (!url) return;
      try {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
        out.set(id, canvas);
      } catch (e) {
        console.warn(`Symbol artwork for ${id} could not be loaded`, e);
      }
    }),
  );
  return out;
}
