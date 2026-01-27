/**
 * Scoring Engine implementation for calculating weighted scores
 *
 * The ScoringEngine calculates weighted total scores from individual filter results,
 * determines if scores meet alert thresholds, and provides confidence level assessments.
 */

import type { FilterResult, ScoringConfig } from '../types/index.js';
import { DEFAULT_SCORING_CONFIG } from '../config/defaults.js';

/**
 * Confidence level for a scoring result
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * ScoringEngine calculates and evaluates scores from filter results
 */
export class ScoringEngine {
  private config: ScoringConfig;

  /**
   * Create a new ScoringEngine
   * @param config Optional scoring configuration (uses defaults if not provided)
   */
  constructor(config?: ScoringConfig) {
    this.config = config ?? DEFAULT_SCORING_CONFIG;
  }

  /**
   * Calculate weighted total score from filter results
   * Formula: (creator.score * 0.40) + (technical.score * 0.30) + (social.score * 0.20) + (liquidity.score * 0.10)
   *
   * @param filters Object containing scores for creator, technical, social, and liquidity filters
   * @returns Weighted total score (0-100)
   */
  calculate(filters: {
    creator: FilterResult;
    technical: FilterResult;
    social: FilterResult;
    liquidity: FilterResult;
  }): number {
    const { weights } = this.config;

    // Calculate weighted sum
    const weightedSum =
      filters.creator.score * weights.creator +
      filters.technical.score * weights.technical +
      filters.social.score * weights.social +
      filters.liquidity.score * weights.liquidity;

    // Calculate total weight
    const totalWeight =
      weights.creator +
      weights.technical +
      weights.social +
      weights.liquidity;

    // Normalize and clamp to 0-100 range
    if (totalWeight === 0) {
      return 0;
    }

    const normalizedScore = weightedSum / totalWeight;
    const clampedScore = Math.max(0, Math.min(100, normalizedScore));

    // Round to 2 decimal places for precision
    return Math.round(clampedScore * 100) / 100;
  }

  /**
   * Check if a score meets the minimum alert threshold
   * @param score The score to evaluate
   * @returns True if score >= minScoreToAlert, false otherwise
   */
  meetsThreshold(score: number): boolean {
    return score >= this.config.minScoreToAlert;
  }

  /**
   * Get the confidence level for a given score
   * - low: < 60
   * - medium: 60-79
   * - high: >= 80
   *
   * @param score The score to evaluate
   * @returns Confidence level
   */
  getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= this.config.minScoreForHighConfidence) {
      return 'high';
    }
    if (score >= this.config.minScoreToAlert) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Update the scoring configuration
   * @param config New scoring configuration
   */
  updateConfig(config: ScoringConfig): void {
    this.config = config;
  }

  /**
   * Get the current scoring configuration
   * @returns Current scoring configuration
   */
  getConfig(): ScoringConfig {
    return this.config;
  }
}

/**
 * Create a new ScoringEngine instance
 * @param config Optional scoring configuration
 * @returns A new ScoringEngine instance
 */
export function createScoringEngine(config?: ScoringConfig): ScoringEngine {
  return new ScoringEngine(config);
}
