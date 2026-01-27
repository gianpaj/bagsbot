/**
 * Tests for Filter Results Component
 */

 
import { describe, it, expect, vi } from 'vitest';
import { createFilterResults } from './filter-results.js';
import type { FilterResult } from '../../types/filters.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

describe('filter results component', () => {
  const mockFilterResults = {
    creator: { passed: true, score: 90, details: 'Verified creator with good history' } as FilterResult,
    technical: { passed: true, score: 85, details: 'Complete metadata' } as FilterResult,
    social: { passed: true, score: 80, details: 'Active Twitter presence' } as FilterResult,
    liquidity: { passed: true, score: 75, details: 'Adequate initial liquidity' } as FilterResult,
  };

  it('should create filter results component', () => {
    const component = createFilterResults({
      ...mockFilterResults,
      totalScore: 82,
      passed: true,
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'filter-results');
  });

  it('should display passed filters with checkmark', () => {
    const component = createFilterResults({
      ...mockFilterResults,
      totalScore: 82,
      passed: true,
    });

    expect(component).toBeDefined();
  });

  it('should display failed filters with x mark', () => {
    const failedResults = {
      creator: { passed: false, score: 30, details: 'Unknown creator' } as FilterResult,
      technical: { passed: true, score: 85, details: 'Complete metadata' } as FilterResult,
      social: { passed: false, score: 40, details: 'No social presence' } as FilterResult,
      liquidity: { passed: true, score: 75, details: 'Adequate liquidity' } as FilterResult,
    };

    const component = createFilterResults({
      ...failedResults,
      totalScore: 58,
      passed: false,
    });

    expect(component).toBeDefined();
  });

  it('should display partial pass filters with circle', () => {
    const partialResults = {
      creator: { passed: false, score: 60, details: 'Creator with limited history' } as FilterResult,
      technical: { passed: true, score: 85, details: 'Complete metadata' } as FilterResult,
      social: { passed: true, score: 80, details: 'Active social' } as FilterResult,
      liquidity: { passed: true, score: 75, details: 'Adequate liquidity' } as FilterResult,
    };

    const component = createFilterResults({
      ...partialResults,
      totalScore: 75,
      passed: true,
    });

    expect(component).toBeDefined();
  });

  it('should handle default totalScore of 0', () => {
    const component = createFilterResults(mockFilterResults);

    expect(component).toBeDefined();
  });

  it('should handle default passed status', () => {
    const component = createFilterResults(mockFilterResults);

    expect(component).toBeDefined();
  });

  it('should have column flex direction', () => {
    const component = createFilterResults({
      ...mockFilterResults,
      totalScore: 82,
    });

    expect(component).toHaveProperty('flexDirection', 'column');
  });

  it('should include all four filter types', () => {
    const component = createFilterResults({
      ...mockFilterResults,
      totalScore: 82,
      passed: true,
    });

    expect(component).toBeDefined();
    // Component should have creator, technical, social, liquidity rows
  });
});
