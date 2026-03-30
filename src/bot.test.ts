import { afterEach, describe, expect, it, vi } from 'vitest';
import { BagsBot } from './bot.js';
import {
  DEFAULT_CREATOR_FILTER,
  DEFAULT_EXIT_CONFIG,
  DEFAULT_LAUNCH_SOURCE_CONFIG,
  DEFAULT_LIQUIDITY_FILTER,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_SOCIAL_FILTER,
  DEFAULT_TECHNICAL_FILTER,
  DEFAULT_TRADING_CONFIG,
  DEFAULT_UI_CONFIG,
} from './config/defaults.js';
import { createFilterRegistry } from './sdk/filter-registry.js';
import { createScenarioLaunchSourceRuntime } from './testing/scenario-runtime.js';
import type { BotConfig } from './types/config.js';
import type { IBagsTradeService } from './trading/executor.js';

describe('BagsBot scenario mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should block trade execution for scenario launches', async () => {
    const config: BotConfig = {
      bagsApiKey: 'test-api-key',
      solanaRpcUrl: 'https://api.testnet.solana.com',
      walletPath: '/tmp/test-wallet.json',
      maxPositionPercent: 2,
      maxOpenPositions: 10,
      filters: {
        creator: { ...DEFAULT_CREATOR_FILTER },
        technical: {
          ...DEFAULT_TECHNICAL_FILTER,
          validateImageUrl: false,
        },
        social: { ...DEFAULT_SOCIAL_FILTER },
        liquidity: { ...DEFAULT_LIQUIDITY_FILTER },
      },
      scoring: { ...DEFAULT_SCORING_CONFIG },
      trading: { ...DEFAULT_TRADING_CONFIG },
      exits: { ...DEFAULT_EXIT_CONFIG },
      launchSource: {
        ...DEFAULT_LAUNCH_SOURCE_CONFIG,
        type: 'scenario',
      },
      ui: { ...DEFAULT_UI_CONFIG, headless: true },
    };
    const scenarioRuntime = createScenarioLaunchSourceRuntime(config.launchSource);
    const tradeService: IBagsTradeService = {
      getQuote: vi.fn(),
      prepareSwap: vi.fn(),
      sendAndConfirmTransaction: vi.fn(),
    };

    const filterRegistry = createFilterRegistry(
      config,
      {} as never,
      scenarioRuntime.filterServiceOverrides
    );
    const bot = new BagsBot({
      config,
      restreamClient: {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        subscribeBagsLaunches: vi.fn(() => () => undefined),
      },
      bagsTradeService: tradeService,
      filterRegistry,
    });

    const launch = scenarioRuntime.scenario.launches[0]?.launch;
    expect(launch).toBeDefined();

    await bot['handleLaunchEvent'](launch);

    const alertSystem = bot['alertSystem'];
    const currentOpportunity = alertSystem.getCurrentOpportunity();
    expect(currentOpportunity).not.toBeNull();

    await bot.handleOpportunityConfirmation(
      currentOpportunity?.id ?? '',
      currentOpportunity?.suggestedAmount ?? 0
    );

    expect(tradeService.prepareSwap).not.toHaveBeenCalled();
    expect(alertSystem.getCurrentOpportunity()?.id).toBe(currentOpportunity?.id);

    alertSystem.destroy();
  });
});
