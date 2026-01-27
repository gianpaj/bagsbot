/**
 * Liquidity Filter implementation for evaluating token launch liquidity metrics
 *
 * This filter evaluates liquidity-related aspects of a token launch including
 * initial liquidity size, bonding curve progress, holder concentration, and pool availability.
 *
 * Scoring (total 100 points):
 * - Initial liquidity > minimum: 40 points
 * - Bonding curve < 50% filled: 25 points
 * - No whale concentration (top holder < 20%): 25 points
 * - Pool exists on Meteora: 10 points
 */

import type { Filter } from './types.js';
import type {
  LaunchpadLaunchEvent,
  FilterResult,
  LiquidityFilterConfig,
} from '../types/index.js';
import { DEFAULT_LIQUIDITY_FILTER } from '../config/defaults.js';

/**
 * Scoring constants for the liquidity filter
 */
export const LIQUIDITY_SCORE = {
  INITIAL_LIQUIDITY: 40,
  BONDING_CURVE: 25,
  NO_WHALE_CONCENTRATION: 25,
  METEORA_POOL: 10,
} as const;

/**
 * Interface for liquidity data that may come from external sources
 */
export interface LiquidityData {
  /** Initial liquidity amount in SOL */
  initialLiquiditySol?: number;
  /** Percentage of bonding curve filled (0-100) */
  bondingCurvePercent?: number;
  /** Percentage held by top holder (0-100) */
  topHolderPercent?: number;
  /** Whether a pool exists on Meteora */
  meteoraPoolExists?: boolean;
}

/**
 * Interface for liquidity data service (dependency injection)
 */
export interface ILiquidityDataService {
  /**
   * Get liquidity data for a specific token
   * @param mint The mint address of the token
   * @returns Promise resolving to liquidity data
   */
  getLiquidityData(mint: string): Promise<LiquidityData>;
}

/**
 * Internal scoring details for transparency
 */
interface ScoringDetails {
  initialLiquiditySol?: number;
  initialLiquidityScore: number;
  bondingCurvePercent?: number;
  bondingCurveScore: number;
  topHolderPercent?: number;
  whaleConcentrationScore: number;
  meteoraPoolExists?: boolean;
  meteoraPoolScore: number;
  hasExternalData: boolean;
}

/**
 * LiquidityFilter evaluates liquidity aspects of token launches including:
 * - Initial liquidity amount
 * - Bonding curve fill percentage
 * - Holder concentration (whale detection)
 * - Meteora pool availability
 */
export class LiquidityFilter implements Filter<LiquidityFilterConfig> {
  readonly name = 'liquidity';

  private config: LiquidityFilterConfig;
  private liquidityDataService: ILiquidityDataService | undefined;

  constructor(config?: LiquidityFilterConfig, dataService?: ILiquidityDataService) {
    this.config = config ?? DEFAULT_LIQUIDITY_FILTER;
    this.liquidityDataService = dataService;
  }

