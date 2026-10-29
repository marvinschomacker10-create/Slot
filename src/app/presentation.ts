import type { CompiledGame } from '../config';
import type { SpinRecord } from '../game/state/session';
import { credits } from './format';

export type WinTier = 'none' | 'small' | 'big' | 'mega' | 'epic';

/** Presentation tier of a win relative to the total bet (cosmetic only). */
export function winTier(win: number, totalBet: number): WinTier {
  if (win <= 0) return 'none';
  const x = win / totalBet;
  if (x >= 200) return 'epic';
  if (x >= 50) return 'mega';
  if (x >= 15) return 'big';
  return 'small';
}

export function celebrationLevel(tier: WinTier): number {
  return tier === 'epic' ? 3 : tier === 'mega' ? 2 : tier === 'big' ? 1 : 0;
}

export type PresentationStep =
  | { readonly kind: 'all'; readonly text: string }
  | { readonly kind: 'line'; readonly lineIndex: number; readonly text: string }
  | { readonly kind: 'scatter'; readonly text: string };

function symbolName(game: CompiledGame, id: string): string {
  return game.config.symbols.find((s) => s.id === id)?.name ?? id;
}

/** The sequence of win highlights shown after the reels stop: all wins, then each win in turn. */
export function winSteps(game: CompiledGame, record: SpinRecord): PresentationStep[] {
  const o = record.outcome;
  const steps: PresentationStep[] = [];
  const parts = o.lineWins.length + (o.scatter.win > 0 || o.scatter.freeSpinsAwarded > 0 ? 1 : 0);
  if (parts === 0) return steps;
  const linesText = o.lineWins.length === 1 ? '1 Linie' : `${o.lineWins.length} Linien`;
  steps.push({
    kind: 'all',
    text:
      o.lineWins.length > 0
        ? `Gewinn ${credits(record.credited)} auf ${linesText}`
        : `Gewinn ${credits(record.credited)}`,
  });
  for (const w of o.lineWins) {
    const mult = w.wildMultiplier > 1 || w.modeMultiplier > 1 ? ` (×${w.wildMultiplier * w.modeMultiplier})` : '';
    steps.push({
      kind: 'line',
      lineIndex: w.lineIndex,
      text: `Linie ${w.lineIndex + 1}: ${w.count} × ${symbolName(game, w.symbol)} zahlt ${credits(w.win)}${mult}`,
    });
  }
  if (o.scatter.count > 0 && (o.scatter.win > 0 || record.freeSpinsGranted > 0)) {
    const fs = record.freeSpinsGranted > 0 ? ` + ${record.freeSpinsGranted} Freispiele` : '';
    steps.push({
      kind: 'scatter',
      text: `${o.scatter.count} × ${symbolName(game, o.scatter.symbol)} zahlt ${credits(o.scatter.win)}${fs}`,
    });
  }
  return steps;
}

/** Plain-language result for the screen-reader live region. */
export function describeSpin(game: CompiledGame, record: SpinRecord): string {
  const prefix = record.mode === 'free' ? `Freispiel ${record.feature ? record.feature.played : ''}: ` : '';
  const steps = winSteps(game, record);
  const body = steps.length === 0 ? 'kein Gewinn' : steps.map((s) => s.text).join('. ');
  const feature = record.startedFeature ? ` Freispiele ausgelöst: ${record.freeSpinsGranted} Drehs.` : '';
  const cap = record.cappedBy > 0 ? ' Der Maximalgewinn wurde erreicht.' : '';
  return `${prefix}${body}.${feature}${cap} Kontostand ${credits(record.balanceAfter)} Credits.`;
}
