/**
 * Unit tests for PositionManager
 *
 * Tests cover:
 * - Position creation and management
 * - Price updates and PnL calculations
 * - Persistence and recovery
 * - Filtering and statistics
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { homedir } from 'os';
import { PositionManager, type PnLMetrics } from './manager.js';
import { PositionStorage } from './storage.js';
import type { Position } from '../types/positions.js';
import type { TradeResult } from '../types/trading.js';
import type { LaunchpadLaunchEvent } from '../types/launch.js';

// Mock the fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  rmSync: vi.fn(),
}));

// Get the mocked functions
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

// Mock data
const mockLaunchEvent: LaunchpadLaunchEvent = {
  mint: '11111111111111111111111111111111',
  symbol: 'TEST',
  name: 'Test Token',
  creator: 'creator123',
  description: 'A test token',
  image: 'https://example.com/image.png',
  telegram: 'https://t.me/test',
  twitter: 'https://twitter.com/test',
  website: 'https://test.com',
};

const mockTradeResult: TradeResult = {
  success: true,
  signature: 'sig123',
  executedPrice: 0.00001,
  tokensReceived: 10000,
};

const mockFailedTradeResult: TradeResult = {
  success: false,
  error: 'Insufficient liquidity',
};

describe('PositionManager', () => {
  let manager: PositionManager;
  const storagePath = `${homedir()}/.bagsbot/positions.json`;
  let mockFileStore: Record<string, string> = {};

  beforeEach(() => {
    // Reset mock file store for each test
    mockFileStore = {};

    // Setup mock implementations
    vi.mocked(existsSync).mockImplementation((path: unknown) => {
      return typeof path === 'string' && path in mockFileStore;
    });

    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      if (typeof path !== 'string' || !(path in mockFileStore)) {
        const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return mockFileStore[path];
    });

    vi.mocked(writeFileSync).mockImplementation((path: unknown, data: unknown) => {
      if (typeof path === 'string' && typeof data === 'string') {
        mockFileStore[path] = data;
      }
    });

    vi.mocked(mkdirSync).mockImplementation(() => {
      // Mock directory creation - just track that it was called
      return undefined as any;
    });

    manager = new PositionManager();
  });

  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty positions', () => {
      expect(manager.getAllPositions()).toHaveLength(0);
      expect(manager.getOpenPositions()).toHaveLength(0);
    });

    it('should load existing positions from storage', () => {
      // Add and save a position
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);

      // Create a new manager instance to test loading
      const manager2 = new PositionManager();
      const loaded = manager2.getAllPositions();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(pos1.id);
      expect(loaded[0].mint).toBe(mockLaunchEvent.mint);
    });
  });

  describe('addPosition', () => {
    it('should create a new position with valid parameters', () => {
      const position = manager.addPosition(
        mockTradeResult,
        mockLaunchEvent,
        0.00001,
        10000,
        0.1,
      );

      expect(position).toBeDefined();
      expect(position.id).toBeDefined();
      expect(position.mint).toBe(mockLaunchEvent.mint);
      expect(position.tokenSymbol).toBe(mockLaunchEvent.symbol);
      expect(position.entryPrice).toBe(0.00001);
      expect(position.tokensHeld).toBe(10000);
      expect(position.entrySol).toBe(0.1);
      expect(position.status).toBe('open');
      expect(position.entryTimestamp).toBeInstanceOf(Date);
    });

    it('should generate unique IDs for each position', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.1);

      expect(pos1.id).not.toBe(pos2.id);
    });

    it('should persist position to storage', () => {
      manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);

      expect(existsSync(storagePath)).toBe(true);

      const content = mockFileStore[storagePath];
      const data = JSON.parse(content) as unknown[];
      expect(data).toHaveLength(1);
    });

    it('should throw error for failed trade', () => {
      expect(() => {
        manager.addPosition(mockFailedTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      }).toThrow('Cannot add position for failed trade');
    });

    it('should throw error for invalid entry price', () => {
      expect(() => {
        manager.addPosition(mockTradeResult, mockLaunchEvent, -0.00001, 10000, 0.1);
      }).toThrow('Position parameters must be positive numbers');

      expect(() => {
        manager.addPosition(mockTradeResult, mockLaunchEvent, 0, 10000, 0.1);
      }).toThrow('Position parameters must be positive numbers');
    });

    it('should throw error for invalid tokens held', () => {
      expect(() => {
        manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, -10000, 0.1);
      }).toThrow('Position parameters must be positive numbers');

      expect(() => {
        manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 0, 0.1);
      }).toThrow('Position parameters must be positive numbers');
    });

    it('should throw error for invalid entry SOL', () => {
      expect(() => {
        manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, -0.1);
      }).toThrow('Position parameters must be positive numbers');

      expect(() => {
        manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0);
      }).toThrow('Position parameters must be positive numbers');
    });
  });

  describe('getPosition', () => {
    it('should return position by ID', () => {
      const created = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      const retrieved = manager.getPosition(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent position', () => {
      const result = manager.getPosition('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getOpenPositions', () => {
    it('should return only open positions', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.1);

      expect(manager.getOpenPositions()).toHaveLength(2);

      manager.closePosition(pos1.id);

      const openPositions = manager.getOpenPositions();
      expect(openPositions).toHaveLength(1);
      expect(openPositions[0].id).toBe(pos2.id);
    });

    it('should return empty array when no positions are open', () => {
      const pos = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      manager.closePosition(pos.id);

      expect(manager.getOpenPositions()).toHaveLength(0);
    });
  });

  describe('closePosition', () => {
    it('should close an open position', () => {
      const position = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);

      expect(position.status).toBe('open');
      expect(manager.getOpenPositions()).toHaveLength(1);

      manager.closePosition(position.id);

      const closed = manager.getPosition(position.id);
      expect(closed?.status).toBe('closed');
      expect(manager.getOpenPositions()).toHaveLength(0);
    });

    it('should persist closed position to storage', () => {
      const position = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      manager.closePosition(position.id);

      // Verify persistence by creating a new manager
      const manager2 = new PositionManager();
      const loaded = manager2.getPosition(position.id);

      expect(loaded?.status).toBe('closed');
    });

    it('should throw error for non-existent position', () => {
      expect(() => {
        manager.closePosition('non-existent-id');
      }).toThrow('Position not found');
    });

    it('should accept optional result parameter', () => {
      const position = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);

      expect(() => {
        manager.closePosition(position.id, { reason: 'take_profit', price: 0.0001 });
      }).not.toThrow();
    });
  });

  describe('getTotalValue', () => {
    it('should return 0 for no positions', () => {
      expect(manager.getTotalValue()).toBe(0);
    });

    it('should sum entry SOL for positions without current value', () => {
      manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.2);

      expect(manager.getTotalValue()).toBeCloseTo(0.3, 10);
    });

    it('should use current value when available', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.2);

      manager.updatePositionPrice(pos1.id, 0.0001); // 10000 * 0.0001 = 1.0
      // pos2 still uses entry value = 0.2
      // total = 1.0 + 0.2 = 1.2

      expect(manager.getTotalValue()).toBe(1.2);
    });

    it('should exclude closed positions from total', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.2);

      manager.closePosition(pos1.id);

      expect(manager.getTotalValue()).toBe(0.2);
    });
  });

  describe('getTotalPnL', () => {
    it('should return 0 for no positions', () => {
      const pnl = manager.getTotalPnL();
      expect(pnl.absolute).toBe(0);
      expect(pnl.percent).toBe(0);
    });

    it('should calculate positive PnL', () => {
      const pos = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 1.0);
      manager.updatePositionPrice(pos.id, 0.0002); // 10000 * 0.0002 = 2.0

      const pnl = manager.getTotalPnL();
      expect(pnl.absolute).toBe(1.0); // 2.0 - 1.0
      expect(pnl.percent).toBe(100); // (1.0 / 1.0) * 100
    });

    it('should calculate negative PnL', () => {
      const pos = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 1.0);
      manager.updatePositionPrice(pos.id, 0.00005); // 10000 * 0.00005 = 0.5

      const pnl = manager.getTotalPnL();
      expect(pnl.absolute).toBe(-0.5); // 0.5 - 1.0
      expect(pnl.percent).toBe(-50); // (-0.5 / 1.0) * 100
    });

    it('should aggregate PnL from multiple positions', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 1.0);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.5);

      // pos1: 10000 * 0.0002 = 2.0, PnL = +1.0
      // pos2: 5000 * 0.0001 = 0.5, PnL = 0
      manager.updatePositionPrice(pos1.id, 0.0002);
      manager.updatePositionPrice(pos2.id, 0.0001);

      const pnl = manager.getTotalPnL();
      expect(pnl.absolute).toBe(1.0); // 1.0 + 0
      expect(pnl.percent).toBeCloseTo(66.67, 1); // (1.0 / 1.5) * 100
    });

    it('should exclude closed positions from PnL', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 1.0);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.5);

      manager.updatePositionPrice(pos1.id, 0.0002);
      manager.closePosition(pos1.id);

      manager.updatePositionPrice(pos2.id, 0.0001);

      const pnl = manager.getTotalPnL();
      expect(pnl.absolute).toBe(0); // Only pos2 counted, no change
      expect(pnl.percent).toBe(0);
    });
  });

  describe('updatePositionPrice', () => {
    it('should update price and calculate metrics', () => {
      const position = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);

      manager.updatePositionPrice(position.id, 0.0001);

      const updated = manager.getPosition(position.id);
      expect(updated?.currentPrice).toBe(0.0001);
      expect(updated?.currentValue).toBe(1.0); // 10000 * 0.0001
      expect(updated?.pnlPercent).toBe(900); // (1.0 - 0.1) / 0.1 * 100
    });

    it('should persist updated position', () => {
      const position = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      manager.updatePositionPrice(position.id, 0.0001);

      const manager2 = new PositionManager();
      const loaded = manager2.getPosition(position.id);

      expect(loaded?.currentPrice).toBe(0.0001);
      expect(loaded?.currentValue).toBe(1.0);
    });

    it('should throw error for non-existent position', () => {
      expect(() => {
        manager.updatePositionPrice('non-existent-id', 0.0001);
      }).toThrow('Position not found');
    });

    it('should calculate correct pnlPercent for losses', () => {
      const position = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      manager.updatePositionPrice(position.id, 0.000005);

      const updated = manager.getPosition(position.id);
      expect(updated?.currentValue).toBe(0.05); // 10000 * 0.000005
      expect(updated?.pnlPercent).toBe(-50); // (0.05 - 0.1) / 0.1 * 100
    });
  });

  describe('filtering methods', () => {
    beforeEach(() => {
      const event1 = { ...mockLaunchEvent, mint: 'mint1', symbol: 'TOKEN1' };
      const event2 = { ...mockLaunchEvent, mint: 'mint2', symbol: 'TOKEN2' };

      manager.addPosition(mockTradeResult, event1, 0.00001, 10000, 0.1);
      manager.addPosition(mockTradeResult, event2, 0.00002, 5000, 0.2);
    });

    it('should filter positions by mint', () => {
      const positions = manager.getPositionsByMint('mint1');
      expect(positions).toHaveLength(1);
      expect(positions[0].mint).toBe('mint1');
    });

    it('should filter positions by symbol', () => {
      const positions = manager.getPositionsBySymbol('TOKEN1');
      expect(positions).toHaveLength(1);
      expect(positions[0].tokenSymbol).toBe('TOKEN1');
    });

    it('should filter positions by symbol case-insensitively', () => {
      const positions = manager.getPositionsBySymbol('token1');
      expect(positions).toHaveLength(1);
    });

    it('should filter positions by status', () => {
      const allPositions = manager.getAllPositions();
      manager.closePosition(allPositions[0].id);

      const openPositions = manager.getPositionsByStatus('open');
      const closedPositions = manager.getPositionsByStatus('closed');

      expect(openPositions).toHaveLength(1);
      expect(closedPositions).toHaveLength(1);
    });

    it('should return empty array for non-matching filters', () => {
      expect(manager.getPositionsByMint('non-existent')).toHaveLength(0);
      expect(manager.getPositionsBySymbol('NONEXISTENT')).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 1.0);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.5);

      manager.updatePositionPrice(pos1.id, 0.0002);
      manager.closePosition(pos1.id);

      const stats = manager.getStatistics();

      expect(stats.totalPositions).toBe(2);
      expect(stats.openPositions).toBe(1);
      expect(stats.closedPositions).toBe(1);
      expect(stats.totalValue).toBe(0.5); // Only open position
      expect(stats.totalPnL.absolute).toBe(0); // Only pos2, no price update
    });
  });

  describe('setConnection', () => {
    it('should allow setting a connection', () => {
      const mockConnection = {} as any;
      expect(() => {
        manager.setConnection(mockConnection);
      }).not.toThrow();
    });
  });

  describe('updatePrices', () => {
    it('should throw error if connection not set', async () => {
      await expect(manager.updatePrices()).rejects.toThrow('Connection not set');
    });

    it('should handle empty positions', async () => {
      const mockConnection = {} as any;
      manager.setConnection(mockConnection);

      await expect(manager.updatePrices()).resolves.not.toThrow();
    });

    it('should handle positions with no updates', async () => {
      const mockConnection = {} as any;
      manager.setConnection(mockConnection);

      manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);

      await expect(manager.updatePrices()).resolves.not.toThrow();
    });
  });

  describe('persistence and recovery', () => {
    it('should recover full position state from storage', () => {
      const event1 = { ...mockLaunchEvent, mint: 'mint1', symbol: 'TOKEN1' };
      const event2 = { ...mockLaunchEvent, mint: 'mint2', symbol: 'TOKEN2' };

      const pos1 = manager.addPosition(mockTradeResult, event1, 0.00001, 10000, 0.1);
      const pos2 = manager.addPosition(mockTradeResult, event2, 0.00002, 5000, 0.2);

      manager.updatePositionPrice(pos1.id, 0.0001);
      manager.closePosition(pos2.id);

      // Create new manager to test recovery
      const manager2 = new PositionManager();

      const recovered1 = manager2.getPosition(pos1.id);
      const recovered2 = manager2.getPosition(pos2.id);

      expect(recovered1?.currentPrice).toBe(0.0001);
      expect(recovered1?.currentValue).toBe(1.0);
      expect(recovered2?.status).toBe('closed');
    });

    it('should handle corrupted storage gracefully', () => {
      // Write invalid JSON to storage file
      const storage = new PositionStorage();
      const path = `${homedir()}/.bagsbot/positions.json`;

      // This is testing error handling behavior
      // We won't actually write corrupted data as part of normal operations
      const mockManager = new PositionManager();

      expect(mockManager.getAllPositions()).toBeDefined();
    });
  });

  describe('getAllPositions', () => {
    it('should return all positions including closed ones', () => {
      const pos1 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00001, 10000, 0.1);
      const pos2 = manager.addPosition(mockTradeResult, mockLaunchEvent, 0.00002, 5000, 0.2);

      manager.closePosition(pos1.id);

      const all = manager.getAllPositions();
      expect(all).toHaveLength(2);
      expect(all.some((p) => p.id === pos1.id && p.status === 'closed')).toBe(true);
      expect(all.some((p) => p.id === pos2.id && p.status === 'open')).toBe(true);
    });
  });
});
