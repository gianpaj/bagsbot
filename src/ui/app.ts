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
export type KeyInputEvent = any;

const createCliRenderer: any = (OpenTUI as any).createCliRenderer;
const ConsolePosition: any = (OpenTUI as any).ConsolePosition;
const BoxRenderable: any = (OpenTUI as any).BoxRenderable;
const TextRenderable: any = (OpenTUI as any).TextRenderable;

const HELP_SHORTCUTS = [
  ['j / down', 'Select next token'],
  ['k / up', 'Select previous token'],
  ['b', 'Buy selected opportunity'],
  ['s', 'Skip selected opportunity'],
  ['q', 'Quit dashboard'],
  ['`', 'Toggle raw logs drawer'],
  ['?', 'Open or close this help'],
  ['esc', 'Close help modal'],
] as const;

// Preserve the old type export so existing component modules still compile.
export type ScreenState = 'main' | 'positions' | 'history' | 'settings';

export interface AppState {
  dashboard: DashboardState;
  isHelpModalVisible: boolean;
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
  private helpModal: any | null = null;
  private config: AppConfig;
  private state: AppState;
  private logger = logger.child({ module: 'app' });

  constructor(config: AppConfig) {
    this.config = config;
    this.state = {
      dashboard: createDashboardState(),
      isHelpModalVisible: false,
      isRunning: false,
    };
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting OpenTUI dashboard');
      const isCaptureMode = process.env['UI_CAPTURE_MODE'] === 'true';

      // The renderer owns the alternate-screen session and the root render tree.
      this.renderer = await createCliRenderer({
        exitOnCtrlC: true,
        exitSignals: ['SIGINT', 'SIGTERM'],
        debounceDelay: 50,
        targetFps: 30,
        // Capture mode keeps the dashboard on the main screen so tools like VHS
        // can snapshot the rendered panes instead of an alternate-screen buffer.
        useAlternateScreen: !isCaptureMode,
        useMouse: false,
        useConsole: !isCaptureMode,
        consoleOptions: {
          position: ConsolePosition?.BOTTOM ?? 'bottom',
          sizePercent: 28,
          title: 'Raw Logs',
          maxStoredLogs: 3000,
          maxDisplayLines: 4000,
          titleBarColor: '#10161f',
          titleBarTextColor: '#d9e2f2',
          backgroundColor: '#111821',
          colorDefault: '#f5f7fa',
          colorInfo: '#35f0ff',
          colorWarn: '#f6c453',
          colorError: '#ff8c8c',
          colorDebug: '#98a3b5',
          selectionColor: '#335b88',
          copyButtonColor: '#35f0ff',
          keyBindings: [{ name: 'y', ctrl: true, action: 'copy-selection' }],
        },
      });

      this.renderer.start();
      this.initializeConsoleDrawer();
      this.setupKeyboardInput();
      this.rootRenderable = this.renderer.root;
      this.rootRenderable.add(createMainLayout(this.state, this.config.botConfig));
      this.helpModal = this.createHelpModal();
      this.rootRenderable.add(this.helpModal);

      this.state.isRunning = true;
      this.logger.info('OpenTUI dashboard started');
    } catch (error) {
      this.renderer?.destroy();
      this.renderer = null;
      this.rootRenderable = null;
      this.helpModal = null;
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
    this.renderer.keyInput.on('keypress', (key: KeyInputEvent) => {
      const keyStr = String(key.name ?? key.sequence ?? key.raw ?? '').toLowerCase();

      if (!this.state.isHelpModalVisible && (keyStr === '`' || keyStr === '"')) {
        this.toggleConsoleDrawer();
        return;
      }

      // When the raw log drawer is visible, it owns navigation and copy/resize
      // shortcuts. The dashboard should not react to overlapping keys.
      if (this.renderer?.console?.visible === true) {
        return;
      }

      if (keyStr === '?') {
        this.toggleHelpModal();
        return;
      }

      if (this.state.isHelpModalVisible) {
        if (keyStr === '\u001b' || keyStr === 'q') {
          this.closeHelpModal();
        }
        return;
      }

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

  private initializeConsoleDrawer(): void {
    if (this.renderer === null) {
      return;
    }

    this.renderer.console.onCopySelection = (text: string) => {
      const success = this.renderer?.copyToClipboardOSC52(text) ?? false;
      if (!success) {
        this.logger.warn('Clipboard copy failed for console selection');
      }
    };
  }

  private toggleConsoleDrawer(): void {
    if (this.renderer === null) {
      return;
    }

    this.renderer.console.toggle();
    this.renderer.requestRender();
  }

  private toggleHelpModal(): void {
    this.state.isHelpModalVisible = !this.state.isHelpModalVisible;
    this.syncHelpModalVisibility();
  }

  private closeHelpModal(): void {
    if (!this.state.isHelpModalVisible) {
      return;
    }

    this.state.isHelpModalVisible = false;
    this.syncHelpModalVisibility();
  }

  private createHelpModal(): any {
    if (this.renderer === null) {
      return null;
    }

    const modal = new BoxRenderable(this.renderer, {
      id: 'help-modal',
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 60,
      height: 16,
      marginLeft: -30,
      marginTop: -8,
      border: true,
      borderStyle: 'double',
      borderColor: '#4ECDC4',
      backgroundColor: '#0D1117',
      title: 'Keybindings',
      titleAlignment: 'center',
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      zIndex: 100,
      visible: false,
      flexDirection: 'column',
    });

    modal.add(
      new TextRenderable(this.renderer, {
        id: 'help-title',
        content: 'Press ? or Esc to close',
      })
    );

    modal.add(
      new TextRenderable(this.renderer, {
        id: 'help-spacer',
        content: '',
      })
    );

    for (const [shortcut, description] of HELP_SHORTCUTS) {
      modal.add(
        new TextRenderable(this.renderer, {
          id: `help-${shortcut.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`,
          content: `${shortcut.padEnd(12)} ${description}`,
        })
      );
    }

    return modal;
  }

  private syncHelpModalVisibility(): void {
    if (this.helpModal !== null) {
      this.helpModal.visible = this.state.isHelpModalVisible;
    }

    this.renderer?.requestRender();
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

    // The main dashboard layout is derived from the dashboard store. Keep
    // overlays mounted separately so modal visibility can be toggled directly.
    this.rootRenderable.remove('main-layout');
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

    this.helpModal = null;
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
