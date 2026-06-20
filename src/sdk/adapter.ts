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
    let confirmation;
    try {
      confirmation = await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');
    } catch (error) {
      // The confirmation poll failed (RPC timeout, dropped socket, or the
      // blockhash expired before a confirmation was observed). The transaction
      // may nonetheless have landed on-chain; surfacing a clean failure here
      // would make the executor report `success: false` and leave the bought
      // tokens permanently untracked (a false negative). Re-check the on-chain
      // status before giving up so a landed buy is still reported as a success.
      if (await this.didTransactionLand(connection, signature)) {
        adapterLogger.warn('Confirmation poll failed but transaction landed on-chain', {
          signature,
          error: error instanceof Error ? error.message : String(error),
        });
        return signature;
      }
      throw error instanceof Error ? error : new Error(String(error));
    }

    // A transaction can be confirmed yet still have failed on-chain (e.g. a
    // slippage/balance revert sets `err`). Ignoring this would report a reverted
    // transaction as a successful buy (a false positive) and record a position
    // the wallet never received. Treat an execution error as a failed swap.
    if (confirmation.value.err !== null) {
      throw new Error(
        `Transaction ${signature} failed on-chain: ${JSON.stringify(confirmation.value.err)}`
      );
    }

    adapterLogger.debug('Transaction confirmed', { signature });

    return signature;
  }

  /**
   * Best-effort check of whether a transaction landed and succeeded on-chain.
   *
   * Used to disambiguate a failed confirmation *poll* from a genuinely failed
   * transaction: a transaction whose confirmation timed out may still have been
   * committed. Returns `true` only when the signature is committed
   * (`confirmed`/`finalized`) with no execution error. Any lookup failure is
   * treated as "did not land" so the caller falls back to the original error.
   */
  private async didTransactionLand(
    connection: Connection,
    signature: string
  ): Promise<boolean> {
    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      const value = status.value;
      if (value === null) {
        return false;
      }
      if (value.err !== null) {
        return false;
      }
      return value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized';
    } catch (error) {
      adapterLogger.warn('Failed to look up transaction status', {
        signature,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
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
