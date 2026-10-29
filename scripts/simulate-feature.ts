/**
 * Conditional simulations for rare-event checks (variance reduction).
 *
 *   npm run simulate:feature [-- --features 1000000 --rounds 1000000 --seed feature-check]
 *
 * A) Features alone: complete free-spin features (initial award drawn from the exact
 *    trigger distribution) played through the engine, compared with the exact
 *    stand-alone feature distribution.
 * B) Rounds given a trigger: paid spins are drawn until one shows a qualifying scatter
 *    count (exact rejection sampling of the base reel stops); the recorded random values
 *    are then replayed through the unmodified playRound(), so the triggering spin and its
 *    feature follow the real game path. Compared with the exact P(round >= t | trigger).
 *
 * Every simulated round contains a feature, so high-payout events are about
 * 1 / P(trigger) (~170x) more frequent per simulated round than in a plain simulation.
 * Results go to reports/feature-simulation.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startFreeSpins } from '../src/game/bonus';
import { playNextSpin, playRound, startRound, type RoundState } from '../src/game/engine';
import { buildCells, drawStops } from '../src/game/reels';
import { EXACT_ANALYSIS_SCHEMA, type ExactAnalysis } from '../src/math/exact-analysis/analysis';
import { analyzeMarginals } from '../src/math/exact-analysis/marginal';
import { emptyMoments, meanInterval, pushMoment, stdDev, twoSidedP, wilsonInterval } from '../src/math/statistics';
import { SeededRandomSource, uniformInt, type RandomSource } from '../src/rng';
import { DEFAULT_CONFIG_PATH, REPORTS_DIR, fmtNum, loadGame } from './lib/load-config';

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG_PATH },
    features: { type: 'string', default: '1000000' },
    rounds: { type: 'string', default: '1000000' },
    seed: { type: 'string', default: 'feature-check' },
    out: { type: 'string', default: resolve(REPORTS_DIR, 'feature-simulation.json') },
  },
});
const game = loadGame(values.config);
const analysisPath = resolve(REPORTS_DIR, 'analysis.json');
if (!existsSync(analysisPath)) throw new Error('reports/analysis.json not found: run `npm run analyze` first');
const exact = JSON.parse(readFileSync(analysisPath, 'utf8')) as ExactAnalysis;
if (exact.schema !== EXACT_ANALYSIS_SCHEMA || exact.game.configHash !== game.hash) {
  throw new Error('reports/analysis.json does not match this configuration: run `npm run analyze` first');
}
const n = Number(values.features);
if (!Number.isSafeInteger(n) || n < 1) throw new Error('--features must be a positive integer');
const nRounds = Number(values.rounds);
if (!Number.isSafeInteger(nRounds) || nRounds < 0) throw new Error('--rounds must be a non-negative integer');

// Initial awards and their conditional probabilities given a trigger, as integer weights for exact sampling.
const awards = analyzeMarginals(game).features;
const SCALE = 1 << 30;
const weights = awards.map((f) => Math.round((f.probability / awards.reduce((a, x) => a + x.probability, 0)) * SCALE));
const totalWeight = weights.reduce((a, b) => a + b, 0);

const rng = new SeededRandomSource(values.seed!);
const T = game.lineCount;
const thresholds = [10, 25, 50, 100, 250, 500, 1000];
const counts = thresholds.map(() => 0);
const spinsHist = new Map<number, number>();
const winMoments = emptyMoments();
let maxWin = 0;
const t0 = performance.now();
for (let i = 0; i < n; i++) {
  let pick = uniformInt(rng, totalWeight);
  let k = 0;
  while (pick >= weights[k]!) pick -= weights[k++]!;
  let round: RoundState = {
    ...startRound(game, 1),
    status: 'free-spins',
    feature: startFreeSpins(game, awards[k]!.initialAward, 1),
    featureTriggered: true,
    spinsPlayed: 1,
  };
  while (round.status !== 'complete') round = playNextSpin(game, round, rng).round;
  const x = round.totalWin / T;
  pushMoment(winMoments, x);
  if (x > maxWin) maxWin = x;
  thresholds.forEach((t, j) => {
    if (x >= t) counts[j]! += 1;
  });
  const spins = round.feature!.played;
  spinsHist.set(spins, (spinsHist.get(spins) ?? 0) + 1);
  if (i % 100_000 === 99_999) process.stderr.write(`\r  ${fmtNum(i + 1)} / ${fmtNum(n)} features`);
}
process.stderr.write('\n');

const rows = thresholds.map((t, j) => {
  const ex = exact.feature.probabilityWinAtLeast.find((r) => r.multiplier === t);
  const p = ex?.probability ?? 0;
  const est = counts[j]! / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  const z = se > 0 ? (est - p) / se : 0;
  return {
    metric: `Feature win >= ${t}x bet`,
    exact: p,
    simulated: est,
    events: counts[j]!,
    ci95: wilsonInterval(counts[j]!, n),
    z,
    pValue: twoSidedP(z),
  };
});
const meanSe = stdDev(winMoments) / Math.sqrt(n);

// ---- B) rounds conditional on a trigger, through the unmodified playRound().
/** Records every value it hands out, so an accepted draw can be replayed exactly. */
class Recorder implements RandomSource {
  readonly kind = 'seeded' as const;
  log: number[] = [];
  constructor(readonly inner: RandomSource) {}
  nextUint32(): number {
    const v = this.inner.nextUint32();
    this.log.push(v);
    return v;
  }
  describe(): string {
    return 'recording wrapper';
  }
}
/**
 * Replays a recorded prefix, then continues with the underlying stream. The prefix is
 * copied: replaying from a log that keeps growing would hand out every later value twice.
 */
