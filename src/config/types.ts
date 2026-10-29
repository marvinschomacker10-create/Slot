/**
 * Game configuration schema.
 *
 * Every gameplay parameter lives in `config/game.config.json` and is described by
 * these types. Nothing in the rendering layer may hard-code gameplay values; it
 * reads them from the compiled configuration instead.
 *
 * Count tables (`CountTable`) map a symbol count (as a string key, e.g. "3") to an
 * integer value. For line pays the key is the length of the left-to-right
 * combination. For scatter pays and free-spin awards the key is the number of
 * scatter symbols visible anywhere in the window. In every table a count below
 * the smallest key is worth 0, and any count that is not listed (a gap between
 * keys, or above the largest key) uses the value of the largest listed count
 * below it ("N or more").
 */

export type SymbolKind = 'regular' | 'wild' | 'scatter';
export type SymbolTier = 'low' | 'high' | 'premium' | 'special';

export interface SymbolDef {
  /** Stable identifier used in reel strips and pay tables, e.g. "COMET". */
  id: string;
  /** Human-readable name shown in the paytable. */
  name: string;
  kind: SymbolKind;
  tier: SymbolTier;
  description?: string;
}

export type CountTable = Record<string, number>;

export interface ReelStripDef {
  /** Ordered physical stops, top to bottom. The strip wraps around. */
  symbols: string[];
  /**
   * Optional virtual-reel weights, one positive integer per physical stop.
   * Omitted means every physical stop has weight 1 (uniform).
   */
  weights?: number[];
}

export interface ModeDef {
  /** Name of the reel set (key of `reelSets`) used in this mode. */
  reelSet: string;
  /** Multiplier applied once to a line win whose winning positions contain at least one Wild. */
  wildMultiplier: number;
  /** Multiplier applied to every win (line and scatter) in this mode. */
  winMultiplier: number;
}

export interface RetriggerDef {
  enabled: boolean;
  /** Scatter count -> additional free spins awarded during the feature. */
  awards: CountTable;
  /**
   * Upper bound on the total number of free spins awarded in one feature
   * (initial award + all retriggers). Awards that would exceed it are truncated.
   * `null` means unlimited.
   */
  maxTotalSpins: number | null;
}

export interface FreeSpinsDef {
  /** Scatter count in a base-game spin -> free spins awarded. */
  triggerAwards: CountTable;
  retrigger: RetriggerDef;
  /** Whether scatter symbols also pay their scatter prize during free spins. */
  scatterPaysInFeature: boolean;
}

export interface GameConfig {
  meta: {
    id: string;
    name: string;
    version: string;
    description?: string;
  };
  grid: {
    reels: number;
    rows: number;
  };
  symbols: SymbolDef[];
  paytable: {
    /** Symbol id -> (combination length -> multiple of the line bet). Includes Wild-only pays. */
    line: Record<string, CountTable>;
    /** Scatter count -> multiple of the total bet. */
    scatter: CountTable;
  };
  /** Each payline lists the row index (0 = top) used on each reel, left to right. */
  paylines: number[][];
  reelSets: Record<string, ReelStripDef[]>;
  modes: {
    base: ModeDef;
    free: ModeDef;
  };
  freeSpins: FreeSpinsDef;
  bet: {
    /** Allowed line bets in integer credits. Total bet = line bet x number of paylines. */
    lineBetOptions: number[];
    defaultLineBetIndex: number;
  };
  limits: {
    /**
     * Maximum total payout of one game round (paid base spin plus every free spin it
     * triggers), as a multiple of the total bet. `null` disables the cap.
     */
    maxWinMultiplier: number | null;
  };
  session: {
    /** Play-money balance in integer credits at the start of a session. */
    startingBalance: number;
  };
  math: {
    /** Design target for total RTP (per unit of base-game stake). A target, not a guarantee. */
    targetRtp: number;
  };
}

export type GameMode = 'base' | 'free';
