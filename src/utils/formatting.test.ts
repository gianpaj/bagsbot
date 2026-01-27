import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatSol,
  formatPercent,
  truncateAddress,
  formatPnL,
  formatNumber,
  formatCompact,
  formatRelativeTime,
  LAMPORTS_PER_SOL,
  TerminalColors,
} from './formatting.js';

describe('LAMPORTS_PER_SOL', () => {
  it('should be 1 billion', () => {
    expect(LAMPORTS_PER_SOL).toBe(1_000_000_000);
  });
});

describe('TerminalColors', () => {
  it('should have correct ANSI codes', () => {
    expect(TerminalColors.GREEN).toBe('\x1b[32m');
    expect(TerminalColors.RED).toBe('\x1b[31m');
    expect(TerminalColors.YELLOW).toBe('\x1b[33m');
    expect(TerminalColors.RESET).toBe('\x1b[0m');
  });
});

describe('formatSol', () => {
  describe('precision based on amount', () => {
    it('should use 9 decimals for amounts less than 0.001 SOL', () => {
      const lamports = 100; // 0.0000001 SOL
      expect(formatSol(lamports)).toBe('0.000000100 SOL');
    });

    it('should use 6 decimals for amounts between 0.001 and 0.01 SOL', () => {
      const lamports = 5_000_000; // 0.005 SOL
      expect(formatSol(lamports)).toBe('0.005000 SOL');
    });

    it('should use 4 decimals for amounts between 0.01 and 1 SOL', () => {
      const lamports = 123_000_000; // 0.123 SOL
      expect(formatSol(lamports)).toBe('0.1230 SOL');
    });

    it('should use 3 decimals for amounts between 1 and 100 SOL', () => {
      const lamports = 1_500_000_000; // 1.5 SOL
      expect(formatSol(lamports)).toBe('1.500 SOL');
    });

    it('should use 2 decimals for amounts 100+ SOL', () => {
      const lamports = 150_000_000_000; // 150 SOL
      expect(formatSol(lamports)).toBe('150.00 SOL');
    });
  });

  describe('edge cases', () => {
    it('should format 0 lamports', () => {
      expect(formatSol(0)).toBe('0.000000000 SOL');
    });

    it('should format 1 lamport', () => {
      expect(formatSol(1)).toBe('0.000000001 SOL');
    });

    it('should format 1 SOL exactly', () => {
      expect(formatSol(LAMPORTS_PER_SOL)).toBe('1.000 SOL');
    });

    it('should handle negative amounts', () => {
      const lamports = -123_000_000; // -0.123 SOL
      expect(formatSol(lamports)).toBe('-0.1230 SOL');
    });

    it('should format large amounts', () => {
      const lamports = 1_000_000 * LAMPORTS_PER_SOL; // 1 million SOL
      expect(formatSol(lamports)).toBe('1000000.00 SOL');
    });
  });
});

describe('formatPercent', () => {
  describe('positive values', () => {
    it('should format positive percentages with + sign', () => {
      expect(formatPercent(0.15)).toBe('+15.00%');
    });

    it('should format 100% (1.0 decimal)', () => {
      expect(formatPercent(1.0)).toBe('+100.00%');
    });

    it('should format percentages greater than 100%', () => {
      expect(formatPercent(1.5)).toBe('+150.00%');
    });

    it('should format small positive percentages', () => {
      expect(formatPercent(0.001)).toBe('+0.10%');
    });
  });

  describe('negative values', () => {
    it('should format negative percentages with - sign', () => {
      expect(formatPercent(-0.05)).toBe('-5.00%');
    });

    it('should format large negative percentages', () => {
      expect(formatPercent(-0.99)).toBe('-99.00%');
    });
  });

  describe('zero', () => {
    it('should format zero without sign', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });
  });

  describe('custom decimals', () => {
    it('should respect custom decimal places', () => {
      expect(formatPercent(0.12345, 4)).toBe('+12.3450%');
    });

    it('should work with 0 decimals', () => {
      expect(formatPercent(0.156, 0)).toBe('+16%');
    });

    it('should work with 1 decimal', () => {
      expect(formatPercent(0.156, 1)).toBe('+15.6%');
    });
  });
});

