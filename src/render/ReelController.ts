import type { GameMode } from '../config/types';
import type { Position } from '../game/types';
import type { AnimationSpeed } from './layout';
import type { ReelScene } from './ReelScene';

export type WinFocus = { kind: 'all' } | { kind: 'line'; lineIndex: number } | { kind: 'scatter' };

/**
 * Narrow bridge between React and the Phaser scene. React only ever hands the
 * scene settled results; the scene only ever reports that an animation finished.
 * Every method is safe to call before the scene is ready (it becomes a no-op or
 * resolves immediately), so the game stays playable even if rendering fails.
 */
export class ReelController {
  private scene: ReelScene | null = null;
  private readyListeners: (() => void)[] = [];

  attach(scene: ReelScene | null): void {
    this.scene = scene;
    if (scene) {
      for (const l of this.readyListeners) l();
      this.readyListeners = [];
    }
  }

  get ready(): boolean {
    return this.scene !== null;
  }

  whenReady(): Promise<void> {
    return this.scene ? Promise.resolve() : new Promise((resolve) => this.readyListeners.push(resolve));
  }

  /** Animates to the settled stops. Resolves after landing, or after a safety timeout. */
  async spin(anim: {
    mode: GameMode;
    stops: readonly number[];
    window: readonly (readonly string[])[];
    speed: AnimationSpeed | 'instant';
    reducedMotion: boolean;
  }): Promise<void> {
    const scene = this.scene;
    if (!scene) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 10_000);
    });
    await Promise.race([scene.playSpin(anim), timeout]);
    clearTimeout(timer);
  }

  quickStop(): void {
    this.scene?.quickStop();
  }

  showWins(lines: { lineIndex: number; positions: readonly Position[] }[], scatter: readonly Position[]): void {
    this.scene?.showWins(lines, scatter);
  }

  focus(target: WinFocus): void {
    this.scene?.focus(target);
  }

  clearWins(): void {
    this.scene?.clearWins();
  }

  previewLines(lines: readonly number[] | null): void {
    this.scene?.setPreviewLines(lines);
  }

  celebrate(level: number): void {
    this.scene?.celebrate(level);
  }

  setFeatureMode(active: boolean): void {
    this.scene?.setFeatureMode(active);
  }

  displayedWindow(): string[][] | null {
    return this.scene ? this.scene.displayedWindow() : null;
  }

  isIdle(): boolean {
    return this.scene ? this.scene.isIdle() : true;
  }

  rendererType(): string {
    return this.scene ? this.scene.rendererType() : 'not started';
  }
}
