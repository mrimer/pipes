/**
 * gridUtils – pure utility functions shared between the level editor and the
 * chapter map editor.  All functions are stateless: they take grid state as
 * parameters and return new values without mutating the inputs.
 */

import { TileDef, PipeShape } from '../types';

/**
 * Build a resized copy of `grid`, preserving tiles that still fit within the
 * new dimensions and filling new cells with `null`.
 */
export function resizeGrid(
  grid: (TileDef | null)[][],
  oldRows: number,
  oldCols: number,
  newRows: number,
  newCols: number,
): (TileDef | null)[][] {
  const newGrid: (TileDef | null)[][] = [];
  for (let r = 0; r < newRows; r++) {
    newGrid[r] = [];
    for (let c = 0; c < newCols; c++) {
      newGrid[r][c] = (r < oldRows && c < oldCols)
        ? (grid[r]?.[c] ?? null)
        : null;
    }
  }
  return newGrid;
}

/**
 * Slide all tiles one cell in the given direction, discarding tiles that fall
 * off the edge.  Returns a new grid; the original is not mutated.
 */
export function slideGrid(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  dir: 'N' | 'E' | 'S' | 'W',
): (TileDef | null)[][] {
  const newGrid: (TileDef | null)[][] = Array.from(
    { length: rows },
    () => Array(cols).fill(null) as null[],
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = grid[r]?.[c] ?? null;
      if (tile === null) continue;
      let nr = r;
      let nc = c;
      if (dir === 'N') nr = r - 1;
      else if (dir === 'S') nr = r + 1;
      else if (dir === 'W') nc = c - 1;
      else nc = c + 1; // E
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        newGrid[nr][nc] = tile;
      }
    }
  }
  return newGrid;
}

/**
 * Returns `true` if a tile with the given `shape` exists anywhere in `grid`
 * except at `excludePos` (when supplied).
 *
 * Used to enforce the one-Source / one-Sink constraints in both editors.
 */
export function hasShapeElsewhere(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  shape: PipeShape,
  excludePos?: { row: number; col: number },
): boolean {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (excludePos && r === excludePos.row && c === excludePos.col) continue;
      if (grid[r]?.[c]?.shape === shape) return true;
    }
  }
  return false;
}
