/**
 * Zod validation schemas for bot configuration
 *
 * These schemas define the structure and validation rules for all
 * configuration values, providing helpful error messages for invalid configs.
 */

import { z } from 'zod';

/**
 * Schema for creator filter configuration
 */
export const creatorFilterSchema = z.object({
  requireVerifiedSocial: z
    .boolean()
    .describe('Whether to require verified social accounts'),
  minFollowerCount: z
    .number()
    .int()
    .min(0, 'Minimum follower count must be non-negative')
    .describe('Minimum follower count for creator social accounts'),
  minAccountAgeDays: z
    .number()
    .int()
    .min(0, 'Minimum account age must be non-negative')
    .describe('Minimum age of creator account in days'),
  checkPreviousLaunches: z
    .boolean()
    .describe('Whether to check creator previous token launches'),
});

/**
 * Schema for technical filter configuration
 */
export const technicalFilterSchema = z.object({
  requireCompleteMetadata: z
    .boolean()
    .describe('Whether to require complete metadata'),
  requireDescription: z
    .boolean()
    .describe('Whether to require a description'),
  requireSocialLinks: z
    .boolean()
    .describe('Whether to require at least one social link'),
  validateImageUrl: z
    .boolean()
    .describe('Whether to validate image URL accessibility'),
});

/**
 * Schema for social filter configuration
 */
export const socialFilterSchema = z.object({
  checkTwitterMentions: z
    .boolean()
    .describe('Whether to check for Twitter/X mentions'),
  checkTelegramGroup: z
    .boolean()
    .describe('Whether to check for Telegram group presence'),
  minCommunitySize: z
    .number()
    .int()
    .min(0, 'Minimum community size must be non-negative')
    .describe('Minimum community size (followers/members)'),
});

/**
 * Schema for liquidity filter configuration
 */
export const liquidityFilterSchema = z.object({
  minInitialLiquiditySol: z
    .number()
    .min(0, 'Minimum initial liquidity must be non-negative')
    .describe('Minimum initial liquidity in SOL'),
  maxBondingCurvePercent: z
    .number()
    .min(0, 'Max bonding curve percent must be non-negative')
    .max(100, 'Max bonding curve percent cannot exceed 100')
    .describe('Maximum percentage on bonding curve'),
  maxTopHolderPercent: z
    .number()
    .min(0, 'Max top holder percent must be non-negative')
    .max(100, 'Max top holder percent cannot exceed 100')
    .describe('Maximum percentage held by top holder'),
});

/**
 * Schema for all filters combined
 */
export const filtersSchema = z.object({
  creator: creatorFilterSchema,
  technical: technicalFilterSchema,
  social: socialFilterSchema,
  liquidity: liquidityFilterSchema,
});

/**
 * Schema for scoring weights
 */
export const scoringWeightsSchema = z.object({
  creator: z
    .number()
    .min(0, 'Creator weight must be non-negative')
    .max(1, 'Creator weight cannot exceed 1')
    .describe('Weight for creator filter score'),
  technical: z
    .number()
    .min(0, 'Technical weight must be non-negative')
    .max(1, 'Technical weight cannot exceed 1')
    .describe('Weight for technical filter score'),
  social: z
    .number()
    .min(0, 'Social weight must be non-negative')
    .max(1, 'Social weight cannot exceed 1')
    .describe('Weight for social filter score'),
  liquidity: z
    .number()
    .min(0, 'Liquidity weight must be non-negative')
    .max(1, 'Liquidity weight cannot exceed 1')
    .describe('Weight for liquidity filter score'),
}).refine(
  (weights) => {
    const sum = weights.creator + weights.technical + weights.social + weights.liquidity;
    return Math.abs(sum - 1) < 0.001; // Allow small floating point errors
  },
  { message: 'Scoring weights must sum to 1' }
);

/**
 * Schema for scoring configuration
 */
