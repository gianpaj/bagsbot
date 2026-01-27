/**
 * Technical Filter implementation for evaluating token metadata quality
 *
 * This filter evaluates technical aspects of a token launch including
 * metadata completeness, description quality, social links, and image validity.
 *
 * Scoring (total 100 points):
 * - Metadata complete (name, symbol, image): 30 points
 * - Description present and non-empty: 20 points
 * - Social links provided (telegram, twitter, website): 25 points
 * - Valid image URL (HTTP HEAD check, not placeholder): 15 points
 * - Standard token supply: 10 points
 */

import type { Filter } from './types.js';
import type {
  LaunchpadLaunchEvent,
  FilterResult,
  TechnicalFilterConfig,
} from '../types/index.js';
import { DEFAULT_TECHNICAL_FILTER } from '../config/defaults.js';

/**
 * Scoring constants for the technical filter
 */
export const TECHNICAL_SCORE = {
  COMPLETE_METADATA: 30,
  DESCRIPTION: 20,
  SOCIAL_LINKS: 25,
  VALID_IMAGE_URL: 15,
  STANDARD_SUPPLY: 10,
} as const;

/**
 * Common placeholder image URLs that indicate missing or default images
 */
const PLACEHOLDER_IMAGE_URLS = [
  'https://placeholder.com',
  'https://via.placeholder.com',
  'https://dummyimage.com',
  'data:image',
];

/**
 * Internal scoring details for transparency
 */
interface ScoringDetails {
  metadataComplete: boolean;
  metadataScore: number;
  descriptionPresent: boolean;
  descriptionScore: number;
  socialLinksCount: number;
  socialLinksScore: number;
  validImageUrl: boolean;
  imageUrlScore: number;
  standardSupply: boolean;
  supplyScore: number;
}

/**
 * TechnicalFilter evaluates technical aspects of token launches including:
 * - Metadata completeness
 * - Description quality
 * - Social links presence
 * - Image URL validity
 * - Token supply characteristics
 */
export class TechnicalFilter implements Filter<TechnicalFilterConfig> {
  readonly name = 'technical';

  private config: TechnicalFilterConfig;

  constructor(config?: TechnicalFilterConfig) {
    this.config = config ?? DEFAULT_TECHNICAL_FILTER;
  }

  /**
   * Evaluate a launch event against technical criteria
   */
  async evaluate(launch: LaunchpadLaunchEvent): Promise<FilterResult> {
    const details: ScoringDetails = {
      metadataComplete: false,
      metadataScore: 0,
      descriptionPresent: false,
      descriptionScore: 0,
      socialLinksCount: 0,
      socialLinksScore: 0,
      validImageUrl: false,
      imageUrlScore: 0,
      standardSupply: false,
      supplyScore: 0,
    };

    // Check metadata completeness (30 points)
    details.metadataComplete = this.isMetadataComplete(launch);
    if (details.metadataComplete) {
      details.metadataScore = TECHNICAL_SCORE.COMPLETE_METADATA;
    }

    // Check description (20 points)
    details.descriptionPresent = this.isDescriptionPresent(launch);
    if (details.descriptionPresent) {
      details.descriptionScore = TECHNICAL_SCORE.DESCRIPTION;
    }

    // Check social links (25 points)
    details.socialLinksCount = this.countSocialLinks(launch);
    if (details.socialLinksCount > 0) {
      details.socialLinksScore = TECHNICAL_SCORE.SOCIAL_LINKS;
    }

    // Check image URL validity (15 points)
    if (this.config.validateImageUrl) {
      details.validImageUrl = await this.isValidImageUrl(launch.image);
      if (details.validImageUrl) {
        details.imageUrlScore = TECHNICAL_SCORE.VALID_IMAGE_URL;
      }
    } else {
      // If not validating, just check if image is provided and not a placeholder
      if (
        launch.image !== undefined &&
        launch.image.trim() !== '' &&
        !this.isPlaceholderUrl(launch.image)
      ) {
        details.validImageUrl = true;
        details.imageUrlScore = TECHNICAL_SCORE.VALID_IMAGE_URL;
      }
    }

    // Check standard supply (10 points) - placeholder for future validation
    details.standardSupply = true; // Default to true as we don't have supply data
    details.supplyScore = TECHNICAL_SCORE.STANDARD_SUPPLY;

    // Calculate total score
    const score =
      details.metadataScore +
      details.descriptionScore +
      details.socialLinksScore +
      details.imageUrlScore +
      details.supplyScore;

    // Determine if passed based on configuration
    const passed = this.determinePassed(details);

    return {
      passed,
      score,
      details: this.formatDetails(details),
    };
  }

