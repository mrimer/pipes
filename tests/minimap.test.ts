/**
 * @jest-environment jsdom
 */

/**
 * Tests for minimap.ts – renderMinimap and the internal tileColor/pipeLineColors
 * helpers (exercised indirectly through renderMinimap with a mocked canvas).
 *
 * jsdom does not implement CanvasRenderingContext2D, so we install a minimal
 * canvas mock that records calls to fillRect / fillStyle.
 */

import { PipeShape, Direction } from '../src/types';
import { LevelDef } from '../src/types';
import { renderMinimap } from '../src/visuals/minimap';

// ─── Canvas mock setup ────────────────────────────────────────────────────────

interface FillCall { style: string; x: number; y: number; w: number; h: number }

class FakeContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  fills: FillCall[] = [];
  strokes: Array<unknown[]> = [];
  arcs: Array<{ style: string; cx: number; cy: number; r: number }> = [];

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({ style: this.fillStyle, x, y, w, h });
  }
  beginPath(): void { /* no-op */ }
  moveTo(): void { /* no-op */ }
  lineTo(): void { /* no-op */ }
  stroke(): void { this.strokes.push([]); }
  arc(cx: number, cy: number, r: number): void {
    this.arcs.push({ style: this.fillStyle, cx, cy, r });
  }
  fill(): void { /* no-op */ }
}

function installCanvasMock(): FakeContext {
  const ctx = new FakeContext();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ctx,
  });
  return ctx;
}

beforeEach(() => {
  installCanvasMock();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLevel(
  rows: number,
  cols: number,
  grid: (import('../src/types').TileDef | null)[][],
): LevelDef {
  return { id: 1, name: 'test', rows, cols, grid, inventory: [] };
}

// ─── renderMinimap: basic return value ───────────────────────────────────────

describe('renderMinimap: return value', () => {
  it('returns an HTMLCanvasElement', () => {
    const level = makeLevel(2, 2, [[null, null], [null, null]]);
    const canvas = renderMinimap(level);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('canvas dimensions include border pixels on each side', () => {
    // 3 rows × 3 cols; with TARGET_SIZE=100 and maxDim=3, px = floor(100/3) = 33
    // totalW = 3*33 + 2*2 = 103; totalH = 3*33 + 2*2 = 103
    const level = makeLevel(3, 3, [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
    const canvas = renderMinimap(level);
    expect(canvas.width).toBe(103);
    expect(canvas.height).toBe(103);
  });

  it('handles a 1×1 grid', () => {
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Source }]]);
    const canvas = renderMinimap(level);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });
});

// ─── renderMinimap: tileColor paths (exercised indirectly) ───────────────────

describe('renderMinimap: tileColor coverage via fills', () => {
  it('draws a fill for each tile in an all-null grid', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(2, 2, [[null, null], [null, null]]);
    renderMinimap(level);
    // Should have a white border fill + 4 tile fills
    expect(ctx.fills.length).toBeGreaterThanOrEqual(5);
  });

  it('draws a fill for a Source tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Source }]]);
    renderMinimap(level);
    // Should include at least two fills: border + the source tile
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws a fill for a Sink tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Sink }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws a fill for a Granite tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Granite }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws a fill for a Cement tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Cement }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws a fill for a GoldSpace tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.GoldSpace }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws a fill for a Tree tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Tree }]]);
    renderMinimap(level);
    // Tree tiles: background fill + arc (circle) call
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
    expect(ctx.arcs.length).toBeGreaterThanOrEqual(1);
  });

  it('draws chamber tiles with appropriate fills', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 4, [[
      { shape: PipeShape.Chamber, chamberContent: 'tank' },
      { shape: PipeShape.Chamber, chamberContent: 'dirt' },
      { shape: PipeShape.Chamber, chamberContent: 'heater' },
      { shape: PipeShape.Chamber, chamberContent: 'ice' },
    ]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(5);
  });

  it('draws chamber pump/snow/hot_plate/sandstone/star tiles', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 5, [[
      { shape: PipeShape.Chamber, chamberContent: 'pump' },
      { shape: PipeShape.Chamber, chamberContent: 'snow' },
      { shape: PipeShape.Chamber, chamberContent: 'hot_plate' },
      { shape: PipeShape.Chamber, chamberContent: 'sandstone' },
      { shape: PipeShape.Chamber, chamberContent: 'star' },
    ]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(6);
  });

  it('draws chamber item tiles (uses CONTAINER_COLOR)', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[
      { shape: PipeShape.Chamber, chamberContent: 'item' },
    ]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws SpinStraight tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.SpinStraight, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws LeakyStraight tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.LeakyStraight, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });

  it('draws GoldStraight tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.GoldStraight, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── renderMinimap: pipe line art (large grids give px >= 3) ─────────────────

describe('renderMinimap: pipe line art paths', () => {
  // For a 1×1 grid, px = floor(60/1) = 60 ≥ MIN_PX_FOR_LINES=3 → pipe line art
  it('draws pipe line art (multiple fills) for a Straight tile on a small grid', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Straight, rotation: 0 }]]);
    renderMinimap(level);
    // Border + bg fill + line fill(s) for connected directions
    expect(ctx.fills.length).toBeGreaterThanOrEqual(3);
  });

  it('draws pipe line art for an Elbow tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Elbow, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(3);
  });

  it('draws pipe line art for a Cross tile (4 connections)', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Cross, rotation: 0 }]]);
    renderMinimap(level);
    // border + bg + 4 line fills = at least 6
    expect(ctx.fills.length).toBeGreaterThanOrEqual(6);
  });

  it('draws pipe line art for GoldElbow tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.GoldElbow, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(3);
  });

  it('draws pipe line art for SpinElbow tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.SpinElbow, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(3);
  });

  it('draws pipe line art for SpinStraightCement tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.SpinStraightCement, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(3);
  });

  it('draws pipe line art for LeakyElbow tile', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.LeakyElbow, rotation: 0 }]]);
    renderMinimap(level);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(3);
  });

  it('draws OneWay tile chevron (stroke calls on small grid)', () => {
    const ctx = installCanvasMock();
    const level = makeLevel(1, 1, [[{ shape: PipeShape.OneWay, rotation: 0 }]]);
    renderMinimap(level);
    // drawOneWayChevron calls stroke() once
    expect(ctx.strokes.length).toBeGreaterThanOrEqual(1);
  });

  it('draws OneWay tile chevron for all rotations', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const ctx = installCanvasMock();
      const level = makeLevel(1, 1, [[{ shape: PipeShape.OneWay, rotation }]]);
      renderMinimap(level);
      expect(ctx.strokes.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── renderMinimap: graceful degradation when ctx is null ────────────────────

describe('renderMinimap: null canvas context', () => {
  it('returns the canvas element even when getContext returns null', () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
    const level = makeLevel(1, 1, [[{ shape: PipeShape.Source }]]);
    const canvas = renderMinimap(level);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });
});
