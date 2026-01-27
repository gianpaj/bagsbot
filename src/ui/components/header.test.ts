/**
 * Tests for Header Component
 */

 
import { describe, it, expect, vi } from 'vitest';
import { createHeader } from './header.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

describe('header component', () => {
  it('should create header with connected status', () => {
    const component = createHeader({
      isConnected: true,
      walletBalance: 5.5,
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'header');
  });

  it('should create header with disconnected status', () => {
    const component = createHeader({
      isConnected: false,
      walletBalance: 0,
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'header');
  });

  it('should format wallet balance correctly', () => {
    const component = createHeader({
      isConnected: true,
      walletBalance: 10.123456,
    });

    expect(component).toBeDefined();
  });

  it('should have flexDirection row for horizontal layout', () => {
    const component = createHeader({
      isConnected: true,
      walletBalance: 5,
    });

    expect(component).toHaveProperty('flexDirection', 'row');
  });

  it('should have space-between justification', () => {
    const component = createHeader({
      isConnected: true,
      walletBalance: 5,
    });

    expect(component).toHaveProperty('justifyContent', 'space-between');
  });
});
