import { CryptoRandomSource, SeededRandomSource, type RandomSource } from '../rng';

/**
 * Runtime switches. Seeded randomness is honoured ONLY in development builds
 * (Vite dev server / tests); a production build always uses the Web Crypto CSPRNG.
 */
export interface RuntimeFlags {
  readonly dev: boolean;
  readonly seed: string | null;
  readonly forceTurbo: boolean;
  readonly forceReducedMotion: boolean;
}

export function readRuntimeFlags(
  search: string = typeof location === 'undefined' ? '' : location.search,
): RuntimeFlags {
  const params = new URLSearchParams(search);
  const dev = import.meta.env.DEV;
  return {
    dev,
    seed: dev ? params.get('seed') : null,
    forceTurbo: params.get('turbo') === '1',
    forceReducedMotion: params.get('motion') === 'reduced',
  };
}

export function createRng(flags: RuntimeFlags): RandomSource {
  return flags.seed !== null ? new SeededRandomSource(flags.seed) : new CryptoRandomSource();
}
