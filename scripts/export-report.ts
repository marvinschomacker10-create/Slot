/**
 * Exports the mathematical report.
 *   npm run report [-- --analysis reports/analysis.json --out docs/RTP_REPORT.md]
 *
 * Combines reports/analysis.json with every reports/simulation-*.json whose
 * configuration hash matches, writes docs/RTP_REPORT.md, a comparison CSV per
 * simulation and reports/report-summary.json.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { EXACT_ANALYSIS_SCHEMA, type ExactAnalysis } from '../src/math/exact-analysis/analysis';
import { renderRtpReport, type ReportInputs } from '../src/math/reports/markdown';
import { renderSpecification } from '../src/math/reports/specification';
import { compareWithTheory, comparisonCsv, type SimulationReport } from '../src/math/simulation/report';
import { DEFAULT_CONFIG_PATH, PROJECT_ROOT, REPORTS_DIR, loadGame } from './lib/load-config';

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG_PATH },
    analysis: { type: 'string', default: resolve(REPORTS_DIR, 'analysis.json') },
    reports: { type: 'string', default: REPORTS_DIR },
    out: { type: 'string', default: resolve(PROJECT_ROOT, 'docs/RTP_REPORT.md') },
  },
});

const game = loadGame(values.config);
if (!existsSync(values.analysis!)) {
  console.error(`error: ${values.analysis} not found; run \`npm run analyze\` first.`);
  process.exit(1);
}
const analysis = JSON.parse(readFileSync(values.analysis!, 'utf8')) as ReportInputs['analysis'];
if (analysis.schema !== EXACT_ANALYSIS_SCHEMA) {
  console.error('error: analysis.json uses an older format; run `npm run analyze` again.');
  process.exit(1);
}
if (analysis.game.configHash !== game.hash) {
  console.error('error: analysis.json was produced for a different configuration hash; run `npm run analyze` again.');
  process.exit(1);
}

const order = (name: string) => {
  const m = /simulation-([\w-]+)\.json$/.exec(name);
  const key = (m?.[1] ?? '').split('-')[0]!;
  const n = Number(key.replace(/k$/, '000').replace(/m$/, '000000'));
  return Number.isFinite(n) ? n : Infinity;
};
const simulations: ReportInputs['simulations'][number][] = [];
for (const file of readdirSync(values.reports!)
  .filter((f) => /^simulation-[\w-]+\.json$/.test(f))
  .sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
  const sim = JSON.parse(readFileSync(resolve(values.reports!, file), 'utf8')) as SimulationReport;
  if (sim.game.configHash !== game.hash) {
    console.warn(`skipping ${file}: produced for a different configuration hash`);
    continue;
  }
  const comparison = compareWithTheory(analysis as ExactAnalysis, sim);
  // Refresh the run's comparison against the current exact analysis.
  writeFileSync(resolve(values.reports!, `${basename(file, '.json')}-comparison.csv`), comparisonCsv(comparison));
  simulations.push({ ...sim, comparison });
}

const featurePath = resolve(values.reports!, 'feature-simulation.json');
let featureSimulation: ReportInputs['featureSimulation'] = null;
if (existsSync(featurePath)) {
  const f = JSON.parse(readFileSync(featurePath, 'utf8')) as NonNullable<ReportInputs['featureSimulation']>;
  if (f.game.configHash === game.hash) featureSimulation = f;
  else console.warn('skipping feature-simulation.json: produced for a different configuration hash');
}

const generatedAt = new Date().toISOString();
writeFileSync(values.out!, renderRtpReport({ analysis, simulations, featureSimulation, generatedAt }));
writeFileSync(resolve(values.out!, '..', 'SPECIFICATION.md'), renderSpecification(game, generatedAt));
writeFileSync(
  resolve(values.reports!, 'report-summary.json'),
  JSON.stringify(
    {
      configHash: game.hash,
      generatedAt,
      theoretical: {
        rtp: analysis.rtp,
        hitFrequency: analysis.round.hitFrequency,
        sd: analysis.round.sd,
        triggerProbability: analysis.feature.triggerProbability,
      },
      simulations: simulations.map((s) => ({
        rounds: s.totals.rounds,
        seed: s.meta.seed,
        rtp: s.rtp.estimate,
        ci95: s.rtp.ci95,
        maxAbsZ: Math.max(...(s.comparison ?? []).map((c) => Math.abs(c.z))),
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(`Wrote ${values.out} (${simulations.length} simulation run(s)) and SPECIFICATION.md.`);
