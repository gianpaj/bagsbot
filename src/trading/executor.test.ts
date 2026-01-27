import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { PublicKey, Connection, VersionedTransaction } from '@solana/web3.js';
import { TradeExecutor, type IBagsTradeService } from './executor.js';
import { WalletManager } from './wallet.js';
import { logger } from '../utils/logger.js';
import { TradeError } from '../errors/index.js';

// Helper to create a no-op function for mock implementations
function noop(): void {
  // intentionally empty
}

describe('TradeExecutor', () => {
  let executor: TradeExecutor;
  let mockTradeService: Mock & IBagsTradeService;
  let mockWalletManager: Partial<WalletManager>;
  let mockConnection: Partial<Connection>;
  let mockLoggerDebug: Mock;
  let mockLoggerInfo: Mock;
  let mockLoggerWarn: Mock;
  let mockLoggerError: Mock;

  const testMint = new PublicKey('EPjFWaLb3odcccccccccccccccccccccccccccccccc');
  const testMintStr = testMint.toString();
  const testAmountSol = 0.5;

  beforeEach(() => {
    // Setup mocks
    mockTradeService = vi.fn() as unknown as Mock & IBagsTradeService;
    mockTradeService.getQuote = vi.fn();
    mockTradeService.prepareSwap = vi.fn();
    mockTradeService.sendAndConfirmTransaction = vi.fn();

    mockWalletManager = {
      sign: vi.fn().mockReturnValue({}),
      getPublicKey: vi.fn(),
      isLoaded: vi.fn().mockReturnValue(true),
    };

    mockConnection = {
      getBalance: vi.fn(),
    };

    // Setup logger mocks
    mockLoggerDebug = vi.spyOn(logger, 'debug').mockImplementation(noop);
    mockLoggerInfo = vi.spyOn(logger, 'info').mockImplementation(noop);
    mockLoggerWarn = vi.spyOn(logger, 'warn').mockImplementation(noop);
    mockLoggerError = vi.spyOn(logger, 'error').mockImplementation(noop);

    // Create executor with default config
    executor = new TradeExecutor(
      mockTradeService as IBagsTradeService,
      mockWalletManager as WalletManager,
      mockConnection as Connection
    );
  });

  afterEach(() => {
    mockLoggerDebug.mockRestore();
    mockLoggerInfo.mockRestore();
    mockLoggerWarn.mockRestore();
    mockLoggerError.mockRestore();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const executor2 = new TradeExecutor(
        mockTradeService as IBagsTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection
      );

      expect(executor2).toBeDefined();
      expect(mockLoggerDebug).toHaveBeenCalledWith('TradeExecutor initialized', {
        slippageBps: 500,
        priorityFeeLamports: 100000,
        maxRetries: 3,
      });
    });

    it('should initialize with custom config', () => {
      const executor2 = new TradeExecutor(
        mockTradeService as IBagsTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection,
        {
          slippageBps: 1000,
          priorityFeeLamports: 200000,
          maxRetries: 5,
        }
      );

      expect(executor2).toBeDefined();
      expect(mockLoggerDebug).toHaveBeenCalledWith('TradeExecutor initialized', {
        slippageBps: 1000,
        priorityFeeLamports: 200000,
        maxRetries: 5,
      });
    });

    it('should merge partial config with defaults', () => {
      const executor2 = new TradeExecutor(
        mockTradeService as IBagsTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection,
        {
          slippageBps: 750,
        }
      );

      expect(executor2).toBeDefined();
      expect(mockLoggerDebug).toHaveBeenCalledWith('TradeExecutor initialized', {
        slippageBps: 750,
        priorityFeeLamports: 100000,
        maxRetries: 3,
      });
    });
  });

  describe('getQuote', () => {
    it('should retrieve and return a quote', async () => {
      const mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      mockTradeService.getQuote.mockResolvedValue(mockQuoteData);

      const quote = await executor.getQuote(testMint, testAmountSol);

      expect(quote).toEqual({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: testMintStr,
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      });

      expect(mockTradeService.getQuote).toHaveBeenCalledWith(
        'So11111111111111111111111111111111111111112',
        testMintStr,
        testAmountSol * 1_000_000_000
      );
    });

    it('should accept mint as string', async () => {
      const mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      mockTradeService.getQuote.mockResolvedValue(mockQuoteData);

      const quote = await executor.getQuote(testMintStr, testAmountSol);

      expect(quote.outputMint).toBe(testMintStr);
    });

    it('should log quote request and response', async () => {
      const mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      mockTradeService.getQuote.mockResolvedValue(mockQuoteData);

      await executor.getQuote(testMint, testAmountSol);

      expect(mockLoggerDebug).toHaveBeenCalledWith('Requesting trade quote', {
        mint: testMintStr,
        amountSol: testAmountSol,
      });

      expect(mockLoggerDebug).toHaveBeenCalledWith('Quote received', {
        mint: testMintStr,
        expectedOutput: 1000,
        priceImpact: 0.02,
      });
    });

    it('should retry on transient errors', async () => {
      const mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      // Fail once, then succeed
      mockTradeService.getQuote
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockQuoteData);

      const quote = await executor.getQuote(testMint, testAmountSol);

      expect(quote.expectedOutput).toBe(1000);
      expect(mockTradeService.getQuote).toHaveBeenCalledTimes(2);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Retrying quote request',
        expect.objectContaining({
          attempt: 1,
          mint: testMintStr,
        })
      );
    });

    it('should not retry on invalid mint errors', async () => {
      mockTradeService.getQuote.mockRejectedValue(new Error('Invalid mint'));

      await expect(executor.getQuote(testMint, testAmountSol)).rejects.toThrow(TradeError);

      expect(mockTradeService.getQuote).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to get trade quote',
        expect.objectContaining({
          mint: testMintStr,
          error: 'Invalid mint',
        })
      );
    });

    it('should throw TradeError on failure after retries', async () => {
      mockTradeService.getQuote.mockRejectedValue(new Error('Network timeout'));

      await expect(executor.getQuote(testMint, testAmountSol)).rejects.toThrow(TradeError);

      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  describe('prepareSwap', () => {
    let mockQuoteData: any;
    let mockTransaction: VersionedTransaction;

    beforeEach(() => {
      mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      mockTransaction = {
        sign: vi.fn(),
      } as unknown as VersionedTransaction;

      mockTradeService.getQuote.mockResolvedValue(mockQuoteData);
      mockTradeService.prepareSwap.mockResolvedValue(mockTransaction);
    });

    it('should prepare a swap successfully', async () => {
      const prepared = await executor.prepareSwap(testMint, testAmountSol);

      expect(prepared).toBeDefined();
      expect(prepared.transaction).toBe(mockTransaction);
      expect(prepared.quote).toBeDefined();
      expect(prepared.quote.outputMint).toBe(testMintStr);
      expect(prepared.expiresAt).toBeInstanceOf(Date);

      // Check expiration is ~5 minutes in the future
      const now = new Date().getTime();
      const expiresAt = prepared.expiresAt.getTime();
      const diffMs = expiresAt - now;
      expect(diffMs).toBeGreaterThan(4 * 60 * 1000); // At least 4 minutes
      expect(diffMs).toBeLessThan(6 * 60 * 1000); // At most 6 minutes
    });

    it('should call prepareSwap with correct parameters including config', async () => {
      const executor2 = new TradeExecutor(
        mockTradeService as IBagsTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection,
        {
          slippageBps: 1000,
          priorityFeeLamports: 200000,
          maxRetries: 2,
        }
      );

      mockLoggerDebug.mockClear();

      await executor2.prepareSwap(testMint, testAmountSol);

      expect(mockTradeService.prepareSwap).toHaveBeenCalledWith(
        'So11111111111111111111111111111111111111112',
        testMintStr,
        testAmountSol * 1_000_000_000,
        1000,
        200000
      );
    });

    it('should log preparation steps', async () => {
      mockLoggerDebug.mockClear();

      await executor.prepareSwap(testMint, testAmountSol);

      expect(mockLoggerDebug).toHaveBeenCalledWith('Preparing swap', expect.any(Object));
      expect(mockLoggerDebug).toHaveBeenCalledWith('Swap prepared successfully', expect.any(Object));
    });

    it('should retry on transient errors during prepareSwap', async () => {
      mockTradeService.prepareSwap
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockTransaction);

      const prepared = await executor.prepareSwap(testMint, testAmountSol);

      expect(prepared.transaction).toBe(mockTransaction);
      expect(mockTradeService.prepareSwap).toHaveBeenCalledTimes(2);
    });

    it('should not retry on validation errors', async () => {
      mockTradeService.prepareSwap.mockRejectedValue(new Error('Invalid slippage'));

      await expect(executor.prepareSwap(testMint, testAmountSol)).rejects.toThrow(TradeError);

      expect(mockTradeService.prepareSwap).toHaveBeenCalledTimes(1);
    });

    it('should throw TradeError on failure', async () => {
      // Use a network error that will be retried multiple times
      mockTradeService.prepareSwap.mockRejectedValue(new Error('Network timeout'));
      mockLoggerError.mockClear();

      await expect(executor.prepareSwap(testMint, testAmountSol)).rejects.toThrow(TradeError);

      // When prepareSwap fails, the whole prepareSwap operation catches and retries
      // So we should see warnings for retries
      expect(mockLoggerWarn.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('executeSwap', () => {
    let mockQuoteData: any;
    let mockTransaction: VersionedTransaction;
    let prepared: any;

    beforeEach(async () => {
      mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      mockTransaction = {
        sign: vi.fn(),
      } as unknown as VersionedTransaction;

      mockTradeService.getQuote.mockResolvedValue(mockQuoteData);
      mockTradeService.prepareSwap.mockResolvedValue(mockTransaction);
      mockTradeService.sendAndConfirmTransaction.mockResolvedValue('abc123signature');

      // Create a prepared swap
      prepared = await executor.prepareSwap(testMint, testAmountSol);

      mockLoggerInfo.mockClear();
      mockLoggerDebug.mockClear();
    });

    it('should execute a swap successfully', async () => {
      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('abc123signature');
      expect(result.tokensReceived).toBe(1000);
      expect(result.executedPrice).toBeDefined();

      // Check that signing was attempted
      expect(mockWalletManager.sign).toHaveBeenCalledWith(mockTransaction);

      // Check that transaction was sent
      expect(mockTradeService.sendAndConfirmTransaction).toHaveBeenCalled();
    });

    it('should log swap execution', async () => {
      mockLoggerInfo.mockClear();

      await executor.executeSwap(prepared);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Executing swap', expect.any(Object));
      expect(mockLoggerInfo).toHaveBeenCalledWith('Swap executed successfully', {
        mint: testMintStr,
        signature: 'abc123signature',
      });
    });

    it('should calculate executed price correctly', async () => {
      const result = await executor.executeSwap(prepared);

      expect(result.executedPrice).toBe(
        (testAmountSol * 1_000_000_000) / mockQuoteData.expectedOutput
      );
    });

    it('should return failed result for expired swap', async () => {
      // Move expiration to the past
      prepared.expiresAt = new Date(Date.now() - 1000);

      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');

      // Should not attempt to sign or send
      expect(mockWalletManager.sign).not.toHaveBeenCalled();
      expect(mockTradeService.sendAndConfirmTransaction).not.toHaveBeenCalled();
    });

    it('should handle signing errors', async () => {
      mockWalletManager.sign = vi.fn().mockImplementation(() => {
        throw new Error('Failed to sign');
      });

      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sign');
    });

    it('should retry on transient submission errors', async () => {
      mockTradeService.sendAndConfirmTransaction
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('abc123signature');

      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('abc123signature');
      expect(mockTradeService.sendAndConfirmTransaction).toHaveBeenCalledTimes(2);
    });

    it('should not retry on signature verification errors', async () => {
      mockTradeService.sendAndConfirmTransaction.mockRejectedValue(
        new Error('Transaction signature verification failed')
      );

      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      expect(mockTradeService.sendAndConfirmTransaction).toHaveBeenCalledTimes(1);
    });

    it('should return error result on execution failure', async () => {
      mockTradeService.sendAndConfirmTransaction.mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.signature).toBeUndefined();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Swap execution failed',
        expect.objectContaining({
          mint: testMintStr,
        })
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle full workflow from quote to execution', async () => {
      const mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      const mockTransaction = {
        sign: vi.fn(),
      } as unknown as VersionedTransaction;

      mockTradeService.getQuote.mockResolvedValue(mockQuoteData);
      mockTradeService.prepareSwap.mockResolvedValue(mockTransaction);
      mockTradeService.sendAndConfirmTransaction.mockResolvedValue('abc123signature');

      // Step 1: Get quote
      const quote = await executor.getQuote(testMint, testAmountSol);
      expect(quote.expectedOutput).toBe(1000);

      // Step 2: Prepare swap
      const prepared = await executor.prepareSwap(testMint, testAmountSol);
      expect(prepared.quote).toEqual(quote);

      // Step 3: Execute swap
      const result = await executor.executeSwap(prepared);
      expect(result.success).toBe(true);
      expect(result.signature).toBe('abc123signature');
    });

    it('should handle multiple concurrent quote requests', async () => {
      const mockQuoteData = {
        inputAmount: testAmountSol * 1_000_000_000,
        expectedOutput: 1000,
        priceImpact: 0.02,
        route: 'Raydium',
      };

      mockTradeService.getQuote.mockResolvedValue(mockQuoteData);

      const mints = [
        'EPjFWaLb3odcccccccccccccccccccccccccccccccc',
        'So11111111111111111111111111111111111111112',
        '11111111111111111111111111111111',
      ];

      const quotes = await Promise.all(mints.map((mint) => executor.getQuote(mint, testAmountSol)));

      expect(quotes).toHaveLength(3);
      expect(mockTradeService.getQuote).toHaveBeenCalledTimes(3);
      quotes.forEach((quote) => {
        expect(quote.expectedOutput).toBe(1000);
      });
    });
  });

  describe('error scenarios', () => {
    it('should handle unknown error types gracefully', async () => {
      mockTradeService.getQuote.mockRejectedValue('Some random error');

      await expect(executor.getQuote(testMint, testAmountSol)).rejects.toThrow(TradeError);

      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should provide meaningful error messages', async () => {
      const errorMsg = 'Invalid mint';
      mockTradeService.getQuote.mockRejectedValue(new Error(errorMsg));

      try {
        await executor.getQuote(testMint, testAmountSol);
      } catch (error) {
        expect(error).toBeInstanceOf(TradeError);
        expect((error as TradeError).message).toContain(errorMsg);
      }
    });
  });
});
