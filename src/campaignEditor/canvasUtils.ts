/**
 * canvasUtils – pure canvas-related utility functions shared between the level
 * editor and the chapter map editor.
 */

import { TILE_SIZE, setTileSize, BASE_TILE_SIZE, computeTileSize } from '../renderer';
import { invalidateMinimapRectCache } from '../visuals/chapterMap';
import { MAX_EDITOR_CANVAS_PX, EDITOR_CANVAS_BORDER } from './types';

/** Largest tile size either canvas-fit function will expand to, regardless of available room. */
const MAX_TILE_SIZE = 128;
/** Margin (px) kept clear below the canvas when computing available vertical room. */
const BOTTOM_MARGIN = 16;

/**
 * Draw a dashed gold focus-outline around the tile at `focusedPos`.
 * No-op when `focusedPos` is `null`.
 */
export function drawFocusedTileOverlay(
  ctx: CanvasRenderingContext2D,
  focusedPos: { row: number; col: number } | null,
): void {
  if (!focusedPos) return;
  const { row, col } = focusedPos;
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  ctx.save();
  ctx.strokeStyle = '#f0c040';
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Wrap `canvas` in a flex-column `<div>` and append a hidden error-message
 * element below it.  Returns both the wrapper div and the error element so
 * callers can keep direct references to them.
 */
export function buildCanvasWithErrorDiv(
  canvas: HTMLCanvasElement,
): { wrapper: HTMLDivElement; errorEl: HTMLDivElement } {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  wrapper.appendChild(canvas);
  const errorEl = document.createElement('div');
  errorEl.style.cssText = 'font-size:0.85rem;color:#f44;display:none;font-weight:bold;';
  wrapper.appendChild(errorEl);
  return { wrapper, errorEl };
}

/** True if the given grid cell falls outside the `rows` x `cols` bounds. */
function _isOutsideGrid(row: number, col: number, rows: number, cols: number): boolean {
  return row < 0 || row >= rows || col < 0 || col >= cols;
}

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
  if (_isOutsideGrid(row, col, rows, cols)) return null;
  return { row, col };
}

