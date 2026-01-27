/**
 * Creator Filter implementation for evaluating token launch creators
 *
 * This filter evaluates creators based on social verification,
 * previous launch history, and account metrics.
 *
 * Scoring (total 100 points):
 * - Has verified Twitter: 25 points
 * - Has verified TikTok: 15 points
 * - Previous successful launches (no rugs): 30 points
 * - Follower count > threshold: 20 points
 * - Account age > 30 days: 10 points
 */

import type { Filter } from './types.js';
import type {
  LaunchpadLaunchEvent,
  FilterResult,
  CreatorFilterConfig,
} from '../types/index.js';
import { DEFAULT_CREATOR_FILTER } from '../config/defaults.js';

/**
 * Scoring constants for the creator filter
 */
export const CREATOR_SCORE = {
  VERIFIED_TWITTER: 25,
  VERIFIED_TIKTOK: 15,
  PREVIOUS_LAUNCHES: 30,
  FOLLOWER_COUNT: 20,
  ACCOUNT_AGE: 10,
} as const;

/**
 * Interface for StateService methods used by CreatorFilter
 * This interface allows dependency injection and mocking for testing
 */
export interface IStateService {
  /**
   * Get the launch wallet for a Twitter username
   * Returns the wallet address if the Twitter account is verified
   * @throws Error if Twitter is not verified
   */
  getLaunchWalletForTwitterUsername(
    twitterUsername: string
  ): Promise<{ toString(): string }>;

  /**
   * Get launch wallet for a social provider (v2)
   * Returns wallet state including platform data and verification
   */
  getLaunchWalletV2(
    username: string,
    provider: 'twitter' | 'tiktok' | 'kick' | 'github'
  ): Promise<{
    wallet: { toString(): string } | null;
    platformData: {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string;
    } | null;
  }>;

  /**
   * Get token creators for a given mint
   * Used to check previous launches by a creator
   */
  getTokenCreators(tokenMint: { toString(): string }): Promise<
    {
      username: string;
      wallet: string;
      isCreator: boolean;
      provider: string | null;
    }[]
  >;
}

/**
 * Interface for external API service to get follower count and account age
 * These are external APIs that should gracefully fail
 */
export interface IExternalApiService {
  /**
   * Get follower count for a social account
   * Returns null if unavailable
   */
  getFollowerCount(
    provider: 'twitter' | 'tiktok',
    username: string
  ): Promise<number | null>;

  /**
   * Get account age in days for a social account
   * Returns null if unavailable
   */
  getAccountAgeDays(
    provider: 'twitter' | 'tiktok',
    username: string
  ): Promise<number | null>;
}

/**
 * Interface for launch history service to check for rugged tokens
 */
export interface ILaunchHistoryService {
  /**
   * Get previous token launches by a creator wallet
   * Returns list of token mints launched by this wallet
   */
  getCreatorLaunches(creatorWallet: string): Promise<string[]>;

  /**
   * Check if a token was rugged (creator dumped tokens causing >90% price drop)
   */
  isTokenRugged(tokenMint: string): Promise<boolean>;
}

/**
 * Dependencies for CreatorFilter
 */
export interface CreatorFilterDependencies {
  stateService: IStateService;
  externalApiService?: IExternalApiService | undefined;
  launchHistoryService?: ILaunchHistoryService | undefined;
}

/**
 * Internal scoring details for transparency
 */
interface ScoringDetails {
  twitterVerified: boolean;
  twitterScore: number;
  tiktokVerified: boolean;
  tiktokScore: number;
  previousLaunchesClean: boolean;
  previousLaunchesScore: number;
  followerCountMet: boolean;
  followerCountScore: number;
  accountAgeMet: boolean;
  accountAgeScore: number;
}

/**
 * CreatorFilter evaluates token launch creators based on:
 * - Social verification (Twitter, TikTok)
 * - Previous launch history
 * - Follower count
 * - Account age
 */
export class CreatorFilter implements Filter<CreatorFilterConfig> {
  readonly name = 'creator';

  private config: CreatorFilterConfig;
  private readonly stateService: IStateService;
  private readonly externalApiService: IExternalApiService | undefined;
  private readonly launchHistoryService: ILaunchHistoryService | undefined;

  constructor(
    dependencies: CreatorFilterDependencies,
    config?: CreatorFilterConfig
  ) {
    this.stateService = dependencies.stateService;
    this.externalApiService = dependencies.externalApiService;
    this.launchHistoryService = dependencies.launchHistoryService;
    this.config = config ?? DEFAULT_CREATOR_FILTER;
  }

