import { Tile } from './tile';
import { GridPos, PipeShape } from './types';
import { PIPE_SHAPES, GOLD_PIPE_SHAPES, posKey } from './board';

/**
 * Manages cement-cell state: setting times and the hardening/decrement rules.
 *
 * Responsibilities:
 *  - Own the `cementData` map (setting time per position)
 *  - Report whether a cement cell has hardened (T = 0)
 *  - Decrement the setting time after a successful player action
 *  - Provide the setting time for UI display
 */
export class CementSystem {
  /**
   * Cement setting-time values keyed by "row,col".
   * Values are decremented when a player removes or rotates a pipe placed on
   * that cell.  When the value is 0 the cell is "hardened" and placed pipes
   * may not be adjusted.
   */
  readonly data: Map<string, number>;

  constructor(data: Map<string, number>) {
    this.data = data;
  }

  /**
   * Return the cement setting time for the given position, or `null` if the
   * position is not a cement cell.  Used by the UI to display the cement status
   * in tooltips and to render the appropriate background / shadow effect.
   */
  getDryingTime(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this.data.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return true if the cement at `pos` has hardened (T = 0) and therefore
   * blocks an adjustment operation.
   *
   * When `tile` is provided the check only applies to player-placed pipe tiles
   * (regular or gold); omit or pass `null` to apply the check unconditionally.
   *
   * The error message and tile position for display purposes are returned
   * inside the result object so callers can include them in a `MoveResult`.
   *
   * @returns `{ blocked: true, error, positions }` when hardened; `{ blocked: false }` otherwise.
   */
  isHardened(
    pos: GridPos,
    tile?: Tile | null,
  ): { blocked: false } | { blocked: true; error: string; positions: GridPos[] } {
    const key = posKey(pos.row, pos.col);
    if (!this.data.has(key)) return { blocked: false };
    if (tile != null && !PIPE_SHAPES.has(tile.shape) && !GOLD_PIPE_SHAPES.has(tile.shape)) {
      return { blocked: false };
    }
    if (this.data.get(key)! === 0) {
      return {
        blocked: true,
        error: 'Items placed in hardened cement may not be adjusted.',
        positions: [pos],
      };
    }
    return { blocked: false };
  }

  /**
   * Decrement the setting time of a cement cell at `pos` after a successful
   * adjustment operation (place, replace, or rotate).
   *
   * When `tile` is provided the decrement only applies to player-placed pipe
   * tiles (regular or gold); omit or pass `null` to apply unconditionally.
   *
   * @returns The grid position if a decrement occurred, or `undefined` otherwise.
   */
  applyDecrement(pos: GridPos, tile?: Tile | null): GridPos | undefined {
    const key = posKey(pos.row, pos.col);
    if (!this.data.has(key)) return undefined;
    if (tile != null && !PIPE_SHAPES.has(tile.shape) && !GOLD_PIPE_SHAPES.has(tile.shape)) {
      return undefined;
    }
    const dryingTime = this.data.get(key)!;
    if (dryingTime > 0) {
      this.data.set(key, dryingTime - 1);
      return { row: pos.row, col: pos.col };
    }
    return undefined;
  }

  /** Capture a copy of the cement data for undo/redo snapshots. */
  captureSnapshot(): Map<string, number> {
    return new Map(this.data);
  }

  /** Restore the cement data from a snapshot produced by {@link captureSnapshot}. */
  restoreSnapshot(snap: Map<string, number>): void {
    this.data.clear();
    snap.forEach((v, k) => this.data.set(k, v));
  }
}
