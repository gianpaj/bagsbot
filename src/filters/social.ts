/**
 * Social Filter implementation for evaluating token social presence
 *
 * This filter evaluates social aspects of a token launch including
 * Twitter mentions, Telegram group activity, creator engagement, and community size.
 *
 * Scoring (total 100 points):
 * - Token mentioned on Twitter: 40 points
 * - Active Telegram group: 30 points
 * - Creator engagement: 20 points
 * - Community size meets minimum: 10 points
 *
 * Note: Social filters are optional. If API keys are missing, the filter
 * gracefully returns partial scores with "API unavailable" details.
 */

import type { Filter } from './types.js';
import type {
  LaunchpadLaunchEvent,
  FilterResult,
  SocialFilterConfig,
} from '../types/index.js';
import { DEFAULT_SOCIAL_FILTER } from '../config/defaults.js';

/**
 * Scoring constants for the social filter
 */
export const SOCIAL_SCORE = {
  TWITTER_MENTIONED: 40,
  TELEGRAM_GROUP: 30,
  CREATOR_ENGAGEMENT: 20,
  COMMUNITY_SIZE: 10,
} as const;

/**
 * Interface for social API service
 * This allows dependency injection and graceful handling of missing APIs
 */
export interface ISocialApiService {
  /**
   * Check if token is mentioned on Twitter
   * Returns true if mentioned, null if API unavailable
   */
  isTokenMentionedOnTwitter(tokenSymbol: string): Promise<boolean | null>;

  /**
   * Check if Telegram group is active
   * Returns true if active, null if API unavailable
   */
  isTelegramGroupActive(telegramUrl: string): Promise<boolean | null>;

  /**
   * Get creator engagement metrics (0-100)
   * Returns engagement score, null if API unavailable
   */
  getCreatorEngagement(
    creatorWallet: string,
    twitterUsername: string | null
  ): Promise<number | null>;

  /**
   * Get community size (followers/members)
   * Returns size, null if API unavailable
   */
  getCommunitySize(telegramUrl: string, twitterUsername: string | null): Promise<number | null>;
}

/**
 * Internal scoring details for transparency
 */
interface ScoringDetails {
  twitterMentioned: boolean;
  twitterScore: number;
  twitterAvailable: boolean;
  telegramActive: boolean;
  telegramScore: number;
  telegramAvailable: boolean;
  creatorEngagement: number;
  engagementScore: number;
  engagementAvailable: boolean;
  communitySizeMet: boolean;
  communityScore: number;
  communitySize: number | null;
  communityAvailable: boolean;
}

/**
 * SocialFilter evaluates social presence of token launches including:
 * - Twitter mentions
 * - Telegram group activity
 * - Creator engagement
 * - Community size
 */
export class SocialFilter implements Filter<SocialFilterConfig> {
  readonly name = 'social';

  private config: SocialFilterConfig;
  private readonly apiService: ISocialApiService | undefined;

  constructor(config?: SocialFilterConfig, apiService?: ISocialApiService) {
    this.config = config ?? DEFAULT_SOCIAL_FILTER;
    this.apiService = apiService;
  }

  /**
   * Evaluate a launch event against social criteria
   */
  async evaluate(launch: LaunchpadLaunchEvent): Promise<FilterResult> {
    const details: ScoringDetails = {
      twitterMentioned: false,
      twitterScore: 0,
      twitterAvailable: false,
      telegramActive: false,
      telegramScore: 0,
      telegramAvailable: false,
      creatorEngagement: 0,
      engagementScore: 0,
      engagementAvailable: false,
      communitySizeMet: false,
      communityScore: 0,
      communitySize: null,
      communityAvailable: false,
    };

    // Check Twitter mentions (40 points)
    if (this.config.checkTwitterMentions) {
      const twitterResult = await this.checkTwitterMentioned(launch.symbol);
      details.twitterAvailable = twitterResult.available;
      details.twitterMentioned = twitterResult.mentioned;
      if (details.twitterMentioned) {
        details.twitterScore = SOCIAL_SCORE.TWITTER_MENTIONED;
      }
    }

    // Check Telegram group activity (30 points)
    if (this.config.checkTelegramGroup) {
      const telegramResult = await this.checkTelegramActive(launch.telegram);
      details.telegramAvailable = telegramResult.available;
      details.telegramActive = telegramResult.active;
      if (details.telegramActive) {
        details.telegramScore = SOCIAL_SCORE.TELEGRAM_GROUP;
      }
    }

    // Extract Twitter username for engagement check
    const twitterUsername = this.extractTwitterUsername(launch.twitter);

    // Check creator engagement (20 points)
    const engagementResult = await this.checkCreatorEngagement(
      launch.creator,
      twitterUsername
    );
    details.engagementAvailable = engagementResult.available;
    details.creatorEngagement = engagementResult.engagement;
    // Award points if engagement is above 50%
    if (details.creatorEngagement > 50) {
      details.engagementScore = SOCIAL_SCORE.CREATOR_ENGAGEMENT;
    }

    // Check community size (10 points)
    const communityResult = await this.checkCommunitySize(
      launch.telegram,
      twitterUsername
    );
    details.communityAvailable = communityResult.available;
    details.communitySize = communityResult.size;
    if (
      details.communitySize !== null &&
      details.communitySize >= this.config.minCommunitySize
    ) {
      details.communitySizeMet = true;
      details.communityScore = SOCIAL_SCORE.COMMUNITY_SIZE;
    }

    // Calculate total score
    const score =
      details.twitterScore +
      details.telegramScore +
      details.engagementScore +
      details.communityScore;

    // Determine if passed (social filters are optional, so always pass)
    const passed = true;

    return {
      passed,
      score,
      details: this.formatDetails(details),
    };
  }

