import type { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { randomUUID } from 'node:crypto';
import type { IPaperTradeService } from '../trading/executor.js';
import type { TradeQuote } from '../types/trading.js';
import type { SimulationEngine } from './engine.js';
import { logger } from '../utils/logger.js';

const simulationTradeLogger = logger.child({ module: 'simulation-trade-service' });

export class SimulationTradeService implements IPaperTradeService {
  private readonly engine: SimulationEngine;

  constructor(engine: SimulationEngine) {
    this.engine = engine;
  }

  getQuote(
    _inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: number
  ): Promise<{
    inputAmount: number;
    expectedOutput: number;
    priceImpact: number;
    route: string;
  }> {
    const mint = typeof outputMint === 'string' ? outputMint : outputMint.toBase58();
    let currentPrice: number;
    try {
      currentPrice = this.requireCurrentPrice(mint);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const amountSol = amount / 1_000_000_000;
    const priceImpact = 0.01;
    const expectedOutput = amountSol / currentPrice;

    simulationTradeLogger.info('Generated simulated quote', {
      mint,
      currentPrice,
      amountSol,
      expectedOutput,
    });

    return Promise.resolve({
      inputAmount: amount,
      expectedOutput,
      priceImpact,
      route: `SIMULATED/${this.engine.getLaunch(mint)?.kind ?? 'generated'}`,
    });
  }

  prepareSwap(): Promise<VersionedTransaction> {
    return Promise.resolve({} as VersionedTransaction);
  }

  prepareSimulatedExecution(
    _inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: number,
    slippageBps: number,
    _priorityFeeLamports: number,
    quote: TradeQuote
  ): Promise<{
    signature: string;
    executedPrice: number;
    tokensReceived: number;
  }> {
    const mint = typeof outputMint === 'string' ? outputMint : outputMint.toBase58();
    let currentPrice: number;
    try {
      currentPrice = this.requireCurrentPrice(mint);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const slippageFraction = slippageBps / 10_000;
    const executionSlip = Math.min(slippageFraction / 4, 0.02);
    const executedPrice = currentPrice * (1 + executionSlip);
    const amountSol = amount / 1_000_000_000;
    const tokensReceived = amountSol / executedPrice;

    return Promise.resolve({
      signature: `SIM-${randomUUID()}`,
      executedPrice,
      tokensReceived: Math.min(tokensReceived, quote.expectedOutput),
    });
  }

  sendAndConfirmTransaction(
    _transaction: VersionedTransaction,
    _connection: Connection
  ): Promise<string> {
    return Promise.resolve(`SIM-${randomUUID()}`);
  }

  private requireCurrentPrice(mint: string): number {
    const currentPrice = this.engine.getCurrentPrice(mint);
    if (currentPrice === null || currentPrice <= 0) {
      throw new Error(`No simulated market price available for ${mint}`);
    }

    return currentPrice;
  }
}
