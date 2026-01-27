/**
 * WebSocket-based RestreamClient for real-time token launch events
 *
 * Connects to the Bags Restream WebSocket endpoint to receive
 * live token launch notifications.
 *
 * @module sdk/restream-client
 */

import WebSocket from 'ws';
import type { IRestreamClient, RestreamLaunchpadLaunchSubscriptionHandler, RestreamEventMeta } from '../listeners/restream.js';
import type { LaunchpadLaunchEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';

const restreamLogger = logger.child({ module: 'restream-client' });

/**
 * Default Restream WebSocket endpoint
 */
const DEFAULT_RESTREAM_URL = 'wss://restream.bags.fm/ws';

/**
 * Message types from the Restream WebSocket
 */
interface RestreamMessage {
  type: string;
  channel?: string;
  topic?: string;
  subject?: string;
  data?: LaunchpadLaunchEvent;
}

/**
 * Configuration for the RestreamClient
 */
export interface RestreamClientConfig {
  /** API key for authentication */
  apiKey: string;
  /** WebSocket URL (defaults to wss://restream.bags.fm/ws) */
  wsUrl?: string;
  /** Ping interval in ms (defaults to 30000) */
  pingIntervalMs?: number;
}

/**
 * WebSocket-based client for receiving real-time launch events from Bags Restream
 */
export class RestreamClient implements IRestreamClient {
  private config: Required<RestreamClientConfig>;
  private ws: WebSocket | null = null;
  private launchHandler: RestreamLaunchpadLaunchSubscriptionHandler | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;

  constructor(config: RestreamClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      wsUrl: config.wsUrl ?? DEFAULT_RESTREAM_URL,
      pingIntervalMs: config.pingIntervalMs ?? 30000,
    };
  }

  /**
   * Connect to the Restream WebSocket endpoint
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.ws !== null) {
      restreamLogger.debug('Already connected to Restream');
      return;
    }

    return new Promise((resolve, reject) => {
      restreamLogger.info('Connecting to Restream', { url: this.config.wsUrl });

      const wsUrl = new URL(this.config.wsUrl);
      wsUrl.searchParams.set('apiKey', this.config.apiKey);

      this.ws = new WebSocket(wsUrl.toString());

      this.ws.on('open', () => {
        restreamLogger.info('Connected to Restream');
        this.isConnected = true;

        // Start ping interval to keep connection alive
        this.startPingInterval();

        // Subscribe to launch events
        this.subscribeToBagsLaunchesInternal();

        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        restreamLogger.error('WebSocket error', { error: error.message });
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        restreamLogger.warn('WebSocket closed', {
          code,
          reason: reason.toString(),
        });
        this.isConnected = false;
        this.stopPingInterval();
      });
    });
  }

  /**
   * Disconnect from the Restream WebSocket
   */
  async disconnect(): Promise<void> {
    if (this.ws === null) {
      return;
    }

    restreamLogger.info('Disconnecting from Restream');
    this.stopPingInterval();

    return new Promise((resolve) => {
      if (this.ws === null) {
        resolve();
        return;
      }

      this.ws.on('close', () => {
        this.ws = null;
        this.isConnected = false;
        resolve();
      });

      this.ws.close(1000, 'Client disconnect');
    });
  }

  /**
   * Subscribe to Bags launch events
   *
   * @param handler - Callback function to handle launch events
   * @returns Unsubscribe function
   */
  subscribeBagsLaunches(handler: RestreamLaunchpadLaunchSubscriptionHandler): () => void {
    this.launchHandler = handler;
    restreamLogger.debug('Launch handler registered');

    // Return unsubscribe function
    return (): void => {
      this.launchHandler = null;
      restreamLogger.debug('Launch handler unregistered');
    };
  }

  /**
   * Check if connected to Restream
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Send subscription message to server
   */
  private subscribeToBagsLaunchesInternal(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      restreamLogger.warn('Cannot subscribe - WebSocket not open');
      return;
    }

    const subscribeMessage = JSON.stringify({
      type: 'subscribe',
      channel: 'launchpad',
      topic: 'launches',
    });

    this.ws.send(subscribeMessage);
    restreamLogger.debug('Subscribed to launchpad launches');
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as RestreamMessage;

      if (message.type === 'launch' && message.data !== undefined) {
        const meta: RestreamEventMeta = {
          channel: message.channel ?? 'launchpad',
          topic: message.topic ?? 'launches',
          subject: message.subject ?? 'launch',
        };

        restreamLogger.debug('Received launch event', {
          mint: message.data.mint,
          name: message.data.name,
        });

        if (this.launchHandler !== null) {
          this.launchHandler(message.data, meta);
        }
      } else if (message.type === 'pong') {
        restreamLogger.debug('Received pong');
      } else if (message.type === 'subscribed') {
        restreamLogger.info('Subscription confirmed', {
          channel: message.channel,
          topic: message.topic,
        });
      }
    } catch (error) {
      restreamLogger.error('Failed to parse WebSocket message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start the ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        restreamLogger.debug('Sent ping');
      }
    }, this.config.pingIntervalMs);
  }

  /**
   * Stop the ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

/**
 * Create a new RestreamClient instance
 */
export function createRestreamClient(config: RestreamClientConfig): IRestreamClient {
  return new RestreamClient(config);
}
