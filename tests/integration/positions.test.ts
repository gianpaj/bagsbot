/**
 * Integration tests for position management
 *
 * Tests the PositionManager and PositionStorage for:
 * - Position persistence across restarts
 * - P&L calculation accuracy
 * - Portfolio tracking
 *
 * @module tests/integration/positions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { PositionManager, type PnLMetrics } from '../../src/positions/manager.js';
import { PositionStorage } from '../../src/positions/storage.js';
import type { Position } from '../../src/types/positions.js';
import type { TradeResult } from '../../src/types/trading.js';
import { createMockLaunchEvent } from '../mocks/launch-events.js';
import { logger } from '../../src/utils/logger.js';

// Production storage directory (used by PositionManager)
const STORAGE_DIR = join(homedir(), '.bagsbot');
const STORAGE_PATH = join(STORAGE_DIR, 'positions.json');

// Helper to suppress logger output
function noop(): void {
  // intentionally empty
}

describe('Positions Integration Tests', () => {
  // Store the original file content to restore after tests
  let originalFileContent: string | null = null;

  beforeEach(() => {
    // Suppress logger output
    vi.spyOn(logger, 'debug').mockImplementation(noop);
    vi.spyOn(logger, 'info').mockImplementation(noop);
    vi.spyOn(logger, 'warn').mockImplementation(noop);
    vi.spyOn(logger, 'error').mockImplementation(noop);

    // Backup existing storage file if it exists
    if (existsSync(STORAGE_PATH)) {
      originalFileContent = readFileSync(STORAGE_PATH, 'utf-8');
    } else {
      originalFileContent = null;
    }

    // Clean up storage for clean test state
    if (existsSync(STORAGE_PATH)) {
      rmSync(STORAGE_PATH);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();

    // Restore original file content
    if (originalFileContent !== null) {
      mkdirSync(STORAGE_DIR, { recursive: true });
      writeFileSync(STORAGE_PATH, originalFileContent, 'utf-8');
    } else if (existsSync(STORAGE_PATH)) {
      // Clean up any test data if there was no original file
      rmSync(STORAGE_PATH);
    }
  });

  describe('Position Persistence', () => {
    it('should create and persist a new position', () => {
      const manager = new PositionManager();

      const tradeResult: TradeResult = {
        success: true,
        signature: 'test-signature-123',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };

      const launchEvent = createMockLaunchEvent({
        mint: 'PersistMint123456789abcdefghijklmnop',
        symbol: 'PERS',
      });

      const position = manager.addPosition(
        tradeResult,
        launchEvent,
        0.0001, // entryPrice
        1000, // tokensHeld
        0.1 // entrySol
      );

      expect(position).toBeDefined();
      expect(position.id).toBeDefined();
      expect(position.mint).toBe(launchEvent.mint);
      expect(position.tokenSymbol).toBe('PERS');
      expect(position.status).toBe('open');

      // Verify position is retrievable
      const retrieved = manager.getPosition(position.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.mint).toBe(launchEvent.mint);
    });

    it('should persist positions to storage file', () => {
      const manager = new PositionManager();

      const tradeResult: TradeResult = {
        success: true,
        signature: 'persist-test-sig',
        tokensReceived: 500,
        executedPrice: 0.0002,
      };

      const launchEvent = createMockLaunchEvent({
        mint: 'StorageMint123456789abcdefghijklmn',
        symbol: 'STOR',
      });

      manager.addPosition(tradeResult, launchEvent, 0.0002, 500, 0.1);

      // Verify file was created
      const storagePath = join(homedir(), '.bagsbot', 'positions.json');
      expect(existsSync(storagePath)).toBe(true);

      // Verify file content
      const fileContent = readFileSync(storagePath, 'utf-8');
      const positions = JSON.parse(fileContent) as Position[];
      expect(positions.length).toBeGreaterThan(0);
    });

    it('should load positions from storage on initialization', () => {
      // Create a position with first manager
      const manager1 = new PositionManager();

      const tradeResult: TradeResult = {
        success: true,
        signature: 'load-test-sig',
        tokensReceived: 750,
        executedPrice: 0.00015,
      };

      const launchEvent = createMockLaunchEvent({
        mint: 'LoadMint123456789abcdefghijklmnopqr',
        symbol: 'LOAD',
      });

      const position = manager1.addPosition(tradeResult, launchEvent, 0.00015, 750, 0.1);
      const positionId = position.id;

      // Create a new manager (simulating restart)
      const manager2 = new PositionManager();

      // Verify position was loaded
      const loadedPosition = manager2.getPosition(positionId);
      expect(loadedPosition).not.toBeNull();
      expect(loadedPosition?.mint).toBe(launchEvent.mint);
      expect(loadedPosition?.tokenSymbol).toBe('LOAD');
    });

    it('should handle multiple positions', () => {
      const manager = new PositionManager();

      const mints = ['Multi1', 'Multi2', 'Multi3', 'Multi4', 'Multi5'];
      const positionIds: string[] = [];

      for (const mintSuffix of mints) {
        const tradeResult: TradeResult = {
          success: true,
          signature: `sig-${mintSuffix}`,
          tokensReceived: 1000,
          executedPrice: 0.0001,
        };

        const launchEvent = createMockLaunchEvent({
          mint: `${mintSuffix}Mint123456789abcdefghijklmnopq`,
          symbol: mintSuffix.toUpperCase(),
        });

        const position = manager.addPosition(tradeResult, launchEvent, 0.0001, 1000, 0.1);
        positionIds.push(position.id);
      }

      expect(manager.getAllPositions().length).toBe(5);

      // Verify all positions are retrievable
      for (const id of positionIds) {
        expect(manager.getPosition(id)).not.toBeNull();
      }
    });

    it('should persist position updates', () => {
      const manager1 = new PositionManager();

      const tradeResult: TradeResult = {
        success: true,
        signature: 'update-test-sig',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };

      const launchEvent = createMockLaunchEvent({
        mint: 'UpdateMint123456789abcdefghijklmno',
        symbol: 'UPDT',
      });

      const position = manager1.addPosition(tradeResult, launchEvent, 0.0001, 1000, 0.1);

      // Update position price
      manager1.updatePositionPrice(position.id, 0.0002);

      // Create new manager and verify update was persisted
      const manager2 = new PositionManager();
      const loadedPosition = manager2.getPosition(position.id);

      expect(loadedPosition?.currentPrice).toBe(0.0002);
    });

    it('should persist position closure', () => {
      const manager1 = new PositionManager();

      const tradeResult: TradeResult = {
        success: true,
        signature: 'close-test-sig',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };

      const launchEvent = createMockLaunchEvent({
        mint: 'CloseMint123456789abcdefghijklmnop',
        symbol: 'CLOS',
      });

      const position = manager1.addPosition(tradeResult, launchEvent, 0.0001, 1000, 0.1);
      manager1.closePosition(position.id, { reason: 'take_profit' });

      // Create new manager and verify closure was persisted
      const manager2 = new PositionManager();
      const loadedPosition = manager2.getPosition(position.id);

      expect(loadedPosition?.status).toBe('closed');
    });

    it('should handle corrupted storage gracefully', () => {
      // Write corrupted JSON to storage
      const storagePath = join(homedir(), '.bagsbot', 'positions.json');
      const storageDir = join(homedir(), '.bagsbot');

      mkdirSync(storageDir, { recursive: true });
      writeFileSync(storagePath, 'not valid json { broken', 'utf-8');

      // Should throw on corrupted storage
      expect(() => new PositionManager()).toThrow();
    });

    it('should handle empty storage file', () => {
      // Write empty array to storage
      const storagePath = join(homedir(), '.bagsbot', 'positions.json');
      const storageDir = join(homedir(), '.bagsbot');

      mkdirSync(storageDir, { recursive: true });
      writeFileSync(storagePath, '[]', 'utf-8');

      const manager = new PositionManager();
      expect(manager.getAllPositions()).toHaveLength(0);
    });
  });

  describe('P&L Calculation Accuracy', () => {
    it('should calculate P&L for a profitable position', () => {
      const manager = new PositionManager();

      const tradeResult: TradeResult = {
        success: true,
        signature: 'profit-test-sig',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };

      const launchEvent = createMockLaunchEvent({
        mint: 'ProfitMint123456789abcdefghijklmno',
        symbol: 'PRFT',
      });

      const position = manager.addPosition(
        tradeResult,
        launchEvent,
        0.0001, // entryPrice: 0.0001 SOL per token
        1000, // tokensHeld
        0.1 // entrySol
      );

      // Update price to 2x
      manager.updatePositionPrice(position.id, 0.0002);

      const updatedPosition = manager.getPosition(position.id);
      expect(updatedPosition).not.toBeNull();
      expect(updatedPosition!.currentPrice).toBe(0.0002);
      expect(updatedPosition!.currentValue).toBe(0.2); // 1000 * 0.0002
      expect(updatedPosition!.pnlPercent).toBe(100); // 100% gain
    });

    it('should calculate P&L for a losing position', () => {
      const manager = new PositionManager();

      const tradeResult: TradeResult = {
        success: true,
        signature: 'loss-test-sig',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };

      const launchEvent = createMockLaunchEvent({
        mint: 'LossMint123456789abcdefghijklmnopq',
        symbol: 'LOSS',
      });

      const position = manager.addPosition(
        tradeResult,
        launchEvent,
        0.0001, // entryPrice
        1000, // tokensHeld
        0.1 // entrySol
      );

      // Update price to 0.5x (50% loss)
      manager.updatePositionPrice(position.id, 0.00005);

      const updatedPosition = manager.getPosition(position.id);
      expect(updatedPosition!.currentValue).toBe(0.05); // 1000 * 0.00005
      expect(updatedPosition!.pnlPercent).toBe(-50); // 50% loss
    });

    it('should calculate total portfolio P&L', () => {
      const manager = new PositionManager();

      // Add position 1: Entry 0.1 SOL, current value 0.2 SOL (+100%)
      const result1: TradeResult = {
        success: true,
        signature: 'port-sig-1',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };
      const event1 = createMockLaunchEvent({
        mint: 'Port1Mint123456789abcdefghijklmnop',
        symbol: 'PRT1',
      });
      const pos1 = manager.addPosition(result1, event1, 0.0001, 1000, 0.1);
      manager.updatePositionPrice(pos1.id, 0.0002);

      // Add position 2: Entry 0.2 SOL, current value 0.1 SOL (-50%)
      const result2: TradeResult = {
        success: true,
        signature: 'port-sig-2',
        tokensReceived: 2000,
        executedPrice: 0.0001,
      };
      const event2 = createMockLaunchEvent({
        mint: 'Port2Mint123456789abcdefghijklmnop',
        symbol: 'PRT2',
      });
      const pos2 = manager.addPosition(result2, event2, 0.0001, 2000, 0.2);
      manager.updatePositionPrice(pos2.id, 0.00005);

      const totalPnL = manager.getTotalPnL();

      // Total entry: 0.1 + 0.2 = 0.3 SOL
      // Total current: 0.2 + 0.1 = 0.3 SOL
      // Absolute PnL: 0.3 - 0.3 = 0 SOL
      // Percent PnL: 0%
      expect(totalPnL.absolute).toBe(0);
      expect(totalPnL.percent).toBe(0);
    });

    it('should calculate total value correctly', () => {
      const manager = new PositionManager();

      // Add multiple positions
      for (let i = 0; i < 3; i++) {
        const result: TradeResult = {
          success: true,
          signature: `value-sig-${i}`,
          tokensReceived: 1000,
          executedPrice: 0.0001,
        };
        const event = createMockLaunchEvent({
          mint: `Value${i}Mint123456789abcdefghijklmno`,
          symbol: `VAL${i}`,
        });
        const pos = manager.addPosition(result, event, 0.0001, 1000, 0.1);
        manager.updatePositionPrice(pos.id, 0.00015); // 50% gain each
      }

      const totalValue = manager.getTotalValue();

      // Each position: 1000 tokens * 0.00015 = 0.15 SOL
      // Total: 3 * 0.15 = 0.45 SOL
      expect(totalValue).toBeCloseTo(0.45, 10);
    });

    it('should exclude closed positions from P&L calculations', () => {
      const manager = new PositionManager();

      // Add open position
      const result1: TradeResult = {
        success: true,
        signature: 'excl-sig-1',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };
      const event1 = createMockLaunchEvent({
        mint: 'Excl1Mint123456789abcdefghijklmnop',
        symbol: 'EXC1',
      });
      const openPos = manager.addPosition(result1, event1, 0.0001, 1000, 0.1);
      manager.updatePositionPrice(openPos.id, 0.0002);

      // Add and close position
      const result2: TradeResult = {
        success: true,
        signature: 'excl-sig-2',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };
      const event2 = createMockLaunchEvent({
        mint: 'Excl2Mint123456789abcdefghijklmnop',
        symbol: 'EXC2',
      });
      const closedPos = manager.addPosition(result2, event2, 0.0001, 1000, 0.1);
      manager.updatePositionPrice(closedPos.id, 0.00001); // Would be -90%
      manager.closePosition(closedPos.id);

      // Only open position should be counted
      const totalPnL = manager.getTotalPnL();
      expect(totalPnL.absolute).toBe(0.1); // 0.2 - 0.1
      expect(totalPnL.percent).toBe(100);

      const totalValue = manager.getTotalValue();
      expect(totalValue).toBe(0.2);
    });

    it('should handle positions without price updates', () => {
      const manager = new PositionManager();

      const result: TradeResult = {
        success: true,
        signature: 'no-update-sig',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };
      const event = createMockLaunchEvent({
        mint: 'NoUpdateMint123456789abcdefghijklm',
        symbol: 'NOUPD',
      });
      manager.addPosition(result, event, 0.0001, 1000, 0.1);

      // Without price update, should use entrySol as value
      const totalValue = manager.getTotalValue();
      expect(totalValue).toBe(0.1);

      const totalPnL = manager.getTotalPnL();
      expect(totalPnL.absolute).toBe(0);
      expect(totalPnL.percent).toBe(0);
    });

    it('should handle extreme price movements', () => {
      const manager = new PositionManager();

      const result: TradeResult = {
        success: true,
        signature: 'extreme-sig',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };
      const event = createMockLaunchEvent({
        mint: 'ExtremeMint123456789abcdefghijklmn',
        symbol: 'XTRM',
      });
      const pos = manager.addPosition(result, event, 0.0001, 1000, 0.1);

      // 100x gain
      manager.updatePositionPrice(pos.id, 0.01);

      const position = manager.getPosition(pos.id);
      expect(position!.currentValue).toBe(10); // 1000 * 0.01
      expect(position!.pnlPercent).toBe(9900); // 9900% gain

      // Near-zero price
      manager.updatePositionPrice(pos.id, 0.000000001);
      const updated = manager.getPosition(pos.id);
      expect(updated!.pnlPercent).toBeLessThan(-99);
    });
  });

  describe('Position Queries', () => {
    let manager: PositionManager;

    beforeEach(() => {
      // Clean up storage before each test in this block
      if (existsSync(STORAGE_PATH)) {
        rmSync(STORAGE_PATH);
      }

      manager = new PositionManager();

      // Add variety of positions
      const tokens = [
        { mint: 'Query1Mint123456789abcdefghijklmno', symbol: 'QRY1', status: 'open' as const },
        { mint: 'Query2Mint123456789abcdefghijklmno', symbol: 'QRY2', status: 'open' as const },
        { mint: 'Query3Mint123456789abcdefghijklmno', symbol: 'QRY3', status: 'closed' as const },
        { mint: 'Query1Mint123456789abcdefghijklmno', symbol: 'QRY1', status: 'open' as const }, // Same mint
      ];

      for (const token of tokens) {
        const result: TradeResult = {
          success: true,
          signature: `query-sig-${token.symbol}`,
          tokensReceived: 1000,
          executedPrice: 0.0001,
        };
        const event = createMockLaunchEvent({
          mint: token.mint,
          symbol: token.symbol,
        });
        const pos = manager.addPosition(result, event, 0.0001, 1000, 0.1);

        if (token.status === 'closed') {
          manager.closePosition(pos.id);
        }
      }
    });

    it('should get positions by mint', () => {
      const positions = manager.getPositionsByMint('Query1Mint123456789abcdefghijklmno');
      expect(positions.length).toBe(2);
    });

    it('should get positions by symbol', () => {
      const positions = manager.getPositionsBySymbol('QRY1');
      expect(positions.length).toBe(2);
    });

    it('should get positions by symbol case-insensitively', () => {
      const positions = manager.getPositionsBySymbol('qry2');
      expect(positions.length).toBe(1);
    });

    it('should get positions by status', () => {
      const openPositions = manager.getPositionsByStatus('open');
      const closedPositions = manager.getPositionsByStatus('closed');

      expect(openPositions.length).toBe(3);
      expect(closedPositions.length).toBe(1);
    });

    it('should get open positions', () => {
      const openPositions = manager.getOpenPositions();
      expect(openPositions.length).toBe(3);
      openPositions.forEach((pos) => {
        expect(pos.status).toBe('open');
      });
    });

    it('should get all positions', () => {
      const allPositions = manager.getAllPositions();
      expect(allPositions.length).toBe(4);
    });

    it('should return empty array for non-existent queries', () => {
      expect(manager.getPositionsByMint('NonExistentMint')).toHaveLength(0);
      expect(manager.getPositionsBySymbol('NOPE')).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      // Clean up storage before each test in this block
      if (existsSync(STORAGE_PATH)) {
        rmSync(STORAGE_PATH);
      }
    });

    it('should calculate position statistics', () => {
      const manager = new PositionManager();

      // Add 3 open and 2 closed positions
      for (let i = 0; i < 5; i++) {
        const result: TradeResult = {
          success: true,
          signature: `stat-sig-${i}`,
          tokensReceived: 1000,
          executedPrice: 0.0001,
        };
        const event = createMockLaunchEvent({
          mint: `Stat${i}Mint123456789abcdefghijklmnop`,
          symbol: `ST${i}`,
        });
        const pos = manager.addPosition(result, event, 0.0001, 1000, 0.1);
        manager.updatePositionPrice(pos.id, 0.00015);

        if (i >= 3) {
          manager.closePosition(pos.id);
        }
      }

      const stats = manager.getStatistics();

      expect(stats.totalPositions).toBe(5);
      expect(stats.openPositions).toBe(3);
      expect(stats.closedPositions).toBe(2);
      expect(stats.totalValue).toBeCloseTo(0.45, 10); // 3 open * 0.15
      expect(stats.totalPnL.absolute).toBeCloseTo(0.15, 10); // 3 * 0.05 gain per position
      expect(stats.totalPnL.percent).toBeCloseTo(50, 10);
    });
  });

  describe('Error Handling', () => {
    it('should reject adding position for failed trade', () => {
      const manager = new PositionManager();

      const failedResult: TradeResult = {
        success: false,
        error: 'Transaction failed',
      };

      const event = createMockLaunchEvent({
        mint: 'FailMint123456789abcdefghijklmnopq',
        symbol: 'FAIL',
      });

      expect(() => {
        manager.addPosition(failedResult, event, 0.0001, 1000, 0.1);
      }).toThrow('Cannot add position for failed trade');
    });

    it('should reject adding position with invalid parameters', () => {
      const manager = new PositionManager();

      const result: TradeResult = {
        success: true,
        signature: 'invalid-sig',
        tokensReceived: 1000,
        executedPrice: 0.0001,
      };

      const event = createMockLaunchEvent({
        mint: 'InvalidMint123456789abcdefghijklmn',
        symbol: 'INV',
      });

      expect(() => {
        manager.addPosition(result, event, -0.0001, 1000, 0.1);
      }).toThrow('must be positive');

      expect(() => {
        manager.addPosition(result, event, 0.0001, 0, 0.1);
      }).toThrow('must be positive');

      expect(() => {
        manager.addPosition(result, event, 0.0001, 1000, -0.1);
      }).toThrow('must be positive');
    });

    it('should throw when closing non-existent position', () => {
      const manager = new PositionManager();

      expect(() => {
        manager.closePosition('non-existent-id');
      }).toThrow('Position not found');
    });

    it('should throw when updating price for non-existent position', () => {
      const manager = new PositionManager();

      expect(() => {
        manager.updatePositionPrice('non-existent-id', 0.0001);
      }).toThrow('Position not found');
    });

    it('should return null for non-existent position get', () => {
      const manager = new PositionManager();

      expect(manager.getPosition('non-existent-id')).toBeNull();
    });
  });
});
