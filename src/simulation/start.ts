import { BagsSDK } from '@bagsfm/bags-sdk';
import { loadConfig } from '../config/loader.js';
import { createBagsBot } from '../bot.js';
import { createFilterRegistry } from '../sdk/index.js';
import type { SimulationDefinition } from './types.js';
import { createSimulationRuntime } from './runtime.js';
import { logger } from '../utils/logger.js';

const simulationStartLogger = logger.child({ module: 'simulation-start' });

export async function startSimulation(definition: SimulationDefinition): Promise<void> {
  const config = await loadConfig();
  const runtime = createSimulationRuntime(definition);
  const simulationConfig = {
    ...config,
    launchSource: {
      ...config.launchSource,
      type: 'scenario' as const,
      scenarioName: definition.name,
      scenarioIntervalMs: definition.launchIntervalMs,
      disableTrading: false,
    },
  };

  simulationStartLogger.info('Starting market simulation', {
    simulation: definition.name,
    launchCount: definition.launches.length,
    launchIntervalMs: definition.launchIntervalMs,
    marketTickMs: definition.marketTickMs,
  });

  const filterRegistry = createFilterRegistry(
    simulationConfig,
    {} as BagsSDK,
    runtime.filterServiceOverrides
  );

  const bot = createBagsBot({
    config: simulationConfig,
    restreamClient: runtime.restreamClient,
    bagsTradeService: runtime.tradeService,
    filterRegistry,
    simulationEngine: runtime.simulationEngine,
  });

  await bot.initialize();

  simulationStartLogger.info('='.repeat(50));
  simulationStartLogger.info('Market simulation is now running');
  simulationStartLogger.info('Press Ctrl+C to exit');
  simulationStartLogger.info('='.repeat(50));

  await new Promise<void>((resolve) => {
    const handleShutdown = (): void => {
      resolve();
    };

    process.once('SIGINT', handleShutdown);
    process.once('SIGTERM', handleShutdown);
  });
}
