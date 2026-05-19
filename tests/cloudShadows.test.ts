/**
 * @jest-environment jsdom
 */

import { CampaignBirdFlockField, CloudShadowField } from '../src/visuals/cloudShadows';

interface CloudShadowFieldInternals {
  _clouds: Array<{ x: number; y: number }>;
  _dirX: number;
  _dirY: number;
  _spawnCloud: (options?: { allowGroup?: boolean }) => boolean;
}

interface BirdFlockTestShape {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  angle: number;
  speedPxPerMs: number;
  birds: Array<{ offsetAlong: number; offsetAcross: number; size: number; strokeWidth: number }>;
  boundingRadius: number;
  hasEntered: boolean;
  flapCooldownMs: number;
  flapDurationMs: number;
  flapElapsedMs: number;
  flapBeats: number;
  baseSize: number;
  baseStrokeWidth: number;
}

interface CampaignBirdFlockInternals {
  _isFlockFullyOffscreen: (flock: BirdFlockTestShape, margin: number) => boolean;
}

function createLCGPRNG(seed = 12345): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function computeCloudEntryEdge(
  cloud: { x: number; y: number },
  dirX: number,
  dirY: number,
  width: number,
  height: number,
): 'top' | 'right' | 'bottom' | 'left' | null {
  const intersections: Array<{ edge: 'top' | 'right' | 'bottom' | 'left'; t: number }> = [];
  const addIntersection = (edge: 'top' | 'right' | 'bottom' | 'left', t: number, x: number, y: number): void => {
    if (t < 0) return;
    const epsilon = 1e-6;
    if (x < -epsilon || x > width + epsilon || y < -epsilon || y > height + epsilon) return;
    intersections.push({ edge, t });
  };

  if (Math.abs(dirX) > 1e-6) {
    const leftT = (0 - cloud.x) / dirX;
    addIntersection('left', leftT, 0, cloud.y + dirY * leftT);
    const rightT = (width - cloud.x) / dirX;
    addIntersection('right', rightT, width, cloud.y + dirY * rightT);
  }
  if (Math.abs(dirY) > 1e-6) {
    const topT = (0 - cloud.y) / dirY;
    addIntersection('top', topT, cloud.x + dirX * topT, 0);
    const bottomT = (height - cloud.y) / dirY;
    addIntersection('bottom', bottomT, cloud.x + dirX * bottomT, height);
  }

  intersections.sort((a, b) => a.t - b.t);
  return intersections[0]?.edge ?? null;
}

describe('CloudShadowField', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('pre-seeds campaign maps at one cloud per ten tiles', () => {
    jest.spyOn(Math, 'random').mockImplementation(createLCGPRNG(17));
    const field = new CloudShadowField();

    field.resetForScreen(20, 10, 1, 'campaign');

    expect((field as unknown as CloudShadowFieldInternals)._clouds).toHaveLength(20);
  });

  it('spawns new clouds from one of the two incoming edges', () => {
    jest.spyOn(Math, 'random').mockImplementation(createLCGPRNG(91));
    const field = new CloudShadowField();
    field.resetForScreen(120, 80, 1, 'chapter');

    const internals = field as unknown as CloudShadowFieldInternals;
    internals._clouds = [];

    expect(internals._spawnCloud({ allowGroup: false })).toBe(true);

    const cloud = internals._clouds[0];
    const incomingEdges = new Set([
      internals._dirX >= 0 ? 'left' : 'right',
      internals._dirY >= 0 ? 'top' : 'bottom',
    ]);

    expect(
      computeCloudEntryEdge(cloud, internals._dirX, internals._dirY, 120, 80),
    ).not.toBeNull();
    expect(
      incomingEdges.has(computeCloudEntryEdge(cloud, internals._dirX, internals._dirY, 120, 80) ?? 'left'),
    ).toBe(true);
  });
});

describe('CampaignBirdFlockField', () => {
  it('keeps a right-moving flock alive until trailing birds fully exit the board', () => {
    const field = new CampaignBirdFlockField();
    field.resetForScreen(100, 100, 10, 'campaign');
    const internals = field as unknown as CampaignBirdFlockInternals;

    const flock: BirdFlockTestShape = {
      x: 130,
      y: 50,
      dirX: 1,
      dirY: 0,
      angle: 0,
      speedPxPerMs: 0,
      birds: [
        { offsetAlong: 0, offsetAcross: 0, size: 10, strokeWidth: 2 },
        { offsetAlong: -40, offsetAcross: 0, size: 10, strokeWidth: 2 },
      ],
      boundingRadius: 0,
      hasEntered: true,
      flapCooldownMs: 0,
      flapDurationMs: 0,
      flapElapsedMs: 0,
      flapBeats: 0,
      baseSize: 10,
      baseStrokeWidth: 2,
    };

    expect(internals._isFlockFullyOffscreen(flock, 0)).toBe(false);
    flock.x = 160;
    expect(internals._isFlockFullyOffscreen(flock, 0)).toBe(true);
  });

  it('uses rendered stamp size so larger scaled birds do not despawn early at the edge', () => {
    const field = new CampaignBirdFlockField();
    field.resetForScreen(100, 100, 10, 'campaign');
    const internals = field as unknown as CampaignBirdFlockInternals;

    const flock: BirdFlockTestShape = {
      x: 132,
      y: 50,
      dirX: 1,
      dirY: 0,
      angle: 0,
      speedPxPerMs: 0,
      birds: [
        { offsetAlong: 0, offsetAcross: 0, size: 20, strokeWidth: 2.2 },
      ],
      boundingRadius: 0,
      hasEntered: true,
      flapCooldownMs: 0,
      flapDurationMs: 0,
      flapElapsedMs: 0,
      flapBeats: 0,
      baseSize: 10,
      baseStrokeWidth: 2.2,
    };

    expect(internals._isFlockFullyOffscreen(flock, 0)).toBe(false);
    flock.x = 135;
    expect(internals._isFlockFullyOffscreen(flock, 0)).toBe(true);
  });
});
