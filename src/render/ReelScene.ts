import Phaser from 'phaser';
import type { GameMode } from '../config/types';
import type { Position } from '../game/types';
import {
  cellCenter,
  computeLayout,
  easeOutBack,
  planLanding,
  planSpinTiming,
  tapeSymbol,
  type AnimationSpeed,
  type ReelLayout,
  type TapeSegment,
} from './layout';
import { FEATURE_ACCENT, GOLD, paylineColor } from './theme';

/** Static description of what the scene draws; built from the compiled configuration. */
export interface SceneSetup {
  readonly reels: number;
  readonly rows: number;
  readonly symbols: readonly string[];
  readonly strips: Readonly<Record<GameMode, readonly (readonly string[])[]>>;
  readonly paylines: readonly (readonly number[])[];
  readonly scatter: string;
  /** Scatter count that makes the feature possible on the last reels (anticipation). */
  readonly anticipateFrom: number;
  readonly initialStops: readonly number[];
  readonly devicePixelRatio: number;
  /** Pre-rasterised symbol artwork (see textures.ts). */
  readonly symbolCanvases: ReadonlyMap<string, HTMLCanvasElement>;
}

export interface SpinAnimation {
  readonly mode: GameMode;
  readonly stops: readonly number[];
  readonly window: readonly (readonly string[])[];
  readonly speed: AnimationSpeed | 'instant';
  readonly reducedMotion: boolean;
}

interface ReelView {
  readonly column: Phaser.GameObjects.Container;
  readonly sprites: Phaser.GameObjects.Image[];
  readonly bg: Phaser.GameObjects.Image[];
  position: number;
  state: 'idle' | 'spinning' | 'stopping';
  segments: TapeSegment[];
  stopAt: number;
  stopFrom: number;
  stopTo: number;
  stopDuration: number;
  stopStart: number;
  finalSegments: TapeSegment[] | null;
  finalStrip: readonly string[];
  finalStop: number;
  anticipating: boolean;
}

const symKey = (id: string) => `sym:${id}`;

/**
 * Renders the reels. It never evaluates anything: it is handed the stops and the
 * window that the engine already settled and animates towards them.
 */
