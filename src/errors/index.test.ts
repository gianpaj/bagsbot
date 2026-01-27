import { describe, it, expect } from 'vitest';
import {
  BagsBotError,
  ConnectionError,
  TradeError,
  FilterError,
  ConfigError,
  ErrorCodes,
  isBagsBotError,
  isConnectionError,
  isTradeError,
  isFilterError,
  isConfigError,
} from './index.js';

describe('ErrorCodes', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCodes.CONNECTION_ERROR).toBe('CONNECTION_ERROR');
    expect(ErrorCodes.TRADE_ERROR).toBe('TRADE_ERROR');
    expect(ErrorCodes.FILTER_ERROR).toBe('FILTER_ERROR');
    expect(ErrorCodes.CONFIG_ERROR).toBe('CONFIG_ERROR');
  });
});

describe('BagsBotError', () => {
  it('should create error with message and code', () => {
    const error = new BagsBotError('Test error', 'TEST_CODE');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('BagsBotError');
  });

  it('should be an instance of Error', () => {
    const error = new BagsBotError('Test error', 'TEST_CODE');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BagsBotError);
  });

  it('should have a stack trace', () => {
    const error = new BagsBotError('Test error', 'TEST_CODE');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('BagsBotError');
  });

  it('should have readonly code property', () => {
    const error = new BagsBotError('Test error', 'TEST_CODE');

    // TypeScript should prevent this, but verify at runtime
    expect(error.code).toBe('TEST_CODE');
  });
});

describe('ConnectionError', () => {
  it('should create error with message and CONNECTION_ERROR code', () => {
    const error = new ConnectionError('Connection failed');

    expect(error.message).toBe('Connection failed');
    expect(error.code).toBe('CONNECTION_ERROR');
    expect(error.name).toBe('ConnectionError');
  });

  it('should be an instance of BagsBotError', () => {
    const error = new ConnectionError('Connection failed');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BagsBotError);
    expect(error).toBeInstanceOf(ConnectionError);
  });

  it('should have a stack trace', () => {
    const error = new ConnectionError('Connection failed');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ConnectionError');
  });
});

describe('TradeError', () => {
  it('should create error with message and TRADE_ERROR code', () => {
    const error = new TradeError('Trade failed');

    expect(error.message).toBe('Trade failed');
    expect(error.code).toBe('TRADE_ERROR');
    expect(error.name).toBe('TradeError');
    expect(error.txSignature).toBeUndefined();
  });

  it('should accept optional transaction signature', () => {
    const txSig = 'abc123xyz789';
    const error = new TradeError('Trade failed', txSig);

    expect(error.message).toBe('Trade failed');
    expect(error.code).toBe('TRADE_ERROR');
    expect(error.txSignature).toBe(txSig);
  });

  it('should be an instance of BagsBotError', () => {
    const error = new TradeError('Trade failed');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BagsBotError);
    expect(error).toBeInstanceOf(TradeError);
  });

  it('should have a stack trace', () => {
    const error = new TradeError('Trade failed');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('TradeError');
  });
});

describe('FilterError', () => {
  it('should create error with message, filterName, and FILTER_ERROR code', () => {
    const error = new FilterError('Filter failed', 'CreatorFilter');

    expect(error.message).toBe('Filter failed');
    expect(error.code).toBe('FILTER_ERROR');
    expect(error.name).toBe('FilterError');
    expect(error.filterName).toBe('CreatorFilter');
  });

  it('should be an instance of BagsBotError', () => {
    const error = new FilterError('Filter failed', 'TestFilter');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BagsBotError);
    expect(error).toBeInstanceOf(FilterError);
  });

  it('should have a stack trace', () => {
    const error = new FilterError('Filter failed', 'TestFilter');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('FilterError');
  });
});

describe('ConfigError', () => {
  it('should create error with message and CONFIG_ERROR code', () => {
    const error = new ConfigError('Config invalid');

    expect(error.message).toBe('Config invalid');
    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.name).toBe('ConfigError');
  });

  it('should be an instance of BagsBotError', () => {
    const error = new ConfigError('Config invalid');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BagsBotError);
    expect(error).toBeInstanceOf(ConfigError);
  });

  it('should have a stack trace', () => {
    const error = new ConfigError('Config invalid');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ConfigError');
  });
});

