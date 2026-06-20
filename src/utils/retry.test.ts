import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retry,
  sleep,
  calculateBackoffDelay,
  RetryAbortedError,
  RetryExhaustedError,
  RetryTimeoutError,
} from './retry.js';

describe('calculateBackoffDelay', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should calculate exponential delay for attempt 0', () => {
    const delay = calculateBackoffDelay(0, 1000, 30000);
    // baseDelay * 2^0 * jitter(0.5) = 1000 * 1 * 0.5 = 500
    expect(delay).toBe(500);
  });

  it('should calculate exponential delay for attempt 1', () => {
    const delay = calculateBackoffDelay(1, 1000, 30000);
    // baseDelay * 2^1 * jitter(0.5) = 1000 * 2 * 0.5 = 1000
    expect(delay).toBe(1000);
  });

  it('should calculate exponential delay for attempt 2', () => {
    const delay = calculateBackoffDelay(2, 1000, 30000);
    // baseDelay * 2^2 * jitter(0.5) = 1000 * 4 * 0.5 = 2000
    expect(delay).toBe(2000);
  });

  it('should cap delay at maxDelayMs', () => {
    const delay = calculateBackoffDelay(10, 1000, 5000);
    // baseDelay * 2^10 = 1024000, capped at 5000, * jitter(0.5) = 2500
    expect(delay).toBe(2500);
  });

  it('should return at least 1ms', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const delay = calculateBackoffDelay(0, 1000, 30000);
    expect(delay).toBeGreaterThanOrEqual(1);
  });

  it('should return integer values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.333);
    const delay = calculateBackoffDelay(1, 1000, 30000);
    expect(Number.isInteger(delay)).toBe(true);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve after specified duration', async () => {
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('should reject immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toThrow(RetryAbortedError);
  });

  it('should reject when signal is aborted during sleep', async () => {
    const controller = new AbortController();
    const promise = sleep(1000, controller.signal);

    vi.advanceTimersByTime(500);
    controller.abort();

    await expect(promise).rejects.toThrow(RetryAbortedError);
  });
});

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('successful operations', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return result after retries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const promise = retry(fn, { maxRetries: 3, baseDelayMs: 100 });

      // Advance through the delays
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('exhausted retries', () => {
    it('should throw RetryExhaustedError when max retries exceeded', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      const promise = retry(fn, { maxRetries: 2, baseDelayMs: 100 });

      // Attach the rejection handler BEFORE flushing timers. Otherwise the
      // retry promise settles (rejects) during runAllTimersAsync() while no
      // handler is attached yet, which surfaces as an unhandled rejection.
      const assertion = expect(promise).rejects.toThrow(RetryExhaustedError);

      // Advance through all retries and let promise settle
      await vi.runAllTimersAsync();

      await assertion;
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should include attempt count in RetryExhaustedError', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      const promise = retry(fn, { maxRetries: 3, baseDelayMs: 100 });

      // Capture the settled error before flushing timers so the rejection is
      // always handled (otherwise it leaks as an unhandled rejection during
      // runAllTimersAsync()).
      const captured = promise.then(
        () => undefined,
        (error: unknown) => error
      );

      // Run all timers to completion
      await vi.runAllTimersAsync();

      const error = await captured;
      expect(error).toBeInstanceOf(RetryExhaustedError);
      expect((error as RetryExhaustedError).attempts).toBe(4);
    });

    it('should include original error as cause in RetryExhaustedError', async () => {
      const originalError = new Error('original error');
      const fn = vi.fn().mockRejectedValue(originalError);

      const promise = retry(fn, { maxRetries: 1, baseDelayMs: 100 });

      // Capture the settled error before flushing timers so the rejection is
      // always handled (avoids a leaked unhandled rejection).
      const captured = promise.then(
        () => undefined,
        (error: unknown) => error
      );

      await vi.runAllTimersAsync();

      const error = await captured;
      expect(error).toBeInstanceOf(RetryExhaustedError);
      expect((error as RetryExhaustedError).cause).toBe(originalError);
    });
  });

  describe('shouldRetry predicate', () => {
    it('should not retry if shouldRetry returns false', async () => {
      const nonRetryableError = new Error('non-retryable');
      const fn = vi.fn().mockRejectedValue(nonRetryableError);

      const promise = retry(fn, {
        maxRetries: 3,
        shouldRetry: () => false,
      });

      await expect(promise).rejects.toThrow(nonRetryableError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass error to shouldRetry predicate', async () => {
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);
      const shouldRetry = vi.fn().mockReturnValue(false);

      const promise = retry(fn, { maxRetries: 3, shouldRetry });

      await expect(promise).rejects.toThrow(error);
      expect(shouldRetry).toHaveBeenCalledWith(error);
    });

    it('should retry only for specific error types', async () => {
      class RetryableError extends Error {}
      class NonRetryableError extends Error {}

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('retry me'))
        .mockRejectedValueOnce(new NonRetryableError('do not retry'));

      const promise = retry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        shouldRetry: (error) => error instanceof RetryableError,
      });

      // Attach the rejection handler before flushing timers (avoids a leaked
      // unhandled rejection when the promise settles during runAllTimersAsync).
      const assertion = expect(promise).rejects.toThrow(NonRetryableError);

      await vi.runAllTimersAsync();

      await assertion;
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('abort signal', () => {
    it('should abort immediately if signal is already aborted', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const controller = new AbortController();
      controller.abort();

      await expect(retry(fn, { signal: controller.signal })).rejects.toThrow(RetryAbortedError);

      expect(fn).not.toHaveBeenCalled();
    });

    it('should abort during retry delay', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const controller = new AbortController();

      const promise = retry(fn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        signal: controller.signal,
      });

      // Let the first attempt fail and start waiting
      await vi.advanceTimersByTimeAsync(0);

      // Abort during the delay before second attempt
      controller.abort();

      // The promise should now reject with RetryAbortedError
      await expect(promise).rejects.toThrow(RetryAbortedError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should abort between attempts', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail1')).mockResolvedValue('success');

      const controller = new AbortController();

      const promise = retry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        signal: controller.signal,
      });

      // First attempt fails, start waiting
      await vi.advanceTimersByTimeAsync(0);

      // Abort before second attempt
      controller.abort();

      await expect(promise).rejects.toThrow(RetryAbortedError);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry before each retry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      // Fix random for predictable delays
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const promise = retry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        onRetry,
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), 50);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), 100);
    });

    it('should pass error to onRetry callback', async () => {
      const error1 = new Error('fail1');
      const error2 = new Error('fail2');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockResolvedValue('success');

      const onRetry = vi.fn();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const promise = retry(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        onRetry,
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenNthCalledWith(1, 1, error1, expect.any(Number));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, error2, expect.any(Number));
    });
  });

  describe('per-attempt timeout (TP-3 regression)', () => {
    it('should time out an attempt whose fn never settles', async () => {
      // Without timeoutMs this attempt would hang forever and the retry loop
      // would never make progress (no timer is scheduled to flush).
      const fn = vi.fn().mockReturnValue(new Promise(() => undefined));

      // shouldRetry:false so the raw timeout error surfaces (not wrapped in
      // RetryExhaustedError).
      const promise = retry(fn, { maxRetries: 3, timeoutMs: 1000, shouldRetry: () => false });

      // Capture the settled error before flushing timers so the rejection is
      // always handled (avoids a leaked unhandled rejection).
      const captured = promise.then(
        () => undefined,
        (error: unknown) => error
      );

      await vi.runAllTimersAsync();

      const error = await captured;
      expect(error).toBeInstanceOf(RetryTimeoutError);
      expect((error as RetryTimeoutError).timeoutMs).toBe(1000);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry a timed-out attempt and exhaust with a timeout cause', async () => {
      const fn = vi.fn().mockReturnValue(new Promise(() => undefined));

      const promise = retry(fn, { maxRetries: 2, baseDelayMs: 100, timeoutMs: 500 });

      const captured = promise.then(
        () => undefined,
        (error: unknown) => error
      );

      await vi.runAllTimersAsync();

      const error = await captured;
      expect(error).toBeInstanceOf(RetryExhaustedError);
      expect((error as RetryExhaustedError).cause).toBeInstanceOf(RetryTimeoutError);
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries, each timed out
    });

    it('should resolve when fn settles before the timeout', async () => {
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve('ok');
            }, 200);
          })
      );

      const promise = retry(fn, { timeoutMs: 1000 });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not time out when no timeoutMs is provided', async () => {
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve('slow-but-fine');
            }, 60_000);
          })
      );

      const promise = retry(fn);

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('slow-but-fine');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('default options', () => {
    it('should use default maxRetries of 3', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      const promise = retry(fn, { baseDelayMs: 100 });

      // Attach the rejection handler before flushing timers (avoids a leaked
      // unhandled rejection when the promise settles during runAllTimersAsync).
      const assertion = expect(promise).rejects.toThrow(RetryExhaustedError);

      await vi.runAllTimersAsync();

      await assertion;
      expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('should work with no options provided', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
    });
  });
});

