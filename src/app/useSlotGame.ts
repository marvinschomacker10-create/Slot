import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CompiledGame } from '../config';
import { formatCountdown } from '../game/state/allowance';
import type { SessionSave } from '../game/state/persistence';
import { GameSession, type FeatureView, type SessionSnapshot, type SpinRecord } from '../game/state/session';
import type { RandomSource } from '../rng';
import { ReelController } from '../render/ReelController';
import { credits } from './format';
import { celebrationLevel, describeSpin, winSteps, winTier, type WinTier } from './presentation';
import type { Settings } from './settings';
import { clearWallet, loadWallet, onForeignWalletChange, storeWallet } from './wallet';

export type UiPhase = 'idle' | 'spinning' | 'presenting';

export type Banner =
  | { readonly kind: 'feature-start'; readonly spins: number }
  | { readonly kind: 'feature-end'; readonly total: number; readonly spins: number }
  | { readonly kind: 'big-win'; readonly tier: WinTier; readonly amount: number };

export interface SlotGame {
  readonly session: GameSession;
  readonly snapshot: SessionSnapshot;
  readonly controller: ReelController;
  readonly phase: UiPhase;
  /** Balance shown to the player: the stake is visible immediately, the win once the reels have landed. */
  readonly displayBalance: number;
  /** Win shown in the WIN field (round total so far), null before the first reveal. */
  readonly displayWin: number | null;
  /**
   * Free-spins state as revealed to the player (never ahead of the reels): during a
   * spin it is the state before that spin, afterwards the state after it.
   */
  readonly displayFeature: FeatureView | null;
  readonly message: string;
  readonly announcement: string;
  readonly banner: Banner | null;
  readonly lastRevealed: SpinRecord | null;
  readonly canSpin: boolean;
  readonly windowMismatches: number;
  spin(): void;
  setLineBetIndex(index: number): void;
  dismissBanner(): void;
  /** Collects the timed play-money allowance if it is due. */
  collectAllowance(): void;
  /** Development only: discards the saved wallet and starts a fresh one. */
  resetSession(): void;
  previewLines(lines: readonly number[] | null): void;
}

function sameWindow(a: readonly (readonly string[])[] | null, b: readonly (readonly string[])[]): boolean {
  return (
    a !== null &&
    a.length === b.length &&
    a.every((col, i) => col.length === b[i]!.length && col.every((s, j) => s === b[i]![j]))
  );
}

/** Same wallet content, ignoring when it was written. */
function sameWallet(a: SessionSave, b: SessionSave): boolean {
  return (
    a.balance === b.balance &&
    a.lineBetIndex === b.lineBetIndex &&
    a.lastAllowanceAt === b.lastAllowanceAt &&
    a.roundNumber === b.roundNumber &&
    (a.openRound?.roundId ?? null) === (b.openRound?.roundId ?? null) &&
    (a.openRound?.state.spinsPlayed ?? 0) === (b.openRound?.state.spinsPlayed ?? 0)
  );
}

interface OpenSession {
  readonly session: GameSession;
  /** The saved wallet this session was restored from, if any. */
  readonly restoredFrom: SessionSave | null;
}

function welcomeMessage(open: OpenSession): string {
  const f = open.session.getSnapshot().feature;
  if (f) return `Unfertige Freispiele wiederhergestellt: noch ${f.remaining} von ${f.totalAwarded}. Drücke FREI.`;
  return open.restoredFrom
    ? 'Willkommen zurück! Dein Spielgeld wurde gespeichert.'
    : 'Drücke DREHEN oder die Leertaste zum Spielen.';
}

/**
 * Game flow: request -> settle (GameSession) -> animate -> present.
 * The session is the single authoritative state. Animation timing can delay what
 * is displayed but can never change what was settled.
 *
 * The wallet (balance, bet, allowance timer, unfinished free spins) is saved after
 * every settled change and restored on the next visit. Other tabs of the same
 * browser share it: the newest save wins and is adopted while this tab is idle.
 */
