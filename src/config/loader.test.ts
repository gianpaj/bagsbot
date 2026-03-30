/**
 * Tests for configuration loader
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../errors/index.js';
import {
  loadConfig,
  loadConfigFile,
  loadEnvConfig,
  deepMerge,
  expandTilde,
  getDefaultConfig,
  CONFIG_FILE_PATH,
  ENV_VARS,
} from './loader.js';
import {
  DEFAULT_CREATOR_FILTER,
  DEFAULT_EXIT_CONFIG,
  DEFAULT_LAUNCH_SOURCE_CONFIG,
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

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockedReadFile = vi.mocked(readFile);

describe('loader', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    // Reset env vars - create a clean copy without the config env vars
    const cleanEnv = { ...originalEnv };
    // Use Reflect.deleteProperty which is allowed by eslint
    Reflect.deleteProperty(cleanEnv, ENV_VARS.BAGS_API_KEY);
    Reflect.deleteProperty(cleanEnv, ENV_VARS.SOLANA_RPC_URL);
    Reflect.deleteProperty(cleanEnv, ENV_VARS.WALLET_PATH);
    Reflect.deleteProperty(cleanEnv, ENV_VARS.UI_HEADLESS);
    Reflect.deleteProperty(cleanEnv, ENV_VARS.LAUNCH_SOURCE);
    Reflect.deleteProperty(cleanEnv, ENV_VARS.SCENARIO_NAME);
    Reflect.deleteProperty(cleanEnv, ENV_VARS.SCENARIO_INTERVAL_MS);
    Reflect.deleteProperty(cleanEnv, ENV_VARS.SCENARIO_DISABLE_TRADING);
    process.env = cleanEnv;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('CONFIG_FILE_PATH', () => {
    it('should point to ~/.bagsbot/config.json', () => {
      expect(CONFIG_FILE_PATH).toBe(join(homedir(), '.bagsbot', 'config.json'));
    });
  });

  describe('ENV_VARS', () => {
    it('should define correct environment variable names', () => {
      expect(ENV_VARS.BAGS_API_KEY).toBe('BAGS_API_KEY');
      expect(ENV_VARS.SOLANA_RPC_URL).toBe('SOLANA_RPC_URL');
      expect(ENV_VARS.WALLET_PATH).toBe('WALLET_PATH');
      expect(ENV_VARS.UI_HEADLESS).toBe('UI_HEADLESS');
      expect(ENV_VARS.LAUNCH_SOURCE).toBe('LAUNCH_SOURCE');
      expect(ENV_VARS.SCENARIO_NAME).toBe('SCENARIO_NAME');
      expect(ENV_VARS.SCENARIO_INTERVAL_MS).toBe('SCENARIO_INTERVAL_MS');
      expect(ENV_VARS.SCENARIO_DISABLE_TRADING).toBe('SCENARIO_DISABLE_TRADING');
    });
  });

  describe('expandTilde', () => {
    it('should expand ~/path to home directory', () => {
      const result = expandTilde('~/my/path');
      expect(result).toBe(join(homedir(), 'my/path'));
    });

    it('should expand ~ alone to home directory', () => {
      const result = expandTilde('~');
      expect(result).toBe(homedir());
    });

    it('should not modify paths without tilde', () => {
      const result = expandTilde('/absolute/path');
      expect(result).toBe('/absolute/path');
    });

    it('should not modify paths with tilde in middle', () => {
      const result = expandTilde('/some/~path');
      expect(result).toBe('/some/~path');
    });

    it('should not modify relative paths', () => {
      const result = expandTilde('relative/path');
      expect(result).toBe('relative/path');
    });
  });

  describe('deepMerge', () => {
    it('should merge shallow objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should merge nested objects', () => {
      const target = { a: { x: 1, y: 2 }, b: 3 };
      const source = { a: { y: 5, z: 6 } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { x: 1, y: 5, z: 6 }, b: 3 });
    });

    it('should not modify original objects', () => {
      const target = { a: { x: 1 } };
      const source = { a: { y: 2 } };
      deepMerge(target, source);
      expect(target).toEqual({ a: { x: 1 } });
      expect(source).toEqual({ a: { y: 2 } });
    });

    it('should handle undefined source values', () => {
      const target = { a: 1, b: 2 };
      const source = { a: undefined, c: 3 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should override arrays instead of merging', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };
      const result = deepMerge(target, source);
      expect(result).toEqual({ arr: [4, 5] });
    });

    it('should handle null values', () => {
      const target = { a: { x: 1 }, b: null };
      const source = { a: null as unknown as Record<string, unknown> };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: null, b: null });
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration without bagsApiKey', () => {
      const config = getDefaultConfig();

      expect(config.solanaRpcUrl).toBe(DEFAULT_SOLANA_RPC_URL);
      expect(config.walletPath).toBe(expandTilde(DEFAULT_WALLET_PATH));
      expect(config.maxPositionPercent).toBe(DEFAULT_MAX_POSITION_PERCENT);
      expect(config.maxOpenPositions).toBe(DEFAULT_MAX_OPEN_POSITIONS);
      expect(config.filters.creator).toEqual(DEFAULT_CREATOR_FILTER);
      expect(config.filters.technical).toEqual(DEFAULT_TECHNICAL_FILTER);
      expect(config.filters.social).toEqual(DEFAULT_SOCIAL_FILTER);
      expect(config.filters.liquidity).toEqual(DEFAULT_LIQUIDITY_FILTER);
      expect(config.scoring.weights).toEqual(DEFAULT_SCORING_CONFIG.weights);
      expect(config.scoring.minScoreToAlert).toBe(DEFAULT_SCORING_CONFIG.minScoreToAlert);
      expect(config.scoring.minScoreForHighConfidence).toBe(
        DEFAULT_SCORING_CONFIG.minScoreForHighConfidence
      );
      expect(config.trading).toEqual(DEFAULT_TRADING_CONFIG);
      expect(config.exits).toEqual(DEFAULT_EXIT_CONFIG);
      expect(config.launchSource).toEqual(DEFAULT_LAUNCH_SOURCE_CONFIG);
      expect(config.ui).toEqual(DEFAULT_UI_CONFIG);
    });

    it('should not include bagsApiKey', () => {
      const config = getDefaultConfig();
      expect('bagsApiKey' in config).toBe(false);
    });
  });

  describe('loadConfigFile', () => {
    it('should load and parse valid JSON config file', async () => {
      const mockConfig = { bagsApiKey: 'test-key' };
      mockedReadFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await loadConfigFile('/test/config.json');
      expect(result).toEqual(mockConfig);
      expect(mockedReadFile).toHaveBeenCalledWith('/test/config.json', 'utf-8');
    });

    it('should return empty object when file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockedReadFile.mockRejectedValue(error);

      const result = await loadConfigFile('/nonexistent/config.json');
      expect(result).toEqual({});
    });

    it('should throw ConfigError for invalid JSON', async () => {
      mockedReadFile.mockResolvedValue('{ invalid json }');

      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(ConfigError);
      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(/Invalid JSON/);
    });

    it('should throw ConfigError when file contains non-object JSON', async () => {
      mockedReadFile.mockResolvedValue('"string value"');

      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(ConfigError);
      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(
        /must contain a JSON object/
      );
    });

    it('should throw ConfigError when file contains null', async () => {
      mockedReadFile.mockResolvedValue('null');

      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(ConfigError);
      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(
        /must contain a JSON object/
      );
    });

    it('should throw ConfigError when file contains array', async () => {
      mockedReadFile.mockResolvedValue('[1, 2, 3]');

      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(ConfigError);
      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(
        /must contain a JSON object/
      );
    });

    it('should throw ConfigError for other read errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockedReadFile.mockRejectedValue(error);

      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(ConfigError);
      await expect(loadConfigFile('/test/config.json')).rejects.toThrow(
        /Failed to load config file/
      );
    });

    it('should use default config path when not specified', async () => {
      mockedReadFile.mockResolvedValue('{}');

      await loadConfigFile();
      expect(mockedReadFile).toHaveBeenCalledWith(CONFIG_FILE_PATH, 'utf-8');
    });
  });

  describe('loadEnvConfig', () => {
    it('should return empty object when no env vars are set', () => {
      const result = loadEnvConfig();
      expect(result).toEqual({});
    });

    it('should load BAGS_API_KEY from environment', () => {
      process.env[ENV_VARS.BAGS_API_KEY] = 'my-api-key';

      const result = loadEnvConfig();
      expect(result.bagsApiKey).toBe('my-api-key');
    });

    it('should load SOLANA_RPC_URL from environment', () => {
      process.env[ENV_VARS.SOLANA_RPC_URL] = 'https://my-rpc.com';

      const result = loadEnvConfig();
      expect(result.solanaRpcUrl).toBe('https://my-rpc.com');
    });

    it('should load WALLET_PATH from environment', () => {
      process.env[ENV_VARS.WALLET_PATH] = '/path/to/wallet.json';

      const result = loadEnvConfig();
      expect(result.walletPath).toBe('/path/to/wallet.json');
    });

    it('should load UI_HEADLESS from environment', () => {
      process.env[ENV_VARS.UI_HEADLESS] = 'false';

      const result = loadEnvConfig();
      expect(result.ui).toEqual({ headless: false });
    });

    it('should load all env vars when all are set', () => {
      process.env[ENV_VARS.BAGS_API_KEY] = 'api-key';
      process.env[ENV_VARS.SOLANA_RPC_URL] = 'https://rpc.example.com';
      process.env[ENV_VARS.WALLET_PATH] = '/wallet/path.json';
      process.env[ENV_VARS.UI_HEADLESS] = 'false';
      process.env[ENV_VARS.LAUNCH_SOURCE] = 'scenario';
      process.env[ENV_VARS.SCENARIO_NAME] = 'mixed-opportunities';
      process.env[ENV_VARS.SCENARIO_INTERVAL_MS] = '1500';
      process.env[ENV_VARS.SCENARIO_DISABLE_TRADING] = 'false';

      const result = loadEnvConfig();
      expect(result).toEqual({
        bagsApiKey: 'api-key',
        solanaRpcUrl: 'https://rpc.example.com',
        walletPath: '/wallet/path.json',
        ui: {
          headless: false,
        },
        launchSource: {
          type: 'scenario',
          scenarioName: 'mixed-opportunities',
          scenarioIntervalMs: 1500,
          disableTrading: false,
        },
      });
    });

    it('should ignore empty string env vars', () => {
      process.env[ENV_VARS.BAGS_API_KEY] = '';
      process.env[ENV_VARS.SOLANA_RPC_URL] = '';
      process.env[ENV_VARS.WALLET_PATH] = '';
      process.env[ENV_VARS.UI_HEADLESS] = '';
      process.env[ENV_VARS.LAUNCH_SOURCE] = '';
      process.env[ENV_VARS.SCENARIO_NAME] = '';
      process.env[ENV_VARS.SCENARIO_INTERVAL_MS] = '';
      process.env[ENV_VARS.SCENARIO_DISABLE_TRADING] = '';

      const result = loadEnvConfig();
      expect(result).toEqual({});
    });

    it('should load scenario launch source values from environment', () => {
      process.env[ENV_VARS.LAUNCH_SOURCE] = 'scenario';
      process.env[ENV_VARS.SCENARIO_NAME] = 'mixed-opportunities';
      process.env[ENV_VARS.SCENARIO_INTERVAL_MS] = '3000';
      process.env[ENV_VARS.SCENARIO_DISABLE_TRADING] = 'true';

      const result = loadEnvConfig();
      expect(result.launchSource).toEqual({
        type: 'scenario',
        scenarioName: 'mixed-opportunities',
        scenarioIntervalMs: 3000,
        disableTrading: true,
      });
    });
  });

  describe('loadConfig', () => {
    it('should load config with API key from env var', async () => {
      mockedReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      process.env[ENV_VARS.BAGS_API_KEY] = 'test-api-key';

      const config = await loadConfig();

      expect(config.bagsApiKey).toBe('test-api-key');
      expect(config.solanaRpcUrl).toBe(DEFAULT_SOLANA_RPC_URL);
      expect(config.maxPositionPercent).toBe(DEFAULT_MAX_POSITION_PERCENT);
    });

    it('should load config from file', async () => {
      const fileConfig = {
        bagsApiKey: 'file-api-key',
        maxPositionPercent: 5,
        filters: {
          creator: {
            minFollowerCount: 500,
          },
        },
      };
      mockedReadFile.mockResolvedValue(JSON.stringify(fileConfig));

      const config = await loadConfig();

      expect(config.bagsApiKey).toBe('file-api-key');
      expect(config.maxPositionPercent).toBe(5);
      expect(config.filters.creator.minFollowerCount).toBe(500);
      // Other creator filter values should be defaults
      expect(config.filters.creator.requireVerifiedSocial).toBe(
        DEFAULT_CREATOR_FILTER.requireVerifiedSocial
      );
    });

    it('should override file config with env vars', async () => {
      const fileConfig = {
        bagsApiKey: 'file-api-key',
        solanaRpcUrl: 'https://file-rpc.com',
      };
      mockedReadFile.mockResolvedValue(JSON.stringify(fileConfig));
      process.env[ENV_VARS.BAGS_API_KEY] = 'env-api-key';

      const config = await loadConfig();

      expect(config.bagsApiKey).toBe('env-api-key');
      expect(config.solanaRpcUrl).toBe('https://file-rpc.com');
    });

    it('should throw ConfigError when API key is missing', async () => {
      mockedReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/bagsApiKey/);
    });

    it('should throw ConfigError for invalid RPC URL', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          solanaRpcUrl: 'not-a-url',
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/solanaRpcUrl.*valid URL/);
    });

    it('should throw ConfigError for negative maxPositionPercent', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          maxPositionPercent: -1,
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/maxPositionPercent/);
    });

    it('should throw ConfigError for invalid filter values', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          filters: {
            liquidity: {
              maxBondingCurvePercent: 150, // Over 100%
            },
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/maxBondingCurvePercent/);
    });

    it('should throw ConfigError when scoring weights do not sum to 1', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          scoring: {
            weights: {
              creator: 0.5,
              technical: 0.5,
              social: 0.5,
              liquidity: 0.5,
            },
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/weights must sum to 1/);
    });

    it('should accept valid complete configuration', async () => {
      const validConfig = {
        bagsApiKey: 'valid-api-key',
        solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
        walletPath: '/home/user/.config/solana/id.json',
        maxPositionPercent: 5,
        maxOpenPositions: 20,
        filters: {
          creator: {
            requireVerifiedSocial: false,
            minFollowerCount: 200,
            minAccountAgeDays: 14,
            checkPreviousLaunches: false,
          },
          technical: {
            requireCompleteMetadata: true,
            requireDescription: false,
            requireSocialLinks: true,
            validateImageUrl: false,
          },
          social: {
            checkTwitterMentions: false,
            checkTelegramGroup: true,
            minCommunitySize: 100,
          },
          liquidity: {
            minInitialLiquiditySol: 1.0,
            maxBondingCurvePercent: 70,
            maxTopHolderPercent: 25,
          },
        },
        scoring: {
          weights: {
            creator: 0.25,
            technical: 0.25,
            social: 0.25,
            liquidity: 0.25,
          },
          minScoreToAlert: 50,
          minScoreForHighConfidence: 75,
        },
        trading: {
          slippageBps: 300,
          priorityFeeLamports: 50000,
          maxRetries: 5,
        },
        exits: {
          takeProfitPercent: 500,
          stopLossPercent: -30,
          checkIntervalMs: 3000,
          autoSellEnabled: true,
        },
        launchSource: {
          type: 'scenario',
          scenarioName: 'mixed-opportunities',
          scenarioIntervalMs: 2000,
          disableTrading: true,
        },
        ui: {
          opportunityTimeoutSec: 30,
          soundEnabled: false,
          headless: true,
        },
      };
      mockedReadFile.mockResolvedValue(JSON.stringify(validConfig));

      const config = await loadConfig();

      expect(config).toEqual(validConfig);
    });

    it('should expand tilde in wallet path from file', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          walletPath: '~/my-wallet.json',
        })
      );

      const config = await loadConfig();
      expect(config.walletPath).toBe(join(homedir(), 'my-wallet.json'));
    });

    it('should expand tilde in wallet path from env var', async () => {
      mockedReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      process.env[ENV_VARS.BAGS_API_KEY] = 'test-key';
      process.env[ENV_VARS.WALLET_PATH] = '~/env-wallet.json';

      const config = await loadConfig();
      expect(config.walletPath).toBe(join(homedir(), 'env-wallet.json'));
    });

    it('should use custom config file path when specified', async () => {
      const customPath = '/custom/path/config.json';
      mockedReadFile.mockResolvedValue(JSON.stringify({ bagsApiKey: 'test-key' }));

      await loadConfig(customPath);
      expect(mockedReadFile).toHaveBeenCalledWith(customPath, 'utf-8');
    });

    it('should throw ConfigError for minScoreToAlert > minScoreForHighConfidence', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          scoring: {
            weights: {
              creator: 0.25,
              technical: 0.25,
              social: 0.25,
              liquidity: 0.25,
            },
            minScoreToAlert: 90,
            minScoreForHighConfidence: 70,
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(
        /minScoreToAlert must be less than or equal to minScoreForHighConfidence/
      );
    });

    it('should throw ConfigError for positive stop loss', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          exits: {
            stopLossPercent: 10, // Should be negative
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/stopLossPercent/);
    });

    it('should throw ConfigError for too small check interval', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          exits: {
            checkIntervalMs: 50, // Too small
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/checkIntervalMs/);
    });

    it('should validate nested filter configs', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          filters: {
            creator: {
              minFollowerCount: -100, // Invalid negative
            },
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/minFollowerCount/);
    });

    it('should validate trading config', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          trading: {
            slippageBps: 15000, // Over 10000
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/slippageBps/);
    });

    it('should validate UI config', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          ui: {
            opportunityTimeoutSec: 0, // Too small
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/opportunityTimeoutSec/);
    });

    it('should validate launch source config', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          bagsApiKey: 'test-key',
          launchSource: {
            type: 'scenario',
            scenarioName: '',
            scenarioIntervalMs: 10,
            disableTrading: true,
          },
        })
      );

      await expect(loadConfig()).rejects.toThrow(ConfigError);
      await expect(loadConfig()).rejects.toThrow(/scenarioName|scenarioIntervalMs/);
    });
  });
});
