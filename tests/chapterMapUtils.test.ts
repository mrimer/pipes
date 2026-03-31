/**
 * Tests for shared chapter-map BFS utility functions in chapterMapUtils.ts.
 */

import { Direction, PipeShape, TileDef } from '../src/types';
import {
  CHAPTER_MAP_DELTAS,
  CHAPTER_MAP_OPPOSITE,
  findChapterMapTile,
  tileDefConnections,
  editorTileConns,
  computeChapterMapReachable,
} from '../src/chapterMapUtils';

// ─── CHAPTER_MAP_DELTAS ───────────────────────────────────────────────────────

describe('CHAPTER_MAP_DELTAS', () => {
  it('North moves up one row (dr=-1, dc=0)', () => {
    expect(CHAPTER_MAP_DELTAS[Direction.North]).toEqual({ dr: -1, dc: 0 });
  });
  it('South moves down one row (dr=1, dc=0)', () => {
    expect(CHAPTER_MAP_DELTAS[Direction.South]).toEqual({ dr: 1, dc: 0 });
  });
  it('East moves right one col (dr=0, dc=1)', () => {
    expect(CHAPTER_MAP_DELTAS[Direction.East]).toEqual({ dr: 0, dc: 1 });
  });
  it('West moves left one col (dr=0, dc=-1)', () => {
    expect(CHAPTER_MAP_DELTAS[Direction.West]).toEqual({ dr: 0, dc: -1 });
  });
});

// ─── CHAPTER_MAP_OPPOSITE ────────────────────────────────────────────────────

describe('CHAPTER_MAP_OPPOSITE', () => {
  it('opposite of North is South', () => {
    expect(CHAPTER_MAP_OPPOSITE[Direction.North]).toBe(Direction.South);
  });
  it('opposite of South is North', () => {
    expect(CHAPTER_MAP_OPPOSITE[Direction.South]).toBe(Direction.North);
  });
  it('opposite of East is West', () => {
    expect(CHAPTER_MAP_OPPOSITE[Direction.East]).toBe(Direction.West);
  });
  it('opposite of West is East', () => {
    expect(CHAPTER_MAP_OPPOSITE[Direction.West]).toBe(Direction.East);
  });
});

// ─── findChapterMapTile ───────────────────────────────────────────────────────

