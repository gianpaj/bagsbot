/**
 * Mock implementations for Bags SDK services
 *
 * These mocks are used for testing without requiring actual SDK connections
 * or API keys. They provide configurable behavior for testing various scenarios.
 *
 * @module tests/mocks/bags-sdk
 */

import { vi, type Mock } from 'vitest';
import type { PublicKey, Connection, VersionedTransaction } from '@solana/web3.js';
import type { IRestreamClient, RestreamLaunchpadLaunchSubscriptionHandler } from '../../src/listeners/restream.js';
import type { IBagsTradeService } from '../../src/trading/executor.js';
import type { LaunchpadLaunchEvent } from '../../src/types/index.js';

/**
 * Extended mock RestreamClient with test helper methods
 */
export interface MockRestreamClient extends IRestreamClient {
  /** Trigger a launch event for testing */
  _triggerLaunch: (event: LaunchpadLaunchEvent) => void;
  /** Get the currently subscribed handler */
  _getSubscribedHandler: () => RestreamLaunchpadLaunchSubscriptionHandler | null;
  /** Simulate a connection error */
  _simulateConnectionError: () => void;
  /** Simulate connection recovery */
  _simulateConnectionRecovery: () => void;
  /** Check if currently connected */
  _isConnected: () => boolean;
}

/**
 * Configuration for MockRestreamClient behavior
 */
export interface MockRestreamClientConfig {
  /** Delay in ms before connect resolves (default: 0) */
  connectDelayMs?: number;
  /** Whether connect should fail initially (default: false) */
  connectShouldFail?: boolean;
  /** Number of times connect should fail before succeeding (default: 0) */
  connectFailCount?: number;
  /** Error message when connect fails */
  connectErrorMessage?: string;
}

/**
 * Creates a mock RestreamClient for testing
 *
 * @param config - Configuration options for mock behavior
 * @returns A mock RestreamClient with test helper methods
 *
 * @example
 * ```typescript
 * const mockClient = createMockRestreamClient();
 * const listener = new RestreamListener(mockClient);
 * await listener.connect();
 *
 * // Trigger a test event
 * mockClient._triggerLaunch(createMockLaunchEvent());
 * ```
 */
export function createMockRestreamClient(config: MockRestreamClientConfig = {}): MockRestreamClient {
  const {
    connectDelayMs = 0,
    connectShouldFail = false,
    connectFailCount = 0,
    connectErrorMessage = 'Connection failed',
  } = config;

  let subscribedHandler: RestreamLaunchpadLaunchSubscriptionHandler | null = null;
  let connected = false;
  let failuresRemaining = connectFailCount;

  const mockClient: MockRestreamClient = {
    connect: vi.fn(async () => {
      if (connectDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, connectDelayMs));
      }

      if (connectShouldFail || failuresRemaining > 0) {
        if (failuresRemaining > 0) {
          failuresRemaining--;
        }
        throw new Error(connectErrorMessage);
      }

      connected = true;
    }),

    disconnect: vi.fn(async () => {
      connected = false;
      subscribedHandler = null;
    }),

    subscribeBagsLaunches: vi.fn((handler: RestreamLaunchpadLaunchSubscriptionHandler) => {
      subscribedHandler = handler;
      return (): void => {
        subscribedHandler = null;
      };
    }),

    _triggerLaunch: (event: LaunchpadLaunchEvent): void => {
      if (subscribedHandler !== null && connected) {
        subscribedHandler(event, {
          channel: 'bags-launchpad',
          topic: 'launches',
          subject: 'new-launch',
        });
      }
    },

    _getSubscribedHandler: (): RestreamLaunchpadLaunchSubscriptionHandler | null => subscribedHandler,

    _simulateConnectionError: (): void => {
      connected = false;
    },

    _simulateConnectionRecovery: (): void => {
      connected = true;
    },

    _isConnected: (): boolean => connected,
  };

  return mockClient;
}

/**
 * Extended mock TradeService with test helper methods
 */
export interface MockTradeService extends IBagsTradeService {
  /** Configure the mock quote response */
  _setQuoteResponse: (response: MockQuoteResponse | null) => void;
  /** Configure the mock to fail quote requests */
  _setQuoteError: (error: Error | null) => void;
  /** Configure the mock swap response */
  _setSwapResponse: (response: VersionedTransaction | null) => void;
  /** Configure the mock to fail swap preparation */
  _setSwapError: (error: Error | null) => void;
  /** Configure the mock transaction result */
  _setTransactionResult: (signature: string | null) => void;
  /** Configure the mock to fail transaction submission */
  _setTransactionError: (error: Error | null) => void;
  /** Get the number of times getQuote was called */
  _getQuoteCallCount: () => number;
  /** Get the number of times prepareSwap was called */
  _getSwapCallCount: () => number;
  /** Get the number of times sendAndConfirmTransaction was called */
  _getTransactionCallCount: () => number;
  /** Reset all call counts and error states */
  _reset: () => void;
}

/**
 * Mock quote response structure
 */
export interface MockQuoteResponse {
  inputAmount: number;
  expectedOutput: number;
  priceImpact: number;
  route: string;
}

/**
 * Configuration for MockTradeService behavior
 */
export interface MockTradeServiceConfig {
  /** Default quote response */
  defaultQuote?: MockQuoteResponse;
  /** Default transaction signature */
  defaultSignature?: string;
  /** Delay before operations complete */
  operationDelayMs?: number;
}

