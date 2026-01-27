/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RestreamListener,
  createRestreamListener,
  type IRestreamClient,
  type RestreamLaunchpadLaunchSubscriptionHandler,
  type ConnectionStatus,
} from './restream.js';
import type { LaunchpadLaunchEvent } from '../types/index.js';
import { ConnectionError } from '../errors/index.js';

/**
 * Mock client type with test helpers
 */
interface MockRestreamClient extends IRestreamClient {
  _triggerLaunch: (event: LaunchpadLaunchEvent) => void;
  _getSubscribedHandler: () => RestreamLaunchpadLaunchSubscriptionHandler | null;
}

/**
 * Create a mock RestreamClient for testing
 */
function createMockClient(): MockRestreamClient {
  let subscribedHandler: RestreamLaunchpadLaunchSubscriptionHandler | null = null;

  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribeBagsLaunches: vi.fn((handler: RestreamLaunchpadLaunchSubscriptionHandler) => {
      subscribedHandler = handler;
      return (): void => {
        subscribedHandler = null;
      };
    }),
    _triggerLaunch: (event: LaunchpadLaunchEvent): void => {
      if (subscribedHandler !== null) {
        subscribedHandler(event, {
          channel: 'test-channel',
          topic: 'test-topic',
          subject: 'test-subject',
        });
      }
    },
    _getSubscribedHandler: (): RestreamLaunchpadLaunchSubscriptionHandler | null => subscribedHandler,
  };
}

/**
 * Create a mock launch event for testing
 */
function createMockLaunchEvent(overrides: Partial<LaunchpadLaunchEvent> = {}): LaunchpadLaunchEvent {
  return {
    mint: 'TestMint123456789',
    creator: 'TestCreator123456789',
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token',
    image: 'https://example.com/image.png',
    ...overrides,
  };
}

