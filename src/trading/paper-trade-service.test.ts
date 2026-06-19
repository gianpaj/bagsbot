import { describe, expect, it, vi } from 'vitest';
import { Connection } from '@solana/web3.js';
import { PaperTradeService } from './paper-trade-service.js';
import { TradeExecutor, type IBagsTradeService } from './executor.js';
import type { WalletManager } from './wallet.js';
import type { TradeQuote } from '../types/trading.js';

const TEST_MINT = 'EPjFWaLb3odcccccccccccccccccccccccccccccccc';

function createDelegate(expectedOutput: number): IBagsTradeService {
  return {
    getQuote: vi.fn(async () => ({
      inputAmount: 100_000_000,
      expectedOutput,
      priceImpact: 0.01,
      route: 'LIVE/jup',
    })),
    prepareSwap: vi.fn(),
    sendAndConfirmTransaction: vi.fn(),
  } as unknown as IBagsTradeService;
}

describe('PaperTradeService', () => {
  it('executes a paper trade from a live quote without signing or sending', async () => {
    const delegate = createDelegate(1_000); // 0.1 SOL -> 1000 tokens
    const walletManager = {
      sign: vi.fn(() => {
        throw new Error('sign should not be called for paper trades');
      }),
    } as unknown as WalletManager;

    const tradeService = new PaperTradeService(delegate);
    const executor = new TradeExecutor(tradeService, walletManager, {} as Connection, {
      maxRetries: 0,
    });

    const prepared = await executor.prepareSwap(TEST_MINT, 0.1);
    const result = await executor.executeSwap(prepared);

    expect(result.success).toBe(true);
    expect(result.signature).toMatch(/^PAPER-/);
    expect(result.tokensReceived).toBeGreaterThan(0);
    expect(result.executedPrice).toBeGreaterThan(0);
    // Fill is slightly worse than the mid price (0.1 / 1000 = 0.0001).
    expect(result.executedPrice).toBeGreaterThanOrEqual(0.0001);
    expect(walletManager.sign as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(delegate.sendAndConfirmTransaction as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('returns null simulated execution when the quote has no output', async () => {
    const service = new PaperTradeService(createDelegate(0));
    const quote: TradeQuote = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: TEST_MINT,
      inputAmount: 100_000_000,
      expectedOutput: 0,
      priceImpact: 0,
      route: 'LIVE/jup',
    };

    const result = await service.prepareSimulatedExecution(
      'So11111111111111111111111111111111111111112',
      TEST_MINT,
      100_000_000,
      500,
      0,
      quote
    );

    expect(result).toBeNull();
  });

  it('falls back to the Jupiter data API when the Bags quote fails', async () => {
    const delegate = {
      getQuote: vi.fn(async () => {
        throw new Error('Request failed with status 500');
      }),
      prepareSwap: vi.fn(),
      sendAndConfirmTransaction: vi.fn(),
    } as unknown as IBagsTradeService;

    const WSOL = 'So11111111111111111111111111111111111111112';
    const fetchMock = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get('query') ?? '';
      const usdPrice = query === WSOL ? 70 : 0.00005;
      return { ok: true, status: 200, json: async () => [{ id: query, usdPrice, decimals: 9 }] };
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const service = new PaperTradeService(delegate);
      const quote = await service.getQuote(WSOL, TEST_MINT, 0.01 * 1_000_000_000);

      expect(delegate.getQuote as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      expect(quote.route).toBe('JUPITER/datapi');
      // 0.01 SOL * $70 / $0.00005 = 14000 whole tokens (base units at 9 decimals).
      expect(quote.expectedOutput).toBeCloseTo(14000 * 1e9, 0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
