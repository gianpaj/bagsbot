/**
 * Filter types for evaluating token launches
 */

import type { LaunchpadLaunchEvent } from './launch.js';

/**
 * Result of a single filter evaluation
 */
export interface FilterResult {
  /** Whether the filter passed */
  passed: boolean;
  /** Score from 0-100 */
  score: number;
  /** Human-readable details about the filter result */
  details: string;
}

/**
 * Configuration for creator verification filter
 */
export interface CreatorFilterConfig {
  /** Require the creator to have verified social accounts */
  requireVerifiedSocial: boolean;
  /** Minimum follower count for creator's social accounts */
  minFollowerCount: number;
  /** Minimum age of creator's account in days */
  minAccountAgeDays: number;
  /** Check creator's previous token launches */
  checkPreviousLaunches: boolean;
}

/**
 * Configuration for technical metadata filter
 */
export interface TechnicalFilterConfig {
  /** Require complete metadata (name, symbol, etc.) */
  requireCompleteMetadata: boolean;
  /** Require a description to be present */
  requireDescription: boolean;
  /** Require at least one social link */
  requireSocialLinks: boolean;
  /** Validate that the image URL is accessible */
  validateImageUrl: boolean;
}

/**
 * Configuration for social presence filter
 */
export interface SocialFilterConfig {
  /** Check for Twitter/X mentions of the token */
  checkTwitterMentions: boolean;
  /** Check for Telegram group presence */
  checkTelegramGroup: boolean;
  /** Minimum community size (followers/members) */
  minCommunitySize: number;
}

/**
 * Configuration for liquidity filter
 */
export interface LiquidityFilterConfig {
  /** Minimum initial liquidity in SOL */
  minInitialLiquiditySol: number;
  /** Maximum percentage on bonding curve */
  maxBondingCurvePercent: number;
  /** Maximum percentage held by top holder */
  maxTopHolderPercent: number;
}

/**
 * Combined configuration for all filters
 */
export interface FilterConfig {
  creator: CreatorFilterConfig;
  technical: TechnicalFilterConfig;
  social: SocialFilterConfig;
  liquidity: LiquidityFilterConfig;
}

/**
 * Complete result of running all filters on a launch
 */
export interface FilterPipelineResult {
  /** The original launch event */
  launch: LaunchpadLaunchEvent;
  /** Combined score from all filters (0-100) */
  totalScore: number;
  /** Whether the launch passed all required filters */
  passed: boolean;
  /** Individual filter results */
  filters: {
    creator: FilterResult;
    technical: FilterResult;
    social: FilterResult;
    liquidity: FilterResult;
  };
  /** When the filter evaluation was performed */
  timestamp: Date;
}
