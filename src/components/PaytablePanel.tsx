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
        Values in credits at the current line bet of {credits(lineBet)} (total bet {credits(totalBet)}). Line wins pay
        the line bet times the value below; the scatter pays the total bet times its value.
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
                      <dt>{count}x</dt>
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
                    <dt>{count}x</dt>
                    <dd>{credits(v * totalBet)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      </div>

      <h3>Rules</h3>
      <ul className="rules">
        <li>
          {game.lineCount} fixed paylines. Wins pay left to right on consecutive reels starting from the leftmost reel.
        </li>
        <li>Only the highest win on each payline is paid. Wins on different paylines are added together.</li>
        <li>
          {wild.name} substitutes for all symbols except {scatter.name}. Where a run of {wild.name} symbols alone pays
          more than the substituted combination, the {wild.name} combination is paid instead.
        </li>
        <li>{scatter.name} pays in any position, independent of paylines, and is added to line wins.</li>
        <li>
          {Object.entries(fs.triggerAwards)
            .map(([c, v]) => `${c} or more ${scatter.name} symbols award ${v} free spins`)
            .slice(0, 1)}
          . Free spins are played at the bet of the triggering spin and never cost a stake.
        </li>
        <li>
          During free spins all wins are multiplied by {free.winMultiplier}; line wins that include a {wild.name} are
          additionally multiplied by {free.wildMultiplier} (once per line).
        </li>
        <li>
          {fs.retrigger.enabled
            ? `Free spins can be retriggered: ${Object.entries(fs.retrigger.awards)
                .map(([c, v]) => `${c}+ scatters award ${v} more`)
                .join(
                  ', ',
                )}${fs.retrigger.maxTotalSpins !== null ? `, up to ${fs.retrigger.maxTotalSpins} free spins per feature` : ''}.`
            : 'Free spins cannot be retriggered.'}
        </li>
        {cfg.limits.maxWinMultiplier !== null && (
          <li>
            The total win of one game round (paid spin plus its free spins) is capped at{' '}
            {credits(cfg.limits.maxWinMultiplier)}x the total bet ({credits(cfg.limits.maxWinMultiplier * totalBet)}{' '}
            credits). When the cap is reached the round ends.
          </li>
        )}
        <li>Displayed wins are the credits added to the balance; they do not include the stake.</li>
        <li>
          Theoretical return to player:{' '}
          {exact ? (
            <strong>{pct(exact.rtp.total, 2)}</strong>
          ) : (
            <em>not available for this configuration (run npm run analyze)</em>
          )}
          , calculated per unit of base-game stake including free spins. Individual sessions vary widely.
        </li>
        <li>This is a play-money prototype. Credits have no monetary value and cannot be bought or cashed out.</li>
      </ul>

      <h3>Paylines</h3>
      <div className="paylines">
        {cfg.paylines.map((rows, i) => (
          <PaylineGrid key={i} index={i} rows={rows} reels={game.reels} />
        ))}
      </div>
    </div>
  );
}
