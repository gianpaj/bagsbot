/**
 * UI Components Module - Main Entry Point
 *
 * Re-exports all UI components for convenient importing.
 *
 * @module ui/components
 */

export { createHeader, type HeaderConfig } from './header.js';
export { createOpportunityCard, type OpportunityCardConfig } from './opportunity-card.js';
export { createFilterResults, type FilterResultsConfig } from './filter-results.js';
export { createPositionList, type PositionListConfig } from './position-list.js';
export { createActionBar, type ActionBarConfig } from './action-bar.js';
export { createAmountInput, type AmountInputConfig } from './amount-input.js';
export {
  createConfirmDialog,
  createBuyConfirmDialog,
  createSellConfirmDialog,
  createExitAllConfirmDialog,
  type ConfirmDialogConfig,
  type ConfirmDialogType,
} from './confirm-dialog.js';
