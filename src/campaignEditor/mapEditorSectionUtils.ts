/**
 * mapEditorSectionUtils – shared helpers for the campaign map editor section
 * and the chapter map editor section.
 *
 * These helpers encapsulate patterns that are structurally identical in both
 * editors so that fixes and future changes only need to happen in one place.
 */

import { TileDef } from '../types';
import { PIPE_SHAPES } from '../board';

// ─── Keyboard handler ──────────────────────────────────────────────────────────

/**
 * Callbacks supplied by each map editor to respond to the shared Q/W/Ctrl-Z/Y
 * keyboard shortcuts.
 */
export interface MapEditorKeydownCallbacks {
  /** Undo the last edit. */
  onUndo(): void;
  /** Redo the last undone edit. */
  onRedo(): void;
  /**
   * Return the tile currently under the mouse cursor together with its grid
   * position, or `null` when the cursor is off-canvas or the cell is empty.
   */
  getHoverTileAndPos(): { tile: TileDef; pos: { row: number; col: number } } | null;
  /**
   * Return `true` when the given tile's connection set should be rotated
   * (as opposed to ignoring the tile and rotating the palette ghost instead).
   * Each editor supplies different connectable-tile criteria.
   */
  isConnectableForRotation(tile: TileDef): boolean;
  /** Rotate the placed pipe tile at `pos` CW or CCW. */
  rotateTileAt(pos: { row: number; col: number }, clockwise: boolean): void;
  /** Rotate the connection set of the source/sink/chamber tile at `pos`. */
  rotateSourceSinkAt(pos: { row: number; col: number }, clockwise: boolean): void;
  /** Rotate the palette ghost CW or CCW. */
  rotatePalette(clockwise: boolean): void;
}

/** True when the keyboard event originated from a text-entry element. */
export function isTextEntryShortcutTarget(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement | null)?.tagName ?? '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Handle keyboard input that is common across both map editors:
 *
 * - **Ctrl+Z** → `onUndo`
 * - **Ctrl+Y** → `onRedo`
 * - **Q**      → rotate CCW (tile under cursor, or palette ghost)
 * - **W**      → rotate CW  (tile under cursor, or palette ghost)
 *
 * Returns without action when an input / textarea / select element has focus
 * or when Alt is held down (which denotes OS/browser shortcuts).
 */
export function handleMapEditorKeyDown(
  e: KeyboardEvent,
  cbs: MapEditorKeydownCallbacks,
): void {
  if (e.altKey || isTextEntryShortcutTarget(e)) return;

  const key = e.key.toLowerCase();

  if (e.ctrlKey) {
    if (key === 'z') { e.preventDefault(); cbs.onUndo(); }
    if (key === 'y') { e.preventDefault(); cbs.onRedo(); }
    return;
  }

  if (key === 'q' || key === 'w') {
    e.preventDefault();
    const clockwise = key === 'w';
    const hit = cbs.getHoverTileAndPos();
    if (hit) {
      if (PIPE_SHAPES.has(hit.tile.shape)) {
        cbs.rotateTileAt(hit.pos, clockwise);
        return;
      }
      if (cbs.isConnectableForRotation(hit.tile)) {
        cbs.rotateSourceSinkAt(hit.pos, clockwise);
        return;
      }
    }
    cbs.rotatePalette(clockwise);
  }
}
