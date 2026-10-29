import type { CompiledGame } from '../../config/compile';
import type { GameMode } from '../../config/types';
import type { RandomSource } from '../../rng';
import { remainingFreeSpins } from '../bonus';
import { playNextSpin, startRound, type RoundState } from '../engine';
import { GameStateError, InsufficientBalanceError } from '../errors';
import type { SpinOutcome } from '../types';
import { Ledger } from './ledger';

export interface FeatureView {
  readonly totalAwarded: number;
  readonly played: number;
  readonly remaining: number;
  readonly retriggers: number;
  readonly totalWin: number;
  readonly lineBet: number;
}

export interface SpinRecord {
  readonly spinId: string;
  readonly roundId: string;
  readonly roundNumber: number;
  /** 0 = paid base spin, 1..n = free spins. */
  readonly index: number;
  readonly mode: GameMode;
  readonly outcome: SpinOutcome;
  readonly stakeDebited: number;
  readonly credited: number;
  readonly cappedBy: number;
  readonly balanceBefore: number;
  /** Balance after the stake was taken and before the win was added. */
  readonly balanceAfterStake: number;
  readonly balanceAfter: number;
  readonly freeSpinsGranted: number;
  readonly freeSpinsForfeited: number;
  readonly startedFeature: boolean;
  readonly feature: FeatureView | null;
  readonly roundWinAfter: number;
  readonly roundComplete: boolean;
  readonly capReached: boolean;
  readonly timestamp: number;
}

export interface SpinSummary {
  readonly spinId: string;
  readonly index: number;
  readonly mode: GameMode;
  readonly stops: readonly number[];
  readonly window: readonly (readonly string[])[];
  readonly credited: number;
  readonly lineWins: readonly { lineIndex: number; symbol: string; count: number; win: number }[];
  readonly scatterCount: number;
  readonly scatterWin: number;
  readonly freeSpinsGranted: number;
}

export interface RoundRecord {
  readonly roundId: string;
  readonly roundNumber: number;
  readonly startedAt: number;
  readonly lineBet: number;
  readonly totalBet: number;
  readonly stake: number;
  readonly totalWin: number;
  readonly net: number;
  readonly featureTriggered: boolean;
  readonly freeSpinsPlayed: number;
  readonly retriggers: number;
  readonly capReached: boolean;
  readonly spins: readonly SpinSummary[];
}

export interface SessionStats {
  readonly rounds: number;
  readonly paidSpins: number;
  readonly freeSpins: number;
  readonly totalStaked: number;
  readonly totalWon: number;
  readonly winningRounds: number;
  readonly featuresTriggered: number;
  readonly retriggers: number;
  readonly biggestRoundWin: number;
  readonly biggestRoundMultiplier: number;
  readonly capHits: number;
}

export interface SessionSnapshot {
  readonly version: number;
  readonly balance: number;
  readonly lineBetIndex: number;
  readonly lineBet: number;
  readonly totalBet: number;
  readonly phase: 'idle' | 'free-spins';
  readonly feature: FeatureView | null;
  readonly currentRoundId: string | null;
  readonly currentRoundWin: number;
  readonly lastSpin: SpinRecord | null;
  readonly history: readonly RoundRecord[];
  readonly stats: SessionStats;
  readonly rngKind: RandomSource['kind'];
}

export interface SessionOptions {
  readonly rng: RandomSource;
  readonly startingBalance?: number;
  readonly lineBetIndex?: number;
  readonly historyLimit?: number;
  readonly now?: () => number;
}

/** Recursively freezes a settled record so presentation code cannot alter it. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

const EMPTY_STATS: SessionStats = {
  rounds: 0,
  paidSpins: 0,
  freeSpins: 0,
  totalStaked: 0,
  totalWon: 0,
  winningRounds: 0,
  featuresTriggered: 0,
  retriggers: 0,
  biggestRoundWin: 0,
  biggestRoundMultiplier: 0,
  capHits: 0,
};

function featureView(round: RoundState): FeatureView | null {
  const f = round.feature;
  if (!f) return null;
  return {
    totalAwarded: f.totalAwarded,
    played: f.played,
    remaining: remainingFreeSpins(f),
    retriggers: f.retriggers,
    totalWin: f.totalWin,
    lineBet: f.lineBet,
  };
}

function summarize(record: SpinRecord): SpinSummary {
  const o = record.outcome;
  return {
    spinId: record.spinId,
    index: record.index,
    mode: record.mode,
    stops: o.stops,
    window: o.window,
    credited: record.credited,
    lineWins: o.lineWins.map((w) => ({ lineIndex: w.lineIndex, symbol: w.symbol, count: w.count, win: w.win })),
    scatterCount: o.scatter.count,
    scatterWin: o.scatter.win,
    freeSpinsGranted: record.freeSpinsGranted,
  };
}

/**
 * The single authoritative game state for an interactive play-money session.
 *
 * - The RNG is private; callers can request a spin but can never supply or alter an outcome.
 * - Every spin is resolved and settled (stake debited, win credited) synchronously
 *   inside `spin()` before any presentation happens. Animations only replay the
 *   returned record.
 * - The stake is debited once per round; free spins never debit.
 */
