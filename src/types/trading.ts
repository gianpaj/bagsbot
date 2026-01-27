/**
 * Trading types for executing token swaps
 */

/**
 * Configuration for trade execution
 */
export interface TradeConfig {
  /** Slippage tolerance in basis points (default: 500 = 5%) */
  slippageBps: number;
  /** Priority fee in lamports (default: 100000) */
  priorityFeeLamports: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries: number;
}

/**
 * Quote information for a potential swap
 */
export interface TradeQuote {
  /** The mint address of the input token */
  inputMint: string;
  /** The mint address of the output token */
  outputMint: string;
  /** Amount of input tokens */
  inputAmount: number;
  /** Expected amount of output tokens */
  expectedOutput: number;
  /** Price impact as a decimal (e.g., 0.05 for 5%) */
  priceImpact: number;
  /** The route/path used for the swap */
  route: string;
}

/**
 * A prepared swap transaction ready for execution
 */
export interface PreparedSwap {
  /** The versioned transaction to be signed and sent */
  transaction: unknown; // VersionedTransaction from @solana/web3.js
  /** The quote this swap is based on */
  quote: TradeQuote;
  /** When this prepared swap expires */
  expiresAt: Date;
}

/**
 * Result of a trade execution attempt
 */
export interface TradeResult {
  /** Whether the trade was successful */
  success: boolean;
  /** Transaction signature if successful */
  signature?: string;
  /** Error message if failed */
  error?: string;
  /** Actual execution price if successful */
  executedPrice?: number;
  /** Number of tokens received if successful */
  tokensReceived?: number;
}
