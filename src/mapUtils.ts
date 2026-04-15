/**
 * Shared utilities for BFS traversal of chapter/campaign map grids.
 */

import { Direction, TileDef, Rotation, PipeShape } from './types';
import { Tile } from './tile';
import { PIPE_SHAPES } from './board';
import { bfs } from './bfs';

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

/** Find the first tile with the given shape in the grid. */
export function findMapTile(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  shape: PipeShape,
): { row: number; col: number } | null {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r]?.[c]?.shape === shape) return { row: r, col: c };
    }
  }
  return null;
}

/** Returns the active connections for a tile in editor reachability checks. */
export function editorTileConns(def: TileDef): Set<Direction> {
  if (def.connections) return new Set(def.connections);
  if (
    def.shape === PipeShape.Source ||
    def.shape === PipeShape.Sink ||
    def.shape === PipeShape.Chamber
  ) {
    return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
  }
  return tileDefConnections(def);
}

/** Return the structural connections for a tile definition. */
export function tileDefConnections(def: TileDef): Set<Direction> {
  if (def.connections) return new Set(def.connections);
  const { shape } = def;
  if (shape === PipeShape.Source || shape === PipeShape.Sink || shape === PipeShape.Chamber) {
    return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
  }
  if (PIPE_SHAPES.has(shape)) {
    const rot = (def.rotation ?? 0) as Rotation;
    const t = new Tile(shape, rot, true, 0, 0, null, 1, null, null, 0, 0, 0, 0);
    return t.connections;
  }
  return new Set();
}

/** BFS from source through a map grid; returns reachable "row,col" keys. */
export function computeMapReachable(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  sourcePos: { row: number; col: number },
  getConns: (def: TileDef, isEntry: boolean) => Set<Direction>,
): Set<string> {
  const reached = bfs(sourcePos, (cur) => {
    const curDef = grid[cur.row]?.[cur.col];
    if (!curDef) return [];
    const curConns = getConns(curDef, false);
    const neighbors: Array<{ row: number; col: number }> = [];
    for (const dir of curConns) {
      const d = CHAPTER_MAP_DELTAS[dir];
      const nr = cur.row + d.dr;
      const nc = cur.col + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nbDef = grid[nr]?.[nc];
      if (!nbDef) continue;
      const nbConns = getConns(nbDef, true);
      if (!nbConns.has(CHAPTER_MAP_OPPOSITE[dir])) continue;
      neighbors.push({ row: nr, col: nc });
    }
    return neighbors;
  });
  return new Set(reached.keys());
}

// Backward-compatible aliases
export const findChapterMapTile = findMapTile;
export const computeChapterMapReachable = computeMapReachable;
