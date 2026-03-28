/**
 * OpenTUI dashboard application for BagsBot.
 */

import * as OpenTUI from '@opentui/core';
import type { BotConfig, Position } from '../types/index.js';
import type { Opportunity } from '../alerts/system.js';
import type { FilterPipelineResult } from '../types/filters.js';
import type { LaunchpadLaunchEvent } from '../types/launch.js';
import type { ExitSignal } from '../types/positions.js';
import type { TradeResult } from '../types/trading.js';
import type { ConnectionStatus } from '../listeners/restream.js';
import type { ConfidenceLevel } from '../scoring/engine.js';
import { logger } from '../utils/logger.js';
import { createMainLayout } from './layout.js';
import {
  type DashboardAgentName,
  type DashboardState,
  cloneDashboardState,
  createDashboardState,
  updateConnectionState,
  setWalletBalance,
  trackLaunch,
  startAgentWork as startDashboardAgentWork,
  completeAgentWork as completeDashboardAgentWork,
  skipAgentWork as skipDashboardAgentWork,
  failAgentWork as failDashboardAgentWork,
  applyFilterResult,
  markOpportunityCreated,
  syncOpportunityStatus,
  startTradeExecution,
  completeTradeExecution,
  failTradeExecution,
  syncPositions,
  recordExitSignal,
  addSystemMessage,
  selectNextItem,
  selectPreviousItem,
  getSelectedPendingOpportunity,
} from './dashboard-state.js';

export type CliRenderer = any;
export type RenderContext = any;

const createCliRenderer: any = (OpenTUI as any).createCliRenderer;
const RootRenderable: any = (OpenTUI as any).RootRenderable;

// Preserve the old type export so existing component modules still compile.
export type ScreenState = 'main' | 'positions' | 'history' | 'settings';

export interface AppState {
  dashboard: DashboardState;
  isRunning: boolean;
}

export interface AppConfig {
  botConfig: BotConfig;
  opportunityTimeoutMs?: number;
  onBuyOpportunity?: (opportunityId: string, amount: number) => void;
  onSkipOpportunity?: (opportunityId: string) => void;
  onQuit?: () => void;
}

export class OpenTUIApp {
  private renderer: CliRenderer | null = null;
  private rootRenderable: any | null = null;
  private config: AppConfig;
  private state: AppState;
  private logger = logger.child({ module: 'app' });