export class GameSession {
  private readonly game: CompiledGame;
  private readonly rng: RandomSource;
  private readonly ledger: Ledger;
  private readonly historyLimit: number;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private lineBetIndex: number;
  private round: RoundState | null = null;
  private roundId: string | null = null;
  private roundNumber = 0;
  private roundStartedAt = 0;
  private roundSpins: SpinSummary[] = [];
  private lastSpin: SpinRecord | null = null;
  private history: RoundRecord[] = [];
  private stats: SessionStats = EMPTY_STATS;
  private version = 0;
  private snapshot: SessionSnapshot;

  constructor(game: CompiledGame, options: SessionOptions) {
    this.game = game;
    this.rng = options.rng;
    this.ledger = new Ledger(options.startingBalance ?? game.startingBalance);
    this.historyLimit = options.historyLimit ?? 200;
    this.now = options.now ?? (() => Date.now());
    const idx = options.lineBetIndex ?? game.defaultLineBetIndex;
    this.assertLineBetIndex(idx);
    this.lineBetIndex = idx;
    this.snapshot = this.buildSnapshot();
  }

  get phase(): 'idle' | 'free-spins' {
    return this.round && this.round.status === 'free-spins' ? 'free-spins' : 'idle';
  }

  get balance(): number {
    return this.ledger.balance;
  }

