import type { GameConfig } from '../../src/config/types';
import { cloneConfig } from '../helpers';

/**
 * A deliberately small configuration (strips of 6-7 stops, a reachable win cap and
 * a low free-spins limit) so that every stop combination and every feature path can
 * be checked exhaustively by independent brute force.
 */
export function toyConfig(
  variant: { weights?: boolean; noCap?: boolean; unlimitedRetriggers?: boolean } = {},
): GameConfig {
  const c = cloneConfig();
  c.meta.id = 'toy';
  c.reelSets = {
    base: [
      { symbols: ['TEACHER', 'RULER', 'SCATTER', 'APPLE', 'WILD', 'ERASER', 'RULER'] },
      { symbols: ['RULER', 'WILD', 'APPLE', 'SCATTER', 'TEACHER', 'ERASER'] },
      { symbols: ['ERASER', 'RULER', 'TEACHER', 'SCATTER', 'APPLE', 'WILD', 'BOOK'] },
      { symbols: ['APPLE', 'TEACHER', 'RULER', 'WILD', 'SCATTER', 'ERASER'] },
      { symbols: ['RULER', 'SCATTER', 'ERASER', 'TEACHER', 'APPLE', 'GLOBE', 'WILD'] },
    ],
    free: [
      { symbols: ['WILD', 'TEACHER', 'RULER', 'SCATTER', 'APPLE', 'ERASER'] },
      { symbols: ['TEACHER', 'WILD', 'APPLE', 'RULER', 'SCATTER', 'BOOK'] },
      { symbols: ['APPLE', 'RULER', 'WILD', 'TEACHER', 'ERASER', 'SCATTER'] },
      { symbols: ['RULER', 'SCATTER', 'TEACHER', 'WILD', 'APPLE', 'ERASER'] },
      { symbols: ['ERASER', 'TEACHER', 'WILD', 'SCATTER', 'RULER', 'CHALK'] },
    ],
  };
  if (variant.weights) {
    c.reelSets.base!.forEach((s, i) => (s.weights = s.symbols.map((_, j) => 1 + ((i + j) % 3))));
    c.reelSets.free![2]!.weights = [3, 1, 2, 1, 4, 1];
  }
  c.freeSpins.triggerAwards = { '3': 3, '4': 4, '5': 5 };
  // Unlimited retriggers need a subcritical branching process (mean award per free spin < 1),
  // so that variant only retriggers on 4+ scatters.
  c.freeSpins.retrigger = variant.unlimitedRetriggers
    ? { enabled: true, awards: { '4': 2 }, maxTotalSpins: null }
    : { enabled: true, awards: { '3': 2 }, maxTotalSpins: 9 };
  c.limits.maxWinMultiplier = variant.noCap ? null : 60;
  return c;
}
