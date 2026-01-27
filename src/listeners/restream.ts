/**
 * Restream listener for real-time token launch events from Bags platform
 *
 * Provides connectivity to the Bags Restream service with automatic reconnection,
 * event buffering during disconnection, and connection status monitoring.
 *
 * @module listeners/restream
 */

import type { LaunchpadLaunchEvent } from '../types/index.js';
import { ConnectionError } from '../errors/index.js';
import { retry, RetryAbortedError, sleep } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/**
 * Connection status for the Restream listener
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Handler for launch events from the Bags Restream
 */
export type LaunchEventHandler = (event: LaunchpadLaunchEvent) => void;

/**
 * Handler for connection status changes
 */
export type ConnectionStatusHandler = (status: ConnectionStatus) => void;

/**
 * Metadata included with launch events from the SDK
 */
export interface RestreamEventMeta {
  channel: string;
  topic: string;
  subject: string;
}

/**
 * SDK handler type for launch subscriptions
 */
export type RestreamLaunchpadLaunchSubscriptionHandler = (
  launchData: LaunchpadLaunchEvent,
  meta: RestreamEventMeta
) => void;

/**
 * Interface for the Bags SDK RestreamClient
 * This interface defines the expected API from @bagsfm/bags-sdk
 */
export interface IRestreamClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribeBagsLaunches(handler: RestreamLaunchpadLaunchSubscriptionHandler): () => void;
}

/**
 * Configuration options for the RestreamListener
 */
export interface RestreamListenerConfig {
  /**
   * Maximum number of reconnection attempts before giving up
   * @default 10
   */
  maxReconnectAttempts?: number;

  /**
   * Base delay in milliseconds for reconnection backoff
   * @default 1000
   */
  reconnectBaseDelayMs?: number;

  /**
   * Maximum delay in milliseconds between reconnection attempts
   * @default 30000
   */
  reconnectMaxDelayMs?: number;

  /**
   * Maximum number of events to buffer during disconnection
   * @default 100
   */
  eventBufferSize?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<RestreamListenerConfig> = {
  maxReconnectAttempts: 10,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 30000,
  eventBufferSize: 100,
};

/**
 * RestreamListener class for connecting to Bags real-time launch events
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Event buffering during reconnection
 * - Connection status monitoring
 * - Graceful disconnect
 *
 * @example
 * ```typescript
 * import { RestreamClient } from '@bagsfm/bags-sdk';
 * import { RestreamListener } from './listeners/restream.js';
 *
 * const client = new RestreamClient();
 * const listener = new RestreamListener(client);
 *
 * // Subscribe to connection status changes
 * const unsubStatus = listener.onConnectionStatusChange((status) => {
 *   console.log(`Connection status: ${status}`);
 * });
 *
 * // Subscribe to launch events
 * const unsubLaunch = listener.onLaunch((event) => {
 *   console.log(`New launch: ${event.mint}`);
 * });
 *
 * // Connect to the stream
 * await listener.connect();
 *
 * // Later, disconnect
 * await listener.disconnect();
 * unsubStatus();
 * unsubLaunch();
 * ```
 */
export class RestreamListener {
  private client: IRestreamClient;
  private config: Required<RestreamListenerConfig>;
  private status: ConnectionStatus = 'disconnected';
  private launchHandlers = new Set<LaunchEventHandler>();
  private statusHandlers = new Set<ConnectionStatusHandler>();
  private eventBuffer: LaunchpadLaunchEvent[] = [];
  private sdkUnsubscribe: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private reconnectPromise: Promise<void> | null = null;

  /**
   * Creates a new RestreamListener instance
   *
   * @param client - The Bags SDK RestreamClient instance
   * @param config - Optional configuration options
   */
  constructor(client: IRestreamClient, config: RestreamListenerConfig = {}) {
    this.client = client;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Connect to the Bags Restream service
   *
   * @throws ConnectionError if connection fails after all retry attempts
   */
  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      logger.debug('Already connected or connecting, skipping connect call');
      return;
    }

    this.abortController = new AbortController();
    this.setStatus('connecting');

