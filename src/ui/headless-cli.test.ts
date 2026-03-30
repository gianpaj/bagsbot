import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { HeadlessCli } from './headless-cli.js';
import type { Opportunity } from '../alerts/system.js';

function createOpportunity(): Opportunity {
  return {
    id: 'opp-1',
    launch: {
      mint: 'Mint11111111111111111111111111111111111111111',
      creator: 'Creator1111111111111111111111111111111111111',
      name: 'Beta Edge',
      symbol: 'BETA',
      description: 'Test opportunity',
      image: 'https://example.com/image.png',
      twitter: 'https://x.com/beta_edge',
      telegram: 'https://t.me/beta_edge',
      website: 'https://beta.example.com',
    },
    filterResult: {
      launch: {
        mint: 'Mint11111111111111111111111111111111111111111',
        creator: 'Creator1111111111111111111111111111111111111',
        name: 'Beta Edge',
        symbol: 'BETA',
      },
      totalScore: 61,
      passed: true,
      filters: {
        creator: { passed: true, score: 55, details: '' },
        technical: { passed: true, score: 80, details: '' },
        social: { passed: true, score: 40, details: '' },
        liquidity: { passed: true, score: 35, details: '' },
      },
      timestamp: new Date(),
    },
    suggestedAmount: 0.01,
    timestamp: new Date(),
    status: 'pending',
  };
}

describe('HeadlessCli', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should block buy early and keep the opportunity pending when canBuy returns a reason', () => {
    const onBuy = vi.fn();
    const cli = new HeadlessCli({
      onBuy,
      onSkip: vi.fn(),
      onQuit: vi.fn(),
      canBuy: () => 'Scenario mode: trading disabled, opportunity left pending (mixed-opportunities).',
    });
    const opportunity = createOpportunity();

    cli.showOpportunity(opportunity);
    (cli as unknown as { handleKeypress: (key: string) => void }).handleKeypress('b');

    expect(onBuy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      'Scenario mode: trading disabled, opportunity left pending (mixed-opportunities).'
    );

    logSpy.mockClear();
    (cli as unknown as { printStatus: () => void }).printStatus();
    expect(logSpy).toHaveBeenCalledWith('Current opportunity: Beta Edge');
    expect(logSpy).not.toHaveBeenCalledWith('Waiting for opportunities...');
    expect(logSpy).not.toHaveBeenCalledWith('Buying BETA...');
  });
});