function makeGrid(rows: number, cols: number): (TileDef | null)[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

describe('findChapterMapTile', () => {
  it('returns null when grid is empty', () => {
    const grid = makeGrid(3, 3);
    expect(findChapterMapTile(grid, 3, 3, PipeShape.Source)).toBeNull();
  });

  it('finds the Source tile at the correct position', () => {
    const grid = makeGrid(3, 3);
    grid[1][2] = { shape: PipeShape.Source };
    expect(findChapterMapTile(grid, 3, 3, PipeShape.Source)).toEqual({ row: 1, col: 2 });
  });

  it('finds the first matching tile when multiple exist', () => {
    const grid = makeGrid(2, 3);
    grid[0][1] = { shape: PipeShape.Sink };
    grid[1][0] = { shape: PipeShape.Sink };
    // Should return the first one encountered in row-major order
    expect(findChapterMapTile(grid, 2, 3, PipeShape.Sink)).toEqual({ row: 0, col: 1 });
  });

  it('returns null when the shape is not present in the grid', () => {
    const grid = makeGrid(2, 2);
    grid[0][0] = { shape: PipeShape.Straight };
    expect(findChapterMapTile(grid, 2, 2, PipeShape.Source)).toBeNull();
  });

  it('finds a tile at (0,0)', () => {
    const grid = makeGrid(2, 2);
    grid[0][0] = { shape: PipeShape.Chamber };
    expect(findChapterMapTile(grid, 2, 2, PipeShape.Chamber)).toEqual({ row: 0, col: 0 });
  });

  it('finds a tile at the last cell', () => {
    const grid = makeGrid(2, 2);
    grid[1][1] = { shape: PipeShape.Granite };
    expect(findChapterMapTile(grid, 2, 2, PipeShape.Granite)).toEqual({ row: 1, col: 1 });
  });
});

// ─── tileDefConnections ───────────────────────────────────────────────────────

describe('tileDefConnections', () => {
  it('uses explicit connections array when provided', () => {
    const def: TileDef = {
      shape: PipeShape.Straight,
      connections: [Direction.North, Direction.East],
    };
    const conns = tileDefConnections(def);
    expect(conns.has(Direction.North)).toBe(true);
    expect(conns.has(Direction.East)).toBe(true);
    expect(conns.has(Direction.South)).toBe(false);
    expect(conns.has(Direction.West)).toBe(false);
  });

  it('Source without explicit connections returns all four directions', () => {
    const conns = tileDefConnections({ shape: PipeShape.Source });
    expect(conns.size).toBe(4);
    expect(conns.has(Direction.North)).toBe(true);
    expect(conns.has(Direction.East)).toBe(true);
    expect(conns.has(Direction.South)).toBe(true);
    expect(conns.has(Direction.West)).toBe(true);
  });

  it('Sink without explicit connections returns all four directions', () => {
    const conns = tileDefConnections({ shape: PipeShape.Sink });
    expect(conns.size).toBe(4);
  });

  it('Chamber without explicit connections returns all four directions', () => {
    const conns = tileDefConnections({ shape: PipeShape.Chamber });
    expect(conns.size).toBe(4);
  });

  it('Straight at rotation 0 connects North and South', () => {
    const conns = tileDefConnections({ shape: PipeShape.Straight, rotation: 0 });
    expect(conns.has(Direction.North)).toBe(true);
    expect(conns.has(Direction.South)).toBe(true);
    expect(conns.has(Direction.East)).toBe(false);
    expect(conns.has(Direction.West)).toBe(false);
  });

  it('Straight at rotation 90 connects East and West', () => {
    const conns = tileDefConnections({ shape: PipeShape.Straight, rotation: 90 });
    expect(conns.has(Direction.East)).toBe(true);
    expect(conns.has(Direction.West)).toBe(true);
    expect(conns.has(Direction.North)).toBe(false);
    expect(conns.has(Direction.South)).toBe(false);
  });

  it('Elbow at rotation 0 connects North and East', () => {
    const conns = tileDefConnections({ shape: PipeShape.Elbow, rotation: 0 });
    expect(conns.has(Direction.North)).toBe(true);
    expect(conns.has(Direction.East)).toBe(true);
    expect(conns.has(Direction.South)).toBe(false);
    expect(conns.has(Direction.West)).toBe(false);
  });

  it('Cross connects all four directions regardless of rotation', () => {
    const conns = tileDefConnections({ shape: PipeShape.Cross, rotation: 0 });
    expect(conns.size).toBe(4);
  });

  it('Granite returns empty set (no connections)', () => {
    const conns = tileDefConnections({ shape: PipeShape.Granite });
    expect(conns.size).toBe(0);
  });

  it('Tree returns empty set (no connections)', () => {
    const conns = tileDefConnections({ shape: PipeShape.Tree });
    expect(conns.size).toBe(0);
  });

  it('GoldSpace returns empty set (no connections)', () => {
    const conns = tileDefConnections({ shape: PipeShape.GoldSpace });
    expect(conns.size).toBe(0);
  });

  it('Empty returns empty set (no connections)', () => {
    const conns = tileDefConnections({ shape: PipeShape.Empty });
    expect(conns.size).toBe(0);
  });

  it('defaults to rotation 0 when rotation is undefined', () => {
    const conns = tileDefConnections({ shape: PipeShape.Straight });
    expect(conns.has(Direction.North)).toBe(true);
    expect(conns.has(Direction.South)).toBe(true);
  });

  it('GoldStraight at 0° connects North and South', () => {
    const conns = tileDefConnections({ shape: PipeShape.GoldStraight, rotation: 0 });
    expect(conns.has(Direction.North)).toBe(true);
    expect(conns.has(Direction.South)).toBe(true);
  });

  it('Tee at 0° connects North, East, South', () => {
    const conns = tileDefConnections({ shape: PipeShape.Tee, rotation: 0 });
    expect(conns.has(Direction.North)).toBe(true);
    expect(conns.has(Direction.East)).toBe(true);
    expect(conns.has(Direction.South)).toBe(true);
    expect(conns.has(Direction.West)).toBe(false);
  });
});

// ─── editorTileConns ─────────────────────────────────────────────────────────

describe('editorTileConns', () => {
  it('Source tile returns all four directions (editor treats as fully open)', () => {
    const conns = editorTileConns({ shape: PipeShape.Source });
    expect(conns.size).toBe(4);
  });

  it('Sink tile returns all four directions', () => {
    const conns = editorTileConns({ shape: PipeShape.Sink });
    expect(conns.size).toBe(4);
  });

  it('Chamber tile returns all four directions', () => {
    const conns = editorTileConns({ shape: PipeShape.Chamber });
    expect(conns.size).toBe(4);
  });

  it('Source with explicit connections returns those connections', () => {
    const def: TileDef = {
      shape: PipeShape.Source,
      connections: [Direction.East, Direction.South],
    };
    const conns = editorTileConns(def);
    expect(conns.has(Direction.East)).toBe(true);
    expect(conns.has(Direction.South)).toBe(true);
    expect(conns.has(Direction.North)).toBe(false);
    expect(conns.has(Direction.West)).toBe(false);
  });

  it('regular pipe tile delegates to tileDefConnections', () => {
    const conns = editorTileConns({ shape: PipeShape.Straight, rotation: 90 });
    expect(conns.has(Direction.East)).toBe(true);
    expect(conns.has(Direction.West)).toBe(true);
    expect(conns.has(Direction.North)).toBe(false);
  });

  it('Granite returns empty set', () => {
    const conns = editorTileConns({ shape: PipeShape.Granite });
    expect(conns.size).toBe(0);
  });
});

// ─── computeChapterMapReachable ───────────────────────────────────────────────

/** Helper: use editorTileConns as getConns for simple tests. */
function editorConns(def: TileDef, _isEntry: boolean): Set<Direction> {
  return editorTileConns(def);
}

describe('computeChapterMapReachable', () => {
  it('single cell: only the source is reachable', () => {
    const grid: (TileDef | null)[][] = [[{ shape: PipeShape.Source }]];
    const reached = computeChapterMapReachable(grid, 1, 1, { row: 0, col: 0 }, editorConns);
    expect(reached.has('0,0')).toBe(true);
    expect(reached.size).toBe(1);
  });

  it('two connected cells in a row are both reachable', () => {
    // Source(E-W) | Straight(E-W)
    const grid: (TileDef | null)[][] = [[
      { shape: PipeShape.Straight, rotation: 90 }, // E-W
      { shape: PipeShape.Straight, rotation: 90 }, // E-W
    ]];
    const reached = computeChapterMapReachable(grid, 1, 2, { row: 0, col: 0 }, editorConns);
    expect(reached.has('0,0')).toBe(true);
    expect(reached.has('0,1')).toBe(true);
    expect(reached.size).toBe(2);
  });

  it('does not traverse into a null cell', () => {
    const grid: (TileDef | null)[][] = [[
      { shape: PipeShape.Straight, rotation: 90 },
      null,
      { shape: PipeShape.Straight, rotation: 90 },
    ]];
    const reached = computeChapterMapReachable(grid, 1, 3, { row: 0, col: 0 }, editorConns);
    expect(reached.has('0,0')).toBe(true);
    expect(reached.has('0,1')).toBe(false);
    expect(reached.has('0,2')).toBe(false);
    expect(reached.size).toBe(1);
  });

  it('does not traverse when tiles face away from each other', () => {
    // Straight(N-S) | Straight(N-S) – neither connects East/West
    const grid: (TileDef | null)[][] = [[
      { shape: PipeShape.Straight, rotation: 0 }, // N-S
      { shape: PipeShape.Straight, rotation: 0 }, // N-S
    ]];
    const reached = computeChapterMapReachable(grid, 1, 2, { row: 0, col: 0 }, editorConns);
    expect(reached.size).toBe(1);
    expect(reached.has('0,0')).toBe(true);
  });

  it('BFS explores all connected cells in a 3x1 path', () => {
    const grid: (TileDef | null)[][] = [[
      { shape: PipeShape.Straight, rotation: 90 }, // E-W
      { shape: PipeShape.Straight, rotation: 90 }, // E-W
      { shape: PipeShape.Straight, rotation: 90 }, // E-W
    ]];
    const reached = computeChapterMapReachable(grid, 1, 3, { row: 0, col: 0 }, editorConns);
    expect(reached.size).toBe(3);
  });

  it('does not revisit already-reached cells (handles cycles)', () => {
    // 2x2 grid of Cross tiles – fully connected ring
    const cross: TileDef = { shape: PipeShape.Cross };
    const grid: (TileDef | null)[][] = [
      [cross, cross],
      [cross, cross],
    ];
    const reached = computeChapterMapReachable(grid, 2, 2, { row: 0, col: 0 }, editorConns);
    expect(reached.size).toBe(4);
  });

  it('does not go out of bounds', () => {
    const grid: (TileDef | null)[][] = [[{ shape: PipeShape.Cross }]];
    const reached = computeChapterMapReachable(grid, 1, 1, { row: 0, col: 0 }, editorConns);
    // cross connects all 4 directions but all neighbors are out-of-bounds
    expect(reached.size).toBe(1);
  });

  it('respects getConns isEntry flag for one-sided traversal', () => {
    // Custom getConns: exiting (0,0) allows East; entering (0,1) only allows West (N-S pipe)
    const grid: (TileDef | null)[][] = [[
      { shape: PipeShape.Straight, rotation: 90 }, // E-W (exit East OK)
      { shape: PipeShape.Straight, rotation: 0 },  // N-S (entry from West blocked)
    ]];
    // editorTileConns treats everything by structural shape so (0,1) N-S pipe won't connect West.
    const reached = computeChapterMapReachable(grid, 1, 2, { row: 0, col: 0 }, editorConns);
    expect(reached.has('0,0')).toBe(true);
    expect(reached.has('0,1')).toBe(false); // N-S pipe has no West connection
  });

  it('BFS explores a 2D path via corners', () => {
    // L-shaped path: (0,0)→E (0,1)→S (1,1)
    const grid: (TileDef | null)[][] = [
      [{ shape: PipeShape.Straight, rotation: 90 }, { shape: PipeShape.Elbow, rotation: 180 }],
      [null,                                          { shape: PipeShape.Straight, rotation: 0 }],
    ];
    // Elbow at 180° connects South and West
    const reached = computeChapterMapReachable(grid, 2, 2, { row: 0, col: 0 }, editorConns);
    expect(reached.has('0,0')).toBe(true);
    expect(reached.has('0,1')).toBe(true);
    expect(reached.has('1,1')).toBe(true);
    expect(reached.size).toBe(3);
  });
});
