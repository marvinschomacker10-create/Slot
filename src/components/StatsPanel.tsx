import { useState } from 'react';
import type { CompiledGame } from '../config';
import type { SessionStats } from '../game/state/session';
import { credits, multiple, oneIn, pct, probability } from '../app/format';
import { theory, theoryMatches } from '../app/theory';
import { BandChart } from './BandChart';
import { SimulationRunner } from './SimulationRunner';

type Tab = 'session' | 'theory' | 'simulate';

const VOLATILITY_DE = { low: 'niedrig', medium: 'mittel', high: 'hoch', 'very high': 'sehr hoch' } as const;

function bandLabel(label: string): string {
  return label === '0 (no win)' ? '0 (kein Gewinn)' : label.replace('>=', '≥');
}

export function StatsPanel({ game, stats }: { game: CompiledGame; stats: SessionStats }) {
  const [tab, setTab] = useState<Tab>('session');
  const exact = theoryMatches(game) ? theory : null;
  const tabs: [Tab, string][] = [
    ['session', 'Diese Sitzung'],
    ['theory', 'Theoretisches Modell'],
    ['simulate', 'Simulation'],
  ];
  return (
    <div className="stats" data-testid="stats">
      <div className="tabs" role="tablist" aria-label="Statistik-Ansichten">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab is-active' : 'tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'session' && (
        <div role="tabpanel">
          <dl className="kv">
            <Item k="Abgeschlossene Runden" v={credits(stats.rounds)} />
            <Item k="Bezahlte Drehs / Freispiele" v={`${credits(stats.paidSpins)} / ${credits(stats.freeSpins)}`} />
            <Item k="Gesamteinsatz" v={credits(stats.totalStaked)} />
            <Item k="Gesamtgewinn" v={credits(stats.totalWon)} />
            <Item
              k="Nettoergebnis"
              v={`${stats.totalWon - stats.totalStaked >= 0 ? '+' : ''}${credits(stats.totalWon - stats.totalStaked)}`}
            />
            <Item
              k="Auszahlungsquote der Sitzung"
              v={stats.totalStaked > 0 ? pct(stats.totalWon / stats.totalStaked) : '–'}
            />
            <Item k="Runden mit Gewinn" v={stats.rounds > 0 ? pct(stats.winningRounds / stats.rounds) : '–'} />
            <Item k="Freispiel-Features" v={credits(stats.featuresTriggered)} />
            <Item
              k="Taschengeld abgeholt"
              v={`${credits(stats.grants)}× (${credits(stats.totalGranted)} Credits, zählt nicht als Gewinn)`}
            />
            <Item
              k="Größter Rundengewinn"
              v={`${credits(stats.biggestRoundWin)} (${multiple(stats.biggestRoundMultiplier)} Einsatz)`}
            />
          </dl>
          <p className="muted">
            Kurze Sitzungen schwanken stark um die theoretische Quote. Bei der Standardabweichung dieses Spiels hat die
            Sitzungsquote nach 1.000 bezahlten Drehs eine Standardabweichung von etwa{' '}
            {exact
              ? `${((exact.round.sd / Math.sqrt(1000)) * 100).toFixed(0)} Prozentpunkten`
              : 'mehreren Prozentpunkten'}
            . Diese Werte gelten für diesen Tab seit dem Laden der Seite.
          </p>
        </div>
      )}

      {tab === 'theory' && (
        <div role="tabpanel">
          {!exact ? (
            <p className="error">
              Die mitgelieferte Analyse gehört zu einer anderen Konfiguration. Führe <code>npm run analyze</code> aus.
            </p>
          ) : (
            <>
              <p className="muted">
                Exakte Werte aus der vollständigen Aufzählung von {credits(exact.method.baseCombinations)} Grundspiel-
                und {credits(exact.method.freeCombinations)} Freispiel-Walzenkombinationen (Konfiguration{' '}
                {exact.game.configHash.slice(0, 12)}). Der RTP gilt je Einheit Grundspiel-Einsatz inklusive Freispielen.
              </p>
              <dl className="kv">
                <Item k="RTP gesamt" v={pct(exact.rtp.total, 3)} strong />
                <Item k="Grundspiel / Freispiele" v={`${pct(exact.rtp.base, 2)} / ${pct(exact.rtp.feature, 2)}`} />
                <Item k="Trefferquote" v={pct(exact.round.hitFrequency, 2)} />
                <Item k="Runden mit Nettogewinn" v={pct(exact.round.probabilityNetPositive, 2)} />
                <Item k="Freispiele ausgelöst" v={oneIn(exact.feature.triggerProbability)} />
                <Item k="Ø Feature-Gewinn" v={`${multiple(exact.feature.expectedWin, 1)} Einsatz`} />
                <Item
                  k="Standardabweichung je Einsatz"
                  v={`${exact.round.sd.toFixed(2).replace('.', ',')} (Volatilität ${VOLATILITY_DE[exact.volatility.classification]})`}
                />
                <Item
                  k="Max. Gewinn Grundspiel / Freispiel"
                  v={`${multiple(exact.round.maxBaseSpinWin)} / ${multiple(exact.round.maxFreeSpinWin)} Einsatz`}
                />
                <Item
                  k="P(Runde ≥ 100× Einsatz)"
                  v={probability(exact.round.thresholds.find((t) => t.multiplier === 100)?.probability ?? 0)}
                />
              </dl>
              <div className="stats__chart">
                <BandChart
                  title="RTP-Anteil nach Rundengewinn (× Gesamteinsatz)"
                  data={exact.round.bands
                    .filter((b) => b.probability > 0 && b.rtpContribution > 0)
                    .map((b) => ({ label: bandLabel(b.label), value: b.rtpContribution, probability: b.probability }))}
                />
                <div className="table-scroll">
                  <table className="data-table">
                    <caption>Rundengewinn-Bereiche</caption>
                    <thead>
                      <tr>
                        <th scope="col">Gewinn (× Einsatz)</th>
                        <th scope="col">Wahrscheinlichkeit</th>
                        <th scope="col">RTP-Anteil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exact.round.bands.map((b) => (
                        <tr key={b.label}>
                          <th scope="row">{bandLabel(b.label)}</th>
                          <td>{probability(b.probability)}</td>
                          <td>{pct(b.rtpContribution, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="muted">
                Die Volatilitätsklasse ist eine dokumentierte Projekt-Konvention (Standardabweichung &lt; 3 niedrig, 3–7
                mittel, 7–15 hoch, ≥ 15 sehr hoch), kein Branchen- oder Behördenstandard.
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'simulate' && (
        <div role="tabpanel">
          <SimulationRunner />
        </div>
      )}
    </div>
  );
}

function Item({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{strong ? <strong>{v}</strong> : v}</dd>
    </div>
  );
}