export class ReelScene extends Phaser.Scene {
  private readonly setup: SceneSetup;
  private readonly onReady: (scene: ReelScene) => void;
  private layout!: ReelLayout;
  private reels: ReelView[] = [];
  private frame!: Phaser.GameObjects.Graphics;
  private maskShape!: Phaser.GameObjects.Graphics;
  private linesLayer!: Phaser.GameObjects.Graphics;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private lineLabels: Phaser.GameObjects.Text[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private pulses: Phaser.Tweens.Tween[] = [];
  private spinStart = 0;
  private spinResolve: (() => void) | null = null;
  private featureMode = false;
  private shownWins: { lines: { lineIndex: number; positions: readonly Position[] }[]; scatter: readonly Position[] } | null = null;
  private focusTarget: { kind: 'all' } | { kind: 'line'; lineIndex: number } | { kind: 'scatter' } = { kind: 'all' };
  private previewLines: readonly number[] | null = null;
  private reducedMotion = false;

  constructor(setup: SceneSetup, onReady: (scene: ReelScene) => void) {
    super('reels');
    this.setup = setup;
    this.onReady = onReady;
  }

  create(): void {
    this.createGeneratedTextures();
    for (const id of this.setup.symbols) {
      const canvas = this.setup.symbolCanvases.get(id);
      if (this.textures.exists(symKey(id))) continue;
      // Placeholder for symbols without artwork: a labelled tile, so new symbols still render.
      if (canvas) this.textures.addCanvas(symKey(id), canvas);
      else this.createPlaceholder(id);
    }
    this.layout = this.currentLayout();
    this.frame = this.add.graphics().setDepth(1);
    this.maskShape = this.make.graphics({}, false);
    const mask = this.maskShape.createGeometryMask();
    for (let reel = 0; reel < this.setup.reels; reel++) {
      const column = this.add.container(0, 0).setDepth(2);
      column.setMask(mask);
      const bg: Phaser.GameObjects.Image[] = [];
      for (let row = 0; row < this.setup.rows; row++) {
        const tile = this.add.image(0, 0, 'cell-bg').setDepth(1.5);
        bg.push(tile);
      }
      const sprites: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < this.setup.rows + 2; k++) sprites.push(this.add.image(0, 0, symKey(this.setup.symbols[0]!)));
      column.add(sprites);
      const strip = this.setup.strips.base[reel]!;
      this.reels.push({
        column,
        sprites,
        bg,
        position: 0,
        state: 'idle',
        segments: [{ minJ: -Infinity, strip, anchor: this.setup.initialStops[reel] ?? 0 }],
        stopAt: 0,
        stopFrom: 0,
        stopTo: 0,
        stopDuration: 0,
        stopStart: 0,
        finalSegments: null,
        finalStrip: strip,
        finalStop: 0,
        anticipating: false,
      });
    }
    this.highlightLayer = this.add.graphics().setDepth(3);
    this.linesLayer = this.add.graphics().setDepth(4);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 520 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 600, max: 1400 },
      gravityY: 260,
      tint: [0xffe9a3, 0xf5c542, 0xffffff, 0xffb347],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparks.setDepth(6);
    this.scale.on('resize', () => this.relayout());
    this.relayout();
    this.onReady(this);
  }

  /** Called by the controller; returns when every reel shows the settled window. */
  playSpin(anim: SpinAnimation): Promise<void> {
    this.clearWins();
    this.reducedMotion = anim.reducedMotion;
    this.setAmbient(!anim.reducedMotion);
    const strips = this.setup.strips[anim.mode];
    if (anim.speed === 'instant' || anim.reducedMotion) {
      this.reels.forEach((r, i) => this.snapReel(r, strips[i]!, anim.stops[i]!));
      return Promise.resolve();
    }
    const scatters = anim.window.map((col) => col.filter((s) => s === this.setup.scatter).length);
    const timing = planSpinTiming(scatters, anim.speed, this.setup.anticipateFrom);
    this.spinStart = this.game.loop.time;
    this.reels.forEach((r, i) => {
      r.state = 'spinning';
      r.stopAt = timing.stopAt[i]!;
      r.finalStrip = strips[i]!;
      r.finalStop = anim.stops[i]!;
      r.anticipating = timing.anticipation[i]!;
      r.finalSegments = null;
    });
    this.reelSpeed = timing.speed;
    this.overshoot = timing.overshoot;
    return new Promise((resolve) => {
      this.spinResolve = resolve;
    });
  }

  private reelSpeed = 30;
  private overshoot = 1;

  /** Brings every still-spinning reel to a stop as soon as possible. */
  quickStop(): void {
    const elapsed = this.game.loop.time - this.spinStart;
    this.reels.forEach((r, i) => {
      if (r.state === 'spinning') r.stopAt = Math.min(r.stopAt, elapsed + i * 30);
    });
  }

  override update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    let anyMoving = false;
    for (const r of this.reels) {
      if (r.state === 'spinning') {
        anyMoving = true;
        r.position += this.reelSpeed * dt;
        if (time - this.spinStart >= r.stopAt) this.beginLanding(r, time);
      } else if (r.state === 'stopping') {
        anyMoving = true;
        const u = (time - r.stopStart) / r.stopDuration;
        if (u >= 1) this.finishLanding(r);
        else r.position = r.stopFrom + (r.stopTo - r.stopFrom) * easeOutBack(u, this.overshoot);
      }
    }
    if (anyMoving || this.reels.some((r) => r.state !== 'idle')) this.drawReels();
    this.drawFrame(time);
    if (this.spinResolve && this.reels.every((r) => r.state === 'idle')) {
      const resolve = this.spinResolve;
      this.spinResolve = null;
      resolve();
    }
  }

  private beginLanding(r: ReelView, time: number): void {
    const landing = planLanding(r.segments, r.position, r.finalStrip, r.finalStop, this.setup.rows, 1);
    r.segments = landing.segments;
    r.stopFrom = r.position;
    r.stopTo = landing.end;
    // Match the landing curve's initial velocity (overshoot + 3) to the spin speed.
    r.stopDuration = (((this.overshoot + 3) * (landing.end - r.position)) / this.reelSpeed) * 1000;
    r.stopStart = time;
    r.state = 'stopping';
  }

  private finishLanding(r: ReelView): void {
    r.position = 0;
    r.segments = [{ minJ: -Infinity, strip: r.finalStrip, anchor: r.finalStop }];
    r.state = 'idle';
    r.anticipating = false;
    this.drawReels();
  }

  private snapReel(r: ReelView, strip: readonly string[], stop: number): void {
    r.position = 0;
    r.segments = [{ minJ: -Infinity, strip, anchor: stop }];
    r.state = 'idle';
    r.finalStrip = strip;
    r.finalStop = stop;
    this.drawReels();
  }

  /** Symbol ids currently shown in each visible cell (used by tests and the dev panel). */
  displayedWindow(): string[][] {
    return this.reels.map((r) =>
      Array.from({ length: this.setup.rows }, (_, row) => tapeSymbol(r.segments, row - Math.round(r.position))),
    );
  }

  isIdle(): boolean {
    return this.reels.every((r) => r.state === 'idle');
  }

  setFeatureMode(active: boolean): void {
    this.featureMode = active;
  }

  showWins(lines: { lineIndex: number; positions: readonly Position[] }[], scatter: readonly Position[]): void {
    this.shownWins = { lines, scatter };
    this.focusTarget = { kind: 'all' };
    this.drawWins();
  }

  focus(target: { kind: 'all' } | { kind: 'line'; lineIndex: number } | { kind: 'scatter' }): void {
    this.focusTarget = target;
    this.drawWins();
  }

  clearWins(): void {
    this.shownWins = null;
    this.previewLines = null;
    this.drawWins();
  }

  setPreviewLines(lines: readonly number[] | null): void {
    this.previewLines = lines;
    this.drawWins();
  }

  celebrate(level: number): void {
    if (this.reducedMotion || level <= 0) return;
    const l = this.layout;
    const count = level === 1 ? 40 : level === 2 ? 90 : 160;
    for (let i = 0; i < level; i++) {
      this.time.delayedCall(i * 260, () => {
        const x = l.frame.x + l.frame.w * (0.25 + Math.random() * 0.5);
        const y = l.frame.y + l.frame.h * (0.3 + Math.random() * 0.3);
        this.sparks.explode(count, x, y);
      });
    }
  }

  rendererType(): string {
    return this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
  }

  // ---------------------------------------------------------------- drawing

  private currentLayout(): ReelLayout {
    return computeLayout(this.scale.width, this.scale.height, this.setup.reels, this.setup.rows, this.setup.devicePixelRatio);
  }

  private relayout(): void {
    this.layout = this.currentLayout();
    const l = this.layout;
    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff);
    for (let reel = 0; reel < this.setup.reels; reel++) {
      this.maskShape.fillRect(l.originX + reel * l.pitch, l.originY, l.cell, l.cell * this.setup.rows);
    }
    this.reels.forEach((r, reel) => {
      r.column.setPosition(l.originX + reel * l.pitch, l.originY);
      r.bg.forEach((tile, row) => {
        const c = cellCenter(l, reel, row);
        tile.setPosition(c.x, c.y).setDisplaySize(l.cell * 0.98, l.cell * 0.98);
      });
    });
    if (this.ambient) {
      this.ambient.stop();
      this.ambient.destroy();
      this.ambient = null;
      this.setAmbient(!this.reducedMotion);
    }
    this.drawReels();
    this.drawWins();
  }

  private drawReels(): void {
    const l = this.layout;
    const size = l.cell * 0.84;
    for (const r of this.reels) {
      const s = r.position;
      const top = Math.floor(-s) - 1;
      const moving = r.state !== 'idle';
      r.sprites.forEach((sprite, k) => {
        const j = top + k;
        const key = symKey(tapeSymbol(r.segments, j));
        if (sprite.texture.key !== key) sprite.setTexture(key);
        sprite.setPosition(l.cell / 2, (j + s) * l.cell + l.cell / 2);
        sprite.setDisplaySize(size, moving && r.state === 'spinning' ? size * 1.08 : size);
        sprite.setAlpha(moving && r.state === 'spinning' ? 0.82 : 1);
      });
    }
  }

  private drawFrame(time: number): void {
    const l = this.layout;
    const g = this.frame;
    const accent = this.featureMode ? FEATURE_ACCENT : GOLD;
    const glow = 0.18 + 0.08 * Math.sin(time / 600);
    g.clear();
    g.fillStyle(0x0a0814, 0.85);
    g.fillRoundedRect(l.frame.x, l.frame.y, l.frame.w, l.frame.h, l.cell * 0.12);
    for (let w = 18; w >= 6; w -= 6) {
      g.lineStyle(w * this.setup.devicePixelRatio * 0.5, accent, glow * (6 / w));
      g.strokeRoundedRect(l.frame.x, l.frame.y, l.frame.w, l.frame.h, l.cell * 0.12);
    }
    g.lineStyle(3 * this.setup.devicePixelRatio, accent, 0.95);
    g.strokeRoundedRect(l.frame.x, l.frame.y, l.frame.w, l.frame.h, l.cell * 0.12);
    // Anticipation glow behind reels that are still spinning for a possible feature.
    this.reels.forEach((r, reel) => {
      if (r.anticipating && r.state !== 'idle') {
        g.lineStyle(4 * this.setup.devicePixelRatio, 0x5ff6e0, 0.6 + 0.4 * Math.sin(time / 90));
        g.strokeRoundedRect(l.originX + reel * l.pitch - 2, l.originY - 2, l.cell + 4, l.cell * this.setup.rows + 4, 8);
      }
    });
  }

  private drawWins(): void {
    if (!this.linesLayer) return;
    const l = this.layout;
    const g = this.linesLayer;
    const h = this.highlightLayer;
    g.clear();
    h.clear();
    for (const t of this.lineLabels) t.destroy();
    this.lineLabels = [];
    for (const p of this.pulses) p.stop();
    this.pulses = [];
    this.drawReels(); // restores sizes and alpha changed by highlight tweens

    const dpr = this.setup.devicePixelRatio;
    const drawLine = (lineIndex: number, alpha: number, width: number) => {
      const rows = this.setup.paylines[lineIndex]!;
      const color = paylineColor(lineIndex);
      const pts = rows.map((row, reel) => cellCenter(l, reel, row));
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const ext = l.cell * 0.32;
      const path = [{ x: first.x - ext, y: first.y }, ...pts, { x: last.x + ext, y: last.y }];
      g.lineStyle(width * 2.6 * dpr, color, 0.22 * alpha);
      g.strokePoints(path, false);
      g.lineStyle(width * dpr, color, alpha);
      g.strokePoints(path, false);
      for (const end of [path[0]!, path[path.length - 1]!]) {
        g.fillStyle(0x0a0814, 0.9 * alpha);
        g.fillCircle(end.x, end.y, l.cell * 0.14);
        g.lineStyle(2 * dpr, color, alpha);
        g.strokeCircle(end.x, end.y, l.cell * 0.14);
        const label = this.add
          .text(end.x, end.y, String(lineIndex + 1), {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(l.cell * 0.15)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5)
          .setDepth(5)
          .setAlpha(alpha);
        this.lineLabels.push(label);
      }
    };

    if (this.previewLines) {
      for (const lineIndex of this.previewLines) drawLine(lineIndex, 1, 3);
      return;
    }
    const wins = this.shownWins;
    if (!wins) return;

    const focused = this.focusTarget;
    const winningCells = new Set<string>();
    const activeLines = wins.lines.filter((w) => focused.kind === 'all' || (focused.kind === 'line' && focused.lineIndex === w.lineIndex));
    for (const w of activeLines) for (const p of w.positions) winningCells.add(`${p.reel}:${p.row}`);
    if (focused.kind === 'all' || focused.kind === 'scatter') for (const p of wins.scatter) winningCells.add(`${p.reel}:${p.row}`);

    // Dim symbols that are not part of the highlighted win.
    this.reels.forEach((r, reel) => {
      const top = Math.floor(-r.position) - 1;
      r.sprites.forEach((sprite, k) => {
        const row = top + k;
        if (row < 0 || row >= this.setup.rows) return;
        const on = winningCells.has(`${reel}:${row}`);
        sprite.setAlpha(on ? 1 : 0.38);
        if (on && !this.reducedMotion) {
          const base = sprite.scaleX;
          this.pulses.push(
            this.tweens.add({ targets: sprite, scaleX: base * 1.1, scaleY: base * 1.1, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
          );
        }
      });
    });
    for (const key of winningCells) {
      const [reel, row] = key.split(':').map(Number) as [number, number];
      const c = cellCenter(l, reel, row);
      h.lineStyle(3 * dpr, GOLD, 0.95);
      h.strokeRoundedRect(c.x - l.cell * 0.46, c.y - l.cell * 0.46, l.cell * 0.92, l.cell * 0.92, l.cell * 0.12);
    }
    for (const w of wins.lines) {
      const isFocus = focused.kind === 'line' && focused.lineIndex === w.lineIndex;
      if (focused.kind === 'all' || isFocus) drawLine(w.lineIndex, 1, isFocus ? 5 : 3);
    }
  }

  private setAmbient(on: boolean): void {
    if (!on) {
      this.ambient?.stop();
      return;
    }
    if (this.ambient) {
      this.ambient.start();
      return;
    }
    const l = this.layout;
    this.ambient = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: l.width },
      y: { min: 0, max: l.height },
      speedY: { min: -12, max: -4 },
      speedX: { min: -4, max: 4 },
      scale: { start: 0.18, end: 0 },
      alpha: { start: 0.55, end: 0 },
      lifespan: 4200,
      frequency: 260,
      tint: [0xffe9a3, 0xb388ff, 0x5ff6e0],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.ambient.setDepth(0);
  }

  private createGeneratedTextures(): void {
    if (!this.textures.exists('spark')) {
      const t = this.textures.createCanvas('spark', 32, 32)!;
      const ctx = t.getContext();
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,236,170,0.8)');
      grad.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
      t.refresh();
    }
    if (!this.textures.exists('cell-bg')) {
      const t = this.textures.createCanvas('cell-bg', 128, 128)!;
      const ctx = t.getContext();
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#2a2142');
      grad.addColorStop(0.5, '#1a1530');
      grad.addColorStop(1, '#100c1f');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(2, 2, 124, 124, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(233,196,106,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
      t.refresh();
    }
  }

  private createPlaceholder(id: string): void {
    const t = this.textures.createCanvas(symKey(id), 256, 256)!;
    const ctx = t.getContext();
    ctx.fillStyle = '#3a2f5c';
    ctx.beginPath();
    ctx.roundRect(16, 16, 224, 224, 32);
    ctx.fill();
    ctx.fillStyle = '#f5d27a';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(id.slice(0, 7), 128, 128);
    t.refresh();
  }
}
