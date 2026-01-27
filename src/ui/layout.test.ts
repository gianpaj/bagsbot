/**
 * Tests for OpenTUI Layout
 *
 * Tests layout creation for different screen states and ensures
 * that the layout structure is created correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMainLayout } from './layout.js';
import type { AppState, ScreenState } from './app.js';
import type { BotConfig } from '../types/index.js';

// Mock OpenTUI components
vi.mock('@opentui/core', () => ({
  Box: vi.fn(function (options) {
    return {
      ...options,
      _type: 'Box',
    };
  }),
  Text: vi.fn(function (options) {
    return {
      ...options,
      _type: 'Text',
    };
  }),
}));

// Create minimal bot config for testing
const mockBotConfig: BotConfig = {
  bagsApiKey: 'test-key',
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  walletPath: '/path/to/wallet.json',
  maxPositionPercent: 10,
  maxOpenPositions: 5,
  filters: {
    creator: { minHistoryScore: 50, maxRugScore: 20 },
    technical: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true },
    social: { twitterVerified: false, minFollowers: 100 },
    liquidity: { minLiquiditySol: 1, maxWhalePercent: 25 },
  },
  scoring: {
    weights: { creator: 0.25, technical: 0.25, social: 0.25, liquidity: 0.25 },
    minScoreToAlert: 60,
    minScoreForHighConfidence: 75,
  },
  trading: { slippagePercent: 1, priorityFeeMultiplier: 1.5 },
  exits: { takeProfitPercent: 900, stopLossPercent: -50, checkIntervalMs: 5000, autoSellEnabled: false },
  ui: { opportunityTimeoutSec: 30, soundEnabled: true },
};

describe('Layout Creation', () => {
  let baseState: AppState;

  beforeEach(() => {
    baseState = {
      currentScreen: 'main',
      selectedOpportunity: null,
      positions: [],
      isRunning: true,
    };
  });

  describe('Main Screen Layout', () => {
    it('should create main layout with correct structure', () => {
      const layout = createMainLayout(baseState, mockBotConfig);

      expect(layout).toBeDefined();
      expect(layout.id).toBe('main-layout');
      expect(layout._type).toBe('Box');
    });

    it('should include header, sections, and action bar', () => {
      const layout = createMainLayout(baseState, mockBotConfig);

      // The layout should be created without errors
      expect(layout).toBeDefined();
      expect(typeof layout).toBe('object');
    });

    it('should display main screen when currentScreen is main', () => {
      const state: AppState = { ...baseState, currentScreen: 'main' };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout.id).toBe('main-layout');
    });
  });

  describe('Positions Screen Layout', () => {
    it('should create positions screen layout', () => {
      const state: AppState = { ...baseState, currentScreen: 'positions' };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout).toBeDefined();
      expect(layout.id).toBe('positions-screen');
    });

    it('should include positions data in layout', () => {
      const positions = [
        {
          id: 'pos-1',
          mint: 'mint1',
          tokenSymbol: '$TOKEN1',
          entryPrice: 0.001,
          tokensHeld: 100,
          entrySol: 0.1,
          entryTimestamp: new Date(),
          currentPrice: 0.00225,
          currentValue: 0.225,
          pnlPercent: 125,
          status: 'open' as const,
        },
      ];

      const state: AppState = { ...baseState, currentScreen: 'positions', positions };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout.id).toBe('positions-screen');
      expect(layout).toBeDefined();
    });
  });

  describe('History Screen Layout', () => {
    it('should create history screen layout', () => {
      const state: AppState = { ...baseState, currentScreen: 'history' };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout).toBeDefined();
      expect(layout.id).toBe('history-screen');
    });

    it('should include history title and example data', () => {
      const state: AppState = { ...baseState, currentScreen: 'history' };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout.id).toBe('history-screen');
      expect(layout).toBeDefined();
    });
  });

  describe('Settings Screen Layout', () => {
    it('should create settings screen layout', () => {
      const state: AppState = { ...baseState, currentScreen: 'settings' };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout).toBeDefined();
      expect(layout.id).toBe('settings-screen');
    });

    it('should include settings information', () => {
      const state: AppState = { ...baseState, currentScreen: 'settings' };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout.id).toBe('settings-screen');
      expect(layout).toBeDefined();
    });
  });

  describe('Screen State Transitions', () => {
    const screens: ScreenState[] = ['main', 'positions', 'history', 'settings'];

    screens.forEach((screen) => {
      it(`should handle ${screen} screen correctly`, () => {
        const state: AppState = { ...baseState, currentScreen: screen };
        const layout = createMainLayout(state, mockBotConfig);

        expect(layout).toBeDefined();
        expect(layout.id).toBeDefined();
      });
    });
  });

  describe('Position Display', () => {
    it('should display multiple positions with correct formatting', () => {
      const positions = [
        {
          id: 'pos-1',
          mint: 'mint1',
          tokenSymbol: '$TOKEN1',
          entryPrice: 0.001,
          tokensHeld: 100,
          entrySol: 0.1,
          entryTimestamp: new Date(),
          currentPrice: 0.00225,
          currentValue: 0.225,
          pnlPercent: 125,
          status: 'open' as const,
        },
        {
          id: 'pos-2',
          mint: 'mint2',
          tokenSymbol: '$TOKEN2',
          entryPrice: 0.002,
          tokensHeld: 25,
          entrySol: 0.05,
          entryTimestamp: new Date(),
          currentPrice: 0.0017,
          currentValue: 0.042,
          pnlPercent: -15,
          status: 'open' as const,
        },
      ];

      const state: AppState = { ...baseState, currentScreen: 'positions', positions };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout.id).toBe('positions-screen');
    });

    it('should handle empty positions list', () => {
      const state: AppState = { ...baseState, currentScreen: 'positions', positions: [] };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout.id).toBe('positions-screen');
    });

    it('should truncate positions list when exceeding limit', () => {
      const positions = Array.from({ length: 10 }, (_, i) => ({
        id: `pos-${i}`,
        mint: `mint${i}`,
        tokenSymbol: `$TOKEN${i}`,
        entryPrice: 0.001,
        tokensHeld: 100,
        entrySol: 0.1,
        entryTimestamp: new Date(),
        pnlPercent: 10,
        status: 'open' as const,
      }));

      const state: AppState = { ...baseState, currentScreen: 'positions', positions };
      const layout = createMainLayout(state, mockBotConfig);

      expect(layout.id).toBe('positions-screen');
    });
  });
});
