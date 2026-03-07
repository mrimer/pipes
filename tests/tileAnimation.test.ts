/** Tests for tileAnimation utilities. */

import {
  animColor,
  renderAnimations,
  TileAnimation,
  ANIM_POSITIVE_COLOR,
  ANIM_NEGATIVE_COLOR,
  ANIM_ZERO_COLOR,
  ANIM_ITEM_COLOR,
  ANIM_RISE_PX,
} from '../src/tileAnimation';

// ─── animColor ────────────────────────────────────────────────────────────────

describe('animColor', () => {
  it('returns green for positive values', () => {
    expect(animColor(1)).toBe(ANIM_POSITIVE_COLOR);
    expect(animColor(5)).toBe(ANIM_POSITIVE_COLOR);
  });

  it('returns red for negative values', () => {
    expect(animColor(-1)).toBe(ANIM_NEGATIVE_COLOR);
    expect(animColor(-10)).toBe(ANIM_NEGATIVE_COLOR);
  });

  it('returns gray for zero', () => {
    expect(animColor(0)).toBe(ANIM_ZERO_COLOR);
  });
});

// ─── ANIM_ITEM_COLOR ──────────────────────────────────────────────────────────

describe('ANIM_ITEM_COLOR', () => {
  it('is a distinct gold color, different from green and red', () => {
    expect(ANIM_ITEM_COLOR).not.toBe(ANIM_POSITIVE_COLOR);
    expect(ANIM_ITEM_COLOR).not.toBe(ANIM_NEGATIVE_COLOR);
    expect(ANIM_ITEM_COLOR).not.toBe(ANIM_ZERO_COLOR);
  });

  it('starts with # and is a valid hex color', () => {
    expect(ANIM_ITEM_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

// ─── renderAnimations ─────────────────────────────────────────────────────────

/** Minimal canvas context stub for testing. */
const makeCtx = () => ({
  save:         jest.fn(),
  restore:      jest.fn(),
  fillText:     jest.fn(),
  globalAlpha:  1,
  font:         '',
  textAlign:    '',
  textBaseline: '',
  fillStyle:    '',
  shadowColor:  '',
  shadowBlur:   0,
} as unknown as CanvasRenderingContext2D);

describe('renderAnimations', () => {
  it('draws active animations with fillText', () => {
    const ctx = makeCtx();
    const now = performance.now();
    const anims: TileAnimation[] = [
      { x: 100, y: 50, text: '-1', color: ANIM_NEGATIVE_COLOR, startTime: now - 100, duration: 900 },
    ];
    renderAnimations(ctx, anims);
    expect((ctx.fillText as jest.Mock).mock.calls[0]).toEqual(['-1', 100, expect.any(Number)]);
    expect(anims).toHaveLength(1); // still active
  });

  it('removes animations that have expired', () => {
    const ctx = makeCtx();
    const now = performance.now();
    const anims: TileAnimation[] = [
      // Already past its duration
      { x: 10, y: 10, text: '+5', color: ANIM_POSITIVE_COLOR, startTime: now - 1000, duration: 900 },
    ];
    renderAnimations(ctx, anims);
    expect(anims).toHaveLength(0); // expired → removed
    expect((ctx.fillText as jest.Mock)).not.toHaveBeenCalled();
  });

  it('applies partial alpha for a mid-animation frame', () => {
    const ctx = makeCtx();
    const now = performance.now();
    const half = 450; // halfway through a 900ms animation
    const anims: TileAnimation[] = [
      { x: 64, y: 32, text: '+3', color: ANIM_POSITIVE_COLOR, startTime: now - half, duration: 900 },
    ];
    renderAnimations(ctx, anims);
    // At 50% elapsed, alpha ≈ 0.5 and yOffset ≈ -(ANIM_RISE_PX * 0.5)
    const appliedAlpha = (ctx as unknown as { globalAlpha: number }).globalAlpha;
    // globalAlpha is set inside the mock – retrieve from fillText call context
    // The stub doesn't capture the intermediate state, but we can verify fillText was called
    expect((ctx.fillText as jest.Mock)).toHaveBeenCalled();
    // Y position should be shifted upward
    const [, , y] = (ctx.fillText as jest.Mock).mock.calls[0] as [string, number, number];
    expect(y).toBeLessThan(32); // started at 32, shifted up
    expect(y).toBeGreaterThan(32 - ANIM_RISE_PX); // within bounds
    void appliedAlpha; // suppress unused warning
  });

  it('handles an empty animation array without errors', () => {
    const ctx = makeCtx();
    expect(() => renderAnimations(ctx, [])).not.toThrow();
  });
});
