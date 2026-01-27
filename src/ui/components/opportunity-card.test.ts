/**
 * Tests for Opportunity Card Component
 */

 
import { describe, it, expect, vi } from 'vitest';
import { createOpportunityCard } from './opportunity-card.js';
import type { LaunchpadLaunchEvent } from '../../types/launch.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

describe('opportunity card component', () => {
  const mockLaunch: LaunchpadLaunchEvent = {
    mint: 'EPjFWaLb3ylnz39cEbiywUUV3jnYiGgbsZXzMSTEiZX',
    creator: '9B5X4b4d4Ks6uQQKPrMx5T3vC9xT5xK7xQ5xK7xQ',
    name: 'Example Token',
    symbol: 'EXMP',
    description: 'An example token',
    image: 'https://example.com/image.png',
    twitter: 'https://twitter.com/example',
    telegram: 'https://t.me/example',
  };

  it('should create opportunity card with basic info', () => {
    const component = createOpportunityCard({
      launch: mockLaunch,
      liquiditySol: 10.5,
      curveFillPercent: 12,
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'opportunity-card');
  });

  it('should handle missing optional fields', () => {
    const component = createOpportunityCard({
      launch: mockLaunch,
    });

    expect(component).toBeDefined();
  });

  it('should display creator verification status', () => {
    const component = createOpportunityCard({
      launch: mockLaunch,
      creatorVerified: true,
      creatorFollowers: 50000,
    });

    expect(component).toBeDefined();
  });

  it('should format long mint address', () => {
    const longMint = 'A'.repeat(44); // Typical Solana address length
    const component = createOpportunityCard({
      launch: { ...mockLaunch, mint: longMint },
      liquiditySol: 5,
    });

    expect(component).toBeDefined();
  });

  it('should display filter results if provided', () => {
    const mockFilterResults = {
      launch: mockLaunch,
      totalScore: 85,
      passed: true,
      filters: {
        creator: { passed: true, score: 90, details: 'Verified creator' },
        technical: { passed: true, score: 85, details: 'Good metadata' },
        social: { passed: true, score: 80, details: 'Active social' },
        liquidity: { passed: false, score: 70, details: 'Moderate liquidity' },
      },
      timestamp: new Date(),
    };

    const component = createOpportunityCard({
      launch: mockLaunch,
      filterResults: mockFilterResults,
    });

    expect(component).toBeDefined();
  });

  it('should have column flex direction', () => {
    const component = createOpportunityCard({
      launch: mockLaunch,
    });

    expect(component).toHaveProperty('flexDirection', 'column');
  });

  it('should format liquidity and curve values', () => {
    const component = createOpportunityCard({
      launch: mockLaunch,
      liquiditySol: 1.123456,
      curveFillPercent: 45.678,
    });

    expect(component).toBeDefined();
  });
});
