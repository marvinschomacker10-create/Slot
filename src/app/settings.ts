import { useCallback, useState } from 'react';

export interface Settings {
  /** Shorter reel animation; the outcome is still fully evaluated and settled. */
  readonly turbo: boolean;
  /** No reel motion, particles or pulsing highlights. */
  readonly reducedMotion: boolean;
  /** Plays awarded free spins automatically. */
  readonly autoFreeSpins: boolean;
}

const KEY = 'gilded-orbit:settings';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function load(overrides: Partial<Settings>): Settings {
  const defaults: Settings = { turbo: false, reducedMotion: prefersReducedMotion(), autoFreeSpins: true };
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
  } catch {
    stored = {};
  }
  return { ...defaults, ...stored, ...overrides };
}

/** Per-viewer presentation preferences (kept in localStorage when available). */
export function useSettings(overrides: Partial<Settings>): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(() => load(overrides));
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode, blocked): settings simply are not remembered.
      }
      return next;
    });
  }, []);
  return [settings, update];
}
