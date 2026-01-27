/**
 * Simple CLI interface for headless mode
 *
 * Provides keyboard-based interaction for confirming/rejecting opportunities
 * without requiring the full OpenTUI terminal UI.
 *
 * @module ui/headless-cli
 */

import * as readline from 'node:readline';
import type { Opportunity } from '../alerts/system.js';
import { logger } from '../utils/logger.js';

const cliLogger = logger.child({ module: 'headless-cli' });

/**
 * Callback types for CLI actions
 */
export interface HeadlessCliCallbacks {
  onBuy: (opportunityId: string, amount: number) => void;
  onSkip: (opportunityId: string) => void;
  onQuit: () => void;
}

/**
 * Headless CLI for interacting with the bot
 */
export class HeadlessCli {
  private rl: readline.Interface | null = null;
  private callbacks: HeadlessCliCallbacks;
  private currentOpportunity: Opportunity | null = null;
  private isRunning = false;

  constructor(callbacks: HeadlessCliCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Start the CLI interface
   */
  start(): void {
    if (this.isRunning) return;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Enable raw mode for single keypress detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('data', (data: Buffer) => {
      const key = data.toString().toLowerCase();
      this.handleKeypress(key);
    });

    this.isRunning = true;
    this.printHelp();
    cliLogger.info('Headless CLI started');
  }

  /**
   * Stop the CLI interface
   */
  stop(): void {
    if (!this.isRunning) return;

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    this.isRunning = false;
    cliLogger.info('Headless CLI stopped');
  }

  /**
   * Show a new opportunity to the user
   */
  showOpportunity(opportunity: Opportunity): void {
    this.currentOpportunity = opportunity;

    console.log('\n' + '='.repeat(60));
    console.log('NEW OPPORTUNITY DETECTED');
    console.log('='.repeat(60));
    console.log(`Token: ${opportunity.launch.name} (${opportunity.launch.symbol})`);
    console.log(`Mint: ${opportunity.launch.mint}`);
    console.log(`Score: ${opportunity.filterResult.score}/100`);
    console.log(`Suggested Amount: ${opportunity.suggestedAmount.toFixed(4)} SOL`);
    console.log('-'.repeat(60));
    console.log('Commands: [B] Buy  [S] Skip  [Q] Quit');
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Handle keypress events
   */
  private handleKeypress(key: string): void {
    // Handle Ctrl+C
    if (key === '\x03') {
      this.callbacks.onQuit();
      return;
    }

    switch (key) {
      case 'b':
        if (this.currentOpportunity) {
          console.log(`Buying ${this.currentOpportunity.launch.symbol}...`);
          this.callbacks.onBuy(
            this.currentOpportunity.id,
            this.currentOpportunity.suggestedAmount
          );
          this.currentOpportunity = null;
        } else {
          console.log('No opportunity available to buy');
        }
        break;

      case 's':
        if (this.currentOpportunity) {
          console.log(`Skipping ${this.currentOpportunity.launch.symbol}`);
          this.callbacks.onSkip(this.currentOpportunity.id);
          this.currentOpportunity = null;
        } else {
          console.log('No opportunity to skip');
        }
        break;

      case 'q':
        this.callbacks.onQuit();
        break;

      case 'h':
      case '?':
        this.printHelp();
        break;

      case 'i':
        this.printStatus();
        break;

      default:
        // Ignore other keys
        break;
    }
  }

  /**
   * Print help information
   */
  private printHelp(): void {
    console.log('\n--- Bags Sniper Bot (Headless Mode) ---');
    console.log('Commands:');
    console.log('  B - Buy current opportunity');
    console.log('  S - Skip current opportunity');
    console.log('  I - Show bot status');
    console.log('  H - Show this help');
    console.log('  Q - Quit (or Ctrl+C)');
    console.log('---------------------------------------\n');
  }

  /**
   * Print current status
   */
  private printStatus(): void {
    console.log('\n--- Bot Status ---');
    if (this.currentOpportunity) {
      console.log(`Current opportunity: ${this.currentOpportunity.launch.name}`);
    } else {
      console.log('Waiting for opportunities...');
    }
    console.log('------------------\n');
  }

  /**
   * Clear the current opportunity (e.g., after timeout)
   */
  clearOpportunity(): void {
    this.currentOpportunity = null;
  }
}

/**
 * Create a new HeadlessCli instance
 */
export function createHeadlessCli(callbacks: HeadlessCliCallbacks): HeadlessCli {
  return new HeadlessCli(callbacks);
}
