import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CompiledGame } from '../config';
import { GameSession, type FeatureView, type SessionSnapshot, type SpinRecord } from '../game/state/session';
import type { RandomSource } from '../rng';
import { ReelController } from '../render/ReelController';
import { celebrationLevel, describeSpin, winSteps, winTier, type WinTier } from './presentation';
import type { Settings } from './settings';

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

/**
 * Game flow: request -> settle (GameSession) -> animate -> present.
 * The session is the single authoritative state. Animation timing can delay what
 * is displayed but can never change what was settled.
 */
export function useSlotGame(game: CompiledGame, createRng: () => RandomSource, settings: Settings): SlotGame {
  const controller = useMemo(() => new ReelController(), []);
  const [session, setSession] = useState(() => new GameSession(game, { rng: createRng() }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [phase, setPhase] = useState<UiPhase>('idle');
  const [pending, setPending] = useState<SpinRecord | null>(null);
  const [lastRevealed, setLastRevealed] = useState<SpinRecord | null>(null);
  const [message, setMessage] = useState('Press SPIN or the space bar to play.');
  const [announcement, setAnnouncement] = useState('');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [windowMismatches, setWindowMismatches] = useState(0);

  const phaseRef = useRef<UiPhase>('idle');
  const bannerRef = useRef<Banner | null>(null);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(session);
  const revealedRef = useRef<SpinRecord | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cycle = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        setMessage(record.mode === 'free' ? 'No win on this free spin.' : 'No win this time.');
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
      setMessage('Not enough play-money credits for this bet. Lower the bet or reset the balance.');
      return;
    }
    clearAuto();
    stopPresentation();
    controller.clearWins();
    let record: SpinRecord;
    try {
      record = current.spin();
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }
    // Feature state as the player last saw it; the settled record may already include a retrigger.
    const before = revealedRef.current && !revealedRef.current.roundComplete ? revealedRef.current.feature : null;
    setPending(record);
    setPhaseBoth('spinning');
    setMessage(
      record.mode === 'free' && before ? `Free spin ${before.played + 1} of ${before.totalAwarded}` : 'Good luck!',
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
        if (sessionRef.current.phase === 'free-spins' && settingsRef.current.autoFreeSpins) {
          const hasWin = record.credited > 0;
          const base = settingsRef.current.turbo ? 500 : 1100;
          scheduleAutoFreeSpin(record.startedFeature ? base + 1800 : hasWin ? base + 700 : base);
        }
      });
  }, [controller, present, scheduleAutoFreeSpin, stopPresentation]);
  spinRef.current = spin;

  const setLineBetIndex = useCallback((index: number) => {
    try {
      sessionRef.current.setLineBetIndex(index);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, []);

  const dismissBanner = useCallback(() => {
    const b = bannerRef.current;
    setBannerBoth(null);
    if (b?.kind === 'feature-start' && settingsRef.current.autoFreeSpins) scheduleAutoFreeSpin(150);
  }, [scheduleAutoFreeSpin]);

  const resetSession = useCallback(() => {
    if (phaseRef.current === 'spinning' || sessionRef.current.phase === 'free-spins') return;
    stopPresentation();
    clearAuto();
    controller.clearWins();
    setSession(new GameSession(game, { rng: createRng() }));
    revealedRef.current = null;
    setLastRevealed(null);
    setBannerBoth(null);
    setMessage('Play-money balance reset.');
  }, [controller, createRng, game, stopPresentation]);

  const previewLines = useCallback(
    (lines: readonly number[] | null) => {
      if (phaseRef.current === 'spinning') return;
      stopPresentation();
      controller.previewLines(lines);
    },
    [controller, stopPresentation],
  );

  // If auto free spins is switched on mid-feature, continue.
  useEffect(() => {
    if (settings.autoFreeSpins && session.phase === 'free-spins' && phase === 'idle' && !autoTimer.current && !banner) {
      scheduleAutoFreeSpin(600);
    }
  }, [settings.autoFreeSpins, session, phase, banner, scheduleAutoFreeSpin]);

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
      : null;
  const revealedFeature = lastRevealed && !lastRevealed.roundComplete ? lastRevealed.feature : null;
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
    resetSession,
    previewLines,
  };
}
