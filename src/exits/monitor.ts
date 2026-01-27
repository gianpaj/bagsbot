/**
 * Exit monitor for tracking and managing position exits
 *
 * Monitors open positions against take profit and stop loss thresholds.
 * Emits exit signals when thresholds are crossed and optionally triggers
 * automatic sales.
 *
 * @module exits/monitor
 */

import { Position, ExitConfig, ExitSignal } from '../types/positions.js';
import { logger } from '../utils/logger.js';

/**
 * Type for exit signal handlers
 */
export type ExitSignalHandler = (signal: ExitSignal) => void;

/**
 * ExitMonitor class for monitoring positions and triggering exits
 *
 * @example
 * ```typescript
 * const monitor = new ExitMonitor({
 *   takeProfitPercent: 900,  // 10x profit
 *   stopLossPercent: -50,     // 50% loss
 *   checkIntervalMs: 5000,    // Check every 5 seconds
 *   autoSellEnabled: false    // Manual exit by default
 * });
 *
 * // Subscribe to exit signals
 * const unsubscribe = monitor.onExitSignal((signal) => {
 *   console.log(`Exit triggered: ${signal.type} at ${signal.currentPrice}`);
 * });
 *
 * // Start monitoring
 * monitor.start();
 *
 * // Stop when done
 * monitor.stop();
 * ```
 */
export class ExitMonitor {
  private config: ExitConfig;
  private handlers: Set<ExitSignalHandler>;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private positions: Map<string, Position>;
  private isMonitoring = false;

  /**
   * Creates a new ExitMonitor instance
   *
   * @param config - Exit configuration (optional, uses defaults if not provided)
   */
  constructor(config?: Partial<ExitConfig>) {
    // Set defaults
    this.config = {
      takeProfitPercent: 900, // 10x gain
      stopLossPercent: -50,
      checkIntervalMs: 5000,
      autoSellEnabled: false,
      ...config,
    };

    this.handlers = new Set();
    this.positions = new Map();

    logger.debug('ExitMonitor initialized', {
      takeProfitPercent: this.config.takeProfitPercent,
      stopLossPercent: this.config.stopLossPercent,
      checkIntervalMs: this.config.checkIntervalMs,
      autoSellEnabled: this.config.autoSellEnabled,
    });
  }

  /**
   * Add a position to monitor
   *
   * @param position - The position to monitor
   */
  public addPosition(position: Position): void {
    this.positions.set(position.id, position);
    logger.debug('Position added to monitor', {
      id: position.id,
      mint: position.mint,
      symbol: position.tokenSymbol,
    });
  }

  /**
   * Remove a position from monitoring
   *
   * @param positionId - The ID of the position to remove
   */
  public removePosition(positionId: string): void {
    this.positions.delete(positionId);
    logger.debug('Position removed from monitor', { id: positionId });
  }

  /**
   * Update a position
   *
   * @param position - The updated position
   */
  public updatePosition(position: Position): void {
    this.positions.set(position.id, position);
  }

