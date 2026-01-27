/**
 * Position management module
 *
 * Exports:
 * - PositionManager: Main class for managing positions
 * - PositionStorage: Storage layer for persistence
 * - PnLMetrics: Type for profit/loss metrics
 *
 * @module positions
 */

export { PositionManager, type PnLMetrics } from './manager.js';
export { PositionStorage } from './storage.js';
