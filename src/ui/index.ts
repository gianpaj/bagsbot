/**
 * UI Module - Main Entry Point
 *
 * Re-exports all UI components and the main app class.
 *
 * @module ui
 */

export { OpenTUIApp, type AppConfig, type AppState, type ScreenState } from './app.js';
export { createMainLayout } from './layout.js';
export {
  createHeader,
  createOpportunityCard,
  createFilterResults,
  createPositionList,
  createActionBar,
  createAmountInput,
  createConfirmDialog,
  createBuyConfirmDialog,
  createSellConfirmDialog,
  createExitAllConfirmDialog,
  type HeaderConfig,
  type OpportunityCardConfig,
  type FilterResultsConfig,
  type PositionListConfig,
  type ActionBarConfig,
  type AmountInputConfig,
  type ConfirmDialogConfig,
  type ConfirmDialogType,
} from './components/index.js';
