/**
 * Tests for Main Screen
 */

 
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMainScreen, type MainScreenConfig } from './main.js';
import type { BotConfig, LaunchpadLaunchEvent, Position } from '../../types/index.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

// Mock components
vi.mock('../components/index.js', () => ({
  createHeader: vi.fn(() => ({ id: 'header' })),
  createOpportunityCard: vi.fn(() => ({ id: 'opportunity-card' })),
  createPositionList: vi.fn(() => ({ id: 'position-list' })),
  createActionBar: vi.fn(() => ({ id: 'action-bar' })),
}));

describe('main screen', () => {
  let mockBotConfig: BotConfig;
  let mockOpportunity: LaunchpadLaunchEvent;
  let mockPosition: Position;

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

    mockOpportunity = {
      mint: 'EPjFWaLb3odcccccccccccccccccccccccccccccccc',
      creator: 'CreatorAddressHerexxxxxxxxxxxxxxxxxxxxxxxxx',
      name: 'Test Token',
      symbol: 'TEST',
      description: 'A test token',
      image: 'https://example.com/image.png',
    };

    mockPosition = {
      id: 'pos-1',
      mint: mockOpportunity.mint,
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

  it('should create main screen with opportunity', () => {
    const config: MainScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      currentOpportunity: mockOpportunity,
      positions: [mockPosition],
      botConfig: mockBotConfig,
    };

    const screen = createMainScreen(config);

    expect(screen).toBeDefined();
    expect(screen).toHaveProperty('id', 'main-screen');
  });

  it('should create main screen without opportunity', () => {
    const config: MainScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      currentOpportunity: null,
      positions: [],
      botConfig: mockBotConfig,
    };

    const screen = createMainScreen(config);

    expect(screen).toBeDefined();
    expect(screen).toHaveProperty('id', 'main-screen');
  });

  it('should create main screen with disconnected status', () => {
    const config: MainScreenConfig = {
      isConnected: false,
      walletBalance: 0,
      currentOpportunity: mockOpportunity,
      positions: [],
      botConfig: mockBotConfig,
    };

    const screen = createMainScreen(config);

    expect(screen).toBeDefined();
  });

  it('should create main screen with multiple positions', () => {
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

    const config: MainScreenConfig = {
      isConnected: true,
      walletBalance: 10,
      currentOpportunity: mockOpportunity,
      positions,
      botConfig: mockBotConfig,
    };

    const screen = createMainScreen(config);

    expect(screen).toBeDefined();
  });

  it('should have flexDirection column for vertical layout', () => {
    const config: MainScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      currentOpportunity: mockOpportunity,
      positions: [],
      botConfig: mockBotConfig,
    };

    const screen: any = createMainScreen(config);

    expect(
       
      screen.flexDirection
    ).toBe('column');
  });

  it('should handle empty positions array', () => {
    const config: MainScreenConfig = {
      isConnected: true,
      walletBalance: 5.5,
      currentOpportunity: mockOpportunity,
      positions: [],
      botConfig: mockBotConfig,
    };

    const screen = createMainScreen(config);

    expect(screen).toBeDefined();
  });
});
