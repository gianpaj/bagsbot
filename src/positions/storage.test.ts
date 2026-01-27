/**
 * Unit tests for PositionStorage
 *
 * Tests cover:
 * - Loading and saving positions
 * - Directory creation
 * - Data serialization/deserialization
 * - Error handling
 * - File persistence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { homedir } from 'os';
import { dirname } from 'path';
import { PositionStorage } from './storage.js';
import type { Position } from '../types/positions.js';

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

describe('PositionStorage', () => {
  const storagePath = `${homedir()}/.bagsbot/positions.json`;
  const storageDir = dirname(storagePath);
  let storage: PositionStorage;
  let mockFileStore: Record<string, string> = {};

  const mockPosition: Position = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    mint: '11111111111111111111111111111111',
    tokenSymbol: 'TEST',
    entryPrice: 0.00001,
    tokensHeld: 10000,
    entrySol: 0.1,
    entryTimestamp: new Date('2025-01-27T12:00:00Z'),
    status: 'open',
    currentPrice: 0.0001,
    currentValue: 1.0,
    pnlPercent: 900,
  };

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

    storage = new PositionStorage();
  });

  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('should return empty array when storage file does not exist', () => {
      const positions = storage.load();
      expect(positions).toEqual([]);
    });

    it('should load positions from storage file', () => {
      // First save some positions
      const positions = [mockPosition];
      storage.save(positions);

      // Now load them
      const loaded = storage.load();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(mockPosition.id);
      expect(loaded[0].mint).toBe(mockPosition.mint);
      expect(loaded[0].tokenSymbol).toBe(mockPosition.tokenSymbol);
      expect(loaded[0].entryPrice).toBe(mockPosition.entryPrice);
      expect(loaded[0].tokensHeld).toBe(mockPosition.tokensHeld);
      expect(loaded[0].entrySol).toBe(mockPosition.entrySol);
      expect(loaded[0].status).toBe(mockPosition.status);
    });

    it('should deserialize dates correctly', () => {
      const positions = [mockPosition];
      storage.save(positions);

      const loaded = storage.load();

      expect(loaded[0].entryTimestamp).toBeInstanceOf(Date);
      expect(loaded[0].entryTimestamp.toISOString()).toBe('2025-01-27T12:00:00.000Z');
    });

    it('should load multiple positions', () => {
      const positions = [
        mockPosition,
        { ...mockPosition, id: 'pos2', mint: '22222222222222222222222222222222' },
        { ...mockPosition, id: 'pos3', mint: '33333333333333333333333333333333' },
      ];
      storage.save(positions);

      const loaded = storage.load();

      expect(loaded).toHaveLength(3);
      expect(loaded[0].id).toBe(mockPosition.id);
      expect(loaded[1].id).toBe('pos2');
      expect(loaded[2].id).toBe('pos3');
    });

    it('should throw error for invalid JSON', () => {
      // Create storage directory and write invalid JSON
      mkdirSync(storageDir, { recursive: true });
      writeFileSync(storagePath, 'invalid json {]', 'utf-8');

      expect(() => {
        storage.load();
      }).toThrow();
    });

    it('should throw error if storage file is not an array', () => {
      mkdirSync(storageDir, { recursive: true });
      writeFileSync(storagePath, JSON.stringify({ invalid: 'format' }), 'utf-8');

      expect(() => {
        storage.load();
      }).toThrow('Storage file must contain an array of positions');
    });

    it('should preserve all position fields', () => {
      const positionWithAllFields: Position = {
        id: 'test-id',
        mint: 'test-mint',
        tokenSymbol: 'TEST',
        entryPrice: 0.00001,
        tokensHeld: 10000,
        entrySol: 0.1,
        entryTimestamp: new Date('2025-01-27T12:00:00Z'),
        currentPrice: 0.0001,
        currentValue: 1.0,
        pnlPercent: 900,
        status: 'closed',
      };

      storage.save([positionWithAllFields]);
      const loaded = storage.load();

      expect(loaded[0]).toEqual(positionWithAllFields);
    });

    it('should load positions without optional fields', () => {
      const minimalPosition: Position = {
        id: 'minimal-id',
        mint: 'minimal-mint',
        tokenSymbol: 'MIN',
        entryPrice: 0.00001,
        tokensHeld: 1000,
        entrySol: 0.01,
        entryTimestamp: new Date('2025-01-27T12:00:00Z'),
        status: 'open',
      };

      storage.save([minimalPosition]);
      const loaded = storage.load();

      expect(loaded[0]).toEqual(minimalPosition);
      expect(loaded[0].currentPrice).toBeUndefined();
      expect(loaded[0].currentValue).toBeUndefined();
      expect(loaded[0].pnlPercent).toBeUndefined();
    });
  });

  describe('save', () => {
    it('should create storage file', () => {
      storage.save([mockPosition]);

      expect(existsSync(storagePath)).toBe(true);
    });

    it('should create storage directory if it does not exist', () => {
      storage.save([mockPosition]);

      // Verify mkdirSync was called with the correct path
      expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(storageDir, { recursive: true });
      // Verify file was written
      expect(existsSync(storagePath)).toBe(true);
    });

    it('should write positions as JSON array', () => {
      const positions = [mockPosition];
      storage.save(positions);

      // Get the content that was written to the mock file store
      const content = mockFileStore[storagePath];
      const parsed = JSON.parse(content);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
    });

    it('should format JSON with indentation', () => {
      storage.save([mockPosition]);

      const content = mockFileStore[storagePath];

      // Check for indentation (2 spaces)
      expect(content.includes('  ')).toBe(true);
    });

    it('should serialize dates to ISO strings', () => {
      storage.save([mockPosition]);

      const content = mockFileStore[storagePath];
      const parsed = JSON.parse(content);

      expect(typeof parsed[0].entryTimestamp).toBe('string');
      expect(parsed[0].entryTimestamp).toBe('2025-01-27T12:00:00.000Z');
    });

    it('should overwrite existing file', () => {
      const pos1 = [mockPosition];
      storage.save(pos1);

      const pos2 = [
        { ...mockPosition, id: 'new-id' },
        { ...mockPosition, id: 'another-id' },
      ];
      storage.save(pos2);

      const loaded = storage.load();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('new-id');
      expect(loaded[1].id).toBe('another-id');
    });

    it('should save empty array', () => {
      storage.save([]);

      const content = mockFileStore[storagePath];
      const parsed = JSON.parse(content);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });

    it('should save multiple positions', () => {
      const positions = [
        mockPosition,
        { ...mockPosition, id: 'pos2', mint: 'mint2' },
        { ...mockPosition, id: 'pos3', mint: 'mint3' },
      ];

      storage.save(positions);

      const content = mockFileStore[storagePath];
      const parsed = JSON.parse(content);

      expect(parsed).toHaveLength(3);
      expect(parsed[0].id).toBe(mockPosition.id);
      expect(parsed[1].mint).toBe('mint2');
      expect(parsed[2].mint).toBe('mint3');
    });

    it('should preserve all position fields during save', () => {
      const positionWithAllFields: Position = {
        id: 'full-id',
        mint: 'full-mint',
        tokenSymbol: 'FULL',
        entryPrice: 0.00005,
        tokensHeld: 20000,
        entrySol: 1.0,
        entryTimestamp: new Date('2025-01-20T10:30:00Z'),
        currentPrice: 0.0002,
        currentValue: 4.0,
        pnlPercent: 300,
        status: 'closed',
      };

      storage.save([positionWithAllFields]);

      const content = mockFileStore[storagePath];
      const parsed = JSON.parse(content)[0];

      expect(parsed.id).toBe('full-id');
      expect(parsed.mint).toBe('full-mint');
      expect(parsed.tokenSymbol).toBe('FULL');
      expect(parsed.entryPrice).toBe(0.00005);
      expect(parsed.tokensHeld).toBe(20000);
      expect(parsed.entrySol).toBe(1.0);
      expect(parsed.currentPrice).toBe(0.0002);
      expect(parsed.currentValue).toBe(4.0);
      expect(parsed.pnlPercent).toBe(300);
      expect(parsed.status).toBe('closed');
    });
  });

  describe('round-trip persistence', () => {
    it('should preserve data through save and load cycle', () => {
      const originalPositions = [
        mockPosition,
        {
          ...mockPosition,
          id: 'pos2',
          mint: 'mint2',
          tokenSymbol: 'SECOND',
          status: 'closed' as const,
        },
      ];

      storage.save(originalPositions);
      const loaded = storage.load();

      expect(loaded).toHaveLength(originalPositions.length);

      for (let i = 0; i < loaded.length; i++) {
        expect(loaded[i]).toEqual(originalPositions[i]);
      }
    });

    it('should handle multiple round trips', () => {
      const testId1 = 'test1';
      const testId2 = 'test2';

      const initial = [{ ...mockPosition, id: testId1 }];
      storage.save(initial);

      let loaded = storage.load();
      expect(loaded).toHaveLength(1);

      // Add another position
      loaded.push({ ...mockPosition, id: testId2 });
      storage.save(loaded);

      loaded = storage.load();
      expect(loaded).toHaveLength(2);

      // Remove first position
      const filtered = loaded.filter((p) => p.id !== testId1);
      storage.save(filtered);

      loaded = storage.load();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(testId2);
    });
  });

  describe('date handling', () => {
    it('should preserve date precision', () => {
      const dateWithMs = new Date('2025-01-27T12:34:56.789Z');
      const position = {
        ...mockPosition,
        entryTimestamp: dateWithMs,
      };

      storage.save([position]);
      const loaded = storage.load();

      // JavaScript Date loses some precision in milliseconds sometimes,
      // so we check the ISO string representation
      expect(loaded[0].entryTimestamp.toISOString()).toBe(dateWithMs.toISOString());
    });

    it('should handle various date formats', () => {
      const dates = [
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-12-31T23:59:59Z'),
        new Date('2025-06-15T12:30:45.500Z'),
      ];

      const positions = dates.map((date, idx) => ({
        ...mockPosition,
        id: `pos-${idx}`,
        entryTimestamp: date,
      }));

      storage.save(positions);
      const loaded = storage.load();

      for (let i = 0; i < dates.length; i++) {
        expect(loaded[i].entryTimestamp.toISOString()).toBe(dates[i].toISOString());
      }
    });
  });

  describe('edge cases', () => {
    it('should handle positions with undefined optional fields', () => {
      const position: Position = {
        id: 'test-id',
        mint: 'test-mint',
        tokenSymbol: 'TEST',
        entryPrice: 0.00001,
        tokensHeld: 10000,
        entrySol: 0.1,
        entryTimestamp: new Date(),
        status: 'open',
      };

      storage.save([position]);
      const loaded = storage.load();

      expect(loaded[0]).toEqual(position);
    });

    it('should handle positions with special characters in symbol', () => {
      const position = {
        ...mockPosition,
        tokenSymbol: 'TEST-v2.0',
      };

      storage.save([position]);
      const loaded = storage.load();

      expect(loaded[0].tokenSymbol).toBe('TEST-v2.0');
    });

    it('should handle very large token counts', () => {
      const position = {
        ...mockPosition,
        tokensHeld: 1_000_000_000_000, // 1 trillion
      };

      storage.save([position]);
      const loaded = storage.load();

      expect(loaded[0].tokensHeld).toBe(1_000_000_000_000);
    });

    it('should handle very small prices', () => {
      const position = {
        ...mockPosition,
        id: 'small-price',
        entryPrice: 0.00000001,
        currentPrice: 0.00000001,
      };

      storage.save([position]);
      const loaded = storage.load();

      // Floating point precision issues, use closeTo
      expect(loaded[0].entryPrice).toBeCloseTo(0.00000001, 15);
      expect(loaded[0].currentPrice).toBeCloseTo(0.00000001, 15);
    });

    it('should handle negative PnL percentages', () => {
      const position = {
        ...mockPosition,
        id: 'negative-pnl',
        pnlPercent: -50.5,
      };

      storage.save([position]);
      const loaded = storage.load();

      expect(loaded[0].pnlPercent).toBe(-50.5);
    });
  });
});
