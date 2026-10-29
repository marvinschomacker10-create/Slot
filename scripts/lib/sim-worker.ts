/** Worker thread: simulates the chunks it is sent and returns their states. */
import { parentPort, workerData } from 'node:worker_threads';
import { compileGame, type GameConfig } from '../../src/config';
import { simulateChunk, type ChunkSpec } from '../../src/math/simulation/runner';

const game = compileGame((workerData as { config: GameConfig }).config);
parentPort!.on('message', (msg: { chunk: ChunkSpec } | { exit: true }) => {
  if ('exit' in msg) {
    process.exit(0);
  }
  const state = simulateChunk(game, msg.chunk, (done) => parentPort!.postMessage({ progress: { chunkIndex: msg.chunk.chunkIndex, done } }));
  parentPort!.postMessage({ result: { chunkIndex: msg.chunk.chunkIndex, state } });
});
parentPort!.postMessage({ ready: true });
