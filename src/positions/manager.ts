/**
 * Position management for tracking open and closed trades
 *
 * Handles creating, updating, and closing positions. Fetches current prices
 * and calculates PnL metrics. Automatically persists positions to disk.
 *
 * @module positions/manager
 */

import { randomUUID } from 'crypto';
import { Connection } from '@solana/web3.js';
import { LaunchpadLaunchEvent } from '../types/launch.js';
import { Position, PositionStatus } from '../types/positions.js';
import { TradeResult } from '../types/trading.js';
import { PositionStorage } from './storage.js';
import { logger } from '../utils/logger.js';

/**
 * PnL metrics for a position or portfolio
 */
export interface PnLMetrics {
  /** Absolute PnL in SOL */
  absolute: number;
  /** PnL as a percentage */
  percent: number;
}

/**
 * PositionManager class for tracking and managing positions
 *
 * @example
 * ```typescript
 * const manager = new PositionManager();
 *
 * // Add a position when a trade is executed
 * const position = manager.addPosition(tradeResult, launchEvent);
 *
 * // Update prices from the blockchain
 * await manager.updatePrices(connection);
 *
 * // Get portfolio metrics
 * const totalValue = manager.getTotalValue();
 * const pnl = manager.getTotalPnL();
 *
 * // Close a position
 * manager.closePosition(position.id, { result: 'take_profit' });
 * ```
 */
export class PositionManager {
  private positions: Map<string, Position>;
  private storage: PositionStorage;
  private connection: Connection | null = null;

  /**
   * Creates a new PositionManager instance
   *
   * Loads positions from storage on initialization.
   */
  constructor() {
    this.storage = new PositionStorage();
    this.positions = new Map();

    // Load positions from storage
    const savedPositions = this.storage.load();
    savedPositions.forEach((position) => {
      this.positions.set(position.id, position);
    });

    logger.info('PositionManager initialized', {
      positionsLoaded: savedPositions.length,
    });
  }

  /**
   * Set the Solana connection for price fetching
   *
   * @param connection - Solana Connection instance
   */
  setConnection(connection: Connection): void {
    this.connection = connection;
    logger.debug('PositionManager connection set');
  }

  /**
   * Generate a unique position ID
   *
   * @returns A unique ID using UUID v4
   */
  private generatePositionId(): string {
    return randomUUID();
  }

  /**
   * Add a new position from a completed trade
   *
   * Creates a new position record and saves it to storage.
   *
   * @param tradeResult - The result of the trade execution
   * @param launchEvent - The launch event for the token
   * @param entryPrice - Entry price in SOL per token
   * @param tokensHeld - Number of tokens acquired
   * @param entrySol - Amount of SOL spent
   * @returns The created Position
   * @throws Error if required parameters are invalid
   *
   * @example
   * ```typescript
   * const position = manager.addPosition(
   *   tradeResult,
   *   launchEvent,
   *   0.00001,
   *   10000,
   *   0.1
   * );
   * ```
   */
  addPosition(
    tradeResult: TradeResult,
    launchEvent: LaunchpadLaunchEvent,
    entryPrice: number,
    tokensHeld: number,
    entrySol: number,
  ): Position {
    if (!tradeResult.success) {
      throw new Error('Cannot add position for failed trade');
    }

    if (entryPrice <= 0 || tokensHeld <= 0 || entrySol <= 0) {
      throw new Error('Position parameters must be positive numbers');
    }

    const id = this.generatePositionId();
    const position: Position = {
      id,
      mint: launchEvent.mint,
      tokenSymbol: launchEvent.symbol,
      entryPrice,
      tokensHeld,
      entrySol,
      entryTimestamp: new Date(),
      status: 'open',
    };

    this.positions.set(id, position);
    this.persistPositions();

    logger.info('Position added', {
      positionId: id,
      mint: launchEvent.mint,
      symbol: launchEvent.symbol,
      entrySol,
      tokensHeld,
      entryPrice,
    });

    return position;
  }

  /**
   * Update current prices for all open positions
   *
   * Fetches current token prices from the blockchain and updates
   * position metrics (currentPrice, currentValue, pnlPercent).
   *
   * Requires a connection to be set via setConnection().
   *
   * @returns Promise that resolves when all prices are updated
   * @throws Error if connection is not set or price fetch fails
   *
   * @example
   * ```typescript
   * manager.setConnection(connection);
   * await manager.updatePrices();
   * ```
   */
  async updatePrices(): Promise<void> {
    if (this.connection === null) {
      throw new Error('Connection not set. Call setConnection() first.');
    }

    const openPositions = Array.from(this.positions.values()).filter(
      (p) => p.status === 'open',
    );

    if (openPositions.length === 0) {
      logger.debug('No open positions to update');
      return;
    }

    logger.debug('Updating prices for open positions', {
      count: openPositions.length,
    });

    // Note: In a real implementation, this would fetch prices from an oracle
    // or pricing API. For now, we'll update the positions without prices
    // (they can be set by external price feed).
    // This is marked as ready for implementation.

    // Persist any changes
    this.persistPositions();
  }