describe('truncateAddress', () => {
  const fullAddress = 'ExAmPLEAdDrEsSmInTaBcDeFgHiJkLmNoPqRsTuVwXyZ123';

  describe('default truncation', () => {
    it('should truncate with 4 chars by default', () => {
      expect(truncateAddress(fullAddress)).toBe('ExAm...Z123');
    });
  });

  describe('custom char count', () => {
    it('should truncate with 6 chars', () => {
      expect(truncateAddress(fullAddress, 6)).toBe('ExAmPL...XyZ123');
    });

    it('should truncate with 8 chars', () => {
      expect(truncateAddress(fullAddress, 8)).toBe('ExAmPLEA...VwXyZ123');
    });
  });

  describe('short addresses', () => {
    it('should not truncate addresses shorter than minimum length', () => {
      const shortAddress = 'ABC12345';
      expect(truncateAddress(shortAddress, 4)).toBe('ABC12345');
    });

    it('should not truncate addresses equal to minimum length', () => {
      const exactAddress = 'ABC...XYZ'; // 9 chars, minimum for 4-char truncation
      expect(truncateAddress(exactAddress, 4)).toBe('ABC...XYZ');
    });

    it('should truncate addresses just over minimum length', () => {
      const address = 'ABCDEFGHIJKL'; // 12 chars > 4*2+3=11
      expect(truncateAddress(address, 4)).toBe('ABCD...IJKL');
    });
  });

  describe('edge cases', () => {
    it('should handle 1 char truncation', () => {
      const address = 'ABCDEFGH';
      expect(truncateAddress(address, 1)).toBe('A...H');
    });

    it('should handle empty string', () => {
      expect(truncateAddress('')).toBe('');
    });
  });
});

describe('formatPnL', () => {
  describe('positive P&L', () => {
    it('should format positive P&L with green color', () => {
      const result = formatPnL(1.25);
      expect(result).toBe(`${TerminalColors.GREEN}+125.00%${TerminalColors.RESET}`);
    });

    it('should format small positive P&L with green color', () => {
      const result = formatPnL(0.05);
      expect(result).toBe(`${TerminalColors.GREEN}+5.00%${TerminalColors.RESET}`);
    });
  });

  describe('negative P&L', () => {
    it('should format negative P&L with red color', () => {
      const result = formatPnL(-0.15);
      expect(result).toBe(`${TerminalColors.RED}-15.00%${TerminalColors.RESET}`);
    });

    it('should format large negative P&L with red color', () => {
      const result = formatPnL(-0.99);
      expect(result).toBe(`${TerminalColors.RED}-99.00%${TerminalColors.RESET}`);
    });
  });

  describe('zero P&L', () => {
    it('should format zero P&L with yellow color', () => {
      const result = formatPnL(0);
      expect(result).toBe(`${TerminalColors.YELLOW}0.00%${TerminalColors.RESET}`);
    });
  });

  describe('custom decimals', () => {
    it('should respect custom decimal places', () => {
      const result = formatPnL(0.12345, 3);
      expect(result).toBe(`${TerminalColors.GREEN}+12.345%${TerminalColors.RESET}`);
    });
  });
});