export function useSlotGame(game: CompiledGame, createRng: () => RandomSource, settings: Settings): SlotGame {
  const controller = useMemo(() => new ReelController(), []);
  const [open, setOpen] = useState<OpenSession>(() => {
    const save = loadWallet(game);
    return { session: new GameSession(game, { rng: createRng(), restore: save }), restoredFrom: save };
  });
  const session = open.session;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [phase, setPhase] = useState<UiPhase>('idle');
  const [pending, setPending] = useState<SpinRecord | null>(null);
  const [lastRevealed, setLastRevealed] = useState<SpinRecord | null>(null);
  const [message, setMessage] = useState(() => welcomeMessage(open));
  const [announcement, setAnnouncement] = useState('');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [windowMismatches, setWindowMismatches] = useState(0);
  // Free-spins state of a restored round, as it was when the page was left.
  const restoredFeature = useMemo(() => open.session.getSnapshot().feature, [open]);

  const phaseRef = useRef<UiPhase>('idle');
  const bannerRef = useRef<Banner | null>(null);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(session);
  const revealedRef = useRef<SpinRecord | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cycle = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStoredAt = useRef(0);
  const foreignSave = useRef<SessionSave | null>(null);
  settingsRef.current = settings;
  sessionRef.current = session;

  const setPhaseBoth = (p: UiPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const setBannerBoth = (b: Banner | null) => {
    bannerRef.current = b;
    setBanner(b);
  };

  const stopPresentation = useCallback(() => {
    if (cycle.current) clearInterval(cycle.current);
    cycle.current = null;
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const clearAuto = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };

  /** Replaces the session (fresh wallet, or a wallet saved by another tab). */
  const replaceSession = useCallback(
    (save: SessionSave | null, text: string) => {
      stopPresentation();
      clearAuto();
      controller.clearWins();
      foreignSave.current = null;
      revealedRef.current = null;
      setLastRevealed(null);
      setPending(null);
      setBannerBoth(null);
      setOpen({ session: new GameSession(game, { rng: createRng(), restore: save }), restoredFrom: save });
      setMessage(text);
    },
    [controller, createRng, game, stopPresentation],
  );

  const adoptForeign = useCallback(
    (save: SessionSave) => replaceSession(save, 'Spielstand aus einem anderen Tab übernommen.'),
    [replaceSession],
  );

  // Save after every settled change (the stake and the win are settled before any animation).
  useEffect(() => {
    const store = () => {
      const save = session.save();
      lastStoredAt.current = save.savedAt;
      storeWallet(save);
    };
    store();
    return session.subscribe(store);
  }, [session]);

  useEffect(
    () =>
      onForeignWalletChange(game, (save) => {
        if (save.savedAt <= lastStoredAt.current || sameWallet(save, sessionRef.current.save())) return;
        if (phaseRef.current === 'spinning') foreignSave.current = save;
        else adoptForeign(save);
      }),
    [adoptForeign, game],
  );

  // A restored free-spins round shows its last window and the feature frame.
  useEffect(() => {
    let cancelled = false;
    const spins = open.restoredFrom?.openRound?.spins;
    const last = spins && spins.length > 0 ? spins[spins.length - 1]! : null;
    void controller.whenReady().then(() => {
      if (cancelled) return;
      controller.setFeatureMode(open.session.phase === 'free-spins');
      if (last) controller.showStops(last.mode, last.stops);
    });
    return () => {
      cancelled = true;
    };
  }, [controller, open]);

  const spinRef = useRef<() => void>(() => {});

  const scheduleAutoFreeSpin = useCallback((delay: number) => {
    clearAuto();
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      if (bannerRef.current?.kind === 'feature-start') setBannerBoth(null);
      if (
        sessionRef.current.phase === 'free-spins' &&
        phaseRef.current !== 'spinning' &&
        settingsRef.current.autoFreeSpins
      ) {
        spinRef.current();
      }
    }, delay);
  }, []);

  const present = useCallback(
    (record: SpinRecord) => {
      const s = settingsRef.current;
      const steps = winSteps(game, record);
      const lines = record.outcome.lineWins.map((w) => ({ lineIndex: w.lineIndex, positions: w.positions }));
      const scatter =
        record.outcome.scatter.win > 0 || record.freeSpinsGranted > 0 ? record.outcome.scatter.positions : [];
      if (steps.length > 0) {
        controller.showWins(lines, scatter);
        setMessage(steps[0]!.text);
        if (steps.length > 2 && !s.reducedMotion) {
          let i = 0;
          cycle.current = setInterval(
            () => {
              i = (i + 1) % steps.length;
              const step = steps[i]!;
              controller.focus(
                step.kind === 'line'
                  ? { kind: 'line', lineIndex: step.lineIndex }
                  : step.kind === 'scatter'
                    ? { kind: 'scatter' }
                    : { kind: 'all' },
              );
              setMessage(step.text);
            },
            s.turbo ? 900 : 1400,
          );
        } else if (steps.length === 2) {
          setMessage(steps[1]!.text);
        }
      } else {
        setMessage(record.mode === 'free' ? 'Kein Gewinn bei diesem Freispiel.' : 'Diesmal kein Gewinn.');
      }
      const tier = winTier(record.credited, record.outcome.totalBet);
      controller.celebrate(s.reducedMotion ? 0 : celebrationLevel(tier));
      if (celebrationLevel(tier) > 0) setBannerBoth({ kind: 'big-win', tier, amount: record.credited });
      if (record.startedFeature) {
        setBannerBoth({ kind: 'feature-start', spins: record.freeSpinsGranted });
      } else if (record.mode === 'free' && record.roundComplete && record.feature) {
        setBannerBoth({ kind: 'feature-end', total: record.feature.totalWin, spins: record.feature.played });
      }
      setAnnouncement(describeSpin(game, record));
    },
    [controller, game],
  );

  const spin = useCallback(() => {
    const s = settingsRef.current;
    if (phaseRef.current === 'spinning') {
      controller.quickStop();
      return;
    }
    if (bannerRef.current) setBannerBoth(null);
    const current = sessionRef.current;
    if (!current.canSpin()) {
      setMessage('Nicht genug Spielgeld für diesen Einsatz. Senke den Einsatz oder warte auf das Taschengeld.');
      return;
    }
    clearAuto();
    stopPresentation();
    controller.clearWins();
    // Feature state as the player last saw it; the settled record may already include a retrigger.
    const before = current.getSnapshot().feature;
    let record: SpinRecord;
    try {
      record = current.spin();
    } catch (e) {
      console.error(e);
      setMessage('Dieser Dreh konnte nicht ausgeführt werden.');
      return;
    }
    setPending(record);
    setPhaseBoth('spinning');
    setMessage(
      record.mode === 'free' && before ? `Freispiel ${before.played + 1} von ${before.totalAwarded}` : 'Viel Glück!',
    );
    controller.setFeatureMode(record.mode === 'free');
    void controller
      .spin({
        mode: record.mode,
        stops: record.outcome.stops,
        window: record.outcome.window,
        speed: s.turbo ? 'turbo' : 'normal',
        reducedMotion: s.reducedMotion,
      })
      .then(() => {
        // The renderer must show exactly the settled window; a mismatch is a defect, never a different result.
        const shown = controller.displayedWindow();
        if (controller.ready && !sameWindow(shown, record.outcome.window)) {
          console.error('Displayed window differs from the settled outcome', { shown, settled: record.outcome.window });
          setWindowMismatches((n) => n + 1);
        }
        setPending(null);
        revealedRef.current = record;
        setLastRevealed(record);
        setPhaseBoth('presenting');
        present(record);
        controller.setFeatureMode(sessionRef.current.phase === 'free-spins');
        setPhaseBoth('idle');
        const foreign = foreignSave.current;
        if (foreign && foreign.savedAt > lastStoredAt.current) {
          adoptForeign(foreign);
          return;
        }
        foreignSave.current = null;
        if (sessionRef.current.phase === 'free-spins' && settingsRef.current.autoFreeSpins) {
          const hasWin = record.credited > 0;
          const base = settingsRef.current.turbo ? 500 : 1100;
          scheduleAutoFreeSpin(record.startedFeature ? base + 1800 : hasWin ? base + 700 : base);
        }
      });
  }, [adoptForeign, controller, present, scheduleAutoFreeSpin, stopPresentation]);
  spinRef.current = spin;

  const setLineBetIndex = useCallback((index: number) => {
    try {
      sessionRef.current.setLineBetIndex(index);
    } catch {
      setMessage('Der Einsatz kann während der Freispiele nicht geändert werden.');
    }
  }, []);

  const dismissBanner = useCallback(() => {
    const b = bannerRef.current;
    setBannerBoth(null);
    if (b?.kind === 'feature-start' && settingsRef.current.autoFreeSpins) scheduleAutoFreeSpin(150);
  }, [scheduleAutoFreeSpin]);

  const collectAllowance = useCallback(() => {
    if (phaseRef.current === 'spinning') return;
    const current = sessionRef.current;
    const status = current.allowanceStatus();
    if (!status.enabled) return;
    if (!status.available) {
      setMessage(`Das nächste Taschengeld gibt es in ${formatCountdown(status.remainingMs)}.`);
      return;
    }
    try {
      const amount = current.collectAllowance();
      setMessage(`Taschengeld abgeholt: +${credits(amount)} Spielgeld-Credits.`);
      setAnnouncement(
        `Taschengeld abgeholt: ${credits(amount)} Credits. Kontostand ${credits(current.balance)} Credits.`,
      );
    } catch (e) {
      console.error(e);
    }
  }, []);

  const resetSession = useCallback(() => {
    if (phaseRef.current === 'spinning') return;
    clearWallet();
    replaceSession(null, 'Neues Spielgeld-Konto angelegt.');
  }, [replaceSession]);

  const previewLines = useCallback(
    (lines: readonly number[] | null) => {
      if (phaseRef.current === 'spinning') return;
      stopPresentation();
      controller.previewLines(lines);
    },
    [controller, stopPresentation],
  );

  // If auto free spins is switched on mid-feature, continue. A round restored from a save
  // or adopted from another tab waits for the player's first press.
  useEffect(() => {
    if (
      settings.autoFreeSpins &&
      session.phase === 'free-spins' &&
      lastRevealed !== null &&
      phase === 'idle' &&
      !autoTimer.current &&
      !banner
    ) {
      scheduleAutoFreeSpin(600);
    }
  }, [settings.autoFreeSpins, session, lastRevealed, phase, banner, scheduleAutoFreeSpin]);

  useEffect(
    () => () => {
      stopPresentation();
      clearAuto();
    },
    [stopPresentation],
  );

  const displayBalance = pending ? pending.balanceAfterStake : snapshot.balance;
  const displayWin = pending
    ? pending.mode === 'free'
      ? pending.roundWinAfter - pending.credited
      : null
    : lastRevealed
      ? lastRevealed.roundWinAfter
      : restoredFeature
        ? snapshot.currentRoundWin
        : null;
  const revealedFeature = lastRevealed ? (lastRevealed.roundComplete ? null : lastRevealed.feature) : restoredFeature;
  const displayFeature = pending ? (pending.mode === 'free' ? revealedFeature : null) : revealedFeature;

  return {
    session,
    snapshot,
    controller,
    phase,
    displayBalance,
    displayWin,
    displayFeature,
    message,
    announcement,
    banner,
    lastRevealed,
    canSpin: phase !== 'spinning' ? session.canSpin() : true,
    windowMismatches,
    spin,
    setLineBetIndex,
    dismissBanner,
    collectAllowance,
    resetSession,
    previewLines,
  };
}
