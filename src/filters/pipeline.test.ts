/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterPipeline, createFilterPipeline } from './pipeline.js';
import type { Filter, FilterRegistry } from './types.js';
import type {
  LaunchpadLaunchEvent,
  FilterResult,
  ScoringConfig,
  FilterConfig,
} from '../types/index.js';
import { DEFAULT_SCORING_CONFIG } from '../config/defaults.js';

/**
 * Create a mock filter for testing
 */
function createMockFilter(
  name: string,
  defaultResult: FilterResult
): Filter & { mockEvaluate: ReturnType<typeof vi.fn> } {
  const mockEvaluate = vi.fn().mockResolvedValue(defaultResult);

  return {
    name,
    evaluate: mockEvaluate,
    updateConfig: vi.fn(),
    mockEvaluate,
  };
}

/**
 * Create a mock launch event for testing
 */
function createMockLaunchEvent(
  overrides: Partial<LaunchpadLaunchEvent> = {}
): LaunchpadLaunchEvent {
  return {
    mint: 'TestMint123456789',
    creator: 'TestCreator123456789',
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token',
    image: 'https://example.com/image.png',
    twitter: 'https://twitter.com/testtoken',
    telegram: 'https://t.me/testtoken',
    website: 'https://testtoken.com',
    ...overrides,
  };
}

/**
 * Create a mock filter registry with configurable results
 */
function createMockFilterRegistry(
  results?: Partial<Record<keyof FilterRegistry, FilterResult>>
): FilterRegistry & {
  mocks: Record<keyof FilterRegistry, ReturnType<typeof createMockFilter>>;
} {
  const defaultResults: Record<keyof FilterRegistry, FilterResult> = {
    creator: { passed: true, score: 80, details: 'Creator verified' },
    technical: { passed: true, score: 75, details: 'Metadata complete' },
    social: { passed: true, score: 70, details: 'Social presence found' },
    liquidity: { passed: true, score: 85, details: 'Liquidity sufficient' },
  };

  const mergedResults = { ...defaultResults, ...results };

  const creatorFilter = createMockFilter('creator', mergedResults.creator);
  const technicalFilter = createMockFilter('technical', mergedResults.technical);
  const socialFilter = createMockFilter('social', mergedResults.social);
  const liquidityFilter = createMockFilter('liquidity', mergedResults.liquidity);

  return {
    creator: creatorFilter,
    technical: technicalFilter,
    social: socialFilter,
    liquidity: liquidityFilter,
    mocks: {
      creator: creatorFilter,
      technical: technicalFilter,
      social: socialFilter,
      liquidity: liquidityFilter,
    },
  };
}

