/**
 * Configuration loader for Bags Sniper Bot
 *
 * Loads configuration from:
 * 1. ~/.bagsbot/config.json (if it exists)
 * 2. Environment variables (override file values)
 * 3. Default values (for missing optional values)
 *
 * Environment variables:
 * - BAGS_API_KEY: Bags API key for authentication
 * - SOLANA_RPC_URL: Solana RPC endpoint URL
 * - WALLET_PATH: Path to the wallet keypair file
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../errors/index.js';
import type { BotConfig } from '../types/config.js';
import {
  DEFAULT_CREATOR_FILTER,
  DEFAULT_EXIT_CONFIG,
  DEFAULT_LIQUIDITY_FILTER,
  DEFAULT_LAUNCH_SOURCE_CONFIG,
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
import { botConfigSchema, type PartialBotConfig } from './schema.js';

/**
 * Default config file path
 */
export const CONFIG_FILE_PATH = join(homedir(), '.bagsbot', 'config.json');

/**
 * Environment variable names for configuration
 */
export const ENV_VARS = {
  BAGS_API_KEY: 'BAGS_API_KEY',
  SOLANA_RPC_URL: 'SOLANA_RPC_URL',
  WALLET_PATH: 'WALLET_PATH',
  LAUNCH_SOURCE: 'LAUNCH_SOURCE',
  SCENARIO_NAME: 'SCENARIO_NAME',
  SCENARIO_INTERVAL_MS: 'SCENARIO_INTERVAL_MS',
  SCENARIO_DISABLE_TRADING: 'SCENARIO_DISABLE_TRADING',
} as const;

/**
 * Load configuration from file
 *
 * @param filePath - Path to the config file (defaults to ~/.bagsbot/config.json)
 * @returns Partial config from file, or empty object if file doesn't exist
 */
