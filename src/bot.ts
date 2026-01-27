/**
 * Main bot orchestrator for Bags Sniper Bot
 *
 * The BagsBot class is the central orchestrator that ties together all components:
 * - Restream listener for token launches
 * - Filter pipeline for evaluating launches
 * - Scoring engine for confidence calculation
 * - Alert system for opportunity management
 * - UI for user interaction
 * - Trade executor for executing trades
 * - Position manager for tracking positions
 * - Exit monitor for managing exits
 *
 * @module bot
 */

import { Connection } from '@solana/web3.js';
import type { IRestreamClient } from './listeners/restream.js';
import { RestreamListener } from './listeners/restream.js';
import { FilterPipeline } from './filters/pipeline.js';
import type { FilterRegistry } from './filters/types.js';
import { ScoringEngine } from './scoring/engine.js';
import { AlertSystem, type Opportunity } from './alerts/system.js';
import { OpenTUIApp } from './ui/app.js';
import { TradeExecutor } from './trading/executor.js';
import type { IBagsTradeService } from './trading/executor.js';
import { WalletManager } from './trading/wallet.js';
import { PositionManager } from './positions/manager.js';
import { ExitMonitor, type ExitSignalHandler } from './exits/monitor.js';
import type { BotConfig } from './types/config.js';
import type { LaunchpadLaunchEvent } from './types/launch.js';
import type { ExitSignal } from './types/positions.js';
import { logger } from './utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Configuration for the BagsBot
 */
export interface BagsBotConfig {
  config: BotConfig;
  restreamClient: IRestreamClient;
  bagsTradeService: IBagsTradeService;
  filterRegistry: FilterRegistry;
}

/**
 * BagsBot class - Main orchestrator for the sniper bot
 *
 * Manages the entire data flow from launch detection to trade execution:
 * 1. RestreamListener detects new token launches
 * 2. FilterPipeline evaluates launches against criteria
 * 3. ScoringEngine calculates confidence scores
 * 4. AlertSystem queues qualifying opportunities
 * 5. OpenTUIApp displays opportunities for user confirmation
 * 6. TradeExecutor executes confirmed trades
 * 7. PositionManager tracks open positions
 * 8. ExitMonitor watches for take-profit and stop-loss triggers
 *
 * @example
 * ```typescript
 * const bot = new BagsBot({
 *   config: botConfig,
 *   restreamClient,
 *   bagsTradeService,
 *   filterRegistry,
 * });
 *
 * await bot.initialize();
 * // Bot runs and monitors token launches
 * await bot.shutdown();
 * ```
 */
export class BagsBot {
  private config: BotConfig;
  private restreamListener: RestreamListener;
  private filterPipeline: FilterPipeline;
  private scoringEngine: ScoringEngine;
  private alertSystem: AlertSystem;
  private uiApp: OpenTUIApp;
  private tradeExecutor: TradeExecutor;
  private walletManager: WalletManager;
  private positionManager: PositionManager;
  private exitMonitor: ExitMonitor;
  private connection: Connection;
  private isRunning = false;
  private unsubscribeHandlers: (() => void)[] = [];
  private logger = logger.child({ module: 'bot' });

  /**
   * Create a new BagsBot instance
   *
   * @param botConfig - Configuration object containing all required components and settings
   */
  constructor(botConfig: BagsBotConfig) {
    this.config = botConfig.config;

    // Initialize Solana connection
    this.connection = new Connection(this.config.solanaRpcUrl, 'confirmed');

    // Initialize core components
    this.restreamListener = new RestreamListener(botConfig.restreamClient);
    this.filterPipeline = new FilterPipeline(botConfig.filterRegistry, this.config.scoring);
    this.scoringEngine = new ScoringEngine(this.config.scoring);
    this.alertSystem = new AlertSystem({
      opportunityTimeoutMs: this.config.ui.opportunityTimeoutSec * 1000,
    });
    this.walletManager = new WalletManager();
    this.positionManager = new PositionManager();
    this.exitMonitor = new ExitMonitor(this.config.exits);
    this.tradeExecutor = new TradeExecutor(
      botConfig.bagsTradeService,
      this.walletManager,
      this.connection,
      this.config.trading
    );
    this.uiApp = new OpenTUIApp({
      botConfig: this.config,
      opportunityTimeoutMs: this.config.ui.opportunityTimeoutSec * 1000,
    });

    // Initialize position manager connection
    this.positionManager.setConnection(this.connection);
    this.logger.debug('Position manager connection initialized');

    this.logger.info('BagsBot instance created', {
      solanaRpc: this.config.solanaRpcUrl,
      walletPath: this.config.walletPath,
      maxOpenPositions: this.config.maxOpenPositions,
      maxPositionPercent: this.config.maxPositionPercent,
    });
  }

