/**
 * Jupiter data API market-data provider and opportunity assessment.
 *
 * Pulls the rich market snapshot the bags.fm site uses (`datapi.jup.ag`) for a
 * mint and distills it into five high-signal indicators with a comprehensible
 * good/caution/avoid rating:
 *
 *  1. Organic activity  (organicScoreLabel / organicScore)
 *  2. Liquidity         (liquidity in USD)
 *  3. Momentum          (1h buy/sell volume ratio + net buyers)
 *  4. Distribution      (top-holder % + bot-holder %)
 *  5. Safety            (mint/freeze authority + Blockaid flags)
 *
 * `assessMarket` is a pure function so the scoring rules are unit-testable
 * independently of the network fetch.
 *
 * @module sdk/jupiter-market
 */

import { JUPITER_DATAPI_ASSETS_URL } from './jupiter-price.js';
import { logger } from '../utils/logger.js';

const jupiterMarketLogger = logger.child({ module: 'jupiter-market' });

/** Normalized market snapshot for a token. All fields optional/defensive. */
export interface MarketData {
  mint: string;
  organicScore?: number | undefined;
  organicScoreLabel?: string | undefined;
  liquidityUsd?: number | undefined;
  mcapUsd?: number | undefined;
  holderCount?: number | undefined;
  buyVolume1h?: number | undefined;
  sellVolume1h?: number | undefined;
  numNetBuyers1h?: number | undefined;
  numTraders1h?: number | undefined;
  /** Top-holder concentration as a fraction (0-1). */
  topHoldersFraction?: number | undefined;
  /** Bot-holder share as a fraction (0-1). */
  botHoldersFraction?: number | undefined;
  mintAuthorityDisabled?: boolean | undefined;
  freezeAuthorityDisabled?: boolean | undefined;
  blockaidHoneypot?: boolean | undefined;
  blockaidRugpull?: boolean | undefined;
  blockaidWashTrading?: boolean | undefined;
}

/** Traffic-light status for a single signal. */
export type SignalStatus = 'good' | 'warn' | 'bad' | 'unknown';

/** One displayable indicator. */
export interface MarketSignal {
  key: 'organic' | 'liquidity' | 'momentum' | 'distribution' | 'safety';
  label: string;
  value: string;
  status: SignalStatus;
}

export type MarketRating = 'good' | 'caution' | 'avoid';

/** Assessment result: a score, an overall rating, and the five signals. */
export interface MarketAssessment {
  score: number;
  rating: MarketRating;
  signals: MarketSignal[];
}

// Heuristic thresholds (documented so they are easy to tune).
const LIQUIDITY_GOOD_USD = 5_000;
const LIQUIDITY_WARN_USD = 1_000;
const MOMENTUM_GOOD_RATIO = 1.2;
const MOMENTUM_BAD_RATIO = 0.8;
const TOP_HOLDERS_GOOD = 0.1;
const TOP_HOLDERS_WARN = 0.25;
const BOT_HOLDERS_GOOD = 0.02;
const BOT_HOLDERS_WARN = 0.05;

interface JupiterStats {
  buyVolume?: number;
  sellVolume?: number;
  numNetBuyers?: number;
  numTraders?: number;
}

interface JupiterAudit {
  mintAuthorityDisabled?: boolean;
  freezeAuthorityDisabled?: boolean;
  topHoldersPercentage?: number;
  botHoldersPercentage?: number;
  blockaidHoneypot?: boolean;
  blockaidRugpull?: boolean;
  blockaidWashTrading?: boolean;
}

interface JupiterMarketAsset {
  id: string;
  organicScore?: number;
  organicScoreLabel?: string;
  liquidity?: number;
  mcap?: number;
  holderCount?: number;
  stats1h?: JupiterStats;
  audit?: JupiterAudit;
}

export interface FetchMarketDataOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch and normalize the market snapshot for a mint from the Jupiter data API.
 *
 * @returns Normalized {@link MarketData}, or `null` if the token is unknown.
 */
export async function fetchMarketData(
  mint: string,
  options: FetchMarketDataOptions = {}
): Promise<MarketData | null> {
  const baseUrl = options.baseUrl ?? JUPITER_DATAPI_ASSETS_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(`${baseUrl}?query=${encodeURIComponent(mint)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Jupiter data API request failed: ${String(response.status)}`);
  }

  const assets = (await response.json()) as JupiterMarketAsset[];
  const asset = assets.find((a) => a.id === mint) ?? assets[0];
  if (asset === undefined) {
    return null;
  }

  const audit = asset.audit ?? {};
  const stats = asset.stats1h ?? {};

  return {
    mint,
    organicScore: asset.organicScore,
    organicScoreLabel: asset.organicScoreLabel,
    liquidityUsd: asset.liquidity,
    mcapUsd: asset.mcap,
    holderCount: asset.holderCount,
    buyVolume1h: stats.buyVolume,
    sellVolume1h: stats.sellVolume,
    numNetBuyers1h: stats.numNetBuyers,
    numTraders1h: stats.numTraders,
    topHoldersFraction: audit.topHoldersPercentage,
    botHoldersFraction: audit.botHoldersPercentage,
    mintAuthorityDisabled: audit.mintAuthorityDisabled,
    freezeAuthorityDisabled: audit.freezeAuthorityDisabled,
    blockaidHoneypot: audit.blockaidHoneypot,
    blockaidRugpull: audit.blockaidRugpull,
    blockaidWashTrading: audit.blockaidWashTrading,
  };
}

