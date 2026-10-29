import { useEffect, useRef, useState } from 'react';
import { pct } from '../app/format';
import type { ComparisonRow, SimulationReport } from '../math/simulation/report';

type State =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; report: SimulationReport; comparison: ComparisonRow[] | null }
  | { kind: 'error'; message: string };

/** Runs a simulation in a Web Worker so the game stays responsive. */
export function SimulationRunner() {
  const [rounds, setRounds] = useState(100_000);
  const [seed, setSeed] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const start = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('../math/simulation/sim.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setState({ kind: 'running', done: 0, total: rounds });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: 'progress'; done: number; total: number } | { type: 'done'; report: SimulationReport; comparison: ComparisonRow[] | null };
      if (m.type === 'progress') setState({ kind: 'running', done: m.done, total: m.total });
      else {
        setState({ kind: 'done', report: m.report, comparison: m.comparison });
        w.terminate();
        worker.current = null;
      }
    };
    w.onerror = (e) => setState({ kind: 'error', message: e.message || 'Simulation worker failed' });
    w.postMessage({ rounds, seed: seed.trim() === '' ? null : seed.trim(), chunkSize: 10_000 });
  };

  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setState({ kind: 'idle' });
  };

  return (
    <section className="sim" aria-labelledby="sim-title">
      <h3 id="sim-title">Run a simulation</h3>
      <p className="muted">
        Simulates complete rounds through the same game engine in a background worker. Use the command line (<code>npm run simulate:10m</code>)
        for 10 million rounds or more.
      </p>
      <div className="sim__controls">
        <label>
          Rounds
          <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} disabled={state.kind === 'running'}>
            <option value={100_000}>100,000</option>
            <option value={1_000_000}>1,000,000</option>
          </select>
        </label>
        <label>
          Seed (optional)
          <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="crypto RNG" disabled={state.kind === 'running'} />
        </label>
        {state.kind === 'running' ? (
          <button type="button" className="button" onClick={cancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="button button--gold" onClick={start} data-testid="run-simulation">
            Run
          </button>
        )}
      </div>
      {state.kind === 'running' && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done} aria-label="Simulation progress">
          <div style={{ width: `${(state.done / state.total) * 100}%` }} />
        </div>
      )}
      {state.kind === 'error' && <p className="error">{state.message}</p>}
      {state.kind === 'done' && (
        <div className="sim__result" data-testid="simulation-result">
          <p>
            <strong>{state.report.totals.rounds.toLocaleString('en-US')}</strong> rounds in {(state.report.meta.elapsedMs / 1000).toFixed(1)} s:
            RTP <strong>{pct(state.report.rtp.estimate, 3)}</strong> (95% CI {pct(state.report.rtp.ci95.low, 2)} to {pct(state.report.rtp.ci95.high, 2)})
          </p>
          {state.comparison && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Exact</th>
                    <th scope="col">Simulated</th>
                    <th scope="col">95% CI</th>
                    <th scope="col">z</th>
                  </tr>
                </thead>
                <tbody>
                  {state.comparison.map((c) => (
                    <tr key={c.metric} className={c.reliable ? undefined : 'muted'}>
                      <th scope="row">{c.metric}</th>
                      <td>{c.theoretical.toPrecision(5)}</td>
                      <td>{c.simulated.toPrecision(5)}</td>
                      <td>
                        {c.ci95Low.toPrecision(4)} – {c.ci95High.toPrecision(4)}
                      </td>
                      <td>{c.z.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {state.report.warnings.length > 0 && (
            <details>
              <summary>{state.report.warnings.length} sample-size warnings</summary>
              <ul>
                {state.report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
