/**
 * Alert system for managing token opportunities
 *
 * The AlertSystem class manages a queue of token launch opportunities,
 * allowing users to review, confirm, or reject trading opportunities.
 *
 * Features:
 * - FIFO queue management of opportunities
 * - Automatic expiration of opportunities after a configurable timeout
 * - Tracking of opportunity status (pending, confirmed, rejected, expired)
 * - Historical record of all opportunities
 */

import type { LaunchpadLaunchEvent } from '../types/launch.js';
import type { FilterPipelineResult } from '../types/filters.js';

/**
 * Represents a trading opportunity from a filtered launch
 */
export interface Opportunity {
  /** Unique identifier for the opportunity */
  id: string;
  /** The launch event that triggered this opportunity */
  launch: LaunchpadLaunchEvent;
  /** The result of the filter pipeline evaluation */
  filterResult: FilterPipelineResult;
  /** Suggested amount to trade (in SOL or base token) */
  suggestedAmount: number;
  /** Optional prepared transaction ready for execution */
  preparedTx?: unknown; // VersionedTransaction type would go here
  /** When this opportunity was created */
  timestamp: Date;
  /** Current status of this opportunity */
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  /** When the opportunity expires (if not confirmed/rejected) */
  expiresAt?: Date;
}

/**
 * Configuration for the alert system
 */
export interface AlertSystemConfig {
  /** Timeout in milliseconds before an opportunity expires (default: 60000 = 60s) */
  opportunityTimeoutMs?: number;
  /** Maximum number of opportunities to keep in history (default: 1000) */
  maxHistorySize?: number;
}

/**
 * Alert system for managing token trading opportunities
 *
 * Implements a queue-based system for presenting opportunities to users,
 * tracking their acceptance/rejection, and maintaining history.
 */
export class AlertSystem {
  /** Queue of pending opportunities */
  private opportunityQueue: Opportunity[] = [];

  /** Historical record of all opportunities */
  private history: Opportunity[] = [];

  /** Map of opportunity IDs to their timeout handlers */
  private expirationTimers = new Map<string, NodeJS.Timeout>();

  /** Configuration for the alert system */
  private config: Required<AlertSystemConfig>;

  /**
   * Create a new AlertSystem instance
   * @param config Optional configuration for the alert system
   */
  constructor(config?: AlertSystemConfig) {
    this.config = {
      opportunityTimeoutMs: config?.opportunityTimeoutMs ?? 60000,
      maxHistorySize: config?.maxHistorySize ?? 1000,
    };
  }

  /**
   * Add an opportunity to the queue
   * @param opportunity The opportunity to queue
   */
  queue(opportunity: Opportunity): void {
    // Set the opportunity status and timestamp
    opportunity.status = 'pending';
    opportunity.timestamp = new Date();

    // Calculate expiration time
    opportunity.expiresAt = new Date(
      Date.now() + this.config.opportunityTimeoutMs
    );

    // Add to queue
    this.opportunityQueue.push(opportunity);

    // Set up automatic expiration
    this.setExpirationTimer(opportunity.id);
  }

  /**
   * Get the current (first) pending opportunity from the queue
   * @returns The current opportunity or null if no pending opportunities
   */
  getCurrentOpportunity(): Opportunity | null {
    // Find the first pending opportunity
    const current = this.opportunityQueue.find((opp) => opp.status === 'pending');
    return current ?? null;
  }

  /**
   * Confirm an opportunity and remove it from the queue
   * @param id The ID of the opportunity to confirm
   * @param amount The amount to trade (may differ from suggested amount)
   * @returns Promise that resolves when the opportunity is confirmed
   */
  confirm(id: string, amount: number): void {
    const opportunity = this.opportunityQueue.find((opp) => opp.id === id);

    if (!opportunity) {
      throw new Error(`Opportunity with ID ${id} not found`);
    }

    if (opportunity.status !== 'pending') {
      throw new Error(
        `Cannot confirm opportunity with status: ${opportunity.status}`
      );
    }

    // Clear the expiration timer
    this.clearExpirationTimer(id);

    // Update the opportunity
    opportunity.status = 'confirmed';
    opportunity.suggestedAmount = amount;

    // Move from queue to history
    this.removeFromQueue(id);
    this.addToHistory(opportunity);
  }

  /**
   * Reject an opportunity
   * @param id The ID of the opportunity to reject
   */
  reject(id: string): void {
    const opportunity = this.opportunityQueue.find((opp) => opp.id === id);

    if (!opportunity) {
      throw new Error(`Opportunity with ID ${id} not found`);
    }

    if (opportunity.status !== 'pending') {
      throw new Error(
        `Cannot reject opportunity with status: ${opportunity.status}`
      );
    }

    // Clear the expiration timer
    this.clearExpirationTimer(id);

    // Update the opportunity
    opportunity.status = 'rejected';

    // Move from queue to history
    this.removeFromQueue(id);
    this.addToHistory(opportunity);
  }

  /**
   * Get the complete history of opportunities
   * @returns Array of all opportunities (both active and inactive)
   */
  getHistory(): Opportunity[] {
    // Return a copy to prevent external modifications
    return [...this.history];
  }

  /**
   * Expire an opportunity by ID
   * @param id The ID of the opportunity to expire
   * @internal
   */
  private expireOpportunity(id: string): void {
    const opportunity = this.opportunityQueue.find((opp) => opp.id === id);

    if (opportunity?.status !== 'pending') {
      return;
    }

    // Update the opportunity
    opportunity.status = 'expired';

    // Move from queue to history
    this.removeFromQueue(id);
    this.addToHistory(opportunity);
  }

  /**
   * Set up an expiration timer for an opportunity
   * @param id The opportunity ID
   * @internal
   */
  private setExpirationTimer(id: string): void {
    // Clear any existing timer
    this.clearExpirationTimer(id);

    // Set a new timer
    const timer = setTimeout(() => {
      this.expireOpportunity(id);
    }, this.config.opportunityTimeoutMs);

    this.expirationTimers.set(id, timer);
  }

  /**
   * Clear an expiration timer for an opportunity
   * @param id The opportunity ID
   * @internal
   */
  private clearExpirationTimer(id: string): void {
    const timer = this.expirationTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(id);
    }
  }

  /**
   * Remove an opportunity from the queue
   * @param id The opportunity ID
   * @internal
   */
  private removeFromQueue(id: string): void {
    const index = this.opportunityQueue.findIndex((opp) => opp.id === id);
    if (index !== -1) {
      this.opportunityQueue.splice(index, 1);
    }
  }

  /**
   * Add an opportunity to the history
   * @param opportunity The opportunity to add
   * @internal
   */
  private addToHistory(opportunity: Opportunity): void {
    this.history.push(opportunity);

    // Trim history if it exceeds max size
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Clear all timers and clean up resources
   * @internal
   */
  destroy(): void {
    // Clear all expiration timers
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.expirationTimers.clear();

    // Clear queues
    this.opportunityQueue = [];
    this.history = [];
  }

  /**
   * Get the count of pending opportunities
   * @returns Number of pending opportunities
   */
  getPendingCount(): number {
    return this.opportunityQueue.filter((opp) => opp.status === 'pending').length;
  }

  /**
   * Get all opportunities in the queue (for testing/debugging)
   * @returns Array of all opportunities in the queue
   * @internal
   */
  getQueuedOpportunities(): Opportunity[] {
    return [...this.opportunityQueue];
  }
}
