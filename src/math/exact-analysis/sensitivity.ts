import { compileGame, type CompiledGame } from '../../config/compile';
import type { GameConfig } from '../../config/types';
import { analyzeMarginals } from './marginal';

/**
 * RTP sensitivity and candidate parameter changes.
 *
 * Every candidate is a concrete, single-parameter edit of the configuration whose
 * exact (uncapped) RTP is recomputed with the marginal method. Nothing is ever
 * adjusted at runtime: these are suggestions for a designer, to be applied to the
 * configuration and then re-verified by the full analysis and simulations.
 */

export interface AdjustmentCandidate {
  readonly kind: 'paytable' | 'scatter-pay' | 'reel-stop';
  readonly description: string;
  readonly rtpAfter: number;
  readonly delta: number;
}

export interface SensitivityReport {
  readonly currentRtp: number;
  readonly target: number;
  readonly deviation: number;
  /** Change in total RTP when each paytable entry is raised by one step (about 10%). */
  readonly paytable: readonly AdjustmentCandidate[];
  /** Single-stop reel substitutions whose RTP lands closest to the target. */
  readonly closestToTarget: readonly AdjustmentCandidate[];
}

function rtpOf(config: GameConfig): number | null {
  try {
    return analyzeMarginals(compileGame(config)).rtpUncapped.total;
  } catch {
    return null; // the edit produced an invalid configuration
  }
}

export function sensitivityReport(game: CompiledGame, options: { maxCandidates?: number } = {}): SensitivityReport {
  const config = game.config;
  const current = analyzeMarginals(game).rtpUncapped.total;
  const target = config.math.targetRtp;
  const paytable: AdjustmentCandidate[] = [];

  for (const [symbol, table] of Object.entries(config.paytable.line)) {
    for (const [count, value] of Object.entries(table)) {
      const step = Math.max(1, Math.round(value * 0.1));
      const edited = structuredClone(config);
      edited.paytable.line[symbol]![count] = value + step;
      const rtp = rtpOf(edited);
      if (rtp !== null) {
        paytable.push({ kind: 'paytable', description: `${symbol} x${count}: ${value} -> ${value + step}`, rtpAfter: rtp, delta: rtp - current });
      }
    }
  }
  for (const [count, value] of Object.entries(config.paytable.scatter)) {
    const step = Math.max(1, Math.round(value * 0.1));
    const edited = structuredClone(config);
    edited.paytable.scatter[count] = value + step;
    const rtp = rtpOf(edited);
    if (rtp !== null) {
      paytable.push({ kind: 'scatter-pay', description: `SCATTER x${count}: ${value} -> ${value + step} (x total bet)`, rtpAfter: rtp, delta: rtp - current });
    }
  }

  // Reel-stop substitutions: replace the first occurrence of A with B on one reel.
  const regular = config.symbols.filter((s) => s.kind !== 'scatter').map((s) => s.id);
  const reelStops: AdjustmentCandidate[] = [];
  for (const [setName, strips] of Object.entries(config.reelSets)) {
    strips.forEach((strip, reel) => {
      const present = [...new Set(strip.symbols)].filter((s) => regular.includes(s));
      for (const a of present) {
        for (const b of regular) {
          if (a === b) continue;
          const edited = structuredClone(config);
          const syms = edited.reelSets[setName]![reel]!.symbols;
          syms[syms.indexOf(a)] = b;
          const rtp = rtpOf(edited);
          if (rtp !== null) {
            reelStops.push({
              kind: 'reel-stop',
              description: `${setName} reel ${reel + 1}: one ${a} -> ${b}`,
              rtpAfter: rtp,
              delta: rtp - current,
            });
          }
        }
      }
    });
  }
  reelStops.sort((x, y) => Math.abs(x.rtpAfter - target) - Math.abs(y.rtpAfter - target));

  return {
    currentRtp: current,
    target,
    deviation: current - target,
    paytable: paytable.sort((x, y) => y.delta - x.delta),
    closestToTarget: reelStops.slice(0, options.maxCandidates ?? 12),
  };
}
