import { describe, expect, it, vi } from 'vitest';
import { fetchJupiterQuote } from './jupiter-price.js';

const TOKEN = 'SomeMintBAGS';
const WSOL = 'So11111111111111111111111111111111111111112';

function makeFetch(prices: Record<string, { usdPrice?: number; decimals?: number }>): typeof fetch {
  return vi.fn(async (url: string) => {
    const query = new URL(url).searchParams.get('query') ?? '';
    const asset = prices[query];
    return {
      ok: true,
      status: 200,
      json: async () => (asset !== undefined ? [{ id: query, ...asset }] : []),
    };
  }) as unknown as typeof fetch;
}

describe('fetchJupiterQuote', () => {
  it('derives a SOL-denominated quote in token base units', async () => {
    const fetchImpl = makeFetch({
      [TOKEN]: { usdPrice: 0.00005, decimals: 9 },
      [WSOL]: { usdPrice: 70 },
    });

    // 0.01 SOL * $70 = $0.70; $0.70 / $0.00005 = 14000 whole tokens.
    const quote = await fetchJupiterQuote(TOKEN, 0.01 * 1_000_000_000, {
      fetchImpl,
      now: () => 1000,
    });

    expect(quote.expectedOutput).toBeCloseTo(14000 * 1e9, 0);
    expect(quote.route).toBe('JUPITER/datapi');
    expect(quote.inputAmount).toBe(10_000_000);
  });

  it('throws when the token has no price', async () => {
    const fetchImpl = makeFetch({ [WSOL]: { usdPrice: 70 } });
    await expect(
      fetchJupiterQuote(TOKEN, 1_000_000, { fetchImpl, now: () => 2000 })
    ).rejects.toThrow(/No Jupiter price/);
  });

  it('throws when the data API request fails', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(
      fetchJupiterQuote(TOKEN, 1_000_000, { fetchImpl, now: () => 3000 })
    ).rejects.toThrow(/503/);
  });
});
