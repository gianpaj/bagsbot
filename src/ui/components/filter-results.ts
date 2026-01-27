/**
 * Filter Results Component
 *
 * Displays:
 * - Filter scores with icons (✓ pass, ○ partial, ✗ fail)
 * - Score out of 100 for each filter
 * - Brief details
 *
 * @module ui/components/filter-results
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
import * as OpenTUIRenderables from '@opentui/core';
import type { FilterResult } from '../../types/filters.js';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Configuration for filter results component
 */
export interface FilterResultsConfig {
  /** Creator filter result */
  creator: FilterResult;
  /** Technical filter result */
  technical: FilterResult;
  /** Social filter result */
  social: FilterResult;
  /** Liquidity filter result */
  liquidity: FilterResult;
  /** Total combined score */
  totalScore?: number;
  /** Whether the overall result passed */
  passed?: boolean;
}

/**
 * Get icon for filter result
 *
 * @param filterResult - The filter result
 * @returns Icon character
 */
function getFilterIcon(filterResult: FilterResult): string {
  if (filterResult.passed) {
    return '✓';
  }
  if (filterResult.score >= 50) {
    return '○';
  }
  return '✗';
}

/**
 * Get status text for filter result
 *
 * @param filterResult - The filter result
 * @returns Status text
 */
function getFilterStatus(filterResult: FilterResult): string {
  if (filterResult.passed) {
    return 'Pass';
  }
  if (filterResult.score >= 50) {
    return 'Partial';
  }
  return 'Fail';
}

/**
 * Create a single filter result row
 *
 * @param name - Filter name
 * @param result - Filter result
 * @param id - Component ID
 * @returns Filter result row component
 */
function createFilterRow(name: string, result: FilterResult, id: string): unknown {
  const icon = getFilterIcon(result);
  const status = getFilterStatus(result);
  const content = `${icon} ${name}: ${result.score}/100 (${status}) - ${result.details}`;

  return Text({
    id,
    content,
  });
}

/**
 * Create the filter results component
 *
 * @param config - Filter results configuration
 * @returns Filter results component (VNode-like)
 */
export function createFilterResults(config: FilterResultsConfig): unknown {
  const totalScore = config.totalScore ?? 0;
  const passed = config.passed ?? false;

  const children: unknown[] = [
    Text({
      id: 'filter-results-title',
      content: `FILTER RESULTS (${totalScore}/100${passed ? ' - PASSED' : ' - FAILED'})`,
    }),
    createFilterRow('Creator', config.creator, 'filter-creator'),
    createFilterRow('Technical', config.technical, 'filter-technical'),
    createFilterRow('Social', config.social, 'filter-social'),
    createFilterRow('Liquidity', config.liquidity, 'filter-liquidity'),
  ];

  return Box(
    {
      id: 'filter-results',
      flexDirection: 'column',
      width: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    },
    ...children
  );
}
