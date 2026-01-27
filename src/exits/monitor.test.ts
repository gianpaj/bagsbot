/**
 * Unit tests for ExitMonitor
 *
 * Tests cover:
 * - Initialization and configuration
 * - Position management (add, update, remove)
 * - Exit signal detection (take profit and stop loss)
 * - Signal handler subscription and triggering
 * - Auto-sell functionality
 * - Monitoring interval behavior
 * - Error handling
 */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExitMonitor, createExitMonitor, type ExitSignalHandler } from './monitor.js';
import type { Position, ExitSignal, ExitConfig } from '../types/positions.js';

/**
 * Create a mock position for testing
 */
function createMockPosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-123',
    mint: 'TokenMint123456789',
    tokenSymbol: 'TEST',
    entryPrice: 0.00001,
    tokensHeld: 10000,
    entrySol: 0.1,
    entryTimestamp: new Date(),
    currentPrice: 0.00001,
    currentValue: 0.1,
    pnlPercent: 0,
    status: 'open',
    ...overrides,
  };
}

describe('ExitMonitor', () => {
  let monitor: ExitMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new ExitMonitor();
  });

  afterEach(() => {
    monitor.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create with default configuration', () => {
      const config = monitor.getConfig();

      expect(config.takeProfitPercent).toBe(900);
      expect(config.stopLossPercent).toBe(-50);
      expect(config.checkIntervalMs).toBe(5000);
      expect(config.autoSellEnabled).toBe(false);
    });

    it('should create with custom configuration', () => {
      const customConfig: Partial<ExitConfig> = {
        takeProfitPercent: 500,
        stopLossPercent: -30,
        checkIntervalMs: 10000,
        autoSellEnabled: true,
      };
      const customMonitor = new ExitMonitor(customConfig);

      const config = customMonitor.getConfig();
      expect(config.takeProfitPercent).toBe(500);
      expect(config.stopLossPercent).toBe(-30);
      expect(config.checkIntervalMs).toBe(10000);
      expect(config.autoSellEnabled).toBe(true);

      customMonitor.stop();
    });

    it('should start with no positions', () => {
      expect(monitor.getPositionCount()).toBe(0);
      expect(monitor.getPositions()).toEqual([]);
    });
  });

  describe('position management', () => {
    it('should add a position', () => {
      const position = createMockPosition();
      monitor.addPosition(position);

      expect(monitor.getPositionCount()).toBe(1);
      expect(monitor.getPositions()).toContain(position);
    });

    it('should add multiple positions', () => {
      const pos1 = createMockPosition({ id: 'pos-1' });
      const pos2 = createMockPosition({ id: 'pos-2' });
      const pos3 = createMockPosition({ id: 'pos-3' });

      monitor.addPosition(pos1);
      monitor.addPosition(pos2);
      monitor.addPosition(pos3);

      expect(monitor.getPositionCount()).toBe(3);
      const positions = monitor.getPositions();
      expect(positions).toContainEqual(pos1);
      expect(positions).toContainEqual(pos2);
      expect(positions).toContainEqual(pos3);
    });

    it('should update a position', () => {
      const position = createMockPosition();
      monitor.addPosition(position);

      const updatedPosition = {
        ...position,
        currentPrice: 0.00002,
        pnlPercent: 100,
      };
      monitor.updatePosition(updatedPosition);

      const positions = monitor.getPositions();
      expect(positions[0].currentPrice).toBe(0.00002);
      expect(positions[0].pnlPercent).toBe(100);
    });

    it('should remove a position', () => {
      const position = createMockPosition({ id: 'pos-1' });
      monitor.addPosition(position);
      expect(monitor.getPositionCount()).toBe(1);

      monitor.removePosition('pos-1');
      expect(monitor.getPositionCount()).toBe(0);
      expect(monitor.getPositions()).toEqual([]);
    });

    it('should remove only the specified position', () => {
      const pos1 = createMockPosition({ id: 'pos-1' });
      const pos2 = createMockPosition({ id: 'pos-2' });

      monitor.addPosition(pos1);
      monitor.addPosition(pos2);

      monitor.removePosition('pos-1');

      expect(monitor.getPositionCount()).toBe(1);
      expect(monitor.getPositions()).toContainEqual(pos2);
      expect(monitor.getPositions()).not.toContainEqual(pos1);
    });
  });

  describe('exit signal detection - take profit', () => {
    it('should detect take profit at exact threshold', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001, // 900% gain
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('take_profit');
      expect(signal.triggerPercent).toBe(900);
    });

    it('should detect take profit above threshold', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0002, // 1900% gain
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('take_profit');
      expect(signal.triggerPercent).toBe(1900);
    });

    it('should not trigger take profit below threshold', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.00005, // 400% gain
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should include position details in signal', () => {
      const position = createMockPosition({
        id: 'pos-123',
        mint: 'TestMint123',
        tokenSymbol: 'TEST',
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.position.id).toBe('pos-123');
      expect(signal.position.mint).toBe('TestMint123');
      expect(signal.position.tokenSymbol).toBe('TEST');
      expect(signal.currentPrice).toBe(0.0001);
    });
  });

  describe('exit signal detection - stop loss', () => {
    it('should detect stop loss at exact threshold', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.000005, // -50% loss
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('stop_loss');
      expect(signal.triggerPercent).toBe(-50);
    });

    it('should detect stop loss below threshold', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.000001, // -90% loss
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('stop_loss');
      expect(signal.triggerPercent).toBeCloseTo(-90);
    });

    it('should not trigger stop loss above threshold', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.000008, // -20% loss
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start monitoring', () => {
      expect(() => {
        monitor.start();
      }).not.toThrow();
    });

    it('should stop monitoring', () => {
      monitor.start();
      expect(() => {
        monitor.stop();
      }).not.toThrow();
    });

    it('should not allow double start', () => {
      monitor.start();
      monitor.start(); // Should log warning but not error

      monitor.stop();
    });

    it('should not allow double stop', () => {
      monitor.start();
      monitor.stop();
      monitor.stop(); // Should log warning but not error
    });

    it('should check positions at configured interval', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();

      // Check not called initially in fake timer context
      expect(handler).toHaveBeenCalledTimes(1); // Called once at start

      // Advance time
      vi.advanceTimersByTime(5000);
      expect(handler).toHaveBeenCalledTimes(2); // Called again after interval

      vi.advanceTimersByTime(5000);
      expect(handler).toHaveBeenCalledTimes(3);

      monitor.stop();
    });

    it('should not check positions after stopping', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      const callsAfterStart = handler.mock.calls.length;

      monitor.stop();

      vi.advanceTimersByTime(5000);

      // Should have same number of calls as after start
      expect(handler.mock.calls.length).toBe(callsAfterStart);
    });
  });

  describe('signal handler subscription', () => {
    it('should register signal handler', () => {
      const handler = vi.fn();
      monitor.onExitSignal(handler);

      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();

      monitor.stop();
    });

    it('should call all registered handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      monitor.onExitSignal(handler1);
      monitor.onExitSignal(handler2);
      monitor.onExitSignal(handler3);

      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = monitor.onExitSignal(handler);

      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      monitor.start();

      // Called once on start
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      // Update position to trigger another check
      const updatedPosition = { ...position, currentPrice: 0.0001 };
      monitor.updatePosition(updatedPosition);

      vi.advanceTimersByTime(5000);

      // Handler should not be called again after unsubscribe
      expect(handler).toHaveBeenCalledTimes(1);

      monitor.stop();
    });

    it('should handle handler errors gracefully', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      monitor.onExitSignal(errorHandler);
      monitor.onExitSignal(normalHandler);

      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      monitor.start();

      expect(() => {
        vi.advanceTimersByTime(5000);
      }).not.toThrow();

      // Normal handler should still be called even if error handler throws
      expect(normalHandler).toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe('auto-sell functionality', () => {
    it('should have auto-sell disabled by default', () => {
      const config = monitor.getConfig();
      expect(config.autoSellEnabled).toBe(false);
    });

    it('should enable auto-sell', () => {
      monitor.setAutoSell(true);
      expect(monitor.getConfig().autoSellEnabled).toBe(true);
    });

    it('should disable auto-sell', () => {
      monitor.setAutoSell(true);
      expect(monitor.getConfig().autoSellEnabled).toBe(true);

      monitor.setAutoSell(false);
      expect(monitor.getConfig().autoSellEnabled).toBe(false);
    });

    it('should emit signal regardless of auto-sell setting', () => {
      const handler = vi.fn();

      // With auto-sell disabled
      monitor.setAutoSell(false);
      monitor.onExitSignal(handler);

      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe('configuration updates', () => {
    it('should update take profit threshold', () => {
      monitor.updateConfig({ takeProfitPercent: 500 });

      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.00006, // 500% gain
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('take_profit');
    });

    it('should update stop loss threshold', () => {
      monitor.updateConfig({ stopLossPercent: -30 });

      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.000007, // -30% loss
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('stop_loss');
    });

    it('should update check interval', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001,
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.updateConfig({ checkIntervalMs: 2000 });
      monitor.start();

      expect(handler).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      expect(handler).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(2000);
      expect(handler).toHaveBeenCalledTimes(3);

      monitor.stop();
    });

    it('should preserve other config when updating one field', () => {
      monitor.updateConfig({ takeProfitPercent: 500 });

      const config = monitor.getConfig();
      expect(config.takeProfitPercent).toBe(500);
      expect(config.stopLossPercent).toBe(-50);
      expect(config.checkIntervalMs).toBe(5000);
      expect(config.autoSellEnabled).toBe(false);
    });
  });

  describe('position without current price', () => {
    it('should skip positions without current price', () => {
      const position = createMockPosition({
        currentPrice: undefined,
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe('edge cases', () => {
    it('should handle zero gain correctly', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.00001, // 0% gain
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).not.toHaveBeenCalled();

      monitor.stop();
    });

    it('should handle very large price changes', () => {
      const position = createMockPosition({
        entryPrice: 0.000001,
        currentPrice: 1.0, // 99,999,900% gain
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('take_profit');
      expect(signal.triggerPercent).toBeGreaterThan(1000000);

      monitor.stop();
    });

    it('should handle very small price changes', () => {
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.000010001, // 0.01% gain
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).not.toHaveBeenCalled();

      monitor.stop();
    });

    it('should prioritize take profit over stop loss', () => {
      // This shouldn't happen in practice, but just to verify logic
      const position = createMockPosition({
        entryPrice: 0.00001,
        currentPrice: 0.0001, // Way above take profit
      });
      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      vi.advanceTimersByTime(5000);
      monitor.stop();

      expect(handler).toHaveBeenCalled();
      const signal = handler.mock.calls[0][0] as ExitSignal;
      expect(signal.type).toBe('take_profit');

      monitor.stop();
    });
  });

  describe('factory function', () => {
    it('should create monitor with factory function', () => {
      const newMonitor = createExitMonitor();
      expect(newMonitor).toBeInstanceOf(ExitMonitor);
      newMonitor.stop();
    });

    it('should create monitor with custom config using factory', () => {
      const customConfig: Partial<ExitConfig> = {
        takeProfitPercent: 500,
        stopLossPercent: -30,
      };
      const newMonitor = createExitMonitor(customConfig);
      const config = newMonitor.getConfig();

      expect(config.takeProfitPercent).toBe(500);
      expect(config.stopLossPercent).toBe(-30);

      newMonitor.stop();
    });
  });

  describe('multiple positions monitoring', () => {
    it('should monitor multiple positions independently', () => {
      const pos1 = createMockPosition({
        id: 'pos-1',
        entryPrice: 0.00001,
        currentPrice: 0.0001, // Take profit
      });
      const pos2 = createMockPosition({
        id: 'pos-2',
        entryPrice: 0.00001,
        currentPrice: 0.000005, // Stop loss
      });
      const pos3 = createMockPosition({
        id: 'pos-3',
        entryPrice: 0.00001,
        currentPrice: 0.00005, // No signal
      });

      monitor.addPosition(pos1);
      monitor.addPosition(pos2);
      monitor.addPosition(pos3);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();
      // Initial check on start triggers both signals
      expect(handler).toHaveBeenCalledTimes(2);

      const signals = handler.mock.calls.map((call) => call[0] as ExitSignal);
      const types = signals.map((s) => s.type).sort();
      expect(types).toEqual(['stop_loss', 'take_profit']);

      monitor.stop();
    });

    it('should only emit signal once per check cycle', () => {
      const position = createMockPosition({
        id: 'pos-1',
        entryPrice: 0.00001,
        currentPrice: 0.0001, // Take profit
      });

      monitor.addPosition(position);

      const handler = vi.fn();
      monitor.onExitSignal(handler);

      monitor.start();

      expect(handler).toHaveBeenCalledTimes(1);

      // Don't advance time, position still meets criteria
      // Handler should not be called again until next interval

      vi.advanceTimersByTime(5000);

      // Should be called again after interval
      expect(handler).toHaveBeenCalledTimes(2);

      monitor.stop();
    });
  });
});
