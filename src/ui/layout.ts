/**
 * TradingAgents-style dashboard layout for BagsBot.
 */

import * as OpenTUIRenderables from '@opentui/core';
import type { BotConfig } from '../types/index.js';
import type { SignalStatus, MarketRating } from '../sdk/jupiter-market.js';
import type { AppState } from './app.js';
import {
  type DashboardTrackedItem,
  DASHBOARD_AGENT_ORDER,
  buildCurrentReport,
  formatAgentStatus,
  formatTimestamp,
  getDashboardMetrics,
  getSelectedTrackedItem,
  getPortfolioSummary,
  getPositionPnl,
} from './dashboard-state.js';

const Box: any = (OpenTUIRenderables as any).Box;
const ScrollBox: any = (OpenTUIRenderables as any).ScrollBox;
const Text: any = (OpenTUIRenderables as any).Text;

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatElapsed(startedAt: Date): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Header keeps global runtime context visible even while the selected item changes.
function createHeader(state: AppState): unknown {
  const selected = getSelectedTrackedItem(state.dashboard);
  const walletBalance =
    state.dashboard.walletBalanceSol !== undefined
      ? `${state.dashboard.walletBalanceSol.toFixed(2)} SOL`
      : '--';
  const selectionLabel =
    selected === null ? 'No selection' : `${selected.symbol} | ${truncate(selected.stage, 32)}`;

  return Box(
    {
      id: 'dashboard-header',
      border: true,
      title: 'Welcome to BagsBot',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      height: 3,
    },
    Text({
      id: 'header-title',
      content: `BagsBot Dashboard | Restream: ${state.dashboard.connectionStatus}`,
    }),
    Text({
      id: 'header-meta',
      content: `Wallet: ${walletBalance} | Selected: ${selectionLabel}`,
    })
  );
}

function signalColor(status: SignalStatus): string {
  switch (status) {
    case 'good':
      return 'green';
    case 'warn':
      return 'yellow';
    case 'bad':
      return 'red';
    default:
      return 'gray';
  }
}

function ratingColor(rating: MarketRating): string {
  switch (rating) {
    case 'good':
      return 'green';
    case 'caution':
      return 'yellow';
    default:
      return 'red';
  }
}

// Progress cards are intentionally compact for non-selected items so the left pane
// can show more tracked coins while still expanding the active one.
function createProgressCard(item: DashboardTrackedItem, isSelected: boolean): unknown {
  const lines: unknown[] = [
    Text({
      id: `${item.id}-summary`,
      content:
        `${item.name} (${item.symbol}) | Score: ${String(item.score ?? '--')} | ` +
        `Opportunity: ${item.opportunity?.status ?? 'none'}`,
    }),
    Text({
      id: `${item.id}-stage`,
      content: `Stage: ${item.stage}`,
    }),
  ];

  const agentsToRender = isSelected ? DASHBOARD_AGENT_ORDER : DASHBOARD_AGENT_ORDER.slice(0, 4);
  agentsToRender.forEach((agent) => {
    lines.push(
      Text({
        id: `${item.id}-${agent}`,
        content: `${agent}: ${formatAgentStatus(item.agentStatuses[agent])}`,
      })
    );
  });

  // Market signals (Jupiter data API): a colored rating for every card, plus
  // the five individual indicators on the expanded (selected) card.
  if (item.market !== undefined) {
    lines.push(
      Text({
        id: `${item.id}-market-rating`,
        fg: ratingColor(item.market.rating),
        content: `Market: ${item.market.rating.toUpperCase()} (${String(item.market.score)}/100)`,
      })
    );
    if (isSelected) {
      item.market.signals.forEach((signal) => {
        const marker = signal.status === 'good' ? '+' : signal.status === 'bad' ? '!' : '~';
        lines.push(
          Text({
            id: `${item.id}-market-${signal.key}`,
            fg: signalColor(signal.status),
            content: `  ${marker} ${signal.label}: ${signal.value}`,
          })
        );
      });
    }
  }

  if (!isSelected) {
    lines.push(
      Text({
        id: `${item.id}-more`,
        content: 'Select to inspect full pipeline.',
      })
    );
  }

  return Box(
    {
      id: `progress-item-${item.id}`,
      border: true,
      title: `${isSelected ? '>' : ' '} ${item.symbol}`,
      borderColor: isSelected ? 'cyan' : 'gray',
      flexDirection: 'column',
      width: '100%',
      marginBottom: 1,
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    },
    ...lines
  );
}

function createProgressPanel(state: AppState): unknown {
  const children =
    state.dashboard.trackedItems.length === 0
      ? [
          Text({
            id: 'progress-empty',
            content: 'Waiting for launches and opportunities...',
          }),
        ]
      : state.dashboard.trackedItems.map((item) =>
          createProgressCard(item, item.id === state.dashboard.selectedItemId)
        );

  return Box(
    {
      id: 'progress-panel',
      border: true,
      title: 'Progress',
      flexDirection: 'column',
      flexGrow: 2,
      width: '100%',
      height: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    },
    ScrollBox(
      {
        id: 'progress-scroll',
        flexGrow: 1,
        width: '100%',
        height: '100%',
        scrollY: true,
        border: false,
        paddingTop: 1,
        paddingBottom: 1,
      },
      ...children
    )
  );
}

function createMessageRow(index: number, timestamp: string, type: string, content: string): unknown {
  return Box(
    {
      id: `message-row-${String(index)}-${timestamp}`,
      flexDirection: 'row',
      width: '100%',
      marginBottom: 1,
    },
    Text({
      id: `message-time-${String(index)}`,
      content: timestamp.padEnd(10),
    }),
    Text({
      id: `message-type-${String(index)}`,
      content: type.padEnd(12),
    }),
    Text({
      id: `message-content-${String(index)}`,
      content,
    })
  );
}

