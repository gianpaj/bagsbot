import { describe, expect, it, vi } from 'vitest';
import { fetchMarketData, assessMarket, type MarketData } from './jupiter-market.js';

const MINT = 'SomeMintBAGS';

function statusOf(assessment: ReturnType<typeof assessMarket>, key: string): string {
  return assessment.signals.find((s) => s.key === key)?.status ?? 'missing';
}

function goodData(): MarketData {
  return {
    mint: MINT,
    organicScoreLabel: 'high',
    organicScore: 90,
    liquidityUsd: 10_000,
    buyVolume1h: 100,
    sellVolume1h: 50,
    numNetBuyers1h: 5,
    topHoldersFraction: 0.05,
    botHoldersFraction: 0,
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: true,
  };
}

describe('fetchMarketData', () => {
  it('normalizes the Jupiter asset payload', async () => {
    const asset = {
      id: MINT,
      organicScore: 42,
      organicScoreLabel: 'medium',
      liquidity: 2500,
      mcap: 80_000,
      holderCount: 120,
      stats1h: { buyVolume: 30, sellVolume: 20, numNetBuyers: 3, numTraders: 9 },
      audit: {
        mintAuthorityDisabled: true,
        freezeAuthorityDisabled: false,
        topHoldersPercentage: 0.18,
        botHoldersPercentage: 0.03,
        blockaidHoneypot: false,
      },
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [asset],
    })) as unknown as typeof fetch;

    const data = await fetchMarketData(MINT, { fetchImpl });
    expect(data).toMatchObject({
      mint: MINT,
      organicScoreLabel: 'medium',
      liquidityUsd: 2500,
      buyVolume1h: 30,
      sellVolume1h: 20,
      numNetBuyers1h: 3,
      topHoldersFraction: 0.18,
      botHoldersFraction: 0.03,
      mintAuthorityDisabled: true,
      freezeAuthorityDisabled: false,
    });
  });

  it('returns null when no asset is found', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })) as unknown as typeof fetch;
    expect(await fetchMarketData(MINT, { fetchImpl })).toBeNull();
  });

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(fetchMarketData(MINT, { fetchImpl })).rejects.toThrow(/500/);
  });
});

describe('assessMarket', () => {
  it('rates a healthy token as good with all signals green', () => {
    const result = assessMarket(goodData());
    expect(result.rating).toBe('good');
    expect(result.score).toBe(100);
    expect(statusOf(result, 'organic')).toBe('good');
    expect(statusOf(result, 'liquidity')).toBe('good');
    expect(statusOf(result, 'momentum')).toBe('good');
    expect(statusOf(result, 'distribution')).toBe('good');
    expect(statusOf(result, 'safety')).toBe('good');
  });

  it('forces an avoid rating when safety fails, regardless of other signals', () => {
    const result = assessMarket({ ...goodData(), mintAuthorityDisabled: false });
    expect(statusOf(result, 'safety')).toBe('bad');
    expect(result.rating).toBe('avoid');
  });

  it('treats a Blockaid honeypot flag as a safety failure', () => {
    const result = assessMarket({ ...goodData(), blockaidHoneypot: true });
    expect(statusOf(result, 'safety')).toBe('bad');
    expect(result.rating).toBe('avoid');
  });

  it('flags weak momentum and heavy holder concentration', () => {
    const result = assessMarket({
      ...goodData(),
      buyVolume1h: 10,
      sellVolume1h: 100,
      numNetBuyers1h: -4,
      topHoldersFraction: 0.4,
    });
    expect(statusOf(result, 'momentum')).toBe('bad');
    expect(statusOf(result, 'distribution')).toBe('bad');
  });

  it('marks missing signals as unknown', () => {
    const result = assessMarket({ mint: MINT });
    for (const key of ['organic', 'liquidity', 'momentum', 'distribution', 'safety']) {
      expect(statusOf(result, key)).toBe('unknown');
    }
  });
});
