/**
 * mapEditorSectionUtils – shared helpers for the campaign map editor section
 * and the chapter map editor section.
 *
 * These helpers encapsulate patterns that are structurally identical in both
 * editors so that fixes and future changes only need to happen in one place.
 */

import { TileDef } from '../types';
import { PIPE_SHAPES } from '../board';
import { commandKeyManager } from '../commandKeyManager';
import { UI_BG } from '../uiConstants';

// ─── Keyboard handler ──────────────────────────────────────────────────────────

/**
 * Callbacks supplied by each map editor to respond to the shared command-key
 * shortcuts (rotate CW/CCW + undo/redo).
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
 * Handle keyboard input that is common across both map editors using the
 * current command key assignments managed by {@link commandKeyManager}.
 *
 * Returns without action when an input / textarea / select element has focus
 * or when Alt is held down (which denotes OS/browser shortcuts).
 */
export function handleMapEditorKeyDown(
  e: KeyboardEvent,
  cbs: MapEditorKeydownCallbacks,
): void {
  if (e.altKey || isTextEntryShortcutTarget(e)) return;
  if (commandKeyManager.matches('undo', e)) {
    e.preventDefault();
    cbs.onUndo();
    return;
  }
  if (commandKeyManager.matches('redo', e)) {
    e.preventDefault();
    cbs.onRedo();
    return;
  }
  if (!commandKeyManager.matches('rotateCCW', e) && !commandKeyManager.matches('rotateCW', e)) return;

  e.preventDefault();
  const clockwise = commandKeyManager.matches('rotateCW', e);
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

// ─── Validation UI helper ──────────────────────────────────────────────────────

/**
 * Update a Validate button and its associated warning icon to reflect a
 * map validation result.  Shared between the campaign map editor and the
 * chapter map editor.
 *
 * @param validateBtn        The Validate `<button>` element to update.
 * @param warningIcon        The `⚠️` icon element shown in the header.
 * @param ok                 Whether the validation passed.
 */
export function applyMapValidationState(
  validateBtn: HTMLButtonElement,
  warningIcon: HTMLElement,
  ok: boolean,
): void {
  if (ok) {
    validateBtn.textContent = '✔ Validate';
    validateBtn.style.color = '#7ed321';
    validateBtn.style.borderColor = '#7ed321';
    validateBtn.style.background = UI_BG;
    warningIcon.style.display = 'none';
  } else {
    validateBtn.textContent = '✗ Validate';
    validateBtn.style.color = '#ff8c00';
    validateBtn.style.borderColor = '#ff8c00';
    validateBtn.style.background = UI_BG;
    warningIcon.style.display = '';
  }
}
