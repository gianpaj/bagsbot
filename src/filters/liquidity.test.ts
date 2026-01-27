/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LiquidityFilter,
  createLiquidityFilter,
  LIQUIDITY_SCORE,
  type ILiquidityDataService,
  type LiquidityData,
} from './liquidity.js';
import type { LaunchpadLaunchEvent, LiquidityFilterConfig } from '../types/index.js';
import { DEFAULT_LIQUIDITY_FILTER } from '../config/defaults.js';

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
    description: 'A test token with good fundamentals',
    image: 'https://example.com/image.png',
    twitter: 'https://twitter.com/testtoken',
    telegram: 'https://t.me/testtoken',
    website: 'https://testtoken.com',
    ...overrides,
  };
}

/**
 * Create a mock liquidity data service
 */
function createMockLiquidityService(
  data: LiquidityData = {}
): ILiquidityDataService {
  return {
    getLiquidityData: vi.fn().mockResolvedValue(data),
  };
}

describe('LiquidityFilter', () => {
  let filter: LiquidityFilter;

  beforeEach(() => {
    filter = new LiquidityFilter();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create with default config when none provided', () => {
      const newFilter = new LiquidityFilter();
      expect(newFilter.name).toBe('liquidity');
      expect(newFilter.getConfig()).toEqual(DEFAULT_LIQUIDITY_FILTER);
    });

    it('should create with custom config', () => {
      const customConfig: LiquidityFilterConfig = {
        minInitialLiquiditySol: 2.0,
        maxBondingCurvePercent: 60,
        maxTopHolderPercent: 25,
      };
      const newFilter = new LiquidityFilter(customConfig);
      expect(newFilter.getConfig()).toEqual(customConfig);
    });

    it('should have correct name', () => {
      expect(filter.name).toBe('liquidity');
    });

    it('should create with liquidity data service', () => {
      const mockService = createMockLiquidityService();
      const newFilter = new LiquidityFilter(undefined, mockService);
      expect(newFilter).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig: LiquidityFilterConfig = {
        minInitialLiquiditySol: 1.0,
        maxBondingCurvePercent: 70,
        maxTopHolderPercent: 20,
      };
      filter.updateConfig(newConfig);
      expect(filter.getConfig()).toEqual(newConfig);
    });
  });

  describe('setLiquidityDataService', () => {
    it('should set liquidity data service', () => {
      const mockService = createMockLiquidityService();
      filter.setLiquidityDataService(mockService);
      expect(filter).toBeDefined();
    });
  });

  describe('evaluate - without data service', () => {
    it('should return score 0 and passed false when no service provided', async () => {
      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details).toContain('data not available');
      expect(result.details).toContain('[External liquidity data service not available]');
    });
  });

  describe('evaluate - initial liquidity scoring', () => {
    it('should award 40 points for initial liquidity above minimum', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 2.0,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(LIQUIDITY_SCORE.INITIAL_LIQUIDITY);
      expect(result.details).toContain('2 SOL');
      expect(result.details).toContain(String(LIQUIDITY_SCORE.INITIAL_LIQUIDITY));
    });

    it('should not award points for initial liquidity below minimum', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 0.1,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.details).toContain('0.1 SOL');
      expect(result.details).toContain('below minimum');
    });

    it('should handle exact minimum liquidity threshold', async () => {
      const config = filter.getConfig();
      const mockService = createMockLiquidityService({
        initialLiquiditySol: config.minInitialLiquiditySol,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(LIQUIDITY_SCORE.INITIAL_LIQUIDITY);
    });

    it('should handle zero initial liquidity', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 0,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
    });
  });

  describe('evaluate - bonding curve scoring', () => {
    it('should award 25 points for bonding curve below maximum', async () => {
      const mockService = createMockLiquidityService({
        bondingCurvePercent: 40,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(LIQUIDITY_SCORE.BONDING_CURVE);
      expect(result.details).toContain('40%');
      expect(result.details).toContain(String(LIQUIDITY_SCORE.BONDING_CURVE));
    });

    it('should not award points for bonding curve at or above maximum', async () => {
      const mockService = createMockLiquidityService({
        bondingCurvePercent: 80,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.details).toContain('80%');
      expect(result.details).toContain('above maximum');
    });

    it('should handle exact maximum bonding curve threshold', async () => {
      const config = filter.getConfig();
      const mockService = createMockLiquidityService({
        bondingCurvePercent: config.maxBondingCurvePercent,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
    });

    it('should handle 0% bonding curve', async () => {
      const mockService = createMockLiquidityService({
        bondingCurvePercent: 0,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(LIQUIDITY_SCORE.BONDING_CURVE);
    });

    it('should handle 100% bonding curve', async () => {
      const mockService = createMockLiquidityService({
        bondingCurvePercent: 100,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
    });
  });

  describe('evaluate - whale concentration scoring', () => {
    it('should award 25 points for top holder below maximum', async () => {
      const mockService = createMockLiquidityService({
        topHolderPercent: 15,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION);
      expect(result.details).toContain('15%');
      expect(result.details).toContain(String(LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION));
    });

    it('should not award points for top holder at or above maximum', async () => {
      const mockService = createMockLiquidityService({
        topHolderPercent: 30,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.details).toContain('30%');
      expect(result.details).toContain('above maximum');
    });

    it('should handle exact maximum top holder threshold', async () => {
      const config = filter.getConfig();
      const mockService = createMockLiquidityService({
        topHolderPercent: config.maxTopHolderPercent,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
    });

    it('should handle minimal whale concentration', async () => {
      const mockService = createMockLiquidityService({
        topHolderPercent: 1,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION);
    });

    it('should handle 100% concentration (extreme whale)', async () => {
      const mockService = createMockLiquidityService({
        topHolderPercent: 100,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
    });
  });

  describe('evaluate - Meteora pool scoring', () => {
    it('should award 10 points when Meteora pool exists', async () => {
      const mockService = createMockLiquidityService({
        meteoraPoolExists: true,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(LIQUIDITY_SCORE.METEORA_POOL);
      expect(result.details).toContain('Meteora pool exists');
      expect(result.details).toContain(String(LIQUIDITY_SCORE.METEORA_POOL));
    });

    it('should not award points when Meteora pool does not exist', async () => {
      const mockService = createMockLiquidityService({
        meteoraPoolExists: false,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.details).toContain('does not exist');
    });
  });

  describe('evaluate - combined scoring', () => {
    it('should award maximum 100 points with all criteria met', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 5.0,
        bondingCurvePercent: 30,
        topHolderPercent: 10,
        meteoraPoolExists: true,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(
        LIQUIDITY_SCORE.INITIAL_LIQUIDITY +
          LIQUIDITY_SCORE.BONDING_CURVE +
          LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION +
          LIQUIDITY_SCORE.METEORA_POOL
      );
      expect(result.passed).toBe(true);
    });

    it('should pass with multiple positive indicators', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 2.0,
        bondingCurvePercent: 50,
        topHolderPercent: 20,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should fail when no criteria are met', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 0.1,
        bondingCurvePercent: 90,
        topHolderPercent: 50,
        meteoraPoolExists: false,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should pass with only initial liquidity criterion met', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 2.0,
        bondingCurvePercent: 90,
        topHolderPercent: 50,
        meteoraPoolExists: false,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(LIQUIDITY_SCORE.INITIAL_LIQUIDITY);
    });

    it('should pass with only bonding curve criterion met', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 0.1,
        bondingCurvePercent: 30,
        topHolderPercent: 50,
        meteoraPoolExists: false,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(LIQUIDITY_SCORE.BONDING_CURVE);
    });

    it('should pass with only whale concentration criterion met', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 0.1,
        bondingCurvePercent: 90,
        topHolderPercent: 10,
        meteoraPoolExists: false,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION);
    });

    it('should handle partial data gracefully', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 2.0,
        // bondingCurvePercent missing
        topHolderPercent: 15,
        // meteoraPoolExists missing
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(
        LIQUIDITY_SCORE.INITIAL_LIQUIDITY + LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION
      );
      expect(result.details).toContain('data not available');
    });
  });

  describe('evaluate - with custom config', () => {
    it('should respect custom minimum liquidity threshold', async () => {
      const customConfig: LiquidityFilterConfig = {
        minInitialLiquiditySol: 10.0,
        maxBondingCurvePercent: 50,
        maxTopHolderPercent: 20,
      };
      filter.updateConfig(customConfig);

      const mockService = createMockLiquidityService({
        initialLiquiditySol: 5.0, // Below custom minimum
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.details).toContain('below minimum');
    });

    it('should respect custom bonding curve maximum', async () => {
      const customConfig: LiquidityFilterConfig = {
        minInitialLiquiditySol: 0.5,
        maxBondingCurvePercent: 30,
        maxTopHolderPercent: 20,
      };
      filter.updateConfig(customConfig);

      const mockService = createMockLiquidityService({
        bondingCurvePercent: 40, // Above custom maximum
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.details).toContain('above maximum');
    });

    it('should respect custom top holder maximum', async () => {
      const customConfig: LiquidityFilterConfig = {
        minInitialLiquiditySol: 0.5,
        maxBondingCurvePercent: 80,
        maxTopHolderPercent: 15,
      };
      filter.updateConfig(customConfig);

      const mockService = createMockLiquidityService({
        topHolderPercent: 20, // Above custom maximum
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(0);
      expect(result.details).toContain('above maximum');
    });
  });

  describe('evaluate - service error handling', () => {
    it('should handle liquidity service errors gracefully', async () => {
      const mockService = {
        getLiquidityData: vi.fn().mockRejectedValue(new Error('Service error')),
      };
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      // Should return 0 score and failed state when service fails
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details).toContain('[External liquidity data service not available]');
    });
  });

  describe('evaluate - details formatting', () => {
    it('should format details string correctly with all data', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 2.5,
        bondingCurvePercent: 45,
        topHolderPercent: 12,
        meteoraPoolExists: true,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('2.5 SOL');
      expect(result.details).toContain('45%');
      expect(result.details).toContain('12%');
      expect(result.details).toContain('Meteora pool exists');
      expect(result.details).toContain('; ');
    });

    it('should include scoring points in details', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 2.0,
        meteoraPoolExists: true,
      });
      filter.setLiquidityDataService(mockService);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.details).toContain(String(LIQUIDITY_SCORE.INITIAL_LIQUIDITY));
      expect(result.details).toContain(String(LIQUIDITY_SCORE.METEORA_POOL));
    });
  });

  describe('factory function', () => {
    it('should create filter with factory function', () => {
      const newFilter = createLiquidityFilter();
      expect(newFilter.name).toBe('liquidity');
      expect(newFilter.getConfig()).toEqual(DEFAULT_LIQUIDITY_FILTER);
    });

    it('should create filter with custom config using factory', () => {
      const customConfig: LiquidityFilterConfig = {
        minInitialLiquiditySol: 2.0,
        maxBondingCurvePercent: 60,
        maxTopHolderPercent: 25,
      };
      const newFilter = createLiquidityFilter(customConfig);
      expect(newFilter.getConfig()).toEqual(customConfig);
    });

    it('should create filter with service using factory', () => {
      const mockService = createMockLiquidityService();
      const newFilter = createLiquidityFilter(undefined, mockService);
      expect(newFilter).toBeDefined();
    });
  });

  describe('Filter interface compliance', () => {
    it('should implement Filter interface', async () => {
      const mockService = createMockLiquidityService({
        initialLiquiditySol: 1.0,
      });
      filter.setLiquidityDataService(mockService);

      // Should have name property
      expect(filter.name).toBe('liquidity');

      // Should have evaluate method that returns FilterResult
      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('details');

      // Should have updateConfig method
      expect(typeof filter.updateConfig).toBe('function');
    });
  });
});
