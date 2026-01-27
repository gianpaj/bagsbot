/**
 * Positions Screen - Detailed position management
 *
 * Displays:
 * - List of all open positions with full details
 * - Entry price, current price, P&L percentage
 * - Option for manual sell actions (future enhancement)
 *
 * @module ui/screens/positions
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
import * as OpenTUIRenderables from '@opentui/core';
import type { Position, BotConfig } from '../../types/index.js';
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
 * Configuration for the positions screen
 */
export interface PositionsScreenConfig {
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Current wallet balance in SOL */
  walletBalance: number;
  /** Current open positions */
  positions: Position[];
  /** Bot configuration */
  botConfig: BotConfig;
}

/**
 * Calculate total P&L across all positions
 *
 * @param positions - Array of positions
 * @returns Total P&L in SOL and percentage
 */
function calculateTotalPnL(
  positions: Position[]
): { totalSol: number; totalPercent: number } {
  if (positions.length === 0) {
    return { totalSol: 0, totalPercent: 0 };
  }

  let totalEntrySol = 0;
  let totalCurrentValue = 0;

  positions.forEach((pos: Position) => {
    totalEntrySol += pos.entrySol;
    const currentVal = pos.currentValue ?? pos.entrySol;
    totalCurrentValue += currentVal;
  });

  const totalSol = totalCurrentValue - totalEntrySol;
  const totalPercent =
    totalEntrySol > 0 ? (totalSol / totalEntrySol) * 100 : 0;

  return { totalSol, totalPercent };
}

/**
 * Create a detailed position row with entry and current details
 *
 * @param position - Position data
 * @param index - Position index
 * @returns Detailed position row component
 */
function createDetailedPositionRow(position: Position, index: number): unknown {
  const pnlPercent = position.pnlPercent ?? 0;
  const currentValue = position.currentValue ?? position.entrySol;
  const pnlDirection = pnlPercent >= 0 ? '▲' : '▼';
  const pnlSign = pnlPercent >= 0 ? '+' : '';

  const row1 = Text({
    id: `position-${index}-header`,
    content: `${position.tokenSymbol}  ${position.mint.slice(0, 8)}...${position.mint.slice(-8)}`,
  });

  const row2 = Text({
    id: `position-${index}-pnl`,
    content: `  P&L: ${pnlSign}${pnlPercent.toFixed(1)}% ${pnlDirection}  ${pnlSign}${pnlPercent >= 0 ? '' : ''}${(pnlPercent >= 0 ? currentValue - position.entrySol : position.entrySol - currentValue).toFixed(4)} SOL`,
  });

  const row3 = Text({
    id: `position-${index}-entry`,
    content: `  Entry: ${position.entrySol.toFixed(4)} SOL @ ${position.entryPrice.toFixed(8)} SOL/token (${position.tokensHeld.toFixed(0)} tokens)`,
  });

  const currentPrice = position.currentPrice ?? position.entryPrice;
  const row4 = Text({
    id: `position-${index}-current`,
    content: `  Current: ${currentValue.toFixed(4)} SOL @ ${currentPrice.toFixed(8)} SOL/token`,
  });

  return Box(
    {
      id: `position-${index}-detail`,
      flexDirection: 'column',
      width: '100%',
      marginBottom: 1,
    },
    row1,
    row2,
    row3,
    row4
  );
}

/**
 * Create the positions screen showing all open positions
 *
 * @param config - Positions screen configuration
 * @returns Positions screen component (VNode-like)
 */
export function createPositionsScreen(config: PositionsScreenConfig): unknown {
  // Create header component
  const headerConfig: HeaderConfig = {
    isConnected: config.isConnected,
    walletBalance: config.walletBalance,
  };
  const header = createHeader(headerConfig);

  // Calculate total P&L
  const { totalSol, totalPercent } = calculateTotalPnL(config.positions);

  // Create positions content
  const contentChildren: unknown[] = [
    Text({
      id: 'positions-screen-title',
      content: 'OPEN POSITIONS',
    }),
    Text({
      id: 'positions-count',
      content: `Total Positions: ${config.positions.length}`,
    }),
  ];

  // Add summary if there are positions
  if (config.positions.length > 0) {
    const totalSign = totalPercent >= 0 ? '+' : '';
    const totalDirection = totalPercent >= 0 ? '▲' : '▼';
    contentChildren.push(
      Text({
        id: 'positions-summary',
        content: `Summary: ${totalSign}${totalPercent.toFixed(1)}% ${totalDirection}  ${totalSign}${totalSol.toFixed(4)} SOL`,
      }),
      Text({
        id: 'positions-separator',
        content: '─────────────────────────────────────────',
      })
    );

    // Add each position with full details
    config.positions.forEach((position: Position, index: number) => {
      contentChildren.push(createDetailedPositionRow(position, index));
    });
  } else {
    contentChildren.push(
      Text({
        id: 'positions-empty',
        content: 'No open positions',
      })
    );
  }

  // Add max positions info
  contentChildren.push(
    Text({
      id: 'positions-max',
      content: `Max Open Positions: ${config.botConfig.maxOpenPositions} | Max Position %: ${(config.botConfig.maxPositionPercent * 100).toFixed(0)}%`,
    })
  );

  const positionsContent = Box(
    {
      id: 'positions-content',
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
    currentScreen: 'positions',
  };
  const actionBar = createActionBar(actionBarConfig);

  // Compose the positions screen
  return Box(
    {
      id: 'positions-screen',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
    },
    header,
    Box({ id: 'separator-1', height: 1, width: '100%' }),
    positionsContent,
    Box({ id: 'separator-2', height: 1, width: '100%' }),
    actionBar
  );
}