  constructor(config: AppConfig) {
    this.config = config;
    this.state = {
      dashboard: createDashboardState(),
      isRunning: false,
    };
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting OpenTUI dashboard');

      // The renderer owns the alternate-screen session and the root render tree.
      this.renderer = await createCliRenderer({
        exitOnCtrlC: true,
        exitSignals: ['SIGINT', 'SIGTERM'],
        debounceDelay: 50,
        targetFps: 30,
        useAlternateScreen: true,
        useMouse: false,
        useConsole: false,
      });

      this.setupKeyboardInput();
      this.rootRenderable = new RootRenderable(this.renderer);
      this.rootRenderable.add(createMainLayout(this.state, this.config.botConfig));
      this.renderer.add(this.rootRenderable);

      this.state.isRunning = true;
      this.logger.info('OpenTUI dashboard started');
    } catch (error) {
      this.logger.error('Failed to start OpenTUI application', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
      });
      throw error;
    }
  }

  private setupKeyboardInput(): void {
    if (this.renderer === null) {
      return;
    }

    // Selection is item-centric: keyboard input moves through tracked coins,
    // then buy/skip actions operate on the selected pending opportunity.
    this.renderer.on('key', (data: Buffer) => {
      const keyStr = data.toString('utf-8').toLowerCase();

      switch (keyStr) {
        case '\u001b[a':
        case 'k':
          this.selectPreviousItem();
          break;
        case '\u001b[b':
        case 'j':
          this.selectNextItem();
          break;
        case 'b':
          this.handleBuyOpportunity();
          break;
        case 's':
          this.handleSkipOpportunity();
          break;
        case 'q':
          this.handleQuit();
          break;
        default:
          this.logger.debug('Key pressed', { key: keyStr });
      }
    });
  }

  private handleBuyOpportunity(): void {
    const opportunity = getSelectedPendingOpportunity(this.state.dashboard);
    if (opportunity === null) {
      addSystemMessage(this.state.dashboard, 'No pending opportunity is selected.');
      this.updateLayout();
      return;
    }

    this.config.onBuyOpportunity?.(opportunity.id, opportunity.suggestedAmount);
  }

  private handleSkipOpportunity(): void {
    const opportunity = getSelectedPendingOpportunity(this.state.dashboard);
    if (opportunity === null) {
      addSystemMessage(this.state.dashboard, 'No pending opportunity is selected.');
      this.updateLayout();
      return;
    }

    this.config.onSkipOpportunity?.(opportunity.id);
  }

  private handleQuit(): void {
    if (this.config.onQuit !== undefined) {
      this.config.onQuit();
      return;
    }

    this.stop();
  }

  private selectNextItem(): void {
    selectNextItem(this.state.dashboard);
    this.updateLayout();
  }

  private selectPreviousItem(): void {
    selectPreviousItem(this.state.dashboard);
    this.updateLayout();
  }

  private updateLayout(): void {
    if (this.rootRenderable === null || this.renderer === null) {
      return;
    }

    // The layout is derived from the dashboard store, so re-rendering means
    // replacing the root child with a fresh layout snapshot.
    const children = this.rootRenderable.getChildren();
    children.forEach((child: unknown) => {
      const childRenderable = child as { id: string };
      this.rootRenderable?.remove(childRenderable.id);
    });

    this.rootRenderable.add(createMainLayout(this.state, this.config.botConfig));
    this.renderer.requestRender();
  }

  setConnectionStatus(status: ConnectionStatus): void {
    updateConnectionState(this.state.dashboard, status);
    this.updateLayout();
  }

  // Runtime bridge methods below let the bot publish structured lifecycle
  // events without depending on layout or renderable details.
  setWalletBalance(walletBalanceSol: number): void {
    setWalletBalance(this.state.dashboard, walletBalanceSol);
    this.updateLayout();
  }

  trackLaunch(event: LaunchpadLaunchEvent): void {
    trackLaunch(this.state.dashboard, event);
    this.updateLayout();
  }

  startAgentWork(itemId: string, agent: DashboardAgentName, message: string): void {
    startDashboardAgentWork(this.state.dashboard, itemId, agent, message);
    this.updateLayout();
  }

  completeAgentWork(itemId: string, agent: DashboardAgentName, message: string): void {
    completeDashboardAgentWork(this.state.dashboard, itemId, agent, message);
    this.updateLayout();
  }

  skipAgentWork(itemId: string, agent: DashboardAgentName, message: string): void {
    skipDashboardAgentWork(this.state.dashboard, itemId, agent, message);
    this.updateLayout();
  }

  failAgentWork(itemId: string, agent: DashboardAgentName, error: string): void {
    failDashboardAgentWork(this.state.dashboard, itemId, agent, error);
    this.updateLayout();
  }

  applyFilterResult(
    itemId: string,
    filterResult: FilterPipelineResult,
    confidence: ConfidenceLevel
  ): void {
    applyFilterResult(this.state.dashboard, itemId, filterResult, confidence);
    this.updateLayout();
  }

  showOpportunity(opportunity: Opportunity): void {
    markOpportunityCreated(this.state.dashboard, opportunity);
    this.updateLayout();
  }

  syncOpportunityStatus(opportunity: Opportunity): void {
    syncOpportunityStatus(this.state.dashboard, opportunity);
    this.updateLayout();
  }

  startTradeExecution(itemId: string, amountSol: number): void {
    startTradeExecution(this.state.dashboard, itemId, amountSol);
    this.updateLayout();
  }

  completeTradeExecution(itemId: string, tradeResult: TradeResult): void {
    completeTradeExecution(this.state.dashboard, itemId, tradeResult);
    this.updateLayout();
  }

  failTradeExecution(itemId: string, error: string): void {
    failTradeExecution(this.state.dashboard, itemId, error);
    this.updateLayout();
  }

  updatePositions(positions: Position[]): void {
    syncPositions(this.state.dashboard, positions);
    this.updateLayout();
  }

  recordExitSignal(signal: ExitSignal): void {
    recordExitSignal(this.state.dashboard, signal);
    this.updateLayout();
  }

  addSystemMessage(message: string, itemId: string | 'global' = 'global'): void {
    addSystemMessage(this.state.dashboard, message, itemId);
    this.updateLayout();
  }

  requestRender(): void {
    if (this.renderer !== null) {
      this.renderer.requestRender();
    }
  }

  stop(): void {
    this.logger.info('Stopping OpenTUI dashboard');
    this.state.isRunning = false;

    if (this.renderer !== null) {
      this.renderer.destroy();
      this.renderer = null;
    }

    this.rootRenderable = null;
  }

  getState(): AppState {
    return {
      ...this.state,
      dashboard: cloneDashboardState(this.state.dashboard),
    };
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }
}
