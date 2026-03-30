import { createMixedOpportunitiesSimulationDefinition } from './simulation/definitions.js';
import { startSimulation } from './simulation/start.js';

startSimulation(createMixedOpportunitiesSimulationDefinition()).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Failed to start simulation:', message);
  process.exit(1);
});