class Replay implements RandomSource {
  readonly kind = 'seeded' as const;
  private i = 0;
  private readonly prefix: readonly number[];
  constructor(
    prefix: readonly number[],
    private readonly inner: RandomSource,
  ) {
    this.prefix = [...prefix];
  }
  nextUint32(): number {
    return this.i < this.prefix.length ? this.prefix[this.i++]! : this.inner.nextUint32();
  }
  describe(): string {
    return 'replay wrapper';
  }
}
// Self-check of the replay mechanism: the replayed stream must equal the original stream.
{
  const a = new SeededRandomSource('replay-self-check');
  const b = new SeededRandomSource('replay-self-check');
  const recA = new Recorder(a);
  for (let i = 0; i < 7; i++) recA.nextUint32();
  const replay = new Replay(recA.log, recA.inner);
  for (let i = 0; i < 50; i++) {
    if (replay.nextUint32() !== b.nextUint32())
      throw new Error('replay self-check failed: replayed stream differs from the original');
  }
}

const condThresholds = [10, 25, 50, 100, 250, 500, 1000];
const condCounts = condThresholds.map(() => 0);
const condMoments = emptyMoments();
const baseMoments = emptyMoments();
let paidSpinsDrawn = 0;
const rec = new Recorder(new SeededRandomSource(`${values.seed}/rounds`));
const baseSet = game.modes.base.reelSet;
const t1 = performance.now();
for (let i = 0; i < nRounds; i++) {
  for (;;) {
    rec.log = [];
    const stops = drawStops(baseSet, rec);
    paidSpinsDrawn++;
    const cells = buildCells(game, baseSet, stops);
    let scatters = 0;
    for (const c of cells) if (c === game.scatter) scatters++;
    if (game.modes.base.awards[scatters]! > 0) break;
  }
  // Continue on the un-recorded stream so no value is ever reused.
  const r = playRound(game, 1, new Replay(rec.log, rec.inner));
  if (!r.spins[0]!.outcome.scatter.freeSpinsAwarded) throw new Error('replay did not reproduce the triggering spin');
  const x = r.totalWin / T;
  pushMoment(condMoments, x);
  pushMoment(baseMoments, r.baseWin / T);
  condThresholds.forEach((t, j) => {
    if (x >= t) condCounts[j]! += 1;
  });
  if (i % 100_000 === 99_999) process.stderr.write(`\r  ${fmtNum(i + 1)} / ${fmtNum(nRounds)} rounds given a trigger`);
}
process.stderr.write('\n');
const exactCond = exact.feature.roundGivenTrigger;
const condRows = condThresholds.map((t, j) => {
  const p = exactCond.probabilityWinAtLeast.find((r) => r.multiplier === t)?.probability ?? 0;
  const est = nRounds > 0 ? condCounts[j]! / nRounds : 0;
  const se = Math.sqrt((p * (1 - p)) / Math.max(1, nRounds));
  const z = se > 0 ? (est - p) / se : 0;
  return {
    metric: `Round win >= ${t}x bet | trigger`,
    exact: p,
    simulated: est,
    events: condCounts[j]!,
    ci95: wilsonInterval(condCounts[j]!, nRounds),
    z,
    pValue: twoSidedP(z),
  };
});

