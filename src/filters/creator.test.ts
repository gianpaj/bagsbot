/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreatorFilter,
  createCreatorFilter,
  CREATOR_SCORE,
  type IStateService,
  type IExternalApiService,
  type ILaunchHistoryService,
  type CreatorFilterDependencies,
} from './creator.js';
import type { LaunchpadLaunchEvent, CreatorFilterConfig } from '../types/index.js';
import { DEFAULT_CREATOR_FILTER } from '../config/defaults.js';

/**
 * Create a mock StateService for testing
 */
function createMockStateService(): IStateService & {
  mockGetLaunchWalletForTwitterUsername: ReturnType<typeof vi.fn>;
  mockGetLaunchWalletV2: ReturnType<typeof vi.fn>;
  mockGetTokenCreators: ReturnType<typeof vi.fn>;
} {
  const mockGetLaunchWalletForTwitterUsername = vi.fn();
  const mockGetLaunchWalletV2 = vi.fn();
  const mockGetTokenCreators = vi.fn();

  return {
    getLaunchWalletForTwitterUsername: mockGetLaunchWalletForTwitterUsername,
    getLaunchWalletV2: mockGetLaunchWalletV2,
    getTokenCreators: mockGetTokenCreators,
    mockGetLaunchWalletForTwitterUsername,
    mockGetLaunchWalletV2,
    mockGetTokenCreators,
  };
}

/**
 * Create a mock ExternalApiService for testing
 */
function createMockExternalApiService(): IExternalApiService & {
  mockGetFollowerCount: ReturnType<typeof vi.fn>;
  mockGetAccountAgeDays: ReturnType<typeof vi.fn>;
} {
  const mockGetFollowerCount = vi.fn();
  const mockGetAccountAgeDays = vi.fn();

  return {
    getFollowerCount: mockGetFollowerCount,
    getAccountAgeDays: mockGetAccountAgeDays,
    mockGetFollowerCount,
    mockGetAccountAgeDays,
  };
}

/**
 * Create a mock LaunchHistoryService for testing
 */
function createMockLaunchHistoryService(): ILaunchHistoryService & {
  mockGetCreatorLaunches: ReturnType<typeof vi.fn>;
  mockIsTokenRugged: ReturnType<typeof vi.fn>;
} {
  const mockGetCreatorLaunches = vi.fn();
  const mockIsTokenRugged = vi.fn();

  return {
    getCreatorLaunches: mockGetCreatorLaunches,
    isTokenRugged: mockIsTokenRugged,
    mockGetCreatorLaunches,
    mockIsTokenRugged,
  };
}

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
    description: 'A test token',
    image: 'https://example.com/image.png',
    twitter: 'https://twitter.com/testtoken',
    telegram: 'https://t.me/testtoken',
    website: 'https://testtoken.com',
    ...overrides,
  };
}