  /**
   * Start monitoring positions
   *
   * Begins checking positions at the configured interval.
   */
  public start(): void {
    if (this.isMonitoring) {
      logger.warn('ExitMonitor is already monitoring');
      return;
    }

    this.isMonitoring = true;
    logger.info('ExitMonitor started', {
      checkIntervalMs: this.config.checkIntervalMs,
      positionCount: this.positions.size,
    });

    // Perform initial check
    this.checkPositions();

    // Set up interval
    this.monitoringInterval = setInterval(() => {
      this.checkPositions();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring positions
   */
  public stop(): void {
    if (!this.isMonitoring) {
      logger.warn('ExitMonitor is not currently monitoring');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    logger.info('ExitMonitor stopped');
  }

  /**
   * Subscribe to exit signals
   *
   * @param handler - Function to call when an exit signal is emitted
   * @returns Unsubscribe function
   */
  public onExitSignal(handler: ExitSignalHandler): () => void {
    this.handlers.add(handler);

    logger.debug('Exit signal handler registered', {
      handlerCount: this.handlers.size,
    });

    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
      logger.debug('Exit signal handler unregistered', {
        handlerCount: this.handlers.size,
      });
    };
  }

  /**
   * Set automatic sell status
   *
   * @param enabled - Whether to automatically sell when exit conditions are met
   */
  public setAutoSell(enabled: boolean): void {
    this.config.autoSellEnabled = enabled;
    logger.info('Auto-sell setting updated', { autoSellEnabled: enabled });
  }

  /**
   * Get the current configuration
   *
   * @returns The current exit configuration
   */
  public getConfig(): ExitConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   *
   * @param config - Partial configuration to update
   */
  public updateConfig(config: Partial<ExitConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    logger.debug('Exit configuration updated', {
      takeProfitPercent: this.config.takeProfitPercent,
      stopLossPercent: this.config.stopLossPercent,
      checkIntervalMs: this.config.checkIntervalMs,
      autoSellEnabled: this.config.autoSellEnabled,
    });
  }

  /**
   * Get all monitored positions
   *
   * @returns Array of monitored positions
   */
  public getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get position count
   *
   * @returns Number of monitored positions
   */
  public getPositionCount(): number {
    return this.positions.size;
  }

  /**
   * Check all positions against exit conditions
   */
  private checkPositions(): void {
    const positions = Array.from(this.positions.values());

    for (const position of positions) {
      this.checkPosition(position);
    }
  }

  /**
   * Check a single position against exit conditions
   *
   * @param position - The position to check
   */
  private checkPosition(position: Position): void {
    // Skip if position doesn't have a current price
    if (position.currentPrice === undefined) {
      return;
    }

    // Calculate gain/loss percentage
    const gainPercent = this.calculateGainPercent(position.entryPrice, position.currentPrice);

    // Check take profit condition
    if (gainPercent >= this.config.takeProfitPercent) {
      this.handleExitSignal({
        position,
        type: 'take_profit',
        currentPrice: position.currentPrice,
        triggerPercent: gainPercent,
      });
      return;
    }

    // Check stop loss condition
    if (gainPercent <= this.config.stopLossPercent) {
      this.handleExitSignal({
        position,
        type: 'stop_loss',
        currentPrice: position.currentPrice,
        triggerPercent: gainPercent,
      });
      return;
    }
  }

  /**
   * Calculate gain percentage
   *
   * @param entryPrice - Entry price
   * @param currentPrice - Current price
   * @returns Gain percentage (can be negative for losses)
   */
  private calculateGainPercent(entryPrice: number, currentPrice: number): number {
    return ((currentPrice - entryPrice) / entryPrice) * 100;
  }

  /**
   * Handle an exit signal
   *
   * @param signal - The exit signal
   */
  private handleExitSignal(signal: ExitSignal): void {
    logger.info('Exit condition triggered', {
      type: signal.type,
      mint: signal.position.mint,
      symbol: signal.position.tokenSymbol,
      currentPrice: signal.currentPrice,
      triggerPercent: signal.triggerPercent,
      autoSell: this.config.autoSellEnabled,
    });

    // Emit signal to all subscribers
    for (const handler of this.handlers) {
      try {
        handler(signal);
      } catch (error) {
        logger.error('Error in exit signal handler', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // If auto-sell is enabled, we would trigger the actual sale here
    // (This would be handled by the trade executor in a real implementation)
    if (this.config.autoSellEnabled) {
      logger.info('Auto-sell triggered', {
        positionId: signal.position.id,
        type: signal.type,
      });
    }
  }
}

/**
 * Factory function to create an ExitMonitor instance
 *
 * @param config - Exit configuration (optional)
 * @returns A new ExitMonitor instance
 */
export function createExitMonitor(config?: Partial<ExitConfig>): ExitMonitor {
  return new ExitMonitor(config);
}
