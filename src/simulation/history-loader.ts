import { readFile } from 'node:fs/promises';
import type { SimulationDefinition } from './types.js';

export async function loadSimulationHistoryDefinition(
  filePath: string
): Promise<SimulationDefinition> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as SimulationDefinition;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray(parsed.launches) ||
    parsed.launches.length === 0
  ) {
    throw new Error(`Invalid simulation history file: ${filePath}`);
  }

  return parsed;
}
