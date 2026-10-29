import type { CompiledGame } from '../config';
import { parseSessionSave, type SessionSave } from '../game/state/persistence';

/**
 * Browser storage of the play-money wallet (balance, allowance timer, unfinished
 * free spins). Play money only: anyone can edit localStorage, so nothing here may
 * ever carry real value. All access is wrapped because storage can be unavailable
 * (private windows, blocked site data); the game then simply starts fresh each time.
 */
export const WALLET_KEY = 'pixel-pauker:wallet';

export function loadWallet(game: CompiledGame): SessionSave | null {
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(WALLET_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
  const { save, notes } = parseSessionSave(raw, game);
  for (const n of notes) console.warn(`Saved wallet: ${n}`);
  return save;
}

export function storeWallet(save: SessionSave): void {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable: the wallet lives only as long as the page.
  }
}

export function clearWallet(): void {
  try {
    localStorage.removeItem(WALLET_KEY);
  } catch {
    // ignore
  }
}

/** Notifies when another tab of the same browser saved a different wallet. */
export function onForeignWalletChange(game: CompiledGame, listener: (save: SessionSave) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key !== WALLET_KEY || !e.newValue) return;
    try {
      const { save } = parseSessionSave(JSON.parse(e.newValue), game);
      if (save) listener(save);
    } catch {
      // ignore malformed data from other tabs
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
