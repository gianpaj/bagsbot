import { describe, expect, it, vi } from 'vitest';
import { Connection } from '@solana/web3.js';
import { createMixedOpportunitiesSimulationDefinition } from './definitions.js';
import { MarketSimulationEngine } from './engine.js';
import { SimulationTradeService } from './trade-service.js';
import { TradeExecutor } from '../trading/executor.js';
import type { WalletManager } from '../trading/wallet.js';

describe('SimulationTradeService', () => {
  it('should execute a paper trade without signing or sending a real transaction', async () => {
    const definition = createMixedOpportunitiesSimulationDefinition();
    const launch = definition.launches[0];
    expect(launch).toBeDefined();

    const engine = new MarketSimulationEngine(definition, () => 0.5);
    engine.activateLaunch(launch?.launch.mint ?? '');

    const walletManager = {
      sign: vi.fn(() => {
        throw new Error('sign should not be called for simulated trades');
      }),
    } as unknown as WalletManager;
    const tradeService = new SimulationTradeService(engine);
    const executor = new TradeExecutor(
      tradeService,
      walletManager,
      {} as Connection,
      { maxRetries: 0 }
    );

    const prepared = await executor.prepareSwap(launch?.launch.mint ?? '', 0.1);
    const result = await executor.executeSwap(prepared);

    expect(result.success).toBe(true);
    expect(result.signature).toMatch(/^SIM-/);
    expect(result.tokensReceived).toBeGreaterThan(0);
    expect(result.executedPrice).toBeGreaterThan(0);
    expect((walletManager.sign as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
