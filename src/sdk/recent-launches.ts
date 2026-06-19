/**
 * Recent-launch seeding.
 *
 * Lets the bot warm-start from tokens that launched in the last N hours instead
 * of waiting for brand-new launches to arrive over the live restream.
 *
 * Source: the Jupiter data API (`datapi.jup.ag`), the same feed the bags.fm
 * site uses for its "new launches" view. We query recent pools filtered to the
 * Bags launchpad and keep the ones created inside the requested window.
 *
 * The Bags SDK is deliberately NOT used here: its only list endpoint is the
 * all-time fee leaderboard (`getTopTokensByLifetimeFees`), which skews to older
 * established tokens and never contains anything recent enough to seed.
 *
 * @module sdk/recent-launches
 */

import type { LaunchpadLaunchEvent } from '../types/launch.js';
import { logger } from '../utils/logger.js';

const recentLaunchesLogger = logger.child({ module: 'recent-launches' });

/** Default look-back window when seeding is enabled without an explicit value. */
export const DEFAULT_SEED_RECENT_HOURS = 12;

/** Jupiter data API recent-pools endpoint (used by the bags.fm frontend). */
export const JUPITER_DATAPI_POOLS_URL = 'https://datapi.jup.ag/v1/pools';

/** Jupiter `launchpad` value identifying Bags launches. */
export const BAGS_LAUNCHPAD = 'bags.fun';

/**
 * Minimal shape of a token in the Jupiter pools response. Only the fields we
 * map are declared; the payload carries much more.
 */
interface JupiterBaseAsset {
  id: string;
  name?: string;
  symbol?: string;
  icon?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  dev?: string;
  launchpad?: string;
}

interface JupiterPool {
  id: string;
  createdAt?: string;
  baseAsset?: JupiterBaseAsset;
}

interface JupiterPoolsResponse {
  pools?: JupiterPool[];
}

/** Options for {@link fetchRecentLaunches}, primarily for testing. */
export interface FetchRecentLaunchesOptions {
  /** Base pools URL (defaults to the Jupiter data API). */
  baseUrl?: string;
  /** Launchpad filter value (defaults to Bags). */
  launchpad?: string;
  /** Fetch implementation (defaults to global `fetch`). */
  fetchImpl?: typeof fetch;
}

/**
 * Convert a Jupiter base asset into a launch event, or `null` if it lacks the
 * metadata the filter pipeline needs (mint/name/symbol).
 */
export function baseAssetToLaunchEvent(asset: JupiterBaseAsset): LaunchpadLaunchEvent | null {
  if (asset.id.length === 0 || asset.name === undefined || asset.symbol === undefined) {
    return null;
  }

  const event: LaunchpadLaunchEvent = {
    mint: asset.id,
    creator: asset.dev !== undefined && asset.dev.length > 0 ? asset.dev : 'unknown',
    name: asset.name,
    symbol: asset.symbol,
  };
  if (asset.icon !== undefined && asset.icon.length > 0) {
    event.image = asset.icon;
  }
  if (asset.twitter !== undefined && asset.twitter.length > 0) {
    event.twitter = asset.twitter;
  }
  if (asset.telegram !== undefined && asset.telegram.length > 0) {
    event.telegram = asset.telegram;
  }
  // The Bags website link is just the bags.fm token page, not a project site;
  // only carry a website if it points somewhere else.
  if (
    asset.website !== undefined &&
    asset.website.length > 0 &&
    !asset.website.includes('bags.fm')
  ) {
    event.website = asset.website;
  }
  return event;
}

/**
 * Fetch Bags tokens launched within the last `withinHours` hours, newest first.
 *
 * NOTE: the data API returns a bounded page (~50) of the most recent launches.
 * If every returned launch falls inside the window, older launches in the
 * window may exist beyond the page and are not seeded — this is logged.
 *
 * @param withinHours - Look-back window in hours.
 * @param options - Overrides for URL / launchpad / fetch (testing).
 * @returns Launch events for matching tokens, ordered newest-launched first.
 */
export async function fetchRecentLaunches(
  withinHours: number = DEFAULT_SEED_RECENT_HOURS,
  options: FetchRecentLaunchesOptions = {}
): Promise<LaunchpadLaunchEvent[]> {
  const baseUrl = options.baseUrl ?? JUPITER_DATAPI_POOLS_URL;
  const launchpad = options.launchpad ?? BAGS_LAUNCHPAD;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cutoffMs = Date.now() - withinHours * 60 * 60 * 1000;

  const url = `${baseUrl}?launchpads=${encodeURIComponent(launchpad)}&sortBy=createdAt`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(
      `Jupiter data API request failed: ${String(response.status)} ${response.statusText}`
    );
  }

  const data = (await response.json()) as JupiterPoolsResponse;
  const pools = data.pools ?? [];

  const dated: { event: LaunchpadLaunchEvent; createdAtMs: number }[] = [];
  for (const pool of pools) {
    if (pool.baseAsset === undefined) {
      continue;
    }
    const createdAtMs = pool.createdAt !== undefined ? new Date(pool.createdAt).getTime() : NaN;
    if (!Number.isFinite(createdAtMs) || createdAtMs < cutoffMs) {
      continue;
    }
    const event = baseAssetToLaunchEvent(pool.baseAsset);
    if (event !== null) {
      dated.push({ event, createdAtMs });
    }
  }

  dated.sort((a, b) => b.createdAtMs - a.createdAtMs);

  const truncated = pools.length > 0 && dated.length === pools.length;
  recentLaunchesLogger.info('Fetched recent launches', {
    withinHours,
    launchpad,
    poolsReturned: pools.length,
    usable: dated.length,
    pageLikelyTruncated: truncated,
  });
  if (truncated) {
    recentLaunchesLogger.warn(
      'All returned launches fell within the window; older in-window launches may exist beyond this page',
      { withinHours, poolsReturned: pools.length }
    );
  }

  return dated.map((d) => d.event);
}

/**
 * Resolve the recent-launch seeding window from CLI args and environment.
 *
 * Enabled by `--seed-recent` / `--seed-recent=<hours>` / `--seed-recent <hours>`
 * (CLI) or the `SEED_RECENT_HOURS` env var. The CLI flag takes precedence. A
 * bare flag uses {@link DEFAULT_SEED_RECENT_HOURS}. Returns the look-back in
 * hours, or `null` when seeding is disabled or the value is invalid.
 *
 * @param argv - Process args (excluding node/script path).
 * @param env - Environment variables.
 */
export function resolveSeedRecentHours(argv: string[], env: NodeJS.ProcessEnv): number | null {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed-recent') {
      const next = argv[i + 1];
      value = next !== undefined && !next.startsWith('-') ? next : '';
      break;
    }
    if (arg?.startsWith('--seed-recent=') === true) {
      value = arg.slice('--seed-recent='.length);
      break;
    }
  }

  if (value === undefined) {
    const envValue = env['SEED_RECENT_HOURS'];
    if (envValue === undefined || envValue === '') {
      return null;
    }
    value = envValue;
  }

  if (value === '') {
    return DEFAULT_SEED_RECENT_HOURS;
  }

  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    return null;
  }
  return hours;
}
