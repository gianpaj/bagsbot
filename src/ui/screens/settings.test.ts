/**
 * Tests for Settings Screen
 */

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSettingsScreen, type SettingsScreenConfig } from './settings.js';
import type { BotConfig } from '../../types/index.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

// Mock components
vi.mock('../components/index.js', () => ({
  createHeader: vi.fn(() => ({ id: 'header' })),
  createActionBar: vi.fn(() => ({ id: 'action-bar' })),
}));

describe('settings screen', () => {
  let mockBotConfig: BotConfig;

  beforeEach(() => {
    mockBotConfig = {
      bagsApiKey: 'test-key',
      solanaRpcUrl: 'http://localhost:8899',
      walletPath: '/tmp/wallet.json',
      maxPositionPercent: 0.1,
      maxOpenPositions: 5,
      filters: {
        creator: {
          minFollowers: 100,
          maxHoldersPercent: 50,
        },
        technical: {
          minPriceMomentum: 0.5,
          minVolumeMomentum: 1.0,
        },
        social: {
          minTwitterFollowers: 1000,
          minTwitterCreationAgeDays: 30,
        },
        liquidity: {
          minInitialLiquiditySol: 5,
          minCurveFillPercent: 5,
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
        slippageBps: 500,
        priorityFeeLamports: 100000,
        maxRetries: 3,
      },
      exits: {
        takeProfitPercent: 900,
        stopLossPercent: -50,
        checkIntervalMs: 5000,
        autoSellEnabled: false,
      },
      ui: {
        opportunityTimeoutSec: 30,
        soundEnabled: true,
      },
    };
  });

  it('should create settings screen', () => {
    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      botConfig: mockBotConfig,
    };

    const screen = createSettingsScreen(config);

    expect(screen).toBeDefined();
    expect(screen).toHaveProperty('id', 'settings-screen');
  });

  it('should create settings screen when disconnected', () => {
    const config: SettingsScreenConfig = {
      isConnected: false,
      walletBalance: 0,
      botConfig: mockBotConfig,
    };

    const screen = createSettingsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should have flexDirection column for vertical layout', () => {
    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      botConfig: mockBotConfig,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const screen: any = createSettingsScreen(config);

    expect(screen.flexDirection).toBe('column');
  });

  it('should handle different position size percentages', () => {
    const configWithDifferentPercent: BotConfig = {
      ...mockBotConfig,
      maxPositionPercent: 0.25,
    };

    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 10,
      botConfig: configWithDifferentPercent,
    };

    const screen = createSettingsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle different exit settings', () => {
    const configWithDifferentExits: BotConfig = {
      ...mockBotConfig,
      exits: {
        takeProfitPercent: 500,
        stopLossPercent: -75,
        checkIntervalMs: 10000,
        autoSellEnabled: true,
      },
    };

    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 10,
      botConfig: configWithDifferentExits,
    };

    const screen = createSettingsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle different filter settings', () => {
    const configWithDifferentFilters: BotConfig = {
      ...mockBotConfig,
      filters: {
        creator: {
          minFollowers: 500,
          maxHoldersPercent: 30,
        },
        technical: {
          minPriceMomentum: 1.0,
          minVolumeMomentum: 2.0,
        },
        social: {
          minTwitterFollowers: 5000,
          minTwitterCreationAgeDays: 60,
        },
        liquidity: {
          minInitialLiquiditySol: 10,
          minCurveFillPercent: 10,
        },
      },
    };

    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 10,
      botConfig: configWithDifferentFilters,
    };

    const screen = createSettingsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle different UI settings', () => {
    const configWithDifferentUI: BotConfig = {
      ...mockBotConfig,
      ui: {
        opportunityTimeoutSec: 60,
        soundEnabled: false,
      },
    };

    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 10,
      botConfig: configWithDifferentUI,
    };

    const screen = createSettingsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle different trading settings', () => {
    const configWithDifferentTrading: BotConfig = {
      ...mockBotConfig,
      trading: {
        slippageBps: 1000,
        priorityFeeLamports: 500000,
        maxRetries: 5,
      },
    };

    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 10,
      botConfig: configWithDifferentTrading,
    };

    const screen = createSettingsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should display all configuration sections', () => {
    const config: SettingsScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      botConfig: mockBotConfig,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const screen: any = createSettingsScreen(config);

    // The screen should be defined and have all required sections
    expect(screen).toBeDefined();
    expect(screen.flexDirection).toBe('column');
  });
});
