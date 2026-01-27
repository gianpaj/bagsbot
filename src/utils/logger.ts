/**
 * Structured logging utility for Bags Sniper Bot
 *
 * Provides log levels (debug, info, warn, error), timestamp formatting,
 * context/metadata support, and automatic filtering of sensitive data.
 *
 * @module utils/logger
 */

/**
 * Log levels in order of verbosity (debug is most verbose)
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

/**
 * Type representing all possible log levels
 */
export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Numeric priority for log levels (lower = more verbose)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevelType, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Fields that should be redacted from log output to prevent sensitive data leakage
 */
const SENSITIVE_FIELDS = new Set([
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'secret',
  'password',
  'seed',
  'mnemonic',
  'token',
  'authorization',
  'auth',
  'credential',
  'credentials',
]);

/**
 * Placeholder text for redacted sensitive values
 */
const REDACTED_VALUE = '[REDACTED]';

/**
 * Structured log entry format
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevelType;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum log level to output (default: 'info') */
  level?: LogLevelType;
  /** Custom timestamp formatter (default: ISO format) */
  timestampFormat?: () => string;
}

/**
 * Context/metadata type for log entries
 */
export type LogContext = Record<string, unknown>;

/**
 * Check if a field name is sensitive and should be redacted
 *
 * @param key - The field name to check
 * @returns True if the field should be redacted
 */
function isSensitiveField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_FIELDS.has(lowerKey);
}

/**
 * Recursively sanitize an object by redacting sensitive fields
 *
 * @param obj - The object to sanitize
 * @param visited - Set of visited objects to prevent circular reference issues
 * @returns A new object with sensitive fields redacted
 */
function sanitizeObject(
  obj: unknown,
  visited = new WeakSet()
): unknown {
  // Handle null and non-objects
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (visited.has(obj)) {
    return '[Circular]';
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    visited.add(obj);
    return obj.map((item) => sanitizeObject(item, visited));
  }

  // Handle Error objects
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: obj.message,
      stack: obj.stack,
    };
  }

  // Handle plain objects
  visited.add(obj);
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      sanitized[key] = REDACTED_VALUE;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, visited);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Get the current log level from environment variable
 *
 * @returns The configured log level or 'info' as default
 */
function getLogLevelFromEnv(): LogLevelType {
  const envLevel = process.env['LOG_LEVEL']?.toLowerCase();
  if (
    envLevel !== undefined &&
    envLevel !== '' &&
    envLevel in LOG_LEVEL_PRIORITY
  ) {
    return envLevel as LogLevelType;
  }
  return LogLevel.INFO;
}

/**
 * Default timestamp formatter using ISO 8601 format
 *
 * @returns Current timestamp in ISO format
 */
function defaultTimestampFormat(): string {
  return new Date().toISOString();
}

/**
 * Format a log entry as a JSON string
 *
 * @param entry - The log entry to format
 * @returns JSON string representation of the log entry
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Logger class providing structured logging with levels, timestamps, and context support
 *
 * @example
 * ```typescript
 * const logger = new Logger({ level: 'debug' });
 * logger.info('Server started', { port: 3000 });
 * logger.error('Connection failed', { error: new Error('timeout') });
 * ```
 */
export class Logger {
  private level: LogLevelType;
  private timestampFormat: () => string;

