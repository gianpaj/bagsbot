/**
 * Sample LaunchpadLaunchEvent fixtures for testing
 *
 * Provides realistic test data for token launch events with various
 * configurations and edge cases.
 *
 * @module tests/mocks/launch-events
 */

import type { LaunchpadLaunchEvent } from '../../src/types/index.js';

/**
 * Creates a mock launch event with optional overrides
 *
 * @param overrides - Partial event data to override defaults
 * @returns A complete LaunchpadLaunchEvent
 *
 * @example
 * ```typescript
 * const event = createMockLaunchEvent({ symbol: 'MOON' });
 * console.log(event.symbol); // 'MOON'
 * ```
 */
export function createMockLaunchEvent(
  overrides: Partial<LaunchpadLaunchEvent> = {}
): LaunchpadLaunchEvent {
  return {
    mint: 'TokenMint123456789abcdefghijklmnopqrstuvwx',
    creator: 'Creator123456789abcdefghijklmnopqrstuvwxyz',
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token for development',
    image: 'https://example.com/token-image.png',
    telegram: 'https://t.me/testtoken',
    twitter: 'https://twitter.com/testtoken',
    website: 'https://testtoken.example.com',
    ...overrides,
  };
}

/**
 * Minimal launch event with only required fields
 * Useful for testing edge cases with missing optional data
 */
export const minimalLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'MinimalMint123456789abcdefghijklmnop',
  creator: 'MinimalCreator123456789abcdefghijklmnop',
  name: 'Minimal Token',
  symbol: 'MIN',
};

/**
 * Launch event with all social links populated
 * Represents a "high-quality" token with full social presence
 */
export const fullSocialLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'SocialMint123456789abcdefghijklmnopqr',
  creator: 'SocialCreator123456789abcdefghijklmnopq',
  name: 'Social Token',
  symbol: 'SOCIAL',
  description: 'A token with complete social presence and verified community',
  image: 'https://example.com/social-token.png',
  telegram: 'https://t.me/socialtoken',
  twitter: 'https://twitter.com/socialtoken',
  website: 'https://socialtoken.io',
};

/**
 * Launch event with no social links
 * Represents a "low-quality" token with no social presence
 */
export const noSocialLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'NoSocialMint123456789abcdefghijklmnop',
  creator: 'NoSocialCreator123456789abcdefghijklmnop',
  name: 'Anonymous Token',
  symbol: 'ANON',
  description: 'A token with no social links',
  image: 'https://example.com/anon-token.png',
};

/**
 * Launch event simulating a meme coin
 * Common pattern in Solana ecosystem
 */
export const memeCoinLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'MemeMint123456789abcdefghijklmnopqrst',
  creator: 'MemeCreator123456789abcdefghijklmnopqr',
  name: 'DOGE TO THE MOON',
  symbol: 'DOGE2',
  description: 'The next DOGE! To the moon! 100x guaranteed!',
  image: 'https://example.com/doge-moon.gif',
  telegram: 'https://t.me/doge2moon',
  twitter: 'https://twitter.com/doge2moon',
};

/**
 * Launch event with suspicious characteristics
 * Useful for testing filters and scoring
 */
export const suspiciousLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'SuspiciousMint123456789abcdefghijklmn',
  creator: 'SuspiciousCreator123456789abcdefghijklm',
  name: 'FREE MONEY TOKEN',
  symbol: 'SCAM',
  description: 'Send 1 SOL get 10 SOL back! Guaranteed returns!',
  image: 'https://example.com/scam-token.png',
};

/**
 * Launch event with unicode characters
 * Tests handling of special characters
 */
export const unicodeLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'UnicodeMint123456789abcdefghijklmnopq',
  creator: 'UnicodeCreator123456789abcdefghijklmnop',
  name: 'Token Japonais',
  symbol: 'JAPAN',
  description: 'A test token for unicode handling',
  image: 'https://example.com/unicode-token.png',
};

/**
 * Launch event with very long strings
 * Tests handling of boundary conditions
 */
export const longStringLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'LongMint123456789abcdefghijklmnopqrstu',
  creator: 'LongCreator123456789abcdefghijklmnopqrs',
  name: 'A'.repeat(100),
  symbol: 'LONG',
  description: 'B'.repeat(500),
  image: 'https://example.com/' + 'path/'.repeat(50) + 'image.png',
};

/**
 * Launch event with empty optional strings
 * Tests handling of empty vs undefined
 */
