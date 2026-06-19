/**
 * Jupiter data API price lookups.
 *
 * Used as a fallback quote source for paper trading when the Bags quote
 * endpoint is unavailable (it occasionally returns 5xx). The Jupiter data API
 * (`datapi.jup.ag`) is the same feed bags.fm uses and reliably prices Bags
 * tokens, including ones still on the bonding curve.
 *
 * Prices are USD-denominated, so a SOL-denominated quote is derived using the
 * SOL/USD price. Output is expressed in token base units to match the Bags
 * adapter, keeping entry and poller pricing consistent.
 *
 * @module sdk/jupiter-price
 */

import { logger } from '../utils/logger.js';

const jupiterPriceLogger = logger.child({ module: 'jupiter-price' });

/** Jupiter data API asset search endpoint. */
export const JUPITER_DATAPI_ASSETS_URL = 'https://datapi.jup.ag/v1/assets/search';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** Cache SOL/USD briefly; it barely moves and halves lookups under polling. */
const SOL_PRICE_TTL_MS = 10_000;
let cachedSolUsd: { price: number; at: number } | null = null;

interface JupiterAsset {
  id: string;
  usdPrice?: number;
  decimals?: number;
}

export interface JupiterPriceOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injectable clock for testing; defaults to Date.now. */
  now?: () => number;
}

async function fetchAssetUsdPrice(
  query: string,
  baseUrl: string,
  fetchImpl: typeof fetch
): Promise<JupiterAsset | null> {
  const response = await fetchImpl(`${baseUrl}?query=${encodeURIComponent(query)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Jupiter data API request failed: ${String(response.status)}`);
  }
  const assets = (await response.json()) as JupiterAsset[];
  return assets.find((asset) => asset.id === query) ?? assets[0] ?? null;
}

/**
 * Quote a SOL→token swap using Jupiter data API prices.
 *
 * @param outputMint - Token mint to buy.
 * @param amountLamports - SOL input amount, in lamports.
 * @returns A quote whose `expectedOutput` is in token base units.
 */
export async function fetchJupiterQuote(
  outputMint: string,
  amountLamports: number,
  options: JupiterPriceOptions = {}
): Promise<{ inputAmount: number; expectedOutput: number; priceImpact: number; route: string }> {
  const baseUrl = options.baseUrl ?? JUPITER_DATAPI_ASSETS_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  let solUsd = cachedSolUsd !== null && now() - cachedSolUsd.at < SOL_PRICE_TTL_MS
    ? cachedSolUsd.price
    : null;

  const [token, sol] = await Promise.all([
    fetchAssetUsdPrice(outputMint, baseUrl, fetchImpl),
    solUsd === null ? fetchAssetUsdPrice(WSOL_MINT, baseUrl, fetchImpl) : Promise.resolve(null),
  ]);

  if (sol?.usdPrice !== undefined && sol.usdPrice > 0) {
    solUsd = sol.usdPrice;
    cachedSolUsd = { price: solUsd, at: now() };
  }

  if (token?.usdPrice === undefined || token.usdPrice <= 0 || solUsd === null || solUsd <= 0) {
    throw new Error(`No Jupiter price available for ${outputMint}`);
  }

  const decimals = token.decimals ?? 9;
  const amountSol = amountLamports / 1_000_000_000;
  const amountUsd = amountSol * solUsd;
  const wholeTokens = amountUsd / token.usdPrice;
  const expectedOutput = wholeTokens * Math.pow(10, decimals);

  jupiterPriceLogger.info('Derived Jupiter fallback quote', {
    outputMint,
    amountSol,
    tokenUsdPrice: token.usdPrice,
    solUsd,
    expectedOutput,
  });

  return {
    inputAmount: amountLamports,
    expectedOutput,
    priceImpact: 0,
    route: 'JUPITER/datapi',
  };
}
