/**
 * Bot configuration types
 */

import type {
  CreatorFilterConfig,
  TechnicalFilterConfig,
  SocialFilterConfig,
  LiquidityFilterConfig,
} from './filters.js';
import type { TradeConfig } from './trading.js';
import type { ExitConfig } from './positions.js';

/**
 * Weights for scoring different filter categories
 */
export interface ScoringWeights {
  /** Weight for creator filter score */
  creator: number;
  /** Weight for technical filter score */
  technical: number;
  /** Weight for social filter score */
  social: number;
  /** Weight for liquidity filter score */
  liquidity: number;
}

/**
 * Configuration for the scoring system
 */
export interface ScoringConfig {
  /** Weights for each filter category */
  weights: ScoringWeights;
  /** Minimum score to show an alert (0-100) */
  minScoreToAlert: number;
  /** Minimum score to consider high confidence (0-100) */
  minScoreForHighConfidence: number;
}

/**
 * Launch source selection and scenario settings
 */
export interface LaunchSourceConfig {
  /** Source of launch events */
  type: 'live' | 'scenario';
  /** Scenario preset name when using scenario mode */
  scenarioName: string;
  /** Delay between injected launch events in milliseconds */
  scenarioIntervalMs: number;
  /** Block trade execution while using synthetic launches */
  disableTrading: boolean;
}

/**
 * Configuration for the user interface
 */
export interface UIConfig {
  /** Timeout for opportunity display in seconds */
  opportunityTimeoutSec: number;
  /** Whether to play sounds for alerts */
  soundEnabled: boolean;
  /** Run in headless mode (no terminal UI) */
  headless?: boolean;
}

/**
 * Main bot configuration
 */
export interface BotConfig {
  /** Bags API key for authentication */
  bagsApiKey: string;
  /** Solana RPC endpoint URL */
  solanaRpcUrl: string;
  /** Path to the wallet keypair file */
  walletPath: string;
  /** Maximum percentage of wallet to use per position */
  maxPositionPercent: number;
  /** Maximum number of open positions allowed */
  maxOpenPositions: number;
  /** Filter configurations */
  filters: {
    creator: CreatorFilterConfig;
    technical: TechnicalFilterConfig;
    social: SocialFilterConfig;
    liquidity: LiquidityFilterConfig;
  };
  /** Scoring system configuration */
  scoring: ScoringConfig;
  /** Trading execution configuration */
  trading: TradeConfig;
  /** Exit strategy configuration */
  exits: ExitConfig;
  /** Launch source configuration */
  launchSource: LaunchSourceConfig;
  /** UI configuration */
  ui: UIConfig;
}
