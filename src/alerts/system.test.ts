/**
 * Unit tests for AlertSystem
 *
 * Tests cover:
 * - Queue management and FIFO ordering
 * - Opportunity confirmation and rejection
 * - Automatic expiration of opportunities
 * - History tracking
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlertSystem, type Opportunity } from './system.js';
import type { LaunchpadLaunchEvent } from '../types/launch.js';
import type { FilterPipelineResult } from '../types/filters.js';

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

const mockFilterResult: FilterPipelineResult = {
  launch: mockLaunchEvent,
  totalScore: 85,
  passed: true,
  filters: {
    creator: {
      passed: true,
      score: 90,
      details: 'Creator verified',
    },
    technical: {
      passed: true,
      score: 85,
      details: 'Metadata complete',
    },
    social: {
      passed: true,
      score: 80,
      details: 'Active community',
    },
    liquidity: {
      passed: true,
      score: 85,
      details: 'Sufficient liquidity',
    },
  },
  timestamp: new Date(),
};

const createMockOpportunity = (
  overrides?: Partial<Opportunity>
): Opportunity => {
  return {
    id: `opp_${Date.now()}_${Math.random()}`,
    launch: mockLaunchEvent,
    filterResult: mockFilterResult,
    suggestedAmount: 1.0,
    timestamp: new Date(),
    status: 'pending',
    ...overrides,
  };
};

describe('AlertSystem', () => {
  let alertSystem: AlertSystem;

  beforeEach(() => {
    alertSystem = new AlertSystem({ opportunityTimeoutMs: 100 });
  });

  afterEach(() => {
    alertSystem.destroy();
  });

  describe('initialization', () => {
    it('should initialize with empty queue and history', () => {
      expect(alertSystem.getCurrentOpportunity()).toBeNull();
      expect(alertSystem.getHistory()).toHaveLength(0);
      expect(alertSystem.getPendingCount()).toBe(0);
    });

    it('should accept custom configuration', () => {
      const system = new AlertSystem({
        opportunityTimeoutMs: 5000,
        maxHistorySize: 100,
      });
      expect(system).toBeDefined();
      system.destroy();
    });

    it('should use default configuration if not provided', () => {
      const system = new AlertSystem();
      expect(system).toBeDefined();
      system.destroy();
    });
  });

  describe('queue', () => {
    it('should add an opportunity to the queue', () => {
      const opp = createMockOpportunity();
      alertSystem.queue(opp);

      expect(alertSystem.getPendingCount()).toBe(1);
      expect(alertSystem.getCurrentOpportunity()).toBe(opp);
    });

    it('should maintain FIFO order', () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });
      const opp3 = createMockOpportunity({ id: 'opp3' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);
      alertSystem.queue(opp3);

      expect(alertSystem.getCurrentOpportunity()?.id).toBe('opp1');
      expect(alertSystem.getPendingCount()).toBe(3);
    });

    it('should set opportunity status to pending', () => {
      const opp = createMockOpportunity({ status: 'expired' as any });
      alertSystem.queue(opp);

      expect(opp.status).toBe('pending');
    });

    it('should set expiration time', () => {
      const beforeQueue = Date.now();
      const opp = createMockOpportunity();
      alertSystem.queue(opp);
      const afterQueue = Date.now();

      expect(opp.expiresAt).toBeDefined();
      expect(opp.expiresAt!.getTime()).toBeGreaterThanOrEqual(
        beforeQueue + 100
      );
      expect(opp.expiresAt!.getTime()).toBeLessThanOrEqual(afterQueue + 100);
    });

    it('should set timestamp on queued opportunity', () => {
      const beforeQueue = new Date();
      const opp = createMockOpportunity();
      alertSystem.queue(opp);
      const afterQueue = new Date();

      expect(opp.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeQueue.getTime()
      );
      expect(opp.timestamp.getTime()).toBeLessThanOrEqual(afterQueue.getTime());
    });
  });

  describe('getCurrentOpportunity', () => {
    it('should return null when queue is empty', () => {
      expect(alertSystem.getCurrentOpportunity()).toBeNull();
    });

    it('should return first pending opportunity', () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);

      expect(alertSystem.getCurrentOpportunity()?.id).toBe('opp1');
    });

    it('should skip non-pending opportunities', async () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);

      // Confirm the first one
      await alertSystem.confirm('opp1', 1.0);

      // Should now return the second one
      expect(alertSystem.getCurrentOpportunity()?.id).toBe('opp2');
    });
  });

  describe('confirm', () => {
    it('should confirm a pending opportunity', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      await alertSystem.confirm('opp1', 2.0);

      expect(opp.status).toBe('confirmed');
      expect(opp.suggestedAmount).toBe(2.0);
    });

    it('should remove confirmed opportunity from queue', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      await alertSystem.confirm('opp1', 1.0);

      expect(alertSystem.getPendingCount()).toBe(0);
      expect(alertSystem.getCurrentOpportunity()).toBeNull();
    });

    it('should add confirmed opportunity to history', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      await alertSystem.confirm('opp1', 1.0);

      const history = alertSystem.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('opp1');
      expect(history[0].status).toBe('confirmed');
    });

    it('should clear expiration timer on confirm', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      await alertSystem.confirm('opp1', 1.0);

      // Wait for the timeout period to pass
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Opportunity should not be expired (should still be confirmed)
      const history = alertSystem.getHistory();
      expect(history[0].status).toBe('confirmed');
    });

    it('should throw error if opportunity not found', async () => {
      await expect(alertSystem.confirm('nonexistent', 1.0)).rejects.toThrow(
        /not found/i
      );
    });

    it('should throw error if opportunity is not pending', async () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });
      alertSystem.queue(opp1);
      alertSystem.queue(opp2);

      // Confirm the first one
      await alertSystem.confirm('opp1', 1.0);

      // Try to confirm the second one twice
      await alertSystem.confirm('opp2', 1.0);

      // Try to confirm again - should fail because opp2 is no longer pending
      await expect(alertSystem.confirm('opp2', 2.0)).rejects.toThrow(
        /not found/i
      );
    });
  });

  describe('reject', () => {
    it('should reject a pending opportunity', () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      alertSystem.reject('opp1');

      expect(opp.status).toBe('rejected');
    });

    it('should remove rejected opportunity from queue', () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      alertSystem.reject('opp1');

      expect(alertSystem.getPendingCount()).toBe(0);
      expect(alertSystem.getCurrentOpportunity()).toBeNull();
    });

    it('should add rejected opportunity to history', () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      alertSystem.reject('opp1');

      const history = alertSystem.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('opp1');
      expect(history[0].status).toBe('rejected');
    });

    it('should clear expiration timer on reject', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      alertSystem.reject('opp1');

      // Wait for the timeout period to pass
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Opportunity should not be expired (should still be rejected)
      const history = alertSystem.getHistory();
      expect(history[0].status).toBe('rejected');
    });

    it('should throw error if opportunity not found', () => {
      expect(() => alertSystem.reject('nonexistent')).toThrow(/not found/i);
    });

    it('should throw error if opportunity is not pending', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      // Confirm it first
      await alertSystem.confirm('opp1', 1.0);

      // Try to reject an already-confirmed opportunity - it won't be in the queue
      expect(() => alertSystem.reject('opp1')).toThrow(/not found/i);
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history', () => {
      expect(alertSystem.getHistory()).toEqual([]);
    });

    it('should return confirmed opportunities', async () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);

      await alertSystem.confirm('opp1', 1.0);

      const history = alertSystem.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('opp1');
    });

    it('should return rejected opportunities', () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);

      alertSystem.reject('opp1');

      const history = alertSystem.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('opp1');
    });

    it('should return expired opportunities', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const history = alertSystem.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('expired');
    });

    it('should return a copy of history', () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);
      alertSystem.reject('opp1');

      const history1 = alertSystem.getHistory();
      const history2 = alertSystem.getHistory();

      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2);
    });

    it('should maintain history order', async () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });
      const opp3 = createMockOpportunity({ id: 'opp3' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);
      alertSystem.queue(opp3);

      await alertSystem.confirm('opp1', 1.0);
      alertSystem.reject('opp2');

      const history = alertSystem.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('opp1');
      expect(history[1].id).toBe('opp2');
    });
  });

  describe('automatic expiration', () => {
    it('should expire an opportunity after timeout', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      expect(opp.status).toBe('pending');
      expect(alertSystem.getPendingCount()).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(opp.status).toBe('expired');
      expect(alertSystem.getPendingCount()).toBe(0);
    });

    it('should move expired opportunity to history', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const history = alertSystem.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('expired');
    });

    it('should not expire opportunities that are already handled', async () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);

      // Confirm the first one
      await alertSystem.confirm('opp1', 1.0);

      // Wait for what would have been the expiration time
      await new Promise((resolve) => setTimeout(resolve, 150));

      // opp1 should still be confirmed (not expired)
      const history = alertSystem.getHistory();
      const opp1History = history.find((o) => o.id === 'opp1');
      expect(opp1History?.status).toBe('confirmed');

      // opp2 should be expired
      const opp2History = history.find((o) => o.id === 'opp2');
      expect(opp2History?.status).toBe('expired');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle multiple operations on same opportunity', async () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);

      // First confirm
      await alertSystem.confirm('opp1', 1.0);
      expect(opp.status).toBe('confirmed');

      // Try to reject should fail
      expect(() => alertSystem.reject('opp1')).toThrow();
    });

    it('should handle rapid queue operations', async () => {
      const opps = Array.from({ length: 10 }, (_, i) =>
        createMockOpportunity({ id: `opp${i}` })
      );

      opps.forEach((opp) => alertSystem.queue(opp));

      expect(alertSystem.getPendingCount()).toBe(10);

      // Confirm first 5
      for (let i = 0; i < 5; i++) {
        await alertSystem.confirm(`opp${i}`, 1.0);
      }

      expect(alertSystem.getPendingCount()).toBe(5);
      expect(alertSystem.getHistory()).toHaveLength(5);
    });

    it('should respect maxHistorySize', async () => {
      const smallSystem = new AlertSystem({
        maxHistorySize: 3,
        opportunityTimeoutMs: 100,
      });

      const opps = Array.from({ length: 5 }, (_, i) =>
        createMockOpportunity({ id: `opp${i}` })
      );

      opps.forEach((opp) => smallSystem.queue(opp));

      for (let i = 0; i < 5; i++) {
        await smallSystem.confirm(`opp${i}`, 1.0);
      }

      const history = smallSystem.getHistory();
      expect(history.length).toBeLessThanOrEqual(3);
      // First 2 opportunities should be dropped
      expect(history.map((o) => o.id)).not.toContain('opp0');
      expect(history.map((o) => o.id)).not.toContain('opp1');

      smallSystem.destroy();
    });

    it('should handle confirm with different amount than suggested', async () => {
      const opp = createMockOpportunity({ id: 'opp1', suggestedAmount: 1.0 });
      alertSystem.queue(opp);

      await alertSystem.confirm('opp1', 5.0);

      expect(opp.suggestedAmount).toBe(5.0);
    });
  });

  describe('cleanup', () => {
    it('should destroy all timers', async () => {
      const opp1 = createMockOpportunity({ id: 'opp1' });
      const opp2 = createMockOpportunity({ id: 'opp2' });

      alertSystem.queue(opp1);
      alertSystem.queue(opp2);

      alertSystem.destroy();

      // Wait for what would be the expiration time
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Opportunities should not be expired because timers were destroyed
      expect(opp1.status).toBe('pending');
      expect(opp2.status).toBe('pending');
    });

    it('should clear queue and history on destroy', () => {
      const opp = createMockOpportunity({ id: 'opp1' });
      alertSystem.queue(opp);
      alertSystem.reject('opp1');

      alertSystem.destroy();

      expect(alertSystem.getHistory()).toHaveLength(0);
      expect(alertSystem.getPendingCount()).toBe(0);
    });
  });
});
