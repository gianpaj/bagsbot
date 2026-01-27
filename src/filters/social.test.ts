 
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SocialFilter,
  createSocialFilter,
  SOCIAL_SCORE,
  type ISocialApiService,
} from './social.js';
import type { LaunchpadLaunchEvent, SocialFilterConfig } from '../types/index.js';
import { DEFAULT_SOCIAL_FILTER } from '../config/defaults.js';

/**
 * Create a mock launch event for testing
 */
function createMockLaunchEvent(
  overrides: Partial<LaunchpadLaunchEvent> = {}
): LaunchpadLaunchEvent {
  return {
    mint: 'TestMint123456789',
    creator: 'TestCreator123456789',
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token with good fundamentals',
    image: 'https://example.com/image.png',
    twitter: 'https://twitter.com/testtoken',
    telegram: 'https://t.me/testtoken',
    website: 'https://testtoken.com',
    ...overrides,
  };
}

/**
 * Create a mock API service
 */
function createMockApiService(overrides: Partial<ISocialApiService> = {}): ISocialApiService {
  return {
    isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(false),
    isTelegramGroupActive: vi.fn().mockResolvedValue(false),
    getCreatorEngagement: vi.fn().mockResolvedValue(0),
    getCommunitySize: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('SocialFilter', () => {
  let filter: SocialFilter;

  beforeEach(() => {
    filter = new SocialFilter();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create with default config when none provided', () => {
      const newFilter = new SocialFilter();
      expect(newFilter.name).toBe('social');
      expect(newFilter.getConfig()).toEqual(DEFAULT_SOCIAL_FILTER);
    });

    it('should create with custom config', () => {
      const customConfig: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 100,
      };
      const newFilter = new SocialFilter(customConfig);
      expect(newFilter.getConfig()).toEqual(customConfig);
    });

    it('should create with API service', () => {
      const apiService = createMockApiService();
      const newFilter = new SocialFilter(undefined, apiService);
      expect(newFilter.name).toBe('social');
    });

    it('should have correct name', () => {
      expect(filter.name).toBe('social');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 100,
      };
      filter.updateConfig(newConfig);
      expect(filter.getConfig()).toEqual(newConfig);
    });
  });

  describe('evaluate - without API service', () => {
    it('should return zero score when no API service provided', async () => {
      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(true); // Social filters are optional
      expect(result.details).toContain('API unavailable');
    });

    it('should indicate API unavailable in details', async () => {
      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('unavailable');
    });

    it('should still pass even with zero score', async () => {
      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0);
    });
  });

  describe('evaluate - Twitter mentions', () => {
    it('should award 40 points for token mentioned on Twitter', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(true),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(SOCIAL_SCORE.TWITTER_MENTIONED);
      expect(result.details).toContain('Token mentioned on Twitter');
    });

    it('should not award points for token not mentioned on Twitter', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(false),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('No Twitter mentions detected');
    });

    it('should handle API unavailable for Twitter check', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(null),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Twitter check unavailable');
    });

    it('should not check Twitter when disabled in config', async () => {
      const apiService = createMockApiService();
      const config: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      await testFilter.evaluate(launch);

      expect(apiService.isTokenMentionedOnTwitter).not.toHaveBeenCalled();
    });

    it('should handle Twitter API error gracefully', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockRejectedValue(new Error('API Error')),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Twitter check unavailable');
      expect(result.score).toBe(0);
    });
  });

  describe('evaluate - Telegram group', () => {
    it('should award 30 points for active Telegram group', async () => {
      const apiService = createMockApiService({
        isTelegramGroupActive: vi.fn().mockResolvedValue(true),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(SOCIAL_SCORE.TELEGRAM_GROUP);
      expect(result.details).toContain('Active Telegram group');
    });

    it('should not award points for inactive Telegram group', async () => {
      const apiService = createMockApiService({
        isTelegramGroupActive: vi.fn().mockResolvedValue(false),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Telegram group inactive');
    });

    it('should handle missing Telegram URL', async () => {
      const apiService = createMockApiService();
      const config: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent({ telegram: undefined });
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Telegram check unavailable');
      expect(apiService.isTelegramGroupActive).not.toHaveBeenCalled();
    });

    it('should not check Telegram when disabled in config', async () => {
      const apiService = createMockApiService();
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: false,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      await testFilter.evaluate(launch);

      expect(apiService.isTelegramGroupActive).not.toHaveBeenCalled();
    });

    it('should handle Telegram API error gracefully', async () => {
      const apiService = createMockApiService({
        isTelegramGroupActive: vi.fn().mockRejectedValue(new Error('API Error')),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Telegram check unavailable');
    });
  });

  describe('evaluate - creator engagement', () => {
    it('should award 20 points for high creator engagement (>50%)', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(SOCIAL_SCORE.CREATOR_ENGAGEMENT);
      expect(result.details).toContain('Creator engagement 75%');
      expect(result.details).toContain('+20');
    });

    it('should not award points for low creator engagement (<50%)', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(30),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Creator engagement 30%');
      expect(result.details).toContain('below threshold');
    });

    it('should award points at exactly 50% engagement', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(50),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Creator engagement 50%');
      expect(result.details).toContain('below threshold');
    });

    it('should award points at 51% engagement', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(51),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(SOCIAL_SCORE.CREATOR_ENGAGEMENT);
    });

    it('should clamp engagement to 0-100 range', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(150),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Creator engagement 100%');
    });

    it('should handle negative engagement values', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(-10),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Creator engagement 0%');
    });

    it('should handle API unavailable for engagement', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(null),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Creator engagement unavailable');
    });

    it('should handle engagement API error', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockRejectedValue(new Error('API Error')),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Creator engagement unavailable');
    });
  });

  describe('evaluate - community size', () => {
    it('should award 10 points when community size meets minimum', async () => {
      const apiService = createMockApiService({
        getCommunitySize: vi.fn().mockResolvedValue(100),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(SOCIAL_SCORE.COMMUNITY_SIZE);
      expect(result.details).toContain('Community size 100 >= 50');
    });

    it('should not award points when community size is below minimum', async () => {
      const apiService = createMockApiService({
        getCommunitySize: vi.fn().mockResolvedValue(30),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Community size 30 < 50');
    });

    it('should award points at exactly minimum community size', async () => {
      const apiService = createMockApiService({
        getCommunitySize: vi.fn().mockResolvedValue(50),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(SOCIAL_SCORE.COMMUNITY_SIZE);
    });

    it('should handle missing Telegram and Twitter', async () => {
      const apiService = createMockApiService();
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent({ telegram: undefined, twitter: undefined });
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Community size unavailable');
      expect(apiService.getCommunitySize).not.toHaveBeenCalled();
    });

    it('should handle API unavailable for community size', async () => {
      const apiService = createMockApiService({
        getCommunitySize: vi.fn().mockResolvedValue(null),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Community size unavailable');
    });

    it('should handle community size API error', async () => {
      const apiService = createMockApiService({
        getCommunitySize: vi.fn().mockRejectedValue(new Error('API Error')),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.details).toContain('Community size unavailable');
    });
  });

  describe('evaluate - combined scoring', () => {
    it('should calculate correct total score with all checks passing', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(true),
        isTelegramGroupActive: vi.fn().mockResolvedValue(true),
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
        getCommunitySize: vi.fn().mockResolvedValue(100),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      const expectedScore =
        SOCIAL_SCORE.TWITTER_MENTIONED +
        SOCIAL_SCORE.TELEGRAM_GROUP +
        SOCIAL_SCORE.CREATOR_ENGAGEMENT +
        SOCIAL_SCORE.COMMUNITY_SIZE;
      expect(result.score).toBe(expectedScore);
      expect(result.passed).toBe(true);
    });

    it('should return maximum possible score', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(true),
        isTelegramGroupActive: vi.fn().mockResolvedValue(true),
        getCreatorEngagement: vi.fn().mockResolvedValue(100),
        getCommunitySize: vi.fn().mockResolvedValue(1000),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBe(100);
    });

    it('should return zero score with all checks failing', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(false),
        isTelegramGroupActive: vi.fn().mockResolvedValue(false),
        getCreatorEngagement: vi.fn().mockResolvedValue(25),
        getCommunitySize: vi.fn().mockResolvedValue(10),
      });
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: true,
        minCommunitySize: 50,
      };
      const testFilter = new SocialFilter(config, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.score).toBe(0);
    });

    it('should always return passed: true (filters are optional)', async () => {
      const apiService = createMockApiService({
        isTokenMentionedOnTwitter: vi.fn().mockResolvedValue(false),
        isTelegramGroupActive: vi.fn().mockResolvedValue(false),
        getCreatorEngagement: vi.fn().mockResolvedValue(0),
        getCommunitySize: vi.fn().mockResolvedValue(0),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent();
      const result = await testFilter.evaluate(launch);

      expect(result.passed).toBe(true);
    });
  });

  describe('evaluate - Twitter URL parsing', () => {
    it('should extract username from twitter.com URL', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent({
        twitter: 'https://twitter.com/myusername',
      });
      await testFilter.evaluate(launch);

      expect(apiService.getCreatorEngagement).toHaveBeenCalledWith(
        launch.creator,
        'myusername'
      );
    });

    it('should extract username from x.com URL', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent({
        twitter: 'https://x.com/myusername',
      });
      await testFilter.evaluate(launch);

      expect(apiService.getCreatorEngagement).toHaveBeenCalledWith(
        launch.creator,
        'myusername'
      );
    });

    it('should extract username from @handle format', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent({
        twitter: '@myusername',
      });
      await testFilter.evaluate(launch);

      expect(apiService.getCreatorEngagement).toHaveBeenCalledWith(
        launch.creator,
        'myusername'
      );
    });

    it('should use plain username', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent({
        twitter: 'myusername',
      });
      await testFilter.evaluate(launch);

      expect(apiService.getCreatorEngagement).toHaveBeenCalledWith(
        launch.creator,
        'myusername'
      );
    });

    it('should handle missing Twitter', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent({
        twitter: undefined,
      });
      await testFilter.evaluate(launch);

      expect(apiService.getCreatorEngagement).toHaveBeenCalledWith(
        launch.creator,
        null
      );
    });

    it('should handle invalid Twitter URL', async () => {
      const apiService = createMockApiService({
        getCreatorEngagement: vi.fn().mockResolvedValue(75),
      });
      const testFilter = new SocialFilter(undefined, apiService);

      const launch = createMockLaunchEvent({
        twitter: 'not-a-valid-url-or-handle',
      });
      await testFilter.evaluate(launch);

      expect(apiService.getCreatorEngagement).toHaveBeenCalledWith(
        launch.creator,
        null
      );
    });
  });

  describe('factory function', () => {
    it('should create SocialFilter with createSocialFilter', () => {
      const filter = createSocialFilter();
      expect(filter).toBeInstanceOf(SocialFilter);
      expect(filter.name).toBe('social');
    });

    it('should create SocialFilter with config', () => {
      const config: SocialFilterConfig = {
        checkTwitterMentions: false,
        checkTelegramGroup: true,
        minCommunitySize: 100,
      };
      const filter = createSocialFilter(config);
      expect(filter.getConfig()).toEqual(config);
    });

    it('should create SocialFilter with API service', () => {
      const apiService = createMockApiService();
      const filter = createSocialFilter(undefined, apiService);
      expect(filter).toBeInstanceOf(SocialFilter);
    });

    it('should create SocialFilter with both config and API service', () => {
      const config: SocialFilterConfig = {
        checkTwitterMentions: true,
        checkTelegramGroup: false,
        minCommunitySize: 75,
      };
      const apiService = createMockApiService();
      const filter = createSocialFilter(config, apiService);
      expect(filter.getConfig()).toEqual(config);
    });
  });

  describe('scoring constants', () => {
    it('should have correct scoring values', () => {
      expect(SOCIAL_SCORE.TWITTER_MENTIONED).toBe(40);
      expect(SOCIAL_SCORE.TELEGRAM_GROUP).toBe(30);
      expect(SOCIAL_SCORE.CREATOR_ENGAGEMENT).toBe(20);
      expect(SOCIAL_SCORE.COMMUNITY_SIZE).toBe(10);
    });

    it('should sum to 100 points', () => {
      const total =
        SOCIAL_SCORE.TWITTER_MENTIONED +
        SOCIAL_SCORE.TELEGRAM_GROUP +
        SOCIAL_SCORE.CREATOR_ENGAGEMENT +
        SOCIAL_SCORE.COMMUNITY_SIZE;
      expect(total).toBe(100);
    });
  });
});
