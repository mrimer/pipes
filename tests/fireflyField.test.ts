/**
 * @jest-environment jsdom
 */

import { FireflyField } from '../src/visuals/fireflyField';

interface FireflyInternals {
  _fireflies: Array<{ startTime: number }>;
  _computeLifecycleAlpha: (ageMs: number) => number;
}

function createLCGPRNG(seed = 12345): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('FireflyField', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('spawns one firefly per ten tiles on dark levels', () => {
    jest.spyOn(Math, 'random').mockImplementation(createLCGPRNG(17));
    jest.spyOn(performance, 'now').mockReturnValue(1000);
    const field = new FireflyField();

    // 100x100 px at 10 px per tile => 10x10 tile grid (100 tiles) => 10 fireflies.
    field.resetForLevel(100, 100, 10, 'Dark');

    expect((field as unknown as FireflyInternals)._fireflies).toHaveLength(10);
  });

  it('does not spawn fireflies on non-dark levels', () => {
    const field = new FireflyField();
    field.resetForLevel(20, 10, 1, 'Grass');
    expect((field as unknown as FireflyInternals)._fireflies).toHaveLength(0);
  });

  it('fades in, cruises, and fades out over the firefly lifecycle', () => {
    const field = new FireflyField();
    const internals = field as unknown as FireflyInternals;

    expect(internals._computeLifecycleAlpha(0)).toBe(0);
    expect(internals._computeLifecycleAlpha(2500)).toBeCloseTo(0.5, 5);
    expect(internals._computeLifecycleAlpha(5000)).toBe(1);
    expect(internals._computeLifecycleAlpha(15000)).toBe(1);
    expect(internals._computeLifecycleAlpha(17500)).toBeCloseTo(0.5, 5);
    expect(internals._computeLifecycleAlpha(20000)).toBe(0);
  });

  it('respawns fireflies after they expire', () => {
    jest.spyOn(Math, 'random').mockImplementation(createLCGPRNG(91));
    jest.spyOn(performance, 'now').mockReturnValue(500);
    const field = new FireflyField();
    field.resetForLevel(8, 8, 8, 'Dark');

    const ctx = createMockCtx();
    const before = (field as unknown as FireflyInternals)._fireflies[0].startTime;
    field.updateAndRender(ctx, before + 20001);
    const after = (field as unknown as FireflyInternals)._fireflies[0].startTime;

    expect((field as unknown as FireflyInternals)._fireflies).toHaveLength(1);
    expect(after).toBe(before + 20001);
  });
});
