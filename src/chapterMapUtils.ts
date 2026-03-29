/**
 * Shared utilities for BFS traversal of a chapter map grid.
 * Used by both the gameplay chapter map screen and the campaign editor validation.
 */

import { Direction, TileDef } from './types';

/** Grid-delta for each cardinal direction. */
export const CHAPTER_MAP_DELTAS: Record<Direction, { dr: number; dc: number }> = {
  [Direction.North]: { dr: -1, dc:  0 },
  [Direction.East]:  { dr:  0, dc:  1 },
  [Direction.South]: { dr:  1, dc:  0 },
  [Direction.West]:  { dr:  0, dc: -1 },
};

/** Opposite direction for each cardinal direction. */
export const CHAPTER_MAP_OPPOSITE: Record<Direction, Direction> = {
  [Direction.North]: Direction.South,
  [Direction.East]:  Direction.West,
  [Direction.South]: Direction.North,
  [Direction.West]:  Direction.East,
};

/**
 * BFS from `sourcePos` through the chapter map grid.
 * Returns the set of reachable cell keys as "row,col" strings.
 *
 * @param grid       Chapter map grid (row-major; null = empty cell).
 * @param rows       Number of grid rows.
 * @param cols       Number of grid columns.
 * @param sourcePos  Starting cell position.
 * @param getConns   Returns the active connections for a tile.
 *                   `isEntry` is true when the cell is being entered for the first time
 *                   (used to distinguish "enters a level chamber" vs "exits through it").
 */
export function computeChapterMapReachable(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  sourcePos: { row: number; col: number },
  getConns: (def: TileDef, isEntry: boolean) => Set<Direction>,
): Set<string> {
  const reached = new Set<string>();
  const queue: Array<{ row: number; col: number }> = [sourcePos];
  reached.add(`${sourcePos.row},${sourcePos.col}`);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDef = grid[cur.row]?.[cur.col];
    if (!curDef) continue;
    const curConns = getConns(curDef, false);
    for (const dir of curConns) {
      const d = CHAPTER_MAP_DELTAS[dir];
      const nr = cur.row + d.dr;
      const nc = cur.col + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const key = `${nr},${nc}`;
      if (reached.has(key)) continue;
      const nbDef = grid[nr]?.[nc];
      if (!nbDef) continue;
      const nbConns = getConns(nbDef, true);
      if (!nbConns.has(CHAPTER_MAP_OPPOSITE[dir])) continue;
      reached.add(key);
      queue.push({ row: nr, col: nc });
    }
  }

  return reached;
}