export async function loadConfigFile(
  filePath: string = CONFIG_FILE_PATH
): Promise<PartialBotConfig> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ConfigError(`Config file must contain a JSON object`);
    }

    return parsed as PartialBotConfig;
  } catch (error) {
    // File doesn't exist - that's okay, we'll use defaults and env vars
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return {};
    }

    // JSON parse error
    if (error instanceof SyntaxError) {
      throw new ConfigError(`Invalid JSON in config file: ${error.message}`);
    }

    // Re-throw ConfigError as-is
    if (error instanceof ConfigError) {
      throw error;
    }

    // Unknown error
    throw new ConfigError(
      `Failed to load config file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load configuration from environment variables
 *
 * @returns Partial config from environment variables
 */
export function loadEnvConfig(): PartialBotConfig {
  const config: PartialBotConfig = {};

  const bagsApiKey = process.env[ENV_VARS.BAGS_API_KEY];
  if (bagsApiKey !== undefined && bagsApiKey !== '') {
    config.bagsApiKey = bagsApiKey;
  }

  const solanaRpcUrl = process.env[ENV_VARS.SOLANA_RPC_URL];
  if (solanaRpcUrl !== undefined && solanaRpcUrl !== '') {
    config.solanaRpcUrl = solanaRpcUrl;
  }

  const walletPath = process.env[ENV_VARS.WALLET_PATH];
  if (walletPath !== undefined && walletPath !== '') {
    config.walletPath = walletPath;
  }

  const launchSourceType = process.env[ENV_VARS.LAUNCH_SOURCE];
  const scenarioName = process.env[ENV_VARS.SCENARIO_NAME];
  const scenarioIntervalMs = process.env[ENV_VARS.SCENARIO_INTERVAL_MS];
  const scenarioDisableTrading = process.env[ENV_VARS.SCENARIO_DISABLE_TRADING];

  if (
    (launchSourceType !== undefined && launchSourceType !== '') ||
    (scenarioName !== undefined && scenarioName !== '') ||
    (scenarioIntervalMs !== undefined && scenarioIntervalMs !== '') ||
    (scenarioDisableTrading !== undefined && scenarioDisableTrading !== '')
  ) {
    config.launchSource = {};
  }

  if (launchSourceType !== undefined && launchSourceType !== '') {
    config.launchSource = {
      ...config.launchSource,
      type: launchSourceType as 'live' | 'scenario',
    };
  }

  if (scenarioName !== undefined && scenarioName !== '') {
    config.launchSource = {
      ...config.launchSource,
      scenarioName,
    };
  }

  if (scenarioIntervalMs !== undefined && scenarioIntervalMs !== '') {
    config.launchSource = {
      ...config.launchSource,
      scenarioIntervalMs: Number(scenarioIntervalMs),
    };
  }

  if (scenarioDisableTrading !== undefined && scenarioDisableTrading !== '') {
    config.launchSource = {
      ...config.launchSource,
      disableTrading: scenarioDisableTrading.toLowerCase() === 'true',
    };
  }

  return config;
}

/**
 * Deep merge two objects, with source values overriding target values
 *
 * @param target - Target object
 * @param source - Source object (values override target)
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[typeof key];
    } else if (sourceValue !== undefined) {
      // Override with source value
      result[key] = sourceValue as T[typeof key];
    }
  }

  return result;
}

/**
 * Expand tilde (~) in file paths to home directory
 *
 * @param path - Path that may contain tilde
 * @returns Expanded path
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

/**
 * Get default configuration values
 *
 * @returns Complete default configuration (except required API key)
 */
export function getDefaultConfig(): Omit<BotConfig, 'bagsApiKey'> {
  return {
    solanaRpcUrl: DEFAULT_SOLANA_RPC_URL,
    walletPath: expandTilde(DEFAULT_WALLET_PATH),
    maxPositionPercent: DEFAULT_MAX_POSITION_PERCENT,
    maxOpenPositions: DEFAULT_MAX_OPEN_POSITIONS,
    filters: {
      creator: { ...DEFAULT_CREATOR_FILTER },
      technical: { ...DEFAULT_TECHNICAL_FILTER },
      social: { ...DEFAULT_SOCIAL_FILTER },
      liquidity: { ...DEFAULT_LIQUIDITY_FILTER },
    },
    scoring: {
      weights: { ...DEFAULT_SCORING_CONFIG.weights },
      minScoreToAlert: DEFAULT_SCORING_CONFIG.minScoreToAlert,
      minScoreForHighConfidence: DEFAULT_SCORING_CONFIG.minScoreForHighConfidence,
    },
    trading: { ...DEFAULT_TRADING_CONFIG },
    exits: { ...DEFAULT_EXIT_CONFIG },
    launchSource: { ...DEFAULT_LAUNCH_SOURCE_CONFIG },
    ui: { ...DEFAULT_UI_CONFIG },
  };
}

/**
 * Load and validate bot configuration
 *
 * Configuration is loaded from:
 * 1. Default values
 * 2. Config file (~/.bagsbot/config.json) - overrides defaults
 * 3. Environment variables - override config file
 *
 * @param configFilePath - Optional custom config file path
 * @returns Validated bot configuration
 * @throws ConfigError if configuration is invalid or missing required values
 */
export async function loadConfig(configFilePath: string = CONFIG_FILE_PATH): Promise<BotConfig> {
  // Load from file
  const fileConfig = await loadConfigFile(configFilePath);

  // Load from environment
  const envConfig = loadEnvConfig();

  // Start with defaults
  const defaults = getDefaultConfig();

  // Merge: defaults <- fileConfig <- envConfig
  const mergedWithFile = deepMerge(
    defaults as unknown as Record<string, unknown>,
    fileConfig as unknown as Record<string, unknown>
  );
  const merged = deepMerge(mergedWithFile, envConfig as unknown as Record<string, unknown>);

  // Expand tilde in wallet path if present
  if (typeof merged['walletPath'] === 'string') {
    merged['walletPath'] = expandTilde(merged['walletPath']);
  }

  // Validate with Zod
  const result = botConfigSchema.safeParse(merged);

  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new ConfigError(`Invalid configuration: ${errors}`);
  }

  return result.data;
}