    try {
      await this.performConnect();
      this.subscribeToLaunches();
      this.setStatus('connected');
      this.flushEventBuffer();
      logger.info('Connected to Bags Restream');
    } catch (error) {
      this.setStatus('disconnected');
      if (error instanceof RetryAbortedError) {
        logger.info('Connection attempt aborted');
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to connect to Bags Restream', { error: message });
      throw new ConnectionError(`Failed to connect to Bags Restream: ${message}`);
    }
  }

  /**
   * Disconnect from the Bags Restream service gracefully
   */
  async disconnect(): Promise<void> {
    if (this.status === 'disconnected') {
      logger.debug('Already disconnected, skipping disconnect call');
      return;
    }

    // Abort any ongoing reconnection attempts
    if (this.abortController !== null) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Wait for any ongoing reconnection to complete
    if (this.reconnectPromise !== null) {
      try {
        await this.reconnectPromise;
      } catch {
        // Ignore errors from aborted reconnection
      }
      this.reconnectPromise = null;
    }

    // Unsubscribe from SDK events
    if (this.sdkUnsubscribe !== null) {
      this.sdkUnsubscribe();
      this.sdkUnsubscribe = null;
    }

    try {
      await this.client.disconnect();
      logger.info('Disconnected from Bags Restream');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Error during disconnect', { error: message });
    }

    this.setStatus('disconnected');
    this.eventBuffer = [];
  }

  /**
   * Subscribe to launch events
   *
   * @param handler - Callback function invoked when a new token launch is detected
   * @returns Unsubscribe function to remove the handler
   */
  onLaunch(handler: LaunchEventHandler): () => void {
    this.launchHandlers.add(handler);
    logger.debug('Launch handler registered', { handlerCount: this.launchHandlers.size });

    return () => {
      this.launchHandlers.delete(handler);
      logger.debug('Launch handler unregistered', { handlerCount: this.launchHandlers.size });
    };
  }

  /**
   * Subscribe to connection status changes
   *
   * @param handler - Callback function invoked when connection status changes
   * @returns Unsubscribe function to remove the handler
   */
  onConnectionStatusChange(handler: ConnectionStatusHandler): () => void {
    this.statusHandlers.add(handler);
    // Immediately notify of current status (catch errors to continue)
    try {
      handler(this.status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in status change handler during registration', { error: message });
    }

    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  /**
   * Check if the listener is currently connected
   *
   * @returns True if connected to the Restream service
   */
  isConnected(): boolean {
    return this.status === 'connected';
  }

  /**
   * Get the current connection status
   *
   * @returns Current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get the number of buffered events
   *
   * @returns Number of events in the buffer
   */
  getBufferedEventCount(): number {
    return this.eventBuffer.length;
  }

  /**
   * Manually inject a launch event into the listener
   *
   * This is useful for testing or when events come from alternative sources.
   * The event will be buffered if not connected, or emitted immediately if connected.
   *
   * @param event - The launch event to inject
   */
  injectEvent(event: LaunchpadLaunchEvent): void {
    this.handleLaunchEvent(event);
  }

  /**
   * Perform the actual connection with retry logic
   */
  private async performConnect(): Promise<void> {
    const retryOptions: Parameters<typeof retry>[1] = {
      maxRetries: this.config.maxReconnectAttempts,
      baseDelayMs: this.config.reconnectBaseDelayMs,
      maxDelayMs: this.config.reconnectMaxDelayMs,
      onRetry: (attempt, error, delayMs) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Connection attempt failed, retrying', {
          attempt,
          delayMs,
          error: message,
        });
      },
    };

    if (this.abortController !== null) {
      retryOptions.signal = this.abortController.signal;
    }

    await retry(() => this.client.connect(), retryOptions);
  }

  /**
   * Subscribe to launch events from the SDK client
   */
  private subscribeToLaunches(): void {
    const handler: RestreamLaunchpadLaunchSubscriptionHandler = (
      launchData: LaunchpadLaunchEvent,
      meta: RestreamEventMeta
    ) => {
      logger.debug('Received launch event', {
        mint: launchData.mint,
        name: launchData.name,
        channel: meta.channel,
      });
      this.handleLaunchEvent(launchData);
    };

    this.sdkUnsubscribe = this.client.subscribeBagsLaunches(handler);
  }

