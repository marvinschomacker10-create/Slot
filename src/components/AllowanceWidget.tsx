import { useEffect, useState } from 'react';
import { credits } from '../app/format';
import { formatCountdown } from '../game/state/allowance';
import type { GameSession } from '../game/state/session';

interface Props {
  readonly session: GameSession;
  /** Collecting is paused while the reels spin. */
  readonly disabled: boolean;
  readonly onCollect: () => void;
  /** "panel" sits in the top bar; "inline" is the compact form inside the low-balance notice. */
  readonly variant?: 'panel' | 'inline';
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Countdown to the next play-money allowance ("Taschengeld") and the button to collect it. */
export function AllowanceWidget({ session, disabled, onCollect, variant = 'panel' }: Props) {
  const now = useNow(1000);
  const status = session.allowanceStatus(now);
  if (!status.enabled) return null;
  const minutes = Math.round(status.intervalMs / 60000);
  const done = status.intervalMs > 0 ? 1 - status.remainingMs / status.intervalMs : 1;
  const testId = variant === 'panel' ? 'allowance' : 'allowance-inline';
  return (
    <div className={`allowance allowance--${variant}${status.available ? ' is-ready' : ''}`} data-testid={testId}>
      {variant === 'panel' && (
        <span className="label">
          Taschengeld{' '}
          <span className="allowance__rule">
            +{credits(status.amount)} alle {minutes} Min.
          </span>
        </span>
      )}
      {status.available ? (
        <button
          type="button"
          className="allowance__collect"
          onClick={onCollect}
          disabled={disabled}
          data-testid={`${testId}-collect`}
        >
          +{credits(status.amount)} abholen
        </button>
      ) : (
        <span className="allowance__wait">
          <span className="allowance__timer" role="timer" data-testid={`${testId}-timer`}>
            {variant === 'inline' ? 'Nächstes Taschengeld in ' : 'nächstes in '}
            {formatCountdown(status.remainingMs)}
          </span>
          {variant === 'panel' && (
            <span className="allowance__bar" aria-hidden="true">
              <span style={{ width: `${Math.round(done * 100)}%` }} />
            </span>
          )}
        </span>
      )}
      {variant === 'panel' && (
        <span className="sr-only" aria-live="polite">
          {status.available ? `Taschengeld bereit: ${credits(status.amount)} Credits` : ''}
        </span>
      )}
    </div>
  );
}
