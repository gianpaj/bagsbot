/**
 * OpenTUI Layout Structure
 *
 * Defines the main layout for the Bags Sniper Bot TUI dashboard.
 * Layout structure includes:
 * - Header (bot name, connection status, wallet balance)
 * - Opportunity section (new token launch details)
 * - Positions section (open positions)
 * - Action bar (keyboard shortcuts)
 *
 * @module ui/layout
 */

import * as OpenTUIRenderables from '@opentui/core';
import type { BotConfig, Position } from '../types/index.js';
import type { AppState, ScreenState } from './app.js';

// Extract Box and Text factory functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Box: any = (OpenTUIRenderables as any).Box;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Create the header section displaying bot info and connection status
 *
 * @returns Header component (VNode-like)
 */
function createHeader(): unknown {
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
    Text({ id: 'header-title', content: 'BAGS SNIPER BOT v1.0.0' }),
    Text({ id: 'header-status', content: 'Connected ● 0.5 SOL' })
  );
}

/**
 * Create the opportunity section showing details of current launch
 *
 * @returns Opportunity component (VNode-like)
 */
function createOpportunitySection(): unknown {
  return Box(
    {
      id: 'opportunity-section',
      flexDirection: 'column',
      width: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    },
    Text({ id: 'opportunity-title', content: 'NEW OPPORTUNITY' }),
    Text({ id: 'score', content: 'Score: 85' }),
    Text({ id: 'token-info', content: 'Token: $EXAMPLE (ExAmPlE...mint)' }),
    Text({ id: 'creator-info', content: 'Creator: @verified_user (✓ Twitter, 50K followers)' }),
    Text({ id: 'liquidity-info', content: 'Liquidity: 10.5 SOL | Curve: 12% filled' }),
    Box(
      { id: 'action-buttons', flexDirection: 'row', marginTop: 1 },
      Text({ id: 'buy-btn', content: '[B] Buy  ' }),
      Text({ id: 'skip-btn', content: '[S] Skip  ' }),
      Text({ id: 'custom-btn', content: '[C] Custom amount  ' }),
      Text({ id: 'view-btn', content: '[V] View details' })
    )
  );
}

/**
 * Create the positions section showing open trades
 *
 * @param positions - Array of open positions
 * @returns Positions component (VNode-like)
 */
