import type { CompiledGame } from '../../config/compile';
import { roundWinCap, type RoundState } from '../engine';
import type { SpinSummary } from './session';

/**
 * Saved play-money wallet. Stored by the browser (localStorage) so that the balance,
 * the allowance timer and an unfinished free-spins round survive a page reload.
 * Saved data is untrusted input: it is validated field by field before use.
 */
export interface SessionSave {
  readonly version: 1;
  readonly configHash: string;
  readonly savedAt: number;
  readonly balance: number;
  readonly lineBetIndex: number;
  readonly lastAllowanceAt: number;
  readonly roundNumber: number;
  /** A free-spins round whose stake is already settled; its remaining spins are owed to the player. */
  readonly openRound: {
    readonly roundId: string;
    readonly startedAt: number;
    readonly state: RoundState;
    readonly spins: readonly SpinSummary[];
  } | null;
}

export interface ParsedSave {
  readonly save: SessionSave | null;
  /** Why (parts of) the saved data were ignored. */
  readonly notes: readonly string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;

function validRound(game: CompiledGame, s: unknown): s is RoundState {
  if (!isObj(s) || s.status !== 'free-spins' || s.featureTriggered !== true || s.capReached !== false) return false;
  if (!isInt(s.lineBet, 1) || !game.lineBetOptions.includes(s.lineBet)) return false;
  if (s.totalBet !== s.lineBet * game.lineCount || s.stake !== s.totalBet) return false;
  if (s.cap !== roundWinCap(game, s.lineBet)) return false;
  if (!isInt(s.totalWin) || (s.cap !== null && s.totalWin >= (s.cap as number))) return false;
  const f = s.feature;
  if (!isObj(f) || f.lineBet !== s.lineBet) return false;
  if (!isInt(f.totalAwarded, 1) || !isInt(f.played) || f.played >= f.totalAwarded) return false;
  if (game.maxTotalFreeSpins !== null && f.totalAwarded > game.maxTotalFreeSpins) return false;
  if (!isInt(f.retriggers) || !isInt(f.truncatedSpins) || !isInt(f.totalWin) || f.totalWin > s.totalWin) return false;
  return s.spinsPlayed === f.played + 1;
}

/** Saved spin summaries are only shown in the history; malformed ones must not reach the UI. */
function validSpins(game: CompiledGame, spins: unknown): spins is SpinSummary[] {
  if (!Array.isArray(spins)) return false;
  const symbol = (v: unknown) => typeof v === 'string' && game.symbolIndex.has(v);
  return spins.every((sp: unknown) => {
    if (!isObj(sp) || typeof sp.spinId !== 'string' || !isInt(sp.index)) return false;
    if (sp.mode !== 'base' && sp.mode !== 'free') return false;
    const strips = game.modes[sp.mode].reelSet.strips;
    const stops = sp.stops;
    if (!Array.isArray(stops) || stops.length !== game.reels) return false;
    if (!stops.every((v: unknown, i) => isInt(v) && v < strips[i]!.length)) return false;
    const win = sp.window;
    if (!Array.isArray(win) || win.length !== game.reels) return false;
    if (!win.every((col: unknown) => Array.isArray(col) && col.length === game.rows && col.every(symbol))) return false;
    if (!isInt(sp.credited) || !isInt(sp.scatterCount) || !isInt(sp.scatterWin) || !isInt(sp.freeSpinsGranted))
      return false;
    return (
      Array.isArray(sp.lineWins) &&
      sp.lineWins.every(
        (w: unknown) =>
          isObj(w) &&
          isInt(w.lineIndex) &&
          w.lineIndex < game.lineCount &&
          symbol(w.symbol) &&
          isInt(w.count, 1) &&
          isInt(w.win),
      )
    );
  });
}

/** Validates saved data. Invalid data is ignored (a fresh wallet is used); a mismatching configuration drops only the open round. */
export function parseSessionSave(raw: unknown, game: CompiledGame): ParsedSave {
  const notes: string[] = [];
  if (raw === null || raw === undefined) return { save: null, notes };
  if (!isObj(raw) || raw.version !== 1) return { save: null, notes: ['unsupported save format'] };
  if (!isInt(raw.balance)) return { save: null, notes: ['invalid balance'] };
  const lineBetIndex =
    isInt(raw.lineBetIndex) && raw.lineBetIndex < game.lineBetOptions.length
      ? raw.lineBetIndex
      : game.defaultLineBetIndex;
  const lastAllowanceAt =
    typeof raw.lastAllowanceAt === 'number' && Number.isFinite(raw.lastAllowanceAt) ? raw.lastAllowanceAt : Date.now();
  const roundNumber = isInt(raw.roundNumber) ? raw.roundNumber : 0;
  let openRound: SessionSave['openRound'] = null;
  if (raw.openRound !== null && raw.openRound !== undefined) {
    const o = raw.openRound;
    if (raw.configHash !== game.hash) {
      notes.push('an unfinished free-spins round was saved under a different game configuration and cannot be resumed');
    } else if (
      isObj(o) &&
      typeof o.roundId === 'string' &&
      /^R\d+$/.test(o.roundId) &&
      typeof o.startedAt === 'number' &&
      validRound(game, o.state)
    ) {
      const spinsOk = validSpins(game, o.spins);
      if (!spinsOk) notes.push('the saved spin details of the unfinished round were malformed and were dropped');
      openRound = {
        roundId: o.roundId,
        startedAt: o.startedAt,
        state: o.state,
        spins: spinsOk ? (o.spins as SpinSummary[]) : [],
      };
    } else {
      notes.push('the saved free-spins round is inconsistent and was ignored');
    }
  }
  return {
    save: {
      version: 1,
      configHash: typeof raw.configHash === 'string' ? raw.configHash : '',
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
      balance: raw.balance,
      lineBetIndex,
      lastAllowanceAt,
      roundNumber,
      openRound,
    },
    notes,
  };
}
