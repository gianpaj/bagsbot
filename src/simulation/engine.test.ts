import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketSimulationEngine } from './engine.js';
import type { Position } from '../types/positions.js';
import type { PositionManager } from '../positions/manager.js';
import type { ExitMonitor } from '../exits/monitor.js';
import type { SimulationDefinition } from './types.js';

describe('MarketSimulationEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should update open positions with generated market prices', async () => {
    const definition: SimulationDefinition = {
      name: 'engine-test',
      description: 'single launch simulation',
      launchIntervalMs: 1000,
      marketTickMs: 1000,
      loopLaunches: false,
      launches: [
        {
          id: 'launch-1',
          label: 'Engine Test',
          kind: 'generated',
          launch: {
            mint: 'Mint11111111111111111111111111111111111111111',
            creator: 'Creator1111111111111111111111111111111111111',
            name: 'Engine Test',
            symbol: 'ENG',
          },
          creator: {},
          social: {},
          liquidity: {},
          market: {
            kind: 'generated',
            initialPrice: 0.000001,
            driftPct: 5,
            volatilityPct: 0,
            pumpChance: 0,
            pumpMagnitudePct: 0,
            crashChance: 0,
            crashMagnitudePct: 0,
            minPrice: 0.0000001,
            maxPrice: 0.00001,
          },
        },
      ],
    };
    const openPosition: Position = {
      id: 'position-1',
      mint: 'Mint11111111111111111111111111111111111111111',
      tokenSymbol: 'ENG',
      entryPrice: 0.000001,
      tokensHeld: 1000,
      entrySol: 0.001,
      entryTimestamp: new Date(),
      status: 'open',
    };
    const updatePositionPrice = vi.fn((id: string, currentPrice: number) => {
      if (id === openPosition.id) {
        openPosition.currentPrice = currentPrice;
        openPosition.currentValue = currentPrice * openPosition.tokensHeld;
        openPosition.pnlPercent =
          ((openPosition.currentValue - openPosition.entrySol) / openPosition.entrySol) * 100;
      }
    });
    const getPosition = vi.fn((id: string) => (id === openPosition.id ? openPosition : null));
    const updatePosition = vi.fn();
    const onPositionsUpdated = vi.fn();
    const engine = new MarketSimulationEngine(definition, () => 0.5);

    engine.start({
      positionManager: {
        getOpenPositions: vi.fn(() => [openPosition]),
        updatePositionPrice,
        getPosition,
      } as unknown as PositionManager,
      exitMonitor: {
        updatePosition,
      } as unknown as ExitMonitor,
      onPositionsUpdated,
    });
    engine.activateLaunch(openPosition.mint);

    await vi.advanceTimersByTimeAsync(1000);

    expect(updatePositionPrice).toHaveBeenCalledWith(openPosition.id, 0.00000105);
    expect(updatePosition).toHaveBeenCalled();
    expect(onPositionsUpdated).toHaveBeenCalled();

    engine.stop();
  });
});
