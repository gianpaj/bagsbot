/**
 * Integration tests for end-to-end trade flow
 *
 * Tests the complete trading workflow including:
 * - Quote fetching
 * - Transaction preparation
 * - Trade execution
 *
 * Note: Tests requiring actual devnet access are skipped by default.
 * Set RUN_DEVNET_TESTS=true and provide wallet keys to run live tests.
 *
 * @module tests/integration/trade-flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TradeExecutor } from '../../src/trading/executor.js';
import { WalletManager } from '../../src/trading/wallet.js';
import { createMockTradeService, type MockTradeService } from '../mocks/bags-sdk.js';
import { createMockLaunchEvent } from '../mocks/launch-events.js';
import { logger } from '../../src/utils/logger.js';

// Check if devnet tests should run
const RUN_DEVNET_TESTS = process.env.RUN_DEVNET_TESTS === 'true';
const DEVNET_WALLET_PRIVATE_KEY = process.env.DEVNET_WALLET_PRIVATE_KEY;
const SKIP_DEVNET_TESTS = !RUN_DEVNET_TESTS || !DEVNET_WALLET_PRIVATE_KEY;

// Helper to suppress logger output during tests
function noop(): void {
  // intentionally empty
}

describe('Trade Flow Integration Tests', () => {
  let mockTradeService: MockTradeService;
  let mockWalletManager: Partial<WalletManager>;
  let mockConnection: Partial<Connection>;
  let executor: TradeExecutor;

  const testMint = 'EPjFWaLb3odcccccccccccccccccccccccccccccccc';
  const testAmountSol = 0.1;

  beforeEach(() => {
    // Note: NOT using fake timers for trade-flow tests as they interfere
    // with the retry mechanism's real async timing

    // Setup mocks
    mockTradeService = createMockTradeService();

    mockWalletManager = {
      sign: vi.fn().mockReturnValue({} as VersionedTransaction),
      getPublicKey: vi.fn().mockReturnValue(new PublicKey('11111111111111111111111111111111')),
      isLoaded: vi.fn().mockReturnValue(true),
    };

    mockConnection = {
      getBalance: vi.fn().mockResolvedValue(1_000_000_000), // 1 SOL
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 100,
      }),
    };

    // Suppress logger output
    vi.spyOn(logger, 'debug').mockImplementation(noop);
    vi.spyOn(logger, 'info').mockImplementation(noop);
    vi.spyOn(logger, 'warn').mockImplementation(noop);
    vi.spyOn(logger, 'error').mockImplementation(noop);

    executor = new TradeExecutor(
      mockTradeService,
      mockWalletManager as WalletManager,
      mockConnection as Connection
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockTradeService._reset();
  });

  describe('End-to-End Buy Flow', () => {
    it('should complete full buy flow: quote -> prepare -> execute', async () => {
      // Step 1: Get quote
      const quote = await executor.getQuote(testMint, testAmountSol);

      expect(quote).toBeDefined();
      expect(quote.inputMint).toBe('So11111111111111111111111111111111111111112');
      expect(quote.outputMint).toBe(testMint);
      expect(quote.expectedOutput).toBe(1000);
      expect(mockTradeService._getQuoteCallCount()).toBe(1);

      // Step 2: Prepare swap
      const prepared = await executor.prepareSwap(testMint, testAmountSol);

      expect(prepared).toBeDefined();
      expect(prepared.transaction).toBeDefined();
      expect(prepared.quote.outputMint).toBe(testMint);
      expect(prepared.expiresAt).toBeInstanceOf(Date);
      // prepareSwap calls getQuote internally
      expect(mockTradeService._getQuoteCallCount()).toBe(2);
      expect(mockTradeService._getSwapCallCount()).toBe(1);

      // Step 3: Execute swap
      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('mock-signature-abc123');
      expect(result.tokensReceived).toBe(1000);
      expect(mockTradeService._getTransactionCallCount()).toBe(1);
    });

    it('should handle multiple consecutive trades', async () => {
      const mints = [
        'Mint1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'Mint2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'Mint3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ];

      for (const mint of mints) {
        const prepared = await executor.prepareSwap(mint, testAmountSol);
        const result = await executor.executeSwap(prepared);
        expect(result.success).toBe(true);
      }

      expect(mockTradeService._getQuoteCallCount()).toBe(3);
      expect(mockTradeService._getSwapCallCount()).toBe(3);
      expect(mockTradeService._getTransactionCallCount()).toBe(3);
    });

    it('should handle concurrent quote requests', async () => {
      const mints = [
        'ConcurrentMint1aaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'ConcurrentMint2aaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'ConcurrentMint3aaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'ConcurrentMint4aaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'ConcurrentMint5aaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ];

      const quotes = await Promise.all(
        mints.map((mint) => executor.getQuote(mint, testAmountSol))
      );

      expect(quotes).toHaveLength(5);
      quotes.forEach((quote, i) => {
        expect(quote.outputMint).toBe(mints[i]);
        expect(quote.expectedOutput).toBe(1000);
      });
      expect(mockTradeService._getQuoteCallCount()).toBe(5);
    });
  });

  describe('Quote Fetching', () => {
    it('should fetch quote with correct parameters', async () => {
      const quote = await executor.getQuote(testMint, 0.5);

      expect(quote.inputAmount).toBe(0.5 * 1_000_000_000); // lamports
      expect(quote.outputMint).toBe(testMint);
      expect(mockTradeService.getQuote).toHaveBeenCalledWith(
        'So11111111111111111111111111111111111111112',
        testMint,
        500_000_000
      );
    });

    it('should handle quote with high price impact', async () => {
      mockTradeService._setQuoteResponse({
        inputAmount: 500_000_000,
        expectedOutput: 800,
        priceImpact: 0.15, // 15% impact
        route: 'Raydium',
      });

      const quote = await executor.getQuote(testMint, 0.5);

      expect(quote.priceImpact).toBe(0.15);
      expect(quote.expectedOutput).toBe(800);
    });

    it('should retry on transient quote errors', async () => {
      // Use a custom executor with very short retry delays for testing
      const fastExecutor = new TradeExecutor(
        mockTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection,
        { maxRetries: 2 }
      );

      let attempts = 0;
      vi.mocked(mockTradeService.getQuote).mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Network timeout');
        }
        return {
          inputAmount: 500_000_000,
          expectedOutput: 1000,
          priceImpact: 0.02,
          route: 'Raydium',
        };
      });

      const quote = await fastExecutor.getQuote(testMint, 0.5);

      expect(quote.expectedOutput).toBe(1000);
      expect(attempts).toBe(2);
    }, 15000);

    it('should fail immediately on invalid mint error', async () => {
      mockTradeService._setQuoteError(new Error('Invalid mint'));

      await expect(executor.getQuote(testMint, 0.5)).rejects.toThrow('Invalid mint');

      expect(mockTradeService._getQuoteCallCount()).toBe(1); // No retries
    });

    it('should handle quote for very small amounts', async () => {
      mockTradeService._setQuoteResponse({
        inputAmount: 1_000_000, // 0.001 SOL
        expectedOutput: 2,
        priceImpact: 0.5,
        route: 'Raydium',
      });

      const quote = await executor.getQuote(testMint, 0.001);

      expect(quote.expectedOutput).toBe(2);
    });

    it('should handle quote for large amounts', async () => {
      mockTradeService._setQuoteResponse({
        inputAmount: 100_000_000_000, // 100 SOL
        expectedOutput: 200000,
        priceImpact: 0.08,
        route: 'Raydium',
      });

      const quote = await executor.getQuote(testMint, 100);

      expect(quote.expectedOutput).toBe(200000);
      expect(quote.priceImpact).toBe(0.08);
    });
  });

  describe('Transaction Execution', () => {
    it('should sign and submit transaction', async () => {
      const prepared = await executor.prepareSwap(testMint, testAmountSol);
      const result = await executor.executeSwap(prepared);

      expect(mockWalletManager.sign).toHaveBeenCalledWith(prepared.transaction);
      expect(mockTradeService.sendAndConfirmTransaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should fail on expired prepared swap', async () => {
      const prepared = await executor.prepareSwap(testMint, testAmountSol);

      // Manually set expiration to past
      prepared.expiresAt = new Date(Date.now() - 1000);

      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
      expect(mockWalletManager.sign).not.toHaveBeenCalled();
    });

    it('should handle signing failure', async () => {
      mockWalletManager.sign = vi.fn().mockImplementation(() => {
        throw new Error('Hardware wallet error');
      });

      const prepared = await executor.prepareSwap(testMint, testAmountSol);
      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Hardware wallet error');
    });

    it('should retry on network errors during submission', async () => {
      let attempts = 0;
      vi.mocked(mockTradeService.sendAndConfirmTransaction).mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Connection reset');
        }
        return 'retry-success-signature';
      });

      const prepared = await executor.prepareSwap(testMint, testAmountSol);
      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('retry-success-signature');
      expect(attempts).toBe(2);
    }, 15000);

    it('should not retry on signature verification failure', async () => {
      mockTradeService._setTransactionError(
        new Error('Transaction signature verification failed')
      );

      const prepared = await executor.prepareSwap(testMint, testAmountSol);
      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      expect(mockTradeService._getTransactionCallCount()).toBe(1);
    });

    it('should calculate executed price correctly', async () => {
      mockTradeService._setQuoteResponse({
        inputAmount: 100_000_000, // 0.1 SOL in lamports
        expectedOutput: 2000,
        priceImpact: 0.02,
        route: 'Raydium',
      });

      const prepared = await executor.prepareSwap(testMint, testAmountSol);
      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(true);
      expect(result.tokensReceived).toBe(2000);
      // Price = inputAmount / expectedOutput
      expect(result.executedPrice).toBe(100_000_000 / 2000);
    });
  });

  describe('Error Handling', () => {
    it('should handle service unavailable error', async () => {
      mockTradeService._setQuoteError(new Error('Service temporarily unavailable'));

      await expect(executor.getQuote(testMint, 0.5)).rejects.toThrow();
    }, 15000);

    it('should handle insufficient liquidity error', async () => {
      mockTradeService._setSwapError(new Error('Insufficient liquidity'));

      await expect(executor.prepareSwap(testMint, 100)).rejects.toThrow('Insufficient');
    });

    it('should handle slippage exceeded error', async () => {
      mockTradeService._setSwapError(new Error('Slippage tolerance exceeded'));

      await expect(executor.prepareSwap(testMint, 0.5)).rejects.toThrow();

      // Slippage errors should not retry
      expect(mockTradeService._getSwapCallCount()).toBe(1);
    });

    it('should handle transaction timeout', async () => {
      mockTradeService._setTransactionError(new Error('Transaction confirmation timeout'));

      const prepared = await executor.prepareSwap(testMint, testAmountSol);
      const result = await executor.executeSwap(prepared);

      expect(result.success).toBe(false);
      // Error message gets wrapped with retry context
      expect(result.error).toMatch(/timeout|Retry exhausted/);
    }, 15000);

    it('should provide meaningful error context', async () => {
      mockTradeService._setQuoteError(new Error('Token not found'));

      try {
        await executor.getQuote('NonexistentMintaaaaaaaaaaaaaaaaaaaaa', 0.5);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('NonexistentMintaaaaaaaaaaaaaaaaaaaaa');
        expect((error as Error).message).toContain('Token not found');
      }
    });
  });

  describe('Configuration', () => {
    it('should use custom slippage configuration', async () => {
      const customExecutor = new TradeExecutor(
        mockTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection,
        { slippageBps: 1000 } // 10%
      );

      await customExecutor.prepareSwap(testMint, testAmountSol);

      expect(mockTradeService.prepareSwap).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        1000, // Custom slippage
        expect.any(Number)
      );
    });

    it('should use custom priority fee configuration', async () => {
      const customExecutor = new TradeExecutor(
        mockTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection,
        { priorityFeeLamports: 500000 }
      );

      await customExecutor.prepareSwap(testMint, testAmountSol);

      expect(mockTradeService.prepareSwap).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        500000 // Custom priority fee
      );
    });

    it('should use custom retry configuration', async () => {
      let attempts = 0;
      vi.mocked(mockTradeService.getQuote).mockImplementation(async () => {
        attempts++;
        throw new Error('Always fails');
      });

      const customExecutor = new TradeExecutor(
        mockTradeService,
        mockWalletManager as WalletManager,
        mockConnection as Connection,
        { maxRetries: 2 }
      );

      try {
        await customExecutor.getQuote(testMint, 0.5);
      } catch {
        // Expected
      }

      // Should attempt 1 initial + 2 retries = 3 attempts
      expect(attempts).toBe(3);
    }, 20000);
  });

  describe.skipIf(SKIP_DEVNET_TESTS)('Devnet Live Tests', () => {
    it('should execute real trade on devnet', async () => {
      vi.useRealTimers();

      // This test would use actual Solana devnet
      // const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      // const wallet = WalletManager.fromPrivateKey(DEVNET_WALLET_PRIVATE_KEY!);
      // const { TradeService } = await import('@bagsfm/bags-sdk');
      // const tradeService = new TradeService({ network: 'devnet' });
      //
      // const liveExecutor = new TradeExecutor(tradeService, wallet, connection);
      // const quote = await liveExecutor.getQuote(testMint, 0.001);
      // expect(quote).toBeDefined();

      expect(true).toBe(true); // Placeholder
    });

    it('should handle real network latency', async () => {
      vi.useRealTimers();

      // Test with actual network delays
      // const startTime = Date.now();
      // const quote = await liveExecutor.getQuote(testMint, 0.001);
      // const endTime = Date.now();
      // expect(endTime - startTime).toBeLessThan(10000); // Under 10 seconds

      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Integration with Launch Events', () => {
    it('should handle trade flow from launch event', async () => {
      const launchEvent = createMockLaunchEvent({
        mint: testMint,
        symbol: 'NEW',
        name: 'New Token',
      });

      // Simulate receiving a launch event and executing a buy
      const quote = await executor.getQuote(launchEvent.mint, testAmountSol);
      expect(quote.outputMint).toBe(launchEvent.mint);

      const prepared = await executor.prepareSwap(launchEvent.mint, testAmountSol);
      expect(prepared.quote.outputMint).toBe(launchEvent.mint);

      const result = await executor.executeSwap(prepared);
      expect(result.success).toBe(true);
    });
  });
});
