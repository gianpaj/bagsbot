/**
 * Launch source factory.
 *
 * Selects either the live Bags restream or a synthetic scenario source.
 *
 * @module sdk/launch-source
 */

import type { IRestreamClient } from '../listeners/restream.js';
import type { SimulationEngine } from '../simulation/index.js';
import { createScenarioLaunchSourceRuntime } from '../testing/scenario-runtime.js';
import type { IBagsTradeService } from '../trading/executor.js';
import type { BotConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { createRestreamClient } from './restream-client.js';
import type { FilterServiceOverrides } from './filter-registry.js';

const launchSourceLogger = logger.child({ module: 'launch-source' });

export interface LaunchSourceRuntime {
  restreamClient: IRestreamClient;
  filterServiceOverrides?: FilterServiceOverrides;
  tradeService?: IBagsTradeService;
  simulationEngine?: SimulationEngine;
  description: string;
}

export function createLaunchSourceRuntime(config: BotConfig): LaunchSourceRuntime {
  if (config.launchSource.type === 'scenario') {
    const runtime = createScenarioLaunchSourceRuntime(config.launchSource);
    launchSourceLogger.info('Using scenario launch source', {
      scenario: runtime.scenario.name,
      intervalMs: config.launchSource.scenarioIntervalMs,
      disableTrading: config.launchSource.disableTrading,
    });
    return {
      restreamClient: runtime.restreamClient,
      filterServiceOverrides: runtime.filterServiceOverrides,
      tradeService: runtime.tradeService,
      simulationEngine: runtime.simulationEngine,
      description: `scenario:${runtime.scenario.name}`,
    };
  }

  launchSourceLogger.info('Using live Bags restream');
  return {
    restreamClient: createRestreamClient({
      apiKey: config.bagsApiKey,
    }),
    description: 'live',
  };
}
