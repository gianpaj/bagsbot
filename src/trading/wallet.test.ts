import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { readFileSync } from 'fs';
import { Keypair, PublicKey, Connection, VersionedTransaction, Transaction } from '@solana/web3.js';
import { WalletManager } from './wallet.js';
import { logger } from '../utils/logger.js';

// Mock the file system
vi.mock('fs');

// Helper to create a no-op function for mock implementations
function noop(): void {
  // intentionally empty
}

describe('WalletManager', () => {
  let walletManager: WalletManager;
  let mockReadFileSync: Mock<typeof readFileSync>;
  let mockLoggerInfo: Mock;
  let mockLoggerError: Mock;
  let mockLoggerDebug: Mock;

  beforeEach(() => {
    walletManager = new WalletManager();
    mockReadFileSync = vi.mocked(readFileSync);
    mockLoggerInfo = vi.spyOn(logger, 'info').mockImplementation(noop);
    mockLoggerError = vi.spyOn(logger, 'error').mockImplementation(noop);
    mockLoggerDebug = vi.spyOn(logger, 'debug').mockImplementation(noop);
  });

  afterEach(() => {
    mockLoggerInfo.mockRestore();
    mockLoggerError.mockRestore();
    mockLoggerDebug.mockRestore();
    vi.clearAllMocks();
  });

  describe('loadWallet', () => {
    it('should successfully load a valid wallet', () => {
      // Create a valid keypair and get its secret key
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);

      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      const result = walletManager.loadWallet('/path/to/wallet.json');

      expect(result).toBeDefined();
      expect(result.publicKey).toBeDefined();
       
      expect(mockLoggerInfo).toHaveBeenCalledWith('Wallet loaded successfully', {
        publicKey: expect.any(String),
      });
    });

    it('should throw error for non-existent file', () => {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockReadFileSync.mockImplementation(() => {
        throw error;
      });

      expect(() => walletManager.loadWallet('/nonexistent/wallet.json')).toThrow(
        'Wallet file not found: /nonexistent/wallet.json'
      );

      expect(mockLoggerError).toHaveBeenCalledWith('Wallet file not found', {
        path: '/nonexistent/wallet.json',
      });
    });

    it('should throw error for invalid JSON', () => {
      mockReadFileSync.mockReturnValue('invalid json {]');

      expect(() => walletManager.loadWallet('/path/to/wallet.json')).toThrow('Invalid JSON in wallet file');

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to parse wallet file as JSON',
        expect.objectContaining({
          path: '/path/to/wallet.json',
        })
      );
    });

    it('should throw error for wrong array length', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify([1, 2, 3]));

      expect(() => walletManager.loadWallet('/path/to/wallet.json')).toThrow(
        'Invalid keypair format. Expected array of 64 numbers.'
      );
    });

    it('should throw error for non-numeric array elements', () => {
      const invalidArray = new Array(64).fill(0);
      invalidArray[0] = 'invalid';
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidArray));

      expect(() => walletManager.loadWallet('/path/to/wallet.json')).toThrow(
        'Invalid keypair format. All elements must be numbers.'
      );
    });

    it('should store keypair for later use', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);

      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      // Verify that keypair is stored by checking isLoaded
      expect(walletManager.isLoaded()).toBe(true);
    });
  });

  describe('getPublicKey', () => {
    it('should return public key after loading wallet', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);

      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');
      const publicKey = walletManager.getPublicKey();

      expect(publicKey).toBeInstanceOf(PublicKey);
      expect(typeof publicKey.toString()).toBe('string');
    });

    it('should throw error if no wallet is loaded', () => {
      expect(() => walletManager.getPublicKey()).toThrow(
        'No wallet loaded. Call loadWallet() first.'
      );
    });
  });

  describe('getBalance', () => {
    it('should return balance from connection', async () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      const mockConnection = {
        getBalance: vi.fn().mockResolvedValue(5000000000),
      } as unknown as Connection;

      const balance = await walletManager.getBalance(mockConnection);

      expect(balance).toBe(5000000000);
       
      expect(mockLoggerDebug).toHaveBeenCalledWith('Retrieved wallet balance', {
        publicKey: expect.any(String),
        balance: 5000000000,
      });
    });

    it('should throw error if no wallet is loaded', async () => {
      const mockConnection = {
        getBalance: vi.fn(),
      } as unknown as Connection;

      await expect(walletManager.getBalance(mockConnection)).rejects.toThrow(
        'No wallet loaded. Call loadWallet() first.'
      );
    });

    it('should handle connection errors', async () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      const connectionError = new Error('Connection failed');
      const mockConnection = {
        getBalance: vi.fn().mockRejectedValue(connectionError),
      } as unknown as Connection;

      await expect(walletManager.getBalance(mockConnection)).rejects.toThrow('Connection failed');

       
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to retrieve wallet balance',
        expect.objectContaining({
          publicKey: expect.any(String),
          errorMessage: 'Connection failed',
        })
      );
    });

    it('should return balance in lamports', async () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      const lamports = 1_000_000_000; // 1 SOL
      const mockConnection = {
        getBalance: vi.fn().mockResolvedValue(lamports),
      } as unknown as Connection;

      const balance = await walletManager.getBalance(mockConnection);

      expect(balance).toBe(lamports);
    });
  });

  describe('sign', () => {
    it('should sign a VersionedTransaction', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      const signFn = vi.fn();
      const mockTransaction = {
        sign: signFn,
      } as unknown as VersionedTransaction;

      const result = walletManager.sign(mockTransaction);

      expect(signFn).toHaveBeenCalledWith([expect.any(Keypair)]);
      expect(result).toBe(mockTransaction);
       
      expect(mockLoggerDebug).toHaveBeenCalledWith('Transaction signed successfully', {
        publicKey: expect.any(String),
      });
    });

    it('should sign a legacy Transaction', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      const signFn = vi.fn();
      const mockTransaction = {
        sign: signFn,
      } as unknown as Transaction;

      const result = walletManager.sign(mockTransaction);

      expect(signFn).toHaveBeenCalledWith([expect.any(Keypair)]);
      expect(result).toBe(mockTransaction);
    });

    it('should throw error if no wallet is loaded', () => {
      const signFn = vi.fn();
      const mockTransaction = {
        sign: signFn,
      } as unknown as VersionedTransaction;

      expect(() => walletManager.sign(mockTransaction)).toThrow(
        'No wallet loaded. Call loadWallet() first.'
      );

      expect(signFn).not.toHaveBeenCalled();
    });

    it('should handle signing errors', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      const signingError = new Error('Failed to sign');
      const signFn = vi.fn().mockImplementation(() => {
        throw signingError;
      });
      const mockTransaction = {
        sign: signFn,
      } as unknown as VersionedTransaction;

      expect(() => walletManager.sign(mockTransaction)).toThrow('Failed to sign');

       
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to sign transaction',
        expect.objectContaining({
          publicKey: expect.any(String),
          errorMessage: 'Failed to sign',
        })
      );
    });
  });

  describe('isLoaded', () => {
    it('should return false when no wallet is loaded', () => {
      expect(walletManager.isLoaded()).toBe(false);
    });

    it('should return true after loading a wallet', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      expect(walletManager.isLoaded()).toBe(true);
    });

    it('should return false after unloading wallet', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');
      expect(walletManager.isLoaded()).toBe(true);

      walletManager.unload();
      expect(walletManager.isLoaded()).toBe(false);
    });
  });

  describe('unload', () => {
    it('should clear the loaded wallet', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');
      expect(walletManager.isLoaded()).toBe(true);

      walletManager.unload();

      expect(walletManager.isLoaded()).toBe(false);
      expect(mockLoggerDebug).toHaveBeenCalledWith('Wallet unloaded from memory');
    });

    it('should allow reloading after unload', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');
      walletManager.unload();

      // Should be able to load again
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);
      walletManager.loadWallet('/path/to/wallet.json');

      expect(walletManager.isLoaded()).toBe(true);
    });
  });

  describe('security considerations', () => {
    it('should not log private keys or seed phrases', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      walletManager.loadWallet('/path/to/wallet.json');

      // Check that no log calls include sensitive data
      const allLogCalls = [
        ...mockLoggerInfo.mock.calls,
        ...mockLoggerError.mock.calls,
        ...mockLoggerDebug.mock.calls,
      ];

      allLogCalls.forEach((call) => {
        const logString = JSON.stringify(call);
        // Make sure we don't log the actual secret key bytes
        expect(logString).not.toMatch(new RegExp(secretKeyArray.slice(0, 5).join(',')));
      });
    });

    it('should only log public key, not private key', () => {
      const validKeypair = Keypair.generate();
      const secretKeyArray = Array.from(validKeypair.secretKey);
      mockReadFileSync.mockReturnValue(JSON.stringify(secretKeyArray) as ReturnType<typeof readFileSync>);

      const loadedKeypair = walletManager.loadWallet('/path/to/wallet.json');

      // Verify logger was called with public key
      expect(mockLoggerInfo).toHaveBeenCalledWith('Wallet loaded successfully', {
        publicKey: loadedKeypair.publicKey.toString(),
      });

      // Ensure no secret key information is in the logged data
       
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          secretKey: expect.anything(),
        })
      );
    });
  });

  describe('multiple wallet instances', () => {
    it('should allow multiple WalletManager instances independently', () => {
      const manager1 = new WalletManager();
      const manager2 = new WalletManager();

      const keypair1 = Keypair.generate();
      const secretKeyArray1 = Array.from(keypair1.secretKey);
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(secretKeyArray1));
      manager1.loadWallet('/path/to/wallet1.json');

      const keypair2 = Keypair.generate();
      const secretKeyArray2 = Array.from(keypair2.secretKey);
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(secretKeyArray2));
      manager2.loadWallet('/path/to/wallet2.json');

      expect(manager1.getPublicKey().toString()).not.toBe(manager2.getPublicKey().toString());
    });
  });
});
