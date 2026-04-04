/**
 * Shared utilities for BFS traversal of a chapter map grid.
 * Used by both the gameplay chapter map screen and the campaign editor validation.
 */

import { Direction, TileDef, Rotation, PipeShape } from './types';
import { Tile } from './tile';
import { PIPE_SHAPES } from './board';

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
 * Find the first tile with the given shape in the grid.
 * Returns its `{ row, col }` position, or `null` if no such tile exists.
 *
 * @param grid  Chapter map grid (row-major; null = empty cell).
 * @param rows  Number of grid rows.
 * @param cols  Number of grid columns.
 * @param shape The `PipeShape` to search for.
 */
export function findChapterMapTile(
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

/**
 * Returns the active connections for a tile in the chapter map editor.
 *
 * Source, Sink, and Chamber tiles (which gate water flow based on gameplay
 * state in the play screen) are all treated as fully open here – water flows
 * through them unconditionally.  This is the correct semantics for editor
 * BFS and validation, where all chambers should be reachable regardless of
 * whether their associated levels are completed.
 */
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

/**
 * Return the structural connections for a tile definition without requiring a
 * live Board or Tile runtime object.
 *
 * - Tiles with an explicit `connections` array return those connections.
 * - Source, Sink, and Chamber tiles without an explicit `connections` array
 *   default to all four directions (they connect to every neighbor).
 * - Pipe shapes (Straight, Elbow, Tee, Cross, Gold variants, Spin variants,
 *   Leaky variants) derive their connections from their shape and rotation.
 * - All other shapes (Granite, Tree, Sea, GoldSpace, Empty, …) return an empty set –
 *   they have no pipe connections.
 *
 * This is the single source of truth for "pure" (gameplay-unaware) tile
 * connectivity.  For gameplay-aware connectivity (e.g. level chambers that
 * only pass water when the level is completed), callers must wrap this with
 * additional logic.
 */
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
