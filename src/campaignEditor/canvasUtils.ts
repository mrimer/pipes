/**
 * canvasUtils – pure canvas-related utility functions shared between the level
 * editor and the chapter map editor.
 */

import { TILE_SIZE, setTileSize, BASE_TILE_SIZE, computeTileSize } from '../renderer';
import { MAX_EDITOR_CANVAS_PX, EDITOR_CANVAS_BORDER } from './types';

/**
 * Convert a mouse event to a grid cell position on the given canvas.
 * Returns `null` when the pointer is outside the grid bounds.
 */
export function canvasPos(
  e: MouseEvent,
  canvas: HTMLCanvasElement,
  rows: number,
  cols: number,
): { row: number; col: number } | null {
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - rect.left) * cols / rect.width);
  const row = Math.floor((e.clientY - rect.top)  * rows / rect.height);
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return { row, col };
}

/**
 * Update the tile size and canvas dimensions so the board fills the available
 * horizontal space in `mainLayout`, then set the CSS display size accordingly.
 * The tile size is expanded up to 128 px to fill the room, or scaled down
 * (CSS-only) when the grid would otherwise overflow the container.
 *
 * @param canvas           The canvas element to resize.
 * @param rows             Current grid row count.
 * @param cols             Current grid column count.
 * @param mainLayout       The flex-row container that holds the canvas alongside
 *                         its sibling panels.  When `null` the canvas falls back
 *                         to `MAX_EDITOR_CANVAS_PX`.
 * @param layoutGap        Gap (px) between flex columns in `mainLayout`.
 * @param layoutPadding    Extra horizontal padding (px) to deduct from layout
 *                         width (applied twice – once per side).
 * @param constrainHeight  When `true`, also constrains the canvas height to the
 *                         available viewport height below the canvas.
 */
export function updateCanvasDisplaySize(
  canvas: HTMLCanvasElement,
  rows: number,
  cols: number,
  mainLayout: HTMLElement | null,
  layoutGap: number,
  layoutPadding: number,
  constrainHeight: boolean,
): void {
  const MAX_TILE_SIZE = 128;
  let availW = MAX_EDITOR_CANVAS_PX;
  let availH = MAX_EDITOR_CANVAS_PX;

  if (mainLayout) {
    const layoutW = mainLayout.clientWidth;
    let otherW = 0;
    let colCount = 0;
    for (const child of mainLayout.children) {
      if (!child.contains(canvas)) {
        otherW += (child as HTMLElement).offsetWidth;
        colCount++;
      } else {
        // The canvas may be nested inside a sub-wrapper (e.g. midRightWrapper in
        // the level editor).  Also account for any siblings of the canvas's
        // direct parent within that wrapper.
        for (const innerChild of child.children) {
          if (!innerChild.contains(canvas)) {
            otherW += (innerChild as HTMLElement).offsetWidth;
            colCount++;
          }
        }
      }
    }
    const computedAvailW =
      layoutW - otherW - colCount * layoutGap - 2 * layoutPadding - 2 * EDITOR_CANVAS_BORDER;
    if (computedAvailW > 0) availW = computedAvailW;

    if (constrainHeight) {
      let absTop = 0;
      let el: HTMLElement | null = canvas;
      while (el) {
        absTop += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      if (absTop > 0) {
        const BOTTOM_MARGIN = 16;
        const computedAvailH =
          window.innerHeight + window.scrollY - absTop - 2 * EDITOR_CANVAS_BORDER - BOTTOM_MARGIN;
        if (computedAvailH > 0) availH = computedAvailH;
      }
    }
  }

  // Choose the largest whole-pixel tile size that fills the available space,
  // capped at MAX_TILE_SIZE and floored at BASE_TILE_SIZE.  This expands the
  // grid to fill the horizontal (and optionally vertical) room rather than
  // leaving a blank strip beside it.
  const fitW = Math.floor(availW / cols);
  const fit = constrainHeight ? Math.floor(Math.min(fitW, availH / rows)) : fitW;
  const newTileSize = Math.max(BASE_TILE_SIZE, Math.min(MAX_TILE_SIZE, fit));
  setTileSize(newTileSize);

  const intrinsicW = cols * TILE_SIZE;
  const intrinsicH = rows * TILE_SIZE;
  canvas.width  = intrinsicW;
  canvas.height = intrinsicH;

  // CSS scale: only downscale if the base tile size forces the canvas to
  // overflow the available space (should be rare).
  const scale = constrainHeight
    ? Math.min(1, availW / intrinsicW, availH / intrinsicH)
    : Math.min(1, availW / intrinsicW);
  canvas.style.width  = Math.round(intrinsicW * scale) + 'px';
  canvas.style.height = Math.round(intrinsicH * scale) + 'px';
}

/**
 * Update the canvas tile size and CSS display dimensions for the map editors
 * (campaign map editor and chapter map editor).
 *
 * Uses a simple outer-column traversal – the 3-column layout is
 * `[left-panel | canvas-column | right-panel]` where the canvas-column stacks
 * its children vertically, so only the *sibling columns* consume horizontal
 * space.  This is intentionally simpler than `updateCanvasDisplaySize` (which
 * also traverses inner siblings for the level editor's side-by-side layout).
 *
 * @param canvas     The map editor canvas to resize.
 * @param rows       Current grid row count.
 * @param cols       Current grid column count.
 * @param mainLayout The outer flex-row container.  When `null` the canvas falls
 *                   back to `MAX_EDITOR_CANVAS_PX`.
 */
export function updateMapEditorCanvas(
  canvas: HTMLCanvasElement,
  rows: number,
  cols: number,
  mainLayout: HTMLElement | null,
): void {
  const BORDER = EDITOR_CANVAS_BORDER;
  const GAP = 12;
  let newTileSize = computeTileSize(rows, cols);
  let scale = 1;

  if (mainLayout && mainLayout.clientWidth > 0) {
    let siblingW = 0;
    let siblingCount = 0;
    for (const child of mainLayout.children) {
      if (!child.contains(canvas)) {
        siblingW += (child as HTMLElement).offsetWidth;
        siblingCount++;
      }
    }
    const availW = mainLayout.clientWidth - siblingW - siblingCount * GAP - 2 * BORDER;

    let availH = Infinity;
    let absTop = 0;
    let el: HTMLElement | null = canvas;
    while (el) {
      absTop += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    if (absTop > 0) {
      const BOTTOM_MARGIN = 16;
      availH = window.innerHeight + window.scrollY - absTop - 2 * BORDER - BOTTOM_MARGIN;
    }

    if (availW > 0 && availH > 0) {
      const MAX_TILE_SIZE = 128;
      const fit = Math.floor(Math.min(availW / cols, availH / rows));
      newTileSize = Math.max(BASE_TILE_SIZE, Math.min(MAX_TILE_SIZE, fit));
      const intrinsicW = cols * newTileSize;
      const intrinsicH = rows * newTileSize;
      scale = Math.min(1, availW / intrinsicW, availH / intrinsicH);
    }
  } else {
    const intrinsicW = cols * newTileSize;
    const intrinsicH = rows * newTileSize;
    scale = Math.min(1, MAX_EDITOR_CANVAS_PX / intrinsicW, MAX_EDITOR_CANVAS_PX / intrinsicH);
  }

  setTileSize(newTileSize);
  canvas.width  = cols * TILE_SIZE;
  canvas.height = rows * TILE_SIZE;
  canvas.style.width  = Math.round(cols * TILE_SIZE * scale) + 'px';
  canvas.style.height = Math.round(rows * TILE_SIZE * scale) + 'px';
}
