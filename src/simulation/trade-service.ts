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

  async getQuote(
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
    const currentPrice = this.requireCurrentPrice(mint);
    const amountSol = amount / 1_000_000_000;
    const priceImpact = 0.01;
    const expectedOutput = amountSol / currentPrice;

    simulationTradeLogger.info('Generated simulated quote', {
      mint,
      currentPrice,
      amountSol,
      expectedOutput,
    });

    return {
      inputAmount: amount,
      expectedOutput,
      priceImpact,
      route: `SIMULATED/${this.engine.getLaunch(mint)?.kind ?? 'generated'}`,
    };
  }

  async prepareSwap(): Promise<VersionedTransaction> {
    return {} as VersionedTransaction;
  }

  async prepareSimulatedExecution(
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
    const currentPrice = this.requireCurrentPrice(mint);
    const slippageFraction = slippageBps / 10_000;
    const executionSlip = Math.min(slippageFraction / 4, 0.02);
    const executedPrice = currentPrice * (1 + executionSlip);
    const amountSol = amount / 1_000_000_000;
    const tokensReceived = amountSol / executedPrice;

    return {
      signature: `SIM-${randomUUID()}`,
      executedPrice,
      tokensReceived: Math.min(tokensReceived, quote.expectedOutput),
    };
  }

  async sendAndConfirmTransaction(
    _transaction: VersionedTransaction,
    _connection: Connection
  ): Promise<string> {
    return `SIM-${randomUUID()}`;
  }

  private requireCurrentPrice(mint: string): number {
    const currentPrice = this.engine.getCurrentPrice(mint);
    if (currentPrice === null || currentPrice <= 0) {
      throw new Error(`No simulated market price available for ${mint}`);
    }

    return currentPrice;
  }
}