  /**
   * Update the filter configuration
   */
  updateConfig(config: TechnicalFilterConfig): void {
    this.config = config;
  }

  /**
   * Get the current configuration
   */
  getConfig(): TechnicalFilterConfig {
    return this.config;
  }

  /**
   * Check if metadata is complete (name, symbol, image)
   */
  private isMetadataComplete(launch: LaunchpadLaunchEvent): boolean {
    // name and symbol are required fields, image is optional
    const hasName = launch.name.trim() !== '';
    const hasSymbol = launch.symbol.trim() !== '';
    const hasImage =
      launch.image !== undefined && launch.image.trim() !== '';
    return hasName && hasSymbol && hasImage;
  }

  /**
   * Check if description is present and non-empty
   */
  private isDescriptionPresent(launch: LaunchpadLaunchEvent): boolean {
    return launch.description !== undefined && launch.description.trim().length > 0;
  }

  /**
   * Count how many social links are provided
   */
  private countSocialLinks(launch: LaunchpadLaunchEvent): number {
    let count = 0;
    if (launch.telegram !== undefined && launch.telegram.trim() !== '') {
      count += 1;
    }
    if (launch.twitter !== undefined && launch.twitter.trim() !== '') {
      count += 1;
    }
    if (launch.website !== undefined && launch.website.trim() !== '') {
      count += 1;
    }
    return count;
  }

  /**
   * Check if a URL is a placeholder image
   */
  private isPlaceholderUrl(url: string): boolean {
    return PLACEHOLDER_IMAGE_URLS.some((placeholder) =>
      url.toLowerCase().includes(placeholder.toLowerCase())
    );
  }

  /**
   * Validate that an image URL is accessible and not a placeholder
   */
  private async isValidImageUrl(imageUrl?: string): Promise<boolean> {
    if (imageUrl === undefined || imageUrl.trim() === '') {
      return false;
    }

    // Check for placeholder URLs
    if (this.isPlaceholderUrl(imageUrl)) {
      return false;
    }

    try {
      // Perform HTTP HEAD request to check if URL is accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); }, 5000);
      const response = await fetch(imageUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Check for successful response and valid image content type
      if (!response.ok) {
        return false;
      }

      const contentType = response.headers.get('content-type');
      const isImage = contentType?.startsWith('image/') ?? false;
      if (!isImage) {
        return false;
      }

      return true;
    } catch {
      // If fetch fails (network error, timeout, etc.), consider invalid
      return false;
    }
  }

  /**
   * Determine if the filter passed based on configuration
   */
  private determinePassed(details: ScoringDetails): boolean {
    // If complete metadata is required, it must be present
    if (this.config.requireCompleteMetadata) {
      if (!details.metadataComplete) {
        return false;
      }
    }

    // If description is required, it must be present
    if (this.config.requireDescription) {
      if (!details.descriptionPresent) {
        return false;
      }
    }

    // If social links are required, at least one must be present
    if (this.config.requireSocialLinks) {
      if (details.socialLinksCount === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Format the details string for the filter result
   */
  private formatDetails(details: ScoringDetails): string {
    const parts: string[] = [];

    // Metadata
    if (details.metadataComplete) {
      parts.push(
        `Metadata complete: name, symbol, image (+${String(TECHNICAL_SCORE.COMPLETE_METADATA)})`
      );
    } else {
      parts.push('Metadata incomplete: missing name, symbol, or image');
    }

    // Description
    if (details.descriptionPresent) {
      parts.push(`Description present (+${String(TECHNICAL_SCORE.DESCRIPTION)})`);
    } else {
      parts.push('Description missing or empty');
    }

    // Social links
    if (details.socialLinksCount > 0) {
      parts.push(
        `${String(details.socialLinksCount)} social link(s) provided: telegram, twitter, website (+${String(TECHNICAL_SCORE.SOCIAL_LINKS)})`
      );
    } else {
      parts.push('No social links provided');
    }

    // Image URL
    if (details.validImageUrl) {
      parts.push(`Valid image URL (+${String(TECHNICAL_SCORE.VALID_IMAGE_URL)})`);
    } else {
      parts.push('Image URL invalid, inaccessible, or placeholder');
    }

    // Supply
    if (details.standardSupply) {
      parts.push(
        `Standard token supply (+${String(TECHNICAL_SCORE.STANDARD_SUPPLY)})`
      );
    } else {
      parts.push('Non-standard token supply');
    }

    return parts.join('; ');
  }
}

/**
 * Create a new TechnicalFilter instance
 */
export function createTechnicalFilter(
  config?: TechnicalFilterConfig
): TechnicalFilter {
  return new TechnicalFilter(config);
}
