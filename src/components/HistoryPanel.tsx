import type { CompiledGame } from '../config';
import type { RoundRecord } from '../game/state/session';
import { credits, multiple } from '../app/format';
import { WindowGrid } from './WindowGrid';

export function HistoryPanel({ game, history }: { game: CompiledGame; history: readonly RoundRecord[] }) {
  const symbolName = (id: string) => game.config.symbols.find((s) => s.id === id)?.name ?? id;
  const scatterId = game.symbolIds[game.scatter]!;
  if (history.length === 0) return <p className="muted">In dieser Sitzung wurden noch keine Runden gespielt.</p>;
  return (
    <div className="history" data-testid="history">
      <p className="muted">
        Die letzten {history.length} Runden dieser Sitzung (neueste zuerst). Eine Runde ist ein bezahlter Dreh plus
        seine Freispiele. Der Verlauf gilt nur für diesen Tab und wird nicht gespeichert.
      </p>
      <ul>
        {history.map((r) => (
          <li key={r.roundId}>
            <details>
              <summary>
                <span className="history__id">{r.roundId}</span>
                <span>{new Date(r.startedAt).toLocaleTimeString('de-DE')}</span>
                <span>Einsatz {credits(r.totalBet)}</span>
                <span className={r.totalWin > 0 ? 'win' : 'muted'}>Gewinn {credits(r.totalWin)}</span>
                <span className={r.net >= 0 ? 'win' : 'muted'}>
                  Netto {r.net >= 0 ? '+' : ''}
                  {credits(r.net)}
                </span>
                {r.featureTriggered && <span className="tag">{r.freeSpinsPlayed} Freispiele</span>}
                {r.capReached && <span className="tag">Maximalgewinn</span>}
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
                        <strong>{s.mode === 'base' ? 'Bezahlter Dreh' : `Freispiel ${s.index}`}</strong>
                        <span>Stopps [{s.stops.join(', ')}]</span>
                        <span>Gewinn {credits(s.credited)}</span>
                        {s.credited > 0 && <span className="muted">({multiple(s.credited / r.totalBet)} Einsatz)</span>}
                      </div>
                      <WindowGrid window={s.window} highlight={hi} size={22} />
                      {(s.lineWins.length > 0 || s.scatterWin > 0) && (
                        <ul className="history__wins">
                          {s.lineWins.map((w) => (
                            <li key={w.lineIndex}>
                              Linie {w.lineIndex + 1}: {w.count} × {symbolName(w.symbol)} = {credits(w.win)}
                            </li>
                          ))}
                          {s.scatterWin > 0 && (
                            <li>
                              {s.scatterCount} × {symbolName(scatterId)} = {credits(s.scatterWin)}
                            </li>
                          )}
                          {s.freeSpinsGranted > 0 && <li>+{s.freeSpinsGranted} Freispiele</li>}
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
