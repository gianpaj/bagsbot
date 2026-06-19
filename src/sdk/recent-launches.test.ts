import { describe, expect, it, vi } from 'vitest';
import {
  fetchRecentLaunches,
  leaderboardItemToLaunchEvent,
  resolveSeedRecentHours,
  type RecentLaunchesSource,
} from './recent-launches.js';

type LeaderboardItem = Awaited<
  ReturnType<RecentLaunchesSource['state']['getTopTokensByLifetimeFees']>
>[number];

function makeItem(overrides: {
  token: string;
  createdAt?: string;
  name?: string;
  symbol?: string;
  tokenInfo?: null;
}): LeaderboardItem {
  const base = {
    token: overrides.token,
    lifetimeFees: '0',
    tokenSupply: null,
    tokenLatestPrice: null,
    creators: [
      { wallet: 'CreatorWallet111', isCreator: true },
      { wallet: 'OtherWallet222', isCreator: false },
    ],
    tokenInfo:
      overrides.tokenInfo === null
        ? null
        : {
            name: overrides.name ?? 'Test Token',
            symbol: overrides.symbol ?? 'TEST',
            icon: 'https://img/test.png',
            dev: 'DevWallet333',
            twitter: 'https://x.com/test',
            firstPool: { id: 'pool', createdAt: overrides.createdAt ?? new Date().toISOString() },
          },
  };
  return base as unknown as LeaderboardItem;
}

function makeSource(items: LeaderboardItem[]): RecentLaunchesSource {
  return {
    state: {
      getTopTokensByLifetimeFees: vi.fn(async () => items),
    },
  } as unknown as RecentLaunchesSource;
}

describe('leaderboardItemToLaunchEvent', () => {
  it('maps fields and prefers the creator wallet', () => {
    const event = leaderboardItemToLaunchEvent(makeItem({ token: 'Mint1' }));
    expect(event).not.toBeNull();
    expect(event?.mint).toBe('Mint1');
    expect(event?.creator).toBe('CreatorWallet111');
    expect(event?.symbol).toBe('TEST');
    expect(event?.image).toBe('https://img/test.png');
    expect(event?.twitter).toBe('https://x.com/test');
  });

  it('returns null when token metadata is missing', () => {
    expect(leaderboardItemToLaunchEvent(makeItem({ token: 'Mint1', tokenInfo: null }))).toBeNull();
  });
});

describe('fetchRecentLaunches', () => {
  it('keeps only launches within the window, newest first', async () => {
    const now = Date.now();
    const hoursAgo = (h: number): string => new Date(now - h * 60 * 60 * 1000).toISOString();

    const source = makeSource([
      makeItem({ token: 'Old', createdAt: hoursAgo(20), symbol: 'OLD' }),
      makeItem({ token: 'Recent', createdAt: hoursAgo(2), symbol: 'REC' }),
      makeItem({ token: 'Newest', createdAt: hoursAgo(1), symbol: 'NEW' }),
    ]);

    const events = await fetchRecentLaunches(source, 12);

    expect(events.map((e) => e.mint)).toEqual(['Newest', 'Recent']);
  });

  it('skips items with unparseable timestamps', async () => {
    const source = makeSource([makeItem({ token: 'Bad', createdAt: 'not-a-date' })]);
    const events = await fetchRecentLaunches(source, 12);
    expect(events).toHaveLength(0);
  });
});

describe('resolveSeedRecentHours', () => {
  const noEnv: NodeJS.ProcessEnv = {};

  it('returns null when neither flag nor env is set', () => {
    expect(resolveSeedRecentHours([], noEnv)).toBeNull();
  });

  it('uses the default window for a bare --seed-recent flag', () => {
    expect(resolveSeedRecentHours(['--seed-recent'], noEnv)).toBe(12);
  });

  it('parses --seed-recent=<hours>', () => {
    expect(resolveSeedRecentHours(['--seed-recent=24'], noEnv)).toBe(24);
  });

  it('parses --seed-recent <hours> (space separated)', () => {
    expect(resolveSeedRecentHours(['--seed-recent', '6'], noEnv)).toBe(6);
  });

  it('treats a following flag as no value (default window)', () => {
    expect(resolveSeedRecentHours(['--seed-recent', '--other'], noEnv)).toBe(12);
  });

  it('reads SEED_RECENT_HOURS from env', () => {
    expect(resolveSeedRecentHours([], { SEED_RECENT_HOURS: '8' })).toBe(8);
  });

  it('lets the CLI flag take precedence over env', () => {
    expect(resolveSeedRecentHours(['--seed-recent=3'], { SEED_RECENT_HOURS: '8' })).toBe(3);
  });

  it('returns null for non-positive or invalid values', () => {
    expect(resolveSeedRecentHours(['--seed-recent=0'], noEnv)).toBeNull();
    expect(resolveSeedRecentHours(['--seed-recent=-5'], noEnv)).toBeNull();
    expect(resolveSeedRecentHours([], { SEED_RECENT_HOURS: 'abc' })).toBeNull();
  });
});
