/**
 * TradingAgents-style dashboard layout for BagsBot.
 */

import * as OpenTUIRenderables from '@opentui/core';
import type { BotConfig } from '../types/index.js';
import type { AppState } from './app.js';
import {
  type DashboardTrackedItem,
  DASHBOARD_AGENT_ORDER,
  buildCurrentReport,
  formatAgentStatus,
  formatTimestamp,
  getDashboardMetrics,
  getSelectedTrackedItem,
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

// Progress cards are intentionally compact for non-selected items so the left pane
// can show more tracked coins while still expanding the active one.
function createProgressCard(item: DashboardTrackedItem, isSelected: boolean): unknown {
  const lines: unknown[] = [
    Text({
      id: `${item.id}-summary`,
      content:
        `${item.name} (${item.symbol}) | Score: ${item.score ?? '--'} | ` +
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
      id: `message-row-${index}-${timestamp}`,
      flexDirection: 'row',
      width: '100%',
      marginBottom: 1,
    },
    Text({
      id: `message-time-${index}`,
      content: timestamp.padEnd(10),
    }),
    Text({
      id: `message-type-${index}`,
      content: `${type}`.padEnd(12),
    }),
    Text({
      id: `message-content-${index}`,
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

function createFooter(state: AppState, _botConfig: BotConfig): unknown {
  const metrics = getDashboardMetrics(state.dashboard);
  const footerText =
    `Tracked: ${metrics.trackedItems} | Opportunities: ${metrics.activeOpportunities} | ` +
    `Positions: ${metrics.openPositions} | Tool Calls: ${metrics.toolCalls} | ` +
    `Generated Reports: ${metrics.generatedReports} | Uptime: ${formatElapsed(state.dashboard.startedAt)}`;

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
      createCurrentReportPanel(state)
    ),
    createFooter(state, botConfig)
  );
}
