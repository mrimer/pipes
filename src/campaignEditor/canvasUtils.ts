/**
 * canvasUtils – pure canvas-related utility functions shared between the level
 * editor and the chapter map editor.
 */

import { TILE_SIZE } from '../renderer';
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
 * Update the CSS display size of `canvas` so it fits within the available
 * space in `mainLayout` while never scaling above 1:1.
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
  const intrinsicW = cols * TILE_SIZE;
  const intrinsicH = rows * TILE_SIZE;
  let maxW = MAX_EDITOR_CANVAS_PX;
  let maxH = MAX_EDITOR_CANVAS_PX;

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
    const availW =
      layoutW - otherW - colCount * layoutGap - 2 * layoutPadding - 2 * EDITOR_CANVAS_BORDER;
    if (availW > 0) maxW = availW;

    if (constrainHeight) {
      let absTop = 0;
      let el: HTMLElement | null = canvas;
      while (el) {
        absTop += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      if (absTop > 0) {
        const BOTTOM_MARGIN = 16;
        const availH =
          window.innerHeight + window.scrollY - absTop - 2 * EDITOR_CANVAS_BORDER - BOTTOM_MARGIN;
        if (availH > 0) maxH = availH;
      }
    }
  }

  const scale = Math.min(1, maxW / intrinsicW, maxH / intrinsicH);
  canvas.style.width  = Math.round(intrinsicW * scale) + 'px';
  canvas.style.height = Math.round(intrinsicH * scale) + 'px';
}