  /**
   * Handle an incoming launch event
   */
  private handleLaunchEvent(event: LaunchpadLaunchEvent): void {
    if (this.status !== 'connected') {
      // Buffer events during reconnection
      this.bufferEvent(event);
      return;
    }

    this.emitLaunchEvent(event);
  }

  /**
   * Buffer an event during reconnection
   */
  private bufferEvent(event: LaunchpadLaunchEvent): void {
    if (this.eventBuffer.length >= this.config.eventBufferSize) {
      // Remove oldest event to make room
      this.eventBuffer.shift();
      logger.warn('Event buffer full, dropping oldest event');
    }
    this.eventBuffer.push(event);
    logger.debug('Buffered launch event', {
      mint: event.mint,
      bufferSize: this.eventBuffer.length,
    });
  }

  /**
   * Flush buffered events to handlers
   */
  private flushEventBuffer(): void {
    if (this.eventBuffer.length === 0) {
      return;
    }

    logger.info('Flushing buffered events', { count: this.eventBuffer.length });
    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    for (const event of events) {
      this.emitLaunchEvent(event);
    }
  }

  /**
   * Emit a launch event to all registered handlers
   */
  private emitLaunchEvent(event: LaunchpadLaunchEvent): void {
    for (const handler of this.launchHandlers) {
      try {
        handler(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error in launch event handler', { error: message, mint: event.mint });
      }
    }
  }

  /**
   * Set the connection status and notify handlers
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) {
      return;
    }

    const previousStatus = this.status;
    this.status = status;
    logger.debug('Connection status changed', { from: previousStatus, to: status });

    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error in status change handler', { error: message });
      }
    }
  }

  /**
   * Handle connection loss and initiate reconnection
   *
   * This method should be called when the underlying connection is lost
   */
  handleConnectionLoss(): void {
    if (this.status === 'disconnected') {
      return;
    }

    logger.warn('Connection lost, initiating reconnection');
    this.setStatus('reconnecting');

    // Unsubscribe from current SDK subscription
    if (this.sdkUnsubscribe !== null) {
      this.sdkUnsubscribe();
      this.sdkUnsubscribe = null;
    }

    // Start reconnection in background
    this.reconnectPromise = this.reconnect();
  }

  /**
   * Perform reconnection with exponential backoff
   */
  private async reconnect(): Promise<void> {
    this.abortController ??= new AbortController();

    let attempt = 0;
    const maxAttempts = this.config.maxReconnectAttempts;

    while (attempt < maxAttempts) {
      // Check if we should abort
      if (this.abortController.signal.aborted) {
        logger.info('Reconnection aborted');
        return;
      }

      attempt++;
      logger.info('Attempting to reconnect', { attempt, maxAttempts });

      try {
        await this.client.connect();
        this.subscribeToLaunches();
        this.setStatus('connected');
        this.flushEventBuffer();
        logger.info('Reconnected to Bags Restream');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Reconnection attempt failed', { attempt, error: message });

        if (attempt < maxAttempts) {
          // Calculate backoff delay
          const baseDelay = this.config.reconnectBaseDelayMs;
          const maxDelay = this.config.reconnectMaxDelayMs;
          const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
          const cappedDelay = Math.min(exponentialDelay, maxDelay);
          const jitteredDelay = cappedDelay * (0.5 + Math.random() * 0.5);

          logger.debug('Waiting before next reconnection attempt', { delayMs: Math.round(jitteredDelay) });

          try {
            await sleep(jitteredDelay, this.abortController.signal);
          } catch (sleepError) {
            if (sleepError instanceof RetryAbortedError) {
              logger.info('Reconnection aborted during sleep');
              return;
            }
            throw sleepError;
          }
        }
      }
    }

    // All reconnection attempts failed
    logger.error('All reconnection attempts exhausted', { attempts: maxAttempts });
    this.setStatus('disconnected');
  }
}

/**
 * Factory function to create a RestreamListener with default SDK client
 *
 * Note: This requires the RestreamClient to be available from @bagsfm/bags-sdk.
 * If RestreamClient is not exported, use the RestreamListener constructor directly
 * with a custom client implementation.
 *
 * @param config - Optional configuration options
 * @returns RestreamListener instance
 */
export function createRestreamListener(
  client: IRestreamClient,
  config?: RestreamListenerConfig
): RestreamListener {
  return new RestreamListener(client, config);
}