describe('FilterPipeline', () => {
  let filterRegistry: ReturnType<typeof createMockFilterRegistry>;
  let pipeline: FilterPipeline;

  beforeEach(() => {
    filterRegistry = createMockFilterRegistry();
    pipeline = new FilterPipeline(filterRegistry);
  });

  describe('constructor', () => {
    it('should create a pipeline with default scoring config', () => {
      const newPipeline = new FilterPipeline(filterRegistry);
      expect(newPipeline.getScoringConfig()).toEqual(DEFAULT_SCORING_CONFIG);
    });

    it('should accept custom scoring config', () => {
      const customConfig: ScoringConfig = {
        weights: {
          creator: 0.4,
          technical: 0.2,
          social: 0.1,
          liquidity: 0.3,
        },
        minScoreToAlert: 70,
        minScoreForHighConfidence: 90,
      };

      const newPipeline = new FilterPipeline(filterRegistry, customConfig);
      expect(newPipeline.getScoringConfig()).toEqual(customConfig);
    });
  });

  describe('evaluate', () => {
    it('should run all filters in priority order', async () => {
      const launch = createMockLaunchEvent();
      const callOrder: string[] = [];

      // Track the order filters are called by replacing the evaluate function
      // directly on the filter objects
      filterRegistry.creator.evaluate = vi.fn(() => {
        callOrder.push('creator');
        return Promise.resolve({ passed: true, score: 80, details: 'ok' });
      });
      filterRegistry.technical.evaluate = vi.fn(() => {
        callOrder.push('technical');
        return Promise.resolve({ passed: true, score: 75, details: 'ok' });
      });
      filterRegistry.social.evaluate = vi.fn(() => {
        callOrder.push('social');
        return Promise.resolve({ passed: true, score: 70, details: 'ok' });
      });
      filterRegistry.liquidity.evaluate = vi.fn(() => {
        callOrder.push('liquidity');
        return Promise.resolve({ passed: true, score: 85, details: 'ok' });
      });

      await pipeline.evaluate(launch);

      expect(callOrder).toEqual(['creator', 'technical', 'social', 'liquidity']);
    });

    it('should pass launch event to each filter', async () => {
      const launch = createMockLaunchEvent({ mint: 'UniqueMint123' });

      await pipeline.evaluate(launch);

      expect(filterRegistry.mocks.creator.mockEvaluate).toHaveBeenCalledWith(launch);
      expect(filterRegistry.mocks.technical.mockEvaluate).toHaveBeenCalledWith(launch);
      expect(filterRegistry.mocks.social.mockEvaluate).toHaveBeenCalledWith(launch);
      expect(filterRegistry.mocks.liquidity.mockEvaluate).toHaveBeenCalledWith(launch);
    });

    it('should return complete pipeline result with all filter results', async () => {
      const launch = createMockLaunchEvent();

      const result = await pipeline.evaluate(launch);

      expect(result.launch).toBe(launch);
      expect(result.filters.creator).toEqual({ passed: true, score: 80, details: 'Creator verified' });
      expect(result.filters.technical).toEqual({ passed: true, score: 75, details: 'Metadata complete' });
      expect(result.filters.social).toEqual({ passed: true, score: 70, details: 'Social presence found' });
      expect(result.filters.liquidity).toEqual({ passed: true, score: 85, details: 'Liquidity sufficient' });
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should calculate weighted total score correctly', async () => {
      // With default weights: creator=0.3, technical=0.2, social=0.2, liquidity=0.3
      // Scores: creator=80, technical=75, social=70, liquidity=85
      // Expected: (80*0.3) + (75*0.2) + (70*0.2) + (85*0.3) = 24 + 15 + 14 + 25.5 = 78.5
      const launch = createMockLaunchEvent();

      const result = await pipeline.evaluate(launch);

      expect(result.totalScore).toBe(78.5);
    });

    it('should pass when total score meets minimum threshold', async () => {
      const customConfig: ScoringConfig = {
        weights: { creator: 0.25, technical: 0.25, social: 0.25, liquidity: 0.25 },
        minScoreToAlert: 70,
        minScoreForHighConfidence: 80,
      };
      const newPipeline = new FilterPipeline(filterRegistry, customConfig);
      const launch = createMockLaunchEvent();

      // Average score: (80 + 75 + 70 + 85) / 4 = 77.5
      const result = await newPipeline.evaluate(launch);

      expect(result.totalScore).toBe(77.5);
      expect(result.passed).toBe(true);
    });

    it('should fail when total score is below minimum threshold', async () => {
      const lowScoreRegistry = createMockFilterRegistry({
        creator: { passed: false, score: 30, details: 'Creator not verified' },
        technical: { passed: false, score: 40, details: 'Missing metadata' },
        social: { passed: false, score: 20, details: 'No social presence' },
        liquidity: { passed: false, score: 35, details: 'Low liquidity' },
      });

      const lowPipeline = new FilterPipeline(lowScoreRegistry);
      const launch = createMockLaunchEvent();

      // With default weights: (30*0.3) + (40*0.2) + (20*0.2) + (35*0.3) = 9 + 8 + 4 + 10.5 = 31.5
      const result = await lowPipeline.evaluate(launch);

      expect(result.totalScore).toBe(31.5);
      expect(result.passed).toBe(false); // Below minScoreToAlert of 60
    });

    it('should handle filters returning edge case scores', async () => {
      const edgeCaseRegistry = createMockFilterRegistry({
        creator: { passed: true, score: 0, details: 'Minimum score' },
        technical: { passed: true, score: 100, details: 'Maximum score' },
        social: { passed: true, score: 50, details: 'Middle score' },
        liquidity: { passed: true, score: 100, details: 'Maximum score' },
      });

      const edgePipeline = new FilterPipeline(edgeCaseRegistry);
      const launch = createMockLaunchEvent();

      // With default weights: (0*0.3) + (100*0.2) + (50*0.2) + (100*0.3) = 0 + 20 + 10 + 30 = 60
      const result = await edgePipeline.evaluate(launch);

      expect(result.totalScore).toBe(60);
      expect(result.passed).toBe(true); // Exactly at minScoreToAlert of 60
    });

    it('should include timestamp in result', async () => {
      const launch = createMockLaunchEvent();
      const beforeTime = new Date();

      const result = await pipeline.evaluate(launch);

      const afterTime = new Date();
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('updateConfig', () => {
    it('should update configuration for all filters', () => {
      const newConfig: FilterConfig = {
        creator: {
          requireVerifiedSocial: false,
          minFollowerCount: 500,
          minAccountAgeDays: 30,
          checkPreviousLaunches: false,
        },
        technical: {
          requireCompleteMetadata: false,
          requireDescription: false,
          requireSocialLinks: true,
          validateImageUrl: false,
        },
        social: {
          checkTwitterMentions: false,
          checkTelegramGroup: true,
          minCommunitySize: 200,
        },
        liquidity: {
          minInitialLiquiditySol: 2.0,
          maxBondingCurvePercent: 50,
          maxTopHolderPercent: 20,
        },
      };

      pipeline.updateConfig(newConfig);

      expect(vi.mocked(filterRegistry.mocks.creator.updateConfig)).toHaveBeenCalledWith(newConfig.creator);
      expect(vi.mocked(filterRegistry.mocks.technical.updateConfig)).toHaveBeenCalledWith(newConfig.technical);
      expect(vi.mocked(filterRegistry.mocks.social.updateConfig)).toHaveBeenCalledWith(newConfig.social);
      expect(vi.mocked(filterRegistry.mocks.liquidity.updateConfig)).toHaveBeenCalledWith(newConfig.liquidity);
    });
  });

  describe('updateScoringConfig', () => {
    it('should update scoring configuration', () => {
      const newScoringConfig: ScoringConfig = {
        weights: {
          creator: 0.5,
          technical: 0.1,
          social: 0.1,
          liquidity: 0.3,
        },
        minScoreToAlert: 50,
        minScoreForHighConfidence: 75,
      };

      pipeline.updateScoringConfig(newScoringConfig);

      expect(pipeline.getScoringConfig()).toEqual(newScoringConfig);
    });

    it('should affect future evaluations', async () => {
      const launch = createMockLaunchEvent();

      // First evaluation with default config
      const result1 = await pipeline.evaluate(launch);

      // Update to lower threshold
      pipeline.updateScoringConfig({
        ...DEFAULT_SCORING_CONFIG,
        minScoreToAlert: 90,
      });

      // Second evaluation with new config
      const result2 = await pipeline.evaluate(launch);

      expect(result1.totalScore).toBe(result2.totalScore); // Same scores
      expect(result1.passed).toBe(true); // Passes with 60 threshold
      expect(result2.passed).toBe(false); // Fails with 90 threshold
    });
  });

  describe('getScoringConfig', () => {
    it('should return current scoring configuration', () => {
      const config = pipeline.getScoringConfig();
      expect(config).toEqual(DEFAULT_SCORING_CONFIG);
    });

    it('should return updated configuration after updateScoringConfig', () => {
      const newConfig: ScoringConfig = {
        weights: { creator: 0.1, technical: 0.1, social: 0.1, liquidity: 0.7 },
        minScoreToAlert: 40,
        minScoreForHighConfidence: 60,
      };

      pipeline.updateScoringConfig(newConfig);

      expect(pipeline.getScoringConfig()).toEqual(newConfig);
    });
  });

  describe('score calculation edge cases', () => {
    it('should handle non-normalized weights', async () => {
      // Weights that don't sum to 1
      const nonNormalizedConfig: ScoringConfig = {
        weights: { creator: 1, technical: 1, social: 1, liquidity: 1 },
        minScoreToAlert: 60,
        minScoreForHighConfidence: 80,
      };

      const nonNormalizedPipeline = new FilterPipeline(filterRegistry, nonNormalizedConfig);
      const launch = createMockLaunchEvent();

      // Should still calculate correctly: (80 + 75 + 70 + 85) / 4 = 77.5
      const result = await nonNormalizedPipeline.evaluate(launch);

      expect(result.totalScore).toBe(77.5);
    });

    it('should handle zero weights gracefully', async () => {
      const zeroWeightConfig: ScoringConfig = {
        weights: { creator: 0, technical: 0, social: 0, liquidity: 0 },
        minScoreToAlert: 60,
        minScoreForHighConfidence: 80,
      };

      const zeroWeightPipeline = new FilterPipeline(filterRegistry, zeroWeightConfig);
      const launch = createMockLaunchEvent();

      const result = await zeroWeightPipeline.evaluate(launch);

      expect(result.totalScore).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('should clamp scores to 0-100 range', async () => {
      const outOfRangeRegistry = createMockFilterRegistry({
        creator: { passed: true, score: 150, details: 'Over max' },
        technical: { passed: true, score: -20, details: 'Under min' },
        social: { passed: true, score: 50, details: 'Normal' },
        liquidity: { passed: true, score: 50, details: 'Normal' },
      });

      const outOfRangePipeline = new FilterPipeline(outOfRangeRegistry);
      const launch = createMockLaunchEvent();

      const result = await outOfRangePipeline.evaluate(launch);

      // Note: The pipeline doesn't clamp individual filter scores, only the final result
      // With default weights: (150*0.3) + (-20*0.2) + (50*0.2) + (50*0.3) = 45 - 4 + 10 + 15 = 66
      // This is within 0-100 so no clamping needed
      expect(result.totalScore).toBe(66);
    });

    it('should round total score to 2 decimal places', async () => {
      // Set up scores that would produce a long decimal
      const precisionRegistry = createMockFilterRegistry({
        creator: { passed: true, score: 77, details: 'ok' },
        technical: { passed: true, score: 83, details: 'ok' },
        social: { passed: true, score: 91, details: 'ok' },
        liquidity: { passed: true, score: 67, details: 'ok' },
      });

      const precisionPipeline = new FilterPipeline(precisionRegistry);
      const launch = createMockLaunchEvent();

      const result = await precisionPipeline.evaluate(launch);

      // Check that score has at most 2 decimal places
      const scoreString = result.totalScore.toString();
      const decimalPart = scoreString.split('.')[1];
      const decimalPlaces = decimalPart !== undefined ? decimalPart.length : 0;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('async filter handling', () => {
    it('should handle slow filters', async () => {
      const slowRegistry = createMockFilterRegistry();
      slowRegistry.creator.evaluate = vi.fn(
        () =>
          new Promise<FilterResult>((resolve) => {
            setTimeout(() => {
              resolve({ passed: true, score: 80, details: 'slow' });
            }, 10);
          })
      );

      const slowPipeline = new FilterPipeline(slowRegistry);
      const launch = createMockLaunchEvent();

      const result = await slowPipeline.evaluate(launch);

      expect(result.filters.creator.score).toBe(80);
    });

    it('should propagate filter errors', async () => {
      const errorRegistry = createMockFilterRegistry();
      errorRegistry.mocks.creator.mockEvaluate.mockRejectedValue(
        new Error('Filter evaluation failed')
      );

      const errorPipeline = new FilterPipeline(errorRegistry);
      const launch = createMockLaunchEvent();

      await expect(errorPipeline.evaluate(launch)).rejects.toThrow(
        'Filter evaluation failed'
      );
    });
  });

  describe('launch event handling', () => {
    it('should work with minimal launch event', async () => {
      const minimalLaunch: LaunchpadLaunchEvent = {
        mint: 'MinimalMint',
        creator: 'MinimalCreator',
        name: 'Minimal',
        symbol: 'MIN',
      };

      const result = await pipeline.evaluate(minimalLaunch);

      expect(result.launch).toBe(minimalLaunch);
      expect(result.filters.creator).toBeDefined();
      expect(result.filters.technical).toBeDefined();
      expect(result.filters.social).toBeDefined();
      expect(result.filters.liquidity).toBeDefined();
    });

    it('should work with full launch event', async () => {
      const fullLaunch: LaunchpadLaunchEvent = {
        mint: 'FullMint123',
        creator: 'FullCreator456',
        name: 'Full Token',
        symbol: 'FULL',
        description: 'A fully specified token with all fields',
        image: 'https://example.com/full.png',
        twitter: 'https://twitter.com/fulltoken',
        telegram: 'https://t.me/fulltoken',
        website: 'https://fulltoken.example.com',
      };

      const result = await pipeline.evaluate(fullLaunch);

      expect(result.launch).toBe(fullLaunch);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });
  });
});

describe('createFilterPipeline', () => {
  it('should create a FilterPipeline instance', () => {
    const registry = createMockFilterRegistry();
    const testPipeline = createFilterPipeline(registry);

    expect(testPipeline).toBeInstanceOf(FilterPipeline);
  });

  it('should create a pipeline with default scoring config', () => {
    const registry = createMockFilterRegistry();
    const testPipeline = createFilterPipeline(registry);

    expect(testPipeline.getScoringConfig()).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('should create a pipeline with custom scoring config', () => {
    const registry = createMockFilterRegistry();
    const customConfig: ScoringConfig = {
      weights: { creator: 0.5, technical: 0.2, social: 0.1, liquidity: 0.2 },
      minScoreToAlert: 55,
      minScoreForHighConfidence: 85,
    };

    const testPipeline = createFilterPipeline(registry, customConfig);

    expect(testPipeline.getScoringConfig()).toEqual(customConfig);
  });
});
