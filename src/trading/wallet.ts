/**
 * Wallet management for Solana keypairs and transaction signing
 *
 * Handles loading keypairs from JSON files and signing transactions.
 * Implements strict security practices to prevent sensitive data leakage.
 *
 * @module trading/wallet
 */

import { readFileSync } from 'fs';
import { Keypair, PublicKey, Connection, VersionedTransaction, Transaction } from '@solana/web3.js';
import { logger } from '../utils/logger.js';

/**
 * WalletManager class for handling Solana keypairs and transaction signing
 *
 * @example
 * ```typescript
 * const wallet = new WalletManager();
 * const keypair = wallet.loadWallet('./wallet.json');
 * const balance = await wallet.getBalance(connection);
 * ```
 */
export class WalletManager {
  private keypair: Keypair | null = null;

  /**
   * Load a Solana keypair from a JSON file
   *
   * Expected JSON file format: Array of 64 numbers representing the keypair bytes
   * (This is the standard Solana CLI export format)
   *
   * @param path - Path to the keypair JSON file
   * @returns The loaded Keypair
   * @throws Error if file cannot be read or parsed
   *
   * @example
   * ```typescript
   * const keypair = wallet.loadWallet('/path/to/wallet.json');
   * ```
   */
  loadWallet(path: string): Keypair {
    try {
      const walletData = readFileSync(path, 'utf-8');
      const keypairData = JSON.parse(walletData) as unknown;

      // Validate that it's an array of numbers
      if (!Array.isArray(keypairData) || keypairData.length !== 64) {
        throw new Error('Invalid keypair format. Expected array of 64 numbers.');
      }

      // Validate all elements are numbers
      const keypairDataTyped = keypairData as unknown[];
      if (!keypairDataTyped.every((val: unknown) => typeof val === 'number')) {
        throw new Error('Invalid keypair format. All elements must be numbers.');
      }

      // Create keypair from secret key
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

      // Store the keypair for use in other methods
      this.keypair = keypair;

      // Log successful loading without exposing the keypair
      logger.info('Wallet loaded successfully', {
        publicKey: keypair.publicKey.toString(),
      });

      return keypair;
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error('Failed to parse wallet file as JSON', {
          path,
          errorMessage: error.message,
        });
        throw new Error(`Invalid JSON in wallet file: ${error.message}`);
      }

      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        logger.error('Wallet file not found', { path });
        throw new Error(`Wallet file not found: ${path}`);
      }

      logger.error('Failed to load wallet', {
        path,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get the public key of the loaded wallet
   *
   * @returns The PublicKey of the wallet
   * @throws Error if no wallet is loaded
   *
   * @example
   * ```typescript
   * const publicKey = wallet.getPublicKey();
   * console.log(publicKey.toString());
   * ```
   */
  getPublicKey(): PublicKey {
    if (this.keypair === null) {
      throw new Error('No wallet loaded. Call loadWallet() first.');
    }

    return this.keypair.publicKey;
  }

  /**
   * Get the SOL balance of the loaded wallet
   *
   * @param connection - Solana Connection instance
   * @returns The balance in lamports (1 SOL = 1,000,000,000 lamports)
   * @throws Error if no wallet is loaded or connection fails
   *
   * @example
   * ```typescript
   * const connection = new Connection('https://api.mainnet-beta.solana.com');
   * const balanceLamports = await wallet.getBalance(connection);
   * const balanceSOL = balanceLamports / 1_000_000_000;
   * ```
   */
  async getBalance(connection: Connection): Promise<number> {
    if (this.keypair === null) {
      throw new Error('No wallet loaded. Call loadWallet() first.');
    }

    try {
      const balance = await connection.getBalance(this.keypair.publicKey);
      logger.debug('Retrieved wallet balance', {
        publicKey: this.keypair.publicKey.toString(),
        balance,
      });

      return balance;
    } catch (error) {
      logger.error('Failed to retrieve wallet balance', {
        publicKey: this.keypair.publicKey.toString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Sign a transaction with the loaded wallet keypair
   *
   * Supports both VersionedTransaction (recommended) and legacy Transaction types.
   * The transaction is signed in-place; the method returns the signed transaction.
   *
   * @param transaction - The transaction to sign (VersionedTransaction or Transaction)
   * @returns The signed transaction
   * @throws Error if no wallet is loaded or signing fails
   *
   * @example
   * ```typescript
   * const transaction = new VersionedTransaction(message);
   * const signedTx = wallet.sign(transaction);
   * const signature = await connection.sendTransaction(signedTx);
   * ```
   */
  sign(transaction: VersionedTransaction | Transaction): VersionedTransaction | Transaction {
    if (this.keypair === null) {
      throw new Error('No wallet loaded. Call loadWallet() first.');
    }

    try {
      // Both VersionedTransaction and Transaction have a sign method
      // that accepts Keypair instances
      (transaction as VersionedTransaction).sign([this.keypair]);

      logger.debug('Transaction signed successfully', {
        publicKey: this.keypair.publicKey.toString(),
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to sign transaction', {
        publicKey: this.keypair.publicKey.toString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check if a wallet is currently loaded
   *
   * @returns True if a wallet is loaded, false otherwise
   */
  isLoaded(): boolean {
    return this.keypair !== null;
  }

  /**
   * Clear the loaded wallet from memory
   *
   * This helps with security by removing the keypair from memory when it's no longer needed.
   */
  unload(): void {
    this.keypair = null;
    logger.debug('Wallet unloaded from memory');
  }
}
