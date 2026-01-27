/**
 * Main Screen - Primary trading interface
 *
 * Displays:
 * - Current opportunity or "Waiting for opportunities..."
 * - List of open positions with P&L
 * - Action bar with keybinds: B (buy), S (skip), C (custom), V (view details)
 *
 * @module ui/screens/main
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import * as OpenTUIRenderables from '@opentui/core';
import type { BotConfig, Position, LaunchpadLaunchEvent } from '../../types/index.js';
import {
  createHeader,
  createOpportunityCard,
  createPositionList,
  createActionBar,
  type HeaderConfig,
  type OpportunityCardConfig,
  type PositionListConfig,
  type ActionBarConfig,
} from '../components/index.js';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Configuration for the main screen
 */
export interface MainScreenConfig {
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Current wallet balance in SOL */
  walletBalance: number;
  /** Current opportunity to display, null if waiting */
  currentOpportunity: LaunchpadLaunchEvent | null;
  /** Current open positions */
  positions: Position[];
  /** Bot configuration */
  botConfig: BotConfig;
}

/**
 * Create the main trading screen
 *
 * This is the default view showing opportunities and positions.
 * Handles keybinds:
 * - B: Buy opportunity with default amount
 * - S: Skip current opportunity
 * - C: Show custom amount input
 * - V: View detailed opportunity information
 *
 * @param config - Main screen configuration
 * @returns Main screen component (VNode-like)
 */
export function createMainScreen(config: MainScreenConfig): unknown {
  // Create header component
  const headerConfig: HeaderConfig = {
    isConnected: config.isConnected,
    walletBalance: config.walletBalance,
  };
  const header = createHeader(headerConfig);

  // Create opportunity section
  let opportunitySection: unknown;
  if (config.currentOpportunity) {
    // Show current opportunity card
    const opportunityConfig: OpportunityCardConfig = {
      launch: config.currentOpportunity,
      liquiditySol: 10.5,
      curveFillPercent: 12.5,
      creatorVerified: false,
      creatorFollowers: 5000,
    };
    opportunitySection = createOpportunityCard(opportunityConfig);
  } else {
    // Show waiting message
    opportunitySection = Box(
      {
        id: 'opportunity-section',
        flexDirection: 'column',
        width: '100%',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
      },
      Text({
        id: 'opportunity-waiting',
        content: 'Waiting for opportunities...',
      })
    );
  }

  // Create positions section
  const positionsConfig: PositionListConfig = {
    positions: config.positions,
    maxDisplay: 5,
  };
  const positionsSection = createPositionList(positionsConfig);

  // Create action bar
  const actionBarConfig: ActionBarConfig = {
    currentScreen: 'main',
  };
  const actionBar = createActionBar(actionBarConfig);

  // Compose the main screen
  return Box(
    {
      id: 'main-screen',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
    },
    header,
    Box({ id: 'separator-1', height: 1, width: '100%' }),
    opportunitySection,
    Box({ id: 'separator-2', height: 1, width: '100%' }),
    positionsSection,
    Box({ id: 'separator-3', height: 1, width: '100%' }),
    actionBar
  );
}
