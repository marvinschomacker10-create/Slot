import { useState } from 'react';
import type { CompiledGame } from '../config';
import type { GameSession, SpinRecord } from '../game/state/session';
import type { ReelController } from '../render/ReelController';

/** Development-only diagnostics. Not rendered in production builds. */
export function DevPanel({
  game,
  session,
  controller,
  last,
  seed,
  mismatches,
  onResetWallet,
}: {
  game: CompiledGame;
  session: GameSession;
  controller: ReelController;
  last: SpinRecord | null;
  seed: string | null;
  mismatches: number;
  onResetWallet: () => void;
}) {
  const [integrity, setIntegrity] = useState<string>('nicht geprüft');
  const shown = controller.displayedWindow();
  const matches = last ? JSON.stringify(shown) === JSON.stringify(last.outcome.window) : null;
  return (
    <div className="dev" data-testid="dev-panel">
      <dl className="kv">
        <div>
          <dt>Konfiguration</dt>
          <dd>
            {game.config.meta.id} {game.config.meta.version} · hash <code>{game.hash.slice(0, 16)}…</code>
          </dd>
        </div>
        <div>
          <dt>Validierungswarnungen</dt>
          <dd>
            {game.warnings.length === 0 ? 'keine' : game.warnings.map((w) => `${w.path}: ${w.message}`).join('; ')}
          </dd>
        </div>
        <div>
          <dt>RNG</dt>
          <dd>{seed !== null ? `Seed-xoshiro128** "${seed}" (nur Entwicklung)` : 'Web Crypto CSPRNG'}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>{controller.rendererType()}</dd>
        </div>
        <div>
          <dt>Angezeigtes Raster = abgerechnetes Ergebnis</dt>
          <dd>
            {matches === null ? 'noch kein Dreh' : matches ? 'ja' : 'NEIN'} · Abweichungen bisher: {mismatches}
          </dd>
        </div>
        <div>
          <dt>Sitzungsphase</dt>
          <dd>{session.phase}</dd>
        </div>
        <div>
          <dt>Buchungs-Integrität</dt>
          <dd>
            {integrity}{' '}
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                const r = session.verifyIntegrity();
                setIntegrity(r.ok ? `ok (${session.ledgerEntries.length} Buchungen)` : r.problems.join('; '));
              }}
            >
              Prüfen
            </button>
          </dd>
        </div>
      </dl>
      <p>
        <button type="button" className="button button--small" onClick={onResetWallet} data-testid="reset-wallet">
          Gespeichertes Spielgeld-Konto zurücksetzen
        </button>
      </p>
      <details>
        <summary>Letzter Dreh (Datensatz)</summary>
        <pre>{last ? JSON.stringify({ ...last, outcome: { ...last.outcome } }, null, 2) : 'keiner'}</pre>
      </details>
      <details>
        <summary>Aktive Konfiguration (config/game.config.json)</summary>
        <pre>{JSON.stringify(game.config, null, 2)}</pre>
      </details>
    </div>
  );
}
