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
} from './dashboard-state.js';

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
});
