import { describe, expect, it } from 'vitest';
import { compileGame } from '../../src/config';
import { playRound } from '../../src/game/engine';
import { GameSession } from '../../src/game/state/session';
import { analyzeGame } from '../../src/math/exact-analysis/analysis';
import { renderRtpReport } from '../../src/math/reports/markdown';
import { createSimulationState, mergeSimulationStates } from '../../src/math/simulation/accumulator';
import {
  SIMULATION_REPORT_SCHEMA,
  buildSimulationReport,
  compareWithTheory,
  comparisonCsv,
  simulationSummaryCsv,
} from '../../src/math/simulation/report';
import { planChunks, runSimulation, simulateChunk } from '../../src/math/simulation/runner';
import { SeededRandomSource } from '../../src/rng';
import { game } from '../helpers';
import { toyConfig } from '../fixtures/toy-config';
import { runParallelSimulation } from '../../scripts/lib/parallel-sim';

describe('interactive session and simulator share the same rules', () => {
  it('a seeded GameSession produces exactly the rounds playRound produces with the same RNG stream', () => {
    const session = new GameSession(game, { rng: new SeededRandomSource('same-stream'), startingBalance: 10_000_000 });
    const rng = new SeededRandomSource('same-stream');
    let featureRounds = 0;
    for (let i = 0; i < 1500; i++) {
      const expected = playRound(game, 1, rng);
      const spins = [session.spin()];
      while (!spins[spins.length - 1]!.roundComplete) spins.push(session.spin());
      expect(spins.map((s) => s.outcome.stops)).toEqual(expected.spins.map((s) => s.outcome.stops));
      expect(spins.reduce((a, s) => a + s.credited, 0)).toBe(expected.totalWin);
      expect(spins.filter((s) => s.stakeDebited > 0)).toHaveLength(1);
      if (expected.featureTriggered) featureRounds++;
    }
    expect(featureRounds).toBeGreaterThan(0);
    expect(session.verifyIntegrity().ok).toBe(true);
  });
});

describe('simulation engine', () => {
  it('is reproducible for a seed and differs between seeds', () => {
    const a = runSimulation(game, { rounds: 20_000, seed: 'repro', chunkSize: 5_000 });
    const b = runSimulation(game, { rounds: 20_000, seed: 'repro', chunkSize: 5_000 });
    const c = runSimulation(game, { rounds: 20_000, seed: 'other', chunkSize: 5_000 });
    expect(b).toEqual(a);
    expect(c.payout).not.toBe(a.payout);
    expect(a.rounds).toBe(20_000);
    expect(a.batches).toHaveLength(4);
  });

  it('gives the same result whatever order chunks are computed in (worker independence)', () => {
    const chunks = planChunks(25_000, 10_000, 'order', 1);
    const states = chunks
      .map((c) => simulateChunk(game, c))
      .reverse()
      .reverse();
    const shuffled = [chunks[2]!, chunks[0]!, chunks[1]!].map((c) => ({ i: c.chunkIndex, s: simulateChunk(game, c) }));
    const ordered = shuffled.sort((x, y) => x.i - y.i).map((x) => x.s);
    const merge = (list: typeof states) =>
      list.reduce((acc, s) => mergeSimulationStates(acc, s), createSimulationState(game, 1));
    expect(merge(ordered)).toEqual(merge(states));
    expect(merge(states)).toEqual(runSimulation(game, { rounds: 25_000, seed: 'order', chunkSize: 10_000 }));
  });

  it('worker-thread runs equal single-threaded runs', async () => {
    const single = await runParallelSimulation(game, {
      rounds: 30_000,
      seed: 'threads',
      chunkSize: 5_000,
      workers: 1,
      lineBet: 1,
    });
    const multi = await runParallelSimulation(game, {
      rounds: 30_000,
      seed: 'threads',
      chunkSize: 5_000,
      workers: 3,
      lineBet: 1,
    });
    expect(multi).toEqual(single);
  });

  it('never deducts a stake for free spins (stake = rounds x total bet)', () => {
    const s = runSimulation(game, { rounds: 50_000, seed: 'stake', lineBet: 2 });
    expect(s.freeSpins).toBeGreaterThan(0);
    expect(s.stake).toBe(50_000 * 40);
    expect(s.payout).toBe(s.basePayout + s.featurePayout);
  });

  it('rejects merging results of different configurations', () => {
    const toy = compileGame(toyConfig());
    expect(() => mergeSimulationStates(createSimulationState(game, 1), createSimulationState(toy, 1))).toThrow(
      /different configurations/,
    );
  });
});

