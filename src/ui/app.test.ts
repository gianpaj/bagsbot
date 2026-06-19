import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenTUIApp, type AppConfig } from './app.js';

let keyHandler: ((event: { name?: string; sequence?: string; raw?: string }) => void) | undefined;
let mockConsole: {
  visible: boolean;
  toggle: ReturnType<typeof vi.fn>;
  onCopySelection?: ((text: string) => void) | undefined;
  keyBindings?: unknown;
};
let mockRenderer: {
  start: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  requestRender: ReturnType<typeof vi.fn>;
  copyToClipboardOSC52: ReturnType<typeof vi.fn>;
  setFrameCallback: ReturnType<typeof vi.fn>;
  removeFrameCallback: ReturnType<typeof vi.fn>;
  keyInput: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  console: typeof mockConsole;
  root: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getChildren: ReturnType<typeof vi.fn>;
    findDescendantById: ReturnType<typeof vi.fn>;
  };
};

let frameCallback: ((deltaTime: number) => Promise<void>) | undefined;
let mockScrollBox: { scrollChildIntoView: ReturnType<typeof vi.fn> };

vi.mock('@opentui/core', () => ({
  ConsolePosition: {
    BOTTOM: 'bottom',
  },
  createCliRenderer: vi.fn(async () => mockRenderer),
  BoxRenderable: vi.fn(function (_ctx, options) {
    return {
      ...options,
      visible: options.visible ?? true,
      add: vi.fn(),
    };
  }),
  TextRenderable: vi.fn(function (_ctx, options) {
    return {
      ...options,
    };
  }),
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
  launchSource: {
    type: 'paper-mainnet' as const,
    scenarioName: 'mixed-opportunities',
    scenarioIntervalMs: 2500,
    disableTrading: false,
  },
  ui: { opportunityTimeoutSec: 30, soundEnabled: true },
};

describe('OpenTUIApp', () => {
  let app: OpenTUIApp;
  let config: AppConfig;

  beforeEach(() => {
    keyHandler = undefined;
    mockConsole = {
      visible: false,
      toggle: vi.fn(() => {
        mockConsole.visible = !mockConsole.visible;
      }),
    };
    frameCallback = undefined;
    mockScrollBox = { scrollChildIntoView: vi.fn() };
    mockRenderer = {
      start: vi.fn(),
      destroy: vi.fn(),
      requestRender: vi.fn(),
      copyToClipboardOSC52: vi.fn(() => true),
      setFrameCallback: vi.fn((cb: (deltaTime: number) => Promise<void>) => {
        frameCallback = cb;
      }),
      removeFrameCallback: vi.fn(() => {
        frameCallback = undefined;
      }),
      keyInput: {
        on: vi.fn((event: string, handler: (key: { name?: string; sequence?: string; raw?: string }) => void) => {
          if (event === 'keypress') {
            keyHandler = handler;
          }
        }),
        off: vi.fn(),
      },
      console: mockConsole,
      root: {
        add: vi.fn(),
        remove: vi.fn(),
        getChildren: vi.fn().mockReturnValue([]),
        findDescendantById: vi.fn((id: string) =>
          id === 'progress-scroll' ? mockScrollBox : undefined
        ),
      },
    };
    config = {
      botConfig: mockBotConfig,
      onBuyOpportunity: vi.fn(),
      onSkipOpportunity: vi.fn(),
      onManualBuy: vi.fn(),
      onQuit: vi.fn(),
    };
    app = new OpenTUIApp(config);
  });

  it('initializes with dashboard state', () => {
    const state = app.getState();
    expect(state.isRunning).toBe(false);
    expect(state.isHelpModalVisible).toBe(false);
    expect(state.dashboard.trackedItems).toHaveLength(0);
    expect(state.dashboard.selectedItemId).toBeNull();
  });

  it('starts and sets up keyboard input', async () => {
    await app.start();
    expect(app.isRunning()).toBe(true);
    expect(keyHandler).toBeTypeOf('function');
    expect(mockConsole.onCopySelection).toBeTypeOf('function');
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

    keyHandler?.({ name: 'j', sequence: 'j', raw: 'j' });
    let state = app.getState();
    expect(state.dashboard.selectedItemId).toBe('mint-1');

    keyHandler?.({ name: 'k', sequence: 'k', raw: 'k' });
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

    keyHandler?.({ name: 'b', sequence: 'b', raw: 'b' });

    expect(config.onBuyOpportunity).toHaveBeenCalledWith('opp-1', 0.2);
  });

  it('toggles the raw log drawer with backtick', async () => {
    await app.start();

    keyHandler?.({ name: '`', sequence: '`', raw: '`' });

    expect(mockConsole.toggle).toHaveBeenCalledTimes(1);
    expect(mockRenderer.requestRender).toHaveBeenCalled();
    expect(mockConsole.visible).toBe(true);
  });

  it('toggles the help modal with question mark', async () => {
    await app.start();

    keyHandler?.({ name: '?', sequence: '?', raw: '?' });
    expect(app.getState().isHelpModalVisible).toBe(true);

    keyHandler?.({ name: '?', sequence: '?', raw: '?' });
    expect(app.getState().isHelpModalVisible).toBe(false);
  });

  it('closes the help modal with escape without quitting the app', async () => {
    await app.start();

    keyHandler?.({ name: '?', sequence: '?', raw: '?' });
    keyHandler?.({ name: '\u001b', sequence: '\u001b', raw: '\u001b' });

    expect(app.getState().isHelpModalVisible).toBe(false);
    expect(config.onQuit).not.toHaveBeenCalled();
  });

  it('closes the help modal with q before allowing quit', async () => {
    await app.start();

    keyHandler?.({ name: '?', sequence: '?', raw: '?' });
    keyHandler?.({ name: 'q', sequence: 'q', raw: 'q' });

    expect(app.getState().isHelpModalVisible).toBe(false);
    expect(config.onQuit).not.toHaveBeenCalled();

    keyHandler?.({ name: 'q', sequence: 'q', raw: 'q' });
    expect(config.onQuit).toHaveBeenCalledTimes(1);
  });

  it('does not trigger dashboard shortcuts while the console drawer is visible', async () => {
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

    mockConsole.visible = true;
    keyHandler?.({ name: 'b', sequence: 'b', raw: 'b' });
    keyHandler?.({ name: 'j', sequence: 'j', raw: 'j' });

    expect(config.onBuyOpportunity).not.toHaveBeenCalled();
    expect(app.getState().dashboard.selectedItemId).toBe('mint-1');
  });

  it('does not trigger dashboard shortcuts while the help modal is visible', async () => {
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

    keyHandler?.({ name: '?', sequence: '?', raw: '?' });
    keyHandler?.({ name: 'b', sequence: 'b', raw: 'b' });
    keyHandler?.({ name: 'j', sequence: 'j', raw: 'j' });

    expect(config.onBuyOpportunity).not.toHaveBeenCalled();
    expect(app.getState().dashboard.selectedItemId).toBe('mint-1');
    expect(config.onQuit).not.toHaveBeenCalled();
  });

  it('force-buys the selected token in paper mode when there is no opportunity', async () => {
    await app.start();
    // Tracked but never produced an opportunity (e.g. filtered out).
    app.trackLaunch({ mint: 'mint-9', creator: 'creator-9', name: 'Filtered Token', symbol: 'FILT' });

    keyHandler?.({ name: 'b', sequence: 'b', raw: 'b' });

    expect(config.onManualBuy).toHaveBeenCalledWith({
      mint: 'mint-9',
      symbol: 'FILT',
      name: 'Filtered Token',
    });
    expect(config.onBuyOpportunity).not.toHaveBeenCalled();
  });

  it('scrolls the selected progress card into view when navigating', async () => {
    await app.start();
    app.trackLaunch({ mint: 'mint-1', creator: 'creator-1', name: 'Token One', symbol: 'ONE' });
    app.trackLaunch({ mint: 'mint-2', creator: 'creator-2', name: 'Token Two', symbol: 'TWO' });

    // Navigate to register the frame callback that performs the scroll.
    keyHandler?.({ name: 'j', sequence: 'j', raw: 'j' });
    expect(mockRenderer.setFrameCallback).toHaveBeenCalled();
    expect(frameCallback).toBeTypeOf('function');

    // Geometry is only valid after layout, so the scroll runs from the frame.
    await frameCallback?.(16);
    expect(mockRenderer.root.findDescendantById).toHaveBeenCalledWith('progress-scroll');
    expect(mockScrollBox.scrollChildIntoView).toHaveBeenCalledWith(
      `progress-item-${app.getState().dashboard.selectedItemId ?? ''}`
    );
  });

  it('stops re-attempting the scroll and unregisters after a few frames', async () => {
    await app.start();
    app.trackLaunch({ mint: 'mint-1', creator: 'creator-1', name: 'Token One', symbol: 'ONE' });
    keyHandler?.({ name: 'j', sequence: 'j', raw: 'j' });

    // Three attempts, then the callback removes itself.
    await frameCallback?.(16);
    await frameCallback?.(16);
    await frameCallback?.(16);
    expect(mockScrollBox.scrollChildIntoView).toHaveBeenCalledTimes(3);
    expect(mockRenderer.removeFrameCallback).toHaveBeenCalled();
  });
});
