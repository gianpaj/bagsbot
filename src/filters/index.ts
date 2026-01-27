/**
 * Filter system for evaluating token launches
 *
 * This module exports the filter pipeline and related types
 * for running tokens through multiple evaluation criteria.
 */

// Pipeline
export { FilterPipeline, createFilterPipeline } from './pipeline.js';
export type { FilterPipelineConfig } from './pipeline.js';

// Filters
export { CreatorFilter, createCreatorFilter, CREATOR_SCORE } from './creator.js';
export type {
  IStateService,
  IExternalApiService,
  ILaunchHistoryService,
  CreatorFilterDependencies,
} from './creator.js';

export { TechnicalFilter, createTechnicalFilter, TECHNICAL_SCORE } from './technical.js';

// Types
export type { Filter, FilterCategory, FilterRegistry } from './types.js';