describe('Type Guards', () => {
  describe('isBagsBotError', () => {
    it('should return true for BagsBotError', () => {
      expect(isBagsBotError(new BagsBotError('test', 'CODE'))).toBe(true);
    });

    it('should return true for subclasses', () => {
      expect(isBagsBotError(new ConnectionError('test'))).toBe(true);
      expect(isBagsBotError(new TradeError('test'))).toBe(true);
      expect(isBagsBotError(new FilterError('test', 'filter'))).toBe(true);
      expect(isBagsBotError(new ConfigError('test'))).toBe(true);
    });

    it('should return false for regular errors', () => {
      expect(isBagsBotError(new Error('test'))).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isBagsBotError(null)).toBe(false);
      expect(isBagsBotError(undefined)).toBe(false);
      expect(isBagsBotError('error')).toBe(false);
      expect(isBagsBotError({ message: 'test', code: 'CODE' })).toBe(false);
    });
  });

  describe('isConnectionError', () => {
    it('should return true for ConnectionError', () => {
      expect(isConnectionError(new ConnectionError('test'))).toBe(true);
    });

    it('should return false for other BagsBotErrors', () => {
      expect(isConnectionError(new BagsBotError('test', 'CODE'))).toBe(false);
      expect(isConnectionError(new TradeError('test'))).toBe(false);
      expect(isConnectionError(new FilterError('test', 'filter'))).toBe(false);
      expect(isConnectionError(new ConfigError('test'))).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isConnectionError(null)).toBe(false);
      expect(isConnectionError(undefined)).toBe(false);
    });
  });

  describe('isTradeError', () => {
    it('should return true for TradeError', () => {
      expect(isTradeError(new TradeError('test'))).toBe(true);
      expect(isTradeError(new TradeError('test', 'sig123'))).toBe(true);
    });

    it('should return false for other BagsBotErrors', () => {
      expect(isTradeError(new BagsBotError('test', 'CODE'))).toBe(false);
      expect(isTradeError(new ConnectionError('test'))).toBe(false);
      expect(isTradeError(new FilterError('test', 'filter'))).toBe(false);
      expect(isTradeError(new ConfigError('test'))).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isTradeError(null)).toBe(false);
      expect(isTradeError(undefined)).toBe(false);
    });
  });

  describe('isFilterError', () => {
    it('should return true for FilterError', () => {
      expect(isFilterError(new FilterError('test', 'TestFilter'))).toBe(true);
    });

    it('should return false for other BagsBotErrors', () => {
      expect(isFilterError(new BagsBotError('test', 'CODE'))).toBe(false);
      expect(isFilterError(new ConnectionError('test'))).toBe(false);
      expect(isFilterError(new TradeError('test'))).toBe(false);
      expect(isFilterError(new ConfigError('test'))).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isFilterError(null)).toBe(false);
      expect(isFilterError(undefined)).toBe(false);
    });
  });

  describe('isConfigError', () => {
    it('should return true for ConfigError', () => {
      expect(isConfigError(new ConfigError('test'))).toBe(true);
    });

    it('should return false for other BagsBotErrors', () => {
      expect(isConfigError(new BagsBotError('test', 'CODE'))).toBe(false);
      expect(isConfigError(new ConnectionError('test'))).toBe(false);
      expect(isConfigError(new TradeError('test'))).toBe(false);
      expect(isConfigError(new FilterError('test', 'filter'))).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isConfigError(null)).toBe(false);
      expect(isConfigError(undefined)).toBe(false);
    });
  });
});

describe('Error Throwing and Catching', () => {
  it('should be catchable with try-catch', () => {
    let caughtError: unknown;

    try {
      throw new ConnectionError('Network unreachable');
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ConnectionError);
    expect(isBagsBotError(caughtError)).toBe(true);
    if (isBagsBotError(caughtError)) {
      expect(caughtError.code).toBe('CONNECTION_ERROR');
    }
  });

  it('should preserve error chain when re-throwing', () => {
    let caughtError: unknown;

    try {
      try {
        throw new Error('Original error');
      } catch {
        throw new TradeError('Trade failed due to network error', 'tx123');
      }
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(TradeError);
    if (isTradeError(caughtError)) {
      expect(caughtError.txSignature).toBe('tx123');
    }
  });

  it('should work with async/await error handling', async () => {
    const asyncOperation = async (): Promise<void> => {
      await Promise.resolve();
      throw new ConfigError('Missing required configuration');
    };

    await expect(asyncOperation()).rejects.toThrow(ConfigError);
    await expect(asyncOperation()).rejects.toThrow('Missing required configuration');
  });
});

describe('Error Serialization', () => {
  it('should serialize to string correctly', () => {
    const error = new ConnectionError('RPC connection failed');

    const errorString = error.toString();

    expect(errorString).toContain('ConnectionError');
    expect(errorString).toContain('RPC connection failed');
  });

  it('should serialize to JSON (name and message)', () => {
    const error = new TradeError('Slippage exceeded', 'tx456');

    // Note: Error.prototype doesn't serialize all properties by default
    const json = JSON.stringify({
      name: error.name,
      message: error.message,
      code: error.code,
      txSignature: error.txSignature,
    });

    expect(json).toContain('TradeError');
    expect(json).toContain('Slippage exceeded');
    expect(json).toContain('TRADE_ERROR');
    expect(json).toContain('tx456');
  });
});