// The event log is derived from the store; no panel owns its own execution history.
function createMessagesPanel(state: AppState): unknown {
  const children =
    state.dashboard.events.length === 0
      ? [
          Text({
            id: 'messages-empty',
            content: 'No execution events yet.',
          }),
        ]
      : state.dashboard.events.slice(0, 40).map((event, index) =>
          createMessageRow(
            index,
            formatTimestamp(event.timestamp),
            event.type,
            truncate(event.content, 84)
          )
        );

  return Box(
    {
      id: 'messages-panel',
      border: true,
      title: 'Messages & Tools',
      flexDirection: 'column',
      flexGrow: 3,
      width: '100%',
      height: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    },
    ScrollBox(
      {
        id: 'messages-scroll',
        flexGrow: 1,
        width: '100%',
        height: '100%',
        scrollY: true,
        border: false,
        paddingTop: 1,
        paddingBottom: 1,
      },
      ...children
    )
  );
}

// The bottom pane always renders the selected item’s synthesized report snapshot.
function createCurrentReportPanel(state: AppState): unknown {
  const selected = getSelectedTrackedItem(state.dashboard);

  return Box(
    {
      id: 'current-report-panel',
      border: true,
      title: 'Current Report / New Analysis',
      flexDirection: 'column',
      flexGrow: 2,
      flexBasis: 0,
      height: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    },
    ScrollBox(
      {
        id: 'report-scroll',
        flexGrow: 1,
        width: '100%',
        height: '100%',
        scrollY: true,
        border: false,
        paddingTop: 1,
        paddingBottom: 1,
      },
      Text({
        id: 'report-content',
        content: buildCurrentReport(selected),
      })
    )
  );
}

function formatSol(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(3)}`;
}

// Bottom-right pane: a live ledger of open positions and their unrealized PnL,
// plus a portfolio total, so gains/losses are visible at a glance.
function createPositionsPanel(state: AppState): unknown {
  const summary = getPortfolioSummary(state.dashboard);

  const summaryColor =
    summary.totalPnlSol > 0 ? 'green' : summary.totalPnlSol < 0 ? 'red' : 'white';
  const summaryLine = Text({
    id: 'positions-summary',
    fg: summaryColor,
    content:
      `Open: ${String(summary.openCount)} | Cost: ${summary.totalEntrySol.toFixed(3)} | ` +
      `Value: ${summary.totalCurrentValueSol.toFixed(3)} | ` +
      `PnL: ${formatSol(summary.totalPnlSol)} SOL (${formatSol(summary.totalPnlPercent)}%)`,
  });

  const rows =
    summary.positions.length === 0
      ? [
          Text({
            id: 'positions-empty',
            content: 'No open positions yet.',
          }),
        ]
      : summary.positions.map((position) => {
          const { valueSol, pnlSol, pnlPercent } = getPositionPnl(position);
          const color = pnlSol > 0 ? 'green' : pnlSol < 0 ? 'red' : 'white';
          return Text({
            id: `position-row-${position.id}`,
            fg: color,
            content:
              `${truncate(position.tokenSymbol, 8).padEnd(8)} ` +
              `${valueSol.toFixed(3)} SOL  ` +
              `${formatSol(pnlSol)} (${formatSol(pnlPercent)}%)`,
          });
        });

  return Box(
    {
      id: 'positions-panel',
      border: true,
      title: 'Positions & PnL',
      flexDirection: 'column',
      flexGrow: 1,
      flexBasis: 0,
      height: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    },
    summaryLine,
    ScrollBox(
      {
        id: 'positions-scroll',
        flexGrow: 1,
        width: '100%',
        scrollY: true,
        border: false,
        paddingTop: 1,
        paddingBottom: 1,
      },
      ...rows
    )
  );
}

function createFooter(state: AppState, _botConfig: BotConfig): unknown {
  const metrics = getDashboardMetrics(state.dashboard);
  const footerText =
    `Tracked: ${String(metrics.trackedItems)} | Opportunities: ${String(metrics.activeOpportunities)} | ` +
    `Positions: ${String(metrics.openPositions)} | Tool Calls: ${String(metrics.toolCalls)} | ` +
    `Generated Reports: ${String(metrics.generatedReports)} | Uptime: ${formatElapsed(state.dashboard.startedAt)} | ` +
    `? Help`;

  return Box(
    {
      id: 'dashboard-footer',
      border: true,
      width: '100%',
      height: 3,
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 1,
      paddingRight: 1,
    },
    Text({
      id: 'footer-text',
      content: footerText,
    })
  );
}

// The root layout mirrors the TradingAgents composition: header, split upper row,
// large report pane, and a footer metrics bar.
export function createMainLayout(state: AppState, botConfig: BotConfig): unknown {
  return Box(
    {
      id: 'main-layout',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: 0,
      rowGap: 1,
    },
    createHeader(state),
    Box(
      {
        id: 'dashboard-main',
        flexDirection: 'column',
        flexGrow: 1,
        rowGap: 1,
        width: '100%',
      },
      Box(
        {
          id: 'dashboard-upper',
          flexDirection: 'row',
          flexGrow: 2,
          columnGap: 1,
          width: '100%',
        },
        createProgressPanel(state),
        createMessagesPanel(state)
      ),
      Box(
        {
          id: 'dashboard-lower',
          flexDirection: 'row',
          flexGrow: 3,
          columnGap: 1,
          width: '100%',
        },
        createCurrentReportPanel(state),
        createPositionsPanel(state)
      )
    ),
    createFooter(state, botConfig)
  );
}
