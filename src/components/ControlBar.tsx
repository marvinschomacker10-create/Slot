import type { CompiledGame } from '../config';
import { credits } from '../app/format';
import type { UiPhase } from '../app/useSlotGame';

interface Props {
  readonly game: CompiledGame;
  readonly lineBetIndex: number;
  readonly phase: UiPhase;
  readonly inFeature: boolean;
  /** Bet changes are refused while the session has an open free-spins round. */
  readonly betLocked: boolean;
  readonly canSpin: boolean;
  readonly win: number | null;
  readonly turbo: boolean;
  readonly onBet: (index: number) => void;
  readonly onSpin: () => void;
  readonly onTurbo: () => void;
  readonly onShowLines: (on: boolean) => void;
}

export function ControlBar({
  game,
  lineBetIndex,
  phase,
  inFeature,
  betLocked: lockedBySession,
  canSpin,
  win,
  turbo,
  onBet,
  onSpin,
  onTurbo,
  onShowLines,
}: Props) {
  const lineBet = game.lineBetOptions[lineBetIndex]!;
  const betLocked = lockedBySession || inFeature || phase === 'spinning';
  const spinning = phase === 'spinning';
  return (
    <div className="controls" role="group" aria-label="Game controls">
      <div className="controls__bet">
        <span className="label" id="bet-label">
          Bet
        </span>
        <div className="stepper" aria-labelledby="bet-label">
          <button
            type="button"
            className="icon-button"
            onClick={() => onBet(lineBetIndex - 1)}
            disabled={betLocked || lineBetIndex === 0}
            aria-label="Decrease bet"
          >
            −
          </button>
          <output className="value" data-testid="total-bet" aria-live="polite">
            {credits(lineBet * game.lineCount)}
          </output>
          <button
            type="button"
            className="icon-button"
            onClick={() => onBet(lineBetIndex + 1)}
            disabled={betLocked || lineBetIndex === game.lineBetOptions.length - 1}
            aria-label="Increase bet"
          >
            +
          </button>
        </div>
        <span className="hint">
          {credits(lineBet)} × {game.lineCount} lines
        </span>
      </div>

      <div className="controls__spin">
        <button
          type="button"
          className={`spin-button${spinning ? ' is-spinning' : ''}${inFeature ? ' is-feature' : ''}`}
          onClick={onSpin}
          disabled={!canSpin && !spinning}
          aria-label={spinning ? 'Stop reels' : inFeature ? 'Play free spin' : 'Spin'}
          data-testid="spin-button"
        >
          <span>{spinning ? 'STOP' : inFeature ? 'FREE' : 'SPIN'}</span>
        </button>
      </div>

      <div className="controls__win">
        <span className="label">Win</span>
        <output className="value value--win" data-testid="last-win" aria-live="off">
          {win === null ? '–' : credits(win)}
        </output>
        <div className="controls__toggles">
          <button
            type="button"
            className={`chip${turbo ? ' is-on' : ''}`}
            aria-pressed={turbo}
            onClick={onTurbo}
            title="Fast spin (T)"
          >
            ⚡ Fast
          </button>
          <button
            type="button"
            className="chip"
            onMouseEnter={() => onShowLines(true)}
            onMouseLeave={() => onShowLines(false)}
            onFocus={() => onShowLines(true)}
            onBlur={() => onShowLines(false)}
            disabled={spinning}
            aria-label={`Show all ${game.lineCount} paylines`}
          >
            {game.lineCount} lines
          </button>
        </div>
      </div>
    </div>
  );
}