describe('RetryAbortedError', () => {
  it('should have correct name', () => {
    const error = new RetryAbortedError();
    expect(error.name).toBe('RetryAbortedError');
  });

  it('should have default message', () => {
    const error = new RetryAbortedError();
    expect(error.message).toBe('Retry operation was aborted');
  });

  it('should accept custom message', () => {
    const error = new RetryAbortedError('Custom abort message');
    expect(error.message).toBe('Custom abort message');
  });

  it('should be instanceof Error', () => {
    const error = new RetryAbortedError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('RetryExhaustedError', () => {
  it('should have correct name', () => {
    const error = new RetryExhaustedError('message', new Error('cause'), 3);
    expect(error.name).toBe('RetryExhaustedError');
  });

  it('should have message', () => {
    const error = new RetryExhaustedError('Retry failed', new Error('cause'), 3);
    expect(error.message).toBe('Retry failed');
  });

  it('should have cause', () => {
    const cause = new Error('original error');
    const error = new RetryExhaustedError('message', cause, 3);
    expect(error.cause).toBe(cause);
  });

  it('should have attempts', () => {
    const error = new RetryExhaustedError('message', new Error('cause'), 5);
    expect(error.attempts).toBe(5);
  });

  it('should be instanceof Error', () => {
    const error = new RetryExhaustedError('message', new Error('cause'), 3);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('RetryTimeoutError', () => {
  it('should have correct name', () => {
    const error = new RetryTimeoutError(5000);
    expect(error.name).toBe('RetryTimeoutError');
  });

  it('should include the timeout in the message', () => {
    const error = new RetryTimeoutError(5000);
    expect(error.message).toBe('Operation timed out after 5000ms');
  });

  it('should expose the timeoutMs', () => {
    const error = new RetryTimeoutError(5000);
    expect(error.timeoutMs).toBe(5000);
  });

  it('should be instanceof Error', () => {
    const error = new RetryTimeoutError(5000);
    expect(error).toBeInstanceOf(Error);
  });
});
