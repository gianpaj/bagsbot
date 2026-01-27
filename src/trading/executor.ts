/**
 * Trade executor for preparing and executing token swaps via Bags SDK
 *
 * Handles quote retrieval, transaction preparation, signing, and execution
 * with retry logic, slippage management, and priority fee handling.
 *
 * @module trading/executor
 */

import { PublicKey, VersionedTransaction, Connection, Transaction } from '@solana/web3.js';
import { WalletManager } from './wallet.js';
import { TradeQuote, PreparedSwap, TradeResult, TradeConfig } from '../types/trading.js';
import { retry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';
import { TradeError } from '../errors/index.js';

/**
 * Interface for Bags SDK TradeService
 *
 * Defines the contract for the trade service from @bagsfm/bags-sdk.
 * Implemented as an interface for dependency injection and testability.
 */
export interface IBagsTradeService {
  /**
   * Get a quote for swapping SOL to a token
   *
   * @param inputMint - The input token mint (typically WSOL)
   * @param outputMint - The output token mint
   * @param amount - Amount to swap
   * @returns Trade quote with expected output
   */
  getQuote(
    inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: number
  ): Promise<{
    inputAmount: number;
    expectedOutput: number;
    priceImpact: number;
    route: string;
  }>;

  /**
   * Prepare a swap transaction
   *
   * @param inputMint - The input token mint
   * @param outputMint - The output token mint
   * @param amount - Amount to swap
   * @param slippageBps - Slippage tolerance in basis points
   * @param priorityFeeLamports - Priority fee in lamports
   * @returns Prepared transaction
   */
  prepareSwap(
    inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: number,
    slippageBps: number,
    priorityFeeLamports: number
  ): Promise<VersionedTransaction>;

  /**
   * Send and confirm a signed transaction
   *
   * @param transaction - Signed transaction to send
   * @param connection - Solana connection
   * @returns Transaction signature
   */
  sendAndConfirmTransaction(
    transaction: VersionedTransaction,
    connection: Connection
  ): Promise<string>;
}

/**
 * Default trade configuration values
 */
const DEFAULT_TRADE_CONFIG: TradeConfig = {
  slippageBps: 500, // 5%
  priorityFeeLamports: 100000,
  maxRetries: 3,
};

/**
 * TradeExecutor class for managing token swap execution
 *
 * Coordinates with Bags SDK to:
 * - Retrieve swap quotes
 * - Prepare swap transactions
 * - Sign and execute transactions with retry logic
 * - Handle slippage and priority fees
 *
 * @example
 * ```typescript
 * const executor = new TradeExecutor(tradeService, walletManager, connection, config);
 * const quote = await executor.getQuote(mintAddress, 0.5);
 * const prepared = await executor.prepareSwap(mintAddress, 0.5);
 * const result = await executor.executeSwap(prepared);
 * ```
 */
export class TradeExecutor {
  private tradeService: IBagsTradeService;
  private walletManager: WalletManager;
  private connection: Connection;
  private config: TradeConfig;

  /**
   * Creates a new TradeExecutor instance
   *
   * @param tradeService - Bags SDK TradeService instance
   * @param walletManager - WalletManager for transaction signing
   * @param connection - Solana Connection instance
   * @param config - Trade configuration (uses defaults if not provided)
   */
  constructor(
    tradeService: IBagsTradeService,
    walletManager: WalletManager,
    connection: Connection,
    config: Partial<TradeConfig> = {}
  ) {
    this.tradeService = tradeService;
    this.walletManager = walletManager;
    this.connection = connection;
    this.config = { ...DEFAULT_TRADE_CONFIG, ...config };

    logger.debug('TradeExecutor initialized', {
      slippageBps: this.config.slippageBps,
      priorityFeeLamports: this.config.priorityFeeLamports,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Get a swap quote for the specified mint and amount
   *
   * Retrieves expected output and pricing information from Bags SDK.
   * Uses retry logic to handle transient failures.
   *
   * @param mint - The token mint address to swap to
   * @param amountSol - Amount of SOL to swap (in whole SOL)
   * @returns Trade quote with pricing information
   * @throws TradeError if quote retrieval fails after retries
   *
   * @example
   * ```typescript
   * const quote = await executor.getQuote(mintAddress, 0.5);
   * console.log(`Expected output: ${quote.expectedOutput} tokens`);
   * ```
   */
  async getQuote(mint: PublicKey | string, amountSol: number): Promise<TradeQuote> {
    const mintStr = mint instanceof PublicKey ? mint.toString() : mint;
    const amountLamports = amountSol * 1_000_000_000;

    logger.debug('Requesting trade quote', {
      mint: mintStr,
      amountSol,
    });

    try {
      const quoteData = await retry(
        async () => {
          return await this.tradeService.getQuote(
            'So11111111111111111111111111111111111111112', // WSOL
            mintStr,
            amountLamports
          );
        },
        {
          maxRetries: this.config.maxRetries,
          baseDelayMs: 500,
          shouldRetry: (error) => {
            // Retry on network errors, but not on invalid mint errors
            const errorMsg = error instanceof Error ? error.message : '';
            return !errorMsg.includes('Invalid mint') && !errorMsg.includes('Token not found');
          },
          onRetry: (attempt, error, delayMs) => {
            logger.warn('Retrying quote request', {
              attempt,
              mint: mintStr,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        }
      );

      const quote: TradeQuote = {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: mintStr,
        inputAmount: amountLamports,
        expectedOutput: quoteData.expectedOutput,
        priceImpact: quoteData.priceImpact,
        route: quoteData.route,
      };

      logger.debug('Quote received', {
        mint: mintStr,
        expectedOutput: quoteData.expectedOutput,
        priceImpact: quoteData.priceImpact,
      });

      return quote;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get trade quote', {
        mint: mintStr,
        amountSol,
        error: errorMsg,
      });

      throw new TradeError(`Failed to get quote for ${mintStr}: ${errorMsg}`);
    }
  }

  /**
   * Prepare a swap transaction for the specified mint and amount
   *
   * Retrieves a quote and builds a transaction with configured slippage
   * and priority fees. Uses retry logic for robustness.
   *
   * @param mint - The token mint address to swap to
   * @param amountSol - Amount of SOL to swap (in whole SOL)
   * @returns Prepared swap with transaction and metadata
   * @throws TradeError if preparation fails after retries
   *
   * @example
   * ```typescript
   * const prepared = await executor.prepareSwap(mintAddress, 0.5);
   * console.log(`Transaction expires at: ${prepared.expiresAt}`);
   * ```
   */
  async prepareSwap(mint: PublicKey | string, amountSol: number): Promise<PreparedSwap> {
    const mintStr = mint instanceof PublicKey ? mint.toString() : mint;

    logger.debug('Preparing swap', {
      mint: mintStr,
      amountSol,
      slippageBps: this.config.slippageBps,
      priorityFeeLamports: this.config.priorityFeeLamports,
    });

    try {
      // First get the quote
      const quote = await this.getQuote(mintStr, amountSol);

      // Then prepare the transaction with retry logic
      const amountLamports = amountSol * 1_000_000_000;
      let transaction: VersionedTransaction;

      try {
        transaction = await retry(
          async () => {
            return await this.tradeService.prepareSwap(
              'So11111111111111111111111111111111111111112', // WSOL
              mintStr,
              amountLamports,
              this.config.slippageBps,
              this.config.priorityFeeLamports
            );
          },
          {
            maxRetries: this.config.maxRetries,
            baseDelayMs: 500,
            shouldRetry: (error) => {
              // Retry on network errors, but not on validation errors
              const errorMsg = error instanceof Error ? error.message : '';
              return (
                !errorMsg.includes('Invalid') &&
                !errorMsg.includes('Insufficient') &&
                !errorMsg.includes('Slippage')
              );
            },
            onRetry: (attempt, error, delayMs) => {
              logger.warn('Retrying swap preparation', {
                attempt,
                mint: mintStr,
                delayMs,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          }
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new TradeError(`Failed to prepare swap for ${mintStr}: ${errorMsg}`);
      }

      // Calculate expiration (5 minutes from now)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const prepared: PreparedSwap = {
        transaction,
        quote,
        expiresAt,
      };

      logger.debug('Swap prepared successfully', {
        mint: mintStr,
        expiresAt: expiresAt.toISOString(),
      });

      return prepared;
    } catch (error) {
      if (error instanceof TradeError) {
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to prepare swap', {
        mint: mintStr,
        amountSol,
        error: errorMsg,
      });
      throw new TradeError(`Failed to prepare swap for ${mintStr}: ${errorMsg}`);
    }
  }

  /**
   * Execute a prepared swap transaction
   *
   * Signs the transaction with the wallet and sends it to the Solana network.
   * Uses retry logic to handle transient failures during submission.
   * Confirms the transaction on-chain.
   *
   * @param prepared - The prepared swap from prepareSwap()
   * @returns Trade result with signature and execution details
   * @throws TradeError if execution fails after retries
   *
   * @example
   * ```typescript
   * const prepared = await executor.prepareSwap(mintAddress, 0.5);
   * const result = await executor.executeSwap(prepared);
   * if (result.success) {
   *   console.log(`Swap succeeded with signature: ${result.signature}`);
   * }
   * ```
   */
  async executeSwap(prepared: PreparedSwap): Promise<TradeResult> {
    const mintStr = prepared.quote.outputMint;

    // Check if prepared swap has expired
    if (new Date() > prepared.expiresAt) {
      const errorMsg = 'Prepared swap has expired';
      logger.warn(errorMsg, {
        mint: mintStr,
        expiresAt: prepared.expiresAt.toISOString(),
      });
      return {
        success: false,
        error: errorMsg,
      };
    }

    logger.info('Executing swap', {
      mint: mintStr,
      expectedOutput: prepared.quote.expectedOutput,
    });

    try {
      // Sign the transaction
      let signedTx: VersionedTransaction | Transaction;
      try {
        signedTx = this.walletManager.sign(prepared.transaction as VersionedTransaction | Transaction);
        logger.debug('Transaction signed successfully', { mint: mintStr });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new TradeError(`Failed to sign transaction: ${errorMsg}`);
      }

      // Send and confirm with retry logic
      let signature: string;
      try {
        signature = await retry(
          async () => {
            return await this.tradeService.sendAndConfirmTransaction(signedTx as VersionedTransaction, this.connection);
          },
          {
            maxRetries: this.config.maxRetries,
            baseDelayMs: 1000,
            shouldRetry: (error) => {
              // Retry on network errors, but not on signature validation errors
              const errorMsg = error instanceof Error ? error.message : '';
              return !errorMsg.includes('Transaction signature verification failed');
            },
            onRetry: (attempt, error, delayMs) => {
              logger.warn('Retrying transaction submission', {
                attempt,
                mint: mintStr,
                delayMs,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          }
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Failed to send or confirm transaction', {
          mint: mintStr,
          error: errorMsg,
        });
        throw new TradeError(`Failed to submit transaction: ${errorMsg}`, undefined);
      }

      logger.info('Swap executed successfully', {
        mint: mintStr,
        signature,
      });

      const result: TradeResult = {
        success: true,
        signature,
        tokensReceived: prepared.quote.expectedOutput,
        executedPrice: prepared.quote.inputAmount / prepared.quote.expectedOutput,
      };

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Swap execution failed', {
        mint: mintStr,
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
