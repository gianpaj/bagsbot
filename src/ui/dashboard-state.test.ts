import { describe, it, expect } from 'vitest';
import {
  createDashboardState,
  trackLaunch,
  applyFilterResult,
  markOpportunityCreated,
  getSelectedTrackedItem,
  buildCurrentReport,
  selectNextItem,
  selectPreviousItem,
  syncPositions,
  getOpenPositions,
  getPositionPnl,
  getPortfolioSummary,
  setMarketData,
} from './dashboard-state.js';
import type { Position } from '../types/positions.js';

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    mint: 'mint-1',
    tokenSymbol: 'ONE',
    entryPrice: 0.001,
    tokensHeld: 1000,
    entrySol: 1,
    entryTimestamp: new Date(),
    status: 'open',
    ...overrides,
  };
}

describe('dashboard state', () => {
  it('tracks launches and keeps the newest item selected', () => {
    const state = createDashboardState();

    trackLaunch(state, {
      mint: 'mint-1',
      creator: 'creator-1',
      name: 'Token One',
      symbol: 'ONE',
    });
    trackLaunch(state, {
      mint: 'mint-2',
      creator: 'creator-2',
      name: 'Token Two',
      symbol: 'TWO',
    });

    expect(state.trackedItems).toHaveLength(2);
    expect(state.selectedItemId).toBe('mint-2');

    selectNextItem(state);
    expect(state.selectedItemId).toBe('mint-1');

    selectPreviousItem(state);
    expect(state.selectedItemId).toBe('mint-2');
  });

  it('builds a progressive report from filter and opportunity data', () => {
    const state = createDashboardState();
    trackLaunch(state, {
      mint: 'mint-1',
      creator: 'creator-1',
      name: 'Token One',
      symbol: 'ONE',
    });

    applyFilterResult(
      state,
      'mint-1',
      {
        launch: {
          mint: 'mint-1',
          creator: 'creator-1',
          name: 'Token One',
          symbol: 'ONE',
        },
        totalScore: 88,
        passed: true,
        filters: {
          creator: { passed: true, score: 90, details: 'creator looks healthy' },
          technical: { passed: true, score: 85, details: 'metadata is clean' },
          social: { passed: true, score: 84, details: 'social links are present' },
          liquidity: { passed: true, score: 93, details: 'liquidity is strong' },
        },
        timestamp: new Date(),
      },
      'high'
    );

    markOpportunityCreated(state, {
      id: 'opp-1',
      launch: {
        mint: 'mint-1',
        creator: 'creator-1',
        name: 'Token One',
        symbol: 'ONE',
      },
      filterResult: {
        launch: {
          mint: 'mint-1',
          creator: 'creator-1',
          name: 'Token One',
          symbol: 'ONE',
        },
        totalScore: 88,
        passed: true,
        filters: {
          creator: { passed: true, score: 90, details: 'creator looks healthy' },
          technical: { passed: true, score: 85, details: 'metadata is clean' },
          social: { passed: true, score: 84, details: 'social links are present' },
          liquidity: { passed: true, score: 93, details: 'liquidity is strong' },
        },
        timestamp: new Date(),
      },
      suggestedAmount: 0.15,
      timestamp: new Date(),
      status: 'pending',
    });

    const report = buildCurrentReport(getSelectedTrackedItem(state));

    expect(report).toContain('Token One (ONE)');
    expect(report).toContain('Score: 88/100');
    expect(report).toContain('Opportunity: pending');
    expect(report).toContain('Filter Breakdown');
  });

  it('computes per-position PnL, falling back to entry cost before a price is set', () => {
    const noPrice = makePosition({ entrySol: 1 });
    expect(getPositionPnl(noPrice)).toEqual({ valueSol: 1, pnlSol: 0, pnlPercent: 0 });

    const up = makePosition({ entrySol: 1, currentValue: 1.5 });
    expect(getPositionPnl(up)).toEqual({ valueSol: 1.5, pnlSol: 0.5, pnlPercent: 50 });

    const down = makePosition({ entrySol: 2, currentPrice: 0.0005, tokensHeld: 1000 });
    expect(getPositionPnl(down)).toMatchObject({ valueSol: 0.5, pnlSol: -1.5, pnlPercent: -75 });
  });

  it('summarizes open positions into a portfolio PnL', () => {
    const state = createDashboardState();
    syncPositions(state, [
      makePosition({ id: 'p1', mint: 'mint-1', tokenSymbol: 'ONE', entrySol: 1, currentValue: 1.5 }),
      makePosition({ id: 'p2', mint: 'mint-2', tokenSymbol: 'TWO', entrySol: 1, currentValue: 0.5 }),
    ]);

    expect(getOpenPositions(state)).toHaveLength(2);

    const summary = getPortfolioSummary(state);
    expect(summary.openCount).toBe(2);
    expect(summary.totalEntrySol).toBe(2);
    expect(summary.totalCurrentValueSol).toBe(2);
    expect(summary.totalPnlSol).toBe(0);
    expect(summary.totalPnlPercent).toBe(0);
  });

  it('attaches a market assessment and renders it in the report', () => {
    const state = createDashboardState();
    trackLaunch(state, { mint: 'mint-1', creator: 'creator-1', name: 'Token One', symbol: 'ONE' });

    setMarketData(state, 'mint-1', {
      score: 80,
      rating: 'good',
      signals: [
        { key: 'organic', label: 'Organic', value: 'high (90)', status: 'good' },
        { key: 'liquidity', label: 'Liquidity', value: '$10.0k', status: 'good' },
        { key: 'momentum', label: 'Momentum 1h', value: '2.0x, net +5', status: 'good' },
        { key: 'distribution', label: 'Holders', value: 'top 5% / bot 0%', status: 'good' },
        { key: 'safety', label: 'Safety', value: 'mint off, freeze off', status: 'good' },
      ],
    });

    expect(getSelectedTrackedItem(state)?.market?.rating).toBe('good');

    const report = buildCurrentReport(getSelectedTrackedItem(state));
    expect(report).toContain('Market Signals - GOOD (80/100)');
    expect(report).toContain('Liquidity: $10.0k');
    expect(report).toContain('Momentum 1h: 2.0x, net +5');
  });

  it('excludes closed positions from the portfolio summary', () => {
    const state = createDashboardState();
    syncPositions(state, [makePosition({ id: 'p1', mint: 'mint-1', currentValue: 2 })]);
    // A subsequent sync without mint-1 marks it closed.
    syncPositions(state, [makePosition({ id: 'p2', mint: 'mint-2', currentValue: 3 })]);

    const summary = getPortfolioSummary(state);
    expect(summary.openCount).toBe(1);
    expect(summary.positions[0]?.mint).toBe('mint-2');
  });
});
