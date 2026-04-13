/**
 * Shared BFS (breadth-first search) utilities over a 2-D grid of {@link GridPos}
 * values.  Two flavours are provided:
 *
 * - {@link bfs}          – returns the full set of reachable positions.
 * - {@link bfsWithDepth} – additionally records the minimum hop-count from the
 *                          start position for every reachable node.
 *
 * Both use the index-based (qi-counter) queue to avoid the O(n) cost of
 * `Array.prototype.shift`.
 */

import { GridPos } from './types';

/** @internal Produce the canonical string key for a grid position. */
function _key(pos: GridPos): string {
  return `${pos.row},${pos.col}`;
}

/**
 * Run a BFS from `start`, expanding to neighbours supplied by `getNeighbors`.
 *
 * `getNeighbors` receives the current position and should return every
 * position that is directly reachable from it (already-visited positions are
 * automatically skipped by the BFS).
 *
 * @returns A `Map<string, GridPos>` whose keys are `"row,col"` strings and
 *   whose values are the corresponding `GridPos` objects, in BFS discovery
 *   order.  The start position is always the first entry.
 */
export function bfs(
  start: GridPos,
  getNeighbors: (pos: GridPos) => GridPos[],
): Map<string, GridPos> {
  const visited = new Map<string, GridPos>();
  visited.set(_key(start), start);

  const queue: GridPos[] = [start];
  let qi = 0;
  while (qi < queue.length) {
    const pos = queue[qi++];
    for (const next of getNeighbors(pos)) {
      const key = _key(next);
      if (!visited.has(key)) {
        visited.set(key, next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/**
 * Run a BFS from `start`, expanding to neighbours supplied by `getNeighbors`,
 * and record the minimum hop-count (depth) from `start` for every reachable
 * position.
 *
 * `getNeighbors` receives the current position and should return every
 * position that is directly reachable from it (already-visited positions are
 * automatically skipped).
 *
 * @returns A `Map<string, number>` whose keys are `"row,col"` strings and
 *   whose values are the BFS depth (0 for the start position itself).
 */
export function bfsWithDepth(
  start: GridPos,
  getNeighbors: (pos: GridPos) => GridPos[],
): Map<string, number> {
  const depths = new Map<string, number>();
  depths.set(_key(start), 0);

  const queue: Array<{ pos: GridPos; depth: number }> = [{ pos: start, depth: 0 }];
  let qi = 0;
  while (qi < queue.length) {
    const { pos, depth } = queue[qi++];
    for (const next of getNeighbors(pos)) {
      const key = _key(next);
      if (!depths.has(key)) {
        depths.set(key, depth + 1);
        queue.push({ pos: next, depth: depth + 1 });
      }
    }
  }
  return depths;
}