  get ledgerEntries() {
    return this.ledger.entries;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  canSpin(): boolean {
    if (this.phase === 'free-spins') return true;
    return this.ledger.balance >= this.currentTotalBet();
  }

  currentLineBet(): number {
    return this.game.lineBetOptions[this.lineBetIndex]!;
  }

  currentTotalBet(): number {
    return this.currentLineBet() * this.game.lineCount;
  }

  setLineBetIndex(index: number): void {
    if (this.phase !== 'idle') throw new GameStateError('the bet cannot be changed while free spins are in progress');
    this.assertLineBetIndex(index);
    if (index === this.lineBetIndex) return;
    this.lineBetIndex = index;
    this.changed();
  }

  /**
   * Plays the next spin: a paid base spin when idle, otherwise the next free spin
   * of the open round. Returns the fully settled record.
   */
  spin(): SpinRecord {
    const balanceBefore = this.ledger.balance;
    let stakeDebited = 0;

    if (!this.round) {
      const lineBet = this.currentLineBet();
      const totalBet = this.currentTotalBet();
      if (balanceBefore < totalBet) throw new InsufficientBalanceError(balanceBefore, totalBet);
      this.roundNumber += 1;
      this.roundId = `R${this.roundNumber}`;
      this.roundStartedAt = this.now();
      this.roundSpins = [];
      this.round = startRound(this.game, lineBet);
      this.ledger.debitStake(this.roundId, this.round.stake);
      stakeDebited = this.round.stake;
    }

    const round0 = this.round;
    const roundId = this.roundId!;
    const balanceAfterStake = this.ledger.balance;
    const { round, spin } = playNextSpin(this.game, round0, this.rng);
    const spinId = `${roundId}-S${spin.index}`;
    this.ledger.creditWin(spinId, spin.credited);
    this.round = round;

    const record: SpinRecord = deepFreeze({
      spinId,
      roundId,
      roundNumber: this.roundNumber,
      index: spin.index,
      mode: spin.outcome.mode,
      outcome: spin.outcome,
      stakeDebited,
      credited: spin.credited,
      cappedBy: spin.cappedBy,
      balanceBefore,
      balanceAfterStake,
      balanceAfter: this.ledger.balance,
      freeSpinsGranted: spin.freeSpinsGranted,
      freeSpinsForfeited: spin.freeSpinsForfeited,
      startedFeature: spin.index === 0 && round.featureTriggered,
      feature: featureView(round),
      roundWinAfter: round.totalWin,
      roundComplete: spin.roundComplete,
      capReached: round.capReached,
      timestamp: this.now(),
    });
    this.lastSpin = record;
    this.roundSpins.push(summarize(record));
    this.updateStats(record, round);
    if (spin.roundComplete) this.closeRound(round);
    this.changed();
    return record;
  }

  /** Cross-checks ledger, statistics and round state. Used by tests and the developer panel. */
  verifyIntegrity(): { ok: boolean; problems: string[] } {
    const problems: string[] = [];
    const ledgerCheck = this.ledger.verify();
    if (!ledgerCheck.ok) problems.push('ledger entries do not reproduce the balance');
    let staked = 0;
    let won = 0;
    for (const e of this.ledger.entries) {
      if (e.type === 'stake') staked -= e.amount;
      else won += e.amount;
    }
    if (staked !== this.stats.totalStaked || won !== this.stats.totalWon) {
      problems.push('session statistics disagree with the ledger');
    }
    const refs = new Set(this.ledger.entries.map((e) => `${e.type}:${e.reference}`));
    if (refs.size !== this.ledger.entries.length) problems.push('a ledger reference was settled more than once');
    const stakes = this.ledger.entries.filter((e) => e.type === 'stake').length;
    if (stakes !== this.stats.rounds + (this.round ? 1 : 0)) problems.push('stake count does not match round count');
    return { ok: problems.length === 0, problems };
  }

  private updateStats(record: SpinRecord, round: RoundState): void {
    const s = this.stats;
    const isBase = record.index === 0;
    this.stats = {
      ...s,
      paidSpins: s.paidSpins + (isBase ? 1 : 0),
      freeSpins: s.freeSpins + (isBase ? 0 : 1),
      totalStaked: s.totalStaked + record.stakeDebited,
      totalWon: s.totalWon + record.credited,
      featuresTriggered: s.featuresTriggered + (record.startedFeature ? 1 : 0),
      retriggers: s.retriggers + (!isBase && record.freeSpinsGranted > 0 ? 1 : 0),
    };
    if (record.roundComplete) {
      this.stats = {
        ...this.stats,
        rounds: this.stats.rounds + 1,
        winningRounds: this.stats.winningRounds + (round.totalWin > 0 ? 1 : 0),
        biggestRoundWin: Math.max(this.stats.biggestRoundWin, round.totalWin),
        biggestRoundMultiplier: Math.max(this.stats.biggestRoundMultiplier, round.totalWin / round.totalBet),
        capHits: this.stats.capHits + (round.capReached ? 1 : 0),
      };
    }
  }

  private closeRound(round: RoundState): void {
    const record: RoundRecord = {
      roundId: this.roundId!,
      roundNumber: this.roundNumber,
      startedAt: this.roundStartedAt,
      lineBet: round.lineBet,
      totalBet: round.totalBet,
      stake: round.stake,
      totalWin: round.totalWin,
      net: round.totalWin - round.stake,
      featureTriggered: round.featureTriggered,
      freeSpinsPlayed: round.feature?.played ?? 0,
      retriggers: round.feature?.retriggers ?? 0,
      capReached: round.capReached,
      spins: this.roundSpins,
    };
    this.history = [deepFreeze(record), ...this.history].slice(0, this.historyLimit);
    this.round = null;
    this.roundId = null;
    this.roundSpins = [];
  }

  private assertLineBetIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.game.lineBetOptions.length) {
      throw new GameStateError(`line bet index ${index} is out of range`);
    }
  }

  private buildSnapshot(): SessionSnapshot {
    return Object.freeze({
      version: this.version,
      balance: this.ledger.balance,
      lineBetIndex: this.lineBetIndex,
      lineBet: this.currentLineBet(),
      totalBet: this.currentTotalBet(),
      phase: this.phase,
      feature: this.round ? featureView(this.round) : null,
      currentRoundId: this.roundId,
      currentRoundWin: this.round?.totalWin ?? 0,
      lastSpin: this.lastSpin,
      history: this.history,
      stats: this.stats,
      rngKind: this.rng.kind,
    });
  }

  private changed(): void {
    this.version += 1;
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }
}
