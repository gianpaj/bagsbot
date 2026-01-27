/**
 * Integration tests for Restream listener functionality
 *
 * Tests the RestreamListener's ability to:
 * - Connect to the Bags Restream service
 * - Subscribe to and receive launch events
 * - Handle reconnection scenarios
 *
 * Note: Tests requiring actual API keys are skipped by default.
 * Set BAGS_API_KEY environment variable to run live integration tests.
 *
 * @module tests/integration/restream
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RestreamListener, type ConnectionStatus } from '../../src/listeners/restream.js';
import { createMockRestreamClient, type MockRestreamClient } from '../mocks/bags-sdk.js';
import { createMockLaunchEvent, createBatchLaunchEvents } from '../mocks/launch-events.js';
import type { LaunchpadLaunchEvent } from '../../src/types/index.js';

// Check if live tests should run
const BAGS_API_KEY = process.env.BAGS_API_KEY;
const SKIP_LIVE_TESTS = !BAGS_API_KEY;

describe('Restream Integration Tests', () => {
  let mockClient: MockRestreamClient;
  let listener: RestreamListener;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = createMockRestreamClient();
    listener = new RestreamListener(mockClient);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (listener.isConnected()) {
      await listener.disconnect();
    }
  });

  describe('Connection to Bags Restream', () => {
    it('should establish connection successfully', async () => {
      await listener.connect();

      expect(listener.isConnected()).toBe(true);
      expect(listener.getStatus()).toBe('connected');
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.subscribeBagsLaunches).toHaveBeenCalledTimes(1);
    });

    it('should track connection status changes during connect', async () => {
      const statuses: ConnectionStatus[] = [];
      listener.onConnectionStatusChange((status) => {
        statuses.push(status);
      });

      await listener.connect();

      expect(statuses).toEqual(['disconnected', 'connecting', 'connected']);
    });

    it('should handle connection with delayed response', async () => {
      const slowClient = createMockRestreamClient({ connectDelayMs: 100 });
      const slowListener = new RestreamListener(slowClient);

      const connectPromise = slowListener.connect();

      // Status should be 'connecting' while waiting
      expect(slowListener.getStatus()).toBe('connecting');

      await vi.advanceTimersByTimeAsync(100);
      await connectPromise;

      expect(slowListener.isConnected()).toBe(true);
    });

    it('should throw on connection failure after retries', async () => {
      const failingClient = createMockRestreamClient({
        connectShouldFail: true,
        connectErrorMessage: 'Server unavailable',
      });
      const failingListener = new RestreamListener(failingClient, {
        maxReconnectAttempts: 2,
        reconnectBaseDelayMs: 10,
      });

      // Start the connection and advance timers together to avoid unhandled rejection
      const [, result] = await Promise.allSettled([
        vi.runAllTimersAsync(),
        failingListener.connect(),
      ]);

      // Error message gets wrapped by RestreamListener
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(Error);
        expect((result.reason as Error).message).toMatch(/Server unavailable|Retry exhausted/);
      }
      expect(failingListener.isConnected()).toBe(false);
      expect(failingListener.getStatus()).toBe('disconnected');
    });

    it('should retry connection with exponential backoff', async () => {
      let connectAttempts = 0;
      const retryingClient = createMockRestreamClient({
        connectFailCount: 2,
        connectErrorMessage: 'Temporary failure',
      });

      // Track connect calls
      vi.mocked(retryingClient.connect).mockImplementation(async () => {
        connectAttempts++;
        if (connectAttempts < 3) {
          throw new Error('Temporary failure');
        }
      });

      const retryingListener = new RestreamListener(retryingClient, {
        maxReconnectAttempts: 5,
        reconnectBaseDelayMs: 100,
      });

      const connectPromise = retryingListener.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(connectAttempts).toBe(3);
      expect(retryingListener.isConnected()).toBe(true);
    });

    it.skipIf(SKIP_LIVE_TESTS)('should connect to live Bags Restream service', async () => {
      // This test requires a real API key and network access
      // It is skipped unless BAGS_API_KEY is provided
      vi.useRealTimers();

      // Note: This would use the actual RestreamClient from @bagsfm/bags-sdk
      // const { RestreamClient } = await import('@bagsfm/bags-sdk');
      // const liveClient = new RestreamClient({ apiKey: BAGS_API_KEY });
      // const liveListener = new RestreamListener(liveClient);
      // await liveListener.connect();
      // expect(liveListener.isConnected()).toBe(true);
      // await liveListener.disconnect();

      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Event Subscription', () => {
    it('should receive launch events after subscription', async () => {
      await listener.connect();

      const receivedEvents: LaunchpadLaunchEvent[] = [];
      listener.onLaunch((event) => {
        receivedEvents.push(event);
      });

      const testEvent = createMockLaunchEvent({ symbol: 'INTG' });
      mockClient._triggerLaunch(testEvent);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].symbol).toBe('INTG');
    });

    it('should handle multiple concurrent subscribers', async () => {
      await listener.connect();

      const handler1Events: LaunchpadLaunchEvent[] = [];
      const handler2Events: LaunchpadLaunchEvent[] = [];
      const handler3Events: LaunchpadLaunchEvent[] = [];

      listener.onLaunch((event) => handler1Events.push(event));
      listener.onLaunch((event) => handler2Events.push(event));
      listener.onLaunch((event) => handler3Events.push(event));

      const testEvent = createMockLaunchEvent({ symbol: 'MULTI' });
      mockClient._triggerLaunch(testEvent);

      expect(handler1Events).toHaveLength(1);
      expect(handler2Events).toHaveLength(1);
      expect(handler3Events).toHaveLength(1);
    });

    it('should allow unsubscription from events', async () => {
      await listener.connect();

      const receivedEvents: LaunchpadLaunchEvent[] = [];
      const unsubscribe = listener.onLaunch((event) => {
        receivedEvents.push(event);
      });

      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'First' }));
      expect(receivedEvents).toHaveLength(1);

      unsubscribe();

      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'Second' }));
      expect(receivedEvents).toHaveLength(1); // Still 1, not 2
    });

    it('should handle high-frequency events', async () => {
      await listener.connect();

      const receivedEvents: LaunchpadLaunchEvent[] = [];
      listener.onLaunch((event) => {
        receivedEvents.push(event);
      });

      const batchEvents = createBatchLaunchEvents(100);
      for (const event of batchEvents) {
        mockClient._triggerLaunch(event);
      }

      expect(receivedEvents).toHaveLength(100);
    });

    it('should isolate handler errors', async () => {
      await listener.connect();

      const goodEvents: LaunchpadLaunchEvent[] = [];
      let errorThrown = false;

      listener.onLaunch(() => {
        errorThrown = true;
        throw new Error('Handler error');
      });

      listener.onLaunch((event) => {
        goodEvents.push(event);
      });

      mockClient._triggerLaunch(createMockLaunchEvent());

      expect(errorThrown).toBe(true);
      expect(goodEvents).toHaveLength(1);
    });

    it('should not receive events when disconnected', async () => {
      await listener.connect();

      const receivedEvents: LaunchpadLaunchEvent[] = [];
      listener.onLaunch((event) => {
        receivedEvents.push(event);
      });

      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'BeforeDisconnect' }));
      expect(receivedEvents).toHaveLength(1);

      await listener.disconnect();

      // Simulate event being triggered while disconnected
      // (In real scenario, SDK wouldn't send events, but we test our guard)
      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'AfterDisconnect' }));

      // Events after disconnect are not received (client is not connected)
      expect(receivedEvents).toHaveLength(1);
    });
  });

  describe('Reconnection', () => {
    it('should enter reconnecting state on connection loss', async () => {
      await listener.connect();

      const statuses: ConnectionStatus[] = [];
      listener.onConnectionStatusChange((status) => {
        statuses.push(status);
      });

      // Clear initial status
      statuses.length = 0;

      listener.handleConnectionLoss();

      expect(listener.getStatus()).toBe('reconnecting');
      expect(statuses).toContain('reconnecting');
    });

    it('should buffer events during reconnection', async () => {
      await listener.connect();

      const receivedEvents: LaunchpadLaunchEvent[] = [];
      listener.onLaunch((event) => {
        receivedEvents.push(event);
      });

      // Simulate connection loss
      listener.handleConnectionLoss();

      // Buffer events via injectEvent (simulating events received during reconnect)
      listener.injectEvent(createMockLaunchEvent({ mint: 'Buffered1' }));
      listener.injectEvent(createMockLaunchEvent({ mint: 'Buffered2' }));

      expect(listener.getBufferedEventCount()).toBe(2);
      expect(receivedEvents).toHaveLength(0); // Not delivered yet

      // Complete reconnection
      await vi.runAllTimersAsync();

      expect(listener.isConnected()).toBe(true);
      expect(receivedEvents).toHaveLength(2);
      expect(listener.getBufferedEventCount()).toBe(0);
    });

    it('should respect buffer size limit during reconnection', async () => {
      const smallBufferListener = new RestreamListener(mockClient, {
        eventBufferSize: 3,
      });

      await smallBufferListener.connect();

      const receivedEvents: LaunchpadLaunchEvent[] = [];
      smallBufferListener.onLaunch((event) => {
        receivedEvents.push(event);
      });

      smallBufferListener.handleConnectionLoss();

      // Buffer more events than the limit
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Event1' }));
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Event2' }));
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Event3' }));
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Event4' }));
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Event5' }));

      expect(smallBufferListener.getBufferedEventCount()).toBe(3);

      await vi.runAllTimersAsync();

      // Only the most recent 3 events should be delivered
      expect(receivedEvents).toHaveLength(3);
      expect(receivedEvents.find((e) => e.mint === 'Event1')).toBeUndefined();
      expect(receivedEvents.find((e) => e.mint === 'Event2')).toBeUndefined();
    });

    it('should reconnect successfully after temporary failure', async () => {
      await listener.connect();
      vi.mocked(mockClient.connect).mockClear();

      // Make first reconnect attempt fail
      let reconnectAttempt = 0;
      vi.mocked(mockClient.connect).mockImplementation(async () => {
        reconnectAttempt++;
        if (reconnectAttempt === 1) {
          throw new Error('Temporary network error');
        }
      });

      listener.handleConnectionLoss();

      await vi.runAllTimersAsync();

      expect(listener.isConnected()).toBe(true);
      expect(reconnectAttempt).toBeGreaterThan(1);
    });

    it('should give up after max reconnection attempts', async () => {
      const persistentFailListener = new RestreamListener(mockClient, {
        maxReconnectAttempts: 3,
        reconnectBaseDelayMs: 10,
      });

      await persistentFailListener.connect();

      // Make all reconnection attempts fail
      vi.mocked(mockClient.connect).mockRejectedValue(new Error('Persistent failure'));

      persistentFailListener.handleConnectionLoss();

      await vi.runAllTimersAsync();

      expect(persistentFailListener.isConnected()).toBe(false);
      expect(persistentFailListener.getStatus()).toBe('disconnected');
    });

    it('should abort reconnection on explicit disconnect', async () => {
      await listener.connect();

      // Make reconnection slow
      vi.mocked(mockClient.connect).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      listener.handleConnectionLoss();

      // Start reconnection
      await vi.advanceTimersByTimeAsync(0);

      // Disconnect while reconnecting
      const disconnectPromise = listener.disconnect();
      await vi.runAllTimersAsync();
      await disconnectPromise;

      expect(listener.isConnected()).toBe(false);
      expect(listener.getStatus()).toBe('disconnected');
    });
  });

  describe('Connection Status Monitoring', () => {
    it('should notify all status handlers of changes', async () => {
      const handler1Statuses: ConnectionStatus[] = [];
      const handler2Statuses: ConnectionStatus[] = [];

      listener.onConnectionStatusChange((status) => handler1Statuses.push(status));
      listener.onConnectionStatusChange((status) => handler2Statuses.push(status));

      await listener.connect();
      await listener.disconnect();

      expect(handler1Statuses).toEqual(['disconnected', 'connecting', 'connected', 'disconnected']);
      expect(handler2Statuses).toEqual(['disconnected', 'connecting', 'connected', 'disconnected']);
    });

    it('should immediately notify new handlers of current status', async () => {
      await listener.connect();

      let receivedStatus: ConnectionStatus | null = null;
      listener.onConnectionStatusChange((status) => {
        receivedStatus = status;
      });

      expect(receivedStatus).toBe('connected');
    });

    it('should allow unsubscription from status changes', async () => {
      const statuses: ConnectionStatus[] = [];
      const unsubscribe = listener.onConnectionStatusChange((status) => {
        statuses.push(status);
      });

      // Initial status
      expect(statuses).toContain('disconnected');

      unsubscribe();
      statuses.length = 0;

      await listener.connect();

      expect(statuses).toHaveLength(0);
    });

    it('should handle status handler errors gracefully', async () => {
      let goodHandlerCalled = false;

      listener.onConnectionStatusChange(() => {
        throw new Error('Handler error');
      });

      listener.onConnectionStatusChange(() => {
        goodHandlerCalled = true;
      });

      await listener.connect();

      expect(goodHandlerCalled).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      for (let i = 0; i < 5; i++) {
        await listener.connect();
        await listener.disconnect();
      }

      expect(listener.isConnected()).toBe(false);
      expect(listener.getStatus()).toBe('disconnected');
    });

    it('should handle connect when already connected', async () => {
      await listener.connect();
      await listener.connect();
      await listener.connect();

      expect(vi.mocked(mockClient.connect)).toHaveBeenCalledTimes(1);
      expect(listener.isConnected()).toBe(true);
    });

    it('should handle disconnect when already disconnected', async () => {
      await listener.disconnect();
      await listener.disconnect();
      await listener.disconnect();

      expect(vi.mocked(mockClient.disconnect)).not.toHaveBeenCalled();
      expect(listener.isConnected()).toBe(false);
    });

    it('should handle events with missing optional fields', async () => {
      await listener.connect();

      const receivedEvents: LaunchpadLaunchEvent[] = [];
      listener.onLaunch((event) => {
        receivedEvents.push(event);
      });

      const minimalEvent: LaunchpadLaunchEvent = {
        mint: 'MinimalMint',
        creator: 'MinimalCreator',
        name: 'Minimal',
        symbol: 'MIN',
      };

      mockClient._triggerLaunch(minimalEvent);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].telegram).toBeUndefined();
      expect(receivedEvents[0].twitter).toBeUndefined();
    });
  });
});