  /**
   * Evaluate a launch event against liquidity criteria
   */
  async evaluate(launch: LaunchpadLaunchEvent): Promise<FilterResult> {
    const details: ScoringDetails = {
      initialLiquidityScore: 0,
      bondingCurveScore: 0,
      whaleConcentrationScore: 0,
      meteoraPoolScore: 0,
      hasExternalData: false,
    };

    // Get liquidity data from external service if available
    let liquidityData: LiquidityData = {};
    if (this.liquidityDataService) {
      try {
        liquidityData = await this.liquidityDataService.getLiquidityData(launch.mint);
        details.hasExternalData = true;
      } catch {
        // If service fails, continue with empty data
        details.hasExternalData = false;
      }
    }

    // Check initial liquidity (40 points)
    if (liquidityData.initialLiquiditySol !== undefined) {
      details.initialLiquiditySol = liquidityData.initialLiquiditySol;
      if (
        liquidityData.initialLiquiditySol >= this.config.minInitialLiquiditySol
      ) {
        details.initialLiquidityScore = LIQUIDITY_SCORE.INITIAL_LIQUIDITY;
      }
    }

    // Check bonding curve percentage (25 points)
    if (liquidityData.bondingCurvePercent !== undefined) {
      details.bondingCurvePercent = liquidityData.bondingCurvePercent;
      if (liquidityData.bondingCurvePercent < this.config.maxBondingCurvePercent) {
        details.bondingCurveScore = LIQUIDITY_SCORE.BONDING_CURVE;
      }
    }

    // Check top holder percentage / whale concentration (25 points)
    if (liquidityData.topHolderPercent !== undefined) {
      details.topHolderPercent = liquidityData.topHolderPercent;
      if (liquidityData.topHolderPercent < this.config.maxTopHolderPercent) {
        details.whaleConcentrationScore = LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION;
      }
    }

    // Check Meteora pool existence (10 points)
    if (liquidityData.meteoraPoolExists !== undefined) {
      details.meteoraPoolExists = liquidityData.meteoraPoolExists;
      if (liquidityData.meteoraPoolExists) {
        details.meteoraPoolScore = LIQUIDITY_SCORE.METEORA_POOL;
      }
    }

    // Calculate total score
    const score =
      details.initialLiquidityScore +
      details.bondingCurveScore +
      details.whaleConcentrationScore +
      details.meteoraPoolScore;

    // Determine if passed based on score (at least some positive indicators)
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
  updateConfig(config: LiquidityFilterConfig): void {
    this.config = config;
  }

  /**
   * Update the liquidity data service
   */
  setLiquidityDataService(service: ILiquidityDataService): void {
    this.liquidityDataService = service;
  }

  /**
   * Get the current configuration
   */
  getConfig(): LiquidityFilterConfig {
    return this.config;
  }

  /**
   * Determine if the filter passed based on available data
   */
  private determinePassed(details: ScoringDetails): boolean {
    // If no external data is available, we cannot properly evaluate
    if (!details.hasExternalData) {
      return false;
    }

    // Pass if we have positive indicators for liquidity:
    // - Initial liquidity meets minimum, OR
    // - Bonding curve not too filled, OR
    // - No significant whale concentration
    return (
      details.initialLiquidityScore > 0 ||
      details.bondingCurveScore > 0 ||
      details.whaleConcentrationScore > 0
    );
  }

  /**
   * Format the details string for the filter result
   */
  private formatDetails(details: ScoringDetails): string {
    const parts: string[] = [];

    // Initial liquidity
    if (details.initialLiquiditySol !== undefined) {
      if (details.initialLiquidityScore > 0) {
        parts.push(
          `Initial liquidity: ${String(details.initialLiquiditySol)} SOL (+${String(LIQUIDITY_SCORE.INITIAL_LIQUIDITY)})`
        );
      } else {
        parts.push(
          `Initial liquidity: ${String(details.initialLiquiditySol)} SOL (below minimum ${String(this.config.minInitialLiquiditySol)} SOL)`
        );
      }
    } else {
      parts.push('Initial liquidity: data not available');
    }

    // Bonding curve
    if (details.bondingCurvePercent !== undefined) {
      if (details.bondingCurveScore > 0) {
        parts.push(
          `Bonding curve: ${String(details.bondingCurvePercent)}% filled (+${String(LIQUIDITY_SCORE.BONDING_CURVE)})`
        );
      } else {
        parts.push(
          `Bonding curve: ${String(details.bondingCurvePercent)}% filled (above maximum ${String(this.config.maxBondingCurvePercent)}%)`
        );
      }
    } else {
      parts.push('Bonding curve: data not available');
    }

    // Top holder concentration
    if (details.topHolderPercent !== undefined) {
      if (details.whaleConcentrationScore > 0) {
        parts.push(
          `Top holder: ${String(details.topHolderPercent)}% (+${String(LIQUIDITY_SCORE.NO_WHALE_CONCENTRATION)})`
        );
      } else {
        parts.push(
          `Top holder: ${String(details.topHolderPercent)}% (above maximum ${String(this.config.maxTopHolderPercent)}%)`
        );
      }
    } else {
      parts.push('Top holder concentration: data not available');
    }

    // Meteora pool
    if (details.meteoraPoolExists !== undefined) {
      if (details.meteoraPoolExists) {
        parts.push(
          `Meteora pool exists (+${String(LIQUIDITY_SCORE.METEORA_POOL)})`
        );
      } else {
        parts.push('Meteora pool does not exist');
      }
    } else {
      parts.push('Meteora pool status: data not available');
    }

    // Add data availability note
    if (!details.hasExternalData) {
      parts.push('[External liquidity data service not available]');
    }

    return parts.join('; ');
  }
}

/**
 * Create a new LiquidityFilter instance
 */
export function createLiquidityFilter(
  config?: LiquidityFilterConfig,
  dataService?: ILiquidityDataService
): LiquidityFilter {
  return new LiquidityFilter(config, dataService);
}
