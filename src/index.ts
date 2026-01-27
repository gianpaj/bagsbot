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

import { loadConfig } from './config/loader.js';
import { logger } from './utils/logger.js';

/**
 * Main function to start the Bags Sniper Bot
 *
 * Process:
 * 1. Parse command-line arguments
 * 2. Load and validate configuration
 * 3. Initialize Bags SDK and other dependencies
 * 4. Create BagsBot instance
 * 5. Start the bot
 * 6. Handle graceful shutdown on signals
 */
async function main(): Promise<void> {
  // TODO: Parse command-line arguments (if any are needed)
  // For now, we'll just use the default configuration path

  const appLogger = logger.child({ module: 'index' });

  try {
    appLogger.info('Bags Sniper Bot starting...');

    // Load configuration from file and environment
    const config = await loadConfig();
    appLogger.info('Configuration loaded successfully', {
      solanaRpc: config.solanaRpcUrl,
      walletPath: config.walletPath,
    });

    // TODO: Initialize Bags SDK components
    // Note: These would be imported and initialized here
    // For now, this is a placeholder showing the expected structure
    //
    // const restreamClient = new RestreamClient(config.bagsApiKey);
    // const bagsTradeService = new BagsTradeService(config.bagsApiKey);
    // const filterRegistry = createFilterRegistry(config.filters);

    // NOTE: The actual SDK initialization needs to be done here
    // This is a stub that shows where the SDK components would be created
    appLogger.warn(
      'SDK components not yet initialized - this is a stub for testing'
    );

    // In a full implementation, you would initialize the components like this:
    // const bot = createBagsBot({
    //   config,
    //   restreamClient,
    //   bagsTradeService,
    //   filterRegistry,
    // });

    // await bot.initialize();

    // For now, we'll just log that the configuration was loaded
    appLogger.info('Configuration ready, awaiting SDK initialization');

    // Keep the process alive
    await new Promise(() => {
      // Process will exit on SIGINT/SIGTERM
    });
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
