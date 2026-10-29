/**
 * Timed play-money top-up ("Taschengeld").
 *
 * A fixed amount of play credits can be collected once per interval. The first
 * top-up becomes available one interval after the wallet was created, each later
 * one an interval after the previous collection. Uncollected top-ups do not
 * accumulate. Top-ups are not game wins: they never enter RTP or win statistics.
 */

export interface AllowanceRule {
  readonly amount: number;
  readonly intervalMs: number;
}

export interface AllowanceStatus {
  readonly enabled: boolean;
  readonly amount: number;
  readonly available: boolean;
  /** When the next top-up can be collected (epoch ms), or null when disabled. */
  readonly nextAt: number | null;
  /** Milliseconds until `nextAt` (0 when available). */
  readonly remainingMs: number;
  readonly intervalMs: number;
}

/**
 * `lastClaimAt` is the epoch-ms time of the last collection (or of wallet creation).
 * If it lies in the future - the device clock was turned back or saved data is odd -
 * it is treated as "now". GameSession also clamps a restored value to the load time,
 * so a wallet can never lock up for longer than one interval after loading.
 */
export function allowanceStatus(rule: AllowanceRule | null, lastClaimAt: number, now: number): AllowanceStatus {
  if (!rule) return { enabled: false, amount: 0, available: false, nextAt: null, remainingMs: 0, intervalMs: 0 };
  const anchor = Number.isFinite(lastClaimAt) ? Math.min(lastClaimAt, now) : now;
  const nextAt = anchor + rule.intervalMs;
  const remainingMs = Math.max(0, nextAt - now);
  return {
    enabled: true,
    amount: rule.amount,
    available: remainingMs === 0,
    nextAt,
    remainingMs,
    intervalMs: rule.intervalMs,
  };
}

/** "mm:ss" (or "h:mm:ss") for a countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