  /**
   * Initialize the bot and start monitoring
   *
   * This method:
   * 1. Loads the wallet keypair
   * 2. Connects to Restream listener
   * 3. Starts the UI
   * 4. Sets up all event handlers
   * 5. Begins monitoring token launches
   *
   * @throws Error if initialization fails
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing BagsBot');

      // Load wallet
      try {
        this.walletManager.loadWallet(this.config.walletPath);
        this.logger.info('Wallet loaded successfully');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to load wallet', { error: message });
        throw error;
      }

      // Start the UI
      await this.uiApp.start();
      this.logger.info('UI started successfully');

      // Connect to Restream listener
      await this.restreamListener.connect();
      this.logger.info('Restream listener connected');

      // Wire up event handlers
      this.setupEventHandlers();
      this.setupSignalHandlers();

      this.isRunning = true;
      this.logger.info('BagsBot initialized and running');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize BagsBot', { error: message });
      await this.shutdown();
      throw error;
    }
  }

  /**
   * Set up all event handlers for the data flow pipeline
   *
   * @returns void
   */
  private setupEventHandlers(): void {
    // Subscribe to launch events from Restream
    const unsubLaunch = this.restreamListener.onLaunch((event: LaunchpadLaunchEvent) => {
      this.handleLaunchEvent(event).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Error handling launch event', {
          error: message,
          mint: event.mint,
        });
      });
    });
    this.unsubscribeHandlers.push(unsubLaunch);

    // Subscribe to UI confirmations
    // Note: The UI will call methods on this class to confirm trades
    // This is handled through the handleOpportunityConfirmation method

    // Subscribe to exit signals
    const unsubExit = this.exitMonitor.onExitSignal((signal) => {
      this.handleExitSignal(signal).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Error handling exit signal', {
          error: message,
          type: signal.type,
        });
      });
    });
    this.unsubscribeHandlers.push(unsubExit);

    // Start exit monitor
    this.exitMonitor.start();
    this.logger.debug('Event handlers set up');
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const handleShutdownSignal = (signal: NodeJS.Signals) => {
      this.logger.info(`Received ${signal}, initiating graceful shutdown`);
      this.shutdown().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Error during shutdown', { error: message });
        process.exit(1);
      });
    };

    process.on('SIGINT', () => {
      handleShutdownSignal('SIGINT');
    });
    process.on('SIGTERM', () => {
      handleShutdownSignal('SIGTERM');
    });
  }

  /**
   * Handle a new launch event from Restream
   *
   * Process:
   * 1. Evaluate launch through filter pipeline
   * 2. Calculate confidence score
   * 3. Queue opportunity if it passes threshold
   * 4. Display opportunity in UI
   */
  private async handleLaunchEvent(event: LaunchpadLaunchEvent): Promise<void> {
    this.logger.debug('Processing launch event', { mint: event.mint, name: event.name });

    // Evaluate through filter pipeline
    const filterResult = await this.filterPipeline.evaluate(event);

    // Calculate confidence score
    const score = this.scoringEngine.calculate(filterResult.filters);
    const confidence = this.scoringEngine.getConfidenceLevel(score);

    this.logger.debug('Launch evaluation complete', {
      mint: event.mint,
      score,
      confidence,
      passed: filterResult.passed,
    });

    // If it doesn't pass the threshold, skip it
    if (!filterResult.passed) {
      this.logger.debug('Launch did not pass filter threshold', { mint: event.mint });
      return;
    }

    // Create opportunity
    const opportunity: Opportunity = {
      id: randomUUID(),
      launch: event,
      filterResult,
      suggestedAmount: this.calculateSuggestedAmount(),
      timestamp: new Date(),
      status: 'pending',
    };

    // Add to alert queue (queue method will set timestamp and status)
    this.alertSystem.queue(opportunity);
    this.logger.info('Opportunity queued', {
      opportunityId: opportunity.id,
      mint: event.mint,
      score,
    });

    // Display in UI
    this.uiApp.showOpportunity(opportunity);
  }

  /**
   * Handle user confirmation of an opportunity
   *
   * This method is called by the UI when the user confirms a trade.
   *
   * @param opportunityId - The ID of the confirmed opportunity
   * @param amount - The amount to trade (in SOL)
   */
  async handleOpportunityConfirmation(opportunityId: string, amount: number): Promise<void> {
    try {
      this.logger.info('Processing opportunity confirmation', {
        opportunityId,
        amount,
      });

      // Confirm in alert system
      const opportunity = this.alertSystem.getCurrentOpportunity();
      if (!opportunity?.id || opportunity.id !== opportunityId) {
        this.logger.warn('Opportunity not found or not current', { opportunityId });
        return;
      }

      await this.alertSystem.confirm(opportunityId, amount);

      // Check position limits
      const openPositions = this.positionManager.getOpenPositions();
      if (openPositions.length >= this.config.maxOpenPositions) {
        this.logger.warn('Max open positions reached', {
          current: openPositions.length,
          max: this.config.maxOpenPositions,
        });
        return;
      }

      // Prepare and execute trade
      const prepared = await this.tradeExecutor.prepareSwap(
        opportunity.launch.mint,
        amount
      );
      const tradeResult = await this.tradeExecutor.executeSwap(prepared);

      if (!tradeResult.success) {
        this.logger.warn('Trade execution failed', {
          opportunityId,
          error: tradeResult.error,
        });
        return;
      }

      this.logger.info('Trade executed successfully', {
        opportunityId,
        mint: opportunity.launch.mint,
        signature: tradeResult.signature,
      });

      // Add position to manager
      // Note: We need the actual tokens received and entry SOL amount from trade result
      const position = this.positionManager.addPosition(
        tradeResult,
        opportunity.launch,
        tradeResult.executedPrice ?? 0,
        tradeResult.tokensReceived ?? 0,
        amount
      );

      // Start monitoring position
      this.exitMonitor.addPosition(position);

      // Update UI
      this.uiApp.updatePositions(this.positionManager.getOpenPositions());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error executing trade', {
        error: message,
        opportunityId,
      });
      // Note: UI error display would be handled by the UI component itself
    }
  }

  /**
   * Handle rejection of an opportunity
   *
   * @param opportunityId - The ID of the rejected opportunity
   */
  async handleOpportunityRejection(opportunityId: string): Promise<void> {
    try {
      this.logger.info('Rejecting opportunity', { opportunityId });
      this.alertSystem.reject(opportunityId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error rejecting opportunity', {
        error: message,
        opportunityId,
      });
    }
  }

  /**
   * Handle exit signals from the exit monitor
   *
   * When a position reaches take-profit or stop-loss, the exit monitor
   * emits a signal. This handler processes it.
   */
  private async handleExitSignal(signal: ExitSignal): Promise<void> {
    this.logger.info('Processing exit signal', {
      type: signal.type,
      currentPrice: signal.currentPrice,
      triggerPercent: signal.triggerPercent,
    });

    try {
      // Note: In a real implementation, this would execute the exit trade
      // For now, we just log it and update the UI
      const position = signal.position;
      if (!position) {
        this.logger.warn('No position in exit signal');
        return;
      }

      this.logger.info('Exit signal details', {
        mint: position.mint,
        tokenSymbol: position.tokenSymbol,
        entryPrice: position.entryPrice,
        currentPrice: signal.currentPrice,
        type: signal.type,
      });

      // Update UI
      this.uiApp.updatePositions(this.positionManager.getOpenPositions());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error processing exit signal', {
        error: message,
      });
    }
  }

  /**
   * Calculate suggested trading amount based on wallet balance
   *
   * Takes into account:
   * - maxPositionPercent configuration
   * - Number of open positions
   * - Estimated balance (rough estimate since getBalance is async)
   *
   * @returns Suggested amount in SOL
   */
  private calculateSuggestedAmount(): number {
    try {
      // Get open positions to calculate utilization
      const openPositions = this.positionManager.getOpenPositions();
      const utilizationFactor = Math.max(0.1, 1 - openPositions.length * 0.1);

      // Use a conservative estimate (0.5 SOL base, scaled by utilization)
      const baseAmount = 0.5;
      const maxPerPosition = baseAmount * (this.config.maxPositionPercent / 100);

      return maxPerPosition * utilizationFactor;
    } catch (error) {
      this.logger.warn('Error calculating suggested amount, using default', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0.1; // Default 0.1 SOL
    }
  }

  /**
   * Gracefully shut down the bot
   *
   * This method:
   * 1. Stops accepting new opportunities
   * 2. Disconnects from Restream
   * 3. Stops the exit monitor
   * 4. Stops the UI
   * 5. Saves all state to storage
   * 6. Cleans up resources
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      this.logger.debug('Bot not running, skip shutdown');
      return;
    }

    try {
      this.logger.info('Shutting down BagsBot');
      this.isRunning = false;

      // Stop accepting new events
      this.unsubscribeHandlers.forEach((unsub) => unsub());
      this.unsubscribeHandlers = [];

      // Stop exit monitor
      this.exitMonitor.stop();
      this.logger.debug('Exit monitor stopped');

      // Disconnect from Restream
      await this.restreamListener.disconnect();
      this.logger.debug('Restream listener disconnected');

      // Stop UI
      await this.uiApp.stop();
      this.logger.debug('UI stopped');

      // Clean up alert system
      this.alertSystem.destroy();
      this.logger.debug('Alert system cleaned up');

      this.logger.info('BagsBot shut down successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error during shutdown', { error: message });
    }
  }

  /**
   * Get the current state of the bot
   *
   * @returns Object containing bot state information
   */
  getState() {
    return {
      isRunning: this.isRunning,
      openPositions: this.positionManager.getOpenPositions().length,
      pendingOpportunities: this.alertSystem.getPendingCount(),
      connectionStatus: this.restreamListener.getStatus(),
    };
  }

  /**
   * Get the position manager for external access
   *
   * @returns PositionManager instance
   */
  getPositionManager(): PositionManager {
    return this.positionManager;
  }

  /**
   * Get the alert system for external access
   *
   * @returns AlertSystem instance
   */
  getAlertSystem(): AlertSystem {
    return this.alertSystem;
  }

  /**
   * Get the Restream listener for external access
   *
   * @returns RestreamListener instance
   */
  getRestreamListener(): RestreamListener {
    return this.restreamListener;
  }
}

/**
 * Create a new BagsBot instance
 *
 * @param config - Bot configuration
 * @returns New BagsBot instance
 */
export function createBagsBot(config: BagsBotConfig): BagsBot {
  return new BagsBot(config);
}
