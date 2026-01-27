/**
 * Storage layer for position persistence
 *
 * Handles saving and loading positions from ~/.bagsbot/positions.json
 * Automatically creates the directory structure if it doesn't exist.
 *
 * @module positions/storage
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { homedir } from 'os';
import { Position } from '../types/positions.js';
import { logger } from '../utils/logger.js';

/**
 * Gets the path to the positions storage file
 *
 * @returns Path to ~/.bagsbot/positions.json
 */
function getStoragePath(): string {
  return `${homedir()}/.bagsbot/positions.json`;
}

/**
 * Gets the directory path for storage
 *
 * @returns Path to ~/.bagsbot/
 */
function getStorageDir(): string {
  return dirname(getStoragePath());
}

/**
 * Serialize a Position for storage
 * Converts Date objects to ISO strings
 *
 * @param position - Position to serialize
 * @returns Serialized position object
 */
function serializePosition(position: Position): Record<string, unknown> {
  return {
    ...position,
    entryTimestamp: position.entryTimestamp instanceof Date
      ? position.entryTimestamp.toISOString()
      : position.entryTimestamp,
  };
}

/**
 * Deserialize a Position from storage
 * Converts ISO string timestamps back to Date objects
 *
 * @param data - Serialized position object
 * @returns Deserialized Position
 */
function deserializePosition(data: Record<string, unknown>): Position {
  return {
    ...(data as Omit<Position, 'entryTimestamp'>),
    entryTimestamp: new Date(data.entryTimestamp as string),
  };
}

/**
 * Position storage class for persistence layer
 */
export class PositionStorage {
  /**
   * Load all positions from storage
   *
   * @returns Array of positions, or empty array if file doesn't exist
   * @throws Error if storage file is corrupted
   *
   * @example
   * ```typescript
   * const storage = new PositionStorage();
   * const positions = storage.load();
   * ```
   */
  load(): Position[] {
    try {
      const filePath = getStoragePath();
      const fileContent = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent) as Record<string, unknown>[];

      // Validate and deserialize positions
      if (!Array.isArray(data)) {
        throw new Error('Storage file must contain an array of positions');
      }

      const positions = data.map((item) => deserializePosition(item as Record<string, unknown>));

      logger.debug('Loaded positions from storage', {
        count: positions.length,
        filePath,
      });

      return positions;
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error('Failed to parse positions storage file', {
          errorMessage: error.message,
        });
        throw new Error(`Invalid JSON in positions storage: ${error.message}`);
      }

      // File doesn't exist yet - this is normal on first run
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        logger.debug('Positions storage file does not exist yet');
        return [];
      }

      if (error instanceof Error) {
        logger.error('Failed to load positions from storage', {
          errorMessage: error.message,
        });
        throw error;
      }

      throw error;
    }
  }

  /**
   * Save positions to storage
   *
   * Creates the ~/.bagsbot directory if it doesn't exist.
   *
   * @param positions - Positions to save
   * @throws Error if save operation fails
   *
   * @example
   * ```typescript
   * const storage = new PositionStorage();
   * storage.save(positions);
   * ```
   */
  save(positions: Position[]): void {
    try {
      const dirPath = getStorageDir();
      const filePath = getStoragePath();

      // Create directory if it doesn't exist
      mkdirSync(dirPath, { recursive: true });

      // Serialize positions
      const serialized = positions.map((position) => serializePosition(position));

      // Write to file
      writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf-8');

      logger.debug('Saved positions to storage', {
        count: positions.length,
        filePath,
      });
    } catch (error) {
      logger.error('Failed to save positions to storage', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
