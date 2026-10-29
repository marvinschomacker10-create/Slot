import { Worker } from 'node:worker_threads';
import type { CompiledGame } from '../../src/config';
import { createSimulationState, mergeSimulationStates, type SimulationState } from '../../src/math/simulation/accumulator';
import { planChunks, simulateChunk, type ChunkSpec } from '../../src/math/simulation/runner';
import type { Seed } from '../../src/rng';

export interface ParallelOptions {
  rounds: number;
  seed: Seed | undefined;
  chunkSize: number;
  workers: number;
  lineBet: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Runs chunks on a pool of worker threads and merges the results in chunk order,
 * so a seeded run gives identical output for any number of workers.
 */
export async function runParallelSimulation(game: CompiledGame, opts: ParallelOptions): Promise<SimulationState> {
  const chunks = planChunks(opts.rounds, opts.chunkSize, opts.seed, opts.lineBet);
  const results = new Array<SimulationState | undefined>(chunks.length);
  const progress = new Map<number, number>();
  let finished = 0;
  const report = () => {
    let done = 0;
    for (const v of progress.values()) done += v;
    opts.onProgress?.(done, opts.rounds);
  };

  if (opts.workers <= 1) {
    chunks.forEach((c, i) => {
      results[i] = simulateChunk(game, c, (d) => {
        progress.set(i, d);
        report();
      });
      progress.set(i, c.rounds);
      report();
    });
  } else {
    let next = 0;
    await new Promise<void>((resolveAll, rejectAll) => {
      const pool: Worker[] = [];
      const dispatch = (w: Worker) => {
        if (next < chunks.length) w.postMessage({ chunk: chunks[next++] as ChunkSpec });
        else w.postMessage({ exit: true });
      };
      const n = Math.min(opts.workers, chunks.length);
      for (let i = 0; i < n; i++) {
        // The bootstrap registers the TypeScript loader inside the worker (see sim-worker-bootstrap.mjs).
        const w = new Worker(new URL('./sim-worker-bootstrap.mjs', import.meta.url), { workerData: { config: game.config }, execArgv: [] });
        pool.push(w);
        w.on('message', (m: { ready?: true; progress?: { chunkIndex: number; done: number }; result?: { chunkIndex: number; state: SimulationState } }) => {
          if (m.ready) dispatch(w);
          else if (m.progress) {
            progress.set(m.progress.chunkIndex, m.progress.done);
            report();
          } else if (m.result) {
            results[m.result.chunkIndex] = m.result.state;
            progress.set(m.result.chunkIndex, chunks[m.result.chunkIndex]!.rounds);
            report();
            finished++;
            if (finished === chunks.length) resolveAll();
            dispatch(w);
          }
        });
        w.on('error', (e) => {
          for (const p of pool) void p.terminate();
          rejectAll(e);
        });
      }
    });
  }

  let state = createSimulationState(game, opts.lineBet);
  for (const r of results) {
    if (!r) throw new Error('a simulation chunk did not complete');
    state = mergeSimulationStates(state, r);
  }
  return state;
}
