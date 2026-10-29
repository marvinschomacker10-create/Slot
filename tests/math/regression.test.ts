import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExactAnalysis } from '../../src/math/exact-analysis/analysis';
import { analyzeMarginals } from '../../src/math/exact-analysis/marginal';
import { game } from '../helpers';

/**
 * Configuration-change regression guard.
 *
 * reports/analysis.json is the reviewed mathematical record of the configuration.
 * If any gameplay parameter changes, the configuration hash changes and these tests
 * fail until the exact analysis is regenerated (`npm run analyze`) and re-reviewed,
 * so a configuration change can never ship with stale mathematics.
 */
const analysisPath = resolve(import.meta.dirname, '../../reports/analysis.json');

describe('mathematical regression guard', () => {
  it('has a committed exact analysis for the current configuration', () => {
    expect(existsSync(analysisPath), 'reports/analysis.json is missing: run `npm run analyze`').toBe(true);
    const a = JSON.parse(readFileSync(analysisPath, 'utf8')) as ExactAnalysis;
    expect(
      a.game.configHash,
      'config/game.config.json changed since reports/analysis.json was generated: run `npm run analyze`, review the results, then `npm run report`',
    ).toBe(game.hash);
  });

  it('recomputes the same uncapped RTP as the committed analysis', () => {
    const a = JSON.parse(readFileSync(analysisPath, 'utf8')) as ExactAnalysis;
    const m = analyzeMarginals(game);
    expect(Math.abs(m.rtpUncapped.total - a.rtp.totalUncapped)).toBeLessThan(1e-12);
    expect(Math.abs(m.rtpUncapped.base - a.rtp.base)).toBeLessThan(1e-9);
    expect(a.crossChecks.agree).toBe(true);
    expect(Math.abs(a.method.totalMassError)).toBeLessThan(1e-10);
  });

  it('meets the design acceptance criterion: computed RTP within 0.05 points of the 96% target', () => {
    // Acceptance criterion, not an assumption: the RTP is computed here from the reel strips and
    // paytable. 0.05 points is about 5x the effect of the smallest single-stop strip edit available
    // in this design (see the sensitivity table in docs/RTP_REPORT.md), i.e. tighter tuning would
    // require finer strips rather than a different paytable.
    const rtp = analyzeMarginals(game).rtpUncapped.total;
    expect(Math.abs(rtp - game.config.math.targetRtp)).toBeLessThan(0.0005);
  });
});