  /**
   * Update the filter configuration
   */
  updateConfig(config: SocialFilterConfig): void {
    this.config = config;
  }

  /**
   * Get the current configuration
   */
  getConfig(): SocialFilterConfig {
    return this.config;
  }

  /**
   * Check if token is mentioned on Twitter
   */
  private async checkTwitterMentioned(
    tokenSymbol: string
  ): Promise<{ mentioned: boolean; available: boolean }> {
    if (this.apiService === undefined) {
      return { mentioned: false, available: false };
    }

    try {
      const mentioned = await this.apiService.isTokenMentionedOnTwitter(
        tokenSymbol
      );
      if (mentioned === null) {
        return { mentioned: false, available: false };
      }
      return { mentioned, available: true };
    } catch {
      return { mentioned: false, available: false };
    }
  }

  /**
   * Check if Telegram group is active
   */
  private async checkTelegramActive(
    telegramUrl?: string
  ): Promise<{ active: boolean; available: boolean }> {
    if (telegramUrl === undefined || telegramUrl === '' || telegramUrl.trim() === '') {
      return { active: false, available: false };
    }

    if (this.apiService === undefined) {
      return { active: false, available: false };
    }

    try {
      const active = await this.apiService.isTelegramGroupActive(telegramUrl);
      if (active === null) {
        return { active: false, available: false };
      }
      return { active, available: true };
    } catch {
      return { active: false, available: false };
    }
  }

  /**
   * Check creator engagement
   */
  private async checkCreatorEngagement(
    creatorWallet: string,
    twitterUsername: string | null
  ): Promise<{ engagement: number; available: boolean }> {
    if (this.apiService === undefined) {
      return { engagement: 0, available: false };
    }

    try {
      const engagement = await this.apiService.getCreatorEngagement(
        creatorWallet,
        twitterUsername
      );
      if (engagement === null) {
        return { engagement: 0, available: false };
      }
      // Clamp between 0 and 100
      const clampedEngagement = Math.max(0, Math.min(100, engagement));
      return { engagement: clampedEngagement, available: true };
    } catch {
      return { engagement: 0, available: false };
    }
  }

  /**
   * Check community size
   */
  private async checkCommunitySize(
    telegramUrl: string | undefined,
    twitterUsername: string | null
  ): Promise<{ size: number | null; available: boolean }> {
    // If no social links, return no size
    if (
      (telegramUrl === undefined || telegramUrl === '' || telegramUrl.trim() === '') &&
      twitterUsername === null
    ) {
      return { size: null, available: false };
    }

    if (this.apiService === undefined) {
      return { size: null, available: false };
    }

    try {
      const size = await this.apiService.getCommunitySize(
        telegramUrl ?? '',
        twitterUsername
      );
      if (size === null) {
        return { size: null, available: false };
      }
      return { size, available: true };
    } catch {
      return { size: null, available: false };
    }
  }

  /**
   * Extract Twitter username from a Twitter URL or handle
   */
  private extractTwitterUsername(twitter?: string): string | null {
    if (twitter === undefined || twitter === '') {
      return null;
    }

    // Handle @username format
    if (twitter.startsWith('@')) {
      return twitter.slice(1);
    }

    // Handle twitter.com/username or x.com/username URLs
    const urlRegex = /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i;
    const urlMatch = urlRegex.exec(twitter);
    if (urlMatch !== null) {
      return urlMatch[1] ?? null;
    }

    // If it's just a username (no @ or URL)
    if (/^[a-zA-Z0-9_]+$/.test(twitter)) {
      return twitter;
    }

    return null;
  }

  /**
   * Format the details string for the filter result
   */
  private formatDetails(details: ScoringDetails): string {
    const parts: string[] = [];

    // Twitter mentions
    if (this.config.checkTwitterMentions) {
      if (details.twitterMentioned) {
        parts.push(
          `Token mentioned on Twitter (+${String(SOCIAL_SCORE.TWITTER_MENTIONED)})`
        );
      } else if (details.twitterAvailable) {
        parts.push('No Twitter mentions detected');
      } else {
        parts.push('Twitter check unavailable (API unavailable)');
      }
    }

    // Telegram group
    if (this.config.checkTelegramGroup) {
      if (details.telegramActive) {
        parts.push(
          `Active Telegram group (+${String(SOCIAL_SCORE.TELEGRAM_GROUP)})`
        );
      } else if (details.telegramAvailable) {
        parts.push('Telegram group inactive or not found');
      } else {
        parts.push('Telegram check unavailable (API unavailable)');
      }
    }

    // Creator engagement
    if (details.engagementScore > 0) {
      parts.push(
        `Creator engagement ${String(details.creatorEngagement)}% (+${String(SOCIAL_SCORE.CREATOR_ENGAGEMENT)})`
      );
    } else if (details.engagementAvailable) {
      parts.push(
        `Creator engagement ${String(details.creatorEngagement)}% (below threshold)`
      );
    } else {
      parts.push('Creator engagement unavailable (API unavailable)');
    }

    // Community size
    if (details.communitySizeMet && details.communitySize !== null) {
      parts.push(
        `Community size ${String(details.communitySize)} >= ${String(this.config.minCommunitySize)} (+${String(SOCIAL_SCORE.COMMUNITY_SIZE)})`
      );
    } else if (details.communitySize !== null) {
      parts.push(
        `Community size ${String(details.communitySize)} < ${String(this.config.minCommunitySize)}`
      );
    } else {
      parts.push('Community size unavailable (API unavailable)');
    }

    return parts.join('; ');
  }
}

/**
 * Create a new SocialFilter instance
 */
export function createSocialFilter(
  config?: SocialFilterConfig,
  apiService?: ISocialApiService
): SocialFilter {
  return new SocialFilter(config, apiService);
}
