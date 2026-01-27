/**
 * OpenTUI Application Setup
 *
 * Initializes the terminal UI for Bags Sniper Bot using OpenTUI.
 * Handles application lifecycle, keyboard input, screen state management,
 * and global event handling.
 *
 * @module ui/app
 */

// Type aliases for OpenTUI types
 
export type CliRenderer = any;
 
export type RenderContext = any;

import * as OpenTUI from '@opentui/core';
import type { BotConfig, Position } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { createMainLayout } from './layout.js';

// Extract functions from OpenTUI module
 
const createCliRenderer: any = (OpenTUI as any).createCliRenderer;
 
const RootRenderable: any = (OpenTUI as any).RootRenderable;

/**
 * Represents the current screen being displayed
 */
export type ScreenState = 'main' | 'positions' | 'history' | 'settings';

/**
 * Application state for the TUI
 */
export interface AppState {
  currentScreen: ScreenState;
  selectedOpportunity: unknown | null;
  positions: Position[];
  isRunning: boolean;
}

/**
 * Configuration for the OpenTUI application
 */
export interface AppConfig {
  botConfig: BotConfig;
  opportunityTimeoutMs?: number;
}

/**
 * Main OpenTUI application class
 *
 * Manages:
 * - Terminal renderer initialization
 * - Application state and screen navigation
 * - Keyboard input handling
 * - Layout composition and rendering
 *
 * @example
 * ```typescript
 * const app = new OpenTUIApp(botConfig);
 * await app.start();
 * app.showOpportunity(launchEvent);
 * await app.stop();
 * ```
 */
export class OpenTUIApp {
  private renderer: CliRenderer | null = null;
   
  private rootRenderable: any | null = null;
  private config: AppConfig;
  private state: AppState;
  private logger = logger.child({ module: 'app' });

  /**
   * Creates a new OpenTUI application instance
   *
   * @param config - Application configuration
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.state = {
      currentScreen: 'main',
      selectedOpportunity: null,
      positions: [],
      isRunning: false,
    };
  }

  /**
   * Initialize and start the terminal UI
   *
   * @throws Error if initialization fails or Zig is not installed
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting OpenTUI application');

      // Create the CLI renderer with configuration
      this.renderer = await createCliRenderer({
        exitOnCtrlC: true,
        exitSignals: ['SIGINT', 'SIGTERM'],
        debounceDelay: 50,
        targetFps: 30,
        useAlternateScreen: true,
        useMouse: false,
        useConsole: false,
      });

      this.logger.debug('CLI renderer created');

      // Setup global keyboard input handler
      this.setupKeyboardInput();

      // Create the root renderable (main container) - needs RenderContext from renderer
      this.rootRenderable = new RootRenderable(this.renderer);

      // Create and add the main layout
      const mainLayout = createMainLayout(this.state, this.config.botConfig);
      this.rootRenderable.add(mainLayout);

      this.logger.debug('Main layout added to root');

      // Add root renderable to renderer
      this.renderer.add(this.rootRenderable);

      this.state.isRunning = true;
      this.logger.info('OpenTUI application started successfully');
    } catch (error) {
      this.logger.error('Failed to start OpenTUI application', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
      });

      // Provide helpful error message for missing Zig installation
      if (
        error instanceof Error &&
        error.message.includes('Zig')
      ) {
        this.logger.error(
          'Zig compiler is required to run OpenTUI. ' +
            'Please install Zig from https://ziglang.org/download'
        );
      }

      throw error;
    }
  }

  /**
   * Setup global keyboard input handler
   *
   * Handles:
   * - Screen navigation (P for positions, H for history, S for settings)
   * - Opportunity actions (B for buy, S for skip, C for custom)
   * - Quit action (Q for quit)
   */
  private setupKeyboardInput(): void {
    if (this.renderer === null) {
      this.logger.warn('Renderer not initialized when setting up keyboard input');
      return;
    }

    this.renderer.on('key', (data: Buffer) => {
      const keyStr = data.toString('utf-8').toLowerCase();

      // Screen navigation
      switch (keyStr) {
        case 'p':
          this.navigateToScreen('positions');
          break;
        case 'h':
          this.navigateToScreen('history');
          break;
        case 's':
          if (this.state.currentScreen === 'main') {
            // In main screen, 's' means skip
            this.handleSkipOpportunity();
          } else {
            // In other screens, 's' means navigate to settings
            this.navigateToScreen('settings');
          }
          break;
        case 'q':
          this.stop();
          break;
        // Buy action
        case 'b':
          if (this.state.currentScreen === 'main') {
            this.handleBuyOpportunity();
          }
          break;
        // Custom amount
        case 'c':
          if (this.state.currentScreen === 'main') {
            this.handleCustomAmount();
          }
          break;
        // View details
        case 'v':
          if (this.state.currentScreen === 'main') {
            this.handleViewDetails();
          }
          break;
        default:
          this.logger.debug('Key pressed', { key: keyStr });
      }
    });

    this.logger.debug('Keyboard input handler setup complete');
  }

