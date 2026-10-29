import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileGame, type CompiledGame } from '../../src/config';
import { analyzeGame, type ExactAnalysis } from '../../src/math/exact-analysis/analysis';
import { computeRoundDistribution } from '../../src/math/exact-analysis/distribution';
import { analyzeMarginals } from '../../src/math/exact-analysis/marginal';
import { runSimulation } from '../../src/math/simulation/runner';
import { stdDev } from '../../src/math/statistics';
import { game } from '../helpers';
import { toyConfig } from '../fixtures/toy-config';

/**
 * Acceptance criterion: a simulated estimate must lie within 4 standard errors of
 * the exact value. For a correct implementation the probability of a false
 * failure is 6e-5 per check; the seeds are fixed, so the tests are deterministic.
 */
const Z = 4;

function zScore(estimate: number, exact: number, se: number): number {
  return Math.abs(estimate - exact) / se;
}

function binomialSe(p: number, n: number): number {
  return Math.sqrt((p * (1 - p)) / n);
}

describe('Monte Carlo through the game engine agrees with exact analysis', () => {
  it('real configuration: RTP, hit frequency and trigger rate (300k rounds)', () => {
    const m = analyzeMarginals(game);
    const s = runSimulation(game, { rounds: 300_000, seed: 'sim-vs-theory' });
    const rtp = s.payout / s.stake;
    const se = stdDev(s.roundMoments) / Math.sqrt(s.rounds);
    expect(zScore(rtp, m.rtpUncapped.total, se)).toBeLessThan(Z);
    expect(zScore(s.triggers / s.rounds, m.triggerProbability, binomialSe(m.triggerProbability, s.rounds))).toBeLessThan(Z);
    // Distribution-level values come from the committed exact analysis (its hash is checked in regression.test.ts).
    const exact = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../reports/analysis.json'), 'utf8')) as ExactAnalysis;
    expect(exact.game.configHash).toBe(game.hash);
    const hit = exact.round.hitFrequency;
    expect(zScore(s.hits / s.rounds, hit, binomialSe(hit, s.rounds))).toBeLessThan(Z);
    const np = exact.round.probabilityNetPositive;
    expect(zScore(s.netPositive / s.rounds, np, binomialSe(np, s.rounds))).toBeLessThan(Z);
  });

  it('toy configuration with a reachable cap: RTP, cap probability and free spins (200k rounds)', () => {
    const g: CompiledGame = compileGame(toyConfig());
    const a = analyzeGame(g, { distribution: computeRoundDistribution(g) });
    const s = runSimulation(g, { rounds: 200_000, seed: 'toy-sim' });
    const n = s.rounds;
    const rtp = s.payout / s.stake;
    expect(zScore(rtp, a.rtp.total, stdDev(s.roundMoments) / Math.sqrt(n))).toBeLessThan(Z);
    expect(a.round.capProbability).toBeGreaterThan(1e-3);
    expect(zScore(s.capHits / n, a.round.capProbability, binomialSe(a.round.capProbability, n))).toBeLessThan(Z);
    expect(zScore(s.hits / n, a.round.hitFrequency, binomialSe(a.round.hitFrequency, n))).toBeLessThan(Z);
    const spins = s.featureSpinMoments;
    expect(zScore(spins.mean, a.feature.expectedFreeSpinsPlayedPerTrigger, stdDev(spins) / Math.sqrt(spins.n))).toBeLessThan(Z);
    const fw = s.featureMoments;
    expect(zScore(fw.mean, a.feature.expectedWin, stdDev(fw) / Math.sqrt(fw.n))).toBeLessThan(Z);
    // The cap ends features early here, so fewer spins are played than awarded.
    expect(a.feature.expectedFreeSpinsPlayedPerTrigger).toBeLessThan(a.feature.expectedFreeSpinsPerTrigger);
    // Capped exact RTP is strictly below the uncapped value for this configuration.
    expect(a.rtp.total).toBeLessThan(a.rtp.totalUncapped);
  });
});
