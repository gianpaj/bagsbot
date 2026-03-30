import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioLaunchSourceRuntime, listScenarioNames } from './scenario-runtime.js';

describe('scenario-runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expose the bundled mixed-opportunities scenario', () => {
    expect(listScenarioNames()).toContain('mixed-opportunities');
  });

  it('should emit launches in order and loop back to the first one', async () => {
    const runtime = createScenarioLaunchSourceRuntime({
      type: 'scenario',
      scenarioName: 'mixed-opportunities',
      scenarioIntervalMs: 1000,
      disableTrading: true,
    });
    const launches: string[] = [];

    runtime.restreamClient.subscribeBagsLaunches((launch) => {
      launches.push(launch.symbol);
    });

    await runtime.restreamClient.connect();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1);

    expect(launches.slice(0, 5)).toEqual(['ALPHA', 'BETA', 'GHOST', 'DRAIN', 'ALPHA']);
  });

  it('should provide matching synthetic liquidity and creator data', async () => {
    const runtime = createScenarioLaunchSourceRuntime({
      type: 'scenario',
      scenarioName: 'mixed-opportunities',
      scenarioIntervalMs: 1000,
      disableTrading: true,
    });
    const alpha = runtime.scenario.launches[0];

    expect(alpha).toBeDefined();

    const liquidity = await runtime.filterServiceOverrides.liquidityDataService?.getLiquidityData(
      alpha?.launch.mint ?? ''
    );
    const verifiedWallet =
      await runtime.filterServiceOverrides.stateService?.getLaunchWalletForTwitterUsername(
        alpha?.creator.twitterUsername ?? ''
      );

    expect(liquidity).toMatchObject({
      initialLiquiditySol: 3.2,
      bondingCurvePercent: 24,
      topHolderPercent: 9,
    });
    expect(verifiedWallet?.toString()).toBe(alpha?.launch.creator);
  });
});
