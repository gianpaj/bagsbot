/**
 * Recent-launch seeding.
 *
 * Lets the bot warm-start from tokens that launched in the last N hours instead
 * of waiting for brand-new launches to arrive over the live restream.
 *
 * NOTE: the Bags SDK has no "list launches by time" endpoint. The only list
 * source is the all-time fee leaderboard (`getTopTokensByLifetimeFees`). Each
 * leaderboard item carries `tokenInfo.firstPool.createdAt` (the pool creation
 * time, which is effectively the launch time), so we filter that list down to
 * the requested window. This therefore surfaces *recently launched tokens that
 * also rank on the fee leaderboard* — a useful seed, not an exhaustive list of
 * every launch in the window.
 *
 * @module sdk/recent-launches
 */

import type { BagsSDK } from '@bagsfm/bags-sdk';
import type { LaunchpadLaunchEvent } from '../types/launch.js';
import { logger } from '../utils/logger.js';

const recentLaunchesLogger = logger.child({ module: 'recent-launches' });

/** Default look-back window when seeding is enabled without an explicit value. */
export const DEFAULT_SEED_RECENT_HOURS = 12;

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

/**
 * The subset of the Bags SDK we depend on, for easy testing/mocking.
 */
export interface RecentLaunchesSource {
  state: {
    getTopTokensByLifetimeFees: BagsSDK['state']['getTopTokensByLifetimeFees'];
  };
}

type LeaderboardItem = Awaited<
  ReturnType<BagsSDK['state']['getTopTokensByLifetimeFees']>
>[number];

/**
 * Convert a leaderboard item into a launch event, or `null` if it lacks the
 * metadata the filter pipeline needs (name/symbol).
 */
export function leaderboardItemToLaunchEvent(item: LeaderboardItem): LaunchpadLaunchEvent | null {
  const info = item.tokenInfo;
  if (info === null || item.token.length === 0) {
    return null;
  }

  const creatorWallet =
    item.creators?.find((c) => c.isCreator)?.wallet ?? item.creators?.[0]?.wallet ?? info.dev;

  const event: LaunchpadLaunchEvent = {
    mint: item.token,
    creator: creatorWallet.length > 0 ? creatorWallet : 'unknown',
    name: info.name,
    symbol: info.symbol,
  };
  if (info.icon.length > 0) {
    event.image = info.icon;
  }
  if (info.twitter !== undefined && info.twitter.length > 0) {
    event.twitter = info.twitter;
  }
  if (info.telegram !== undefined && info.telegram.length > 0) {
    event.telegram = info.telegram;
  }
  if (info.website !== undefined && info.website.length > 0) {
    event.website = info.website;
  }
  return event;
}

/**
 * Fetch tokens launched within the last `withinHours` hours, newest first.
 *
 * @param sdk - A Bags SDK instance (or compatible source).
 * @param withinHours - Look-back window in hours.
 * @returns Launch events for matching tokens, ordered newest-launched first.
 */
export async function fetchRecentLaunches(
  sdk: RecentLaunchesSource,
  withinHours: number = DEFAULT_SEED_RECENT_HOURS
): Promise<LaunchpadLaunchEvent[]> {
  const cutoffMs = Date.now() - withinHours * 60 * 60 * 1000;

  const leaderboard = await sdk.state.getTopTokensByLifetimeFees();

  const withinWindow = leaderboard
    .map((item) => {
      const createdAtRaw = item.tokenInfo?.firstPool.createdAt;
      const createdAtMs = createdAtRaw !== undefined ? new Date(createdAtRaw).getTime() : NaN;
      return { item, createdAtMs };
    })
    .filter(({ createdAtMs }) => Number.isFinite(createdAtMs) && createdAtMs >= cutoffMs)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const events: LaunchpadLaunchEvent[] = [];
  for (const { item } of withinWindow) {
    const event = leaderboardItemToLaunchEvent(item);
    if (event !== null) {
      events.push(event);
    }
  }

  recentLaunchesLogger.info('Fetched recent launches', {
    withinHours,
    leaderboardSize: leaderboard.length,
    withinWindow: withinWindow.length,
    usable: events.length,
  });

  return events;
}
