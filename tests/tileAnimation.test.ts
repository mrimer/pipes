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
} from '../src/visuals/tileAnimation';

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
const makeCtx = () => {
  const alphaWrites: number[] = [];
  const ctx = {
    save:         jest.fn(),
    restore:      jest.fn(),
    fillText:     jest.fn(),
    strokeText:   jest.fn(),
    font:         '',
    textAlign:    '',
    textBaseline: '',
    fillStyle:    '',
    strokeStyle:  '',
    lineWidth:    0,
    alphaWrites,
  };
  let alpha = 1;
  Object.defineProperty(ctx, 'globalAlpha', {
    configurable: true,
    get: () => alpha,
    set: (value: number) => {
      alpha = value;
      alphaWrites.push(value);
    },
  });
  return ctx as unknown as CanvasRenderingContext2D & { alphaWrites: number[] };
};

describe('renderAnimations', () => {
  // Pin performance.now() to a fixed value so elapsed-time calculations are
  // deterministic even on slow CI machines (wall-clock flakiness).
  const FIXED_NOW = 10_000;
  beforeEach(() => {
    jest.spyOn(performance, 'now').mockReturnValue(FIXED_NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('draws active animations with fillText', () => {
    const ctx = makeCtx();
    const anims: TileAnimation[] = [
      { x: 100, y: 50, text: '-1', color: ANIM_NEGATIVE_COLOR, startTime: FIXED_NOW - 100, duration: 900 },
    ];
    renderAnimations(ctx, anims);
    expect((ctx.fillText as jest.Mock).mock.calls[0]).toEqual(['-1', 100, expect.any(Number)]);
    expect(anims).toHaveLength(1); // still active
  });

  it('removes animations that have expired', () => {
    const ctx = makeCtx();
    const anims: TileAnimation[] = [
      // Already past its duration
      { x: 10, y: 10, text: '+5', color: ANIM_POSITIVE_COLOR, startTime: FIXED_NOW - 1000, duration: 900 },
    ];
    renderAnimations(ctx, anims);
    expect(anims).toHaveLength(0); // expired → removed
    expect((ctx.fillText as jest.Mock)).not.toHaveBeenCalled();
  });

  it('applies partial alpha for a mid-animation frame', () => {
    const ctx = makeCtx();
    const justAfterHalf = 451; // just after 50% of a 900ms animation
    const anims: TileAnimation[] = [
      { x: 64, y: 32, text: '+3', color: ANIM_POSITIVE_COLOR, startTime: FIXED_NOW - justAfterHalf, duration: 900 },
    ];
    renderAnimations(ctx, anims);
    // Just after 50% elapsed, fade-out must be active (alpha < 1).
    expect((ctx.fillText as jest.Mock)).toHaveBeenCalled();
    expect(ctx.alphaWrites.length).toBeGreaterThan(0);
    const appliedAlpha = ctx.alphaWrites[ctx.alphaWrites.length - 1];
    expect(appliedAlpha).toBeGreaterThan(0);
    expect(appliedAlpha).toBeLessThan(1);
    // Y position should be shifted upward
    const [, , y] = (ctx.fillText as jest.Mock).mock.calls[0] as [string, number, number];
    expect(y).toBeLessThan(32); // started at 32, shifted up
    expect(y).toBeGreaterThan(32 - ANIM_RISE_PX); // within bounds
  });

  it('handles an empty animation array without errors', () => {
    const ctx = makeCtx();
    expect(() => renderAnimations(ctx, [])).not.toThrow();
  });
});