  /**
   * Creates a new Logger instance
   *
   * @param config - Logger configuration options
   */
  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? getLogLevelFromEnv();
    this.timestampFormat = config.timestampFormat ?? defaultTimestampFormat;
  }

  /**
   * Check if a log level should be output based on current configuration
   *
   * @param level - The log level to check
   * @returns True if the level should be logged
   */
  private shouldLog(level: LogLevelType): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  /**
   * Create a log entry with timestamp, level, message, and optional context
   *
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context/metadata
   * @returns Formatted log entry
   */
  private createLogEntry(
    level: LogLevelType,
    message: string,
    context?: LogContext
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: this.timestampFormat(),
      level,
      message,
    };

    if (context !== undefined && Object.keys(context).length > 0) {
      entry.context = sanitizeObject(context) as Record<string, unknown>;
    }

    return entry;
  }

  /**
   * Output a log entry to the appropriate stream
   *
   * @param level - Log level (determines stdout vs stderr)
   * @param entry - The log entry to output
   */
  private output(level: LogLevelType, entry: LogEntry): void {
    const formatted = formatLogEntry(entry);

    if (level === LogLevel.WARN || level === LogLevel.ERROR) {
      // eslint-disable-next-line no-console
      console.error(formatted);
    } else {
      // eslint-disable-next-line no-console
      console.log(formatted);
    }
  }

  /**
   * Log a debug message
   *
   * @param message - The message to log
   * @param context - Optional context/metadata
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
      this.output(LogLevel.DEBUG, entry);
    }
  }

  /**
   * Log an info message
   *
   * @param message - The message to log
   * @param context - Optional context/metadata
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry(LogLevel.INFO, message, context);
      this.output(LogLevel.INFO, entry);
    }
  }

  /**
   * Log a warning message
   *
   * @param message - The message to log
   * @param context - Optional context/metadata
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createLogEntry(LogLevel.WARN, message, context);
      this.output(LogLevel.WARN, entry);
    }
  }

  /**
   * Log an error message
   *
   * @param message - The message to log
   * @param context - Optional context/metadata
   */
  error(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.createLogEntry(LogLevel.ERROR, message, context);
      this.output(LogLevel.ERROR, entry);
    }
  }

  /**
   * Get the current log level
   *
   * @returns The current log level
   */
  getLevel(): LogLevelType {
    return this.level;
  }

  /**
   * Set a new log level
   *
   * @param level - The new log level
   */
  setLevel(level: LogLevelType): void {
    this.level = level;
  }

  /**
   * Create a child logger with additional context
   *
   * @param baseContext - Context to include in all log entries from this child
   * @returns A new Logger-like object with the context pre-applied
   */
  child(baseContext: LogContext): ChildLogger {
    return new ChildLogger(this, baseContext);
  }
}

/**
 * Child logger that includes base context in all log entries
 */
export class ChildLogger {
  private parent: Logger;
  private baseContext: LogContext;

  /**
   * Creates a new ChildLogger instance
   *
   * @param parent - The parent Logger instance
   * @param baseContext - Context to include in all log entries
   */
  constructor(parent: Logger, baseContext: LogContext) {
    this.parent = parent;
    this.baseContext = baseContext;
  }

  /**
   * Merge base context with additional context
   *
   * @param context - Additional context to merge
   * @returns Merged context object
   */
  private mergeContext(context?: LogContext): LogContext {
    if (context === undefined) {
      return this.baseContext;
    }
    return { ...this.baseContext, ...context };
  }

  /**
   * Log a debug message
   *
   * @param message - The message to log
   * @param context - Optional additional context
   */
  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  /**
   * Log an info message
   *
   * @param message - The message to log
   * @param context - Optional additional context
   */
  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  /**
   * Log a warning message
   *
   * @param message - The message to log
   * @param context - Optional additional context
   */
  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  /**
   * Log an error message
   *
   * @param message - The message to log
   * @param context - Optional additional context
   */
  error(message: string, context?: LogContext): void {
    this.parent.error(message, this.mergeContext(context));
  }
}

/**
 * Default logger instance configured from environment
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * logger.info('Application started');
 * logger.debug('Processing item', { itemId: 123 });
 * ```
 */
export const logger = new Logger();

/**
 * Utility function to sanitize an object for logging
 * Exposed for testing and external use
 *
 * @param obj - The object to sanitize
 * @returns A new object with sensitive fields redacted
 */
export function sanitize(obj: unknown): unknown {
  return sanitizeObject(obj);
}
