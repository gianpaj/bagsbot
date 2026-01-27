/**
 * Settings Screen - Configuration management
 *
 * Displays:
 * - Filter threshold settings
 * - Take profit and stop loss percentages
 * - Auto-sell toggle
 * - Max position settings
 * - Other bot configuration parameters
 *
 * @module ui/screens/settings
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
 * Configuration for the settings screen
 */
export interface SettingsScreenConfig {
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Current wallet balance in SOL */
  walletBalance: number;
  /** Bot configuration */
  botConfig: BotConfig;
}

/**
 * Format a percentage value
 *
 * @param value - Percentage value
 * @returns Formatted percentage string
 */
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format a multiplier value (like take profit)
 *
 * @param value - Multiplier value (e.g., 900 = 10x)
 * @returns Formatted multiplier string
 */
function formatMultiplier(value: number): string {
  const multiplier = (value / 100 + 1).toFixed(1);
  return `${value} (${multiplier}x)`;
}

/**
 * Create the settings screen showing all configuration options
 *
 * @param config - Settings screen configuration
 * @returns Settings screen component (VNode-like)
 */
export function createSettingsScreen(config: SettingsScreenConfig): unknown {
  // Create header component
  const headerConfig: HeaderConfig = {
    isConnected: config.isConnected,
    walletBalance: config.walletBalance,
  };
  const header = createHeader(headerConfig);

  // Extract configuration values
  const { botConfig } = config;
  const filters = botConfig.filters;
  const exits = botConfig.exits;
  const scoring = botConfig.scoring;

  // Create settings content
  const contentChildren: unknown[] = [
    Text({
      id: 'settings-title',
      content: 'BOT SETTINGS',
    }),
  ];

  // Position Management Section
  contentChildren.push(
    Text({
      id: 'settings-position-header',
      content: '═══════════════════════════════════════',
    }),
    Text({
      id: 'settings-position-title',
      content: 'POSITION MANAGEMENT',
    }),
    Text({
      id: 'settings-max-position-percent',
      content: `Max Position Size: ${formatPercent(botConfig.maxPositionPercent * 100)} of wallet`,
    }),
    Text({
      id: 'settings-max-open-positions',
      content: `Max Open Positions: ${botConfig.maxOpenPositions}`,
    })
  );

  // Exit Strategy Section
  contentChildren.push(
    Text({
      id: 'settings-exit-header',
      content: '═══════════════════════════════════════',
    }),
    Text({
      id: 'settings-exit-title',
      content: 'EXIT STRATEGY',
    }),
    Text({
      id: 'settings-take-profit',
      content: `Take Profit: ${formatMultiplier(exits.takeProfitPercent)}`,
    }),
    Text({
      id: 'settings-stop-loss',
      content: `Stop Loss: ${formatPercent(exits.stopLossPercent)}`,
    }),
    Text({
      id: 'settings-auto-sell',
      content: `Auto-Sell Enabled: ${exits.autoSellEnabled ? 'ON' : 'OFF'}`,
    }),
    Text({
      id: 'settings-check-interval',
      content: `Exit Check Interval: ${(exits.checkIntervalMs / 1000).toFixed(1)}s`,
    })
  );

  // Filter Thresholds Section
  contentChildren.push(
    Text({
      id: 'settings-filter-header',
      content: '═══════════════════════════════════════',
    }),
    Text({
      id: 'settings-filter-title',
      content: 'FILTER THRESHOLDS',
    }),
    Text({
      id: 'settings-min-score-alert',
      content: `Min Score to Alert: ${scoring.minScoreToAlert}`,
    }),
    Text({
      id: 'settings-min-score-high-confidence',
      content: `Min Score for High Confidence: ${scoring.minScoreForHighConfidence}`,
    })
  );

  // Creator Filter Settings
  contentChildren.push(
    Text({
      id: 'settings-creator-filter-header',
      content: '─────────────────────────────────────',
    }),
    Text({
      id: 'settings-creator-filter-title',
      content: 'Creator Filter',
    }),
    Text({
      id: 'settings-creator-verified-social',
      content: `Require Verified Social: ${filters.creator.requireVerifiedSocial ? 'ON' : 'OFF'}`,
    }),
    Text({
      id: 'settings-creator-min-followers',
      content: `Min Follower Count: ${filters.creator.minFollowerCount}`,
    }),
    Text({
      id: 'settings-creator-min-account-age',
      content: `Min Account Age: ${filters.creator.minAccountAgeDays} days`,
    }),
    Text({
      id: 'settings-creator-check-launches',
      content: `Check Previous Launches: ${filters.creator.checkPreviousLaunches ? 'ON' : 'OFF'}`,
    })
  );

  // Technical Filter Settings
  contentChildren.push(
    Text({
      id: 'settings-technical-filter-header',
      content: '─────────────────────────────────────',
    }),
    Text({
      id: 'settings-technical-filter-title',
      content: 'Technical Filter',
    }),
    Text({
      id: 'settings-complete-metadata',
      content: `Require Complete Metadata: ${filters.technical.requireCompleteMetadata ? 'ON' : 'OFF'}`,
    }),
    Text({
      id: 'settings-require-description',
      content: `Require Description: ${filters.technical.requireDescription ? 'ON' : 'OFF'}`,
    }),
    Text({
      id: 'settings-require-social-links',
      content: `Require Social Links: ${filters.technical.requireSocialLinks ? 'ON' : 'OFF'}`,
    }),
    Text({
      id: 'settings-validate-image',
      content: `Validate Image URL: ${filters.technical.validateImageUrl ? 'ON' : 'OFF'}`,
    })
  );

  // Social Filter Settings
  contentChildren.push(
    Text({
      id: 'settings-social-filter-header',
      content: '─────────────────────────────────────',
    }),
    Text({
      id: 'settings-social-filter-title',
      content: 'Social Filter',
    }),
    Text({
      id: 'settings-check-twitter',
      content: `Check Twitter Mentions: ${filters.social.checkTwitterMentions ? 'ON' : 'OFF'}`,
    }),
    Text({
      id: 'settings-check-telegram',
      content: `Check Telegram Group: ${filters.social.checkTelegramGroup ? 'ON' : 'OFF'}`,
    }),
    Text({
      id: 'settings-min-community-size',
      content: `Min Community Size: ${filters.social.minCommunitySize}`,
    })
  );

  // Liquidity Filter Settings
  contentChildren.push(
    Text({
      id: 'settings-liquidity-filter-header',
      content: '─────────────────────────────────────',
    }),
    Text({
      id: 'settings-liquidity-filter-title',
      content: 'Liquidity Filter',
    }),
    Text({
      id: 'settings-min-initial-liquidity',
      content: `Min Initial Liquidity: ${filters.liquidity.minInitialLiquiditySol} SOL`,
    }),
    Text({
      id: 'settings-max-curve-percent',
      content: `Max Bonding Curve %: ${filters.liquidity.maxBondingCurvePercent}%`,
    }),
    Text({
      id: 'settings-max-top-holder',
      content: `Max Top Holder %: ${filters.liquidity.maxTopHolderPercent}%`,
    })
  );

  // Trading Settings Section
  contentChildren.push(
    Text({
      id: 'settings-trading-header',
      content: '═══════════════════════════════════════',
    }),
    Text({
      id: 'settings-trading-title',
      content: 'TRADING SETTINGS',
    }),
    Text({
      id: 'settings-slippage',
      content: `Slippage Tolerance: ${(botConfig.trading.slippageBps / 100).toFixed(2)}%`,
    }),
    Text({
      id: 'settings-priority-fee',
      content: `Priority Fee: ${(botConfig.trading.priorityFeeLamports / 1000).toFixed(0)} mLamports`,
    }),
    Text({
      id: 'settings-max-retries',
      content: `Max Trade Retries: ${botConfig.trading.maxRetries}`,
    })
  );

  // UI Settings Section
  contentChildren.push(
    Text({
      id: 'settings-ui-header',
      content: '═══════════════════════════════════════',
    }),
    Text({
      id: 'settings-ui-title',
      content: 'USER INTERFACE',
    }),
    Text({
      id: 'settings-opportunity-timeout',
      content: `Opportunity Display Timeout: ${botConfig.ui.opportunityTimeoutSec}s`,
    }),
    Text({
      id: 'settings-sound-enabled',
      content: `Sound Alerts: ${botConfig.ui.soundEnabled ? 'ON' : 'OFF'}`,
    })
  );

  const settingsContent = Box(
    {
      id: 'settings-content',
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
    currentScreen: 'settings',
  };
  const actionBar = createActionBar(actionBarConfig);

  // Compose the settings screen
  return Box(
    {
      id: 'settings-screen',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
    },
    header,
    Box({ id: 'separator-1', height: 1, width: '100%' }),
    settingsContent,
    Box({ id: 'separator-2', height: 1, width: '100%' }),
    actionBar
  );
}
