/**
 * Base types and interfaces for the filter system
 */

import type { LaunchpadLaunchEvent, FilterResult } from '../types/index.js';

/**
 * Base interface that all filters must implement
 */
export interface Filter<TConfig = unknown> {
  /** Unique name for this filter */
  readonly name: string;

  /**
   * Evaluate a launch event against this filter's criteria
   * @param launch The launch event to evaluate
   * @returns A promise resolving to the filter result
   */
  evaluate(launch: LaunchpadLaunchEvent): Promise<FilterResult>;

  /**
   * Update the filter's configuration
   * @param config New configuration for this filter
   */
  updateConfig(config: TConfig): void;
}

/**
 * Filter categories in the pipeline
 */
export type FilterCategory = 'creator' | 'technical' | 'social' | 'liquidity';

/**
 * Map of filter category to filter instance
 */
export interface FilterRegistry {
  creator: Filter;
  technical: Filter;
  social: Filter;
  liquidity: Filter;
}