  /**
   * Navigate to a different screen
   *
   * @param screen - The screen to navigate to
   */
  navigateToScreen(screen: ScreenState): void {
    if (this.state.currentScreen === screen) {
      return;
    }

    const previousScreen = this.state.currentScreen;
    this.state.currentScreen = screen;

    this.logger.info('Screen navigation', {
      from: previousScreen,
      to: screen,
    });

    // Trigger layout update
    this.updateLayout();
  }

  /**
   * Update the layout based on current state
   */
  private updateLayout(): void {
    if (this.rootRenderable === null || this.renderer === null) {
      return;
    }

    // Clear existing children
    const children = this.rootRenderable.getChildren();
    children.forEach((child: unknown) => {
      const childRenderable = child as { id: string };
      this.rootRenderable?.remove(childRenderable.id);
    });

    // Create and add new layout based on current screen
    const newLayout = createMainLayout(this.state, this.config.botConfig);
    this.rootRenderable.add(newLayout);

    // Request a render update
    if (this.renderer !== null) {
      this.renderer.requestRender();
    }

    this.logger.debug('Layout updated', { screen: this.state.currentScreen });
  }

  /**
   * Handle buy opportunity action
   */
  private handleBuyOpportunity(): void {
    this.logger.info('Buy action triggered');
    // This will be integrated with trading module
    // For now, just log the action
  }

  /**
   * Handle skip opportunity action
   */
  private handleSkipOpportunity(): void {
    this.logger.info('Skip action triggered');
    // This will be integrated with filtering/pipeline
    // For now, just log the action
  }

  /**
   * Handle custom amount input
   */
  private handleCustomAmount(): void {
    this.logger.info('Custom amount action triggered');
    // This will show an input dialog for custom amount
    // For now, just log the action
  }

  /**
   * Handle view details action
   */
  private handleViewDetails(): void {
    this.logger.info('View details action triggered');
    // This will show detailed information about the opportunity
    // For now, just log the action
  }

  /**
   * Update application with a new opportunity
   *
   * @param opportunity - The launch opportunity to display
   */
  showOpportunity(opportunity: unknown): void {
    this.state.selectedOpportunity = opportunity;
    this.navigateToScreen('main');
    this.logger.debug('Opportunity updated', { opportunity });
  }

  /**
   * Update the positions list
   *
   * @param positions - Array of current positions
   */
  updatePositions(positions: Position[]): void {
    this.state.positions = positions;
    this.updateLayout();
    this.logger.debug('Positions updated', { count: positions.length });
  }

  /**
   * Request a renderer update
   */
  requestRender(): void {
    if (this.renderer !== null) {
      this.renderer.requestRender();
    }
  }

  /**
   * Stop the application and cleanup resources
   */
  stop(): void {
    try {
      this.logger.info('Stopping OpenTUI application');
      this.state.isRunning = false;

      if (this.renderer !== null) {
        this.renderer.destroy();
        this.renderer = null;
      }

      this.rootRenderable = null;
      this.logger.info('OpenTUI application stopped');
    } catch (error) {
      this.logger.error('Error stopping application', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the current application state
   *
   * @returns Current app state
   */
  getState(): AppState {
    return { ...this.state };
  }

  /**
   * Check if the application is running
   *
   * @returns True if running
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }
}