export const emptyStringsLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'EmptyMint123456789abcdefghijklmnopqrs',
  creator: 'EmptyCreator123456789abcdefghijklmnopqr',
  name: 'Empty Fields Token',
  symbol: 'EMPTY',
  description: '',
  image: '',
  telegram: '',
  twitter: '',
  website: '',
};

/**
 * Collection of varied launch events for batch testing
 */
export const sampleLaunchEvents: LaunchpadLaunchEvent[] = [
  createMockLaunchEvent({ mint: 'Batch1Mint', symbol: 'BATCH1' }),
  createMockLaunchEvent({ mint: 'Batch2Mint', symbol: 'BATCH2' }),
  createMockLaunchEvent({ mint: 'Batch3Mint', symbol: 'BATCH3' }),
  createMockLaunchEvent({ mint: 'Batch4Mint', symbol: 'BATCH4' }),
  createMockLaunchEvent({ mint: 'Batch5Mint', symbol: 'BATCH5' }),
];

/**
 * Creates multiple launch events with sequential numbering
 *
 * @param count - Number of events to create
 * @param baseOverrides - Common overrides for all events
 * @returns Array of launch events
 *
 * @example
 * ```typescript
 * const events = createBatchLaunchEvents(10, { creator: 'CommonCreator' });
 * console.log(events.length); // 10
 * ```
 */
export function createBatchLaunchEvents(
  count: number,
  baseOverrides: Partial<LaunchpadLaunchEvent> = {}
): LaunchpadLaunchEvent[] {
  const events: LaunchpadLaunchEvent[] = [];

  for (let i = 0; i < count; i++) {
    events.push(
      createMockLaunchEvent({
        mint: `BatchMint${i.toString().padStart(4, '0')}123456789abcdefgh`,
        name: `Batch Token ${i}`,
        symbol: `BT${i}`,
        ...baseOverrides,
      })
    );
  }

  return events;
}

/**
 * Creates launch events with specific time intervals
 * Useful for testing rate-based filtering
 *
 * @param count - Number of events to create
 * @param intervalMs - Interval between events (simulated, not actual timing)
 * @returns Array of launch events with timestamps in description
 *
 * @example
 * ```typescript
 * const events = createTimedLaunchEvents(5, 1000);
 * // Events will have simulated timestamps 1 second apart
 * ```
 */
export function createTimedLaunchEvents(
  count: number,
  intervalMs: number
): LaunchpadLaunchEvent[] {
  const baseTime = Date.now();
  const events: LaunchpadLaunchEvent[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = baseTime + i * intervalMs;
    events.push(
      createMockLaunchEvent({
        mint: `TimedMint${i.toString().padStart(4, '0')}123456789abcdef`,
        name: `Timed Token ${i}`,
        symbol: `TT${i}`,
        description: `Created at timestamp: ${timestamp}`,
      })
    );
  }

  return events;
}

/**
 * Launch event representing a token from a known creator
 * Useful for testing creator-based filtering
 */
export const knownCreatorLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'KnownMint123456789abcdefghijklmnopqrst',
  creator: 'KnownGoodCreator123456789abcdefghijklmn',
  name: 'Trusted Token',
  symbol: 'TRUST',
  description: 'Token from a known, trusted creator',
  image: 'https://example.com/trusted-token.png',
  telegram: 'https://t.me/trustedtoken',
  twitter: 'https://twitter.com/trustedtoken',
  website: 'https://trustedtoken.io',
};

/**
 * Launch event representing a token from a blacklisted creator
 * Useful for testing creator-based filtering
 */
export const blacklistedCreatorLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'BlacklistMint123456789abcdefghijklmnop',
  creator: 'BlacklistedCreator123456789abcdefghijkl',
  name: 'Untrusted Token',
  symbol: 'UNTRUST',
  description: 'Token from a blacklisted creator',
  image: 'https://example.com/untrusted-token.png',
};

/**
 * Launch events grouped by quality level for filter testing
 */
export const qualityGroupedEvents = {
  high: [fullSocialLaunchEvent, knownCreatorLaunchEvent],
  medium: [
    createMockLaunchEvent({ telegram: 'https://t.me/medium1' }),
    createMockLaunchEvent({ twitter: 'https://twitter.com/medium2' }),
  ],
  low: [noSocialLaunchEvent, minimalLaunchEvent],
  suspicious: [suspiciousLaunchEvent, blacklistedCreatorLaunchEvent],
};
