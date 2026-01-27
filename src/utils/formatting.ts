/**
 * Formatting utilities for the Bags Sniper Bot
 *
 * Provides number formatting (SOL amounts, percentages), address truncation,
 * and terminal color codes for P&L display.
 *
 * @module utils/formatting
 */

/**
 * Number of lamports per SOL (1 SOL = 1,000,000,000 lamports)
 */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * ANSI color codes for terminal output
 */
export const TerminalColors = {
  /** Green color for positive values */
  GREEN: '\x1b[32m',
  /** Red color for negative values */
  RED: '\x1b[31m',
  /** Yellow color for neutral/zero values */
  YELLOW: '\x1b[33m',
  /** Reset color to default */
  RESET: '\x1b[0m',
} as const;

/**
 * Format lamports to SOL with appropriate precision
 *
 * Automatically adjusts decimal places based on the amount:
 * - Less than 0.001 SOL: 9 decimal places
 * - Less than 0.01 SOL: 6 decimal places
 * - Less than 1 SOL: 4 decimal places
 * - Less than 100 SOL: 3 decimal places
 * - 100+ SOL: 2 decimal places
 *
 * @param lamports - Amount in lamports (smallest unit of SOL)
 * @returns Formatted string with "SOL" suffix (e.g., "0.123 SOL")
 *
 * @example
 * ```typescript
 * formatSol(123000000); // "0.123 SOL"
 * formatSol(1500000000); // "1.500 SOL"
 * formatSol(1000000); // "0.001000 SOL"
 * formatSol(100); // "0.000000100 SOL"
 * ```
 */
export function formatSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  const absoluteSol = Math.abs(sol);

  let decimals: number;

  if (absoluteSol < 0.001) {
    decimals = 9;
  } else if (absoluteSol < 0.01) {
    decimals = 6;
  } else if (absoluteSol < 1) {
    decimals = 4;
  } else if (absoluteSol < 100) {
    decimals = 3;
  } else {
    decimals = 2;
  }

  return `${sol.toFixed(decimals)} SOL`;
}

/**
 * Format a decimal value as a percentage with sign
 *
 * @param value - Decimal value (e.g., 0.15 for 15%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string with sign (e.g., "+15.00%")
 *
 * @example
 * ```typescript
 * formatPercent(0.15); // "+15.00%"
 * formatPercent(-0.05); // "-5.00%"
 * formatPercent(0); // "0.00%"
 * formatPercent(1.5); // "+150.00%"
 * formatPercent(0.123456, 4); // "+12.3456%"
 * ```
 */
export function formatPercent(value: number, decimals = 2): string {
  const percentage = value * 100;
  const formatted = Math.abs(percentage).toFixed(decimals);

  if (percentage > 0) {
    return `+${formatted}%`;
  } else if (percentage < 0) {
    return `-${formatted}%`;
  } else {
    return `${formatted}%`;
  }
}

/**
 * Truncate a Solana address for display
 *
 * Shows the first and last N characters with ellipsis in between.
 *
 * @param address - Full Solana address (base58 string)
 * @param chars - Number of characters to show at start and end (default: 4)
 * @returns Truncated address (e.g., "ExAm...mint")
 *
 * @example
 * ```typescript
 * truncateAddress("ExAmPLEAdDrEsSmInTaBcDeFgHiJkLmNoPqRsTuVwXyZ");
 * // "ExAm...yZ"
 *
 * truncateAddress("ExAmPLEAdDrEsSmInTaBcDeFgHiJkLmNoPqRsTuVwXyZ", 6);
 * // "ExAmPL...VwXyZ"
 * ```
 */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) {
    // If address is short enough, return as-is
    return address;
  }

  const start = address.slice(0, chars);
  const end = address.slice(-chars);

  return `${start}...${end}`;
}

/**
 * Format P&L (Profit & Loss) with terminal color codes
 *
 * Applies ANSI color codes for terminal display:
 * - Green for positive values
 * - Red for negative values
 * - Yellow for zero
 *
 * @param percent - Decimal value representing the percentage change
 * @param decimals - Number of decimal places (default: 2)
 * @returns Colored percentage string for terminal display
 *
 * @example
 * ```typescript
 * formatPnL(1.25); // "\x1b[32m+125.00%\x1b[0m" (green)
 * formatPnL(-0.15); // "\x1b[31m-15.00%\x1b[0m" (red)
 * formatPnL(0); // "\x1b[33m0.00%\x1b[0m" (yellow)
 * ```
 */
export function formatPnL(percent: number, decimals = 2): string {
  const formatted = formatPercent(percent, decimals);

  if (percent > 0) {
    return `${TerminalColors.GREEN}${formatted}${TerminalColors.RESET}`;
  } else if (percent < 0) {
    return `${TerminalColors.RED}${formatted}${TerminalColors.RESET}`;
  } else {
    return `${TerminalColors.YELLOW}${formatted}${TerminalColors.RESET}`;
  }
}

/**
 * Format a large number with thousand separators
 *
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string with commas (e.g., "1,234,567")
 *
 * @example
 * ```typescript
 * formatNumber(1234567); // "1,234,567"
 * formatNumber(1234.5678, 2); // "1,234.57"
 * formatNumber(1000000000); // "1,000,000,000"
 * ```
 */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a number in compact notation (K, M, B)
 *
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Compact formatted string (e.g., "1.5M")
 *
 * @example
 * ```typescript
 * formatCompact(1500); // "1.5K"
 * formatCompact(1500000); // "1.5M"
 * formatCompact(1500000000); // "1.5B"
 * formatCompact(500); // "500"
 * ```
 */
export function formatCompact(value: number, decimals = 1): string {
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absoluteValue >= 1_000_000_000) {
    return `${sign}${(absoluteValue / 1_000_000_000).toFixed(decimals)}B`;
  } else if (absoluteValue >= 1_000_000) {
    return `${sign}${(absoluteValue / 1_000_000).toFixed(decimals)}M`;
  } else if (absoluteValue >= 1_000) {
    return `${sign}${(absoluteValue / 1_000).toFixed(decimals)}K`;
  } else {
    return `${sign}${absoluteValue.toFixed(decimals === 0 ? 0 : decimals)}`;
  }
}

/**
 * Format a timestamp as a relative time string
 *
 * @param timestamp - Unix timestamp in milliseconds or Date object
 * @returns Relative time string (e.g., "2m ago", "1h ago", "3d ago")
 *
 * @example
 * ```typescript
 * formatRelativeTime(Date.now() - 120000); // "2m ago"
 * formatRelativeTime(Date.now() - 3600000); // "1h ago"
 * formatRelativeTime(Date.now() - 86400000); // "1d ago"
 * ```
 */
export function formatRelativeTime(timestamp: number | Date): string {
  const now = Date.now();
  const time = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const diffMs = now - time;

  // Handle future timestamps
  if (diffMs < 0) {
    return 'just now';
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${String(days)}d ago`;
  } else if (hours > 0) {
    return `${String(hours)}h ago`;
  } else if (minutes > 0) {
    return `${String(minutes)}m ago`;
  } else if (seconds > 0) {
    return `${String(seconds)}s ago`;
  } else {
    return 'just now';
  }
}
