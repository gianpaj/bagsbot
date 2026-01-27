/**
 * Configuration module for Bags Sniper Bot
 *
 * This module provides configuration loading, validation, and defaults
 * for all bot settings including API keys, RPC URLs, filter thresholds,
 * trading parameters, and UI options.
 *
 * @example
 * ```typescript
 * import { loadConfig, getDefaultConfig } from './config/index.js';
 *
 * // Load full configuration (file + env vars + defaults)
 * const config = await loadConfig();
 *
 * // Access configuration values
 * console.log(config.bagsApiKey);
 * console.log(config.filters.liquidity.minInitialLiquiditySol);
 * ```
 */

// Re-export defaults
export {
  DEFAULT_CREATOR_FILTER,
  DEFAULT_EXIT_CONFIG,
  DEFAULT_FILTERS,
  DEFAULT_LIQUIDITY_FILTER,
  DEFAULT_MAX_OPEN_POSITIONS,
  DEFAULT_MAX_POSITION_PERCENT,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_SOCIAL_FILTER,
  DEFAULT_SOLANA_RPC_URL,
  DEFAULT_TECHNICAL_FILTER,
  DEFAULT_TRADING_CONFIG,
  DEFAULT_UI_CONFIG,
  DEFAULT_WALLET_PATH,
} from './defaults.js';

// Re-export schema and types
export {
  botConfigSchema,
  creatorFilterSchema,
  exitConfigSchema,
  filtersSchema,
  liquidityFilterSchema,
  scoringConfigSchema,
  scoringWeightsSchema,
  socialFilterSchema,
  technicalFilterSchema,
  tradingConfigSchema,
  uiConfigSchema,
  type BotConfigFromSchema,
  type PartialBotConfig,
} from './schema.js';

// Re-export loader functions
export {
  CONFIG_FILE_PATH,
  deepMerge,
  ENV_VARS,
  expandTilde,
  getDefaultConfig,
  loadConfig,
  loadConfigFile,
  loadEnvConfig,
} from './loader.js';
