/** Tests for the shared BFS helpers in src/bfs.ts. */

import { bfs, bfsWithDepth } from '../src/bfs';
import { GridPos } from '../src/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a key string the same way bfs.ts does internally. */
function key(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Return the 4-connected grid neighbours of `pos` that lie within the bounds
 * [0, rows) × [0, cols).  All neighbours are passable (no obstacle mask).
 */
function gridNeighbors(rows: number, cols: number) {
  return (pos: GridPos): GridPos[] => {
    const result: GridPos[] = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const r = pos.row + dr;
      const c = pos.col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        result.push({ row: r, col: c });
      }
    }
    return result;
  };
}

/**
 * Return the 4-connected neighbours that are NOT in the `blocked` set
 * (keys as "row,col").
 */
function maskedNeighbors(rows: number, cols: number, blocked: Set<string>) {
  const base = gridNeighbors(rows, cols);
  return (pos: GridPos): GridPos[] =>
    base(pos).filter(p => !blocked.has(key(p.row, p.col)));
}

// ─── bfs ─────────────────────────────────────────────────────────────────────

describe('bfs', () => {
  it('includes the start position', () => {
    const result = bfs({ row: 0, col: 0 }, gridNeighbors(3, 3));
    expect(result.has(key(0, 0))).toBe(true);
    expect(result.get(key(0, 0))).toEqual({ row: 0, col: 0 });
  });

  it('visits all reachable positions in a fully-open 3×3 grid', () => {
    const result = bfs({ row: 0, col: 0 }, gridNeighbors(3, 3));
    expect(result.size).toBe(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(result.has(key(r, c))).toBe(true);
        expect(result.get(key(r, c))).toEqual({ row: r, col: c });
      }
    }
  });

  it('returns only the start when getNeighbors always returns []', () => {
    const result = bfs({ row: 2, col: 2 }, () => []);
    expect(result.size).toBe(1);
    expect(result.has(key(2, 2))).toBe(true);
  });

  it('respects a wall (blocked cell) in the middle of the grid', () => {
    // 1×5 corridor with the middle cell blocked:  [0,0] [0,1] X [0,3] [0,4]
    const blocked = new Set<string>([key(0, 2)]);
    const result = bfs({ row: 0, col: 0 }, maskedNeighbors(1, 5, blocked));
    expect(result.size).toBe(2); // only (0,0) and (0,1)
    expect(result.has(key(0, 0))).toBe(true);
    expect(result.has(key(0, 1))).toBe(true);
    expect(result.has(key(0, 2))).toBe(false);
    expect(result.has(key(0, 3))).toBe(false);
  });

  it('visits disconnected island only from the correct start', () => {
    // 1×5 corridor split by wall at col 2
    const blocked = new Set<string>([key(0, 2)]);
    const getN = maskedNeighbors(1, 5, blocked);

    const fromLeft = bfs({ row: 0, col: 0 }, getN);
    expect(fromLeft.has(key(0, 3))).toBe(false);

    const fromRight = bfs({ row: 0, col: 3 }, getN);
    expect(fromRight.has(key(0, 0))).toBe(false);
    expect(fromRight.has(key(0, 3))).toBe(true);
    expect(fromRight.has(key(0, 4))).toBe(true);
  });

  it('produces keys compatible with the posKey format from board.ts', () => {
    // board.ts posKey(r, c) === `${r},${c}` — verify keys match
    const result = bfs({ row: 1, col: 3 }, gridNeighbors(3, 5));
    // All keys should match the "row,col" format
    for (const [k, pos] of result) {
      expect(k).toBe(`${pos.row},${pos.col}`);
    }
  });

  it('returns a Map whose iteration order is BFS discovery order', () => {
    // In a 1-D corridor [0,0]→[0,1]→[0,2], BFS from (0,0) visits in order.
    const result = bfs({ row: 0, col: 0 }, gridNeighbors(1, 3));
    const keys = [...result.keys()];
    expect(keys[0]).toBe(key(0, 0));
    expect(keys[1]).toBe(key(0, 1));
    expect(keys[2]).toBe(key(0, 2));
  });
});

// ─── bfsWithDepth ────────────────────────────────────────────────────────────

describe('bfsWithDepth', () => {
  it('gives the start position depth 0', () => {
    const result = bfsWithDepth({ row: 0, col: 0 }, gridNeighbors(3, 3));
    expect(result.get(key(0, 0))).toBe(0);
  });

  it('gives correct depths in a 1-D corridor', () => {
    // [0,0]─[0,1]─[0,2]─[0,3]
    const result = bfsWithDepth({ row: 0, col: 0 }, gridNeighbors(1, 4));
    expect(result.get(key(0, 0))).toBe(0);
    expect(result.get(key(0, 1))).toBe(1);
    expect(result.get(key(0, 2))).toBe(2);
    expect(result.get(key(0, 3))).toBe(3);
  });

  it('gives depth 1 to all 4-connected neighbours of the centre in a 3×3 grid', () => {
    const result = bfsWithDepth({ row: 1, col: 1 }, gridNeighbors(3, 3));
    // Center
    expect(result.get(key(1, 1))).toBe(0);
    // Cardinal neighbours
    expect(result.get(key(0, 1))).toBe(1);
    expect(result.get(key(2, 1))).toBe(1);
    expect(result.get(key(1, 0))).toBe(1);
    expect(result.get(key(1, 2))).toBe(1);
    // Corners
    expect(result.get(key(0, 0))).toBe(2);
    expect(result.get(key(0, 2))).toBe(2);
    expect(result.get(key(2, 0))).toBe(2);
    expect(result.get(key(2, 2))).toBe(2);
  });

  it('visits all 9 cells in an open 3×3 grid', () => {
    const result = bfsWithDepth({ row: 0, col: 0 }, gridNeighbors(3, 3));
    expect(result.size).toBe(9);
  });

  it('returns only start (depth 0) when no neighbours exist', () => {
    const result = bfsWithDepth({ row: 5, col: 5 }, () => []);
    expect(result.size).toBe(1);
    expect(result.get(key(5, 5))).toBe(0);
  });

  it('does not reach blocked cells', () => {
    // 1×5 corridor with wall at col 2
    const blocked = new Set<string>([key(0, 2)]);
    const result = bfsWithDepth({ row: 0, col: 0 }, maskedNeighbors(1, 5, blocked));
    expect(result.has(key(0, 2))).toBe(false);
    expect(result.has(key(0, 3))).toBe(false);
    expect(result.get(key(0, 1))).toBe(1);
  });

  it('assigns minimum (shortest-path) depth in a grid with shortcuts', () => {
    // 3×3 grid, start at (0,0).
    // (0,0)→(1,0)→(2,0)→(2,1)→(2,2) is length 4 to reach (2,2).
    // (0,0)→(0,1)→(0,2)→(1,2)→(2,2) is also length 4.
    // (0,0)→(0,1)→(1,1)→(2,1)→(2,2) is length 4 too.
    // BFS ensures minimum distance = 4.
    const result = bfsWithDepth({ row: 0, col: 0 }, gridNeighbors(3, 3));
    expect(result.get(key(2, 2))).toBe(4);
  });
});