describe('RestreamListener', () => {
  let mockClient: MockRestreamClient;
  let listener: RestreamListener;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = createMockClient();
    listener = new RestreamListener(mockClient);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a listener with default config', () => {
      const newListener = new RestreamListener(mockClient);
      expect(newListener.isConnected()).toBe(false);
      expect(newListener.getStatus()).toBe('disconnected');
    });

    it('should accept custom configuration', () => {
      const config = {
        maxReconnectAttempts: 5,
        reconnectBaseDelayMs: 500,
        reconnectMaxDelayMs: 10000,
        eventBufferSize: 50,
      };
      const newListener = new RestreamListener(mockClient, config);
      expect(newListener.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect to the Restream service', async () => {
      await listener.connect();

      expect(vi.mocked(mockClient.connect)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(mockClient.subscribeBagsLaunches)).toHaveBeenCalledTimes(1);
      expect(listener.isConnected()).toBe(true);
      expect(listener.getStatus()).toBe('connected');
    });

    it('should update status to connecting during connection', async () => {
      const statuses: ConnectionStatus[] = [];
      listener.onConnectionStatusChange((status) => {
        statuses.push(status);
      });

      await listener.connect();

      expect(statuses).toContain('connecting');
      expect(statuses).toContain('connected');
    });

    it('should not reconnect if already connected', async () => {
      await listener.connect();
      await listener.connect();

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should not reconnect if currently connecting', async () => {
      // Start a slow connection
      let resolveConnect: (() => void) | undefined;
      mockClient.connect = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          })
      );

      const connectPromise1 = listener.connect();
      const connectPromise2 = listener.connect();

      if (resolveConnect !== undefined) {
        resolveConnect();
      }
      await connectPromise1;
      await connectPromise2;

      expect(vi.mocked(mockClient.connect)).toHaveBeenCalledTimes(1);
    });

    it('should throw ConnectionError on connection failure', async () => {
      // Use a listener with fewer retries for faster test
      const fastFailListener = new RestreamListener(mockClient, {
        maxReconnectAttempts: 2,
        reconnectBaseDelayMs: 10,
      });
      mockClient.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));

      // Start connection and expect it to fail
      const connectPromise = fastFailListener.connect();

      // Advance timers and await the promise together to avoid unhandled rejection
      const [, result] = await Promise.allSettled([
        vi.runAllTimersAsync(),
        connectPromise,
      ]);

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ConnectionError);
      }
      expect(fastFailListener.isConnected()).toBe(false);
      expect(fastFailListener.getStatus()).toBe('disconnected');
    });

    it('should retry connection on failure', async () => {
      let attempts = 0;
      mockClient.connect = vi.fn(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve();
      });

      const connectPromise = listener.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(attempts).toBe(3);
      expect(listener.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from the Restream service', async () => {
      await listener.connect();
      await listener.disconnect();

      expect(vi.mocked(mockClient.disconnect)).toHaveBeenCalledTimes(1);
      expect(listener.isConnected()).toBe(false);
      expect(listener.getStatus()).toBe('disconnected');
    });

    it('should not call disconnect if already disconnected', async () => {
      await listener.disconnect();

      expect(vi.mocked(mockClient.disconnect)).not.toHaveBeenCalled();
    });

    it('should clear event buffer on disconnect', async () => {
      await listener.connect();

      // Simulate connection loss and buffer some events via injectEvent
      listener.handleConnectionLoss();
      listener.injectEvent(createMockLaunchEvent({ mint: 'Mint1' }));
      listener.injectEvent(createMockLaunchEvent({ mint: 'Mint2' }));

      expect(listener.getBufferedEventCount()).toBe(2);

      await listener.disconnect();

      expect(listener.getBufferedEventCount()).toBe(0);
    });

    it('should handle disconnect errors gracefully', async () => {
      await listener.connect();
      mockClient.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));

      await listener.disconnect();

      expect(listener.isConnected()).toBe(false);
    });
  });

  describe('onLaunch', () => {
    it('should subscribe to launch events', async () => {
      await listener.connect();

      const handler = vi.fn();
      listener.onLaunch(handler);

      const event = createMockLaunchEvent();
      mockClient._triggerLaunch(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should return unsubscribe function', async () => {
      await listener.connect();

      const handler = vi.fn();
      const unsubscribe = listener.onLaunch(handler);

      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'First' }));
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'Second' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call multiple handlers', async () => {
      await listener.connect();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      listener.onLaunch(handler1);
      listener.onLaunch(handler2);

      const event = createMockLaunchEvent();
      mockClient._triggerLaunch(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should handle errors in handlers gracefully', async () => {
      await listener.connect();

      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      listener.onLaunch(errorHandler);
      listener.onLaunch(goodHandler);

      const event = createMockLaunchEvent();
      mockClient._triggerLaunch(event);

      // Both handlers should have been called despite the error
      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('onConnectionStatusChange', () => {
    it('should immediately notify of current status', () => {
      const handler = vi.fn();
      listener.onConnectionStatusChange(handler);

      expect(handler).toHaveBeenCalledWith('disconnected');
    });

    it('should notify on status changes', async () => {
      const statuses: ConnectionStatus[] = [];
      listener.onConnectionStatusChange((status) => {
        statuses.push(status);
      });

      await listener.connect();

      expect(statuses).toEqual(['disconnected', 'connecting', 'connected']);
    });

    it('should return unsubscribe function', async () => {
      const handler = vi.fn();
      const unsubscribe = listener.onConnectionStatusChange(handler);

      // Clear initial call
      handler.mockClear();

      unsubscribe();

      await listener.connect();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle errors in handlers gracefully', async () => {
      // First, connect without error handlers
      await listener.connect();

      // Now add handlers that will receive status changes
      const errorHandler = vi.fn(() => {
        throw new Error('Status handler error');
      });
      const goodHandler = vi.fn();

      listener.onConnectionStatusChange(errorHandler);
      listener.onConnectionStatusChange(goodHandler);

      // Clear initial calls (they get 'connected' status immediately)
      errorHandler.mockClear();
      goodHandler.mockClear();

      // Trigger a status change by disconnecting
      await listener.disconnect();

      // Both handlers should have been called despite the error
      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return false when disconnected', () => {
      expect(listener.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      await listener.connect();
      expect(listener.isConnected()).toBe(true);
    });

    it('should return false during reconnection', async () => {
      await listener.connect();
      listener.handleConnectionLoss();
      expect(listener.isConnected()).toBe(false);
    });
  });

  describe('event buffering', () => {
    it('should buffer events during reconnection', async () => {
      await listener.connect();

      const handler = vi.fn();
      listener.onLaunch(handler);

      // Simulate connection loss
      listener.handleConnectionLoss();

      // Events during reconnection should be buffered via injectEvent
      // (since SDK subscription is unsubscribed during reconnection)
      listener.injectEvent(createMockLaunchEvent({ mint: 'BufferedMint1' }));
      listener.injectEvent(createMockLaunchEvent({ mint: 'BufferedMint2' }));

      expect(handler).not.toHaveBeenCalled();
      expect(listener.getBufferedEventCount()).toBe(2);
    });

    it('should flush buffered events on reconnect', async () => {
      await listener.connect();

      const handler = vi.fn();
      listener.onLaunch(handler);

      // Simulate connection loss
      listener.handleConnectionLoss();

      // Buffer some events via injectEvent
      listener.injectEvent(createMockLaunchEvent({ mint: 'BufferedMint1' }));
      listener.injectEvent(createMockLaunchEvent({ mint: 'BufferedMint2' }));

      // Run reconnection
      await vi.runAllTimersAsync();

      expect(handler).toHaveBeenCalledTimes(2);
      expect(listener.getBufferedEventCount()).toBe(0);
    });

    it('should respect buffer size limit', async () => {
      const smallBufferListener = new RestreamListener(mockClient, {
        eventBufferSize: 2,
      });

      await smallBufferListener.connect();

      const handler = vi.fn();
      smallBufferListener.onLaunch(handler);

      // Simulate connection loss
      smallBufferListener.handleConnectionLoss();

      // Buffer more events than the limit via injectEvent
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Oldest' }));
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Middle' }));
      smallBufferListener.injectEvent(createMockLaunchEvent({ mint: 'Newest' }));

      expect(smallBufferListener.getBufferedEventCount()).toBe(2);

      // Run reconnection
      await vi.runAllTimersAsync();

      // Only the most recent events should be flushed
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).not.toHaveBeenCalledWith(
        expect.objectContaining({ mint: 'Oldest' })
      );
    });
  });

  describe('auto-reconnect', () => {
    it('should attempt to reconnect on connection loss', async () => {
      await listener.connect();

      // Clear connect calls from initial connection
      vi.mocked(mockClient.connect).mockClear();

      listener.handleConnectionLoss();

      expect(listener.getStatus()).toBe('reconnecting');

      await vi.runAllTimersAsync();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(listener.isConnected()).toBe(true);
    });

    it('should use exponential backoff for reconnection', async () => {
      const customListener = new RestreamListener(mockClient, {
        reconnectBaseDelayMs: 100,
        maxReconnectAttempts: 3,
      });

      await customListener.connect();

      // Make reconnection fail twice, then succeed
      let attempts = 0;
      mockClient.connect = vi.fn(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve();
      });

      customListener.handleConnectionLoss();

      // First attempt happens immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(1);

      // After first delay (exponential backoff: ~100ms * 2^0 with jitter)
      await vi.advanceTimersByTimeAsync(200);
      expect(attempts).toBeGreaterThanOrEqual(2);

      // After second delay (exponential backoff: ~100ms * 2^1 with jitter)
      await vi.advanceTimersByTimeAsync(400);
      expect(attempts).toBe(3);

      expect(customListener.isConnected()).toBe(true);
    });

    it('should stop reconnecting after max attempts', async () => {
      const customListener = new RestreamListener(mockClient, {
        maxReconnectAttempts: 2,
        reconnectBaseDelayMs: 50,
      });

      await customListener.connect();

      // Make all reconnections fail
      mockClient.connect = vi.fn().mockRejectedValue(new Error('Always fails'));

      customListener.handleConnectionLoss();

      await vi.runAllTimersAsync();

      expect(customListener.getStatus()).toBe('disconnected');
      // 2 attempts (maxReconnectAttempts)
      expect(vi.mocked(mockClient.connect)).toHaveBeenCalledTimes(2);
    });

    it('should abort reconnection on disconnect', async () => {
      await listener.connect();

      // Make reconnection fail so it keeps trying
      mockClient.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));

      listener.handleConnectionLoss();

      // Start first reconnection attempt
      await vi.advanceTimersByTimeAsync(0);

      // Disconnect while reconnecting (during backoff wait)
      const disconnectPromise = listener.disconnect();

      // Run remaining timers to complete the abort
      await vi.runAllTimersAsync();
      await disconnectPromise;

      expect(listener.getStatus()).toBe('disconnected');
    });

    it('should not reconnect if already disconnected', () => {
      listener.handleConnectionLoss();

      // Should not change status if already disconnected
      expect(listener.getStatus()).toBe('disconnected');
      expect(vi.mocked(mockClient.connect)).not.toHaveBeenCalled();
    });
  });

  describe('createRestreamListener', () => {
    it('should create a RestreamListener instance', () => {
      const newListener = createRestreamListener(mockClient);
      expect(newListener).toBeInstanceOf(RestreamListener);
    });

    it('should accept configuration options', () => {
      const config = {
        maxReconnectAttempts: 5,
        eventBufferSize: 50,
      };
      const newListener = createRestreamListener(mockClient, config);
      expect(newListener).toBeInstanceOf(RestreamListener);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      await listener.connect();
      await listener.disconnect();
      await listener.connect();
      await listener.disconnect();
      await listener.connect();

      expect(listener.isConnected()).toBe(true);
    });

    it('should handle events with missing optional fields', async () => {
      await listener.connect();

      const handler = vi.fn();
      listener.onLaunch(handler);

      const minimalEvent: LaunchpadLaunchEvent = {
        mint: 'MinimalMint',
        creator: 'MinimalCreator',
        name: 'Minimal Token',
        symbol: 'MIN',
      };

      mockClient._triggerLaunch(minimalEvent);

      expect(handler).toHaveBeenCalledWith(minimalEvent);
    });

    it('should continue working after handler unsubscribes', async () => {
      await listener.connect();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = listener.onLaunch(handler1);
      listener.onLaunch(handler2);

      // First event
      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'Event1' }));
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Unsubscribe first handler
      unsub1();

      // Second event
      mockClient._triggerLaunch(createMockLaunchEvent({ mint: 'Event2' }));
      expect(handler1).toHaveBeenCalledTimes(1); // Still 1
      expect(handler2).toHaveBeenCalledTimes(2);
    });
  });
});
