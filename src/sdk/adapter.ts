/**
 * Adapters for the Bags SDK to match our internal interfaces
 *
 * These adapters wrap the actual @bagsfm/bags-sdk services to conform to
 * the interfaces expected by our bot components.
 *
 * @module sdk/adapter
 */

import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { BagsSDK } from '@bagsfm/bags-sdk';
import type { IBagsTradeService } from '../trading/executor.js';
import { logger } from '../utils/logger.js';

const adapterLogger = logger.child({ module: 'sdk-adapter' });

/**
 * Adapter that wraps the Bags SDK TradeService to match our IBagsTradeService interface
 */
export class BagsTradeServiceAdapter implements IBagsTradeService {
  private sdk: BagsSDK;
  private userPublicKey: PublicKey;

  constructor(sdk: BagsSDK, userPublicKey: PublicKey, _connection: Connection) {
    this.sdk = sdk;
    this.userPublicKey = userPublicKey;
    // Connection is passed for consistency but transactions are sent via the provided connection param
  }

  /**
   * Get a quote for swapping SOL to a token
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
    const inputMintPubkey = typeof inputMint === 'string' ? new PublicKey(inputMint) : inputMint;
    const outputMintPubkey = typeof outputMint === 'string' ? new PublicKey(outputMint) : outputMint;

    adapterLogger.debug('Getting quote', {
      inputMint: inputMintPubkey.toBase58(),
      outputMint: outputMintPubkey.toBase58(),
      amount,
    });

    const quoteResponse = await this.sdk.trade.getQuote({
      inputMint: inputMintPubkey,
      outputMint: outputMintPubkey,
      amount,
      slippageMode: 'auto',
    });

    return {
      inputAmount: Number(quoteResponse.inAmount),
      expectedOutput: Number(quoteResponse.outAmount),
      priceImpact: Number(quoteResponse.priceImpactPct),
      route: quoteResponse.routePlan.map(leg => leg.venue).join(' -> '),
    };
  }

  /**
   * Prepare a swap transaction
   */
  async prepareSwap(
    inputMint: PublicKey | string,
    outputMint: PublicKey | string,
    amount: number,
    slippageBps: number,
    _priorityFeeLamports: number
  ): Promise<VersionedTransaction> {
    const inputMintPubkey = typeof inputMint === 'string' ? new PublicKey(inputMint) : inputMint;
    const outputMintPubkey = typeof outputMint === 'string' ? new PublicKey(outputMint) : outputMint;

    adapterLogger.debug('Preparing swap', {
      inputMint: inputMintPubkey.toBase58(),
      outputMint: outputMintPubkey.toBase58(),
      amount,
      slippageBps,
    });

    // First get a quote
    const quoteResponse = await this.sdk.trade.getQuote({
      inputMint: inputMintPubkey,
      outputMint: outputMintPubkey,
      amount,
      slippageMode: 'manual',
      slippageBps,
    });

    // Then create the swap transaction
    const result = await this.sdk.trade.createSwapTransaction({
      quoteResponse,
      userPublicKey: this.userPublicKey,
    });

    return result.transaction;
  }

  /**
   * Send and confirm a signed transaction
   */
  async sendAndConfirmTransaction(
    transaction: VersionedTransaction,
    connection: Connection
  ): Promise<string> {
    adapterLogger.debug('Sending and confirming transaction');

    // Serialize and send the transaction
    const rawTransaction = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    adapterLogger.debug('Transaction sent', { signature });

    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, 'confirmed');

    adapterLogger.debug('Transaction confirmed', { signature });

    return signature;
  }
}

/**
 * Initialize the Bags SDK with connection and API key
 */
export function createBagsSDK(
  apiKey: string,
  connection: Connection
): BagsSDK {
  adapterLogger.info('Initializing Bags SDK');
  return new BagsSDK(apiKey, connection, 'confirmed');
}

/**
 * Create a trade service adapter from the SDK
 */
export function createTradeServiceAdapter(
  sdk: BagsSDK,
  userPublicKey: PublicKey,
  connection: Connection
): IBagsTradeService {
  return new BagsTradeServiceAdapter(sdk, userPublicKey, connection);
}
