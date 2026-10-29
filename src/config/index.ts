import rawConfig from '../../config/game.config.json';
import { compileGame, type CompiledGame } from './compile';
import type { GameConfig } from './types';

export * from './types';
export * from './validate';
export * from './compile';
export * from './hash';

/** The bundled default configuration (config/game.config.json), validated and compiled. */
export const defaultConfig = rawConfig as unknown as GameConfig;

let cached: CompiledGame | null = null;
export function getDefaultGame(): CompiledGame {
  cached ??= compileGame(defaultConfig);
  return cached;
}
