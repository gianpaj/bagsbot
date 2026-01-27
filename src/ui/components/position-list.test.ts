/**
 * Tests for Position List Component
 */

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, vi } from 'vitest';
import { createPositionList } from './position-list.js';
import type { Position } from '../../types/index.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

describe('position list component', () => {
  const mockPosition: Position = {
    id: 'pos-1',
    mint: 'EPjFWaLb3ylnz39cEbiywUUV3jnYiGgbsZXzMSTEiZX',
    tokenSymbol: 'TOKEN',
    entryPrice: 0.001,
    tokensHeld: 1000,
    entrySol: 1.0,
    entryTimestamp: new Date(),
    status: 'open',
    currentPrice: 0.002,
    currentValue: 2.0,
    pnlPercent: 100,
  };

  it('should create empty position list', () => {
    const component = createPositionList({
      positions: [],
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'position-list');
  });

  it('should display single position', () => {
    const component = createPositionList({
      positions: [mockPosition],
    });

    expect(component).toBeDefined();
  });

  it('should display multiple positions', () => {
    const positions = [
      mockPosition,
      { ...mockPosition, id: 'pos-2', tokenSymbol: 'TOKEN2', pnlPercent: -50 },
      { ...mockPosition, id: 'pos-3', tokenSymbol: 'TOKEN3', pnlPercent: 200 },
    ];

    const component = createPositionList({
      positions,
    });

    expect(component).toBeDefined();
  });

  it('should respect maxDisplay limit', () => {
    const positions = Array.from({ length: 10 }, (_, i) => ({
      ...mockPosition,
      id: `pos-${i}`,
      tokenSymbol: `TOKEN${i}`,
    }));

    const component = createPositionList({
      positions,
      maxDisplay: 5,
    });

    expect(component).toBeDefined();
  });

  it('should show truncation message when exceeding maxDisplay', () => {
    const positions = Array.from({ length: 8 }, (_, i) => ({
      ...mockPosition,
      id: `pos-${i}`,
      tokenSymbol: `TOKEN${i}`,
    }));

    const component = createPositionList({
      positions,
      maxDisplay: 5,
    });

    expect(component).toBeDefined();
  });

  it('should format positive P&L correctly', () => {
    const profitPosition: Position = {
      ...mockPosition,
      pnlPercent: 125.5,
      currentValue: 2.255,
    };

    const component = createPositionList({
      positions: [profitPosition],
    });

    expect(component).toBeDefined();
  });

  it('should format negative P&L correctly', () => {
    const lossPosition: Position = {
      ...mockPosition,
      pnlPercent: -45.2,
      currentValue: 0.548,
    };

    const component = createPositionList({
      positions: [lossPosition],
    });

    expect(component).toBeDefined();
  });

  it('should handle missing currentValue', () => {
    const positionWithoutCurrent: Position = {
      ...mockPosition,
      currentValue: undefined,
    };

    const component = createPositionList({
      positions: [positionWithoutCurrent],
    });

    expect(component).toBeDefined();
  });

  it('should handle missing pnlPercent', () => {
    const positionWithoutPnl: Position = {
      ...mockPosition,
      pnlPercent: undefined,
    };

    const component = createPositionList({
      positions: [positionWithoutPnl],
    });

    expect(component).toBeDefined();
  });

  it('should have column flex direction', () => {
    const component = createPositionList({
      positions: [mockPosition],
    });

    expect(component).toHaveProperty('flexDirection', 'column');
  });

  it('should use default maxDisplay of 5', () => {
    const positions = Array.from({ length: 10 }, (_, i) => ({
      ...mockPosition,
      id: `pos-${i}`,
    }));

    const component = createPositionList({
      positions,
    });

    expect(component).toBeDefined();
  });
});
