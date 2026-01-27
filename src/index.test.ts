import { describe, it, expect } from 'vitest';

describe('BagsBot', () => {
  it('should pass basic sanity check', () => {
    expect(true).toBe(true);
  });

  it('should have correct Node.js version', () => {
    const nodeVersion = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);
    expect(nodeVersion).toBeGreaterThanOrEqual(18);
  });
});
