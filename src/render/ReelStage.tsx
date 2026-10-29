import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { SceneSetup } from './ReelScene';
import { ReelScene } from './ReelScene';
import type { ReelController } from './ReelController';
import { rasterizeSymbols } from './textures';

interface Props {
  readonly controller: ReelController;
  readonly setup: Omit<SceneSetup, 'devicePixelRatio' | 'symbolCanvases'>;
  readonly label: string;
}

/**
 * Mounts the Phaser game into a responsive container. The canvas is rendered at
 * device-pixel resolution and scaled down with CSS so symbols stay crisp on
 * high-DPI screens.
 */
export function ReelStage({ controller, setup, label }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let game: Phaser.Game | null = null;
    let observer: ResizeObserver | null = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => ({ w: Math.max(1, Math.round(el.clientWidth * dpr)), h: Math.max(1, Math.round(el.clientHeight * dpr)) });

    void rasterizeSymbols(setup.symbols, Math.round(256 * dpr)).then((symbolCanvases) => {
      if (cancelled) return;
      const { w, h } = size();
      const scene = new ReelScene({ ...setup, devicePixelRatio: dpr, symbolCanvases }, (s) => controller.attach(s));
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        transparent: true,
        width: w,
        height: h,
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
        render: { antialias: true, powerPreference: 'high-performance' },
        banner: false,
        audio: { noAudio: true },
        scene,
      });
      const g = game;
      observer = new ResizeObserver(() => {
        const s = size();
        if (s.w !== g.scale.width || s.h !== g.scale.height) {
          g.scale.resize(s.w, s.h);
          g.scale.setZoom(1 / dpr);
        }
      });
      observer.observe(el);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      controller.attach(null);
      game?.destroy(true);
    };
    // The scene is created once per mount.
  }, [controller]);

  return <div ref={host} className="reel-stage" role="img" aria-label={label} data-testid="reel-stage" />;
}
