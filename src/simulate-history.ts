import { loadSimulationHistoryDefinition } from './simulation/history-loader.js';
import { startSimulation } from './simulation/start.js';

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (filePath === undefined || filePath.trim() === '') {
    throw new Error('Usage: bun run simulate:history -- <file>');
  }

  const definition = await loadSimulationHistoryDefinition(filePath);
  await startSimulation(definition);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Failed to start history simulation:', message);
  process.exit(1);
});
