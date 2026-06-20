/**
 * Live price poller for paper-trading on mainnet.
 *
 * On a fixed interval, fetches a real quote for each open position to derive
 * its current price, then pushes that price into the position manager and exit
 * monitor — exactly the position-update half of the simulation engine's tick,
 * but sourced from live mainnet quotes instead of a synthetic market model.
 *
 * Without this loop, paper-mainnet positions would never have a `currentPrice`
 * and the exit monitor's take-profit / stop-loss checks would never fire.
 *
 * @module trading/price-poller
 */

import type { PositionManager } from '../positions/manager.js';
import type { ExitMonitor } from '../exits/monitor.js';
import type { Position } from '../types/positions.js';
import type { IBagsTradeService } from './executor.js';
import { logger } from '../utils/logger.js';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const pricePollerLogger = logger.child({ module: 'price-poller' });

/**
 * Wiring the poller needs to apply prices and surface updates to the UI.
 * Mirrors the simulation engine bindings so both modes behave identically.
 */
export interface PricePollerBindings {
  positionManager: PositionManager;
  exitMonitor: ExitMonitor;
  onPositionsUpdated?: (positions: Position[]) => void;
}

/**
 * Polls live quotes to keep open-position prices current in paper-mainnet mode.
 */
export class PaperPricePoller {
  private readonly tradeService: IBagsTradeService;
  private readonly intervalMs: number;
  private bindings: PricePollerBindings | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  /**
   * @param tradeService - Live trade service used to fetch quotes.
   * @param intervalMs - Poll interval (typically `exits.checkIntervalMs`).
   */
  constructor(tradeService: IBagsTradeService, intervalMs: number) {
    this.tradeService = tradeService;
    this.intervalMs = intervalMs;
  }

  /**
   * Start polling. Performs an immediate tick, then repeats on the interval.
   */
  start(bindings: PricePollerBindings): void {
    if (this.timer !== null) {
      pricePollerLogger.warn('Price poller already running');
      return;
    }

    this.bindings = bindings;
    pricePollerLogger.info('Price poller started', { intervalMs: this.intervalMs });

    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.bindings = null;
    pricePollerLogger.info('Price poller stopped');
  }

  /**
   * Refresh the price for every open position and propagate updates.
   *
   * Each position is handled independently; a failed quote skips that position
   * for this tick rather than aborting the whole sweep. Overlapping ticks are
   * suppressed so a slow RPC round-trip can't stack callbacks.
   */
  private async tick(): Promise<void> {
    if (this.bindings === null || this.ticking) {
      return;
    }
    this.ticking = true;

    try {
      const openPositions = this.bindings.positionManager.getOpenPositions();
      let positionsChanged = false;

      for (const position of openPositions) {
        const currentPrice = await this.fetchCurrentPrice(position);
        if (currentPrice === null) {
          continue;
        }

        this.bindings.positionManager.updatePositionPrice(position.id, currentPrice);
        const updated = this.bindings.positionManager.getPosition(position.id);
        if (updated !== null) {
          this.bindings.exitMonitor.updatePosition(updated);
          positionsChanged = true;
        }
      }

      if (positionsChanged) {
        this.bindings.onPositionsUpdated?.(this.bindings.positionManager.getOpenPositions());
      }
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Derive the current SOL-per-token price from a live quote.
   *
   * Probes with the same SOL amount that opened the position so price-impact
   * conditions are comparable to entry and PnL stays coherent.
   *
   * @returns Current price in SOL per token, or `null` if it can't be quoted.
   */
  private async fetchCurrentPrice(position: Position): Promise<number | null> {
    const probeSol = position.entrySol > 0 ? position.entrySol : 0.1;
    const probeLamports = Math.round(probeSol * 1_000_000_000);

    try {
      const quote = await this.tradeService.getQuote(WSOL_MINT, position.mint, probeLamports);
      // The raw trade service (SDK adapter) coerces quote fields via Number(),
      // so a missing/zero `outAmount` yields NaN/0. `<= 0` alone lets NaN and
      // Infinity through, producing a NaN/Infinity price that would corrupt the
      // position. Require a finite, positive output before dividing.
      if (!Number.isFinite(quote.expectedOutput) || quote.expectedOutput <= 0) {
        return null;
      }
      return probeSol / quote.expectedOutput;
    } catch (error) {
      pricePollerLogger.warn('Failed to fetch current price', {
        mint: position.mint,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
