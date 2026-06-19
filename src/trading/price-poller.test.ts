import { describe, expect, it, vi } from 'vitest';
import { PaperPricePoller } from './price-poller.js';
import type { IBagsTradeService } from './executor.js';
import type { PositionManager } from '../positions/manager.js';
import type { ExitMonitor } from '../exits/monitor.js';
import type { Position } from '../types/positions.js';

const TEST_MINT = 'EPjFWaLb3odcccccccccccccccccccccccccccccccc';

function createPosition(): Position {
  return {
    id: 'pos-1',
    mint: TEST_MINT,
    tokenSymbol: 'TEST',
    entryPrice: 0.0001,
    tokensHeld: 1_000,
    entrySol: 0.1,
    entryTimestamp: new Date(),
    status: 'open',
  };
}

describe('PaperPricePoller', () => {
  it('derives current price from a live quote and feeds the exit monitor', async () => {
    const position = createPosition();

    // 0.1 SOL probe -> 500 tokens implies a current price of 0.0002 SOL/token.
    const tradeService = {
      getQuote: vi.fn(async () => ({
        inputAmount: 100_000_000,
        expectedOutput: 500,
        priceImpact: 0.01,
        route: 'LIVE/jup',
      })),
      prepareSwap: vi.fn(),
      sendAndConfirmTransaction: vi.fn(),
    } as unknown as IBagsTradeService;

    const updatePositionPrice = vi.fn();
    const positionManager = {
      getOpenPositions: vi.fn(() => [position]),
      updatePositionPrice,
      getPosition: vi.fn(() => position),
    } as unknown as PositionManager;

    const updatePosition = vi.fn();
    const exitMonitor = { updatePosition } as unknown as ExitMonitor;
    const onPositionsUpdated = vi.fn();

    const poller = new PaperPricePoller(tradeService, 10_000);
    poller.start({ positionManager, exitMonitor, onPositionsUpdated });

    await vi.waitFor(() => {
      expect(updatePositionPrice).toHaveBeenCalled();
    });
    poller.stop();

    expect(updatePositionPrice).toHaveBeenCalledWith('pos-1', 0.0002);
    expect(updatePosition).toHaveBeenCalledWith(position);
    expect(onPositionsUpdated).toHaveBeenCalled();
  });

  it('skips a position when its quote fails', async () => {
    const position = createPosition();
    const tradeService = {
      getQuote: vi.fn(async () => {
        throw new Error('rpc down');
      }),
      prepareSwap: vi.fn(),
      sendAndConfirmTransaction: vi.fn(),
    } as unknown as IBagsTradeService;

    const updatePositionPrice = vi.fn();
    const positionManager = {
      getOpenPositions: vi.fn(() => [position]),
      updatePositionPrice,
      getPosition: vi.fn(() => position),
    } as unknown as PositionManager;
    const exitMonitor = { updatePosition: vi.fn() } as unknown as ExitMonitor;

    const poller = new PaperPricePoller(tradeService, 10_000);
    poller.start({ positionManager, exitMonitor });

    await vi.waitFor(() => {
      expect(tradeService.getQuote as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });
    poller.stop();

    expect(updatePositionPrice).not.toHaveBeenCalled();
  });
});
