import type { CompiledGame } from '../config';
import type { RoundRecord } from '../game/state/session';
import { credits, multiple } from '../app/format';
import { WindowGrid } from './WindowGrid';

export function HistoryPanel({ game, history }: { game: CompiledGame; history: readonly RoundRecord[] }) {
  if (history.length === 0) return <p className="muted">No rounds played yet in this session.</p>;
  return (
    <div className="history" data-testid="history">
      <p className="muted">
        Most recent {history.length} rounds of this session (newest first). Each round is one paid spin plus its free
        spins.
      </p>
      <ul>
        {history.map((r) => (
          <li key={r.roundId}>
            <details>
              <summary>
                <span className="history__id">{r.roundId}</span>
                <span>{new Date(r.startedAt).toLocaleTimeString()}</span>
                <span>Bet {credits(r.totalBet)}</span>
                <span className={r.totalWin > 0 ? 'win' : 'muted'}>Win {credits(r.totalWin)}</span>
                <span className={r.net >= 0 ? 'win' : 'muted'}>
                  Net {r.net >= 0 ? '+' : ''}
                  {credits(r.net)}
                </span>
                {r.featureTriggered && <span className="tag">{r.freeSpinsPlayed} free spins</span>}
                {r.capReached && <span className="tag">max win</span>}
              </summary>
              <ol className="history__spins">
                {r.spins.map((s) => {
                  const hi = new Set<string>();
                  for (const w of s.lineWins) {
                    const line = game.config.paylines[w.lineIndex]!;
                    for (let reel = 0; reel < w.count; reel++) hi.add(`${reel}:${line[reel]}`);
                  }
                  return (
                    <li key={s.spinId}>
                      <div className="history__spin-head">
                        <strong>{s.mode === 'base' ? 'Paid spin' : `Free spin ${s.index}`}</strong>
                        <span>stops [{s.stops.join(', ')}]</span>
                        <span>win {credits(s.credited)}</span>
                        {s.credited > 0 && <span className="muted">({multiple(s.credited / r.totalBet)} bet)</span>}
                      </div>
                      <WindowGrid window={s.window} highlight={hi} size={22} />
                      {(s.lineWins.length > 0 || s.scatterWin > 0) && (
                        <ul className="history__wins">
                          {s.lineWins.map((w) => (
                            <li key={w.lineIndex}>
                              Line {w.lineIndex + 1}: {w.count} x {w.symbol} = {credits(w.win)}
                            </li>
                          ))}
                          {s.scatterWin > 0 && (
                            <li>
                              {s.scatterCount} scatters = {credits(s.scatterWin)}
                            </li>
                          )}
                          {s.freeSpinsGranted > 0 && <li>+{s.freeSpinsGranted} free spins</li>}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
