import { describe, it, expect } from 'vitest';
import {
  createDashboardState,
  trackLaunch,
  applyFilterResult,
  markOpportunityCreated,
  getSelectedTrackedItem,
  buildCurrentReport,
  buildCurrentReportLines,
  selectNextItem,
  selectPreviousItem,
  setSearchQuery,
  getVisibleTrackedItems,
  itemMatchesSearch,
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

  it('colors the market rating headline and each signal line in the detail report', () => {
    const state = createDashboardState();
    trackLaunch(state, { mint: 'mint-1', creator: 'creator-1', name: 'Token One', symbol: 'ONE' });

    setMarketData(state, 'mint-1', {
      score: 28,
      rating: 'avoid',
      signals: [
        { key: 'organic', label: 'Organic', value: 'low (0)', status: 'bad' },
        { key: 'momentum', label: 'Momentum 1h', value: 'no activity', status: 'warn' },
        { key: 'safety', label: 'Safety', value: 'mint off, freeze off', status: 'good' },
      ],
    });

    const lines = buildCurrentReportLines(getSelectedTrackedItem(state));
    const ratingLine = lines.find((line) => line.content.startsWith('Market Signals -'));
    expect(ratingLine?.color).toBe('red');

    expect(lines.find((line) => line.content.includes('Organic:'))?.color).toBe('red');
    expect(lines.find((line) => line.content.includes('Momentum 1h:'))?.color).toBe('yellow');
    expect(lines.find((line) => line.content.includes('Safety:'))?.color).toBe('green');

    // Non-signal lines stay uncolored (default foreground).
    expect(lines.find((line) => line.content.startsWith('Mint:'))?.color).toBeUndefined();
  });

  it('caps tracked items but never evicts open positions or pending opportunities', () => {
    const state = createDashboardState();

    // A held item (open position) and a pending opportunity must survive eviction.
    syncPositions(state, [makePosition({ id: 'held', mint: 'held-mint', tokenSymbol: 'HELD' })]);
    markOpportunityCreated(state, {
      id: 'opp-1',
      launch: { mint: 'pending-mint', creator: 'c', name: 'Pending', symbol: 'PEND' },
      filterResult: {
        launch: { mint: 'pending-mint', creator: 'c', name: 'Pending', symbol: 'PEND' },
        totalScore: 50,
        passed: true,
        filters: {
          creator: { passed: true, score: 50, details: '' },
          technical: { passed: true, score: 50, details: '' },
          social: { passed: true, score: 50, details: '' },
          liquidity: { passed: true, score: 50, details: '' },
        },
        timestamp: new Date(),
      },
      suggestedAmount: 0.1,
      timestamp: new Date(),
      status: 'pending',
    });

    // Flood with evictable (history-only) launches well past the cap.
    for (let i = 0; i < 500; i++) {
      trackLaunch(state, { mint: `flood-${i}`, creator: 'c', name: `Flood ${i}`, symbol: 'F' });
    }

    expect(state.trackedItems.length).toBeLessThanOrEqual(202);
    const ids = new Set(state.trackedItems.map((item) => item.id));
    expect(ids.has('held-mint')).toBe(true);
    expect(ids.has('pending-mint')).toBe(true);
  });

  it('matches coins by name, symbol, or mint (coin hash), case-insensitively', () => {
    const item = {
      id: 'AbC123XyZmint',
      mint: 'AbC123XyZmint',
      symbol: 'PEPE',
      name: 'Based Pepe',
      createdAt: new Date(),
      updatedAt: new Date(),
      stage: 'launch detected',
      agentStatuses: {} as never,
      notes: [],
      errors: [],
    };

    expect(itemMatchesSearch(item, '')).toBe(true);
    expect(itemMatchesSearch(item, 'pepe')).toBe(true);
    expect(itemMatchesSearch(item, 'BASED')).toBe(true);
    expect(itemMatchesSearch(item, 'abc123')).toBe(true);
    expect(itemMatchesSearch(item, 'doge')).toBe(false);
  });

  it('filters the visible tracked items and keeps the selection within the matches', () => {
    const state = createDashboardState();
    trackLaunch(state, { mint: 'mint-pepe', creator: 'c', name: 'Based Pepe', symbol: 'PEPE' });
    trackLaunch(state, { mint: 'mint-doge', creator: 'c', name: 'Doge Coin', symbol: 'DOGE' });
    trackLaunch(state, { mint: 'mint-cat', creator: 'c', name: 'Cat Token', symbol: 'CAT' });

    // No filter: every coin is visible.
    expect(getVisibleTrackedItems(state)).toHaveLength(3);

    // Filtering down to one match moves the selection onto that match.
    setSearchQuery(state, 'doge');
    const visible = getVisibleTrackedItems(state);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.mint).toBe('mint-doge');
    expect(state.selectedItemId).toBe('mint-doge');

    // Searching by mint (coin hash) also works.
    setSearchQuery(state, 'mint-cat');
    expect(getVisibleTrackedItems(state).map((item) => item.mint)).toEqual(['mint-cat']);
    expect(state.selectedItemId).toBe('mint-cat');

    // Navigation stays inside the filtered result set.
    setSearchQuery(state, 'mint');
    expect(getVisibleTrackedItems(state)).toHaveLength(3);
    setSearchQuery(state, 'pepe');
    selectNextItem(state);
    expect(state.selectedItemId).toBe('mint-pepe');

    // Clearing the filter restores the full list.
    setSearchQuery(state, '');
    expect(getVisibleTrackedItems(state)).toHaveLength(3);
  });

  it('does not yank the selection to a new launch that the active filter hides', () => {
    const state = createDashboardState();
    trackLaunch(state, { mint: 'mint-pepe', creator: 'c', name: 'Based Pepe', symbol: 'PEPE' });
    setSearchQuery(state, 'pepe');
    expect(state.selectedItemId).toBe('mint-pepe');

    // A non-matching launch arrives; selection should stay on the visible match.
    trackLaunch(state, { mint: 'mint-doge', creator: 'c', name: 'Doge Coin', symbol: 'DOGE' });
    expect(state.selectedItemId).toBe('mint-pepe');
    expect(getVisibleTrackedItems(state).map((item) => item.mint)).toEqual(['mint-pepe']);

    // A matching launch arrives; it becomes the freshest visible selection.
    trackLaunch(state, { mint: 'mint-pepe2', creator: 'c', name: 'Pepe Classic', symbol: 'PEPEC' });
    expect(state.selectedItemId).toBe('mint-pepe2');
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
