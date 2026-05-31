/**
 * @jest-environment jsdom
 */

import { ButterflyField } from '../src/visuals/butterflyField';
import { PipeShape } from '../src/types';

interface ButterflyInternals {
  _butterflies: Array<{
    x: number;
    y: number;
    sizePx: number;
    heading: number;
    hasLanded: boolean;
    isLanded: boolean;
    segmentStartX: number;
    segmentStartY: number;
    segmentStartTime: number;
    segmentDistancePx: number;
  }>;
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
    translate: jest.fn(),
    rotate: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    quadraticCurveTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineCap: 'round',
    lineJoin: 'round',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('ButterflyField', () => {
  it('spawns one butterfly per twenty-five tiles on summer/grass levels', () => {
    jest.spyOn(Math, 'random').mockImplementation(createLCGPRNG(13));
    jest.spyOn(performance, 'now').mockReturnValue(1000);
    const field = new ButterflyField();

    // 100x100 at 10 px per tile => 10x10 tiles => 100 / 25 => 4 butterflies.
    field.resetForLevel(100, 100, 10, 'Grass', null);

    expect((field as unknown as ButterflyInternals)._butterflies).toHaveLength(4);
  });

  it('does not spawn butterflies on non-summer styles', () => {
    const field = new ButterflyField();
    field.resetForLevel(100, 100, 10, 'Dark', null);
    expect((field as unknown as ButterflyInternals)._butterflies).toHaveLength(0);
  });

  it('lands on granite when the body is fully inside a granite tile', () => {
    jest.spyOn(Math, 'random').mockImplementation(createLCGPRNG(29));
    jest.spyOn(performance, 'now').mockReturnValue(1000);
    const field = new ButterflyField();
    const board = {
      getTile: () => ({ shape: PipeShape.Granite }),
    };
    field.resetForLevel(30, 30, 10, 'Grass', board);

    const butterfly = (field as unknown as ButterflyInternals)._butterflies[0];
    butterfly.x = 15;
    butterfly.y = 15;
    butterfly.sizePx = 1;
    butterfly.heading = 0;
    butterfly.hasLanded = false;
    butterfly.isLanded = false;
    butterfly.segmentStartX = 15;
    butterfly.segmentStartY = 15;
    butterfly.segmentStartTime = 1000;
    butterfly.segmentDistancePx = 0;

    field.updateAndRender(createMockCtx(), 1001);

    expect(butterfly.hasLanded).toBe(true);
    expect(butterfly.isLanded).toBe(true);
  });

  it('despawns off-grid butterflies and respawns replacements', () => {
    jest.spyOn(Math, 'random').mockImplementation(createLCGPRNG(41));
    jest.spyOn(performance, 'now').mockReturnValue(1000);
    const field = new ButterflyField();
    field.resetForLevel(20, 20, 10, 'Grass', null);

    const before = (field as unknown as ButterflyInternals)._butterflies[0];
    before.x = -1000;
    before.y = -1000;

    field.updateAndRender(createMockCtx(), 1001);

    const after = (field as unknown as ButterflyInternals)._butterflies[0];
    expect((field as unknown as ButterflyInternals)._butterflies).toHaveLength(1);
    expect(after).not.toBe(before);
  });
});
