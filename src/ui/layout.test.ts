import { describe, it, expect, vi } from 'vitest';
import { createMainLayout } from './layout.js';
import type { AppState } from './app.js';

vi.mock('@opentui/core', () => ({
  Box: vi.fn((options, ...children) => ({
    ...options,
    _type: 'Box',
    children,
  })),
  ScrollBox: vi.fn((options, ...children) => ({
    ...options,
    _type: 'ScrollBox',
    children,
  })),
  Text: vi.fn((options) => ({
    ...options,
    _type: 'Text',
  })),
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

function createState(): AppState {
  return {
    isHelpModalVisible: false,
    isRunning: true,
    dashboard: {
      startedAt: new Date('2026-03-28T10:00:00Z'),
      connectionStatus: 'connected',
      walletBalanceSol: 1.5,
      selectedItemId: 'mint-1',
      toolCalls: 2,
      events: [
        {
          id: 'evt-1',
          itemId: 'mint-1',
          type: 'Tool',
          timestamp: new Date('2026-03-28T10:00:10Z'),
          content: 'Opportunity queued',
        },
      ],
      trackedItems: [
        {
          id: 'mint-1',
          mint: 'mint-1',
          symbol: 'ONE',
          name: 'Token One',
          createdAt: new Date('2026-03-28T10:00:00Z'),
          updatedAt: new Date('2026-03-28T10:00:20Z'),
          stage: 'opportunity queued',
          score: 81,
          confidence: 'high',
          opportunity: {
            id: 'opp-1',
            status: 'pending',
            suggestedAmount: 0.25,
            createdAt: new Date('2026-03-28T10:00:20Z'),
          },
          agentStatuses: {
            'Launch Listener': 'completed',
            'Creator Analyst': 'completed',
            'Technical Analyst': 'completed',
            'Social Analyst': 'completed',
            'Liquidity Analyst': 'completed',
            'Scoring Agent': 'completed',
            'Opportunity Manager': 'completed',
            Trader: 'pending',
            'Position Monitor': 'pending',
          },
          notes: ['Launch detected from Bags restream.'],
          errors: [],
        },
      ],
    },
  };
}

describe('createMainLayout', () => {
  it('creates the root dashboard layout', () => {
    const layout: any = createMainLayout(createState(), mockBotConfig);
    expect(layout.id).toBe('main-layout');
    expect(layout.flexDirection).toBe('column');
    expect(layout.children).toHaveLength(3);
  });

  it('renders dashboard panels in the main content area', () => {
    const layout: any = createMainLayout(createState(), mockBotConfig);
    const mainContent = layout.children[1];

    expect(mainContent.id).toBe('dashboard-main');
    expect(mainContent.children).toHaveLength(2);
    expect(mainContent.children[0].id).toBe('dashboard-upper');
    expect(mainContent.children[1].id).toBe('current-report-panel');
  });
});
