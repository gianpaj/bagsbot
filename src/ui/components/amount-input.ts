/**
 * Amount Input Component
 *
 * Displays:
 * - Modal for entering custom buy amount
 * - Show suggested amount and portfolio percentage
 *
 * @module ui/components/amount-input
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import * as OpenTUIRenderables from '@opentui/core';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Configuration for amount input component
 */
export interface AmountInputConfig {
  /** Suggested amount in SOL */
  suggestedAmount: number;
  /** Total wallet balance in SOL */
  walletBalance: number;
  /** Current entered amount (optional) */
  currentAmount?: number;
}

/**
 * Calculate portfolio percentage
 *
 * @param amount - Amount in SOL
 * @param walletBalance - Wallet balance in SOL
 * @returns Percentage of wallet
 */
function calculatePortfolioPercent(amount: number, walletBalance: number): number {
  if (walletBalance === 0) return 0;
  return (amount / walletBalance) * 100;
}

/**
 * Create the amount input component
 *
 * @param config - Amount input configuration
 * @returns Amount input component (VNode-like)
 */
export function createAmountInput(config: AmountInputConfig): unknown {
  const currentAmount = config.currentAmount ?? config.suggestedAmount;
  const portfolioPercent = calculatePortfolioPercent(currentAmount, config.walletBalance);

  return Box(
    {
      id: 'amount-input-modal',
      flexDirection: 'column',
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      borderStyle: 'round',
    },
    Text({
      id: 'amount-input-title',
      content: 'CUSTOM BUY AMOUNT',
    }),
    Text({
      id: 'amount-suggested',
      content: `Suggested: ${config.suggestedAmount.toFixed(4)} SOL (${calculatePortfolioPercent(config.suggestedAmount, config.walletBalance).toFixed(1)}% of wallet)`,
    }),
    Text({
      id: 'amount-current',
      content: `Current: ${currentAmount.toFixed(4)} SOL (${portfolioPercent.toFixed(1)}% of wallet)`,
    }),
    Text({
      id: 'amount-balance',
      content: `Available: ${config.walletBalance.toFixed(4)} SOL`,
    }),
    Text({
      id: 'amount-help',
      content: '[↑/↓] Adjust  [ENTER] Confirm  [ESC] Cancel',
    })
  );
}
