/**
 * Bags Sniper Bot
 *
 * A CLI bot for monitoring Solana token launches on the Bags platform.
 * This is the main entry point for the application.
 *
 * Entry point that initializes the bot with all required components and starts monitoring.
 * Handles command-line arguments and graceful shutdown.
 *
 * @module index
 */

import { Connection, Keypair } from '@solana/web3.js';
import { BagsSDK } from '@bagsfm/bags-sdk';
import { loadConfig } from './config/loader.js';
import { logger } from './utils/logger.js';
import { createBagsBot } from './bot.js';
import {
  createBagsSDK,
  createTradeServiceAdapter,
  createLaunchSourceRuntime,
  createFilterRegistry,
  fetchRecentLaunches,
  resolveSeedRecentHours,
} from './sdk/index.js';
import { WalletManager } from './trading/wallet.js';
import { createPaperTradeService } from './trading/paper-trade-service.js';

const appLogger = logger.child({ module: 'index' });

/**
 * Main function to start the Bags Sniper Bot
 *
 * Process:
 * 1. Load and validate configuration
 * 2. Initialize Solana connection
 * 3. Load wallet keypair
 * 4. Initialize Bags SDK and components
 * 5. Create filter registry
 * 6. Create and start BagsBot
 * 7. Handle graceful shutdown on signals
 */
async function main(): Promise<void> {
  try {
    appLogger.info('Bags Sniper Bot starting...');

    // Load configuration from file and environment
    const config = await loadConfig();
    appLogger.info('Configuration loaded successfully', {
      solanaRpc: config.solanaRpcUrl,
      walletPath: config.walletPath,
      maxOpenPositions: config.maxOpenPositions,
      maxPositionPercent: config.maxPositionPercent,
    });

    // Initialize Solana connection
    const connection = new Connection(config.solanaRpcUrl, 'confirmed');
    appLogger.info('Solana connection established');

    // Load wallet to get public key for SDK initialization
    const walletManager = new WalletManager();
    let walletPublicKey: Keypair['publicKey'];
    try {
      walletManager.loadWallet(config.walletPath);
      walletPublicKey = walletManager.getPublicKey();
      appLogger.info('Wallet loaded', {
        publicKey: walletPublicKey.toBase58(),
      });
    } catch (error) {
      appLogger.error('Failed to load wallet', {
        path: config.walletPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to load wallet from ${config.walletPath}. Please ensure the file exists and contains a valid keypair.`
      );
    }

    // Initialize Bags SDK
    // Create launch source for live or scenario launch events
    const launchSource = createLaunchSourceRuntime(config);
    appLogger.info('Launch source created', {
      type: config.launchSource.type,
      description: launchSource.description,
    });

    let bagsSDK: BagsSDK | null = null;
    if (
      launchSource.tradeService === undefined ||
      launchSource.filterServiceOverrides === undefined
    ) {
      appLogger.info('Initializing Bags SDK...');
      bagsSDK = createBagsSDK(config.bagsApiKey, connection);
    }

    let bagsTradeService =
      launchSource.tradeService ??
      createTradeServiceAdapter(bagsSDK as BagsSDK, walletPublicKey, connection);

    // Paper-mainnet: wrap the live trade service so quotes/prices are real but
    // fills are simulated (no signing, no SOL spent).
    if (launchSource.paperMainnet === true) {
      bagsTradeService = createPaperTradeService(bagsTradeService);
      appLogger.info('Paper-mainnet mode: trades will be simulated against live prices');
    }
    appLogger.info('Trade service initialized');

    // Create filter registry with all filters
    const filterRegistry = createFilterRegistry(
      config,
      bagsSDK ?? ({} as BagsSDK),
      launchSource.filterServiceOverrides
    );
    appLogger.info('Filter registry created');

    // Create the bot instance
    const botConfig = {
      config,
      restreamClient: launchSource.restreamClient,
      bagsTradeService,
      filterRegistry,
      ...(launchSource.simulationEngine !== undefined
        ? { simulationEngine: launchSource.simulationEngine }
        : {}),
      ...(launchSource.paperMainnet === true ? { paperMainnet: true } : {}),
    };
    const bot = createBagsBot(botConfig);
    appLogger.info('BagsBot instance created');

    // Initialize and start the bot
    appLogger.info('Starting bot...');
    await bot.initialize();
    appLogger.info('Bot initialized and running');

    // Optionally seed recently launched tokens (from the Jupiter data API) so
    // the bot has something to evaluate immediately instead of waiting for
    // brand-new live launches. Skipped for scenario mode, which uses synthetic
    // launches and has no live market for the seeded tokens.
    const seedRecentHours = resolveSeedRecentHours(process.argv.slice(2), process.env);
    if (seedRecentHours !== null) {
      if (config.launchSource.type === 'scenario') {
        appLogger.warn('Recent-launch seeding is not supported in scenario mode; skipping', {
          seedRecentHours,
        });
      } else {
        appLogger.info('Seeding recently launched tokens', { withinHours: seedRecentHours });
        try {
          const recentLaunches = await fetchRecentLaunches(seedRecentHours);
          const listener = bot.getRestreamListener();
          for (const event of recentLaunches) {
            listener.injectEvent(event);
          }
          appLogger.info('Seeded recently launched tokens', {
            count: recentLaunches.length,
            withinHours: seedRecentHours,
          });
        } catch (error) {
          appLogger.error('Failed to seed recently launched tokens', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Log startup summary
    appLogger.info('='.repeat(50));
    appLogger.info('Bags Sniper Bot is now running');
    appLogger.info('Monitoring for new token launches...');
    appLogger.info('Press Ctrl+C to exit');
    appLogger.info('='.repeat(50));

    // Keep the process alive - the bot will handle its own lifecycle
    // and signal handlers are set up in the BagsBot class
    await new Promise<void>((resolve) => {
      // The bot sets up its own signal handlers, but we also
      // listen here to ensure the promise resolves on shutdown
      const handleShutdown = (): void => {
        appLogger.info('Shutdown signal received in main');
        resolve();
      };

      process.once('SIGINT', handleShutdown);
      process.once('SIGTERM', handleShutdown);
    });

    appLogger.info('Main process exiting');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appLogger.error('Fatal error starting bot', { error: message });
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Uncaught error:', message);
  process.exit(1);
});