  /**
   * Evaluate a launch event against creator criteria
   */
  async evaluate(launch: LaunchpadLaunchEvent): Promise<FilterResult> {
    const details: ScoringDetails = {
      twitterVerified: false,
      twitterScore: 0,
      tiktokVerified: false,
      tiktokScore: 0,
      previousLaunchesClean: false,
      previousLaunchesScore: 0,
      followerCountMet: false,
      followerCountScore: 0,
      accountAgeMet: false,
      accountAgeScore: 0,
    };

    // Extract Twitter username from launch event
    const twitterUsername = this.extractTwitterUsername(launch.twitter);

    // Check Twitter verification (25 points)
    if (twitterUsername !== null && twitterUsername !== '') {
      details.twitterVerified = await this.checkTwitterVerified(
        twitterUsername,
        launch.creator
      );
      if (details.twitterVerified) {
        details.twitterScore = CREATOR_SCORE.VERIFIED_TWITTER;
      }
    }

    // Check TikTok verification (15 points)
    // For TikTok, we need to check if creator has verified TikTok via getLaunchWalletV2
    const tiktokVerification = this.checkTikTokVerified();
    details.tiktokVerified = tiktokVerification.verified;
    if (details.tiktokVerified) {
      details.tiktokScore = CREATOR_SCORE.VERIFIED_TIKTOK;
    }

    // Check previous launches (30 points)
    if (this.config.checkPreviousLaunches) {
      details.previousLaunchesClean = await this.checkPreviousLaunches(
        launch.creator
      );
      if (details.previousLaunchesClean) {
        details.previousLaunchesScore = CREATOR_SCORE.PREVIOUS_LAUNCHES;
      }
    } else {
      // If not checking previous launches, give full points
      details.previousLaunchesClean = true;
      details.previousLaunchesScore = CREATOR_SCORE.PREVIOUS_LAUNCHES;
    }

    // Check follower count (20 points)
    const followerCount = await this.getFollowerCount(
      twitterUsername,
      tiktokVerification.username
    );
    if (followerCount !== null && followerCount >= this.config.minFollowerCount) {
      details.followerCountMet = true;
      details.followerCountScore = CREATOR_SCORE.FOLLOWER_COUNT;
    }

    // Check account age (10 points)
    const accountAgeDays = await this.getAccountAge(
      twitterUsername,
      tiktokVerification.username
    );
    if (
      accountAgeDays !== null &&
      accountAgeDays >= this.config.minAccountAgeDays
    ) {
      details.accountAgeMet = true;
      details.accountAgeScore = CREATOR_SCORE.ACCOUNT_AGE;
    }

    // Calculate total score
    const score =
      details.twitterScore +
      details.tiktokScore +
      details.previousLaunchesScore +
      details.followerCountScore +
      details.accountAgeScore;

    // Determine if passed based on configuration
    const passed = this.determinePassed(details);

    return {
      passed,
      score,
      details: this.formatDetails(details, followerCount, accountAgeDays),
    };
  }

  /**
   * Update the filter configuration
   */
  updateConfig(config: CreatorFilterConfig): void {
    this.config = config;
  }

