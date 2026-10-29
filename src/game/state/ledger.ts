import { DoubleSettlementError, InsufficientBalanceError } from '../errors';

export type LedgerEntryType = 'stake' | 'win';

export interface LedgerEntry {
  readonly seq: number;
  readonly type: LedgerEntryType;
  /** Round id for stakes, spin id for wins. Each (type, reference) pair can be settled exactly once. */
  readonly reference: string;
  /** Signed amount in integer credits: negative for stakes, non-negative for wins. */
  readonly amount: number;
  readonly balanceAfter: number;
}

function assertCredits(amount: number, what: string): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`${what} must be a non-negative safe integer number of credits, got ${amount}`);
  }
}

/**
 * Play-money ledger. The balance only changes through `debitStake` and
 * `creditWin`, both of which are idempotency-guarded: settling the same stake or
 * the same spin twice throws instead of moving credits again. All amounts are
 * integer credits (JavaScript numbers restricted to the safe-integer range, so
 * arithmetic is exact).
 */
export class Ledger {
  private balanceValue: number;
  private readonly openingBalance: number;
  private readonly settled = new Set<string>();
  private readonly log: LedgerEntry[] = [];

  constructor(openingBalance: number) {
    assertCredits(openingBalance, 'opening balance');
    this.openingBalance = openingBalance;
    this.balanceValue = openingBalance;
  }

  get balance(): number {
    return this.balanceValue;
  }

  get entries(): readonly LedgerEntry[] {
    return this.log;
  }

  hasSettled(type: LedgerEntryType, reference: string): boolean {
    return this.settled.has(`${type}:${reference}`);
  }

  debitStake(reference: string, amount: number): LedgerEntry {
    assertCredits(amount, 'stake');
    if (amount === 0) throw new RangeError('stake must be positive');
    this.guard('stake', reference);
    if (amount > this.balanceValue) throw new InsufficientBalanceError(this.balanceValue, amount);
    return this.append('stake', reference, -amount);
  }

  creditWin(reference: string, amount: number): LedgerEntry {
    assertCredits(amount, 'win');
    this.guard('win', reference);
    return this.append('win', reference, amount);
  }

  /** Recomputes the balance from the opening balance and every entry. */
  verify(): { ok: boolean; recomputed: number } {
    let recomputed = this.openingBalance;
    let ok = true;
    for (const e of this.log) {
      recomputed += e.amount;
      if (e.balanceAfter !== recomputed) ok = false;
    }
    return { ok: ok && recomputed === this.balanceValue, recomputed };
  }

  private guard(type: LedgerEntryType, reference: string): void {
    const key = `${type}:${reference}`;
    if (this.settled.has(key)) throw new DoubleSettlementError(`${type} for "${reference}" has already been settled`);
  }

  private append(type: LedgerEntryType, reference: string, amount: number): LedgerEntry {
    const balanceAfter = this.balanceValue + amount;
    if (!Number.isSafeInteger(balanceAfter)) throw new RangeError('balance left the safe-integer range');
    this.settled.add(`${type}:${reference}`);
    this.balanceValue = balanceAfter;
    const entry: LedgerEntry = Object.freeze({ seq: this.log.length + 1, type, reference, amount, balanceAfter });
    this.log.push(entry);
    return entry;
  }
}