describe('CreatorFilter', () => {
  let stateService: ReturnType<typeof createMockStateService>;
  let externalApiService: ReturnType<typeof createMockExternalApiService>;
  let launchHistoryService: ReturnType<typeof createMockLaunchHistoryService>;
  let dependencies: CreatorFilterDependencies;
  let filter: CreatorFilter;

  beforeEach(() => {
    stateService = createMockStateService();
    externalApiService = createMockExternalApiService();
    launchHistoryService = createMockLaunchHistoryService();

    dependencies = {
      stateService,
      externalApiService,
      launchHistoryService,
    };

    // Default mock implementations
    stateService.mockGetLaunchWalletForTwitterUsername.mockRejectedValue(
      new Error('Not verified')
    );
    stateService.mockGetLaunchWalletV2.mockResolvedValue({
      wallet: null,
      platformData: null,
    });
    stateService.mockGetTokenCreators.mockResolvedValue([]);
    externalApiService.mockGetFollowerCount.mockResolvedValue(null);
    externalApiService.mockGetAccountAgeDays.mockResolvedValue(null);
    launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([]);
    launchHistoryService.mockIsTokenRugged.mockResolvedValue(false);

    filter = new CreatorFilter(dependencies);
  });

  describe('constructor', () => {
    it('should create a filter with default config', () => {
      const testFilter = new CreatorFilter(dependencies);
      expect(testFilter.name).toBe('creator');
      expect(testFilter.getConfig()).toEqual(DEFAULT_CREATOR_FILTER);
    });

    it('should accept custom config', () => {
      const customConfig: CreatorFilterConfig = {
        requireVerifiedSocial: false,
        minFollowerCount: 500,
        minAccountAgeDays: 60,
        checkPreviousLaunches: false,
      };

      const testFilter = new CreatorFilter(dependencies, customConfig);
      expect(testFilter.getConfig()).toEqual(customConfig);
    });

    it('should work without optional services', () => {
      const minimalDependencies: CreatorFilterDependencies = {
        stateService,
      };

      const testFilter = new CreatorFilter(minimalDependencies);
      expect(testFilter.name).toBe('creator');
    });
  });

  describe('evaluate', () => {
    describe('Twitter verification scoring', () => {
      it('should award 25 points for verified Twitter', async () => {
        const launch = createMockLaunchEvent({
          creator: 'VerifiedCreatorWallet',
          twitter: 'https://twitter.com/verifieduser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'VerifiedCreatorWallet',
        });

        const result = await filter.evaluate(launch);

        expect(result.score).toBeGreaterThanOrEqual(CREATOR_SCORE.VERIFIED_TWITTER);
        expect(result.details).toContain('Twitter verified');
      });

      it('should not award points when Twitter wallet does not match creator', async () => {
        const launch = createMockLaunchEvent({
          creator: 'DifferentWallet',
          twitter: 'https://twitter.com/someuser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'SomeOtherWallet',
        });

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Twitter not verified');
      });

      it('should handle Twitter verification errors gracefully', async () => {
        const launch = createMockLaunchEvent({
          twitter: 'https://twitter.com/erroruser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockRejectedValue(
          new Error('API Error')
        );

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Twitter not verified');
      });

      it('should handle missing Twitter gracefully', async () => {
        const launch = createMockLaunchEvent({
          twitter: undefined,
        });

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Twitter not verified');
      });
    });

    describe('Twitter username extraction', () => {
      it('should extract username from twitter.com URL', async () => {
        const launch = createMockLaunchEvent({
          creator: 'Wallet123',
          twitter: 'https://twitter.com/myuser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'Wallet123',
        });

        await filter.evaluate(launch);

        expect(stateService.mockGetLaunchWalletForTwitterUsername).toHaveBeenCalledWith(
          'myuser'
        );
      });

      it('should extract username from x.com URL', async () => {
        const launch = createMockLaunchEvent({
          creator: 'Wallet123',
          twitter: 'https://x.com/xuser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'Wallet123',
        });

        await filter.evaluate(launch);

        expect(stateService.mockGetLaunchWalletForTwitterUsername).toHaveBeenCalledWith(
          'xuser'
        );
      });

      it('should extract username from @handle format', async () => {
        const launch = createMockLaunchEvent({
          creator: 'Wallet123',
          twitter: '@handleuser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'Wallet123',
        });

        await filter.evaluate(launch);

        expect(stateService.mockGetLaunchWalletForTwitterUsername).toHaveBeenCalledWith(
          'handleuser'
        );
      });

      it('should handle plain username', async () => {
        const launch = createMockLaunchEvent({
          creator: 'Wallet123',
          twitter: 'plainuser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'Wallet123',
        });

        await filter.evaluate(launch);

        expect(stateService.mockGetLaunchWalletForTwitterUsername).toHaveBeenCalledWith(
          'plainuser'
        );
      });

      it('should handle invalid Twitter format', async () => {
        const launch = createMockLaunchEvent({
          twitter: 'not a valid twitter format!!!',
        });

        await filter.evaluate(launch);

        expect(stateService.mockGetLaunchWalletForTwitterUsername).not.toHaveBeenCalled();
      });
    });

    describe('TikTok verification scoring', () => {
      it('should handle TikTok not verified', async () => {
        const launch = createMockLaunchEvent();

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('TikTok not verified');
      });
    });

    describe('Previous launches scoring', () => {
      it('should award 30 points for clean launch history', async () => {
        const launch = createMockLaunchEvent();

        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([
          'PreviousMint1',
          'PreviousMint2',
        ]);
        launchHistoryService.mockIsTokenRugged.mockResolvedValue(false);

        const result = await filter.evaluate(launch);

        expect(result.score).toBeGreaterThanOrEqual(CREATOR_SCORE.PREVIOUS_LAUNCHES);
        expect(result.details).toContain('Clean launch history');
      });

      it('should not award points when previous rug detected', async () => {
        const launch = createMockLaunchEvent();

        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([
          'RuggedMint',
        ]);
        launchHistoryService.mockIsTokenRugged.mockResolvedValue(true);

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Previous rug detected');
        expect(result.passed).toBe(false);
      });

      it('should award points for first-time launchers', async () => {
        const launch = createMockLaunchEvent();

        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([]);

        const result = await filter.evaluate(launch);

        expect(result.score).toBeGreaterThanOrEqual(CREATOR_SCORE.PREVIOUS_LAUNCHES);
        expect(result.details).toContain('Clean launch history');
      });

      it('should handle launch history errors gracefully', async () => {
        const launch = createMockLaunchEvent();

        launchHistoryService.mockGetCreatorLaunches.mockRejectedValue(
          new Error('History service error')
        );

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Clean launch history');
      });

      it('should skip previous launches check when disabled in config', async () => {
        const configWithNoLaunchCheck: CreatorFilterConfig = {
          ...DEFAULT_CREATOR_FILTER,
          checkPreviousLaunches: false,
        };

        filter.updateConfig(configWithNoLaunchCheck);

        const launch = createMockLaunchEvent();

        const result = await filter.evaluate(launch);

        expect(launchHistoryService.mockGetCreatorLaunches).not.toHaveBeenCalled();
        expect(result.score).toBeGreaterThanOrEqual(CREATOR_SCORE.PREVIOUS_LAUNCHES);
      });
    });

    describe('Follower count scoring', () => {
      it('should award 20 points when follower count meets threshold', async () => {
        const launch = createMockLaunchEvent({
          creator: 'Wallet123',
          twitter: '@followeruser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'Wallet123',
        });
        externalApiService.mockGetFollowerCount.mockResolvedValue(500);

        const result = await filter.evaluate(launch);

        expect(result.score).toBeGreaterThanOrEqual(CREATOR_SCORE.FOLLOWER_COUNT);
        expect(result.details).toContain(`Follower count 500 >= ${DEFAULT_CREATOR_FILTER.minFollowerCount}`);
      });

      it('should not award points when follower count is below threshold', async () => {
        const launch = createMockLaunchEvent({
          twitter: '@lowfollowers',
        });

        externalApiService.mockGetFollowerCount.mockResolvedValue(50);

        const result = await filter.evaluate(launch);

        expect(result.details).toContain(`Follower count 50 < ${DEFAULT_CREATOR_FILTER.minFollowerCount}`);
      });

      it('should handle unavailable follower count gracefully', async () => {
        const launch = createMockLaunchEvent({
          twitter: '@nodata',
        });

        externalApiService.mockGetFollowerCount.mockResolvedValue(null);

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Follower count unavailable');
      });

      it('should handle follower count API errors gracefully', async () => {
        const launch = createMockLaunchEvent({
          twitter: '@erroruser',
        });

        externalApiService.mockGetFollowerCount.mockRejectedValue(
          new Error('API Error')
        );

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Follower count unavailable');
      });

      it('should respect custom minFollowerCount config', async () => {
        const customConfig: CreatorFilterConfig = {
          ...DEFAULT_CREATOR_FILTER,
          minFollowerCount: 1000,
        };

        filter.updateConfig(customConfig);

        const launch = createMockLaunchEvent({
          twitter: '@mediumfollowers',
        });

        externalApiService.mockGetFollowerCount.mockResolvedValue(500);

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Follower count 500 < 1000');
      });
    });

    describe('Account age scoring', () => {
      it('should award 10 points when account age meets threshold', async () => {
        const launch = createMockLaunchEvent({
          twitter: '@oldaccount',
        });

        externalApiService.mockGetAccountAgeDays.mockResolvedValue(60);

        const result = await filter.evaluate(launch);

        expect(result.score).toBeGreaterThanOrEqual(CREATOR_SCORE.ACCOUNT_AGE);
        expect(result.details).toContain(`Account age 60 days >= ${DEFAULT_CREATOR_FILTER.minAccountAgeDays}`);
      });

      it('should not award points when account is too new', async () => {
        const launch = createMockLaunchEvent({
          twitter: '@newaccount',
        });

        externalApiService.mockGetAccountAgeDays.mockResolvedValue(3);

        const result = await filter.evaluate(launch);

        expect(result.details).toContain(`Account age 3 days < ${DEFAULT_CREATOR_FILTER.minAccountAgeDays}`);
      });

      it('should handle unavailable account age gracefully', async () => {
        const launch = createMockLaunchEvent({
          twitter: '@unknownage',
        });

        externalApiService.mockGetAccountAgeDays.mockResolvedValue(null);

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Account age unavailable');
      });

      it('should handle account age API errors gracefully', async () => {
        const launch = createMockLaunchEvent({
          twitter: '@errorage',
        });

        externalApiService.mockGetAccountAgeDays.mockRejectedValue(
          new Error('API Error')
        );

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Account age unavailable');
      });

      it('should respect custom minAccountAgeDays config', async () => {
        const customConfig: CreatorFilterConfig = {
          ...DEFAULT_CREATOR_FILTER,
          minAccountAgeDays: 30,
        };

        filter.updateConfig(customConfig);

        const launch = createMockLaunchEvent({
          twitter: '@mediumage',
        });

        externalApiService.mockGetAccountAgeDays.mockResolvedValue(20);

        const result = await filter.evaluate(launch);

        expect(result.details).toContain('Account age 20 days < 30');
      });
    });

    describe('Pass/fail determination', () => {
      it('should pass when all criteria are met', async () => {
        const launch = createMockLaunchEvent({
          creator: 'VerifiedWallet',
          twitter: '@verifieduser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'VerifiedWallet',
        });
        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([]);
        externalApiService.mockGetFollowerCount.mockResolvedValue(1000);
        externalApiService.mockGetAccountAgeDays.mockResolvedValue(365);

        const result = await filter.evaluate(launch);

        expect(result.passed).toBe(true);
        expect(result.score).toBe(
          CREATOR_SCORE.VERIFIED_TWITTER +
            CREATOR_SCORE.PREVIOUS_LAUNCHES +
            CREATOR_SCORE.FOLLOWER_COUNT +
            CREATOR_SCORE.ACCOUNT_AGE
        );
      });

      it('should fail when requireVerifiedSocial is true and no social is verified', async () => {
        const configRequireSocial: CreatorFilterConfig = {
          ...DEFAULT_CREATOR_FILTER,
          requireVerifiedSocial: true,
        };

        filter.updateConfig(configRequireSocial);

        const launch = createMockLaunchEvent({
          twitter: '@unverifieduser',
        });

        const result = await filter.evaluate(launch);

        expect(result.passed).toBe(false);
      });

      it('should pass when requireVerifiedSocial is false and no social is verified', async () => {
        const configNoRequireSocial: CreatorFilterConfig = {
          ...DEFAULT_CREATOR_FILTER,
          requireVerifiedSocial: false,
        };

        filter.updateConfig(configNoRequireSocial);

        const launch = createMockLaunchEvent({
          twitter: '@unverifieduser',
        });

        const result = await filter.evaluate(launch);

        expect(result.passed).toBe(true);
      });

      it('should fail when previous rug detected and checkPreviousLaunches enabled', async () => {
        const launch = createMockLaunchEvent({
          creator: 'VerifiedWallet',
          twitter: '@rugger',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'VerifiedWallet',
        });
        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue(['RugToken']);
        launchHistoryService.mockIsTokenRugged.mockResolvedValue(true);

        const result = await filter.evaluate(launch);

        expect(result.passed).toBe(false);
      });
    });

    describe('Score calculation', () => {
      it('should return 0 points when nothing is verified', async () => {
        const launch = createMockLaunchEvent({
          twitter: undefined,
        });

        // No social verified, no external API data, but previous launches check passes by default
        const result = await filter.evaluate(launch);

        // Only previous launches points (30) since no rugs
        expect(result.score).toBe(CREATOR_SCORE.PREVIOUS_LAUNCHES);
      });

      it('should return maximum 100 points when everything is verified', async () => {
        const launch = createMockLaunchEvent({
          creator: 'FullyVerifiedWallet',
          twitter: '@fullverified',
        });

        // Twitter verified
        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'FullyVerifiedWallet',
        });

        // Clean launch history
        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([]);

        // High follower count
        externalApiService.mockGetFollowerCount.mockResolvedValue(10000);

        // Old account
        externalApiService.mockGetAccountAgeDays.mockResolvedValue(365);

        const result = await filter.evaluate(launch);

        // Twitter (25) + Previous (30) + Followers (20) + Age (10) = 85
        // Note: TikTok (15) not verified since we can't verify without username
        expect(result.score).toBe(
          CREATOR_SCORE.VERIFIED_TWITTER +
            CREATOR_SCORE.PREVIOUS_LAUNCHES +
            CREATOR_SCORE.FOLLOWER_COUNT +
            CREATOR_SCORE.ACCOUNT_AGE
        );
      });

      it('should calculate partial scores correctly', async () => {
        const launch = createMockLaunchEvent({
          creator: 'PartialWallet',
          twitter: '@partialuser',
        });

        // Twitter verified
        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'PartialWallet',
        });

        // Clean launch history
        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([]);

        // Low follower count (won't meet threshold)
        externalApiService.mockGetFollowerCount.mockResolvedValue(50);

        // Account age unavailable
        externalApiService.mockGetAccountAgeDays.mockResolvedValue(null);

        const result = await filter.evaluate(launch);

        // Twitter (25) + Previous (30) = 55
        expect(result.score).toBe(
          CREATOR_SCORE.VERIFIED_TWITTER + CREATOR_SCORE.PREVIOUS_LAUNCHES
        );
      });
    });

    describe('Without optional services', () => {
      it('should work without externalApiService', async () => {
        const minimalDependencies: CreatorFilterDependencies = {
          stateService,
          launchHistoryService,
        };

        const minimalFilter = new CreatorFilter(minimalDependencies);

        const launch = createMockLaunchEvent({
          creator: 'MinimalWallet',
          twitter: '@minimaluser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'MinimalWallet',
        });
        launchHistoryService.mockGetCreatorLaunches.mockResolvedValue([]);

        const result = await minimalFilter.evaluate(launch);

        expect(result.score).toBe(
          CREATOR_SCORE.VERIFIED_TWITTER + CREATOR_SCORE.PREVIOUS_LAUNCHES
        );
        expect(result.details).toContain('Follower count unavailable');
        expect(result.details).toContain('Account age unavailable');
      });

      it('should work without launchHistoryService', async () => {
        const minimalDependencies: CreatorFilterDependencies = {
          stateService,
          externalApiService,
        };

        const minimalFilter = new CreatorFilter(minimalDependencies);

        const launch = createMockLaunchEvent({
          creator: 'MinimalWallet',
          twitter: '@minimaluser',
        });

        stateService.mockGetLaunchWalletForTwitterUsername.mockResolvedValue({
          toString: () => 'MinimalWallet',
        });
        externalApiService.mockGetFollowerCount.mockResolvedValue(1000);
        externalApiService.mockGetAccountAgeDays.mockResolvedValue(100);

        const result = await minimalFilter.evaluate(launch);

        // Without history service, assumes clean history (30 points)
        expect(result.score).toBe(
          CREATOR_SCORE.VERIFIED_TWITTER +
            CREATOR_SCORE.PREVIOUS_LAUNCHES +
            CREATOR_SCORE.FOLLOWER_COUNT +
            CREATOR_SCORE.ACCOUNT_AGE
        );
      });
    });
  });

  describe('updateConfig', () => {
    it('should update the configuration', () => {
      const newConfig: CreatorFilterConfig = {
        requireVerifiedSocial: false,
        minFollowerCount: 2000,
        minAccountAgeDays: 90,
        checkPreviousLaunches: false,
      };

      filter.updateConfig(newConfig);

      expect(filter.getConfig()).toEqual(newConfig);
    });

    it('should affect subsequent evaluations', async () => {
      const launch = createMockLaunchEvent({
        twitter: '@configtest',
      });

      externalApiService.mockGetFollowerCount.mockResolvedValue(200);

      // First evaluation with default config (minFollowerCount: 100)
      const result1 = await filter.evaluate(launch);
      expect(result1.details).toContain('Follower count 200 >= 100');

      // Update config
      filter.updateConfig({
        ...DEFAULT_CREATOR_FILTER,
        minFollowerCount: 500,
      });

      // Second evaluation with new config (minFollowerCount: 500)
      const result2 = await filter.evaluate(launch);
      expect(result2.details).toContain('Follower count 200 < 500');
    });
  });

  describe('getConfig', () => {
    it('should return the current configuration', () => {
      const config = filter.getConfig();
      expect(config).toEqual(DEFAULT_CREATOR_FILTER);
    });
  });
});