/** Walk up the offsetParent chain to compute `el`'s absolute top position within the page. */
function _computeAbsoluteTop(el: HTMLElement): number {
  let absTop = 0;
  let cur: HTMLElement | null = el;
  while (cur) {
    absTop += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return absTop;
}

/**
 * Update the tile size and canvas dimensions so the board fills the available
 * horizontal space in `mainLayout`, then set the CSS display size accordingly.
 * The tile size is expanded up to 128 px to fill the room, or scaled down
 * (CSS-only) when the grid would otherwise overflow the container.
 *
 * @param canvas  The canvas element to resize.
 * @param opts.rows             Current grid row count.
 * @param opts.cols             Current grid column count.
 * @param opts.mainLayout       The flex-row container that holds the canvas alongside
 *                              its sibling panels.  When `null` the canvas falls back
 *                              to `MAX_EDITOR_CANVAS_PX`.
 * @param opts.layoutGap        Gap (px) between flex columns in `mainLayout`.
 * @param opts.layoutPadding    Extra horizontal padding (px) to deduct from layout
 *                              width (applied twice – once per side).
 * @param opts.constrainHeight  When `true`, also constrains the canvas height to the
 *                              available viewport height below the canvas.
 */
export function updateCanvasDisplaySize(
  canvas: HTMLCanvasElement,
  opts: {
    rows: number;
    cols: number;
    mainLayout: HTMLElement | null;
    layoutGap: number;
    layoutPadding: number;
    constrainHeight: boolean;
  },
): void {
  const { rows, cols, mainLayout, layoutGap, layoutPadding, constrainHeight } = opts;
  let availW = MAX_EDITOR_CANVAS_PX;
  let availH = MAX_EDITOR_CANVAS_PX;

  if (mainLayout) {
    availW = _computeAvailWidth(canvas, mainLayout, layoutGap, layoutPadding);
    availH = _computeAvailHeight(canvas, constrainHeight);
  }

  // Choose the largest whole-pixel tile size that fills the available space,
  // capped at MAX_TILE_SIZE and floored at BASE_TILE_SIZE.  This expands the
  // grid to fill the horizontal (and optionally vertical) room rather than
  // leaving a blank strip beside it.
  const fitW = Math.floor(availW / cols);
  const fit = constrainHeight ? Math.floor(Math.min(fitW, availH / rows)) : fitW;
  const newTileSize = Math.max(BASE_TILE_SIZE, Math.min(MAX_TILE_SIZE, fit));

  // CSS scale: only downscale if the base tile size forces the canvas to
  // overflow the available space (should be rare).
  const intrinsicW = cols * newTileSize;
  const intrinsicH = rows * newTileSize;
  const scale = constrainHeight
    ? Math.min(1, availW / intrinsicW, availH / intrinsicH)
    : Math.min(1, availW / intrinsicW);
  _applyResolvedCanvasSize(canvas, rows, cols, newTileSize, scale);
}

/**
 * Apply a resolved tile size and CSS scale factor to `canvas`: set the shared
 * {@link TILE_SIZE}, invalidate the minimap rect cache, size the canvas's
 * intrinsic (drawing-buffer) dimensions to `cols`x`rows` tiles, and size its
 * CSS display dimensions by `scale`. Shared tail for both
 * {@link updateCanvasDisplaySize} and {@link updateMapEditorCanvas}, which
 * differ only in how they resolve `tileSize` and `scale`.
 */
function _applyResolvedCanvasSize(
  canvas: HTMLCanvasElement,
  rows: number,
  cols: number,
  tileSize: number,
  scale: number,
): void {
  setTileSize(tileSize);
  invalidateMinimapRectCache();
  canvas.width  = cols * TILE_SIZE;
  canvas.height = rows * TILE_SIZE;
  canvas.style.width  = Math.round(cols * TILE_SIZE * scale) + 'px';
  canvas.style.height = Math.round(rows * TILE_SIZE * scale) + 'px';
}

/** Resolve `availW` for `updateCanvasDisplaySize`: the horizontal room left after `mainLayout`'s other columns. */
function _computeAvailWidth(
  canvas: HTMLCanvasElement,
  mainLayout: HTMLElement,
  layoutGap: number,
  layoutPadding: number,
): number {
  const { otherW, colCount } = _computeOtherColumnsWidth(mainLayout, canvas);
  const computedAvailW =
    mainLayout.clientWidth - otherW - colCount * layoutGap - 2 * layoutPadding - 2 * EDITOR_CANVAS_BORDER;
  return computedAvailW > 0 ? computedAvailW : MAX_EDITOR_CANVAS_PX;
}

/** Resolve `availH` for `updateCanvasDisplaySize`: unconstrained unless `constrainHeight` says otherwise. */
function _computeAvailHeight(canvas: HTMLCanvasElement, constrainHeight: boolean): number {
  if (!constrainHeight) return MAX_EDITOR_CANVAS_PX;
  return _computeConstrainedAvailHeight(canvas) ?? MAX_EDITOR_CANVAS_PX;
}

/** Sum the widths (and count) of `mainLayout`'s columns other than the one containing `canvas`. */
function _computeOtherColumnsWidth(
  mainLayout: HTMLElement,
  canvas: HTMLCanvasElement,
): { otherW: number; colCount: number } {
  let otherW = 0;
  let colCount = 0;
  for (const child of mainLayout.children) {
    if (!child.contains(canvas)) {
      otherW += (child as HTMLElement).offsetWidth;
      colCount++;
    } else {
      const inner = _computeInnerColumnsWidth(child, canvas);
      otherW += inner.otherW;
      colCount += inner.colCount;
    }
  }
  return { otherW, colCount };
}

/**
 * The canvas may be nested inside a sub-wrapper (e.g. midRightWrapper in the
 * level editor). Sum the widths of any siblings of the canvas's direct parent
 * within that wrapper.
 */
function _computeInnerColumnsWidth(
  wrapper: Element,
  canvas: HTMLCanvasElement,
): { otherW: number; colCount: number } {
  let otherW = 0;
  let colCount = 0;
  for (const innerChild of wrapper.children) {
    if (!innerChild.contains(canvas)) {
      otherW += (innerChild as HTMLElement).offsetWidth;
      colCount++;
    }
  }
  return { otherW, colCount };
}

/**
 * Compute the available height below `canvas` (from its absolute page top to the
 * viewport bottom), or `null` when the canvas isn't laid out yet or no room remains.
 */
function _computeConstrainedAvailHeight(canvas: HTMLCanvasElement): number | null {
  const absTop = _computeAbsoluteTop(canvas);
  if (absTop <= 0) return null;
  const computedAvailH = window.innerHeight + window.scrollY - absTop - 2 * EDITOR_CANVAS_BORDER - BOTTOM_MARGIN;
  return computedAvailH > 0 ? computedAvailH : null;
}

/**
 * Update the canvas tile size and CSS display dimensions for the map editors
 * (campaign map editor and chapter map editor). Always constrains both width
 * and height, unlike `updateCanvasDisplaySize`'s optional height constraint.
 *
 * When `mainLayout` is unavailable or not yet laid out (`clientWidth === 0`),
 * falls back to `computeTileSize()` — a viewport-relative heuristic — rather
 * than `updateCanvasDisplaySize`'s fixed-box fallback, since this is the size
 * estimate needed before the map editor's own layout has settled.
 *
 * @param canvas     The map editor canvas to resize.
 * @param rows       Current grid row count.
 * @param cols       Current grid column count.
 * @param mainLayout The outer flex-row container.  When `null` (or not yet
 *                   laid out) the canvas falls back to `computeTileSize()`.
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
    const { otherW, colCount } = _computeOtherColumnsWidth(mainLayout, canvas);
    const availW = mainLayout.clientWidth - otherW - colCount * GAP - 2 * BORDER;

    let availH = Infinity;
    const absTop = _computeAbsoluteTop(canvas);
    if (absTop > 0) {
      availH = window.innerHeight + window.scrollY - absTop - 2 * BORDER - BOTTOM_MARGIN;
    }

    if (availW > 0 && availH > 0) {
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

  _applyResolvedCanvasSize(canvas, rows, cols, newTileSize, scale);
}
