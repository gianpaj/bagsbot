/**
 * Retry utility with exponential backoff for transient failures
 *
 * Provides configurable retry logic with jitter to prevent thundering herd
 * issues when multiple operations retry simultaneously.
 *
 * @module utils/retry
 */

/**
 * Options for configuring retry behavior
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts (not including the initial attempt)
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds before the first retry
   * @default 1000
   */
  baseDelayMs?: number;

  /**
   * Maximum delay in milliseconds between retries
   * @default 30000
   */
  maxDelayMs?: number;

  /**
   * Predicate function to determine if an error should trigger a retry
   * Return true to retry, false to fail immediately
   * @default Always returns true (retry all errors)
   */
  shouldRetry?: (error: unknown) => boolean;

  /**
   * Per-attempt timeout in milliseconds. When set, each invocation of `fn` is
   * raced against this timeout; if `fn` does not settle in time the attempt
   * rejects with a {@link RetryTimeoutError} (which is treated as a normal
   * error and is therefore subject to `shouldRetry`/`maxRetries`).
   *
   * Guards against network calls that hang indefinitely (no response, dropped
   * socket) — without a timeout such a call would block the retry loop forever,
   * since `retry` only acts once `fn` settles.
   * @default undefined (no per-attempt timeout)
   */
  timeoutMs?: number;

  /**
   * AbortSignal to cancel the retry operation
   */
  signal?: AbortSignal;

  /**
   * Callback invoked before each retry attempt
   * Useful for logging or metrics
   */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'signal' | 'onRetry' | 'timeoutMs'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  shouldRetry: () => true,
};

/**
 * Error thrown when an operation is aborted via AbortSignal
 */
export class RetryAbortedError extends Error {
  constructor(message = 'Retry operation was aborted') {
    super(message);
    this.name = 'RetryAbortedError';
  }
}

/**
 * Error thrown when a single attempt exceeds the configured per-attempt timeout
 */
export class RetryTimeoutError extends Error {
  /**
   * The timeout (in milliseconds) that was exceeded
   */
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Operation timed out after ${String(timeoutMs)}ms`);
    this.name = 'RetryTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when all retry attempts have been exhausted
 */
export class RetryExhaustedError extends Error {
  /**
   * The original error that caused the final failure
   */
  public override readonly cause: unknown;

  /**
   * Number of attempts made (including the initial attempt)
   */
  public readonly attempts: number;

  constructor(message: string, cause: unknown, attempts: number) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.cause = cause;
    this.attempts = attempts;
  }
}

/**
 * Calculate delay with exponential backoff and jitter
 *
 * Uses full jitter strategy: delay = random(0, min(maxDelay, baseDelay * 2^attempt))
 * This provides better distribution than other jitter strategies.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds with jitter applied
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Calculate exponential delay: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Apply full jitter: random value between 0 and cappedDelay
  const jitteredDelay = Math.random() * cappedDelay;

  // Ensure at least 1ms delay and return as integer
  return Math.max(1, Math.floor(jitteredDelay));
}

/**
 * Sleep for a specified duration, with support for abort signals
 *
 * @param ms - Duration to sleep in milliseconds
 * @param signal - Optional AbortSignal to cancel the sleep
 * @returns Promise that resolves after the specified duration
 * @throws RetryAbortedError if the signal is aborted
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new RetryAbortedError());
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;

    const cleanup = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (signal !== undefined && abortHandler !== null) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    if (signal !== undefined) {
      abortHandler = (): void => {
        cleanup();
        reject(new RetryAbortedError());
      };

      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

/**
 * Run a single attempt with an optional per-attempt timeout.
 *
 * `fn`'s promise is raced against a timeout. Using `Promise.race` preserves the
 * original rejection reason from `fn` (rather than re-wrapping it). The in-flight
 * `fn()` promise also gets its own no-op rejection handler, so even if `fn`
 * rejects *after* the timeout has already won the race it never surfaces as an
 * unhandled rejection.
 *
 * @param fn - The function to invoke for this attempt
 * @param timeoutMs - Per-attempt timeout; when undefined `fn` is awaited directly
 * @returns The resolved value of `fn`
 * @throws RetryTimeoutError if `fn` does not settle within `timeoutMs`
 */
function runAttempt<T>(fn: () => Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (timeoutMs === undefined) {
    return fn();
  }

  const fnPromise = fn();
  // Ensure a late rejection (after the timeout already won the race) is always
  // handled, so it never leaks as an unhandled rejection.
  void fnPromise.catch(() => undefined);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new RetryTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([fnPromise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * Retry an async function with exponential backoff
 *
 * @typeParam T - Return type of the function being retried
 * @param fn - Async function to retry
 * @param options - Retry configuration options
 * @returns Promise resolving to the function's return value
 * @throws RetryAbortedError if the operation is aborted via signal
 * @throws RetryExhaustedError if all retry attempts are exhausted
 * @throws The original error if shouldRetry returns false
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await retry(
 *   () => fetchData(),
 *   { maxRetries: 3, baseDelayMs: 100 }
 * );
 *
 * // With error filtering
 * const result = await retry(
 *   () => makeApiCall(),
 *   {
 *     maxRetries: 5,
 *     shouldRetry: (error) => error instanceof NetworkError,
 *   }
 * );
 *
 * // With abort signal
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * const result = await retry(
 *   () => longRunningOperation(),
 *   { signal: controller.signal }
 * );
 * ```
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    baseDelayMs = DEFAULT_OPTIONS.baseDelayMs,
    maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
    shouldRetry = DEFAULT_OPTIONS.shouldRetry,
    timeoutMs,
    signal,
    onRetry,
  } = options;

  let lastError: unknown;
  let attempt = 0;

  while (attempt <= maxRetries) {
    // Check for abort before each attempt
    if (signal?.aborted === true) {
      throw new RetryAbortedError();
    }

    try {
      return await runAttempt(fn, timeoutMs);
    } catch (error) {
      lastError = error;
      attempt++;

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt > maxRetries) {
        throw new RetryExhaustedError(
          `Retry exhausted after ${String(attempt)} attempts`,
          lastError,
          attempt
        );
      }

      // Check for abort before sleeping
      // Note: signal may have been aborted during the fn() call above
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
      if (signal?.aborted) {
        throw new RetryAbortedError();
      }

      // Calculate delay with backoff and jitter
      const delayMs = calculateBackoffDelay(attempt - 1, baseDelayMs, maxDelayMs);

      // Invoke onRetry callback if provided
      if (onRetry !== undefined) {
        onRetry(attempt, error, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs, signal);
    }
  }

  // This should never be reached due to the throw in the loop,
  // but TypeScript needs it for type safety
  throw new RetryExhaustedError(
    `Retry exhausted after ${String(attempt)} attempts`,
    lastError,
    attempt
  );
}
