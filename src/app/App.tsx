import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDefaultGame } from '../config';
import { AllowanceWidget } from '../components/AllowanceWidget';
import { Banner } from '../components/Banner';
import { ControlBar } from '../components/ControlBar';
import { DevPanel } from '../components/DevPanel';
import { HelpPanel } from '../components/HelpPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { Modal } from '../components/Modal';
import { PaytablePanel } from '../components/PaytablePanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { StatsPanel } from '../components/StatsPanel';
import { SymbolIcon } from '../components/SymbolIcon';
import { ReelStage } from '../render/ReelStage';
import { credits } from './format';
import { createRng, readRuntimeFlags } from './runtime';
import { useSettings } from './settings';
import { useSlotGame } from './useSlotGame';

type Panel = 'paytable' | 'help' | 'history' | 'stats' | 'settings' | 'dev' | null;

declare global {
  interface Window {
    __PIXEL_PAUKER__?: Record<string, unknown>;
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
  const wild = game.config.symbols.find((s) => s.kind === 'wild')!;
  const free = game.config.modes.free;

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
    window.__PIXEL_PAUKER__ = {
      configHash: game.hash,
      snapshot: () => slot.session.getSnapshot(),
      allowance: () => slot.session.allowanceStatus(),
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
      if (next >= 0 && next < game.lineBetOptions.length && !sessionInFeature && slot.phase !== 'spinning')
        slot.setLineBetIndex(next);
    },
    [game, sessionInFeature, slot, snap.lineBetIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panel || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      const interactive =
        t && t.closest('button, a, input, select, textarea, summary, [contenteditable="true"]') !== null;
      if ((e.key === ' ' || e.key === 'Enter') && !interactive) {
        e.preventDefault();
        if (slot.banner) slot.dismissBanner();
        else slot.spin();
      } else if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp') {
        if (!interactive || e.key !== 'ArrowUp') changeBet(1);
      } else if (e.key === '-' || e.key === 'ArrowDown') {
        if (!interactive || e.key !== 'ArrowDown') changeBet(-1);
      } else if (e.key === 't' || e.key === 'T') updateSettings({ turbo: !settings.turbo });
      else if (e.key === 'g' || e.key === 'G') slot.collectAllowance();
      else if (e.key === 'p' || e.key === 'P') setPanel('paytable');
      else if (e.key === 'h' || e.key === 'H') setPanel('help');
      else if (e.key === 's' || e.key === 'S') setPanel('stats');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, slot, changeBet, settings.turbo, updateSettings]);

  const lowBalance = !sessionInFeature && slot.phase !== 'spinning' && snap.balance < snap.totalBet;
  const canLowerBet = game.lineBetOptions.some((b) => b * game.lineCount <= snap.balance);
  const close = useCallback(() => setPanel(null), []);
  const displayed = slot.controller.displayedWindow();

  return (
    <div className={`app${inFeature ? ' app--feature' : ''}`}>
      <a className="skip-link" href="#spin-area">
        Zu den Spielelementen springen
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <SymbolIcon id="TEACHER" size={40} />
          </span>
          <div>
            <h1>{game.config.meta.name}</h1>
            <p className="brand__tag">Spielgeld-Prototyp · kein Echtgeld</p>
          </div>
        </div>
        <div className="wallet">
          <div className="balance" aria-label="Kontostand">
            <span className="label">Kontostand</span>
            <output className="value" data-testid="balance">
              {credits(slot.displayBalance)}
            </output>
          </div>
          <AllowanceWidget
            session={slot.session}
            disabled={slot.phase === 'spinning'}
            onCollect={slot.collectAllowance}
          />
        </div>
        <nav className="menu" aria-label="Spielinformationen">
          <button type="button" className="chip" onClick={() => setPanel('paytable')}>
            Gewinne
          </button>
          <button type="button" className="chip" onClick={() => setPanel('help')}>
            Hilfe
          </button>
          <button type="button" className="chip" onClick={() => setPanel('history')}>
            Verlauf
          </button>
          <button type="button" className="chip" onClick={() => setPanel('stats')} data-testid="open-stats">
            Statistik
          </button>
          <button
            type="button"
            className="chip chip--icon"
            onClick={() => setPanel('settings')}
            aria-label="Einstellungen"
          >
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
        <div
          className={`feature-bar${inFeature ? ' is-visible' : ''}`}
          aria-hidden={!inFeature}
          data-testid="feature-bar"
        >
          {feature && (
            <>
              <span>
                Hitzefrei: Freispiel <strong data-testid="free-spins-played">{feature.played}</strong> von{' '}
                <strong>{feature.totalAwarded}</strong>
              </span>
              <span>
                Feature-Gewinn <strong>{credits(feature.totalWin)}</strong>
              </span>
              <span className="muted">
                Gewinne ×{free.winMultiplier} · {wild.name}-Gewinne ×{free.wildMultiplier}
              </span>
            </>
          )}
        </div>
        <div className="reels-wrap">
          <ReelStage controller={slot.controller} setup={sceneSetup} label="Walzen" />
          {slot.banner && (
            <Banner
              banner={slot.banner}
              onDismiss={slot.dismissBanner}
              reducedMotion={settings.reducedMotion}
              winMultiplier={free.winMultiplier}
              wildMultiplier={free.wildMultiplier}
              wildName={wild.name}
            />
          )}
        </div>
        <p className="message" data-testid="message">
          {slot.message}
        </p>
        <div className="sr-only" aria-live="polite" data-testid="announcer">
          {slot.announcement}
        </div>
        {displayed && (
          <div className="sr-only">
            <table aria-label="Aktuell sichtbare Symbole, obere Reihe zuerst">
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
          <div className="low-balance" role="alert" data-testid="low-balance">
            <span>
              Nicht genug Spielgeld für diesen Einsatz.
              {canLowerBet ? ' Senke den Einsatz oder hol dir dein Taschengeld.' : ' Hol dir dein Taschengeld.'}
            </span>
            <AllowanceWidget
              session={slot.session}
              disabled={false}
              onCollect={slot.collectAllowance}
              variant="inline"
            />
          </div>
        )}
        <p className="disclaimer">
          Nur Spielgeld: keine Einzahlung, keine Auszahlung, kein Gewinn mit echtem Wert. Nicht zertifiziert.
        </p>
      </footer>

      {panel === 'paytable' && (
        <Modal title="Gewinntabelle und Regeln" onClose={close} wide testId="paytable-dialog">
          <PaytablePanel game={game} lineBet={snap.lineBet} />
        </Modal>
      )}
      {panel === 'help' && (
        <Modal title="Hilfe" onClose={close}>
          <HelpPanel game={game} />
        </Modal>
      )}
      {panel === 'history' && (
        <Modal title="Spielverlauf" onClose={close} wide>
          <HistoryPanel game={game} history={snap.history} />
        </Modal>
      )}
      {panel === 'stats' && (
        <Modal title="Statistik" onClose={close} wide testId="stats-dialog">
          <StatsPanel game={game} stats={snap.stats} />
        </Modal>
      )}
      {panel === 'settings' && (
        <Modal title="Einstellungen" onClose={close}>
          <SettingsPanel settings={settings} onChange={updateSettings} />
        </Modal>
      )}
      {panel === 'dev' && flags.dev && (
        <Modal title="Entwickler-Diagnose" onClose={close} wide>
          <DevPanel
            game={game}
            session={slot.session}
            controller={slot.controller}
            last={slot.lastRevealed}
            seed={flags.seed}
            mismatches={slot.windowMismatches}
            onResetWallet={() => {
              slot.resetSession();
              close();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
