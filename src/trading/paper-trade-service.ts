/**
 * Paper-trading trade service for mainnet.
 *
 * Wraps a live {@link IBagsTradeService} so quotes (and therefore prices) come
 * from real mainnet liquidity, but fills are simulated against a paper ledger:
 * no transaction is signed, nothing is sent on-chain, and no SOL is spent.
 *
 * The {@link TradeExecutor} detects the optional `prepareSimulatedExecution`
 * method and short-circuits signing/sending, returning the synthetic fill
 * produced here.
 *
 * @module trading/paper-trade-service
 */

import type { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { randomUUID } from 'node:crypto';
import type { IBagsTradeService, IPaperTradeService } from './executor.js';
import type { SimulatedExecution, TradeQuote } from '../types/trading.js';
import { fetchJupiterQuote } from '../sdk/jupiter-price.js';
import { logger } from '../utils/logger.js';

const paperTradeLogger = logger.child({ module: 'paper-trade-service' });

/**
 * Maximum execution slippage applied to a simulated fill, as a fraction of
 * price. Mirrors the synthetic scenario trade service so paper fills behave
 * consistently across modes.
 */
const MAX_EXECUTION_SLIP = 0.02;

/**
 * Trade service that sources live quotes but simulates execution.
 */
export class PaperTradeService implements IPaperTradeService {
  private readonly delegate: IBagsTradeService;

  /**
   * @param delegate - A live trade service (e.g. the Bags SDK adapter) used for
   *   real quote/price lookups.
   */
  constructor(delegate: IBagsTradeService) {
    this.delegate = delegate;
  }

  /**
   * Fetch a real quote from the underlying live trade service, falling back to
   * the Jupiter data API when the Bags quote endpoint fails (it occasionally
   * returns 5xx). For paper trading only a price is needed, so a Jupiter-derived
   * quote keeps buys and position pricing working through Bags outages.
   */
  async getQuote(
    inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: number
  ): Promise<{
    inputAmount: number;
    expectedOutput: number;
    priceImpact: number;
    route: string;
  }> {
    try {
      return await this.delegate.getQuote(inputMint, outputMint, amount);
    } catch (error) {
      const mint = typeof outputMint === 'string' ? outputMint : outputMint.toBase58();
      paperTradeLogger.warn('Bags quote failed; falling back to Jupiter data API', {
        mint,
        error: error instanceof Error ? error.message : String(error),
      });
      return fetchJupiterQuote(mint, amount);
    }
  }

  /**
   * No transaction is built for paper trades. The executor ignores this result
   * once {@link prepareSimulatedExecution} returns a fill.
   */
  prepareSwap(): Promise<VersionedTransaction> {
    return Promise.resolve({} as VersionedTransaction);
  }

  /**
   * Compute a simulated fill from the live quote.
   *
   * The mid price is derived from the live quote (`amountSol / expectedOutput`,
   * matching how entry price is derived elsewhere), then a small execution slip
   * is applied so the fill is slightly worse than mid.
   */
  prepareSimulatedExecution(
    _inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: number,
    slippageBps: number,
    _priorityFeeLamports: number,
    quote: TradeQuote
  ): Promise<SimulatedExecution | null> {
    const mint = typeof outputMint === 'string' ? outputMint : outputMint.toBase58();
    const amountSol = amount / 1_000_000_000;

    if (quote.expectedOutput <= 0 || amountSol <= 0) {
      paperTradeLogger.warn('Cannot simulate execution: non-positive quote', {
        mint,
        amountSol,
        expectedOutput: quote.expectedOutput,
      });
      return Promise.resolve(null);
    }

    const midPrice = amountSol / quote.expectedOutput;
    const slippageFraction = slippageBps / 10_000;
    const executionSlip = Math.min(slippageFraction / 4, MAX_EXECUTION_SLIP);
    const executedPrice = midPrice * (1 + executionSlip);
    const tokensReceived = Math.min(amountSol / executedPrice, quote.expectedOutput);

    paperTradeLogger.info('Simulated paper fill (live quote)', {
      mint,
      amountSol,
      midPrice,
      executedPrice,
      tokensReceived,
    });

    return Promise.resolve({
      signature: `PAPER-${randomUUID()}`,
      executedPrice,
      tokensReceived,
    });
  }

  /**
   * Never reached for paper trades (the executor short-circuits on the
   * simulated execution), but implemented for interface completeness.
   */
  sendAndConfirmTransaction(
    _transaction: VersionedTransaction,
    _connection: Connection
  ): Promise<string> {
    return Promise.resolve(`PAPER-${randomUUID()}`);
  }
}

/**
 * Create a paper-trading trade service that sources live quotes from `delegate`.
 */
export function createPaperTradeService(delegate: IBagsTradeService): PaperTradeService {
  return new PaperTradeService(delegate);
}
