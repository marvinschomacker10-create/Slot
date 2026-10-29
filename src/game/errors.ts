/** Raised when an operation is not allowed in the current game state. */
export class GameStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameStateError';
  }
}

/** Raised when a stake or win would be settled more than once. */
export class DoubleSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoubleSettlementError';
  }
}

export class InsufficientBalanceError extends GameStateError {
  constructor(balance: number, required: number) {
    super(`Insufficient play-money balance: ${balance} credits available, ${required} required`);
    this.name = 'InsufficientBalanceError';
  }
}
