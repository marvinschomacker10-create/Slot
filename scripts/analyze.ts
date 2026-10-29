/**
 * Exact mathematical analysis.
 *   npm run analyze [-- --config path --out reports --no-sensitivity --pmf]
 *
 * Writes reports/analysis.json (consumed by the UI statistics panel and by
 * export-report) plus CSV tables. Every number is computed, nothing is assumed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeGame } from '../src/math/exact-analysis/analysis';
import { computeRoundDistribution } from '../src/math/exact-analysis/distribution';
import { sensitivityReport } from '../src/math/exact-analysis/sensitivity';
import { toCsv } from '../src/math/simulation/report';
import { DEFAULT_CONFIG_PATH, REPORTS_DIR, fmtNum, fmtPct, loadGame } from './lib/load-config';

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG_PATH },
    out: { type: 'string', default: REPORTS_DIR },
    'no-sensitivity': { type: 'boolean', default: false },
    pmf: { type: 'boolean', default: false },
  },
});
const outDir = resolve(values.out!);
mkdirSync(outDir, { recursive: true });
const game = loadGame(values.config);
const t0 = performance.now();
const log = (m: string) => console.error(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${m}`);

const dist = computeRoundDistribution(game, { onProgress: log });
const analysis = analyzeGame(game, { onProgress: log, distribution: dist });
let sensitivity = null;
if (!values['no-sensitivity']) {
  log('computing RTP sensitivity and candidate adjustments');
  sensitivity = sensitivityReport(game);
}
const output = { ...analysis, sensitivity };
writeFileSync(resolve(outDir, 'analysis.json'), JSON.stringify(output, null, 2) + '\n');

const a = analysis;
writeFileSync(
  resolve(outDir, 'analysis-summary.csv'),
  toCsv(['metric', 'value'], [
    ['rtp_total', a.rtp.total],
    ['rtp_base', a.rtp.base],
    ['rtp_feature', a.rtp.feature],
    ['rtp_total_uncapped', a.rtp.totalUncapped],
    ['cap_effect', a.rtp.capEffect],
    ['expected_net_per_unit_stake', a.rtp.expectedNetPerUnitStake],
    ['hit_frequency', a.round.hitFrequency],
    ['line_win_probability_base_spin', a.baseGame.lineWinProbability],
    ['probability_net_positive', a.round.probabilityNetPositive],
    ['trigger_probability', a.feature.triggerProbability],
    ['base_spins_between_triggers', a.feature.expectedBaseSpinsBetweenTriggers],
    ['free_spins_per_trigger', a.feature.expectedFreeSpinsPerTrigger],
    ['retrigger_probability_per_free_spin', a.freeGame.retriggerProbabilityPerSpin],
    ['probability_feature_retriggers', a.feature.probabilityAnyRetrigger],
    ['feature_expected_win_x_bet', a.feature.expectedWin],
    ['feature_sd_x_bet', a.feature.sdWin],
    ['round_sd_per_unit_stake', a.round.sd],
    ['round_variance_per_unit_stake', a.round.variance],
    ['max_base_spin_win_x_bet', a.round.maxBaseSpinWin],
    ['max_free_spin_win_x_bet', a.round.maxFreeSpinWin],
    ['max_round_win_upper_bound_x_bet', a.round.maxPossibleWinUpperBound],
    ['volatility_classification', a.volatility.classification],
  ]),
);
writeFileSync(
  resolve(outDir, 'payout-bands.csv'),
  toCsv(['band_x_bet', 'probability', 'rtp_contribution'], a.round.bands.map((b) => [b.label, b.probability, b.rtpContribution])),
);
writeFileSync(
  resolve(outDir, 'line-combinations.csv'),
  toCsv(
    ['mode', 'symbol', 'count', 'pay_x_line_bet', 'probability_per_line', 'one_in_per_line', 'rtp_contribution'],
    [
      ...a.baseGame.lineCombinations.map((c) => ['base', c.symbol, c.count, c.pay, c.probabilityPerLine, c.oneInPerLine, c.rtpContribution]),
      ...a.freeGame.lineCombinations.map((c) => ['free', c.symbol, c.count, c.pay, c.probabilityPerLine, c.oneInPerLine, c.rtpContribution]),
    ],
  ),
);
if (values.pmf) {
  const rows: (number | string)[][] = [];
  dist.roundPmf.forEach((p, u) => {
    if (p > a.method.numericalFloor) rows.push([u / game.lineCount, p]);
  });
  writeFileSync(resolve(outDir, 'round-payout-pmf.csv'), toCsv(['payout_x_bet', 'probability'], rows));
}

console.log(`\nExact analysis of ${a.game.name} ${a.game.version} (config ${a.game.configHash.slice(0, 12)})`);
console.log(`  combinations         base ${fmtNum(a.method.baseCombinations)}, free ${fmtNum(a.method.freeCombinations)}`);
console.log(`  total RTP            ${fmtPct(a.rtp.total)}  (target ${fmtPct(a.rtp.target, 2)}, deviation ${(a.rtp.deviationFromTarget * 100).toFixed(4)} pts)`);
console.log(`    base game          ${fmtPct(a.rtp.base)}  (lines ${fmtPct(a.rtp.baseLine)}, scatter ${fmtPct(a.rtp.baseScatter)})`);
console.log(`    free spins         ${fmtPct(a.rtp.feature)}`);
console.log(`    cap effect         ${Math.abs(a.rtp.capEffect) < 1e-9 ? 'negligible (floating-point noise level)' : a.rtp.capEffect.toExponential(3)}`);
console.log(`  hit frequency        ${fmtPct(a.round.hitFrequency, 3)}`);
console.log(`  net-positive rounds  ${fmtPct(a.round.probabilityNetPositive, 3)}`);
console.log(`  feature trigger      1 in ${fmtNum(a.feature.expectedBaseSpinsBetweenTriggers, 2)}; ${fmtNum(a.feature.expectedFreeSpinsPerTrigger, 4)} free spins; avg ${fmtNum(a.feature.expectedWin, 3)}x bet`);
console.log(`  SD per unit stake    ${fmtNum(a.round.sd, 4)} (${a.volatility.classification} on the documented scale)`);
console.log(`  max win              base spin ${fmtNum(a.round.maxBaseSpinWin)}x, free spin ${fmtNum(a.round.maxFreeSpinWin)}x, round <= ${fmtNum(a.round.maxPossibleWinUpperBound)}x`);
console.log(`  cross-check          marginal vs enumeration max |diff| ${a.crossChecks.maxAbsDifference.toExponential(2)} (${a.crossChecks.agree ? 'agree' : 'DISAGREE'})`);
console.log(`  numerics             mass error ${a.method.totalMassError.toExponential(2)}, floor ${a.method.numericalFloor.toExponential(1)}, ${a.method.fftCount} FFTs`);
if (sensitivity && Math.abs(sensitivity.deviation) > 0.0005) {
  console.log(`\n  RTP deviates from target; candidate single-stop changes:`);
  for (const c of sensitivity.closestToTarget.slice(0, 5)) console.log(`    ${c.description} -> ${fmtPct(c.rtpAfter)}`);
}
console.log(`\nWrote ${resolve(outDir, 'analysis.json')} and CSV tables (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
