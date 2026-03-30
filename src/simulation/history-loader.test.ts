import { describe, expect, it } from 'vitest';
import { loadSimulationHistoryDefinition } from './history-loader.js';

describe('loadSimulationHistoryDefinition', () => {
  it('should load a deterministic history simulation file', async () => {
    const definition = await loadSimulationHistoryDefinition(
      'tests/fixtures/simulation-history.sample.json'
    );

    expect(definition.name).toBe('history-smoke');
    expect(definition.loopLaunches).toBe(false);
    expect(definition.launches[0]?.market.kind).toBe('history');
    expect(definition.launches[0]?.market.initialPrice).toBe(0.000002);
  });
});
