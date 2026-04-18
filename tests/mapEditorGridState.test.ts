/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for the MapEditorGridState shared helper.
 */

import { MapEditorGridState } from '../src/campaignEditor/mapEditorGridState';
import { PipeShape, Direction } from '../src/types';
import type { TileDef } from '../src/types';

// Keep TILE_SIZE stable by simulating a small viewport.
beforeAll(() => {
  Object.defineProperty(window, 'innerWidth',  { value: 0, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(rows = 3, cols = 6): MapEditorGridState {
  return new MapEditorGridState(rows, cols);
}

function tile(shape: PipeShape, connections?: Direction[]): TileDef {
  return connections ? { shape, connections } : { shape };
}

// ─── init ─────────────────────────────────────────────────────────────────────

describe('MapEditorGridState.init', () => {
  it('creates default grid when no saved data is given', () => {
    const s = makeState();
    s.init(undefined, undefined, undefined);
    expect(s.rows).toBe(3);
    expect(s.cols).toBe(6);
    // Source at [1][0]
    expect(s.grid[1][0]?.shape).toBe(PipeShape.Source);
    expect(s.grid[1][0]?.connections).toContain(Direction.East);
    // Sink at [1][last-col]
    expect(s.grid[1][5]?.shape).toBe(PipeShape.Sink);
    expect(s.grid[1][5]?.connections).toContain(Direction.West);
    expect(s.focusedTilePos).toBeNull();
  });

  it('restores from saved data', () => {
    const s = makeState();
    const g: (TileDef | null)[][] = [[tile(PipeShape.Granite), null], [null, null]];
    s.init(2, 2, g);
    expect(s.rows).toBe(2);
    expect(s.cols).toBe(2);
    expect(s.grid[0][0]?.shape).toBe(PipeShape.Granite);
    expect(s.focusedTilePos).toBeNull();
  });

  it('deep-clones the saved grid', () => {
    const s = makeState();
    const g: (TileDef | null)[][] = [[tile(PipeShape.Granite), null], [null, null]];
    s.init(2, 2, g);
    // Mutating the original should not affect the state's grid
    g[0][0] = null;
    expect(s.grid[0][0]?.shape).toBe(PipeShape.Granite);
  });

  it('resets focusedTilePos on re-init', () => {
    const s = makeState();
    s.init(undefined, undefined, undefined);
    s.focusedTilePos = { row: 1, col: 2 };
    s.init(undefined, undefined, undefined);
    expect(s.focusedTilePos).toBeNull();
  });
});

// ─── slide ────────────────────────────────────────────────────────────────────

describe('MapEditorGridState.slide', () => {
  it('slides East – col 0 is cleared', () => {
    const s = makeState(2, 3);
    s.init(2, 3, [[tile(PipeShape.Granite), null, null], [null, null, null]]);
    s.slide('E');
    expect(s.grid[0][0]).toBeNull();
    expect(s.grid[0][1]?.shape).toBe(PipeShape.Granite);
  });

  it('slides West – col 2 is cleared', () => {
    const s = makeState(2, 3);
    s.init(2, 3, [[null, null, tile(PipeShape.Granite)], [null, null, null]]);
    s.slide('W');
    expect(s.grid[0][2]).toBeNull();
    expect(s.grid[0][1]?.shape).toBe(PipeShape.Granite);
  });

  it('slides North – row 0 is cleared', () => {
    const s = makeState(3, 2);
    s.init(3, 2, [[tile(PipeShape.Granite), null], [null, null], [null, null]]);
    s.slide('N');
    // row 0 is cleared; tile moved to row -1 (discarded)
    // But North slides tiles up → tile at row 0 falls off → row 0 cleared
    // Actually slide N moves tiles up (row decrements). tile[0][0] → row -1 → dropped
    // grid[0][0] should be null after the slide
    expect(s.grid[0][0]).toBeNull();
  });

  it('slides South – row 0 tile moves to row 1', () => {
    const s = makeState(2, 2);
    s.init(2, 2, [[tile(PipeShape.Granite), null], [null, null]]);
    s.slide('S');
    expect(s.grid[1][0]?.shape).toBe(PipeShape.Granite);
    expect(s.grid[0][0]).toBeNull();
  });
});

// ─── rotate ───────────────────────────────────────────────────────────────────

describe('MapEditorGridState.rotate', () => {
  it('swaps rows and cols after CW rotation', () => {
    const s = makeState(2, 4);
    s.init(2, 4, [
      [tile(PipeShape.Granite), null, null, null],
      [null, null, null, null],
    ]);
    s.rotate(true);
    expect(s.rows).toBe(4);
    expect(s.cols).toBe(2);
  });

  it('updates focusedTilePos after rotation', () => {
    const s = makeState(2, 4);
    s.init(2, 4, [
      [tile(PipeShape.Granite), null, null, null],
      [null, null, null, null],
    ]);
    s.focusedTilePos = { row: 0, col: 0 };
    s.rotate(true); // CW: (r,c) → (c, rows-1-r)
    // For 2×4 CW: (0,0) → (0, 2-1-0) = (0, 1) actually depends on impl
    // We just assert it was updated (not still {0,0})
    // ... actually let's check from the rotatePositionBy90 definition:
    // CW: newRow = col, newCol = (oldRows - 1 - row)
    // (0,0) in 2×4 → newRow = 0, newCol = 2-1-0 = 1 → {row:0, col:1}
    expect(s.focusedTilePos).not.toBeNull();
    expect(s.focusedTilePos).toEqual({ row: 0, col: 1 });
  });
});

// ─── reflect ──────────────────────────────────────────────────────────────────

describe('MapEditorGridState.reflect', () => {
  it('swaps rows and cols', () => {
    const s = makeState(2, 4);
    s.init(2, 4, [
      [tile(PipeShape.Granite), null, null, null],
      [null, null, null, null],
    ]);
    s.reflect();
    expect(s.rows).toBe(4);
    expect(s.cols).toBe(2);
  });

  it('updates focusedTilePos: (r,c) → (c,r)', () => {
    const s = makeState(2, 4);
    s.init(2, 4, [
      [tile(PipeShape.Granite), null, null, null],
      [null, null, null, null],
    ]);
    s.focusedTilePos = { row: 1, col: 3 };
    s.reflect();
    expect(s.focusedTilePos).toEqual({ row: 3, col: 1 });
  });
});

// ─── flipHorizontal / flipVertical ────────────────────────────────────────────

describe('MapEditorGridState.flipHorizontal', () => {
  it('mirrors columns', () => {
    const s = makeState(2, 3);
    s.init(2, 3, [
      [tile(PipeShape.Granite), null, null],
      [null, null, null],
    ]);
    s.flipHorizontal();
    // col 0 → col 2
    expect(s.grid[0][2]?.shape).toBe(PipeShape.Granite);
    expect(s.grid[0][0]).toBeNull();
  });

  it('updates focusedTilePos: col → (cols-1-col)', () => {
    const s = makeState(2, 4);
    s.init(2, 4, [[null, null, null, null], [null, null, null, null]]);
    s.focusedTilePos = { row: 1, col: 0 };
    s.flipHorizontal();
    expect(s.focusedTilePos).toEqual({ row: 1, col: 3 });
  });
});

describe('MapEditorGridState.flipVertical', () => {
  it('mirrors rows', () => {
    const s = makeState(3, 2);
    s.init(3, 2, [
      [tile(PipeShape.Granite), null],
      [null, null],
      [null, null],
    ]);
    s.flipVertical();
    expect(s.grid[2][0]?.shape).toBe(PipeShape.Granite);
    expect(s.grid[0][0]).toBeNull();
  });

  it('updates focusedTilePos: row → (rows-1-row)', () => {
    const s = makeState(4, 2);
    s.init(4, 2, [[null,null],[null,null],[null,null],[null,null]]);
    s.focusedTilePos = { row: 0, col: 1 };
    s.flipVertical();
    expect(s.focusedTilePos).toEqual({ row: 3, col: 1 });
  });
});

// ─── resize ───────────────────────────────────────────────────────────────────

describe('MapEditorGridState.resize', () => {
  it('grows the grid, preserving existing tiles', () => {
    const s = makeState(2, 2);
    s.init(2, 2, [[tile(PipeShape.Granite), null], [null, null]]);
    s.resize(3, 3);
    expect(s.rows).toBe(3);
    expect(s.cols).toBe(3);
    expect(s.grid[0][0]?.shape).toBe(PipeShape.Granite);
  });

  it('shrinks the grid, dropping tiles that fall outside', () => {
    const s = makeState(2, 4);
    s.init(2, 4, [
      [null, null, null, tile(PipeShape.Granite)],
      [null, null, null, null],
    ]);
    s.resize(2, 2);
    expect(s.rows).toBe(2);
    expect(s.cols).toBe(2);
    expect(s.grid[0][2]).toBeUndefined();
  });
});

// ─── clearFocusIfAt ───────────────────────────────────────────────────────────

describe('MapEditorGridState.clearFocusIfAt', () => {
  it('clears focus when position matches', () => {
    const s = makeState(2, 2);
    s.init(2, 2, [[null,null],[null,null]]);
    s.focusedTilePos = { row: 0, col: 1 };
    s.clearFocusIfAt({ row: 0, col: 1 });
    expect(s.focusedTilePos).toBeNull();
  });

  it('does not clear when position does not match', () => {
    const s = makeState(2, 2);
    s.init(2, 2, [[null,null],[null,null]]);
    s.focusedTilePos = { row: 0, col: 1 };
    s.clearFocusIfAt({ row: 1, col: 0 });
    expect(s.focusedTilePos).toEqual({ row: 0, col: 1 });
  });

  it('does nothing when focusedTilePos is null', () => {
    const s = makeState(2, 2);
    s.init(2, 2, [[null,null],[null,null]]);
    expect(() => s.clearFocusIfAt({ row: 0, col: 0 })).not.toThrow();
  });
});
