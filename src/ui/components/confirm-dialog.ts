/**
 * Confirm Dialog Component
 *
 * Displays:
 * - Confirmation prompts for trades and exits
 *
 * @module ui/components/confirm-dialog
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
import * as OpenTUIRenderables from '@opentui/core';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Type of confirmation dialog
 */
export type ConfirmDialogType = 'buy' | 'sell' | 'exit_all' | 'cancel_all';

/**
 * Configuration for confirm dialog component
 */
export interface ConfirmDialogConfig {
  /** Type of confirmation dialog */
  type: ConfirmDialogType;
  /** Title of the dialog */
  title: string;
  /** Message to display */
  message: string;
  /** Additional details (optional) */
  details?: string[];
}

/**
 * Get confirmation instruction based on dialog type
 *
 * @param _type - Dialog type
 * @returns Instruction text
 */
function getInstructionText(_type: ConfirmDialogType): string {
  return '[Y] Confirm  [N] Cancel';
}

/**
 * Create the confirm dialog component
 *
 * @param config - Confirm dialog configuration
 * @returns Confirm dialog component (VNode-like)
 */
export function createConfirmDialog(config: ConfirmDialogConfig): unknown {
  const children: unknown[] = [
    Text({
      id: 'confirm-title',
      content: config.title,
    }),
    Text({
      id: 'confirm-message',
      content: config.message,
    }),
  ];

  // Add details if provided
  if (config.details && config.details.length > 0) {
    config.details.forEach((detail: string, index: number) => {
      children.push(
        Text({
          id: `confirm-detail-${index}`,
          content: detail,
        })
      );
    });
  }

  // Add instruction
  children.push(
    Text({
      id: 'confirm-instruction',
      content: getInstructionText(config.type),
    })
  );

  return Box(
    {
      id: 'confirm-dialog-modal',
      flexDirection: 'column',
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      borderStyle: 'round',
    },
    ...children
  );
}

/**
 * Create a buy confirmation dialog
 *
 * @param tokenSymbol - Token symbol
 * @param amount - Amount in SOL
 * @param expectedTokens - Expected number of tokens
 * @returns Buy confirmation dialog component
 */
export function createBuyConfirmDialog(
  tokenSymbol: string,
  amount: number,
  expectedTokens: number
): unknown {
  return createConfirmDialog({
    type: 'buy',
    title: 'CONFIRM BUY',
    message: `Buy ${expectedTokens.toFixed(2)} ${tokenSymbol} tokens for ${amount.toFixed(4)} SOL?`,
    details: [
      `Price: ${(amount / expectedTokens).toFixed(6)} SOL per token`,
      'This action cannot be undone',
    ],
  });
}

/**
 * Create a sell confirmation dialog
 *
 * @param tokenSymbol - Token symbol
 * @param amount - Amount of tokens to sell
 * @param expectedSol - Expected SOL from sale
 * @param pnlPercent - Profit/loss percentage
 * @returns Sell confirmation dialog component
 */
export function createSellConfirmDialog(
  tokenSymbol: string,
  amount: number,
  expectedSol: number,
  pnlPercent: number
): unknown {
  const pnlText = pnlPercent >= 0 ? `Profit: +${pnlPercent.toFixed(1)}%` : `Loss: ${pnlPercent.toFixed(1)}%`;

  return createConfirmDialog({
    type: 'sell',
    title: 'CONFIRM SELL',
    message: `Sell ${amount.toFixed(2)} ${tokenSymbol} tokens for ~${expectedSol.toFixed(4)} SOL?`,
    details: [pnlText, 'This action cannot be undone'],
  });
}

/**
 * Create an exit all positions confirmation dialog
 *
 * @param positionCount - Number of positions to exit
 * @returns Exit all confirmation dialog component
 */
export function createExitAllConfirmDialog(positionCount: number): unknown {
  return createConfirmDialog({
    type: 'exit_all',
    title: 'CONFIRM EXIT ALL',
    message: `Exit all ${positionCount} open positions?`,
    details: ['This will sell all positions immediately', 'This action cannot be undone'],
  });
}
