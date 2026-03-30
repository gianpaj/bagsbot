/**
 * Default configuration values for Bags Sniper Bot
 *
 * These defaults are used when configuration values are not provided
 * in the config file or environment variables.
 */

import type {
  CreatorFilterConfig,
  TechnicalFilterConfig,
  SocialFilterConfig,
  LiquidityFilterConfig,
} from '../types/filters.js';
import type { TradeConfig } from '../types/trading.js';
import type { ExitConfig } from '../types/positions.js';
import type { LaunchSourceConfig, ScoringConfig, UIConfig } from '../types/config.js';

/**
 * Default creator filter configuration
 */
export const DEFAULT_CREATOR_FILTER: CreatorFilterConfig = {
  requireVerifiedSocial: true,
  minFollowerCount: 100,
  minAccountAgeDays: 7,
  checkPreviousLaunches: true,
};

/**
 * Default technical filter configuration
 */
export const DEFAULT_TECHNICAL_FILTER: TechnicalFilterConfig = {
  requireCompleteMetadata: true,
  requireDescription: true,
  requireSocialLinks: false,
  validateImageUrl: true,
};

/**
 * Default social filter configuration
 */
export const DEFAULT_SOCIAL_FILTER: SocialFilterConfig = {
  checkTwitterMentions: true,
  checkTelegramGroup: false,
  minCommunitySize: 50,
};

/**
 * Default liquidity filter configuration
 */
export const DEFAULT_LIQUIDITY_FILTER: LiquidityFilterConfig = {
  minInitialLiquiditySol: 0.5,
  maxBondingCurvePercent: 80,
  maxTopHolderPercent: 30,
};

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    creator: 0.3,
    technical: 0.2,
    social: 0.2,
    liquidity: 0.3,
  },
  minScoreToAlert: 60,
  minScoreForHighConfidence: 80,
};

/**
 * Default trading configuration
 */
export const DEFAULT_TRADING_CONFIG: TradeConfig = {
  slippageBps: 500, // 5%
  priorityFeeLamports: 100000,
  maxRetries: 3,
};

/**
 * Default exit configuration
 */
export const DEFAULT_EXIT_CONFIG: ExitConfig = {
  takeProfitPercent: 900, // 10x
  stopLossPercent: -50,
  checkIntervalMs: 5000,
  autoSellEnabled: false,
};

/**
 * Default UI configuration
 */
export const DEFAULT_UI_CONFIG: UIConfig = {
  opportunityTimeoutSec: 60,
  soundEnabled: true,
  headless: true, // Default to headless until OpenTUI issues are resolved
};

/**
 * Default launch source configuration
 */
export const DEFAULT_LAUNCH_SOURCE_CONFIG: LaunchSourceConfig = {
  type: 'live',
  scenarioName: 'mixed-opportunities',
  scenarioIntervalMs: 2500,
  disableTrading: true,
};

/**
 * Default position management values
 */
export const DEFAULT_MAX_POSITION_PERCENT = 2;
export const DEFAULT_MAX_OPEN_POSITIONS = 10;

/**
 * Default Solana RPC URL (mainnet-beta)
 */
export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

/**
 * Default wallet path relative to home directory
 */
export const DEFAULT_WALLET_PATH = '~/.config/solana/id.json';

/**
 * All default filter configurations combined
 */
export const DEFAULT_FILTERS = {
  creator: DEFAULT_CREATOR_FILTER,
  technical: DEFAULT_TECHNICAL_FILTER,
  social: DEFAULT_SOCIAL_FILTER,
  liquidity: DEFAULT_LIQUIDITY_FILTER,
} as const;
