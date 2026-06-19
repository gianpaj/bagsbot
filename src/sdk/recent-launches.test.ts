import { describe, expect, it, vi } from 'vitest';
import {
  fetchRecentLaunches,
  baseAssetToLaunchEvent,
  resolveSeedRecentHours,
} from './recent-launches.js';

function makeBaseAsset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'Mint111BAGS',
    name: 'Test Token',
    symbol: 'TEST',
    icon: 'https://img/test.png',
    twitter: 'https://x.com/test',
    website: 'https://bags.fm/Mint111BAGS',
    dev: 'DevWallet333',
    launchpad: 'bags.fun',
    ...overrides,
  };
}

function makeFetch(pools: unknown[]): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ pools }),
  })) as unknown as typeof fetch;
}

describe('baseAssetToLaunchEvent', () => {
  it('maps fields and uses the dev wallet as creator', () => {
    const event = baseAssetToLaunchEvent(makeBaseAsset() as never);
    expect(event).not.toBeNull();
    expect(event?.mint).toBe('Mint111BAGS');
    expect(event?.creator).toBe('DevWallet333');
    expect(event?.symbol).toBe('TEST');
    expect(event?.image).toBe('https://img/test.png');
    expect(event?.twitter).toBe('https://x.com/test');
  });

  it('drops a bags.fm self-link website but keeps a real one', () => {
    expect(baseAssetToLaunchEvent(makeBaseAsset() as never)?.website).toBeUndefined();
    const real = baseAssetToLaunchEvent(
      makeBaseAsset({ website: 'https://project.xyz' }) as never
    );
    expect(real?.website).toBe('https://project.xyz');
  });

  it('returns null when metadata is missing', () => {
    expect(baseAssetToLaunchEvent({ id: 'Mint111BAGS' } as never)).toBeNull();
  });
});

describe('fetchRecentLaunches', () => {
  const hoursAgoIso = (h: number): string => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

  it('keeps only launches within the window, newest first', async () => {
    const pools = [
      { id: 'p1', createdAt: hoursAgoIso(20), baseAsset: makeBaseAsset({ id: 'Old', symbol: 'OLD' }) },
      { id: 'p2', createdAt: hoursAgoIso(2), baseAsset: makeBaseAsset({ id: 'Recent', symbol: 'REC' }) },
      { id: 'p3', createdAt: hoursAgoIso(1), baseAsset: makeBaseAsset({ id: 'Newest', symbol: 'NEW' }) },
    ];
    const events = await fetchRecentLaunches(12, { fetchImpl: makeFetch(pools) });
    expect(events.map((e) => e.mint)).toEqual(['Newest', 'Recent']);
  });

  it('requests the Bags launchpad sorted by createdAt', async () => {
    const fetchImpl = makeFetch([]);
    await fetchRecentLaunches(12, { fetchImpl });
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('launchpads=bags.fun');
    expect(url).toContain('sortBy=createdAt');
  });

  it('skips pools with unparseable timestamps', async () => {
    const pools = [{ id: 'p1', createdAt: 'not-a-date', baseAsset: makeBaseAsset() }];
    const events = await fetchRecentLaunches(12, { fetchImpl: makeFetch(pools) });
    expect(events).toHaveLength(0);
  });

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })) as unknown as typeof fetch;
    await expect(fetchRecentLaunches(12, { fetchImpl })).rejects.toThrow(/503/);
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
