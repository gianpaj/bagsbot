/**
 * Position List Component
 *
 * Displays:
 * - Scrollable list of open positions
 * - Symbol, P&L percentage, entry vs current value
 * - Color coding (green for profit, red for loss)
 *
 * @module ui/components/position-list
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
import * as OpenTUIRenderables from '@opentui/core';
import type { Position } from '../../types/index.js';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Configuration for position list component
 */
export interface PositionListConfig {
  /** Array of positions to display */
  positions: Position[];
  /** Maximum number of positions to show before truncation */
  maxDisplay?: number;
}

/**
 * Get direction indicator for P&L
 *
 * @param pnlPercent - P&L percentage
 * @returns Direction indicator character
 */
function getPnlIndicator(pnlPercent: number): string {
  return pnlPercent >= 0 ? '▲' : '▼';
}

/**
 * Format currency value
 *
 * @param value - Value to format
 * @returns Formatted string
 */
function formatCurrency(value: number): string {
  return value.toFixed(4);
}

/**
 * Create a single position row
 *
 * @param position - Position data
 * @param index - Position index
 * @returns Position row component
 */
function createPositionRow(position: Position, index: number): unknown {
  const pnlPercent = position.pnlPercent ?? 0;
  const pnlDirection = getPnlIndicator(pnlPercent);
  const currentValue = position.currentValue ?? position.entrySol;
  const pnlSign = pnlPercent >= 0 ? '+' : '';

  const content =
    `${position.tokenSymbol}  ${pnlSign}${pnlPercent.toFixed(1)}%  ${pnlDirection}  ` +
    `${formatCurrency(position.entrySol)} SOL → ${formatCurrency(currentValue)} SOL`;

  return Text({
    id: `position-${index}`,
    content,
  });
}

/**
 * Create the position list component
 *
 * @param config - Position list configuration
 * @returns Position list component (VNode-like)
 */
export function createPositionList(config: PositionListConfig): unknown {
  const maxDisplay = config.maxDisplay ?? 5;
  const children: unknown[] = [
    Text({
      id: 'positions-title',
      content: `OPEN POSITIONS (${config.positions.length})`,
    }),
  ];

  if (config.positions.length === 0) {
    children.push(
      Text({
        id: 'positions-empty',
        content: 'No open positions',
      })
    );
  } else {
    // Display positions up to maxDisplay
    config.positions.slice(0, maxDisplay).forEach((position: Position, index: number) => {
      children.push(createPositionRow(position, index));
    });

    // Show truncation indicator if there are more positions
    if (config.positions.length > maxDisplay) {
      children.push(
        Text({
          id: 'positions-more',
          content: `... and ${config.positions.length - maxDisplay} more [P] to view all`,
        })
      );
    }
  }

  return Box(
    {
      id: 'position-list',
      flexDirection: 'column',
      width: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    },
    ...children
  );
}
