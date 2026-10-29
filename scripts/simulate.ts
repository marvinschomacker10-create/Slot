/**
 * Monte Carlo simulation of complete game rounds through the real game engine.
 *
 *   npm run simulate -- --spins 2000000 --seed 7 --workers 4
 *   npm run simulate:100k | simulate:1m | simulate:10m        (presets, fixed seeds)
 *   npm run simulate -- --spins 1000000 --crypto              (non-reproducible CSPRNG run)
 *
 * "spins" counts paid base-game spins; each one is simulated together with every
 * free spin it triggers (one round = one observation). Results go to
 * reports/simulation-<name>.json and .csv; when reports/analysis.json matches the
 * configuration hash, a theoretical-vs-simulated comparison is included.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { EXACT_ANALYSIS_SCHEMA, type ExactAnalysis } from '../src/math/exact-analysis/analysis';
import { DEFAULT_CHUNK_SIZE } from '../src/math/simulation/runner';
import {
  buildSimulationReport,
  compareWithTheory,
  comparisonCsv,
  simulationSummaryCsv,
} from '../src/math/simulation/report';
import { DEFAULT_CONFIG_PATH, REPORTS_DIR, fmtNum, fmtPct, loadGame } from './lib/load-config';
import { runParallelSimulation } from './lib/parallel-sim';

const PRESETS: Record<string, { rounds: number; seed: string }> = {
  '100k': { rounds: 100_000, seed: 'preset-100k' },
  '1m': { rounds: 1_000_000, seed: 'preset-1m' },
  '10m': { rounds: 10_000_000, seed: 'preset-10m' },
};

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG_PATH },
    preset: { type: 'string' },
    spins: { type: 'string' },
    seed: { type: 'string' },
    crypto: { type: 'boolean', default: false },
    workers: { type: 'string' },
    'chunk-size': { type: 'string', default: String(DEFAULT_CHUNK_SIZE) },
    'line-bet': { type: 'string' },
    out: { type: 'string' },
    analysis: { type: 'string', default: resolve(REPORTS_DIR, 'analysis.json') },
  },
});

const fail = (msg: string): never => {
  console.error(`error: ${msg}`);
  process.exit(2);
};
const parseCount = (s: string, what: string) => {
  const n = Number(s.replace(/_/g, '').replace(/k$/i, '000').replace(/m$/i, '000000'));
  if (!Number.isSafeInteger(n) || n < 1) fail(`${what} must be a positive integer (got "${s}")`);
  return n;
};

const preset = values.preset
  ? (PRESETS[values.preset.toLowerCase()] ??
    fail(`unknown preset "${values.preset}" (use ${Object.keys(PRESETS).join(', ')})`))
  : undefined;
const rounds = values.spins
  ? parseCount(values.spins, '--spins')
  : (preset?.rounds ?? fail('pass --spins N or --preset 100k|1m|10m'));
if (values.crypto && values.seed) fail('--crypto and --seed are mutually exclusive');
const seed = values.crypto ? undefined : (values.seed ?? preset?.seed ?? 'default');
const workers = values.workers
  ? parseCount(values.workers, '--workers')
  : Math.max(1, Math.min(8, availableParallelism()));
const chunkSize = parseCount(values['chunk-size']!, '--chunk-size');
const game = loadGame(values.config);
const lineBet = values['line-bet'] ? parseCount(values['line-bet'], '--line-bet') : game.lineBetOptions[0]!;
if (!game.lineBetOptions.includes(lineBet)) fail(`--line-bet must be one of ${game.lineBetOptions.join(', ')}`);
const name = values.preset?.toLowerCase() ?? `${rounds}`;
const outBase = values.out ? resolve(values.out) : resolve(REPORTS_DIR, `simulation-${name}`);
mkdirSync(resolve(outBase, '..'), { recursive: true });

console.error(
  `Simulating ${fmtNum(rounds)} rounds (${seed === undefined ? 'crypto RNG' : `seed "${seed}"`}, ${workers} worker(s), chunks of ${fmtNum(chunkSize)})`,
);
const t0 = performance.now();
let lastPrint = 0;
const state = await runParallelSimulation(game, {
  rounds,
  seed,
  chunkSize,
  workers,
  lineBet,
  onProgress: (done, total) => {
    const now = performance.now();
    if (now - lastPrint < 1000 && done < total) return;
    lastPrint = now;
    const rate = done / ((now - t0) / 1000);
    process.stderr.write(
      `\r  ${fmtNum(done)} / ${fmtNum(total)} rounds (${((done / total) * 100).toFixed(1)}%), ${fmtNum(Math.round(rate))} rounds/s   `,
    );
  },
});
const elapsedMs = performance.now() - t0;
process.stderr.write('\n');

let theory: ExactAnalysis | undefined;
if (existsSync(values.analysis!)) {
  const a = JSON.parse(readFileSync(values.analysis!, 'utf8')) as ExactAnalysis;
  if (a.schema !== EXACT_ANALYSIS_SCHEMA)
    console.warn('warning: analysis.json uses an older format; run `npm run analyze` to compare.');
  else if (a.game.configHash !== game.hash)
    console.warn(
      'warning: analysis.json was computed for a different configuration; run `npm run analyze` to compare.',
    );
  else theory = a;
}
const report = buildSimulationReport(
  game,
  state,
  {
    seed: seed === undefined ? null : String(seed),
    rngKind: seed === undefined ? 'crypto' : 'seeded',
    chunkSize,
    workers,
    elapsedMs: Math.round(elapsedMs),
    preset: values.preset,
    generatedAt: new Date().toISOString(),
  },
  theory,
);
const comparison = theory ? compareWithTheory(theory, report) : null;
writeFileSync(`${outBase}.json`, JSON.stringify({ ...report, comparison }, null, 2) + '\n');
writeFileSync(`${outBase}.csv`, simulationSummaryCsv(report));
if (comparison) writeFileSync(`${outBase}-comparison.csv`, comparisonCsv(comparison));

const r = report;
console.log(
  `\nSimulation of ${fmtNum(r.totals.rounds)} rounds (${fmtNum(r.totals.freeSpins)} free spins) in ${(elapsedMs / 1000).toFixed(1)} s`,
);
console.log(
  `  RTP            ${fmtPct(r.rtp.estimate)}  95% CI [${fmtPct(r.rtp.ci95.low)}, ${fmtPct(r.rtp.ci95.high)}]  (batch means [${fmtPct(r.rtp.batchMeansCi95.low)}, ${fmtPct(r.rtp.batchMeansCi95.high)}])`,
);
console.log(`    base / free  ${fmtPct(r.rtp.base)} / ${fmtPct(r.rtp.feature)}`);
console.log(
  `  hit frequency  ${fmtPct(r.hitFrequency.estimate, 3)};  trigger 1 in ${fmtNum(r.feature.baseSpinsPerTrigger ?? NaN, 1)};  SD ${fmtNum(r.roundPayout.sd, 3)}`,
);
console.log(
  `  max round win  ${fmtNum(r.extremes.maxRoundWin)}x bet;  longest no-win streak ${r.losingStreaks.longest}`,
);
if (comparison) {
  console.log('\n  metric                              theoretical     simulated        z');
  for (const c of comparison) {
    console.log(
      `  ${c.metric.padEnd(34)} ${c.theoretical.toPrecision(6).padStart(12)}  ${c.simulated.toPrecision(6).padStart(12)}  ${c.z.toFixed(2).padStart(7)}${c.reliable ? '' : '  (few events)'}`,
    );
  }
}
if (r.warnings.length) {
  console.log('\n  warnings:');
  for (const w of r.warnings) console.log(`   - ${w}`);
}
console.log(`\nWrote ${outBase}.json and .csv`);
