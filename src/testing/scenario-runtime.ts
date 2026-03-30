import { createMixedOpportunitiesSimulationDefinition } from '../simulation/definitions.js';
import { createSimulationRuntime } from '../simulation/runtime.js';
import type { SimulationDefinition, SimulationLaunchDefinition } from '../simulation/types.js';
import type { LaunchSourceConfig } from '../types/config.js';

export type ScenarioLaunch = SimulationLaunchDefinition;
export type ScenarioDefinition = SimulationDefinition;

export interface ScenarioLaunchSourceRuntime {
  scenario: ScenarioDefinition;
  restreamClient: ReturnType<typeof createSimulationRuntime>['restreamClient'];
  filterServiceOverrides: ReturnType<typeof createSimulationRuntime>['filterServiceOverrides'];
  tradeService: ReturnType<typeof createSimulationRuntime>['tradeService'];
  simulationEngine: ReturnType<typeof createSimulationRuntime>['simulationEngine'];
}

export function getScenarioDefinition(name: string): ScenarioDefinition {
  if (name !== 'mixed-opportunities') {
    throw new Error(`Unknown scenario "${name}". Available scenarios: mixed-opportunities`);
  }
  return createMixedOpportunitiesSimulationDefinition();
}

export function listScenarioNames(): string[] {
  return ['mixed-opportunities'];
}

export function createScenarioLaunchSourceRuntime(
  launchSourceConfig: LaunchSourceConfig
): ScenarioLaunchSourceRuntime {
  const scenario = getScenarioDefinition(launchSourceConfig.scenarioName);
  scenario.launchIntervalMs = launchSourceConfig.scenarioIntervalMs;
  const runtime = createSimulationRuntime(scenario);

  return {
    scenario,
    restreamClient: runtime.restreamClient,
    filterServiceOverrides: runtime.filterServiceOverrides,
    tradeService: runtime.tradeService,
    simulationEngine: runtime.simulationEngine,
  };
}
