/**
 * Tests for History Screen
 */

 
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createHistoryScreen,
  type HistoryScreenConfig,
  type TradeRecord,
} from './history.js';
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

describe('history screen', () => {
  let mockBotConfig: BotConfig;
  let mockTradeRecord: TradeRecord;

  beforeEach(() => {
    mockBotConfig = {
      bagsApiKey: 'test-key',
      solanaRpcUrl: 'http://localhost:8899',
      walletPath: '/tmp/wallet.json',
      maxPositionPercent: 0.1,
      maxOpenPositions: 5,
      filters: {
        creator: {
          requireVerifiedSocial: true,
          minFollowerCount: 100,
          minAccountAgeDays: 30,
          checkPreviousLaunches: true,
        },
        technical: {
          requireCompleteMetadata: true,
          requireDescription: true,
          requireSocialLinks: true,
          validateImageUrl: true,
        },
        social: {
          checkTwitterMentions: true,
          checkTelegramGroup: true,
          minCommunitySize: 1000,
        },
        liquidity: {
          minInitialLiquiditySol: 5,
          maxBondingCurvePercent: 50,
          maxTopHolderPercent: 30,
        },
      },
      scoring: {
        weights: { creator: 0.25, technical: 0.25, social: 0.25, liquidity: 0.25 },
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

    mockTradeRecord = {
      id: 'trade-1',
      tokenSymbol: 'TEST',
      action: 'buy',
      amountSol: 10,
      pricePerToken: 0.001,
      tokensAmount: 10000,
      status: 'confirmed',
      pnl: 5,
      pnlPercent: 50,
      timestamp: new Date(),
    };
  });

  it('should create history screen with trades', () => {
    const config: HistoryScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      tradeHistory: [mockTradeRecord],
      botConfig: mockBotConfig,
    };

    const screen = createHistoryScreen(config);

    expect(screen).toBeDefined();
    expect(screen).toHaveProperty('id', 'history-screen');
  });

  it('should create history screen without trades', () => {
    const config: HistoryScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      tradeHistory: [],
      botConfig: mockBotConfig,
    };

    const screen = createHistoryScreen(config);

    expect(screen).toBeDefined();
  });

  it('should create history screen with multiple trades', () => {
    const trades: TradeRecord[] = [
      mockTradeRecord,
      {
        ...mockTradeRecord,
        id: 'trade-2',
        tokenSymbol: 'TEST2',
        status: 'confirmed',
        pnl: -2.5,
        pnlPercent: -25,
      },
      {
        ...mockTradeRecord,
        id: 'trade-3',
        tokenSymbol: 'TEST3',
        status: 'rejected',
        pnl: undefined,
        pnlPercent: undefined,
      },
    ];

    const config: HistoryScreenConfig = {
      isConnected: true,
      walletBalance: 15,
      tradeHistory: trades,
      botConfig: mockBotConfig,
    };

    const screen = createHistoryScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle disconnected state', () => {
    const config: HistoryScreenConfig = {
      isConnected: false,
      walletBalance: 0,
      tradeHistory: [mockTradeRecord],
      botConfig: mockBotConfig,
    };

    const screen = createHistoryScreen(config);

    expect(screen).toBeDefined();
  });

  it('should have flexDirection column for vertical layout', () => {
    const config: HistoryScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      tradeHistory: [mockTradeRecord],
      botConfig: mockBotConfig,
    };

    const screen: any = createHistoryScreen(config);

    expect(
       
      screen.flexDirection
    ).toBe('column');
  });

  it('should handle trades with different statuses', () => {
    const trades: TradeRecord[] = [
      { ...mockTradeRecord, status: 'confirmed' },
      { ...mockTradeRecord, id: 'trade-2', status: 'rejected' },
      { ...mockTradeRecord, id: 'trade-3', status: 'expired' },
      { ...mockTradeRecord, id: 'trade-4', status: 'pending' },
    ];

    const config: HistoryScreenConfig = {
      isConnected: true,
      walletBalance: 20,
      tradeHistory: trades,
      botConfig: mockBotConfig,
    };

    const screen = createHistoryScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle trades with different actions', () => {
    const trades: TradeRecord[] = [
      { ...mockTradeRecord, action: 'buy' },
      { ...mockTradeRecord, id: 'trade-2', action: 'sell' },
      { ...mockTradeRecord, id: 'trade-3', action: 'exit' },
    ];

    const config: HistoryScreenConfig = {
      isConnected: true,
      walletBalance: 20,
      tradeHistory: trades,
      botConfig: mockBotConfig,
    };

    const screen = createHistoryScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle trades with profit and loss', () => {
    const trades: TradeRecord[] = [
      { ...mockTradeRecord, pnl: 10, pnlPercent: 100 },
      { ...mockTradeRecord, id: 'trade-2', pnl: -5, pnlPercent: -50 },
      { ...mockTradeRecord, id: 'trade-3', pnl: 0, pnlPercent: 0 },
    ];

    const config: HistoryScreenConfig = {
      isConnected: true,
      walletBalance: 20,
      tradeHistory: trades,
      botConfig: mockBotConfig,
    };

    const screen = createHistoryScreen(config);

    expect(screen).toBeDefined();
  });
});
