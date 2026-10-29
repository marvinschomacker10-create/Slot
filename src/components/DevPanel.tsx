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
}: {
  game: CompiledGame;
  session: GameSession;
  controller: ReelController;
  last: SpinRecord | null;
  seed: string | null;
  mismatches: number;
}) {
  const [integrity, setIntegrity] = useState<string>('not checked');
  const shown = controller.displayedWindow();
  const matches = last ? JSON.stringify(shown) === JSON.stringify(last.outcome.window) : null;
  return (
    <div className="dev" data-testid="dev-panel">
      <dl className="kv">
        <div>
          <dt>Configuration</dt>
          <dd>
            {game.config.meta.id} {game.config.meta.version} · hash <code>{game.hash.slice(0, 16)}…</code>
          </dd>
        </div>
        <div>
          <dt>Validation warnings</dt>
          <dd>{game.warnings.length === 0 ? 'none' : game.warnings.map((w) => `${w.path}: ${w.message}`).join('; ')}</dd>
        </div>
        <div>
          <dt>RNG</dt>
          <dd>{seed !== null ? `seeded xoshiro128** "${seed}" (development only)` : 'Web Crypto CSPRNG'}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>{controller.rendererType()}</dd>
        </div>
        <div>
          <dt>Displayed grid equals settled outcome</dt>
          <dd>{matches === null ? 'no spin yet' : matches ? 'yes' : 'NO'} · mismatches so far: {mismatches}</dd>
        </div>
        <div>
          <dt>Session phase</dt>
          <dd>{session.phase}</dd>
        </div>
        <div>
          <dt>Ledger integrity</dt>
          <dd>
            {integrity}{' '}
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                const r = session.verifyIntegrity();
                setIntegrity(r.ok ? `ok (${session.ledgerEntries.length} entries)` : r.problems.join('; '));
              }}
            >
              Verify
            </button>
          </dd>
        </div>
      </dl>
      <details>
        <summary>Last spin record</summary>
        <pre>{last ? JSON.stringify({ ...last, outcome: { ...last.outcome } }, null, 2) : 'none'}</pre>
      </details>
      <details>
        <summary>Active configuration (config/game.config.json)</summary>
        <pre>{JSON.stringify(game.config, null, 2)}</pre>
      </details>
    </div>
  );
}
