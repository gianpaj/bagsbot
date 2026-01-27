/**
 * Launch event types for Bags platform token launches
 */

/**
 * Represents a token launch event from the Bags Launchpad
 */
export interface LaunchpadLaunchEvent {
  /** The mint address of the token */
  mint: string;
  /** The wallet address of the token creator */
  creator: string;
  /** The name of the token */
  name: string;
  /** The symbol/ticker of the token */
  symbol: string;
  /** Optional description of the token */
  description?: string;
  /** Optional image URL for the token */
  image?: string;
  /** Optional Telegram link */
  telegram?: string;
  /** Optional Twitter/X link */
  twitter?: string;
  /** Optional website URL */
  website?: string;
}
