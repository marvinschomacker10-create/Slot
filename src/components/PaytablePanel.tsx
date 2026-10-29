import type { CompiledGame } from '../config';
import { credits, pct } from '../app/format';
import { theory, theoryMatches } from '../app/theory';
import { PaylineGrid } from './PaylineGrid';
import { SymbolIcon } from './SymbolIcon';

export function PaytablePanel({ game, lineBet }: { game: CompiledGame; lineBet: number }) {
  const cfg = game.config;
  const totalBet = lineBet * game.lineCount;
  const regulars = cfg.symbols.filter((s) => s.kind !== 'scatter');
  const scatter = cfg.symbols.find((s) => s.kind === 'scatter')!;
  const wild = cfg.symbols.find((s) => s.kind === 'wild')!;
  const fs = cfg.freeSpins;
  const free = cfg.modes.free;
  const exact = theoryMatches(game) ? theory : null;
  return (
    <div className="paytable" data-testid="paytable">
      <p className="muted">
        Werte in Credits beim aktuellen Linieneinsatz von {credits(lineBet)} (Gesamteinsatz {credits(totalBet)}).
        Liniengewinne zahlen den Linieneinsatz mal Faktor, die {scatter.name} zahlt den Gesamteinsatz mal Faktor.
      </p>
      <div className="paytable__grid">
        {[...regulars].reverse().map((s) => {
          const pays = Object.entries(cfg.paytable.line[s.id] ?? {}).sort((a, b) => Number(b[0]) - Number(a[0]));
          return (
            <div key={s.id} className="paytable__card">
              <SymbolIcon id={s.id} size={64} label={s.name} />
              <div>
                <h3>{s.name}</h3>
                <dl>
                  {pays.map(([count, v]) => (
                    <div key={count}>
                      <dt>{count}×</dt>
                      <dd>{credits(v * lineBet)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          );
        })}
        <div className="paytable__card">
          <SymbolIcon id={scatter.id} size={64} label={scatter.name} />
          <div>
            <h3>{scatter.name}</h3>
            <dl>
              {Object.entries(cfg.paytable.scatter)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([count, v]) => (
                  <div key={count}>
                    <dt>{count}×</dt>
                    <dd>{credits(v * totalBet)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      </div>

      <h3>Regeln</h3>
      <ul className="rules">
        <li>
          {game.lineCount} feste Gewinnlinien. Gewinne zählen von links nach rechts auf aufeinanderfolgenden Walzen,
          beginnend mit der linken Walze.
        </li>
        <li>Pro Linie wird nur der höchste Gewinn gezahlt. Gewinne auf verschiedenen Linien werden addiert.</li>
        <li>
          Die {wild.name} (Wild) ersetzt alle Symbole außer der {scatter.name}. Zahlt eine Reihe aus {wild.name}
          -Symbolen allein mehr als die ersetzte Kombination, wird die {wild.name}-Kombination gezahlt.
        </li>
        <li>
          Die {scatter.name} (Scatter) zahlt an jeder Position, unabhängig von den Linien, zusätzlich zu Liniengewinnen.
        </li>
        <li>
          {Object.entries(fs.triggerAwards)
            .map(([c, v]) => `${c} oder mehr Symbole „${scatter.name}“ bringen ${v} Freispiele`)
            .slice(0, 1)}
          . Freispiele laufen mit dem Einsatz des auslösenden Drehs und kosten nie einen Einsatz.
        </li>
        <li>
          In den Freispielen werden alle Gewinne mit {free.winMultiplier} multipliziert; Liniengewinne mit einer{' '}
          {wild.name} zusätzlich mit {free.wildMultiplier} (einmal pro Linie).
        </li>
        <li>
          {fs.retrigger.enabled
            ? `Freispiele können erneut ausgelöst werden: ${Object.entries(fs.retrigger.awards)
                .map(([c, v]) => `${c}+ Scatter bringen ${v} weitere`)
                .join(
                  ', ',
                )}${fs.retrigger.maxTotalSpins !== null ? `, höchstens ${fs.retrigger.maxTotalSpins} Freispiele pro Feature` : ''}.`
            : 'Freispiele können nicht erneut ausgelöst werden.'}
        </li>
        {cfg.limits.maxWinMultiplier !== null && (
          <li>
            Der Gesamtgewinn einer Spielrunde (bezahlter Dreh plus Freispiele) ist auf das{' '}
            {credits(cfg.limits.maxWinMultiplier)}-Fache des Gesamteinsatzes begrenzt (
            {credits(cfg.limits.maxWinMultiplier * totalBet)} Credits). Wird die Grenze erreicht, endet die Runde.
          </li>
        )}
        <li>
          Angezeigte Gewinne sind die Credits, die dem Konto gutgeschrieben werden; der Einsatz ist nicht enthalten.
        </li>
        <li>
          Theoretische Auszahlungsquote (RTP):{' '}
          {exact ? (
            <strong>{pct(exact.rtp.total, 2)}</strong>
          ) : (
            <em>für diese Konfiguration nicht verfügbar (npm run analyze ausführen)</em>
          )}
          , berechnet je Einheit Grundspiel-Einsatz inklusive Freispielen. Einzelne Sitzungen schwanken stark.
        </li>
        <li>
          Dies ist ein Spielgeld-Prototyp. Credits haben keinen Geldwert und können weder gekauft noch ausgezahlt
          werden.
        </li>
      </ul>

      <h3>Gewinnlinien</h3>
      <div className="paylines">
        {cfg.paylines.map((rows, i) => (
          <PaylineGrid key={i} index={i} rows={rows} reels={game.reels} />
        ))}
      </div>
    </div>
  );
}
