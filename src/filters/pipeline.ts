/**
 * Filter Pipeline implementation for evaluating token launches
 *
 * The FilterPipeline orchestrates multiple filters in priority order,
 * aggregates results, and determines pass/fail based on scoring configuration.
 */

import type {
  LaunchpadLaunchEvent,
  FilterResult,
  FilterPipelineResult,
  FilterConfig,
  ScoringConfig,
} from '../types/index.js';
import type { FilterRegistry, FilterCategory } from './types.js';
import { DEFAULT_SCORING_CONFIG } from '../config/defaults.js';

/**
 * Configuration for the filter pipeline
 */
export interface FilterPipelineConfig {
  /** Configuration for individual filters */
  filters: FilterConfig;
  /** Scoring configuration for pass/fail determination */
  scoring: ScoringConfig;
}

/**
 * Filter execution priority order
 * Filters run in this order: creator -> technical -> social -> liquidity
 */
const FILTER_PRIORITY_ORDER: FilterCategory[] = [
  'creator',
  'technical',
  'social',
  'liquidity',
];

/**
 * FilterPipeline orchestrates the evaluation of token launches
 * through multiple filters and aggregates the results.
 */
export class FilterPipeline {
  private readonly filters: FilterRegistry;
  private scoringConfig: ScoringConfig;

  /**
   * Create a new FilterPipeline
   * @param filters Registry of filter implementations
   * @param scoringConfig Optional scoring configuration
   */
  constructor(filters: FilterRegistry, scoringConfig?: ScoringConfig) {
    this.filters = filters;
    this.scoringConfig = scoringConfig ?? DEFAULT_SCORING_CONFIG;
  }

  /**
   * Evaluate a launch event through all filters in priority order
   * @param launch The launch event to evaluate
   * @returns Promise resolving to the complete pipeline result
   */
  async evaluate(launch: LaunchpadLaunchEvent): Promise<FilterPipelineResult> {
    // Run filters in priority order
    const filterResults: Record<FilterCategory, FilterResult> = {
      creator: { passed: false, score: 0, details: '' },
      technical: { passed: false, score: 0, details: '' },
      social: { passed: false, score: 0, details: '' },
      liquidity: { passed: false, score: 0, details: '' },
    };

    for (const category of FILTER_PRIORITY_ORDER) {
      const filter = this.filters[category];
      filterResults[category] = await filter.evaluate(launch);
    }

    // Calculate weighted total score
    const totalScore = this.calculateTotalScore(filterResults);

    // Determine pass/fail based on minimum score threshold
    const passed = totalScore >= this.scoringConfig.minScoreToAlert;

    return {
      launch,
      totalScore,
      passed,
      filters: filterResults,
      timestamp: new Date(),
    };
  }

  /**
   * Update filter configuration
   * @param config New filter configuration
   */
  updateConfig(config: FilterConfig): void {
    this.filters.creator.updateConfig(config.creator);
    this.filters.technical.updateConfig(config.technical);
    this.filters.social.updateConfig(config.social);
    this.filters.liquidity.updateConfig(config.liquidity);
  }

  /**
   * Update scoring configuration
   * @param config New scoring configuration
   */
  updateScoringConfig(config: ScoringConfig): void {
    this.scoringConfig = config;
  }

  /**
   * Get the current scoring configuration
   * @returns Current scoring configuration
   */
  getScoringConfig(): ScoringConfig {
    return this.scoringConfig;
  }

  /**
   * Calculate the weighted total score from individual filter results
   * @param results Map of filter category to filter result
   * @returns Weighted total score (0-100)
   */
  private calculateTotalScore(
    results: Record<FilterCategory, FilterResult>
  ): number {
    const { weights } = this.scoringConfig;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const category of FILTER_PRIORITY_ORDER) {
      const result = results[category];
      const weight = weights[category];

      weightedSum += result.score * weight;
      totalWeight += weight;
    }

    // Normalize in case weights don't sum to 1
    if (totalWeight === 0) {
      return 0;
    }

    const normalizedScore = weightedSum / totalWeight;

    // Clamp to 0-100 range and round to 2 decimal places
    return Math.round(Math.max(0, Math.min(100, normalizedScore)) * 100) / 100;
  }
}

/**
 * Create a new FilterPipeline instance
 * @param filters Registry of filter implementations
 * @param scoringConfig Optional scoring configuration
 * @returns A new FilterPipeline instance
 */
export function createFilterPipeline(
  filters: FilterRegistry,
  scoringConfig?: ScoringConfig
): FilterPipeline {
  return new FilterPipeline(filters, scoringConfig);
}
