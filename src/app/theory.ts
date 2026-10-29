import analysisJson from '../../reports/analysis.json';
import type { CompiledGame } from '../config';
import { EXACT_ANALYSIS_SCHEMA, type ExactAnalysis } from '../math/exact-analysis/analysis';

/** The committed exact analysis (reports/analysis.json), produced by `npm run analyze`. */
export const theory = analysisJson as unknown as ExactAnalysis;

/** True only when the bundled analysis was computed for exactly this configuration. */
export function theoryMatches(game: CompiledGame): boolean {
  return theory.schema === EXACT_ANALYSIS_SCHEMA && theory.game.configHash === game.hash;
}
