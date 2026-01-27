/**
 * UI Screens Module - Main Entry Point
 *
 * Re-exports all UI screen components for convenient importing.
 *
 * @module ui/screens
 */

export {
  createMainScreen,
  type MainScreenConfig,
} from './main.js';
export {
  createPositionsScreen,
  type PositionsScreenConfig,
} from './positions.js';
export {
  createHistoryScreen,
  type HistoryScreenConfig,
  type TradeRecord,
} from './history.js';
export {
  createSettingsScreen,
  type SettingsScreenConfig,
} from './settings.js';
