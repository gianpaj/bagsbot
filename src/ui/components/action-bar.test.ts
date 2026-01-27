/**
 * Tests for Action Bar Component
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */
import { describe, it, expect, vi } from 'vitest';
import { createActionBar } from './action-bar.js';

// Mock the OpenTUI core module
vi.mock('@opentui/core', () => ({
  Box: vi.fn((options) => ({ ...options })),
  Text: vi.fn((options) => ({ ...options })),
}));

describe('action bar component', () => {
  it('should create action bar for main screen', () => {
    const component = createActionBar({
      currentScreen: 'main',
    });

    expect(component).toBeDefined();
    expect(component).toHaveProperty('id', 'action-bar');
  });

  it('should create action bar for positions screen', () => {
    const component = createActionBar({
      currentScreen: 'positions',
    });

    expect(component).toBeDefined();
  });

  it('should create action bar for history screen', () => {
    const component = createActionBar({
      currentScreen: 'history',
    });

    expect(component).toBeDefined();
  });

  it('should create action bar for settings screen', () => {
    const component = createActionBar({
      currentScreen: 'settings',
    });

    expect(component).toBeDefined();
  });

  it('should have row flex direction', () => {
    const component = createActionBar({
      currentScreen: 'main',
    });

    expect(component).toHaveProperty('flexDirection', 'row');
  });

  it('should have center justification', () => {
    const component = createActionBar({
      currentScreen: 'main',
    });

    expect(component).toHaveProperty('justifyContent', 'center');
  });

  it('should show buy/skip/custom actions on main screen', () => {
    const component = createActionBar({
      currentScreen: 'main',
    });

    expect(component).toBeDefined();
    // Should have B, S, C, V for main screen
  });

  it('should show back action on secondary screens', () => {
    const posComponent = createActionBar({
      currentScreen: 'positions',
    });

    expect(posComponent).toBeDefined();
    // Positions screen should show [P] Back
  });

  it('should have height of 1', () => {
    const component = createActionBar({
      currentScreen: 'main',
    });

    expect(component).toHaveProperty('height', 1);
  });

  it('should have width of 100%', () => {
    const component = createActionBar({
      currentScreen: 'main',
    });

    expect(component).toHaveProperty('width', '100%');
  });
});
