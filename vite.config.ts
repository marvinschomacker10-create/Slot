import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Phaser is large and changes rarely; give it its own chunk so the game code stays small.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  worker: { format: 'es' },
});
