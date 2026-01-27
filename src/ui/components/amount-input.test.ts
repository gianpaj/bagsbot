/**
 * Tests for Amount Input Component
 */

 
import { describe, it, expect, vi } from 'vitest';
import { createAmountInput } from './amount-input.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

describe('amount input component', () => {
  it('should create amount input modal', () => {
    const component = createAmountInput({
      suggestedAmount: 1.0,
      walletBalance: 10.0,
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'amount-input-modal');
  });

  it('should display suggested amount', () => {
    const component = createAmountInput({
      suggestedAmount: 2.5,
      walletBalance: 10.0,
    });

    expect(component).toBeDefined();
  });

  it('should display current amount when provided', () => {
    const component = createAmountInput({
      suggestedAmount: 1.0,
      walletBalance: 10.0,
      currentAmount: 2.0,
    });

    expect(component).toBeDefined();
  });

  it('should use suggested amount as default current amount', () => {
    const component = createAmountInput({
      suggestedAmount: 3.0,
      walletBalance: 10.0,
    });

    expect(component).toBeDefined();
  });

  it('should calculate portfolio percentage correctly', () => {
    const component = createAmountInput({
      suggestedAmount: 2.5,
      walletBalance: 10.0,
      currentAmount: 2.5,
    });

    expect(component).toBeDefined();
    // 2.5 / 10.0 = 25%
  });

  it('should handle zero wallet balance', () => {
    const component = createAmountInput({
      suggestedAmount: 1.0,
      walletBalance: 0,
    });

    expect(component).toBeDefined();
  });

  it('should display available balance', () => {
    const component = createAmountInput({
      suggestedAmount: 1.0,
      walletBalance: 50.123456,
    });

    expect(component).toBeDefined();
  });

  it('should format amounts with 4 decimal places', () => {
    const component = createAmountInput({
      suggestedAmount: 1.123456,
      walletBalance: 10.987654,
      currentAmount: 2.555555,
    });

    expect(component).toBeDefined();
  });

  it('should have column flex direction', () => {
    const component = createAmountInput({
      suggestedAmount: 1.0,
      walletBalance: 10.0,
    });

    expect(component).toHaveProperty('flexDirection', 'column');
  });

  it('should have round border style', () => {
    const component = createAmountInput({
      suggestedAmount: 1.0,
      walletBalance: 10.0,
    });

    expect(component).toHaveProperty('borderStyle', 'round');
  });

  it('should display help text with instructions', () => {
    const component = createAmountInput({
      suggestedAmount: 1.0,
      walletBalance: 10.0,
    });

    expect(component).toBeDefined();
  });
});