export const scoringConfigSchema = z.object({
  weights: scoringWeightsSchema,
  minScoreToAlert: z
    .number()
    .min(0, 'Minimum score to alert must be at least 0')
    .max(100, 'Minimum score to alert cannot exceed 100')
    .describe('Minimum score to show an alert (0-100)'),
  minScoreForHighConfidence: z
    .number()
    .min(0, 'Minimum score for high confidence must be at least 0')
    .max(100, 'Minimum score for high confidence cannot exceed 100')
    .describe('Minimum score to consider high confidence (0-100)'),
}).refine(
  (config) => config.minScoreToAlert <= config.minScoreForHighConfidence,
  { message: 'minScoreToAlert must be less than or equal to minScoreForHighConfidence' }
);

/**
 * Schema for trading configuration
 */
export const tradingConfigSchema = z.object({
  slippageBps: z
    .number()
    .int()
    .min(0, 'Slippage must be non-negative')
    .max(10000, 'Slippage cannot exceed 10000 bps (100%)')
    .describe('Slippage tolerance in basis points'),
  priorityFeeLamports: z
    .number()
    .int()
    .min(0, 'Priority fee must be non-negative')
    .describe('Priority fee in lamports'),
  maxRetries: z
    .number()
    .int()
    .min(0, 'Max retries must be non-negative')
    .max(10, 'Max retries cannot exceed 10')
    .describe('Maximum retry attempts'),
});

/**
 * Schema for exit configuration
 */
export const exitConfigSchema = z.object({
  takeProfitPercent: z
    .number()
    .min(0, 'Take profit percent must be non-negative')
    .describe('Take profit percentage'),
  stopLossPercent: z
    .number()
    .max(0, 'Stop loss percent must be negative or zero')
    .min(-100, 'Stop loss percent cannot be less than -100%')
    .describe('Stop loss percentage'),
  checkIntervalMs: z
    .number()
    .int()
    .min(100, 'Check interval must be at least 100ms')
    .describe('Interval to check exit conditions in milliseconds'),
  autoSellEnabled: z
    .boolean()
    .describe('Whether automatic selling is enabled'),
});

/**
 * Schema for UI configuration
 */
export const uiConfigSchema = z.object({
  opportunityTimeoutSec: z
    .number()
    .int()
    .min(1, 'Opportunity timeout must be at least 1 second')
    .describe('Timeout for opportunity display in seconds'),
  soundEnabled: z
    .boolean()
    .describe('Whether to play sounds for alerts'),
  headless: z
    .boolean()
    .optional()
    .default(true)
    .describe('Run in headless mode (no terminal UI)'),
});

/**
 * Schema for the complete bot configuration
 */
export const botConfigSchema = z.object({
  bagsApiKey: z
    .string()
    .min(1, 'Bags API key is required')
    .describe('Bags API key for authentication'),
  solanaRpcUrl: z
    .url('Solana RPC URL must be a valid URL')
    .describe('Solana RPC endpoint URL'),
  walletPath: z
    .string()
    .min(1, 'Wallet path is required')
    .describe('Path to the wallet keypair file'),
  maxPositionPercent: z
    .number()
    .min(0.1, 'Max position percent must be at least 0.1%')
    .max(100, 'Max position percent cannot exceed 100%')
    .describe('Maximum percentage of wallet to use per position'),
  maxOpenPositions: z
    .number()
    .int()
    .min(1, 'Max open positions must be at least 1')
    .max(100, 'Max open positions cannot exceed 100')
    .describe('Maximum number of open positions allowed'),
  filters: filtersSchema,
  scoring: scoringConfigSchema,
  trading: tradingConfigSchema,
  exits: exitConfigSchema,
  ui: uiConfigSchema,
});

/**
 * Type inferred from the bot config schema
 */
export type BotConfigFromSchema = z.infer<typeof botConfigSchema>;

/**
 * Deep partial type utility
 * Makes all properties optional recursively
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Type for partial config (as loaded from file or env)
 * All fields are optional since they can be filled from defaults
 */
export type PartialBotConfig = DeepPartial<BotConfigFromSchema>;