describe('statistical report generation', () => {
  const toy = compileGame(toyConfig());
  const analysis = analyzeGame(toy, { now: () => new Date('2026-01-01T00:00:00Z') });
  const state = runSimulation(toy, { rounds: 50_000, seed: 'report' });
  const meta = {
    seed: 'report',
    rngKind: 'seeded' as const,
    chunkSize: 10_000,
    workers: 1,
    elapsedMs: 1000,
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const report = buildSimulationReport(toy, state, meta, analysis);

  it('builds a complete JSON report with intervals and warnings', () => {
    expect(report.schema).toBe(SIMULATION_REPORT_SCHEMA);
    expect(report.totals.rounds).toBe(50_000);
    expect(report.rtp.ci95.low).toBeLessThan(report.rtp.estimate);
    expect(report.rtp.ci95.high).toBeGreaterThan(report.rtp.estimate);
    expect(report.rtp.ci99.high - report.rtp.ci99.low).toBeGreaterThan(report.rtp.ci95.high - report.rtp.ci95.low);
    expect(report.rtp.batchMeansCi95.batches).toBe(5);
    expect(report.bands.reduce((a, b) => a + b.count, 0)).toBe(50_000);
    expect(report.bands.reduce((a, b) => a + b.rtpContribution, 0)).toBeCloseTo(report.rtp.estimate, 12);
    expect(report.warnings.some((w) => /RTP interval/.test(w))).toBe(true);
    expect(report.losingStreaks.winsObserved + 0).toBe(state.hits);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('flags rare events with too few observations', () => {
    const tiny = buildSimulationReport(toy, runSimulation(toy, { rounds: 200, seed: 'tiny' }), meta, analysis);
    const t = tiny.thresholds.find((x) => x.multiplier === 50)!;
    expect(t.reliable).toBe(false);
    expect(t.warning).toMatch(/unreliable|no events/);
  });

  it('compares theory with simulation and exports CSV', () => {
    const rows = compareWithTheory(analysis, report);
    expect(rows.map((r) => r.metric)).toContain('Total RTP');
    for (const r of rows.filter((x) => x.reliable)) expect(Math.abs(r.z)).toBeLessThan(5);
    const csv = comparisonCsv(rows).trim().split('\n');
    expect(csv[0]).toBe(
      'metric,theoretical,simulated,ci95_low,ci95_high,standard_error,difference,z,p_value,within_ci95,events,reliable',
    );
    expect(csv).toHaveLength(rows.length + 1);
    const summary = simulationSummaryCsv(report).trim().split('\n');
    expect(summary[0]).toBe('metric,value,ci95_low,ci95_high');
    expect(summary.find((l) => l.startsWith('rtp,'))).toBeDefined();
  });

  it('renders the Markdown RTP report from computed values', () => {
    const md = renderRtpReport({
      analysis,
      simulations: [{ ...report, comparison: compareWithTheory(analysis, report) }],
      generatedAt: '2026-01-01T00:00:00Z',
    });
    for (const heading of [
      '## 1. Definitions',
      '## 2. Headline results',
      '## 6. Free spins',
      '## 7. Payout distribution and volatility',
      '## 8. High-payout events',
      '## 10. Simulation results',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain(analysis.game.configHash);
    expect(md).toContain('not a certification');
  });
});
