/**
 * UI Module - Main Entry Point
 *
 * Re-exports all UI components and the main app class.
 *
 * @module ui
 */

export { OpenTUIApp, type AppConfig, type AppState, type ScreenState } from './app.js';
export { HeadlessCli, createHeadlessCli, type HeadlessCliCallbacks } from './headless-cli.js';
export { createMainLayout } from './layout.js';
export {
  type DashboardAgentName,
  type DashboardAgentStatus,
  type DashboardEvent,
  type DashboardEventType,
  type DashboardOpportunityState,
  type DashboardTrackedItem,
  type DashboardState,
  type DashboardMetrics,
  DASHBOARD_AGENT_ORDER,
  cloneDashboardState,
  createDashboardState,
  getDashboardMetrics,
  getSelectedTrackedItem,
  buildCurrentReport,
} from './dashboard-state.js';
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
export {
  createMainScreen,
  createPositionsScreen,
  createHistoryScreen,
  createSettingsScreen,
  type MainScreenConfig,
  type PositionsScreenConfig,
  type HistoryScreenConfig,
  type SettingsScreenConfig,
  type TradeRecord,
} from './screens/index.js';
