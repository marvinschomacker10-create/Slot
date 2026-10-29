import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileGame, validateConfig, type CompiledGame, type GameConfig } from '../../src/config';

export const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
export const DEFAULT_CONFIG_PATH = resolve(PROJECT_ROOT, 'config/game.config.json');
export const REPORTS_DIR = resolve(PROJECT_ROOT, 'reports');

export function readConfigFile(path: string = DEFAULT_CONFIG_PATH): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`Cannot read configuration file ${path}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Configuration file ${path} is not valid JSON: ${(e as Error).message}`);
  }
}

/** Loads, validates and compiles a configuration, printing every problem before exiting on error. */
export function loadGame(path: string = DEFAULT_CONFIG_PATH): CompiledGame {
  const raw = readConfigFile(path);
  const result = validateConfig(raw);
  for (const w of result.warnings) console.warn(`warning: ${w.path}: ${w.message}`);
  if (!result.ok) {
    console.error(`\n${path} is invalid:`);
    for (const e of result.errors) console.error(`  error: ${e.path}: ${e.message}`);
    process.exit(1);
  }
  return compileGame(raw as GameConfig);
}

export function fmtPct(x: number, digits = 4): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtNum(x: number, digits = 4): string {
  return Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: digits }) : String(x);
}
