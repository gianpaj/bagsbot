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
// OpenTUIApp is imported dynamically to avoid terminal corruption when in headless mode
import { HeadlessCli, createHeadlessCli } from './ui/headless-cli.js';
import { TradeExecutor } from './trading/executor.js';
import type { IBagsTradeService } from './trading/executor.js';
import { WalletManager } from './trading/wallet.js';
import { PositionManager } from './positions/manager.js';
import { ExitMonitor } from './exits/monitor.js';
import type { BotConfig } from './types/config.js';
import type { LaunchpadLaunchEvent } from './types/launch.js';
import type { ExitSignal } from './types/positions.js';
import { logger } from './utils/logger.js';
import { randomUUID } from 'crypto';

// Type for dynamically imported OpenTUIApp
type OpenTUIAppType = import('./ui/app.js').OpenTUIApp;

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
  private uiApp: OpenTUIAppType | null = null;
  private headlessCli: HeadlessCli | null = null;
  private tradeExecutor: TradeExecutor;
  private walletManager: WalletManager;
  private positionManager: PositionManager;
  private exitMonitor: ExitMonitor;
  private connection: Connection;
  private isRunning = false;
  private headless: boolean;
  private unsubscribeHandlers: (() => void)[] = [];
  private logger = logger.child({ module: 'bot' });

  /**
   * Create a new BagsBot instance
   *
   * @param botConfig - Configuration object containing all required components and settings
   */
  constructor(botConfig: BagsBotConfig) {
    this.config = botConfig.config;
    this.headless = botConfig.config.ui.headless ?? false;

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

    // UI will be initialized in initialize() if not in headless mode
    if (this.headless) {
      this.logger.info('Running in headless mode - no terminal UI');
    }

    // Initialize position manager connection
    this.positionManager.setConnection(this.connection);
    this.logger.debug('Position manager connection initialized');

    this.logger.info('BagsBot instance created', {
      solanaRpc: this.config.solanaRpcUrl,
      walletPath: this.config.walletPath,
      maxOpenPositions: this.config.maxOpenPositions,
      maxPositionPercent: this.config.maxPositionPercent,
      headless: this.headless,
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

      // Start the UI (if not headless) or headless CLI
      if (!this.headless) {
        // Dynamically import OpenTUIApp to avoid terminal corruption when in headless mode
        const { OpenTUIApp } = await import('./ui/app.js');
        this.uiApp = new OpenTUIApp({
          botConfig: this.config,
          opportunityTimeoutMs: this.config.ui.opportunityTimeoutSec * 1000,
          onBuyOpportunity: (opportunityId, amount) => {
            this.handleOpportunityConfirmation(opportunityId, amount).catch((err) => {
              this.logger.error('Error confirming opportunity', { error: err });
            });
          },
          onSkipOpportunity: (opportunityId) => {
            this.handleOpportunityRejection(opportunityId);
          },
          onQuit: () => {
            this.shutdown().catch((err) => {
              this.logger.error('Error during shutdown', { error: err });
              process.exit(1);
            });
          },
        });
        await this.uiApp.start();
        try {
          const lamports = await this.walletManager.getBalance(this.connection);
          this.uiApp.setWalletBalance(lamports / 1_000_000_000);
        } catch (error) {
          this.logger.warn('Failed to load wallet balance for UI', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        this.logger.info('UI started successfully');
      } else {
        // Start headless CLI for keyboard interaction
        this.headlessCli = createHeadlessCli({
          onBuy: (opportunityId, amount) => {
            this.handleOpportunityConfirmation(opportunityId, amount).catch((err) => {
              this.logger.error('Error confirming opportunity', { error: err });
            });
          },
          canBuy: () => {
            if (!this.isTradingDisabledForLaunchSource()) {
              return null;
            }
            return `Scenario mode: trading disabled, opportunity left pending (${this.config.launchSource.scenarioName}).`;
          },
          onSkip: (opportunityId) => {
            this.handleOpportunityRejection(opportunityId);
          },
          onQuit: () => {
            this.shutdown().catch((err) => {
              this.logger.error('Error during shutdown', { error: err });
              process.exit(1);
            });
          },
        });
        this.headlessCli.start();
        this.logger.info('Headless CLI started');
      }

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
        this.uiApp?.failAgentWork(event.mint, 'Launch Listener', message);
      });
    });
    this.unsubscribeHandlers.push(unsubLaunch);

    const unsubStatus = this.restreamListener.onConnectionStatusChange((status) => {
      this.uiApp?.setConnectionStatus(status);
    });
    this.unsubscribeHandlers.push(unsubStatus);

    const unsubOpportunityStatus = this.alertSystem.onOpportunityStatusChange((opportunity) => {
      this.uiApp?.syncOpportunityStatus(opportunity);
    });
    this.unsubscribeHandlers.push(unsubOpportunityStatus);

    // Subscribe to exit signals
    const unsubExit = this.exitMonitor.onExitSignal((signal) => {
      this.handleExitSignal(signal);
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
    const handleShutdownSignal = (signal: NodeJS.Signals): void => {
      this.logger.info(`Received ${signal}, initiating graceful shutdown`);
      this.shutdown().catch((error: unknown) => {
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

    // Publish a staged, agent-centric view of the launch before and after the
    // real filter pipeline runs so the dashboard can stream intermediate work.
    this.uiApp?.trackLaunch(event);
    this.uiApp?.startAgentWork(event.mint, 'Creator Analyst', 'evaluating creator signal');
    this.uiApp?.startAgentWork(event.mint, 'Technical Analyst', 'evaluating technical signal');
    this.uiApp?.startAgentWork(event.mint, 'Social Analyst', 'evaluating social signal');
    this.uiApp?.startAgentWork(event.mint, 'Liquidity Analyst', 'evaluating liquidity signal');

    // Evaluate through filter pipeline
    const filterResult = await this.filterPipeline.evaluate(event);

    // Calculate confidence score
    this.uiApp?.startAgentWork(event.mint, 'Scoring Agent', 'scoring opportunity');
    const score = this.scoringEngine.calculate(filterResult.filters);
    const confidence = this.scoringEngine.getConfidenceLevel(score);
    this.uiApp?.applyFilterResult(event.mint, filterResult, confidence);

    this.logger.debug('Launch evaluation complete', {
      mint: event.mint,
      score,
      confidence,
      passed: filterResult.passed,
    });

    // If it doesn't pass the threshold, skip it
    if (!filterResult.passed) {
      this.logger.debug('Launch did not pass filter threshold', { mint: event.mint });
      this.uiApp?.skipAgentWork(
        event.mint,
        'Opportunity Manager',
        'launch did not meet alert threshold'
      );
      this.uiApp?.skipAgentWork(event.mint, 'Trader', 'trade not created');
      this.uiApp?.skipAgentWork(event.mint, 'Position Monitor', 'no position to monitor');
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
    this.uiApp?.startAgentWork(event.mint, 'Opportunity Manager', 'queueing opportunity');
    this.alertSystem.queue(opportunity);
    this.logger.info('Opportunity queued', {
      opportunityId: opportunity.id,
      mint: event.mint,
      score,
    });

    // Display in UI or headless CLI
    if (this.uiApp !== null) {
      this.uiApp.showOpportunity(opportunity);
    } else if (this.headlessCli !== null) {
      // Show opportunity in headless CLI
      this.headlessCli.showOpportunity(opportunity);
    } else {
      // Fallback: just log the opportunity details
      this.logger.info('NEW OPPORTUNITY DETECTED', {
        mint: event.mint,
        name: event.name,
        symbol: event.symbol,
        score,
        suggestedAmount: opportunity.suggestedAmount,
      });
    }
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
      const opportunity = this.alertSystem.getOpportunityById(opportunityId);
      if (opportunity === null) {
        this.logger.warn('Opportunity not found', { opportunityId });
        this.uiApp?.addSystemMessage(`Opportunity ${opportunityId} was not found.`);
        return;
      }

      if (this.isTradingDisabledForLaunchSource()) {
        const message = `Trading is disabled for scenario mode (${this.config.launchSource.scenarioName}).`;
        this.logger.warn('Trade blocked for launch source', {
          opportunityId,
          launchSource: this.config.launchSource.type,
          scenarioName: this.config.launchSource.scenarioName,
        });
        this.uiApp?.addSystemMessage(message, opportunity.launch.mint);
        if (this.headlessCli !== null) {
          this.headlessCli.showOpportunity(opportunity);
        }
        return;
      }

      this.alertSystem.confirm(opportunityId, amount);
      this.uiApp?.startTradeExecution(opportunity.launch.mint, amount);

      // Position limits are enforced after confirmation so the dashboard can
      // show the exact reason a selected opportunity cannot progress to trade.
      // Check position limits
      const openPositions = this.positionManager.getOpenPositions();
      if (openPositions.length >= this.config.maxOpenPositions) {
        this.logger.warn('Max open positions reached', {
          current: openPositions.length,
          max: this.config.maxOpenPositions,
        });
        this.uiApp?.failTradeExecution(
          opportunity.launch.mint,
          `Max open positions reached (${this.config.maxOpenPositions})`
        );
        return;
      }

      // Prepare and execute trade
      const prepared = await this.tradeExecutor.prepareSwap(opportunity.launch.mint, amount);
      const tradeResult = await this.tradeExecutor.executeSwap(prepared);

      if (!tradeResult.success) {
        this.logger.warn('Trade execution failed', {
          opportunityId,
          error: tradeResult.error,
        });
        this.uiApp?.failTradeExecution(
          opportunity.launch.mint,
          tradeResult.error ?? 'Trade execution failed'
        );
        return;
      }

      this.logger.info('Trade executed successfully', {
        opportunityId,
        mint: opportunity.launch.mint,
        signature: tradeResult.signature,
      });
      this.uiApp?.completeTradeExecution(opportunity.launch.mint, tradeResult);

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

      // Update UI (if not headless)
      if (this.uiApp !== null) {
        this.uiApp.updatePositions(this.positionManager.getOpenPositions());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error executing trade', {
        error: message,
        opportunityId,
      });
      const opportunity = this.alertSystem.getOpportunityById(opportunityId);
      if (opportunity !== null) {
        this.uiApp?.failTradeExecution(opportunity.launch.mint, message);
      }
      // Note: UI error display would be handled by the UI component itself
    }
  }

  /**
   * Handle rejection of an opportunity
   *
   * @param opportunityId - The ID of the rejected opportunity
   */
  handleOpportunityRejection(opportunityId: string): void {
    try {
      this.logger.info('Rejecting opportunity', { opportunityId });
      this.alertSystem.reject(opportunityId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error rejecting opportunity', {
        error: message,
        opportunityId,
      });
      const opportunity = this.alertSystem.getOpportunityById(opportunityId);
      if (opportunity !== null) {
        this.uiApp?.failAgentWork(opportunity.launch.mint, 'Opportunity Manager', message);
      } else {
        this.uiApp?.addSystemMessage(`Failed to reject opportunity ${opportunityId}: ${message}`);
      }
    }
  }

  /**
   * Handle exit signals from the exit monitor
   *
   * When a position reaches take-profit or stop-loss, the exit monitor
   * emits a signal. This handler processes it.
   */
  private handleExitSignal(signal: ExitSignal): void {
    this.logger.info('Processing exit signal', {
      type: signal.type,
      currentPrice: signal.currentPrice,
      triggerPercent: signal.triggerPercent,
    });

    try {
      // Exit execution is still manual, but the dashboard treats the trigger as
      // a first-class lifecycle event for the selected item report.
      this.logger.info('Exit signal details', {
        mint: signal.position.mint,
        tokenSymbol: signal.position.tokenSymbol,
        entryPrice: signal.position.entryPrice,
        currentPrice: signal.currentPrice,
        type: signal.type,
      });

      // Update UI (if not headless)
      if (this.uiApp !== null) {
        this.uiApp.recordExitSignal(signal);
        this.uiApp.updatePositions(this.positionManager.getOpenPositions());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error processing exit signal', {
        error: message,
      });
      this.uiApp?.failAgentWork(signal.position.mint, 'Position Monitor', message);
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

  private isTradingDisabledForLaunchSource(): boolean {
    return this.config.launchSource.type === 'scenario' && this.config.launchSource.disableTrading;
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
      this.unsubscribeHandlers.forEach((unsub) => {
        unsub();
      });
      this.unsubscribeHandlers = [];

      // Stop exit monitor
      this.exitMonitor.stop();
      this.logger.debug('Exit monitor stopped');

      // Disconnect from Restream
      await this.restreamListener.disconnect();
      this.logger.debug('Restream listener disconnected');

      // Stop UI or headless CLI
      if (this.uiApp !== null) {
        this.uiApp.setConnectionStatus('disconnected');
        this.uiApp.stop();
        this.logger.debug('UI stopped');
      }
      if (this.headlessCli !== null) {
        this.headlessCli.stop();
        this.logger.debug('Headless CLI stopped');
      }

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
  getState(): {
    isRunning: boolean;
    openPositions: number;
    pendingOpportunities: number;
    connectionStatus: string;
  } {
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