const report = {
  schema: 'pixel-pauker/feature-simulation@3',
  game: { id: game.config.meta.id, version: game.config.meta.version, configHash: game.hash },
  meta: {
    features: n,
    seed: values.seed,
    elapsedMs: Math.round(performance.now() - t0),
    generatedAt: new Date().toISOString(),
  },
  description:
    'Complete free-spin features played through the game engine, compared with the exact stand-alone feature distribution (feature win alone, conditional on a trigger).',
  mean: {
    exact: exact.feature.standaloneMeanWin,
    simulated: winMoments.mean,
    ci95: meanInterval(winMoments.mean, stdDev(winMoments), n),
    z: (winMoments.mean - exact.feature.standaloneMeanWin) / meanSe,
  },
  sd: { exact: exact.feature.sdWin, simulated: stdDev(winMoments) },
  maxObservedWin: maxWin,
  tail: rows,
  spinsPlayed: [...spinsHist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([spins, count]) => ({
      spins,
      count,
      fraction: count / n,
      exact: exact.feature.freeSpinsPmf.find((s) => s.spins === spins)?.probability ?? 0,
    })),
  roundsGivenTrigger: {
    rounds: nRounds,
    paidSpinsDrawn,
    elapsedMs: Math.round(performance.now() - t1),
    observedTriggerRate: nRounds / paidSpinsDrawn,
    mean: {
      exact: exactCond.meanWin,
      simulated: condMoments.mean,
      ci95: meanInterval(condMoments.mean, stdDev(condMoments), Math.max(1, nRounds)),
      z: (condMoments.mean - exactCond.meanWin) / (stdDev(condMoments) / Math.sqrt(Math.max(1, nRounds))),
    },
    triggeringSpin: {
      exact: exactCond.triggeringSpinMeanWin,
      simulated: baseMoments.mean,
      z: (baseMoments.mean - exactCond.triggeringSpinMeanWin) / (stdDev(baseMoments) / Math.sqrt(Math.max(1, nRounds))),
    },
    tail: condRows,
  },
};
writeFileSync(values.out!, JSON.stringify(report, null, 2) + '\n');
console.log(`\nA) ${fmtNum(n)} features (seed "${values.seed}")`);
console.log(
  `  mean feature win  exact ${report.mean.exact.toFixed(4)}x  simulated ${report.mean.simulated.toFixed(4)}x  z=${report.mean.z.toFixed(2)}`,
);
for (const r of rows)
  console.log(
    `  ${r.metric.padEnd(30)} exact ${r.exact.toExponential(4)}  simulated ${r.simulated.toExponential(4)}  (${r.events} events)  z=${r.z.toFixed(2)}`,
  );
const rg = report.roundsGivenTrigger;
console.log(
  `B) ${fmtNum(nRounds)} rounds given a trigger (${fmtNum(paidSpinsDrawn)} paid spins drawn, trigger rate ${(rg.observedTriggerRate * 100).toFixed(4)}%)`,
);
console.log(
  `  mean round win    exact ${rg.mean.exact.toFixed(4)}x  simulated ${rg.mean.simulated.toFixed(4)}x  z=${rg.mean.z.toFixed(2)}`,
);
console.log(
  `  triggering spin   exact ${rg.triggeringSpin.exact.toFixed(4)}x  simulated ${rg.triggeringSpin.simulated.toFixed(4)}x  z=${rg.triggeringSpin.z.toFixed(2)}`,
);
for (const r of condRows)
  console.log(
    `  ${r.metric.padEnd(30)} exact ${r.exact.toExponential(4)}  simulated ${r.simulated.toExponential(4)}  (${r.events} events)  z=${r.z.toFixed(2)}`,
  );
console.log(`Wrote ${values.out}`);
