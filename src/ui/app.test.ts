/**
 * Tests for OpenTUI Application
 *
 * Tests the app initialization, state management, screen navigation,
 * and keyboard input handling (without requiring actual terminal rendering).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenTUIApp, type AppConfig, type ScreenState } from './app.js';
import type { BotConfig } from '../types/index.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  createCliRenderer: vi.fn().mockResolvedValue({
    add: vi.fn(),
    remove: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    requestRender: vi.fn(),
  }),
  RootRenderable: vi.fn(() => ({
    id: 'app-root',
    add: vi.fn(),
    remove: vi.fn(),
    getChildren: vi.fn().mockReturnValue([]),
  })),
  Box: vi.fn((options) => ({
    ...options,
  })),
  Text: vi.fn((options) => ({
    ...options,
  })),
}));

// Mock the layout module
vi.mock('./layout.js', () => ({
  createMainLayout: vi.fn(() => ({
    id: 'main-layout',
  })),
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('OpenTUIApp', () => {
  let app: OpenTUIApp;
  let config: AppConfig;

  beforeEach(() => {
    config = {
      botConfig: {
        bagsApiKey: 'test-key',
        solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
        walletPath: '/path/to/wallet.json',
        maxPositionPercent: 10,
        maxOpenPositions: 5,
        filters: {
          creator: {
            minHistoryScore: 50,
            maxRugScore: 20,
          },
          technical: {
            mintAuthorityDisabled: true,
            freezeAuthorityDisabled: true,
          },
          social: {
            twitterVerified: false,
            minFollowers: 100,
          },
          liquidity: {
            minLiquiditySol: 1,
            maxWhalePercent: 25,
          },
        },
        scoring: {
          weights: {
            creator: 0.25,
            technical: 0.25,
            social: 0.25,
            liquidity: 0.25,
          },
          minScoreToAlert: 60,
          minScoreForHighConfidence: 75,
        },
        trading: {
          slippagePercent: 1,
          priorityFeeMultiplier: 1.5,
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
      },
      opportunityTimeoutMs: 30000,
    };

    app = new OpenTUIApp(config);
  });

  describe('Initialization', () => {
    it('should create an app instance with initial state', () => {
      const state = app.getState();

      expect(state.currentScreen).toBe('main');
      expect(state.selectedOpportunity).toBeNull();
      expect(state.positions).toHaveLength(0);
      expect(state.isRunning).toBe(false);
    });

    it('should not be running initially', () => {
      expect(app.isRunning()).toBe(false);
    });
  });

  describe('Screen Navigation', () => {
    it('should navigate to positions screen', () => {
      app.navigateToScreen('positions');
      const state = app.getState();
      expect(state.currentScreen).toBe('positions');
    });

    it('should navigate to history screen', () => {
      app.navigateToScreen('history');
      const state = app.getState();
      expect(state.currentScreen).toBe('history');
    });

    it('should navigate to settings screen', () => {
      app.navigateToScreen('settings');
      const state = app.getState();
      expect(state.currentScreen).toBe('settings');
    });

    it('should navigate back to main screen', () => {
      app.navigateToScreen('positions');
      app.navigateToScreen('main');
      const state = app.getState();
      expect(state.currentScreen).toBe('main');
    });

    it('should not navigate if already on the target screen', () => {
      app.navigateToScreen('main');
      const beforeState = app.getState();
      app.navigateToScreen('main');
      const afterState = app.getState();

      expect(beforeState.currentScreen).toBe(afterState.currentScreen);
    });
  });

  describe('Position Management', () => {
    it('should update positions list', () => {
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

      app.updatePositions(positions);
      const state = app.getState();

      expect(state.positions).toHaveLength(2);
      expect(state.positions[0].tokenSymbol).toBe('$TOKEN1');
      expect(state.positions[1].tokenSymbol).toBe('$TOKEN2');
    });

    it('should handle empty positions list', () => {
      app.updatePositions([]);
      const state = app.getState();
      expect(state.positions).toHaveLength(0);
    });
  });

  describe('Opportunity Management', () => {
    it('should show opportunity and navigate to main screen', () => {
      app.navigateToScreen('positions');
      const opportunity = { mint: 'test-mint', symbol: '$TEST' };

      app.showOpportunity(opportunity);
      const state = app.getState();

      expect(state.currentScreen).toBe('main');
      expect(state.selectedOpportunity).toEqual(opportunity);
    });

    it('should clear opportunity when set to null', () => {
      const opportunity = { mint: 'test-mint', symbol: '$TEST' };
      app.showOpportunity(opportunity);
      app.showOpportunity(null);

      const state = app.getState();
      expect(state.selectedOpportunity).toBeNull();
    });
  });

  describe('Application Lifecycle', () => {
    it('should handle graceful shutdown', () => {
      // Note: start() requires actual OpenTUI initialization
      // so we just test that stop() can be called without errors
      expect(() => app.stop()).not.toThrow();
    });

    it('should return correct state after operations', () => {
      app.navigateToScreen('positions');
      app.updatePositions([
        {
          id: 'pos-1',
          mint: 'mint1',
          tokenSymbol: '$TOKEN1',
          entryPrice: 0.001,
          tokensHeld: 100,
          entrySol: 0.1,
          entryTimestamp: new Date(),
          status: 'open' as const,
        },
      ]);

      const state = app.getState();

      expect(state.currentScreen).toBe('positions');
      expect(state.positions).toHaveLength(1);
      expect(state.isRunning).toBe(false);
    });
  });

  describe('Request Render', () => {
    it('should call requestRender without errors', () => {
      // Should not throw even if renderer is not initialized
      expect(() => { app.requestRender(); }).not.toThrow();
    });
  });
});
