/**
 * Browser Web Worker for in-page simulations, so the page never freezes.
 * It runs the same engine and accumulator as the CLI. Large runs (10M+) belong
 * on the command line (`npm run simulate`), which uses all CPU cores.
 */
import { getDefaultGame } from '../../config';
import { theory, theoryMatches } from '../../app/theory';
import { createSimulationState, mergeSimulationStates } from './accumulator';
import { buildSimulationReport, compareWithTheory } from './report';
import { planChunks, simulateChunk } from './runner';

interface WorkerScope {
  onmessage: ((e: MessageEvent<{ rounds: number; seed: string | null; chunkSize: number }>) => void) | null;
  postMessage(message: unknown): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = async (e) => {
  const { rounds, seed, chunkSize } = e.data;
  const game = getDefaultGame();
  const lineBet = game.lineBetOptions[0]!;
  const t0 = performance.now();
  let state = createSimulationState(game, lineBet);
  let done = 0;
  for (const chunk of planChunks(rounds, chunkSize, seed ?? undefined, lineBet)) {
    state = mergeSimulationStates(state, simulateChunk(game, chunk));
    done += chunk.rounds;
    scope.postMessage({ type: 'progress', done, total: rounds });
    await new Promise((r) => setTimeout(r, 0));
  }
  const exact = theoryMatches(game) ? theory : undefined;
  const report = buildSimulationReport(
    game,
    state,
    {
      seed,
      rngKind: seed === null ? 'crypto' : 'seeded',
      chunkSize,
      workers: 1,
      elapsedMs: Math.round(performance.now() - t0),
      generatedAt: new Date().toISOString(),
    },
    exact,
  );
  scope.postMessage({ type: 'done', report, comparison: exact ? compareWithTheory(exact, report) : null });
};
