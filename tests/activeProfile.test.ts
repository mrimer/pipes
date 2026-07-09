/**
 * Tests for activeProfile.ts
 * - getActiveSlotIndex / setActiveSlotIndex
 * - getActiveSlotPrefix
 * - withSlot
 */

import { getActiveSlotIndex, setActiveSlotIndex, getActiveSlotPrefix, withSlot } from '../src/profile/activeProfile';

beforeEach(() => {
  // Reset to no active slot before each test.
  setActiveSlotIndex(null);
});

afterEach(() => {
  setActiveSlotIndex(null);
});

// ─── getActiveSlotIndex / setActiveSlotIndex ──────────────────────────────────

describe('getActiveSlotIndex / setActiveSlotIndex', () => {
  it('returns null when no slot has been set', () => {
    expect(getActiveSlotIndex()).toBeNull();
  });

  it('returns the slot index after setting it', () => {
    setActiveSlotIndex(2);
    expect(getActiveSlotIndex()).toBe(2);
  });

  it('can be reset to null', () => {
    setActiveSlotIndex(1);
    setActiveSlotIndex(null);
    expect(getActiveSlotIndex()).toBeNull();
  });

  it('accepts slot index 0', () => {
    setActiveSlotIndex(0);
    expect(getActiveSlotIndex()).toBe(0);
  });

  it('accepts slot index 3', () => {
    setActiveSlotIndex(3);
    expect(getActiveSlotIndex()).toBe(3);
  });
});

// ─── getActiveSlotPrefix ──────────────────────────────────────────────────────

describe('getActiveSlotPrefix', () => {
  it('returns empty string when no slot is active', () => {
    expect(getActiveSlotPrefix()).toBe('');
  });

  it('returns "p0_" when slot 0 is active', () => {
    setActiveSlotIndex(0);
    expect(getActiveSlotPrefix()).toBe('p0_');
  });

  it('returns "p1_" when slot 1 is active', () => {
    setActiveSlotIndex(1);
    expect(getActiveSlotPrefix()).toBe('p1_');
  });

  it('returns "p3_" when slot 3 is active', () => {
    setActiveSlotIndex(3);
    expect(getActiveSlotPrefix()).toBe('p3_');
  });

  it('reverts to empty string after clearing the slot', () => {
    setActiveSlotIndex(2);
    setActiveSlotIndex(null);
    expect(getActiveSlotPrefix()).toBe('');
  });
});

// ─── withSlot ────────────────────────────────────────────────────────────────

describe('withSlot', () => {
  it('temporarily sets the slot for the duration of the callback', () => {
    let seenPrefix = '';
    withSlot(1, () => {
      seenPrefix = getActiveSlotPrefix();
    });
    expect(seenPrefix).toBe('p1_');
  });

  it('restores the previous slot index after the callback', () => {
    setActiveSlotIndex(0);
    withSlot(2, () => { /* no-op */ });
    expect(getActiveSlotIndex()).toBe(0);
  });

  it('restores null when the previous index was null', () => {
    withSlot(3, () => { /* no-op */ });
    expect(getActiveSlotIndex()).toBeNull();
  });

  it('returns the value returned by the callback', () => {
    const result = withSlot(0, () => 42);
    expect(result).toBe(42);
  });

  it('supports withSlot(null, ...) to use un-namespaced keys', () => {
    setActiveSlotIndex(2);
    let seenPrefix = '';
    withSlot(null, () => {
      seenPrefix = getActiveSlotPrefix();
    });
    expect(seenPrefix).toBe('');
    // Restored to 2 after the call.
    expect(getActiveSlotIndex()).toBe(2);
  });

  it('nested calls restore correctly', () => {
    setActiveSlotIndex(0);
    withSlot(1, () => {
      withSlot(2, () => {
        expect(getActiveSlotPrefix()).toBe('p2_');
      });
      expect(getActiveSlotPrefix()).toBe('p1_');
    });
    expect(getActiveSlotPrefix()).toBe('p0_');
  });
});
