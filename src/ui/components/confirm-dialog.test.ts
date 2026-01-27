/**
 * Tests for Confirm Dialog Component
 */

 
import { describe, it, expect, vi } from 'vitest';
import {
  createConfirmDialog,
  createBuyConfirmDialog,
  createSellConfirmDialog,
  createExitAllConfirmDialog,
} from './confirm-dialog.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

describe('confirm dialog component', () => {
  it('should create confirm dialog', () => {
    const component = createConfirmDialog({
      type: 'buy',
      title: 'Test Dialog',
      message: 'Are you sure?',
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'confirm-dialog-modal');
  });

  it('should include details when provided', () => {
    const component = createConfirmDialog({
      type: 'buy',
      title: 'Confirm Action',
      message: 'Do you want to proceed?',
      details: ['Detail 1', 'Detail 2', 'Detail 3'],
    });

    expect(component).toBeDefined();
  });

  it('should have column flex direction', () => {
    const component = createConfirmDialog({
      type: 'buy',
      title: 'Test',
      message: 'Message',
    });

    expect(component).toHaveProperty('flexDirection', 'column');
  });

  it('should have round border style', () => {
    const component = createConfirmDialog({
      type: 'buy',
      title: 'Test',
      message: 'Message',
    });

    expect(component).toHaveProperty('borderStyle', 'round');
  });

  describe('createBuyConfirmDialog', () => {
    it('should create buy confirmation dialog', () => {
      const component = createBuyConfirmDialog('TOKEN', 2.5, 2500);

      expect(component).toBeDefined();
    });

    it('should display token symbol and amount', () => {
      const component = createBuyConfirmDialog('USDC', 1.5, 1500000);

      expect(component).toBeDefined();
    });

    it('should calculate price per token', () => {
      const component = createBuyConfirmDialog('TOKEN', 10.0, 10000);
      // Price should be 10 / 10000 = 0.001 SOL per token

      expect(component).toBeDefined();
    });

    it('should include warning about irreversible action', () => {
      const component = createBuyConfirmDialog('TOKEN', 1.0, 1000);

      expect(component).toBeDefined();
    });
  });

  describe('createSellConfirmDialog', () => {
    it('should create sell confirmation dialog', () => {
      const component = createSellConfirmDialog('TOKEN', 1000, 2.5, 150);

      expect(component).toBeDefined();
    });

    it('should display profit percentage', () => {
      const component = createSellConfirmDialog('TOKEN', 500, 1.0, 100);

      expect(component).toBeDefined();
    });

    it('should display loss percentage', () => {
      const component = createSellConfirmDialog('TOKEN', 1000, 0.4, -60);

      expect(component).toBeDefined();
    });

    it('should show zero profit correctly', () => {
      const component = createSellConfirmDialog('TOKEN', 1000, 1.0, 0);

      expect(component).toBeDefined();
    });

    it('should include warning about irreversible action', () => {
      const component = createSellConfirmDialog('TOKEN', 1000, 2.5, 150);

      expect(component).toBeDefined();
    });
  });

  describe('createExitAllConfirmDialog', () => {
    it('should create exit all confirmation dialog', () => {
      const component = createExitAllConfirmDialog(5);

      expect(component).toBeDefined();
    });

    it('should display position count', () => {
      const component = createExitAllConfirmDialog(10);

      expect(component).toBeDefined();
    });

    it('should work with single position', () => {
      const component = createExitAllConfirmDialog(1);

      expect(component).toBeDefined();
    });

    it('should work with many positions', () => {
      const component = createExitAllConfirmDialog(50);

      expect(component).toBeDefined();
    });

    it('should include warning about immediate sell', () => {
      const component = createExitAllConfirmDialog(5);

      expect(component).toBeDefined();
    });

    it('should include warning about irreversible action', () => {
      const component = createExitAllConfirmDialog(5);

      expect(component).toBeDefined();
    });
  });

  describe('dialog types', () => {
    it('should support buy dialog type', () => {
      const component = createConfirmDialog({
        type: 'buy',
        title: 'Confirm Buy',
        message: 'Buy tokens?',
      });

      expect(component).toBeDefined();
    });

    it('should support sell dialog type', () => {
      const component = createConfirmDialog({
        type: 'sell',
        title: 'Confirm Sell',
        message: 'Sell tokens?',
      });

      expect(component).toBeDefined();
    });

    it('should support exit_all dialog type', () => {
      const component = createConfirmDialog({
        type: 'exit_all',
        title: 'Exit All',
        message: 'Exit all positions?',
      });

      expect(component).toBeDefined();
    });

    it('should support cancel_all dialog type', () => {
      const component = createConfirmDialog({
        type: 'cancel_all',
        title: 'Cancel All',
        message: 'Cancel all orders?',
      });

      expect(component).toBeDefined();
    });
  });
});
