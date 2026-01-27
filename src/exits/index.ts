/**
 * Exit management system for position exits and stop losses
 *
 * This module exports the exit monitor for tracking and managing
 * position exits based on take profit and stop loss thresholds.
 */

// Monitor
export { ExitMonitor, createExitMonitor } from './monitor.js';
export type { ExitSignalHandler } from './monitor.js';

// Types (re-exported from positions for convenience)
export type { ExitConfig, ExitSignal, ExitSignalType } from '../types/positions.js';
