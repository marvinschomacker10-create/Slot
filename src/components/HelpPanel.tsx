import type { CompiledGame } from '../config';
import { credits } from '../app/format';

export function HelpPanel({ game }: { game: CompiledGame }) {
  const allowance = game.allowance;
  const scatter = game.config.symbols.find((s) => s.kind === 'scatter')!;
  const minTrigger = Math.min(...Object.keys(game.config.freeSpins.triggerAwards).map(Number));
  return (
    <div className="help">
      <h3>So wird gespielt</h3>
      <ol>
        <li>
          Wähle mit − und + den Linieneinsatz. Der Gesamteinsatz ist der Linieneinsatz mal {game.lineCount}{' '}
          Gewinnlinien.
        </li>
        <li>
          Drücke DREHEN (oder die Leertaste). Der Einsatz wird abgebucht und das Ergebnis sofort von der Spiel-Engine
          entschieden.
        </li>
        <li>Danach laufen die Walzen zu diesem Ergebnis. Die Animationsgeschwindigkeit ändert nie den Gewinn.</li>
        <li>
          {minTrigger} oder mehr Symbole „{scatter.name}“ starten Freispiele. Sie laufen automatisch, außer du schaltest
          das in den Einstellungen ab.
        </li>
      </ol>
      <h3>Taschengeld (Spielgeld)</h3>
      {allowance ? (
        <p>
          Alle {Math.round(allowance.intervalMs / 60000)} Minuten kannst du {credits(allowance.amount)}{' '}
          Spielgeld-Credits als Taschengeld abholen. Nicht abgeholtes Taschengeld sammelt sich nicht an: Du bekommst
          höchstens eine Auszahlung pro Zeitraum. Dein Kontostand, der Einsatz und der Taschengeld-Timer werden in
          diesem Browser gespeichert (localStorage), unfertige Freispiele werden nach dem Neuladen fortgesetzt.
          Spielgeld hat keinen Wert und kann weder gekauft noch ausgezahlt werden.
        </p>
      ) : (
        <p>In dieser Konfiguration ist das Taschengeld abgeschaltet.</p>
      )}
      <h3>Tastatur</h3>
      <dl className="shortcuts">
        <div>
          <dt>Leertaste / Enter</dt>
          <dd>Drehen (während des Drehens erneut drücken, um schnell zu stoppen)</dd>
        </div>
        <div>
          <dt>+ / −, ↑ / ↓</dt>
          <dd>Einsatz ändern</dd>
        </div>
        <div>
          <dt>T</dt>
          <dd>Schnelldrehen an/aus</dd>
        </div>
        <div>
          <dt>P, H, S, G</dt>
          <dd>Gewinntabelle, Hilfe, Statistik öffnen, Taschengeld abholen</dd>
        </div>
        <div>
          <dt>Esc</dt>
          <dd>Dialog schließen</dd>
        </div>
      </dl>
      <h3>Über diesen Prototyp</h3>
      <p>
        {game.config.meta.name} ist ein eigenständiger Spielgeld-Prototyp zum Bewerten von Spielregeln, Mathematik und
        Darstellung. Er ist nicht zertifiziert, von keiner Behörde zugelassen und nicht mit Echtgeld verbunden. Die
        Ergebnisse entstehen in deinem Browser mit dem Web-Crypto-Zufallszahlengenerator, der nur für Spielgeld geeignet
        ist. Was ein Echtgeldbetrieb erfordern würde, steht in docs/REGULATORY_READINESS.md.
      </p>
      <p>
        Glücksspiel kann süchtig machen. Wenn du oder jemand, den du kennst, Probleme mit Glücksspiel hat, such dir
        Unterstützung, zum Beispiel bei der BZgA (check-dein-spiel.de) oder einer örtlichen Beratungsstelle.
      </p>
    </div>
  );
}
