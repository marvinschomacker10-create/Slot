import type { CompiledGame } from '../../config/compile';
import { paylineDiagram } from '../../game/paylines';

/**
 * Renders docs/SPECIFICATION.md: the complete symbol, paytable, payline and reel-strip
 * specification, generated from the compiled configuration so it cannot drift from it.
 */
export function renderSpecification(game: CompiledGame, generatedAt: string): string {
  const c = game.config;
  const out: string[] = [];
  const p = (s = '') => out.push(s);
  const row = (cells: readonly (string | number)[]) => `| ${cells.join(' | ')} |`;
  const header = (cells: readonly string[]) => [row(cells), `|${cells.map(() => '---').join('|')}|`].join('\n');

  p(`# Game specification: ${c.meta.name} ${c.meta.version}`);
  p();
  p(`Generated from \`config/game.config.json\` by \`npm run report\` on ${generatedAt}. Configuration hash (SHA-256 of canonical JSON): \`${game.hash}\`. The configuration file is authoritative; this document is a readable rendering of it.`);
  p();

  p('## Grid, bets and limits');
  p();
  p(header(['Parameter', 'Value']));
  p(row(['Reels x rows', `${game.reels} x ${game.rows}`]));
  p(row(['Paylines', `${game.lineCount}, fixed (all always active)`]));
  p(row(['Line bet options (credits)', game.lineBetOptions.join(', ')]));
  p(row(['Total bet options (credits)', game.lineBetOptions.map((b) => b * game.lineCount).join(', ')]));
  p(row(['Default line bet', String(game.lineBetOptions[game.defaultLineBetIndex])]));
  p(row(['Starting play-money balance', String(game.startingBalance)]));
  p(row(['Round win cap', game.maxWinMultiplier === null ? 'none' : `${game.maxWinMultiplier} x total bet`]));
  p(row(['RTP design target', `${(c.math.targetRtp * 100).toFixed(2)}% (a target, not a guarantee; see RTP_REPORT.md)`]));
  p();

  p('## Symbols and line pays');
  p();
  p('Line pays are multiples of the line bet for a left-to-right combination of exactly that length starting on reel 1 (a longer combination than listed pays the largest listed length).');
  p();
  const counts = Array.from({ length: game.reels }, (_, i) => i + 1).filter((n) => Object.values(c.paytable.line).some((t) => String(n) in t));
  p(header(['Id', 'Name', 'Kind', 'Tier', ...counts.map((n) => `${n} of a kind`)]));
  for (const s of c.symbols) {
    const t = c.paytable.line[s.id];
    p(row([`\`${s.id}\``, s.name, s.kind, s.tier, ...counts.map((n) => (t && String(n) in t ? String(t[String(n)]) : s.kind === 'scatter' ? 'see scatter' : '-'))]));
  }
  p();
  const wild = c.symbols.find((s) => s.kind === 'wild')!;
  const scatter = c.symbols.find((s) => s.kind === 'scatter')!;
  p(`- **${wild.name}** (\`${wild.id}\`) substitutes for every regular symbol, never for ${scatter.name}. Its own row above is the Wild-only combination.`);
  p(`- **${scatter.name}** (\`${scatter.id}\`) pays by count anywhere in the window, as a multiple of the total bet, and selects the free-spins award.`);
  p();
  p(header(['Scatters visible', 'Scatter pay (x total bet)', 'Free spins (base game)', 'Free spins (retrigger)']));
  const keys = [
    ...Object.keys(c.paytable.scatter),
    ...Object.keys(c.freeSpins.triggerAwards),
    ...(c.freeSpins.retrigger.enabled ? Object.keys(c.freeSpins.retrigger.awards) : []),
  ].map(Number);
  const top = Math.max(...keys);
  for (let n = 1; n <= top; n++) {
    const pay = game.scatterPay[n]!;
    const award = game.modes.base.awards[n]!;
    const re = game.modes.free.awards[n]!;
    if (pay === 0 && award === 0 && re === 0) continue;
    p(row([n === top ? `${n} or more` : String(n), String(pay), String(award), String(re)]));
  }
  p();

  p('## Modes and multipliers');
  p();
  p(header(['Mode', 'Reel set', 'Wild multiplier (once per line win containing a Wild)', 'Win multiplier (all wins)', 'Scatter pays']));
  for (const m of ['base', 'free'] as const) {
    const mode = game.modes[m];
    p(row([m, mode.reelSet.name, String(mode.wildMultiplier), String(mode.winMultiplier), mode.scatterPays ? 'yes' : 'no']));
  }
  p();
  p(`Retriggers: ${game.retriggerEnabled ? 'enabled' : 'disabled'}; maximum free spins per feature: ${game.maxTotalFreeSpins ?? 'unlimited'} (awards that would exceed it are truncated).`);
  p();

  p('## Paylines');
  p();
  p('Row indices are 0 = top, 1 = middle, 2 = bottom, listed for reels 1 to 5.');
  p();
  p(header(['Line', 'Rows', 'Shape']));
  c.paylines.forEach((rows, i) => {
    p(row([String(i + 1), `[${rows.join(', ')}]`, `<code>${paylineDiagram(game, i).join('<br>')}</code>`]));
  });
  p();

  p('## Reel strips');
  p();
  p('Each strip is a cyclic list of physical stops. A spin draws one stop per reel uniformly at random (all weights are 1 unless listed). For stop s, the window shows stops s, s+1, s+2 (mod strip length) in the top, middle and bottom rows.');
  p();
  for (const [name, strips] of Object.entries(c.reelSets)) {
    p(`### Reel set \`${name}\``);
    p();
    const ids = c.symbols.map((s) => s.id);
    p(header(['Symbol', ...strips.map((_, i) => `Reel ${i + 1}`)]));
    for (const id of ids) p(row([`\`${id}\``, ...strips.map((s) => String(s.symbols.filter((x) => x === id).length))]));
    p(row(['**Stops**', ...strips.map((s) => `**${s.symbols.length}**`)]));
    p();
    strips.forEach((s, i) => {
      p(`Reel ${i + 1}${s.weights ? ' (weighted)' : ''}:`);
      p();
      p('```');
      const cellsText = s.symbols.map((sym, k) => `${String(k).padStart(2)} ${sym}${s.weights ? `(w${s.weights[k]})` : ''}`.padEnd(14));
      for (let k = 0; k < cellsText.length; k += 5) p(cellsText.slice(k, k + 5).join(' ').trimEnd());
      p('```');
      p();
    });
  }
  return out.join('\n');
}
