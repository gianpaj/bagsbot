import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
  Logger,
  LogLevel,
  logger,
  sanitize,
  type LogLevelType,
  type LogEntry,
} from './logger.js';

// Helper to create a no-op function for mock implementations
function noop(): void {
  // intentionally empty
}

describe('LogLevel', () => {
  it('should have all expected log levels', () => {
    expect(LogLevel.DEBUG).toBe('debug');
    expect(LogLevel.INFO).toBe('info');
    expect(LogLevel.WARN).toBe('warn');
    expect(LogLevel.ERROR).toBe('error');
  });
});

describe('Logger', () => {
  let consoleLogSpy: Mock<typeof console.log>;
  let consoleErrorSpy: Mock<typeof console.error>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(noop);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(noop);
    originalEnv = process.env['LOG_LEVEL'];
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env['LOG_LEVEL'];
    } else {
      process.env['LOG_LEVEL'] = originalEnv;
    }
  });

  describe('constructor', () => {
    it('should use info as default level', () => {
      delete process.env['LOG_LEVEL'];
      const log = new Logger();
      expect(log.getLevel()).toBe('info');
    });

    it('should use level from config', () => {
      const log = new Logger({ level: 'debug' });
      expect(log.getLevel()).toBe('debug');
    });

    it('should use level from environment variable', () => {
      process.env['LOG_LEVEL'] = 'warn';
      const log = new Logger();
      expect(log.getLevel()).toBe('warn');
    });

    it('should prefer config level over environment variable', () => {
      process.env['LOG_LEVEL'] = 'warn';
      const log = new Logger({ level: 'error' });
      expect(log.getLevel()).toBe('error');
    });

    it('should handle uppercase environment variable', () => {
      process.env['LOG_LEVEL'] = 'DEBUG';
      const log = new Logger();
      expect(log.getLevel()).toBe('debug');
    });

    it('should fallback to info for invalid environment variable', () => {
      process.env['LOG_LEVEL'] = 'invalid';
      const log = new Logger();
      expect(log.getLevel()).toBe('info');
    });
  });

  describe('log level filtering', () => {
    it('should log debug when level is debug', () => {
      const log = new Logger({ level: 'debug' });
      log.debug('test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should not log debug when level is info', () => {
      const log = new Logger({ level: 'info' });
      log.debug('test message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log info when level is info', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should log warn when level is info', () => {
      const log = new Logger({ level: 'info' });
      log.warn('test message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should log error when level is error', () => {
      const log = new Logger({ level: 'error' });
      log.error('test message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should not log warn when level is error', () => {
      const log = new Logger({ level: 'error' });
      log.warn('test message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log all levels when level is debug', () => {
      const log = new Logger({ level: 'debug' });
      log.debug('debug');
      log.info('info');
      log.warn('warn');
      log.error('error');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug, info
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // warn, error
    });
  });

  describe('output streams', () => {
    it('should output debug to stdout', () => {
      const log = new Logger({ level: 'debug' });
      log.debug('test');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should output info to stdout', () => {
      const log = new Logger({ level: 'info' });
      log.info('test');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should output warn to stderr', () => {
      const log = new Logger({ level: 'warn' });
      log.warn('test');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should output error to stderr', () => {
      const log = new Logger({ level: 'error' });
      log.error('test');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('log entry format', () => {
    it('should include timestamp in log entry', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message');

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      expect(entry.timestamp).toBeDefined();
      expect(typeof entry.timestamp).toBe('string');
    });

    it('should include level in log entry', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message');

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      expect(entry.level).toBe('info');
    });

    it('should include message in log entry', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message');

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      expect(entry.message).toBe('test message');
    });

    it('should include context when provided', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message', { key: 'value', number: 42 });

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      expect(entry.context).toEqual({ key: 'value', number: 42 });
    });

    it('should not include context when empty', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message', {});

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      expect(entry.context).toBeUndefined();
    });

    it('should not include context when undefined', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message');

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      expect(entry.context).toBeUndefined();
    });

    it('should use ISO format for timestamp by default', () => {
      const log = new Logger({ level: 'info' });
      log.info('test message');

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(entry.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
    });

    it('should use custom timestamp formatter when provided', () => {
      const customFormatter = (): string => 'CUSTOM_TIMESTAMP';
      const log = new Logger({ level: 'info', timestampFormat: customFormatter });
      log.info('test message');

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const entry = JSON.parse(output) as LogEntry;

      expect(entry.timestamp).toBe('CUSTOM_TIMESTAMP');
    });
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      const log = new Logger({ level: 'error' });
      expect(log.getLevel()).toBe('error');

      log.setLevel('debug');
      expect(log.getLevel()).toBe('debug');
    });

    it('should affect logging after change', () => {
      const log = new Logger({ level: 'error' });
      log.debug('should not log');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      log.setLevel('debug');
      log.debug('should log');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('sanitize', () => {
  describe('sensitive field redaction', () => {
    it('should redact apiKey field', () => {
      const result = sanitize({ apiKey: 'secret123' });
      expect(result).toEqual({ apiKey: '[REDACTED]' });
    });

    it('should redact api_key field', () => {
      const result = sanitize({ api_key: 'secret123' });
      expect(result).toEqual({ api_key: '[REDACTED]' });
    });

    it('should redact privateKey field', () => {
      const result = sanitize({ privateKey: 'my-private-key' });
      expect(result).toEqual({ privateKey: '[REDACTED]' });
    });

    it('should redact private_key field', () => {
      const result = sanitize({ private_key: 'my-private-key' });
      expect(result).toEqual({ private_key: '[REDACTED]' });
    });

    it('should redact secret field', () => {
      const result = sanitize({ secret: 'super-secret' });
      expect(result).toEqual({ secret: '[REDACTED]' });
    });

    it('should redact password field', () => {
      const result = sanitize({ password: 'pass123' });
      expect(result).toEqual({ password: '[REDACTED]' });
    });

    it('should redact seed field', () => {
      const result = sanitize({ seed: 'seed phrase here' });
      expect(result).toEqual({ seed: '[REDACTED]' });
    });

    it('should redact mnemonic field', () => {
      const result = sanitize({ mnemonic: 'word1 word2 word3' });
      expect(result).toEqual({ mnemonic: '[REDACTED]' });
    });

    it('should redact token field', () => {
      const result = sanitize({ token: 'bearer-token' });
      expect(result).toEqual({ token: '[REDACTED]' });
    });

    it('should redact authorization field', () => {
      const result = sanitize({ authorization: 'Bearer xyz' });
      expect(result).toEqual({ authorization: '[REDACTED]' });
    });

    it('should redact auth field', () => {
      const result = sanitize({ auth: 'credentials' });
      expect(result).toEqual({ auth: '[REDACTED]' });
    });

    it('should redact credential field', () => {
      const result = sanitize({ credential: 'cred' });
      expect(result).toEqual({ credential: '[REDACTED]' });
    });

    it('should redact credentials field', () => {
      const result = sanitize({ credentials: { user: 'x', pass: 'y' } });
      expect(result).toEqual({ credentials: '[REDACTED]' });
    });

    it('should be case-insensitive for field names', () => {
      const result = sanitize({
        APIKEY: 'key1',
        ApiKey: 'key2',
        aPiKeY: 'key3',
      });
      expect(result).toEqual({
        APIKEY: '[REDACTED]',
        ApiKey: '[REDACTED]',
        aPiKeY: '[REDACTED]',
      });
    });
  });

  describe('non-sensitive data preservation', () => {
    it('should preserve non-sensitive fields', () => {
      const result = sanitize({
        name: 'test',
        value: 123,
        enabled: true,
      });
      expect(result).toEqual({
        name: 'test',
        value: 123,
        enabled: true,
      });
    });

    it('should preserve null values', () => {
      const result = sanitize({ field: null });
      expect(result).toEqual({ field: null });
    });

    it('should return primitives as-is', () => {
      expect(sanitize('string')).toBe('string');
      expect(sanitize(123)).toBe(123);
      expect(sanitize(true)).toBe(true);
      expect(sanitize(null)).toBe(null);
      expect(sanitize(undefined)).toBe(undefined);
    });
  });

  describe('nested objects', () => {
    it('should redact sensitive fields in nested objects', () => {
      const result = sanitize({
        config: {
          apiKey: 'secret',
          url: 'https://example.com',
        },
      });
      expect(result).toEqual({
        config: {
          apiKey: '[REDACTED]',
          url: 'https://example.com',
        },
      });
    });

    it('should handle deeply nested objects', () => {
      const result = sanitize({
        level1: {
          level2: {
            level3: {
              password: 'deep-secret',
              value: 'keep',
            },
          },
        },
      });
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              password: '[REDACTED]',
              value: 'keep',
            },
          },
        },
      });
    });
  });

  describe('arrays', () => {
    it('should handle arrays', () => {
      const result = sanitize([1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should sanitize objects in arrays', () => {
      const result = sanitize([{ apiKey: 'secret', name: 'test' }]);
      expect(result).toEqual([{ apiKey: '[REDACTED]', name: 'test' }]);
    });

    it('should handle nested arrays', () => {
      const result = sanitize({
        items: [
          { password: 'pass1' },
          { password: 'pass2' },
        ],
      });
      expect(result).toEqual({
        items: [
          { password: '[REDACTED]' },
          { password: '[REDACTED]' },
        ],
      });
    });
  });

  describe('Error objects', () => {
    it('should handle Error objects', () => {
      const error = new Error('Test error');
      const result = sanitize({ error }) as Record<string, unknown>;
      const errorResult = result['error'] as Record<string, unknown>;

      expect(errorResult['name']).toBe('Error');
      expect(errorResult['message']).toBe('Test error');
      expect(errorResult['stack']).toBeDefined();
    });
  });

  describe('circular references', () => {
    it('should handle circular references', () => {
      interface CircularObj {
        name: string;
        self?: CircularObj | string;
      }
      const obj: CircularObj = { name: 'test' };
      obj.self = obj;

      const result = sanitize(obj) as CircularObj;
      expect(result.name).toBe('test');
      expect(result.self).toBe('[Circular]');
    });
  });
});

describe('ChildLogger', () => {
  let consoleLogSpy: Mock<typeof console.log>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(noop);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(noop);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should include base context in all log entries', () => {
    const parent = new Logger({ level: 'debug' });
    const child = parent.child({ service: 'test-service' });

    child.info('message');

    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(output) as LogEntry;

    expect(entry.context).toEqual({ service: 'test-service' });
  });

  it('should merge additional context with base context', () => {
    const parent = new Logger({ level: 'debug' });
    const child = parent.child({ service: 'test-service' });

    child.info('message', { action: 'test-action' });

    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(output) as LogEntry;

    expect(entry.context).toEqual({
      service: 'test-service',
      action: 'test-action',
    });
  });

  it('should allow additional context to override base context', () => {
    const parent = new Logger({ level: 'debug' });
    const child = parent.child({ service: 'base-service' });

    child.info('message', { service: 'override-service' });

    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(output) as LogEntry;

    expect(entry.context).toEqual({ service: 'override-service' });
  });

  it('should support debug level', () => {
    const parent = new Logger({ level: 'debug' });
    const child = parent.child({ component: 'test' });

    child.debug('debug message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('should support info level', () => {
    const parent = new Logger({ level: 'info' });
    const child = parent.child({ component: 'test' });

    child.info('info message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('should support warn level', () => {
    const parent = new Logger({ level: 'warn' });
    const child = parent.child({ component: 'test' });

    child.warn('warn message');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('should support error level', () => {
    const parent = new Logger({ level: 'error' });
    const child = parent.child({ component: 'test' });

    child.error('error message');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('should respect parent log level', () => {
    const parent = new Logger({ level: 'error' });
    const child = parent.child({ component: 'test' });

    child.debug('should not log');
    child.info('should not log');
    child.warn('should not log');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe('Default logger instance', () => {
  it('should export a default logger instance', () => {
    expect(logger).toBeInstanceOf(Logger);
  });

  it('should have all log methods', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

describe('Logger integration with sanitize', () => {
  let consoleLogSpy: Mock<typeof console.log>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(noop);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should redact sensitive fields in log context', () => {
    const log = new Logger({ level: 'info' });
    log.info('User logged in', {
      userId: '123',
      apiKey: 'secret-key',
      password: 'secret-pass',
    });

    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(output) as LogEntry;

    expect(entry.context).toEqual({
      userId: '123',
      apiKey: '[REDACTED]',
      password: '[REDACTED]',
    });
  });

  it('should redact nested sensitive fields in log context', () => {
    const log = new Logger({ level: 'info' });
    log.info('Config loaded', {
      database: {
        host: 'localhost',
        password: 'db-pass',
      },
      wallet: {
        address: 'abc123',
        privateKey: 'private-key-here',
      },
    });

    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(output) as LogEntry;

    expect(entry.context).toEqual({
      database: {
        host: 'localhost',
        password: '[REDACTED]',
      },
      wallet: {
        address: 'abc123',
        privateKey: '[REDACTED]',
      },
    });
  });
});

describe('Log level priority', () => {
  let consoleLogSpy: Mock<typeof console.log>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(noop);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(noop);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const levels: LogLevelType[] = ['debug', 'info', 'warn', 'error'];

  levels.forEach((configLevel, configIndex) => {
    levels.forEach((logLevel, logIndex) => {
      const shouldLog = logIndex >= configIndex;
      const description = shouldLog
        ? `should log ${logLevel} when level is ${configLevel}`
        : `should not log ${logLevel} when level is ${configLevel}`;

      it(description, () => {
        const log = new Logger({ level: configLevel });
        log[logLevel]('test message');

        const totalCalls =
          consoleLogSpy.mock.calls.length + consoleErrorSpy.mock.calls.length;

        if (shouldLog) {
          expect(totalCalls).toBe(1);
        } else {
          expect(totalCalls).toBe(0);
        }
      });
    });
  });
});
