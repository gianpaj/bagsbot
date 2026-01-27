/**
 * Filter registry factory for creating the filter pipeline
 *
 * Creates all filter instances with their required dependencies.
 *
 * @module sdk/filter-registry
 */

import { PublicKey } from '@solana/web3.js';
import { BagsSDK } from '@bagsfm/bags-sdk';
import {
  createCreatorFilter,
  createTechnicalFilter,
  createSocialFilter,
  createLiquidityFilter,
  type FilterRegistry,
  type IStateService,
  type IExternalApiService,
  type ILaunchHistoryService,
  type ISocialApiService,
  type ILiquidityDataService,
  type LiquidityData,
} from '../filters/index.js';
import type { BotConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

const registryLogger = logger.child({ module: 'filter-registry' });

/**
 * Adapter that wraps the Bags SDK StateService to match our IStateService interface
 */
class StateServiceAdapter implements IStateService {
  private sdk: BagsSDK;

  constructor(sdk: BagsSDK) {
    this.sdk = sdk;
  }

  async getLaunchWalletForTwitterUsername(
    twitterUsername: string
  ): Promise<PublicKey> {
    // Use the SDK's state service to get launch wallet
    try {
      const result = await this.sdk.state.getLaunchWalletForTwitterUsername(twitterUsername);
      return result;
    } catch (error) {
      registryLogger.warn('Failed to get launch wallet for Twitter username', {
        twitterUsername,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getLaunchWalletV2(
    username: string,
    provider: 'twitter' | 'tiktok' | 'kick' | 'github'
  ): Promise<{
    wallet: PublicKey | null;
    platformData: {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string;
    } | null;
  }> {
    try {
      const result = await this.sdk.state.getLaunchWalletV2(username, provider);
      return result;
    } catch (error) {
      registryLogger.warn('Failed to get launch wallet v2', {
        username,
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return { wallet: null, platformData: null };
    }
  }

  async getTokenCreators(tokenMint: PublicKey): Promise<
    {
      username: string;
      wallet: string;
      isCreator: boolean;
      provider: string | null;
    }[]
  > {
    try {
      const result = await this.sdk.state.getTokenCreators(tokenMint);
      return result;
    } catch (error) {
      registryLogger.warn('Failed to get token creators', {
        mint: tokenMint.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

/**
 * Stub external API service for follower counts and account age
 * In production, this would integrate with Twitter/TikTok APIs
 */
class StubExternalApiService implements IExternalApiService {
  getFollowerCount(
    _provider: 'twitter' | 'tiktok',
    _username: string
  ): Promise<number | null> {
    // Return null - actual implementation would call Twitter/TikTok API
    return Promise.resolve(null);
  }

  getAccountAgeDays(
    _provider: 'twitter' | 'tiktok',
    _username: string
  ): Promise<number | null> {
    // Return null - actual implementation would call Twitter/TikTok API
    return Promise.resolve(null);
  }
}

/**
 * Stub launch history service for checking previous launches
 */
class StubLaunchHistoryService implements ILaunchHistoryService {
  getCreatorLaunches(_creatorWallet: string): Promise<string[]> {
    return Promise.resolve([]);
  }

  isTokenRugged(_tokenMint: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/**
 * Stub social API service for social metrics
 * In production, this would integrate with Twitter/TikTok APIs
 */
class StubSocialApiService implements ISocialApiService {
  isTokenMentionedOnTwitter(_tokenSymbol: string): Promise<boolean | null> {
    // Return null to indicate API unavailable - actual implementation would call Twitter API
    return Promise.resolve(null);
  }

  isTelegramGroupActive(_telegramUrl: string): Promise<boolean | null> {
    // Return null to indicate API unavailable - actual implementation would call Telegram API
    return Promise.resolve(null);
  }

  getCreatorEngagement(
    _creatorWallet: string,
    _twitterUsername: string | null
  ): Promise<number | null> {
    // Return null to indicate API unavailable
    return Promise.resolve(null);
  }

  getCommunitySize(
    _telegramUrl: string,
    _twitterUsername: string | null
  ): Promise<number | null> {
    // Return null to indicate API unavailable
    return Promise.resolve(null);
  }
}

/**
 * Stub liquidity data service
 * In production, this would fetch from DEX or liquidity pool APIs
 */
class StubLiquidityDataService implements ILiquidityDataService {
  getLiquidityData(_mint: string): Promise<LiquidityData> {
    // Return empty liquidity data - actual implementation would fetch from DEX APIs
    return Promise.resolve({});
  }
}

/**
 * Create a filter registry with all filter instances configured
 *
 * @param config - Bot configuration containing filter settings
 * @param sdk - Initialized Bags SDK instance
 * @returns Filter registry with all filters
 */
export function createFilterRegistry(
  config: BotConfig,
  sdk: BagsSDK
): FilterRegistry {
  registryLogger.info('Creating filter registry');

  // Create service adapters
  const stateService = new StateServiceAdapter(sdk);
  const externalApiService = new StubExternalApiService();
  const launchHistoryService = new StubLaunchHistoryService();
  const socialApiService = new StubSocialApiService();
  const liquidityDataService = new StubLiquidityDataService();

  // Create filters with their dependencies
  // Note: createCreatorFilter takes dependencies first, then config
  const creatorFilter = createCreatorFilter(
    {
      stateService,
      externalApiService,
      launchHistoryService,
    },
    config.filters.creator
  );

  const technicalFilter = createTechnicalFilter(config.filters.technical);

  const socialFilter = createSocialFilter(
    config.filters.social,
    socialApiService
  );

  const liquidityFilter = createLiquidityFilter(
    config.filters.liquidity,
    liquidityDataService
  );

  registryLogger.info('Filter registry created', {
    filters: ['creator', 'technical', 'social', 'liquidity'],
  });

  return {
    creator: creatorFilter,
    technical: technicalFilter,
    social: socialFilter,
    liquidity: liquidityFilter,
  };
}
