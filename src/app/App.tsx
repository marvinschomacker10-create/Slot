import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDefaultGame } from '../config';
import { Banner } from '../components/Banner';
import { ControlBar } from '../components/ControlBar';
import { DevPanel } from '../components/DevPanel';
import { HelpPanel } from '../components/HelpPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { Modal } from '../components/Modal';
import { PaytablePanel } from '../components/PaytablePanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { StatsPanel } from '../components/StatsPanel';
import { ReelStage } from '../render/ReelStage';
import { credits } from './format';
import { createRng, readRuntimeFlags } from './runtime';
import { useSettings } from './settings';
import { useSlotGame } from './useSlotGame';

type Panel = 'paytable' | 'help' | 'history' | 'stats' | 'settings' | 'dev' | null;

declare global {
  interface Window {
    __GILDED_ORBIT__?: Record<string, unknown>;
  }
}

export function App() {
  const game = useMemo(() => getDefaultGame(), []);
  const flags = useMemo(() => readRuntimeFlags(), []);
  const [settings, updateSettings] = useSettings({
    ...(flags.forceTurbo ? { turbo: true } : {}),
    ...(flags.forceReducedMotion ? { reducedMotion: true } : {}),
  });
  const rngFactory = useCallback(() => createRng(flags), [flags]);
  const slot = useSlotGame(game, rngFactory, settings);
  const [panel, setPanel] = useState<Panel>(null);
  const snap = slot.snapshot;
  // What the player sees must never run ahead of the reels, so the feature UI follows
  // the revealed state; the settled session phase is only used to gate actions.
  const feature = slot.displayFeature;
  const inFeature = feature !== null;
  const sessionInFeature = snap.phase === 'free-spins';

  const sceneSetup = useMemo(
    () => ({
      reels: game.reels,
      rows: game.rows,
      symbols: game.symbolIds,
      strips: {
        base: game.config.reelSets[game.config.modes.base.reelSet]!.map((s) => s.symbols),
        free: game.config.reelSets[game.config.modes.free.reelSet]!.map((s) => s.symbols),
      },
      paylines: game.config.paylines,
      scatter: game.symbolIds[game.scatter]!,
      anticipateFrom: Math.max(1, Math.min(...Object.keys(game.config.freeSpins.triggerAwards).map(Number)) - 1),
      initialStops: game.config.reelSets[game.config.modes.base.reelSet]!.map(() => 0),
    }),
    [game],
  );

  // Test and diagnostics hook (development builds only).
  useEffect(() => {
    if (!flags.dev) return;
    window.__GILDED_ORBIT__ = {
      configHash: game.hash,
      snapshot: () => slot.session.getSnapshot(),
      displayedWindow: () => slot.controller.displayedWindow(),
      uiPhase: () => slot.phase,
      rendererReady: () => slot.controller.ready,
      lastRevealed: () => slot.lastRevealed,
      windowMismatches: () => slot.windowMismatches,
    };
  });

  const changeBet = useCallback(
    (delta: number) => {
      const next = snap.lineBetIndex + delta;
      if (next >= 0 && next < game.lineBetOptions.length && !sessionInFeature && slot.phase !== 'spinning') slot.setLineBetIndex(next);
    },
    [game, sessionInFeature, slot, snap.lineBetIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panel || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      const interactive = t && (t.closest('button, a, input, select, textarea, summary, [contenteditable="true"]') !== null);
      if ((e.key === ' ' || e.key === 'Enter') && !interactive) {
        e.preventDefault();
        if (slot.banner) slot.dismissBanner();
        else slot.spin();
      } else if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp') {
        if (!interactive || e.key !== 'ArrowUp') changeBet(1);
      } else if (e.key === '-' || e.key === 'ArrowDown') {
        if (!interactive || e.key !== 'ArrowDown') changeBet(-1);
      } else if (e.key === 't' || e.key === 'T') updateSettings({ turbo: !settings.turbo });
      else if (e.key === 'p' || e.key === 'P') setPanel('paytable');
      else if (e.key === 'h' || e.key === 'H') setPanel('help');
      else if (e.key === 's' || e.key === 'S') setPanel('stats');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, slot, changeBet, settings.turbo, updateSettings]);

  const lowBalance = !sessionInFeature && slot.phase !== 'spinning' && snap.balance < snap.totalBet;
  const close = useCallback(() => setPanel(null), []);
  const displayed = slot.controller.displayedWindow();

  return (
    <div className={`app${inFeature ? ' app--feature' : ''}`}>
      <a className="skip-link" href="#spin-area">
        Skip to game controls
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ✦
          </span>
          <div>
            <h1>{game.config.meta.name}</h1>
            <p className="brand__tag">Play-money prototype · not real money</p>
          </div>
        </div>
        <div className="balance" aria-label="Balance">
          <span className="label">Balance</span>
          <output className="value" data-testid="balance">
            {credits(slot.displayBalance)}
          </output>
        </div>
        <nav className="menu" aria-label="Game information">
          <button type="button" className="chip" onClick={() => setPanel('paytable')}>
            Paytable
          </button>
          <button type="button" className="chip" onClick={() => setPanel('help')}>
            Help
          </button>
          <button type="button" className="chip" onClick={() => setPanel('history')}>
            History
          </button>
          <button type="button" className="chip" onClick={() => setPanel('stats')} data-testid="open-stats">
            Statistics
          </button>
          <button type="button" className="chip" onClick={() => setPanel('settings')} aria-label="Settings">
            ⚙
          </button>
          {flags.dev && (
            <button type="button" className="chip chip--dev" onClick={() => setPanel('dev')}>
              Dev
            </button>
          )}
        </nav>
      </header>

      <main className="stage">
        <div className={`feature-bar${inFeature ? ' is-visible' : ''}`} aria-hidden={!inFeature} data-testid="feature-bar">
          {feature && (
            <>
              <span>
                Free spins played <strong data-testid="free-spins-played">{feature.played}</strong> of <strong>{feature.totalAwarded}</strong>
              </span>
              <span>
                Feature win <strong>{credits(feature.totalWin)}</strong>
              </span>
              <span className="muted">
                Wins ×{game.config.modes.free.winMultiplier} · Wild wins ×{game.config.modes.free.wildMultiplier}
              </span>
            </>
          )}
        </div>
        <div className="reels-wrap">
          <ReelStage controller={slot.controller} setup={sceneSetup} label="Slot reels" />
          {slot.banner && <Banner banner={slot.banner} onDismiss={slot.dismissBanner} reducedMotion={settings.reducedMotion} />}
        </div>
        <p className="message" data-testid="message">
          {slot.message}
        </p>
        <div className="sr-only" aria-live="polite" data-testid="announcer">
          {slot.announcement}
        </div>
        {displayed && (
          <div className="sr-only">
            <table aria-label="Symbols currently shown, top row first">
              <tbody>
                {Array.from({ length: game.rows }, (_, row) => (
                  <tr key={row}>
                    {displayed.map((col, reel) => (
                      <td key={reel}>{game.config.symbols.find((s) => s.id === col[row])?.name ?? col[row]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="dock" id="spin-area">
        <ControlBar
          game={game}
          lineBetIndex={snap.lineBetIndex}
          phase={slot.phase}
          inFeature={inFeature}
          betLocked={sessionInFeature}
          canSpin={slot.canSpin}
          win={slot.displayWin}
          turbo={settings.turbo}
          onBet={(i) => slot.setLineBetIndex(i)}
          onSpin={slot.spin}
          onTurbo={() => updateSettings({ turbo: !settings.turbo })}
          onShowLines={(on) => slot.previewLines(on ? game.config.paylines.map((_, i) => i) : null)}
        />
        {lowBalance && (
          <div className="low-balance" role="alert">
            Not enough play-money credits for this bet.{' '}
            <button type="button" className="button button--small" onClick={slot.resetSession}>
              Reset balance to {credits(game.startingBalance)}
            </button>
          </div>
        )}
      </footer>

      {panel === 'paytable' && (
        <Modal title="Paytable and rules" onClose={close} wide testId="paytable-dialog">
          <PaytablePanel game={game} lineBet={snap.lineBet} />
        </Modal>
      )}
      {panel === 'help' && (
        <Modal title="Help" onClose={close}>
          <HelpPanel />
        </Modal>
      )}
      {panel === 'history' && (
        <Modal title="Game history" onClose={close} wide>
          <HistoryPanel game={game} history={snap.history} />
        </Modal>
      )}
      {panel === 'stats' && (
        <Modal title="Statistics" onClose={close} wide testId="stats-dialog">
          <StatsPanel game={game} stats={snap.stats} />
        </Modal>
      )}
      {panel === 'settings' && (
        <Modal title="Settings" onClose={close}>
          <SettingsPanel settings={settings} onChange={updateSettings} />
        </Modal>
      )}
      {panel === 'dev' && flags.dev && (
        <Modal title="Developer diagnostics" onClose={close} wide>
          <DevPanel game={game} session={slot.session} controller={slot.controller} last={slot.lastRevealed} seed={flags.seed} mismatches={slot.windowMismatches} />
        </Modal>
      )}
    </div>
  );
}
