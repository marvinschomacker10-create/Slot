import { useState } from 'react';
import type { CompiledGame } from '../config';
import type { SessionStats } from '../game/state/session';
import { credits, multiple, oneIn, pct, probability } from '../app/format';
import { theory, theoryMatches } from '../app/theory';
import { BandChart } from './BandChart';
import { SimulationRunner } from './SimulationRunner';

type Tab = 'session' | 'theory' | 'simulate';

export function StatsPanel({ game, stats }: { game: CompiledGame; stats: SessionStats }) {
  const [tab, setTab] = useState<Tab>('session');
  const exact = theoryMatches(game) ? theory : null;
  const tabs: [Tab, string][] = [
    ['session', 'This session'],
    ['theory', 'Theoretical model'],
    ['simulate', 'Simulation'],
  ];
  return (
    <div className="stats" data-testid="stats">
      <div className="tabs" role="tablist" aria-label="Statistics views">
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
            <Item k="Rounds completed" v={credits(stats.rounds)} />
            <Item k="Paid spins / free spins" v={`${credits(stats.paidSpins)} / ${credits(stats.freeSpins)}`} />
            <Item k="Total staked" v={credits(stats.totalStaked)} />
            <Item k="Total won" v={credits(stats.totalWon)} />
            <Item
              k="Net result"
              v={`${stats.totalWon - stats.totalStaked >= 0 ? '+' : ''}${credits(stats.totalWon - stats.totalStaked)}`}
            />
            <Item k="Session return" v={stats.totalStaked > 0 ? pct(stats.totalWon / stats.totalStaked) : '–'} />
            <Item k="Winning rounds" v={stats.rounds > 0 ? pct(stats.winningRounds / stats.rounds) : '–'} />
            <Item k="Free-spin features" v={credits(stats.featuresTriggered)} />
            <Item
              k="Biggest round win"
              v={`${credits(stats.biggestRoundWin)} (${multiple(stats.biggestRoundMultiplier)} bet)`}
            />
          </dl>
          <p className="muted">
            Short sessions vary widely around the theoretical return. With the standard deviation of this game, the
            session return after 1,000 paid spins has a standard deviation of about{' '}
            {exact
              ? `${((exact.round.sd / Math.sqrt(1000)) * 100).toFixed(0)} percentage points`
              : 'several percentage points'}
            .
          </p>
        </div>
      )}

      {tab === 'theory' && (
        <div role="tabpanel">
          {!exact ? (
            <p className="error">
              The bundled analysis was produced for a different configuration. Run <code>npm run analyze</code>.
            </p>
          ) : (
            <>
              <p className="muted">
                Exact values from full enumeration of {exact.method.baseCombinations.toLocaleString('en-US')} base and{' '}
                {exact.method.freeCombinations.toLocaleString('en-US')} free-spin reel combinations (config{' '}
                {exact.game.configHash.slice(0, 12)}). RTP is per unit of base-game stake, including free spins.
              </p>
              <dl className="kv">
                <Item k="Total RTP" v={pct(exact.rtp.total, 3)} strong />
                <Item k="Base game / free spins" v={`${pct(exact.rtp.base, 2)} / ${pct(exact.rtp.feature, 2)}`} />
                <Item k="Hit frequency" v={pct(exact.round.hitFrequency, 2)} />
                <Item k="Net-positive rounds" v={pct(exact.round.probabilityNetPositive, 2)} />
                <Item k="Free spins trigger" v={oneIn(exact.feature.triggerProbability)} />
                <Item k="Average feature win" v={`${multiple(exact.feature.expectedWin, 1)} bet`} />
                <Item k="SD per unit stake" v={`${exact.round.sd.toFixed(2)} (${exact.volatility.classification})`} />
                <Item
                  k="Max base / free spin win"
                  v={`${multiple(exact.round.maxBaseSpinWin)} / ${multiple(exact.round.maxFreeSpinWin)} bet`}
                />
                <Item
                  k="P(round >= 100x bet)"
                  v={probability(exact.round.thresholds.find((t) => t.multiplier === 100)?.probability ?? 0)}
                />
              </dl>
              <div className="stats__chart">
                <BandChart
                  title="Share of RTP by round payout (x total bet)"
                  data={exact.round.bands
                    .filter((b) => b.probability > 0 && b.rtpContribution > 0)
                    .map((b) => ({ label: b.label, value: b.rtpContribution, probability: b.probability }))}
                />
                <div className="table-scroll">
                  <table className="data-table">
                    <caption>Round payout bands</caption>
                    <thead>
                      <tr>
                        <th scope="col">Payout (x bet)</th>
                        <th scope="col">Probability</th>
                        <th scope="col">RTP share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exact.round.bands.map((b) => (
                        <tr key={b.label}>
                          <th scope="row">{b.label}</th>
                          <td>{probability(b.probability)}</td>
                          <td>{pct(b.rtpContribution, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="muted">{exact.volatility.caveats[0]}</p>
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
