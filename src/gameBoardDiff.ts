/**
 * Pure board/diff/inventory-ordering helpers with no DOM, animation, or
 * Game-instance dependency — split out of game.ts to shrink its function
 * count (part of the src/game.ts hotspot sweep, see gameConnectionSfx.ts).
 */

import type { Board } from './board';
import { isEmptyFloor, posKey, parseKey } from './board';
import type { PipeShape } from './types';

/** Returns the set of pos-keys for all non-empty tiles on the given board. */
export function snapshotPlacedTiles(board: Board): Set<string> {
  const placed = new Set<string>();
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (!isEmptyFloor(board.grid[r][c].shape)) {
        placed.add(posKey(r, c));
      }
    }
  }
  return placed;
}

/** Flashes for tiles present in `before` but no longer in `after`. */
export function collectRemovedTileFlashes(before: Set<string>, after: Set<string>): Array<{ row: number; col: number; type: 'remove' }> {
  const flashes: Array<{ row: number; col: number; type: 'remove' }> = [];
  for (const key of before) {
    if (!after.has(key)) {
      const [row, col] = parseKey(key);
      flashes.push({ row, col, type: 'remove' });
    }
  }
  return flashes;
}

/** Flashes for tiles present in `after` but not in `before`. */
export function collectAddedTileFlashes(before: Set<string>, after: Set<string>): Array<{ row: number; col: number; type: 'add' }> {
  const flashes: Array<{ row: number; col: number; type: 'add' }> = [];
  for (const key of after) {
    if (!before.has(key)) {
      const [row, col] = parseKey(key);
      flashes.push({ row, col, type: 'add' });
    }
  }
  return flashes;
}

/** Base-inventory shapes with positive effective count, recording each shape into `seen`. */
function _collectBaseInventoryShapes(board: Board, bonuses: Map<PipeShape, number>, seen: Set<PipeShape>): PipeShape[] {
  const available: PipeShape[] = [];
  for (const item of board.inventory) {
    seen.add(item.shape);
    const effectiveCount = item.count + (bonuses.get(item.shape) ?? 0);
    if (effectiveCount > 0) available.push(item.shape);
  }
  return available;
}

/** Shapes that are only available via container bonuses (not in base inventory). */
function _collectBonusOnlyShapes(bonuses: Map<PipeShape, number>, seen: Set<PipeShape>): PipeShape[] {
  const available: PipeShape[] = [];
  for (const [bonusShape, bonusCount] of bonuses) {
    if (seen.has(bonusShape)) continue;
    if (bonusCount > 0) available.push(bonusShape);
  }
  return available;
}

/** Ordered list of selectable shapes (positive effective count), matching the inventory bar's visual order. */
export function buildAvailableInventoryShapes(board: Board): PipeShape[] {
  const bonuses = board.getContainerBonuses();
  const seen = new Set<PipeShape>();

  // Build the ordered list of selectable shapes, exactly as rendered by the
  // inventory bar, so the visual order and the cycling order agree.
  // Shapes with a zero or negative effective count are skipped.
  const available = _collectBaseInventoryShapes(board, bonuses, seen);
  available.push(..._collectBonusOnlyShapes(bonuses, seen));
  return available;
}
