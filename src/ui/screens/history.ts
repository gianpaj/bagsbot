/**
 * History Screen - Trade history and P&L tracking
 *
 * Displays:
 * - Past trades with status (confirmed, rejected, expired)
 * - Profit/loss for each trade
 * - Total profit/loss summary across all trades
 *
 * @module ui/screens/history
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-template-expressions */
import * as OpenTUIRenderables from '@opentui/core';
import type { BotConfig } from '../../types/index.js';
import {
  createHeader,
  createActionBar,
  type HeaderConfig,
  type ActionBarConfig,
} from '../components/index.js';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Represents a historical trade record
 */
export interface TradeRecord {
  /** Unique identifier */
  id: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Action (buy/sell/exit) */
  action: 'buy' | 'sell' | 'exit';
  /** Amount in SOL */
  amountSol: number;
  /** Price per token */
  pricePerToken: number;
  /** Number of tokens */
  tokensAmount: number;
  /** Status of the trade */
  status: 'confirmed' | 'rejected' | 'expired' | 'pending';
  /** Profit/loss for this trade if applicable */
  pnl?: number;
  /** Profit/loss percentage */
  pnlPercent?: number;
  /** Timestamp of the trade */
  timestamp: Date;
}

/**
 * Configuration for the history screen
 */
export interface HistoryScreenConfig {
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Current wallet balance in SOL */
  walletBalance: number;
  /** Trade history records */
  tradeHistory: TradeRecord[];
  /** Bot configuration */
  botConfig: BotConfig;
}

/**
 * Get a status indicator for trade status
 *
 * @param status - Trade status
 * @returns Status indicator character
 */
function getStatusIndicator(status: string): string {
  switch (status) {
    case 'confirmed':
      return '✓';
    case 'rejected':
      return '✗';
    case 'expired':
      return '⊘';
    case 'pending':
      return '⟳';
    default:
      return '?';
  }
}

/**
 * Format trade timestamp
 *
 * @param date - Date to format
 * @returns Formatted date string
 */
function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Create a single trade record row
 *
 * @param trade - Trade record
 * @param index - Trade index
 * @returns Trade row component
 */
function createTradeRow(trade: TradeRecord, index: number): unknown {
  const statusIcon = getStatusIndicator(trade.status);
  const pnlText =
    trade.pnl !== undefined
      ? ` | P&L: ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(4)} SOL (${trade.pnlPercent !== undefined ? `${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(1)}%` : '--'})`
      : '';

  const actionUpper = trade.action.toUpperCase();
  const content =
    `${formatTimestamp(trade.timestamp)}  ${statusIcon} ${trade.tokenSymbol}  ${actionUpper}  ` +
    `${trade.amountSol.toFixed(4)} SOL @ ${trade.pricePerToken.toFixed(8)} SOL/token${pnlText}`;

  return Text({
    id: `trade-${index}`,
    content,
  });
}

/**
 * Calculate summary statistics from trade history
 *
 * @param trades - Array of trade records
 * @returns Summary statistics
 */
function calculateSummary(trades: TradeRecord[]): {
  totalPnl: number;
  totalPnlPercent: number;
  confirmedCount: number;
  rejectedCount: number;
  expiredCount: number;
  winCount: number;
  lossCount: number;
} {
  let totalPnl = 0;
  let totalAmountInvested = 0;
  let confirmedCount = 0;
  let rejectedCount = 0;
  let expiredCount = 0;
  let winCount = 0;
  let lossCount = 0;

  trades.forEach((trade: TradeRecord) => {
    if (trade.status === 'confirmed') {
      confirmedCount++;
      if (trade.pnl !== undefined) {
        totalPnl += trade.pnl;
        totalAmountInvested += trade.amountSol;
        if (trade.pnl > 0) {
          winCount++;
        } else if (trade.pnl < 0) {
          lossCount++;
        }
      }
    } else if (trade.status === 'rejected') {
      rejectedCount++;
    } else if (trade.status === 'expired') {
      expiredCount++;
    }
  });

  const totalPnlPercent =
    totalAmountInvested > 0 ? (totalPnl / totalAmountInvested) * 100 : 0;

  return {
    totalPnl,
    totalPnlPercent,
    confirmedCount,
    rejectedCount,
    expiredCount,
    winCount,
    lossCount,
  };
}

/**
 * Create the history screen showing trade history and P&L
 *
 * @param config - History screen configuration
 * @returns History screen component (VNode-like)
 */
export function createHistoryScreen(config: HistoryScreenConfig): unknown {
  // Create header component
  const headerConfig: HeaderConfig = {
    isConnected: config.isConnected,
    walletBalance: config.walletBalance,
  };
  const header = createHeader(headerConfig);

  // Calculate summary statistics
  const summary = calculateSummary(config.tradeHistory);

  // Create history content
  const contentChildren: unknown[] = [
    Text({
      id: 'history-screen-title',
      content: 'TRADE HISTORY',
    }),
  ];

  // Add summary section
  contentChildren.push(
    Text({
      id: 'history-summary-header',
      content: '═══════════════════════════════════════',
    }),
    Text({
      id: 'history-pnl-summary',
      content: `Total P&L: ${summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toFixed(4)} SOL (${summary.totalPnlPercent >= 0 ? '+' : ''}${summary.totalPnlPercent.toFixed(1)}%)`,
    }),
    Text({
      id: 'history-trades-summary',
      content: `Confirmed: ${summary.confirmedCount} | Wins: ${summary.winCount} | Losses: ${summary.lossCount} | Rejected: ${summary.rejectedCount} | Expired: ${summary.expiredCount}`,
    }),
    Text({
      id: 'history-separator-header',
      content: '═══════════════════════════════════════',
    })
  );

  // Add trade records
  if (config.tradeHistory.length === 0) {
    contentChildren.push(
      Text({
        id: 'history-empty',
        content: 'No trades recorded yet',
      })
    );
  } else {
    // Sort trades by timestamp (most recent first)
    const sortedTrades = [...config.tradeHistory].sort(
      (a: TradeRecord, b: TradeRecord) =>
        b.timestamp.getTime() - a.timestamp.getTime()
    );

    // Show most recent 20 trades
    sortedTrades.slice(0, 20).forEach((trade: TradeRecord, index: number) => {
      contentChildren.push(createTradeRow(trade, index));
    });

    if (sortedTrades.length > 20) {
      contentChildren.push(
        Text({
          id: 'history-more',
          content: `... and ${sortedTrades.length - 20} more trades`,
        })
      );
    }
  }

  const historyContent = Box(
    {
      id: 'history-content',
      flexDirection: 'column',
      width: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    },
    ...contentChildren
  );

  // Create action bar
  const actionBarConfig: ActionBarConfig = {
    currentScreen: 'history',
  };
  const actionBar = createActionBar(actionBarConfig);

  // Compose the history screen
  return Box(
    {
      id: 'history-screen',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
    },
    header,
    Box({ id: 'separator-1', height: 1, width: '100%' }),
    historyContent,
    Box({ id: 'separator-2', height: 1, width: '100%' }),
    actionBar
  );
}