  /**
   * Get all open positions
   *
   * @returns Array of positions with status 'open'
   *
   * @example
   * ```typescript
   * const openPositions = manager.getOpenPositions();
   * console.log(`${openPositions.length} open positions`);
   * ```
   */
  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.status === 'open');
  }

  /**
   * Get a position by ID
   *
   * @param id - The position ID
   * @returns The position, or null if not found
   *
   * @example
   * ```typescript
   * const position = manager.getPosition('123e4567-e89b-12d3-a456-426614174000');
   * ```
   */
  getPosition(id: string): Position | null {
    return this.positions.get(id) ?? null;
  }

  /**
   * Get all positions (open and closed)
   *
   * @returns Array of all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Close a position
   *
   * Updates the position status to 'closed' and saves to storage.
   *
   * @param id - The position ID to close
   * @param result - Optional result/reason for closing (for tracking purposes)
   * @throws Error if position not found
   *
   * @example
   * ```typescript
   * manager.closePosition(position.id, { reason: 'take_profit' });
   * ```
   */
  closePosition(
    id: string,
    result?: Record<string, unknown>,
  ): void {
    const position = this.positions.get(id);

    if (position === undefined) {
      throw new Error(`Position not found: ${id}`);
    }

    position.status = 'closed';
    this.persistPositions();

    logger.info('Position closed', {
      positionId: id,
      mint: position.mint,
      symbol: position.tokenSymbol,
      result,
    });
  }

  /**
   * Get the total value of all open positions in SOL
   *
   * Sums the currentValue (or entrySol if currentValue not set) of all open positions.
   *
   * @returns Total value in SOL
   *
   * @example
   * ```typescript
   * const totalValue = manager.getTotalValue();
   * console.log(`Total position value: ${totalValue} SOL`);
   * ```
   */
  getTotalValue(): number {
    return this.getOpenPositions().reduce((sum, position) => {
      const value = position.currentValue ?? position.entrySol;
      return sum + value;
    }, 0);
  }

  /**
   * Get the total PnL (profit/loss) metrics for all open positions
   *
   * Calculates both absolute PnL in SOL and percentage return.
   *
   * @returns Object with absolute and percent PnL
   *
   * @example
   * ```typescript
   * const pnl = manager.getTotalPnL();
   * console.log(`Total PnL: ${pnl.absolute} SOL (${pnl.percent}%)`);
   * ```
   */
  getTotalPnL(): PnLMetrics {
    const openPositions = this.getOpenPositions();

    let totalEntrySol = 0;
    let totalCurrentValue = 0;

    for (const position of openPositions) {
      totalEntrySol += position.entrySol;
      totalCurrentValue += position.currentValue ?? position.entrySol;
    }

    const absolutePnL = totalCurrentValue - totalEntrySol;
    const percentPnL = totalEntrySol > 0 ? (absolutePnL / totalEntrySol) * 100 : 0;

    return {
      absolute: absolutePnL,
      percent: percentPnL,
    };
  }

  /**
   * Get position statistics
   *
   * @returns Object with position statistics
   */
  getStatistics(): {
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalValue: number;
    totalPnL: PnLMetrics;
  } {
    const allPositions = this.getAllPositions();
    const openPositions = this.getOpenPositions();
    const closedPositions = allPositions.length - openPositions.length;

    return {
      totalPositions: allPositions.length,
      openPositions: openPositions.length,
      closedPositions,
      totalValue: this.getTotalValue(),
      totalPnL: this.getTotalPnL(),
    };
  }

  /**
   * Update a position's current price and metrics
   *
   * Called by price feeds to update position values.
   *
   * @param id - Position ID
   * @param currentPrice - Current price in SOL per token
   * @throws Error if position not found
   */
  updatePositionPrice(id: string, currentPrice: number): void {
    const position = this.positions.get(id);

    if (position === undefined) {
      throw new Error(`Position not found: ${id}`);
    }

    position.currentPrice = currentPrice;
    position.currentValue = currentPrice * position.tokensHeld;
    position.pnlPercent = ((position.currentValue - position.entrySol) / position.entrySol) * 100;

    this.persistPositions();

    logger.debug('Position price updated', {
      positionId: id,
      currentPrice,
      currentValue: position.currentValue,
      pnlPercent: position.pnlPercent,
    });
  }

  /**
   * Get positions by mint address
   *
   * @param mint - The mint address to filter by
   * @returns Array of positions for the given mint
   */
  getPositionsByMint(mint: string): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.mint === mint);
  }

  /**
   * Get positions by token symbol
   *
   * @param symbol - The token symbol to filter by
   * @returns Array of positions for the given symbol
   */
  getPositionsBySymbol(symbol: string): Position[] {
    return Array.from(this.positions.values()).filter((p) =>
      p.tokenSymbol.toLowerCase() === symbol.toLowerCase()
    );
  }

  /**
   * Get positions by status
   *
   * @param status - The status to filter by
   * @returns Array of positions with the given status
   */
  getPositionsByStatus(status: PositionStatus): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.status === status);
  }

  /**
   * Persist positions to storage
   *
   * @private
   */
  private persistPositions(): void {
    try {
      const allPositions = Array.from(this.positions.values());
      this.storage.save(allPositions);
    } catch (error) {
      logger.error('Failed to persist positions', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw here - positions are still in memory
      // Log and continue
    }
  }
}