describe('formatNumber', () => {
  describe('basic formatting', () => {
    it('should format thousands', () => {
      expect(formatNumber(1234)).toBe('1,234');
    });

    it('should format millions', () => {
      expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('should format billions', () => {
      expect(formatNumber(1234567890)).toBe('1,234,567,890');
    });
  });

  describe('decimal places', () => {
    it('should format with 2 decimal places', () => {
      expect(formatNumber(1234.5678, 2)).toBe('1,234.57');
    });

    it('should format with 0 decimal places by default', () => {
      expect(formatNumber(1234.5678)).toBe('1,235');
    });

    it('should pad with zeros if needed', () => {
      expect(formatNumber(1234, 2)).toBe('1,234.00');
    });
  });

  describe('edge cases', () => {
    it('should format zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('should format negative numbers', () => {
      expect(formatNumber(-1234567)).toBe('-1,234,567');
    });

    it('should format small numbers', () => {
      expect(formatNumber(123)).toBe('123');
    });
  });
});

describe('formatCompact', () => {
  describe('thousands (K)', () => {
    it('should format 1500 as 1.5K', () => {
      expect(formatCompact(1500)).toBe('1.5K');
    });

    it('should format 999000 as 999.0K', () => {
      expect(formatCompact(999000)).toBe('999.0K');
    });
  });

  describe('millions (M)', () => {
    it('should format 1500000 as 1.5M', () => {
      expect(formatCompact(1500000)).toBe('1.5M');
    });

    it('should format 999000000 as 999.0M', () => {
      expect(formatCompact(999000000)).toBe('999.0M');
    });
  });

  describe('billions (B)', () => {
    it('should format 1500000000 as 1.5B', () => {
      expect(formatCompact(1500000000)).toBe('1.5B');
    });

    it('should format 10000000000 as 10.0B', () => {
      expect(formatCompact(10000000000)).toBe('10.0B');
    });
  });

  describe('small numbers', () => {
    it('should not compact numbers less than 1000', () => {
      expect(formatCompact(500)).toBe('500.0');
    });

    it('should not compact 999', () => {
      expect(formatCompact(999)).toBe('999.0');
    });
  });

  describe('custom decimals', () => {
    it('should respect custom decimal places', () => {
      expect(formatCompact(1234567, 2)).toBe('1.23M');
    });

    it('should work with 0 decimals', () => {
      expect(formatCompact(1500000, 0)).toBe('2M');
    });
  });

  describe('negative numbers', () => {
    it('should handle negative thousands', () => {
      expect(formatCompact(-1500)).toBe('-1.5K');
    });

    it('should handle negative millions', () => {
      expect(formatCompact(-1500000)).toBe('-1.5M');
    });

    it('should handle negative billions', () => {
      expect(formatCompact(-1500000000)).toBe('-1.5B');
    });
  });

  describe('edge cases', () => {
    it('should format zero', () => {
      expect(formatCompact(0)).toBe('0.0');
    });

    it('should format exactly 1000', () => {
      expect(formatCompact(1000)).toBe('1.0K');
    });

    it('should format exactly 1000000', () => {
      expect(formatCompact(1000000)).toBe('1.0M');
    });

    it('should format exactly 1000000000', () => {
      expect(formatCompact(1000000000)).toBe('1.0B');
    });
  });
});

describe('formatRelativeTime', () => {
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
    // Fix Date.now() to a specific timestamp
    Date.now = vi.fn(() => 1700000000000); // Some fixed timestamp
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('seconds', () => {
    it('should format seconds ago', () => {
      const timestamp = Date.now() - 30 * 1000; // 30 seconds ago
      expect(formatRelativeTime(timestamp)).toBe('30s ago');
    });

    it('should format 1 second ago', () => {
      const timestamp = Date.now() - 1000; // 1 second ago
      expect(formatRelativeTime(timestamp)).toBe('1s ago');
    });
  });

  describe('minutes', () => {
    it('should format minutes ago', () => {
      const timestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      expect(formatRelativeTime(timestamp)).toBe('2m ago');
    });

    it('should format 1 minute ago', () => {
      const timestamp = Date.now() - 60 * 1000; // 1 minute ago
      expect(formatRelativeTime(timestamp)).toBe('1m ago');
    });
  });

  describe('hours', () => {
    it('should format hours ago', () => {
      const timestamp = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
      expect(formatRelativeTime(timestamp)).toBe('3h ago');
    });

    it('should format 1 hour ago', () => {
      const timestamp = Date.now() - 60 * 60 * 1000; // 1 hour ago
      expect(formatRelativeTime(timestamp)).toBe('1h ago');
    });
  });

  describe('days', () => {
    it('should format days ago', () => {
      const timestamp = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
      expect(formatRelativeTime(timestamp)).toBe('3d ago');
    });

    it('should format 1 day ago', () => {
      const timestamp = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
      expect(formatRelativeTime(timestamp)).toBe('1d ago');
    });
  });

  describe('edge cases', () => {
    it('should format "just now" for current time', () => {
      const timestamp = Date.now();
      expect(formatRelativeTime(timestamp)).toBe('just now');
    });

    it('should format "just now" for future timestamps', () => {
      const timestamp = Date.now() + 60000; // 1 minute in future
      expect(formatRelativeTime(timestamp)).toBe('just now');
    });

    it('should accept Date objects', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      expect(formatRelativeTime(date)).toBe('5m ago');
    });
  });
});
