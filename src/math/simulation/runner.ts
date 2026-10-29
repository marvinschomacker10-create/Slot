import type { CompiledGame } from '../../config/compile';
import { playRound } from '../../game/engine';
import { CryptoRandomSource, SeededRandomSource, deriveSeed, type RandomSource, type Seed } from '../../rng';
import {
  closeBatch,
  createSimulationState,
  mergeSimulationStates,
  recordRound,
  type SimulationState,
} from './accumulator';

export const DEFAULT_CHUNK_SIZE = 10_000;

export interface ChunkSpec {
  /** Seed of the whole run; undefined means cryptographic randomness (not reproducible). */
  readonly seed: Seed | undefined;
  readonly chunkIndex: number;
  readonly rounds: number;
  readonly lineBet: number;
}

/**
 * Simulates one chunk of complete rounds through the real game engine.
 * With a seed, chunk j always uses the sub-stream deriveSeed(seed, j), so results
 * are identical however chunks are distributed over threads.
 */
export function simulateChunk(game: CompiledGame, spec: ChunkSpec, onRound?: (done: number) => void): SimulationState {
  const rng: RandomSource =
    spec.seed === undefined ? new CryptoRandomSource() : new SeededRandomSource(deriveSeed(spec.seed, spec.chunkIndex));
  const state = createSimulationState(game, spec.lineBet);
  const payoutBefore = state.payout;
  for (let i = 0; i < spec.rounds; i++) {
    recordRound(game, state, playRound(game, spec.lineBet, rng));
    if (onRound && (i & 0x3fff) === 0x3fff) onRound(i + 1);
  }
  closeBatch(state, spec.rounds, state.payout - payoutBefore);
  return state;
}

export interface SimulationOptions {
  readonly rounds: number;
  readonly seed?: Seed | undefined;
  readonly chunkSize?: number;
  readonly lineBet?: number;
  readonly onProgress?: (roundsDone: number, roundsTotal: number) => void;
  readonly shouldStop?: () => boolean;
}

export function planChunks(rounds: number, chunkSize: number, seed: Seed | undefined, lineBet: number): ChunkSpec[] {
  if (!Number.isSafeInteger(rounds) || rounds < 1) throw new RangeError('rounds must be a positive integer');
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new RangeError('chunk size must be a positive integer');
  const chunks: ChunkSpec[] = [];
  for (let i = 0, done = 0; done < rounds; i++) {
    const n = Math.min(chunkSize, rounds - done);
    chunks.push({ seed, chunkIndex: i, rounds: n, lineBet });
    done += n;
  }
  return chunks;
}

/** Single-threaded run (browser worker, tests, and the CLI with --workers 1). */
export function runSimulation(game: CompiledGame, options: SimulationOptions): SimulationState {
  const lineBet = options.lineBet ?? game.lineBetOptions[0]!;
  const chunks = planChunks(options.rounds, options.chunkSize ?? DEFAULT_CHUNK_SIZE, options.seed, lineBet);
  let state = createSimulationState(game, lineBet);
  let done = 0;
  for (const chunk of chunks) {
    if (options.shouldStop?.()) break;
    const s = simulateChunk(game, chunk, (n) => options.onProgress?.(done + n, options.rounds));
    state = mergeSimulationStates(state, s);
    done += chunk.rounds;
    options.onProgress?.(done, options.rounds);
  }
  return state;
}
