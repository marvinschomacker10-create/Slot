/**
 * Validates a game configuration and prints every error and warning.
 *   npm run validate-config [-- --config path/to/config.json]
 */
import { parseArgs } from 'node:util';
import { compileGame, validateConfig, type GameConfig } from '../src/config';
import { analyzeMarginals } from '../src/math/exact-analysis/marginal';
import { DEFAULT_CONFIG_PATH, fmtPct, readConfigFile } from './lib/load-config';

const { values } = parseArgs({ options: { config: { type: 'string', default: DEFAULT_CONFIG_PATH } } });
const path = values.config!;
const raw = readConfigFile(path);
const result = validateConfig(raw);
for (const w of result.warnings) console.log(`warning  ${w.path}: ${w.message}`);
for (const e of result.errors) console.log(`error    ${e.path}: ${e.message}`);
if (!result.ok) {
  console.log(`\n${path}: INVALID (${result.errors.length} error(s), ${result.warnings.length} warning(s))`);
  process.exit(1);
}
const game = compileGame(raw as GameConfig);
const m = analyzeMarginals(game);
console.log(`${path}: valid (${result.warnings.length} warning(s))`);
console.log(`  config hash      ${game.hash}`);
console.log(`  grid             ${game.reels} reels x ${game.rows} rows, ${game.lineCount} paylines`);
console.log(`  reel lengths     ${Object.entries(game.config.reelSets).map(([k, v]) => `${k}: ${v.map((s) => s.symbols.length).join('/')}`).join('; ')}`);
console.log(`  exact RTP (uncapped, marginal method): ${fmtPct(m.rtpUncapped.total)} (target ${fmtPct(game.config.math.targetRtp, 2)})`);
