/**
 * Unit tests for the ScoringEngine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScoringEngine, createScoringEngine } from './engine.js';
import type { ScoringConfig, FilterResult } from '../types/index.js';

/**
 * Helper function to create a mock filter result
 */
function createMockFilterResult(score: number = 50): FilterResult {
  return {
    passed: score >= 50,
    score,
    details: `Mock filter result with score ${score}`,
  };
}

/**
 * Helper function to create mock filter results
 */
function createMockFilters(scores?: {
  creator?: number;
  technical?: number;
  social?: number;
  liquidity?: number;
}) {
  return {
    creator: createMockFilterResult(scores?.creator ?? 50),
    technical: createMockFilterResult(scores?.technical ?? 50),
    social: createMockFilterResult(scores?.social ?? 50),
    liquidity: createMockFilterResult(scores?.liquidity ?? 50),
  };
}

describe('ScoringEngine', () => {
  let engine: ScoringEngine;
  let defaultConfig: ScoringConfig;

  beforeEach(() => {
    defaultConfig = {
      weights: {
        creator: 0.4,
        technical: 0.3,
        social: 0.2,
        liquidity: 0.1,
      },
      minScoreToAlert: 60,
      minScoreForHighConfidence: 80,
    };
    engine = new ScoringEngine(defaultConfig);
  });

  describe('constructor', () => {
    it('should create engine with provided config', () => {
      const config: ScoringConfig = {
        weights: {
          creator: 0.5,
          technical: 0.3,
          social: 0.1,
          liquidity: 0.1,
        },
        minScoreToAlert: 65,
        minScoreForHighConfidence: 85,
      };
      const customEngine = new ScoringEngine(config);
      expect(customEngine.getConfig()).toEqual(config);
    });

    it('should use default config when not provided', () => {
      const defaultEngine = new ScoringEngine();
      const config = defaultEngine.getConfig();
      expect(config.minScoreToAlert).toBe(60);
      expect(config.minScoreForHighConfidence).toBe(80);
    });
  });

  describe('calculate', () => {
    it('should calculate weighted score correctly with default weights', () => {
      // All scores at 100
      const filters = createMockFilters({
        creator: 100,
        technical: 100,
        social: 100,
        liquidity: 100,
      });
      const result = engine.calculate(filters);
      expect(result).toBe(100);
    });

    it('should calculate weighted score correctly with all scores at 0', () => {
      const filters = createMockFilters({
        creator: 0,
        technical: 0,
        social: 0,
        liquidity: 0,
      });
      const result = engine.calculate(filters);
      expect(result).toBe(0);
    });

    it('should apply weights correctly', () => {
      // Creator: 80 * 0.4 = 32
      // Technical: 60 * 0.3 = 18
      // Social: 40 * 0.2 = 8
      // Liquidity: 20 * 0.1 = 2
      // Total: 60
      const filters = createMockFilters({
        creator: 80,
        technical: 60,
        social: 40,
        liquidity: 20,
      });
      const result = engine.calculate(filters);
      expect(result).toBe(60);
    });

    it('should handle mixed high and low scores', () => {
      // Creator: 100 * 0.4 = 40
      // Technical: 100 * 0.3 = 30
      // Social: 0 * 0.2 = 0
      // Liquidity: 0 * 0.1 = 0
      // Total: 70
      const filters = createMockFilters({
        creator: 100,
        technical: 100,
        social: 0,
        liquidity: 0,
      });
      const result = engine.calculate(filters);
      expect(result).toBe(70);
    });

    it('should clamp scores above 100 to 100', () => {
      const filters = {
        creator: createMockFilterResult(150),
        technical: createMockFilterResult(150),
        social: createMockFilterResult(150),
        liquidity: createMockFilterResult(150),
      };
      const result = engine.calculate(filters);
      expect(result).toBe(100);
    });

    it('should clamp negative scores to 0', () => {
      const filters = {
        creator: createMockFilterResult(-10),
        technical: createMockFilterResult(-10),
        social: createMockFilterResult(-10),
        liquidity: createMockFilterResult(-10),
      };
      const result = engine.calculate(filters);
      expect(result).toBe(0);
    });

    it('should handle asymmetric scores correctly', () => {
      // Creator: 75 * 0.4 = 30
      // Technical: 80 * 0.3 = 24
      // Social: 55 * 0.2 = 11
      // Liquidity: 90 * 0.1 = 9
      // Total: 74
      const filters = createMockFilters({
        creator: 75,
        technical: 80,
        social: 55,
        liquidity: 90,
      });
      const result = engine.calculate(filters);
      expect(result).toBe(74);
    });

    it('should round to 2 decimal places', () => {
      // Creator: 33.33 * 0.4 = 13.332
      // Technical: 33.33 * 0.3 = 9.999
      // Social: 33.33 * 0.2 = 6.666
      // Liquidity: 33.33 * 0.1 = 3.333
      // Total: 33.33
      const filters = createMockFilters({
        creator: 33.33,
        technical: 33.33,
        social: 33.33,
        liquidity: 33.33,
      });
      const result = engine.calculate(filters);
      // Result should be rounded to 2 decimal places
      expect(Number.isFinite(result)).toBe(true);
      expect(result.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    });

    it('should handle zero total weight gracefully', () => {
      const configWithZeroWeights: ScoringConfig = {
        weights: {
          creator: 0,
          technical: 0,
          social: 0,
          liquidity: 0,
        },
        minScoreToAlert: 60,
        minScoreForHighConfidence: 80,
      };
      const engineWithZeroWeights = new ScoringEngine(configWithZeroWeights);
      const filters = createMockFilters({
        creator: 50,
        technical: 50,
        social: 50,
        liquidity: 50,
      });
      const result = engineWithZeroWeights.calculate(filters);
      expect(result).toBe(0);
    });

    it('should normalize weights that do not sum to 1', () => {
      const customConfig: ScoringConfig = {
        weights: {
          creator: 2,
          technical: 1,
          social: 1,
          liquidity: 1,
        },
        minScoreToAlert: 60,
        minScoreForHighConfidence: 80,
      };
      const customEngine = new ScoringEngine(customConfig);
      // Creator: 80 * 2 = 160
      // Technical: 60 * 1 = 60
      // Social: 40 * 1 = 40
      // Liquidity: 20 * 1 = 20
      // Total: 280
      // Normalized: 280 / 5 = 56
      const filters = createMockFilters({
        creator: 80,
        technical: 60,
        social: 40,
        liquidity: 20,
      });
      const result = customEngine.calculate(filters);
      expect(result).toBe(56);
    });
  });

  describe('meetsThreshold', () => {
    it('should return true when score equals minScoreToAlert', () => {
      const result = engine.meetsThreshold(60);
      expect(result).toBe(true);
    });

    it('should return true when score is above minScoreToAlert', () => {
      const result = engine.meetsThreshold(75);
      expect(result).toBe(true);
    });

    it('should return true when score is much higher than minScoreToAlert', () => {
      const result = engine.meetsThreshold(100);
      expect(result).toBe(true);
    });

    it('should return false when score is below minScoreToAlert', () => {
      const result = engine.meetsThreshold(59);
      expect(result).toBe(false);
    });

    it('should return false when score is 0', () => {
      const result = engine.meetsThreshold(0);
      expect(result).toBe(false);
    });

    it('should return false when score is slightly below threshold', () => {
      const result = engine.meetsThreshold(59.99);
      expect(result).toBe(false);
    });

    it('should respect custom threshold configuration', () => {
      const customConfig: ScoringConfig = {
        weights: defaultConfig.weights,
        minScoreToAlert: 75,
        minScoreForHighConfidence: 85,
      };
      const customEngine = new ScoringEngine(customConfig);
      expect(customEngine.meetsThreshold(75)).toBe(true);
      expect(customEngine.meetsThreshold(74)).toBe(false);
    });
  });

  describe('getConfidenceLevel', () => {
    it('should return low when score is below minScoreToAlert', () => {
      const result = engine.getConfidenceLevel(59);
      expect(result).toBe('low');
    });

    it('should return low when score is 0', () => {
      const result = engine.getConfidenceLevel(0);
      expect(result).toBe('low');
    });

    it('should return medium when score equals minScoreToAlert', () => {
      const result = engine.getConfidenceLevel(60);
      expect(result).toBe('medium');
    });

    it('should return medium when score is between minScoreToAlert and minScoreForHighConfidence', () => {
      const result = engine.getConfidenceLevel(70);
      expect(result).toBe('medium');
    });

    it('should return medium when score equals minScoreForHighConfidence - 1', () => {
      const result = engine.getConfidenceLevel(79);
      expect(result).toBe('medium');
    });

    it('should return high when score equals minScoreForHighConfidence', () => {
      const result = engine.getConfidenceLevel(80);
      expect(result).toBe('high');
    });

    it('should return high when score is above minScoreForHighConfidence', () => {
      const result = engine.getConfidenceLevel(90);
      expect(result).toBe('high');
    });

    it('should return high when score is 100', () => {
      const result = engine.getConfidenceLevel(100);
      expect(result).toBe('high');
    });

    it('should respect custom confidence thresholds', () => {
      const customConfig: ScoringConfig = {
        weights: defaultConfig.weights,
        minScoreToAlert: 50,
        minScoreForHighConfidence: 75,
      };
      const customEngine = new ScoringEngine(customConfig);
      expect(customEngine.getConfidenceLevel(49)).toBe('low');
      expect(customEngine.getConfidenceLevel(50)).toBe('medium');
      expect(customEngine.getConfidenceLevel(74)).toBe('medium');
      expect(customEngine.getConfidenceLevel(75)).toBe('high');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig: ScoringConfig = {
        weights: {
          creator: 0.5,
          technical: 0.3,
          social: 0.1,
          liquidity: 0.1,
        },
        minScoreToAlert: 70,
        minScoreForHighConfidence: 85,
      };
      engine.updateConfig(newConfig);
      expect(engine.getConfig()).toEqual(newConfig);
    });

    it('should affect calculation after config update', () => {
      const filters = createMockFilters({
        creator: 100,
        technical: 0,
        social: 0,
        liquidity: 0,
      });

      // With default weights: 100 * 0.4 = 40
      let result = engine.calculate(filters);
      expect(result).toBe(40);

      // Update to give creator more weight
      const newConfig: ScoringConfig = {
        weights: {
          creator: 0.9,
          technical: 0.05,
          social: 0.03,
          liquidity: 0.02,
        },
        minScoreToAlert: 60,
        minScoreForHighConfidence: 80,
      };
      engine.updateConfig(newConfig);

      // With new weights: 100 * 0.9 = 90
      result = engine.calculate(filters);
      expect(result).toBe(90);
    });

    it('should affect meetsThreshold after config update', () => {
      const score = 65;

      expect(engine.meetsThreshold(score)).toBe(true);

      const newConfig: ScoringConfig = {
        weights: defaultConfig.weights,
        minScoreToAlert: 70,
        minScoreForHighConfidence: 85,
      };
      engine.updateConfig(newConfig);

      expect(engine.meetsThreshold(score)).toBe(false);
    });

    it('should affect getConfidenceLevel after config update', () => {
      const score = 75;

      expect(engine.getConfidenceLevel(score)).toBe('medium');

      const newConfig: ScoringConfig = {
        weights: defaultConfig.weights,
        minScoreToAlert: 60,
        minScoreForHighConfidence: 70,
      };
      engine.updateConfig(newConfig);

      expect(engine.getConfidenceLevel(score)).toBe('high');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = engine.getConfig();
      expect(config).toEqual(defaultConfig);
    });

    it('should return updated configuration after config change', () => {
      const newConfig: ScoringConfig = {
        weights: {
          creator: 0.5,
          technical: 0.3,
          social: 0.1,
          liquidity: 0.1,
        },
        minScoreToAlert: 65,
        minScoreForHighConfidence: 85,
      };
      engine.updateConfig(newConfig);
      expect(engine.getConfig()).toEqual(newConfig);
    });
  });

  describe('createScoringEngine', () => {
    it('should create engine with default config', () => {
      const newEngine = createScoringEngine();
      expect(newEngine.getConfig().minScoreToAlert).toBe(60);
    });

    it('should create engine with custom config', () => {
      const customConfig: ScoringConfig = {
        weights: {
          creator: 0.3,
          technical: 0.3,
          social: 0.2,
          liquidity: 0.2,
        },
        minScoreToAlert: 65,
        minScoreForHighConfidence: 85,
      };
      const newEngine = createScoringEngine(customConfig);
      expect(newEngine.getConfig()).toEqual(customConfig);
    });
  });

  describe('integration scenarios', () => {
    it('should handle real-world scenario: strong creator, weak technical', () => {
      const filters = createMockFilters({
        creator: 95,
        technical: 40,
        social: 70,
        liquidity: 60,
      });

      const score = engine.calculate(filters);
      // Creator: 95 * 0.4 = 38
      // Technical: 40 * 0.3 = 12
      // Social: 70 * 0.2 = 14
      // Liquidity: 60 * 0.1 = 6
      // Total: 70
      expect(score).toBe(70);
      expect(engine.meetsThreshold(score)).toBe(true);
      expect(engine.getConfidenceLevel(score)).toBe('medium');
    });

    it('should handle real-world scenario: balanced scores', () => {
      const filters = createMockFilters({
        creator: 75,
        technical: 80,
        social: 85,
        liquidity: 70,
      });

      const score = engine.calculate(filters);
      // Creator: 75 * 0.4 = 30
      // Technical: 80 * 0.3 = 24
      // Social: 85 * 0.2 = 17
      // Liquidity: 70 * 0.1 = 7
      // Total: 78
      expect(score).toBe(78);
      expect(engine.meetsThreshold(score)).toBe(true);
      expect(engine.getConfidenceLevel(score)).toBe('medium');
    });

    it('should handle real-world scenario: all scores high', () => {
      const filters = createMockFilters({
        creator: 90,
        technical: 95,
        social: 88,
        liquidity: 92,
      });

      const score = engine.calculate(filters);
      // Creator: 90 * 0.4 = 36
      // Technical: 95 * 0.3 = 28.5
      // Social: 88 * 0.2 = 17.6
      // Liquidity: 92 * 0.1 = 9.2
      // Total: 91.3
      expect(score).toBeGreaterThanOrEqual(91);
      expect(engine.meetsThreshold(score)).toBe(true);
      expect(engine.getConfidenceLevel(score)).toBe('high');
    });

    it('should handle real-world scenario: failing token', () => {
      const filters = createMockFilters({
        creator: 20,
        technical: 15,
        social: 25,
        liquidity: 10,
      });

      const score = engine.calculate(filters);
      expect(score).toBeLessThan(60);
      expect(engine.meetsThreshold(score)).toBe(false);
      expect(engine.getConfidenceLevel(score)).toBe('low');
    });
  });

  describe('edge cases', () => {
    it('should handle decimal scores', () => {
      const filters = createMockFilters({
        creator: 75.5,
        technical: 80.25,
        social: 85.75,
        liquidity: 70.5,
      });

      const score = engine.calculate(filters);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle very small score differences', () => {
      const filters1 = createMockFilters({
        creator: 60.001,
        technical: 60.001,
        social: 60.001,
        liquidity: 60.001,
      });

      const score1 = engine.calculate(filters1);

      const filters2 = createMockFilters({
        creator: 60.002,
        technical: 60.002,
        social: 60.002,
        liquidity: 60.002,
      });

      const score2 = engine.calculate(filters2);

      expect(score1).toBeLessThanOrEqual(score2);
    });

    it('should handle extreme weight configurations', () => {
      const extremeConfig: ScoringConfig = {
        weights: {
          creator: 0.97,
          technical: 0.01,
          social: 0.01,
          liquidity: 0.01,
        },
        minScoreToAlert: 60,
        minScoreForHighConfidence: 80,
      };
      const extremeEngine = new ScoringEngine(extremeConfig);

      const filters = createMockFilters({
        creator: 50,
        technical: 100,
        social: 100,
        liquidity: 100,
      });

      const score = extremeEngine.calculate(filters);
      // Score should be heavily influenced by creator (50)
      expect(score).toBeLessThan(55);
    });
  });
});
