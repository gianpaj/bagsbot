/**
 * Position tracking and exit management types
 */

/**
 * Status of a trading position
 */
export type PositionStatus = 'open' | 'closed' | 'pending_exit';

/**
 * Represents an open or closed trading position
 */
export interface Position {
  /** Unique identifier for the position */
  id: string;
  /** The mint address of the token */
  mint: string;
  /** The symbol of the token */
  tokenSymbol: string;
  /** Entry price in SOL per token */
  entryPrice: number;
  /** Number of tokens held */
  tokensHeld: number;
  /** Amount of SOL spent to enter */
  entrySol: number;
  /** When the position was opened */
  entryTimestamp: Date;
  /** Current price in SOL per token */
  currentPrice?: number;
  /** Current value in SOL */
  currentValue?: number;
  /** Profit/loss percentage */
  pnlPercent?: number;
  /** Current status of the position */
  status: PositionStatus;
}

/**
 * Configuration for automatic exit triggers
 */
export interface ExitConfig {
  /** Take profit percentage (default: 900 = 10x) */
  takeProfitPercent: number;
  /** Stop loss percentage (default: -50) */
  stopLossPercent: number;
  /** Interval to check exit conditions in ms (default: 5000) */
  checkIntervalMs: number;
  /** Whether automatic selling is enabled (default: false) */
  autoSellEnabled: boolean;
}

/**
 * Type of exit signal
 */
export type ExitSignalType = 'take_profit' | 'stop_loss';

/**
 * Signal that an exit condition has been triggered
 */
export interface ExitSignal {
  /** The position that triggered the signal */
  position: Position;
  /** Type of exit signal */
  type: ExitSignalType;
  /** Current price that triggered the signal */
  currentPrice: number;
  /** The percentage that triggered the exit */
  triggerPercent: number;
}
