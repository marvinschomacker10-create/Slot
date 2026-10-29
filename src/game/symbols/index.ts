import type { CompiledGame } from '../../config/compile';
import type { SymbolDef } from '../../config/types';

export function getSymbolDef(game: CompiledGame, id: string): SymbolDef {
  const def = game.config.symbols.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown symbol "${id}"`);
  return def;
}

export function symbolIndexOf(game: CompiledGame, id: string): number {
  const idx = game.symbolIndex.get(id);
  if (idx === undefined) throw new Error(`Unknown symbol "${id}"`);
  return idx;
}

export function wildId(game: CompiledGame): string {
  return game.symbolIds[game.wild]!;
}

export function scatterId(game: CompiledGame): string {
  return game.symbolIds[game.scatter]!;
}

/** Regular (substitutable, line-paying) symbols in configuration order. */
export function regularSymbols(game: CompiledGame): SymbolDef[] {
  return game.config.symbols.filter((s) => s.kind === 'regular');
}