/**
 * Creates a mock TradeService for testing
 *
 * @param config - Configuration options for mock behavior
 * @returns A mock TradeService with test helper methods
 *
 * @example
 * ```typescript
 * const mockService = createMockTradeService();
 * mockService._setQuoteResponse({
 *   inputAmount: 500000000,
 *   expectedOutput: 1000,
 *   priceImpact: 0.02,
 *   route: 'Raydium',
 * });
 *
 * const executor = new TradeExecutor(mockService, wallet, connection);
 * const quote = await executor.getQuote(mint, 0.5);
 * ```
 */
export function createMockTradeService(config: MockTradeServiceConfig = {}): MockTradeService {
  const {
    defaultQuote = {
      inputAmount: 500_000_000,
      expectedOutput: 1000,
      priceImpact: 0.02,
      route: 'Raydium',
    },
    defaultSignature = 'mock-signature-abc123',
    operationDelayMs = 0,
  } = config;

  let quoteResponse: MockQuoteResponse | null = defaultQuote;
  let quoteError: Error | null = null;
  let swapResponse: VersionedTransaction | null = {} as VersionedTransaction;
  let swapError: Error | null = null;
  let transactionResult: string | null = defaultSignature;
  let transactionError: Error | null = null;
  let quoteCallCount = 0;
  let swapCallCount = 0;
  let transactionCallCount = 0;

  const delay = async (): Promise<void> => {
    if (operationDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, operationDelayMs));
    }
  };

  const mockService: MockTradeService = {
    getQuote: vi.fn(async (
      _inputMint: PublicKey | string,
      _outputMint: PublicKey | string,
      _amount: number
    ) => {
      quoteCallCount++;
      await delay();

      if (quoteError !== null) {
        throw quoteError;
      }

      if (quoteResponse === null) {
        throw new Error('Quote not available');
      }

      return quoteResponse;
    }) as Mock,

    prepareSwap: vi.fn(async (
      _inputMint: PublicKey | string,
      _outputMint: PublicKey | string,
      _amount: number,
      _slippageBps: number,
      _priorityFeeLamports: number
    ) => {
      swapCallCount++;
      await delay();

      if (swapError !== null) {
        throw swapError;
      }

      if (swapResponse === null) {
        throw new Error('Swap preparation failed');
      }

      return swapResponse;
    }) as Mock,

    sendAndConfirmTransaction: vi.fn(async (
      _transaction: VersionedTransaction,
      _connection: Connection
    ) => {
      transactionCallCount++;
      await delay();

      if (transactionError !== null) {
        throw transactionError;
      }

      if (transactionResult === null) {
        throw new Error('Transaction failed');
      }

      return transactionResult;
    }) as Mock,

    _setQuoteResponse: (response: MockQuoteResponse | null): void => {
      quoteResponse = response;
    },

    _setQuoteError: (error: Error | null): void => {
      quoteError = error;
    },

    _setSwapResponse: (response: VersionedTransaction | null): void => {
      swapResponse = response;
    },

    _setSwapError: (error: Error | null): void => {
      swapError = error;
    },

    _setTransactionResult: (signature: string | null): void => {
      transactionResult = signature;
    },

    _setTransactionError: (error: Error | null): void => {
      transactionError = error;
    },

    _getQuoteCallCount: (): number => quoteCallCount,

    _getSwapCallCount: (): number => swapCallCount,

    _getTransactionCallCount: (): number => transactionCallCount,

    _reset: (): void => {
      quoteResponse = defaultQuote;
      quoteError = null;
      swapResponse = {} as VersionedTransaction;
      swapError = null;
      transactionResult = defaultSignature;
      transactionError = null;
      quoteCallCount = 0;
      swapCallCount = 0;
      transactionCallCount = 0;
      vi.mocked(mockService.getQuote).mockClear();
      vi.mocked(mockService.prepareSwap).mockClear();
      vi.mocked(mockService.sendAndConfirmTransaction).mockClear();
    },
  };

  return mockService;
}

/**
 * Mock StateService interface (placeholder for future SDK integration)
 */
export interface MockStateService {
  /** Get current price for a token */
  getPrice: (mint: string) => Promise<number | null>;
  /** Get token metadata */
  getTokenMetadata: (mint: string) => Promise<TokenMetadata | null>;
  /** Configure mock price responses */
  _setPrice: (mint: string, price: number | null) => void;
  /** Configure mock metadata responses */
  _setTokenMetadata: (mint: string, metadata: TokenMetadata | null) => void;
  /** Clear all configured responses */
  _reset: () => void;
}

/**
 * Token metadata structure
 */
export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: number;
}

/**
 * Creates a mock StateService for testing
 *
 * @returns A mock StateService with test helper methods
 *
 * @example
 * ```typescript
 * const mockState = createMockStateService();
 * mockState._setPrice('TokenMint123', 0.00001);
 *
 * const price = await mockState.getPrice('TokenMint123');
 * console.log(price); // 0.00001
 * ```
 */
export function createMockStateService(): MockStateService {
  const prices = new Map<string, number | null>();
  const metadata = new Map<string, TokenMetadata | null>();

  return {
    getPrice: vi.fn(async (mint: string) => {
      return prices.get(mint) ?? null;
    }),

    getTokenMetadata: vi.fn(async (mint: string) => {
      return metadata.get(mint) ?? null;
    }),

    _setPrice: (mint: string, price: number | null): void => {
      prices.set(mint, price);
    },

    _setTokenMetadata: (mint: string, meta: TokenMetadata | null): void => {
      metadata.set(mint, meta);
    },

    _reset: (): void => {
      prices.clear();
      metadata.clear();
    },
  };
}
