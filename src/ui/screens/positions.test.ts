/**
 * Tests for Positions Screen
 */

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPositionsScreen, type PositionsScreenConfig } from './positions.js';
import type { BotConfig, Position } from '../../types/index.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

// Mock components
vi.mock('../components/index.js', () => ({
  createHeader: vi.fn(() => ({ id: 'header' })),
  createPositionList: vi.fn(() => ({ id: 'position-list' })),
  createActionBar: vi.fn(() => ({ id: 'action-bar' })),
}));

describe('positions screen', () => {
  let mockBotConfig: BotConfig;
  let mockPosition: Position;

  beforeEach(() => {
    mockBotConfig = {
      bagsApiKey: 'test-key',
      solanaRpcUrl: 'http://localhost:8899',
      walletPath: '/tmp/wallet.json',
      maxPositionPercent: 0.1,
      maxOpenPositions: 5,
      filters: {
        creator: { minFollowers: 100, maxHoldersPercent: 50 },
        technical: { minPriceMomentum: 0.5, minVolumeMomentum: 1.0 },
        social: { minTwitterFollowers: 1000, minTwitterCreationAgeDays: 30 },
        liquidity: { minInitialLiquiditySol: 5, minCurveFillPercent: 5 },
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

    mockPosition = {
      id: 'pos-1',
      mint: 'EPjFWaLb3odcccccccccccccccccccccccccccccccc',
      tokenSymbol: 'TEST',
      entryPrice: 0.001,
      tokensHeld: 10000,
      entrySol: 10,
      entryTimestamp: new Date(),
      currentPrice: 0.002,
      currentValue: 20,
      pnlPercent: 100,
      status: 'open',
    };
  });

  it('should create positions screen with positions', () => {
    const config: PositionsScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      positions: [mockPosition],
      botConfig: mockBotConfig,
    };

    const screen = createPositionsScreen(config);

    expect(screen).toBeDefined();
    expect(screen).toHaveProperty('id', 'positions-screen');
  });

  it('should create positions screen without positions', () => {
    const config: PositionsScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      positions: [],
      botConfig: mockBotConfig,
    };

    const screen = createPositionsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should create positions screen with multiple positions', () => {
    const positions: Position[] = [
      mockPosition,
      {
        ...mockPosition,
        id: 'pos-2',
        tokenSymbol: 'TEST2',
        pnlPercent: -25,
        currentValue: 7.5,
      },
      {
        ...mockPosition,
        id: 'pos-3',
        tokenSymbol: 'TEST3',
        pnlPercent: 50,
        currentValue: 15,
      },
    ];

    const config: PositionsScreenConfig = {
      isConnected: true,
      walletBalance: 20,
      positions,
      botConfig: mockBotConfig,
    };

    const screen = createPositionsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle disconnected state', () => {
    const config: PositionsScreenConfig = {
      isConnected: false,
      walletBalance: 0,
      positions: [mockPosition],
      botConfig: mockBotConfig,
    };

    const screen = createPositionsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should have flexDirection column for vertical layout', () => {
    const config: PositionsScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      positions: [mockPosition],
      botConfig: mockBotConfig,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const screen: any = createPositionsScreen(config);

    expect(screen.flexDirection).toBe('column');
  });

  it('should handle positions with profit', () => {
    const profitPosition: Position = {
      ...mockPosition,
      pnlPercent: 250,
      currentValue: 35,
    };

    const config: PositionsScreenConfig = {
      isConnected: true,
      walletBalance: 50,
      positions: [profitPosition],
      botConfig: mockBotConfig,
    };

    const screen = createPositionsScreen(config);

    expect(screen).toBeDefined();
  });

  it('should handle positions with loss', () => {
    const lossPosition: Position = {
      ...mockPosition,
      pnlPercent: -50,
      currentValue: 5,
    };

    const config: PositionsScreenConfig = {
      isConnected: true,
      walletBalance: 20,
      positions: [lossPosition],
      botConfig: mockBotConfig,
    };

    const screen = createPositionsScreen(config);

    expect(screen).toBeDefined();
  });
});
