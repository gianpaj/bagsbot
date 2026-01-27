/**
 * Action Bar Component
 *
 * Displays:
 * - Keybind hints
 * - [B] Buy [S] Skip [C] Custom [V] View (on main screen)
 * - [P] Positions [H] History [S] Settings [Q] Quit (on other screens)
 *
 * @module ui/components/action-bar
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import * as OpenTUIRenderables from '@opentui/core';
import type { ScreenState } from '../app.js';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Get action bar text based on current screen
 *
 * @param currentScreen - The current screen state
 * @returns Action text for the bar
 */
function getActionText(currentScreen: ScreenState): string {
  switch (currentScreen) {
    case 'main':
      return '[B] Buy  [S] Skip  [C] Custom  [V] View  [P] Positions  [H] History  [S] Settings  [Q] Quit';
    case 'positions':
      return '[P] Back  [H] History  [S] Settings  [Q] Quit';
    case 'history':
      return '[P] Positions  [H] Back  [S] Settings  [Q] Quit';
    case 'settings':
      return '[P] Positions  [H] History  [S] Back  [Q] Quit';
    default:
      return '[P] Positions  [H] History  [S] Settings  [Q] Quit';
  }
}

/**
 * Configuration for action bar component
 */
export interface ActionBarConfig {
  /** Current screen state */
  currentScreen: ScreenState;
}

/**
 * Create the action bar component
 *
 * @param config - Action bar configuration
 * @returns Action bar component (VNode-like)
 */
export function createActionBar(config: ActionBarConfig): unknown {
  const actionText = getActionText(config.currentScreen);

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
