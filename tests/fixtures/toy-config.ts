import type { GameConfig } from '../../src/config/types';
import { cloneConfig } from '../helpers';

/**
 * A deliberately small configuration (strips of 6-7 stops, a reachable win cap and
 * a low free-spins limit) so that every stop combination and every feature path can
 * be checked exhaustively by independent brute force.
 */
export function toyConfig(variant: { weights?: boolean; noCap?: boolean; unlimitedRetriggers?: boolean } = {}): GameConfig {
  const c = cloneConfig();
  c.meta.id = 'toy';
  c.reelSets = {
    base: [
      { symbols: ['SUN', 'JADE', 'SCATTER', 'MOON', 'WILD', 'RUBY', 'JADE'] },
      { symbols: ['JADE', 'WILD', 'MOON', 'SCATTER', 'SUN', 'RUBY'] },
      { symbols: ['RUBY', 'JADE', 'SUN', 'SCATTER', 'MOON', 'WILD', 'COMET'] },
      { symbols: ['MOON', 'SUN', 'JADE', 'WILD', 'SCATTER', 'RUBY'] },
      { symbols: ['JADE', 'SCATTER', 'RUBY', 'SUN', 'MOON', 'PLANET', 'WILD'] },
    ],
    free: [
      { symbols: ['WILD', 'SUN', 'JADE', 'SCATTER', 'MOON', 'RUBY'] },
      { symbols: ['SUN', 'WILD', 'MOON', 'JADE', 'SCATTER', 'COMET'] },
      { symbols: ['MOON', 'JADE', 'WILD', 'SUN', 'RUBY', 'SCATTER'] },
      { symbols: ['JADE', 'SCATTER', 'SUN', 'WILD', 'MOON', 'RUBY'] },
      { symbols: ['RUBY', 'SUN', 'WILD', 'SCATTER', 'JADE', 'AMETHYST'] },
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
