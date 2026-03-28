import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenTUIApp, type AppConfig } from './app.js';

let keyHandler: ((data: Buffer) => void) | undefined;

vi.mock('@opentui/core', () => ({
  createCliRenderer: vi.fn().mockResolvedValue({
    add: vi.fn(),
    remove: vi.fn(),
    destroy: vi.fn(),
    requestRender: vi.fn(),
    on: vi.fn((event: string, handler: (data: Buffer) => void) => {
      if (event === 'key') {
        keyHandler = handler;
      }
    }),
  }),
  RootRenderable: vi.fn(
    class {
      add = vi.fn();
      remove = vi.fn();
      getChildren = vi.fn().mockReturnValue([]);
    }
  ),
}));

vi.mock('./layout.js', () => ({
  createMainLayout: vi.fn(() => ({ id: 'main-layout' })),
}));

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

const mockBotConfig = {
  bagsApiKey: 'test-key',
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  walletPath: '/path/to/wallet.json',
  maxPositionPercent: 10,
  maxOpenPositions: 5,
  filters: {
    creator: { requireVerifiedSocial: true, minFollowerCount: 100, minAccountAgeDays: 30, checkPreviousLaunches: true },
    technical: { requireCompleteMetadata: true, requireDescription: true, requireSocialLinks: true, validateImageUrl: true },
    social: { checkTwitterMentions: true, checkTelegramGroup: true, minCommunitySize: 1000 },
    liquidity: { minInitialLiquiditySol: 5, maxBondingCurvePercent: 50, maxTopHolderPercent: 30 },
  },
  scoring: {
    weights: { creator: 0.25, technical: 0.25, social: 0.25, liquidity: 0.25 },
    minScoreToAlert: 60,
    minScoreForHighConfidence: 75,
  },
  trading: { slippageBps: 500, priorityFeeLamports: 100000, maxRetries: 3 },
  exits: { takeProfitPercent: 900, stopLossPercent: -50, checkIntervalMs: 5000, autoSellEnabled: false },
  ui: { opportunityTimeoutSec: 30, soundEnabled: true },
};

describe('OpenTUIApp', () => {
  let app: OpenTUIApp;
  let config: AppConfig;

  beforeEach(() => {
    keyHandler = undefined;
    config = {
      botConfig: mockBotConfig,
      onBuyOpportunity: vi.fn(),
      onSkipOpportunity: vi.fn(),
      onQuit: vi.fn(),
    };
    app = new OpenTUIApp(config);
  });

  it('initializes with dashboard state', () => {
    const state = app.getState();
    expect(state.isRunning).toBe(false);
    expect(state.dashboard.trackedItems).toHaveLength(0);
    expect(state.dashboard.selectedItemId).toBeNull();
  });

  it('starts and sets up keyboard input', async () => {
    await app.start();
    expect(app.isRunning()).toBe(true);
    expect(keyHandler).toBeTypeOf('function');
  });

  it('tracks launches and selects the newest item by default', () => {
    app.trackLaunch({
      mint: 'mint-1',
      creator: 'creator-1',
      name: 'Token One',
      symbol: 'ONE',
    });

    const state = app.getState();
    expect(state.dashboard.trackedItems).toHaveLength(1);
    expect(state.dashboard.selectedItemId).toBe('mint-1');
  });

  it('moves selection with keyboard input', async () => {
    await app.start();
    app.trackLaunch({
      mint: 'mint-1',
      creator: 'creator-1',
      name: 'Token One',
      symbol: 'ONE',
    });
    app.trackLaunch({
      mint: 'mint-2',
      creator: 'creator-2',
      name: 'Token Two',
      symbol: 'TWO',
    });

    keyHandler?.(Buffer.from('j'));
    let state = app.getState();
    expect(state.dashboard.selectedItemId).toBe('mint-1');

    keyHandler?.(Buffer.from('k'));
    state = app.getState();
    expect(state.dashboard.selectedItemId).toBe('mint-2');
  });

  it('sends buy action for the selected pending opportunity', async () => {
    await app.start();
    app.trackLaunch({
      mint: 'mint-1',
      creator: 'creator-1',
      name: 'Token One',
      symbol: 'ONE',
    });
    app.showOpportunity({
      id: 'opp-1',
      launch: {
        mint: 'mint-1',
        creator: 'creator-1',
        name: 'Token One',
        symbol: 'ONE',
      },
      filterResult: {
        launch: {
          mint: 'mint-1',
          creator: 'creator-1',
          name: 'Token One',
          symbol: 'ONE',
        },
        totalScore: 82,
        passed: true,
        filters: {
          creator: { passed: true, score: 80, details: 'good' },
          technical: { passed: true, score: 81, details: 'good' },
          social: { passed: true, score: 82, details: 'good' },
          liquidity: { passed: true, score: 83, details: 'good' },
        },
        timestamp: new Date(),
      },
      suggestedAmount: 0.2,
      timestamp: new Date(),
      status: 'pending',
    });

    keyHandler?.(Buffer.from('b'));

    expect(config.onBuyOpportunity).toHaveBeenCalledWith('opp-1', 0.2);
  });
});