function createPositionsSection(positions: Position[] = []): unknown {
  const children: unknown[] = [
    Text({ id: 'positions-title', content: `OPEN POSITIONS (${positions.length})` }),
  ];

  // Add position rows (showing mock data for now)
  if (positions.length === 0) {
    children.push(
      Text({ id: 'positions-empty', content: '$TOKEN1  +125%  ▲  0.1 SOL → 0.225 SOL' }),
      Text({ id: 'positions-example-2', content: '$TOKEN2   -15%  ▼  0.05 SOL → 0.042 SOL' })
    );
  } else {
    // Display actual positions
    positions.slice(0, 5).forEach((position: Position, index: number) => {
      const pnlPercent = position.pnlPercent ?? 0;
      const pnlDirection = pnlPercent >= 0 ? '▲' : '▼';
      const currentValue = position.currentValue ?? position.entrySol;

      children.push(
        Text({
          id: `position-${index}`,
          content: `${position.tokenSymbol}  ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%  ${pnlDirection}  ${position.entrySol.toFixed(2)} SOL → ${currentValue.toFixed(2)} SOL`,
        })
      );
    });

    if (positions.length > 5) {
      children.push(
        Text({
          id: 'positions-more',
          content: `... and ${positions.length - 5} more`,
        })
      );
    }
  }

  return Box(
    {
      id: 'positions-section',
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

/**
 * Create the action bar footer with keyboard shortcuts
 *
 * @param currentScreen - Current screen state for context-aware help
 * @returns Action bar component (VNode-like)
 */
function createActionBar(currentScreen: ScreenState): unknown {
  let actionText = '';

  switch (currentScreen) {
    case 'main':
      actionText = '[P] Positions  [H] History  [S] Settings  [Q] Quit';
      break;
    case 'positions':
      actionText = '[P] Back  [H] History  [S] Settings  [Q] Quit';
      break;
    case 'history':
      actionText = '[P] Positions  [H] Back  [S] Settings  [Q] Quit';
      break;
    case 'settings':
      actionText = '[P] Positions  [H] History  [S] Back  [Q] Quit';
      break;
    default:
      actionText = '[P] Positions  [H] History  [S] Settings  [Q] Quit';
  }

  return Box(
    {
      id: 'action-bar',
      flexDirection: 'row',
      justifyContent: 'center',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
      height: 1,
      width: '100%',
    },
    Text({
      id: 'action-text',
      content: actionText,
    })
  );
}

/**
 * Create a screen for viewing positions
 *
 * @param state - Current application state
 * @returns Positions screen (VNode-like)
 */
function createPositionsScreen(state: AppState): unknown {
  return Box(
    {
      id: 'positions-screen',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
    },
    createHeader(),
    Box({ id: 'separator-1', height: 1, width: '100%' }),
    createPositionsSection(state.positions),
    Box({ id: 'separator-2', height: 1, width: '100%' }),
    createActionBar('positions')
  );
}

/**
 * Create a screen for viewing history
 *
 * @returns History screen (VNode-like)
 */
function createHistoryScreen(): unknown {
  return Box(
    {
      id: 'history-screen',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
    },
    createHeader(),
    Box({ id: 'separator-1', height: 1, width: '100%' }),
    Box(
      {
        id: 'history-content',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
      },
      Text({ id: 'history-title', content: 'TRADE HISTORY' }),
      Text({
        id: 'history-example-1',
        content: '2024-01-27 10:30  $TOKEN1  BUY   0.1 SOL @ 0.001 SOL/token  Profit: +125%',
      }),
      Text({
        id: 'history-example-2',
        content: '2024-01-27 08:15  $TOKEN2  BUY   0.05 SOL @ 0.002 SOL/token  Loss: -15%',
      })
    ),
    Box({ id: 'separator-2', height: 1, width: '100%' }),
    createActionBar('history')
  );
}

/**
 * Create a screen for settings
 *
 * @returns Settings screen (VNode-like)
 */
function createSettingsScreen(): unknown {
  return Box(
    {
      id: 'settings-screen',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
    },
    createHeader(),
    Box({ id: 'separator-1', height: 1, width: '100%' }),
    Box(
      {
        id: 'settings-content',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
      },
      Text({ id: 'settings-title', content: 'SETTINGS' }),
      Text({ id: 'max-position', content: 'Max Position: 10% of wallet' }),
      Text({ id: 'max-positions', content: 'Max Open Positions: 5' }),
      Text({ id: 'take-profit', content: 'Take Profit: 900% (10x)' }),
      Text({ id: 'stop-loss', content: 'Stop Loss: -50%' })
    ),
    Box({ id: 'separator-2', height: 1, width: '100%' }),
    createActionBar('settings')
  );
}

/**
 * Create the main layout based on current screen state
 *
 * @param state - Current application state
 * @param _botConfig - Bot configuration
 * @returns Main layout (VNode-like)
 */
export function createMainLayout(
  state: AppState,
  _botConfig: BotConfig
): unknown {
  switch (state.currentScreen) {
    case 'positions':
      return createPositionsScreen(state);
    case 'history':
      return createHistoryScreen();
    case 'settings':
      return createSettingsScreen();
    case 'main':
    default:
      return Box(
        {
          id: 'main-layout',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
        },
        createHeader(),
        Box({ id: 'separator-1', height: 1, width: '100%' }),
        createOpportunitySection(),
        Box({ id: 'separator-2', height: 1, width: '100%' }),
        createPositionsSection(state.positions),
        Box({ id: 'separator-3', height: 1, width: '100%' }),
        createActionBar('main')
      );
  }
}
