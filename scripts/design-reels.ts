/**
 * Regenerates the ordered reel strips from config/reel-design.json (per-reel symbol
 * counts) using the constrained, seeded arrangement in scripts/lib/strip-builder.ts.
 *
 *   npx tsx scripts/design-reels.ts            # print the strips and their exact RTP
 *   npx tsx scripts/design-reels.ts --write    # also write them into config/game.config.json
 *
 * Symbol counts fix the marginal symbol distribution and therefore the RTP; the
 * arrangement only affects how wins cluster (hit frequency, variance).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileGame, type GameConfig } from '../src/config';
import { analyzeMarginals } from '../src/math/exact-analysis/marginal';
import { arrangeStrip } from './lib/strip-builder';
import { formatConfigJson } from './lib/format-json';

const root = resolve(import.meta.dirname, '..');
const configPath = resolve(root, 'config/game.config.json');
const design = JSON.parse(readFileSync(resolve(root, 'config/reel-design.json'), 'utf8')) as {
  seed: string;
  wildGap: number;
  reelSets: Record<string, Record<string, number>[]>;
};
const config = JSON.parse(readFileSync(configPath, 'utf8')) as GameConfig;
const scatter = config.symbols.find((s) => s.kind === 'scatter')!.id;
const wild = config.symbols.find((s) => s.kind === 'wild')!.id;

for (const [name, reels] of Object.entries(design.reelSets)) {
  config.reelSets[name] = reels.map((counts, i) => ({
    symbols: arrangeStrip(counts, {
      seed: `${design.seed}/${name}/${i}`,
      rows: config.grid.rows,
      scatter,
      wild,
      wildGap: design.wildGap,
    }),
  }));
}
const m = analyzeMarginals(compileGame(config));
for (const [name, strips] of Object.entries(config.reelSets)) {
  console.log(`${name}: lengths ${strips.map((s) => s.symbols.length).join(', ')}`);
}
console.log(
  `exact uncapped RTP: base ${m.rtpUncapped.base.toFixed(6)}, feature ${m.rtpUncapped.feature.toFixed(6)}, total ${m.rtpUncapped.total.toFixed(6)}`,
);
if (process.argv.includes('--write')) {
  writeFileSync(configPath, formatConfigJson(config));
  console.log(`wrote ${configPath}`);
}
