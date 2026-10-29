import { useEffect, useRef, useState } from 'react';
import { credits, pct } from '../app/format';
import SimulationWorker from '../math/simulation/sim.worker.ts?worker&inline';
import type { ComparisonRow, SimulationReport } from '../math/simulation/report';

/** German labels for the metric names produced by the (English) math module. */
const METRIC_DE: Readonly<Record<string, string>> = {
  'Total RTP': 'RTP gesamt',
  'Base-game RTP': 'RTP Grundspiel',
  'Free-spins RTP contribution': 'RTP-Anteil Freispiele',
  'Hit frequency (round pays > 0)': 'Trefferquote (Runde zahlt > 0)',
  'Base spin with a line win': 'Grundspiel-Dreh mit Liniengewinn',
  'Net-positive round': 'Runde mit Nettogewinn',
  'Free-spins trigger': 'Freispiele ausgelöst',
  'Retrigger per free spin': 'Neuauslösung je Freispiel',
  'Feature with >= 1 retrigger': 'Feature mit ≥ 1 Neuauslösung',
  'Free spins played per trigger': 'Gespielte Freispiele je Auslösung',
  'Feature win per trigger (x bet)': 'Feature-Gewinn je Auslösung (× Einsatz)',
};

function metricName(metric: string): string {
  const m = /^Round pays >= (\d+)x bet$/.exec(metric);
  return m ? `Runde zahlt ≥ ${m[1]}× Einsatz` : (METRIC_DE[metric] ?? metric);
}

const num = (x: number, digits: number) => x.toPrecision(digits).replace('.', ',');

type State =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; report: SimulationReport; comparison: ComparisonRow[] | null }
  | { kind: 'error'; message: string };

/**
 * Runs a simulation in a Web Worker so the game stays responsive. The worker is
 * inlined into the bundle, so it also works from the standalone index.html.
 */
export function SimulationRunner() {
  const [rounds, setRounds] = useState(100_000);
  const [seed, setSeed] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const start = () => {
    worker.current?.terminate();
    const w = new SimulationWorker();
    worker.current = w;
    setState({ kind: 'running', done: 0, total: rounds });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: 'progress'; done: number; total: number }
        | { type: 'done'; report: SimulationReport; comparison: ComparisonRow[] | null };
      if (m.type === 'progress') setState({ kind: 'running', done: m.done, total: m.total });
      else {
        setState({ kind: 'done', report: m.report, comparison: m.comparison });
        w.terminate();
        worker.current = null;
      }
    };
    w.onerror = (e) => setState({ kind: 'error', message: e.message || 'Der Simulations-Worker ist fehlgeschlagen' });
    w.postMessage({ rounds, seed: seed.trim() === '' ? null : seed.trim(), chunkSize: 10_000 });
  };

  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setState({ kind: 'idle' });
  };

  return (
    <section className="sim" aria-labelledby="sim-title">
      <h3 id="sim-title">Simulation starten</h3>
      <p className="muted">
        Simuliert komplette Runden mit derselben Spiel-Engine in einem Hintergrund-Worker. Für 10 Millionen Runden und
        mehr die Kommandozeile nutzen (<code>npm run simulate:10m</code>).
      </p>
      <div className="sim__controls">
        <label>
          Runden
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            disabled={state.kind === 'running'}
          >
            <option value={100_000}>100.000</option>
            <option value={1_000_000}>1.000.000</option>
          </select>
        </label>
        <label>
          Seed (optional)
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Krypto-Zufall"
            disabled={state.kind === 'running'}
          />
        </label>
        {state.kind === 'running' ? (
          <button type="button" className="button" onClick={cancel}>
            Abbrechen
          </button>
        ) : (
          <button type="button" className="button button--gold" onClick={start} data-testid="run-simulation">
            Starten
          </button>
        )}
      </div>
      {state.kind === 'running' && (
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={state.total}
          aria-valuenow={state.done}
          aria-label="Simulationsfortschritt"
        >
          <div style={{ width: `${(state.done / state.total) * 100}%` }} />
        </div>
      )}
      {state.kind === 'error' && <p className="error">{state.message}</p>}
      {state.kind === 'done' && (
        <div className="sim__result" data-testid="simulation-result">
          <p>
            <strong>{credits(state.report.totals.rounds)}</strong> Runden in{' '}
            {(state.report.meta.elapsedMs / 1000).toFixed(1).replace('.', ',')} s: RTP{' '}
            <strong>{pct(state.report.rtp.estimate, 3)}</strong> (95-%-Konfidenzintervall{' '}
            {pct(state.report.rtp.ci95.low, 2)} bis {pct(state.report.rtp.ci95.high, 2)})
          </p>
          {state.comparison && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Kennzahl</th>
                    <th scope="col">Exakt</th>
                    <th scope="col">Simuliert</th>
                    <th scope="col">95-%-KI</th>
                    <th scope="col">z</th>
                  </tr>
                </thead>
                <tbody>
                  {state.comparison.map((c) => (
                    <tr key={c.metric} className={c.reliable ? undefined : 'muted'}>
                      <th scope="row">{metricName(c.metric)}</th>
                      <td>{num(c.theoretical, 5)}</td>
                      <td>{num(c.simulated, 5)}</td>
                      <td>
                        {num(c.ci95Low, 4)} – {num(c.ci95High, 4)}
                      </td>
                      <td>{c.z.toFixed(2).replace('.', ',')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {state.report.warnings.length > 0 && (
            <details>
              <summary>
                {state.report.warnings.length} Hinweise zur Stichprobengröße (englisch, aus dem Mathe-Modul)
              </summary>
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