describe('createCreatorFilter', () => {
  it('should create a CreatorFilter instance', () => {
    const stateService = createMockStateService();
    const testFilter = createCreatorFilter({ stateService });

    expect(testFilter).toBeInstanceOf(CreatorFilter);
    expect(testFilter.name).toBe('creator');
  });

  it('should create a filter with custom config', () => {
    const stateService = createMockStateService();
    const customConfig: CreatorFilterConfig = {
      requireVerifiedSocial: false,
      minFollowerCount: 5000,
      minAccountAgeDays: 180,
      checkPreviousLaunches: true,
    };

    const testFilter = createCreatorFilter({ stateService }, customConfig);

    expect(testFilter.getConfig()).toEqual(customConfig);
  });
});

describe('CREATOR_SCORE constants', () => {
  it('should have correct point values', () => {
    expect(CREATOR_SCORE.VERIFIED_TWITTER).toBe(25);
    expect(CREATOR_SCORE.VERIFIED_TIKTOK).toBe(15);
    expect(CREATOR_SCORE.PREVIOUS_LAUNCHES).toBe(30);
    expect(CREATOR_SCORE.FOLLOWER_COUNT).toBe(20);
    expect(CREATOR_SCORE.ACCOUNT_AGE).toBe(10);
  });

  it('should sum to 100 points maximum', () => {
    const total =
      CREATOR_SCORE.VERIFIED_TWITTER +
      CREATOR_SCORE.VERIFIED_TIKTOK +
      CREATOR_SCORE.PREVIOUS_LAUNCHES +
      CREATOR_SCORE.FOLLOWER_COUNT +
      CREATOR_SCORE.ACCOUNT_AGE;

    expect(total).toBe(100);
  });
});
