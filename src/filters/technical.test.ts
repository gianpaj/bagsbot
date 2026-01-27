 
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TechnicalFilter,
  createTechnicalFilter,
  TECHNICAL_SCORE,
} from './technical.js';
import type { LaunchpadLaunchEvent, TechnicalFilterConfig } from '../types/index.js';
import { DEFAULT_TECHNICAL_FILTER } from '../config/defaults.js';

/**
 * Create a mock launch event for testing
 */
function createMockLaunchEvent(
  overrides: Partial<LaunchpadLaunchEvent> = {}
): LaunchpadLaunchEvent {
  return {
    mint: 'TestMint123456789',
    creator: 'TestCreator123456789',
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token with good fundamentals',
    image: 'https://example.com/image.png',
    twitter: 'https://twitter.com/testtoken',
    telegram: 'https://t.me/testtoken',
    website: 'https://testtoken.com',
    ...overrides,
  };
}

/**
 * Mock fetch globally for image URL validation
 */
function mockFetch(
  responseInit: Partial<Response> = {}
): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'image/png']]),
    ...responseInit,
  } as Response);
}

describe('TechnicalFilter', () => {
  let filter: TechnicalFilter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filter = new TechnicalFilter();
    // Mock global fetch
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create with default config when none provided', () => {
      const newFilter = new TechnicalFilter();
      expect(newFilter.name).toBe('technical');
      expect(newFilter.getConfig()).toEqual(DEFAULT_TECHNICAL_FILTER);
    });

    it('should create with custom config', () => {
      const customConfig: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: true,
        validateImageUrl: false,
      };
      const newFilter = new TechnicalFilter(customConfig);
      expect(newFilter.getConfig()).toEqual(customConfig);
    });

    it('should have correct name', () => {
      expect(filter.name).toBe('technical');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: true,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(newConfig);
      expect(filter.getConfig()).toEqual(newConfig);
    });
  });

  describe('evaluate - metadata scoring', () => {
    it('should award 30 points for complete metadata', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(
        TECHNICAL_SCORE.COMPLETE_METADATA
      );
      expect(result.details).toContain('Metadata complete');
    });

    it('should not award metadata points when name is missing', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({ name: '' });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Metadata incomplete');
    });

    it('should not award metadata points when symbol is missing', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({ symbol: '' });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Metadata incomplete');
    });

    it('should not award metadata points when image is missing', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({ image: '' });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Metadata incomplete');
    });

    it('should require complete metadata when configured', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: true,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({ name: '' });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
    });
  });

  describe('evaluate - description scoring', () => {
    it('should award 20 points for present description', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        description: 'A detailed token description',
      });
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(
        TECHNICAL_SCORE.DESCRIPTION
      );
      expect(result.details).toContain('Description present');
    });

    it('should not award points for empty description', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({ description: '' });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Description missing');
    });

    it('should not award points for undefined description', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({ description: undefined });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Description missing');
    });

    it('should not award points for whitespace-only description', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({ description: '   ' });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Description missing');
    });

    it('should require description when configured', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: true,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({ description: '' });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
    });
  });

  describe('evaluate - social links scoring', () => {
    it('should award 25 points for all three social links', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        telegram: 'https://t.me/test',
        twitter: 'https://twitter.com/test',
        website: 'https://test.com',
      });
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(
        TECHNICAL_SCORE.SOCIAL_LINKS
      );
      expect(result.details).toContain('3 social link(s)');
    });

    it('should award 25 points for at least one social link', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        telegram: 'https://t.me/test',
        twitter: undefined,
        website: undefined,
      });
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(
        TECHNICAL_SCORE.SOCIAL_LINKS
      );
      expect(result.details).toContain('1 social link(s)');
    });

    it('should not award points for no social links', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        telegram: undefined,
        twitter: undefined,
        website: undefined,
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('No social links');
    });

    it('should not award points for empty social links', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        telegram: '',
        twitter: '',
        website: '',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('No social links');
    });

    it('should require social links when configured', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: true,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        telegram: undefined,
        twitter: undefined,
        website: undefined,
      });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
    });
  });

  describe('evaluate - image URL validation', () => {
    it('should award 15 points for valid image URL', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: true,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'https://example.com/image.png',
      });
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(
        TECHNICAL_SCORE.VALID_IMAGE_URL
      );
      expect(result.details).toContain('Valid image URL');
    });

    it('should not award points for unreachable image URL', async () => {
      fetchSpy = mockFetch({ ok: false, status: 404 });
      global.fetch = fetchSpy;

      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: true,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'https://example.com/missing.png',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Image URL invalid');
    });

    it('should not award points for non-image content type', async () => {
      fetchSpy = mockFetch({
        headers: new Map([['content-type', 'text/html']]),
      });
      global.fetch = fetchSpy;

      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: true,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'https://example.com/page.html',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Image URL invalid');
    });

    it('should not award points for placeholder URLs', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: true,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'https://placeholder.com/image.png',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Image URL invalid');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      fetchSpy = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = fetchSpy;

      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: true,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'https://example.com/image.png',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Image URL invalid');
    });

    it('should skip validation when validateImageUrl is false but check for placeholder', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'https://example.com/image.png',
      });
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(
        TECHNICAL_SCORE.VALID_IMAGE_URL
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should not award points for placeholder when validation disabled', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'https://via.placeholder.com/image.png',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Image URL invalid');
    });
  });

  describe('evaluate - supply scoring', () => {
    it('should award 10 points for standard supply', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(TECHNICAL_SCORE.STANDARD_SUPPLY);
      expect(result.details).toContain('Standard token supply');
    });
  });

  describe('evaluate - comprehensive scoring', () => {
    it('should award full 100 points for perfect launch', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        name: 'Perfect Token',
        symbol: 'PERF',
        image: 'https://example.com/image.png',
        description: 'A perfectly described token',
        telegram: 'https://t.me/perfect',
        twitter: 'https://twitter.com/perfect',
        website: 'https://perfect.com',
      });
      const result = await filter.evaluate(launch);

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('should calculate partial score correctly', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        description: undefined, // Missing description
        telegram: undefined, // No telegram
        website: undefined, // No website
      });
      const result = await filter.evaluate(launch);

      const expectedScore =
        TECHNICAL_SCORE.COMPLETE_METADATA + // 30
        TECHNICAL_SCORE.SOCIAL_LINKS + // 25 (has twitter)
        TECHNICAL_SCORE.VALID_IMAGE_URL + // 15
        TECHNICAL_SCORE.STANDARD_SUPPLY; // 10
      // Total: 80 (missing description = -20)

      expect(result.score).toBe(expectedScore);
    });

    it('should fail when all required criteria not met', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: true,
        requireDescription: true,
        requireSocialLinks: true,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        name: '', // Missing name
      });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
    });

    it('should pass when all configured requirements are met', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: true,
        requireDescription: true,
        requireSocialLinks: true,
        validateImageUrl: true,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
    });
  });

  describe('evaluate - pass/fail logic', () => {
    it('should pass with permissive config and minimal data', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        name: 'Token',
        symbol: 'TOK',
        description: undefined,
      });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(true);
    });

    it('should fail when requireCompleteMetadata and metadata incomplete', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: true,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({ symbol: '' });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
    });

    it('should fail when requireDescription and description missing', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: true,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({ description: undefined });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
    });

    it('should fail when requireSocialLinks and no links provided', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: true,
        validateImageUrl: false,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        telegram: undefined,
        twitter: undefined,
        website: undefined,
      });
      const result = await filter.evaluate(launch);

      expect(result.passed).toBe(false);
    });
  });

  describe('createTechnicalFilter factory', () => {
    it('should create filter with default config', () => {
      const newFilter = createTechnicalFilter();
      expect(newFilter.name).toBe('technical');
      expect(newFilter.getConfig()).toEqual(DEFAULT_TECHNICAL_FILTER);
    });

    it('should create filter with custom config', () => {
      const customConfig: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: false,
      };
      const newFilter = createTechnicalFilter(customConfig);
      expect(newFilter.getConfig()).toEqual(customConfig);
    });
  });

  describe('details formatting', () => {
    it('should include all scoring details in output', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Metadata complete');
      expect(result.details).toContain('Description present');
      expect(result.details).toContain('social link(s)');
      expect(result.details).toContain('Valid image URL');
      expect(result.details).toContain('Standard token supply');
    });

    it('should use semicolons to separate details', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent();
      const result = await filter.evaluate(launch);

      const parts = result.details.split('; ');
      expect(parts.length).toBeGreaterThan(1);
    });
  });

  describe('edge cases', () => {
    it('should handle launch with all optional fields undefined', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        description: undefined,
        image: undefined,
        telegram: undefined,
        twitter: undefined,
        website: undefined,
      });
      const result = await filter.evaluate(launch);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.details).toBeDefined();
    });

    it('should handle whitespace in fields', async () => {
      fetchSpy = mockFetch();
      global.fetch = fetchSpy;

      const launch = createMockLaunchEvent({
        description: '   ',
        telegram: '   ',
        twitter: '   ',
        website: '   ',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Description missing');
      expect(result.details).toContain('No social links');
    });

    it('should be case-insensitive for placeholder URLs', async () => {
      const config: TechnicalFilterConfig = {
        requireCompleteMetadata: false,
        requireDescription: false,
        requireSocialLinks: false,
        validateImageUrl: true,
      };
      filter.updateConfig(config);

      const launch = createMockLaunchEvent({
        image: 'HTTPS://PLACEHOLDER.COM/IMAGE.PNG',
      });
      const result = await filter.evaluate(launch);

      expect(result.details).toContain('Image URL invalid');
    });
  });
});