function formatUsd(value: number | undefined): string {
  if (value === undefined) {
    return 'n/a';
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function assessOrganic(data: MarketData): MarketSignal {
  const label = data.organicScoreLabel;
  const scoreText = data.organicScore !== undefined ? ` (${data.organicScore.toFixed(0)})` : '';
  let status: SignalStatus = 'unknown';
  if (label === 'high') {
    status = 'good';
  } else if (label === 'medium') {
    status = 'warn';
  } else if (label !== undefined) {
    status = 'bad';
  }
  return { key: 'organic', label: 'Organic', value: `${label ?? 'unknown'}${scoreText}`, status };
}

function assessLiquidity(data: MarketData): MarketSignal {
  const liq = data.liquidityUsd;
  let status: SignalStatus = 'unknown';
  if (liq !== undefined) {
    status = liq >= LIQUIDITY_GOOD_USD ? 'good' : liq >= LIQUIDITY_WARN_USD ? 'warn' : 'bad';
  }
  return { key: 'liquidity', label: 'Liquidity', value: formatUsd(liq), status };
}

function assessMomentum(data: MarketData): MarketSignal {
  const buy = data.buyVolume1h;
  const sell = data.sellVolume1h;
  const net = data.numNetBuyers1h;
  if (buy === undefined || sell === undefined || (buy === 0 && sell === 0)) {
    return { key: 'momentum', label: 'Momentum 1h', value: 'no activity', status: 'unknown' };
  }
  const ratio = sell > 0 ? buy / sell : buy > 0 ? Infinity : 0;
  const ratioText = Number.isFinite(ratio) ? `${ratio.toFixed(1)}x` : 'buys only';
  const netText = net !== undefined ? `, net ${net > 0 ? '+' : ''}${String(net)}` : '';
  let status: SignalStatus;
  if (ratio >= MOMENTUM_GOOD_RATIO && (net === undefined || net >= 0)) {
    status = 'good';
  } else if (ratio < MOMENTUM_BAD_RATIO || (net !== undefined && net < 0)) {
    status = 'bad';
  } else {
    status = 'warn';
  }
  return { key: 'momentum', label: 'Momentum 1h', value: `${ratioText}${netText}`, status };
}

function assessDistribution(data: MarketData): MarketSignal {
  const top = data.topHoldersFraction;
  const bot = data.botHoldersFraction;
  if (top === undefined && bot === undefined) {
    return { key: 'distribution', label: 'Holders', value: 'unknown', status: 'unknown' };
  }
  const topStatus: SignalStatus =
    top === undefined ? 'unknown' : top < TOP_HOLDERS_GOOD ? 'good' : top < TOP_HOLDERS_WARN ? 'warn' : 'bad';
  const botStatus: SignalStatus =
    bot === undefined ? 'unknown' : bot < BOT_HOLDERS_GOOD ? 'good' : bot < BOT_HOLDERS_WARN ? 'warn' : 'bad';
  const status = worstStatus([topStatus, botStatus]);
  const topText = top !== undefined ? `top ${(top * 100).toFixed(0)}%` : 'top n/a';
  const botText = bot !== undefined ? `bot ${(bot * 100).toFixed(0)}%` : '';
  return {
    key: 'distribution',
    label: 'Holders',
    value: `${topText}${botText.length > 0 ? ` / ${botText}` : ''}`,
    status,
  };
}

function assessSafety(data: MarketData): MarketSignal {
  const flags: string[] = [];
  if (data.blockaidHoneypot === true) flags.push('honeypot');
  if (data.blockaidRugpull === true) flags.push('rugpull');
  if (data.blockaidWashTrading === true) flags.push('wash');

  const mintOff = data.mintAuthorityDisabled;
  const freezeOff = data.freezeAuthorityDisabled;

  if (mintOff === undefined && freezeOff === undefined && flags.length === 0) {
    return { key: 'safety', label: 'Safety', value: 'unknown', status: 'unknown' };
  }

  const authorityRisk = mintOff === false || freezeOff === false;
  const status: SignalStatus = authorityRisk || flags.length > 0 ? 'bad' : 'good';

  const parts: string[] = [];
  parts.push(`mint ${mintOff === true ? 'off' : mintOff === false ? 'ON!' : '?'}`);
  parts.push(`freeze ${freezeOff === true ? 'off' : freezeOff === false ? 'ON!' : '?'}`);
  if (flags.length > 0) {
    parts.push(flags.join('/'));
  }
  return { key: 'safety', label: 'Safety', value: parts.join(', '), status };
}

function worstStatus(statuses: SignalStatus[]): SignalStatus {
  const order: SignalStatus[] = ['bad', 'warn', 'unknown', 'good'];
  for (const candidate of order) {
    if (statuses.includes(candidate)) {
      return candidate;
    }
  }
  return 'unknown';
}

const STATUS_POINTS: Record<SignalStatus, number> = { good: 20, warn: 10, unknown: 8, bad: 0 };

/**
 * Distill market data into the five signals plus an overall score and rating.
 *
 * Safety is a gate: any safety failure forces an `avoid` rating regardless of
 * the other signals.
 */
export function assessMarket(data: MarketData): MarketAssessment {
  const signals: MarketSignal[] = [
    assessOrganic(data),
    assessLiquidity(data),
    assessMomentum(data),
    assessDistribution(data),
    assessSafety(data),
  ];

  const score = signals.reduce((sum, signal) => sum + STATUS_POINTS[signal.status], 0);

  const safety = signals.find((s) => s.key === 'safety');
  let rating: MarketRating;
  if (safety?.status === 'bad') {
    rating = 'avoid';
  } else if (score >= 70) {
    rating = 'good';
  } else if (score >= 40) {
    rating = 'caution';
  } else {
    rating = 'avoid';
  }

  jupiterMarketLogger.debug('Assessed market data', { mint: data.mint, score, rating });
  return { score, rating, signals };
}