  /**
   * Get the current configuration
   */
  getConfig(): CreatorFilterConfig {
    return this.config;
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
   * Check if Twitter is verified for the creator
   */
  private async checkTwitterVerified(
    twitterUsername: string,
    creatorWallet: string
  ): Promise<boolean> {
    try {
      const walletResult =
        await this.stateService.getLaunchWalletForTwitterUsername(
          twitterUsername
        );
      // Check if the returned wallet matches the creator wallet
      return walletResult.toString() === creatorWallet;
    } catch {
      // Twitter not verified or error occurred
      return false;
    }
  }

  /**
   * Check if TikTok is verified for the creator
   * Returns both verification status and username for further checks
   *
   * Note: Currently returns not verified as we can't verify TikTok without
   * knowing the TikTok username beforehand. A real implementation would need
   * access to a wallet-to-social mapping or the launch event would need to
   * include the TikTok username.
   */
  private checkTikTokVerified(): { verified: boolean; username: string | null } {
    // We need to find if there's a TikTok account linked to this wallet
    // Since we don't have a direct lookup by wallet, we'll check using the API
    // In a real implementation, you might cache this or have a reverse lookup

    // For now, this would require knowing the TikTok username beforehand
    // The actual implementation would need access to a wallet-to-social mapping

    // Return not verified as we can't verify without the username
    return { verified: false, username: null };
  }

  /**
   * Check if creator has clean previous launches (no rugs)
   */
  private async checkPreviousLaunches(creatorWallet: string): Promise<boolean> {
    if (this.launchHistoryService === undefined) {
      // If no launch history service, give benefit of the doubt
      return true;
    }

    try {
      const previousLaunches =
        await this.launchHistoryService.getCreatorLaunches(creatorWallet);

      if (previousLaunches.length === 0) {
        // First-time launcher - considered clean
        return true;
      }

      // Check each previous launch for rugs
      for (const tokenMint of previousLaunches) {
        const isRugged = await this.launchHistoryService.isTokenRugged(
          tokenMint
        );
        if (isRugged) {
          return false;
        }
      }

      return true;
    } catch {
      // Error checking history - give benefit of the doubt
      return true;
    }
  }

  /**
   * Get follower count from external API
   * Tries Twitter first, then TikTok
   */
  private async getFollowerCount(
    twitterUsername: string | null,
    tiktokUsername: string | null
  ): Promise<number | null> {
    if (this.externalApiService === undefined) {
      return null;
    }

    try {
      // Try Twitter first
      if (twitterUsername !== null && twitterUsername !== '') {
        const twitterFollowers = await this.externalApiService.getFollowerCount(
          'twitter',
          twitterUsername
        );
        if (twitterFollowers !== null) {
          return twitterFollowers;
        }
      }

      // Try TikTok
      if (tiktokUsername !== null && tiktokUsername !== '') {
        const tiktokFollowers = await this.externalApiService.getFollowerCount(
          'tiktok',
          tiktokUsername
        );
        if (tiktokFollowers !== null) {
          return tiktokFollowers;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get account age from external API
   * Tries Twitter first, then TikTok
   */
  private async getAccountAge(
    twitterUsername: string | null,
    tiktokUsername: string | null
  ): Promise<number | null> {
    if (this.externalApiService === undefined) {
      return null;
    }

    try {
      // Try Twitter first
      if (twitterUsername !== null && twitterUsername !== '') {
        const twitterAge = await this.externalApiService.getAccountAgeDays(
          'twitter',
          twitterUsername
        );
        if (twitterAge !== null) {
          return twitterAge;
        }
      }

      // Try TikTok
      if (tiktokUsername !== null && tiktokUsername !== '') {
        const tiktokAge = await this.externalApiService.getAccountAgeDays(
          'tiktok',
          tiktokUsername
        );
        if (tiktokAge !== null) {
          return tiktokAge;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Determine if the filter passed based on configuration and scores
   */
  private determinePassed(details: ScoringDetails): boolean {
    // If verified social is required, at least one must be verified
    if (this.config.requireVerifiedSocial) {
      if (!details.twitterVerified && !details.tiktokVerified) {
        return false;
      }
    }

    // If checking previous launches is enabled and required, must be clean
    if (this.config.checkPreviousLaunches && !details.previousLaunchesClean) {
      return false;
    }

    return true;
  }

  /**
   * Format the details string for the filter result
   */
  private formatDetails(
    details: ScoringDetails,
    followerCount: number | null,
    accountAgeDays: number | null
  ): string {
    const parts: string[] = [];

    // Twitter verification
    if (details.twitterVerified) {
      parts.push(`Twitter verified (+${String(CREATOR_SCORE.VERIFIED_TWITTER)})`);
    } else {
      parts.push('Twitter not verified');
    }

    // TikTok verification
    if (details.tiktokVerified) {
      parts.push(`TikTok verified (+${String(CREATOR_SCORE.VERIFIED_TIKTOK)})`);
    } else {
      parts.push('TikTok not verified');
    }

    // Previous launches
    if (details.previousLaunchesClean) {
      parts.push(`Clean launch history (+${String(CREATOR_SCORE.PREVIOUS_LAUNCHES)})`);
    } else {
      parts.push('Previous rug detected');
    }

    // Follower count
    if (details.followerCountMet) {
      parts.push(
        `Follower count ${String(followerCount)} >= ${String(this.config.minFollowerCount)} (+${String(CREATOR_SCORE.FOLLOWER_COUNT)})`
      );
    } else if (followerCount !== null) {
      parts.push(
        `Follower count ${String(followerCount)} < ${String(this.config.minFollowerCount)}`
      );
    } else {
      parts.push('Follower count unavailable');
    }

    // Account age
    if (details.accountAgeMet) {
      parts.push(
        `Account age ${String(accountAgeDays)} days >= ${String(this.config.minAccountAgeDays)} (+${String(CREATOR_SCORE.ACCOUNT_AGE)})`
      );
    } else if (accountAgeDays !== null) {
      parts.push(
        `Account age ${String(accountAgeDays)} days < ${String(this.config.minAccountAgeDays)}`
      );
    } else {
      parts.push('Account age unavailable');
    }

    return parts.join('; ');
  }
}

/**
 * Create a new CreatorFilter instance
 */
export function createCreatorFilter(
  dependencies: CreatorFilterDependencies,
  config?: CreatorFilterConfig
): CreatorFilter {
  return new CreatorFilter(dependencies, config);
}
