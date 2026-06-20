import { readFile } from 'node:fs/promises';
import type { SimulationDefinition } from './types.js';

export async function loadSimulationHistoryDefinition(
  filePath: string
): Promise<SimulationDefinition> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  const candidate = parsed as { launches?: unknown };

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray(candidate.launches) ||
    candidate.launches.length === 0
  ) {
    throw new Error(`Invalid simulation history file: ${filePath}`);
  }

  return parsed as SimulationDefinition;
}
