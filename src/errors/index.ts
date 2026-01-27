/**
 * Error handling framework for Bags Sniper Bot
 *
 * This module provides a hierarchy of custom error classes for structured
 * error handling throughout the application. Each error type includes
 * a unique error code for programmatic error identification.
 */

/**
 * Error codes used throughout the application
 */
export const ErrorCodes = {
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TRADE_ERROR: 'TRADE_ERROR',
  FILTER_ERROR: 'FILTER_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
} as const;

/**
 * Type representing all possible error codes
 */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Base error class for all Bags Sniper Bot errors.
 *
 * All custom errors in the application should extend this class
 * to ensure consistent error handling and identification.
 *
 * @example
 * ```typescript
 * throw new BagsBotError('Something went wrong', 'CONNECTION_ERROR');
 * ```
 */
export class BagsBotError extends Error {
  /**
   * Creates a new BagsBotError instance.
   *
   * @param message - Human-readable error message describing the error
   * @param code - Error code for programmatic error identification
   */
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'BagsBotError';
    // Maintains proper stack trace for where error was thrown (V8/Node.js)
    Error.captureStackTrace(this, BagsBotError);
  }
}

/**
 * Error thrown when connection to Solana network or Bags platform fails.
 *
 * Use this error for:
 * - RPC connection failures
 * - WebSocket disconnections
 * - API timeout errors
 * - Network unreachable errors
 *
 * @example
 * ```typescript
 * throw new ConnectionError('Failed to connect to Solana RPC endpoint');
 * ```
 */
export class ConnectionError extends BagsBotError {
  /**
   * Creates a new ConnectionError instance.
   *
   * @param message - Human-readable error message describing the connection failure
   */
  constructor(message: string) {
    super(message, ErrorCodes.CONNECTION_ERROR);
    this.name = 'ConnectionError';
    Error.captureStackTrace(this, ConnectionError);
  }
}

/**
 * Error thrown when a trade operation fails.
 *
 * Use this error for:
 * - Swap execution failures
 * - Insufficient funds
 * - Slippage exceeded
 * - Transaction confirmation failures
 *
 * @example
 * ```typescript
 * throw new TradeError('Swap failed: slippage exceeded', 'abc123...');
 * ```
 */
export class TradeError extends BagsBotError {
  /**
   * Creates a new TradeError instance.
   *
   * @param message - Human-readable error message describing the trade failure
   * @param txSignature - Optional transaction signature if the transaction was submitted
   */
  constructor(
    message: string,
    public readonly txSignature?: string
  ) {
    super(message, ErrorCodes.TRADE_ERROR);
    this.name = 'TradeError';
    Error.captureStackTrace(this, TradeError);
  }
}

/**
 * Error thrown when a filter operation fails.
 *
 * Use this error for:
 * - Filter configuration validation errors
 * - Filter execution failures
 * - Invalid filter input data
 *
 * @example
 * ```typescript
 * throw new FilterError('Creator filter failed: invalid wallet address', 'CreatorFilter');
 * ```
 */
export class FilterError extends BagsBotError {
  /**
   * Creates a new FilterError instance.
   *
   * @param message - Human-readable error message describing the filter failure
   * @param filterName - Name of the filter that failed
   */
  constructor(
    message: string,
    public readonly filterName: string
  ) {
    super(message, ErrorCodes.FILTER_ERROR);
    this.name = 'FilterError';
    Error.captureStackTrace(this, FilterError);
  }
}

/**
 * Error thrown when configuration loading or validation fails.
 *
 * Use this error for:
 * - Missing required configuration values
 * - Invalid configuration format
 * - Environment variable errors
 * - Configuration file parsing errors
 *
 * @example
 * ```typescript
 * throw new ConfigError('Missing required environment variable: SOLANA_RPC_URL');
 * ```
 */
export class ConfigError extends BagsBotError {
  /**
   * Creates a new ConfigError instance.
   *
   * @param message - Human-readable error message describing the configuration error
   */
  constructor(message: string) {
    super(message, ErrorCodes.CONFIG_ERROR);
    this.name = 'ConfigError';
    Error.captureStackTrace(this, ConfigError);
  }
}

/**
 * Type guard to check if an unknown value is a BagsBotError.
 *
 * @param error - The value to check
 * @returns True if the value is a BagsBotError instance
 *
 * @example
 * ```typescript
 * try {
 *   // some operation
 * } catch (error) {
 *   if (isBagsBotError(error)) {
 *     console.log(`Error code: ${error.code}`);
 *   }
 * }
 * ```
 */
export function isBagsBotError(error: unknown): error is BagsBotError {
  return error instanceof BagsBotError;
}

/**
 * Type guard to check if an unknown value is a ConnectionError.
 *
 * @param error - The value to check
 * @returns True if the value is a ConnectionError instance
 */
export function isConnectionError(error: unknown): error is ConnectionError {
  return error instanceof ConnectionError;
}

/**
 * Type guard to check if an unknown value is a TradeError.
 *
 * @param error - The value to check
 * @returns True if the value is a TradeError instance
 */
export function isTradeError(error: unknown): error is TradeError {
  return error instanceof TradeError;
}

/**
 * Type guard to check if an unknown value is a FilterError.
 *
 * @param error - The value to check
 * @returns True if the value is a FilterError instance
 */
export function isFilterError(error: unknown): error is FilterError {
  return error instanceof FilterError;
}

/**
 * Type guard to check if an unknown value is a ConfigError.
 *
 * @param error - The value to check
 * @returns True if the value is a ConfigError instance
 */
export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}
