/**
 * Header Component
 *
 * Displays:
 * - Bot name and version: "BAGS SNIPER BOT v1.0.0"
 * - Connection status indicator (● Connected / ○ Disconnected)
 * - Wallet balance in SOL
 *
 * @module ui/components/header
 */

 
import * as OpenTUIRenderables from '@opentui/core';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Configuration for the header component
 */
export interface HeaderConfig {
  /** Connection status */
  isConnected: boolean;
  /** Wallet balance in SOL */
  walletBalance: number;
}

/**
 * Create the header component
 *
 * @param config - Header configuration
 * @returns Header component (VNode-like)
 */
export function createHeader(config: HeaderConfig): unknown {
  const statusIndicator = config.isConnected ? '●' : '○';
  const statusText = config.isConnected ? 'Connected' : 'Disconnected';
  const balanceText = `${config.walletBalance.toFixed(2)} SOL`;

  return Box(
    {
      id: 'header',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
      height: 1,
      width: '100%',
    },
    Text({
      id: 'header-title',
      content: 'BAGS SNIPER BOT v1.0.0',
    }),
    Text({
      id: 'header-status',
      content: `${statusIndicator} ${statusText} | ${balanceText}`,
    })
  );
}
