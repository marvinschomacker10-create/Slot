import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * `vite build` produces a normal multi-file build in dist/ (Phaser in its own chunk).
 * `vite build --mode standalone` inlines everything - scripts, styles, the pixel font,
 * the simulation worker and the favicon - into one HTML file in dist-standalone/,
 * which scripts/build-standalone.ts copies to the repository root as index.html.
 */
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    root: here('./web'),
    publicDir: false,
    plugins: [react(), ...(standalone ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    server: { port: 5173, strictPort: false },
    preview: { port: 4173 },
    build: {
      outDir: here(standalone ? './dist-standalone' : './dist'),
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: !standalone,
      chunkSizeWarningLimit: standalone ? 4000 : 1600,
      rollupOptions: standalone ? {} : { output: { manualChunks: { phaser: ['phaser'] } } },
    },
    // Classic (IIFE) worker: Chromium refuses module workers from blob: URLs on file:// pages,
    // and the inlined simulation worker must also run from a double-clicked index.html.
    worker: { format: 'iife' },
  };
});
