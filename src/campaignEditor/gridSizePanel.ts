/**
 * gridSizePanel – shared rows/cols input + resize button + slide/rotate compass
 * panel builder used by both the level editor (LevelMetadataPanel) and the
 * chapter map editor (ChapterEditorUI).
 */

import {
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
  GRID_MIN_DIM,
  GRID_MAX_DIM,
} from './types';
import { buildSlideAndRotateControls } from './levelMetadataPanel';
import { EDITOR_INPUT_BG, RADIUS_SM, UI_BG, UI_BORDER } from '../uiConstants';
import { showTimedMessage } from '../uiHelpers';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface GridSizePanelCallbacks {
  /** Current number of rows. */
  getRows(): number;
  /** Current number of columns. */
  getCols(): number;
  /** Resize the grid to the given dimensions. */
  resize(rows: number, cols: number): void;
  /** Slide all tiles one cell in the given direction. */
  slide(dir: 'N' | 'E' | 'S' | 'W'): void;
  /** Rotate the board 90°. */
  rotate(clockwise: boolean): void;
  /** Reflect the board about its main diagonal. */
  reflect(): void;
  /** Flip the board horizontally (left–right). */
  flipHorizontal(): void;
  /** Flip the board vertically (top–bottom). */
  flipVertical(): void;
  /** Called after rotate/reflect so the panel can refresh the dimension inputs. */
  rebuildPanel(): void;
}

export interface GridSizePanelOptions {
  /** `id` attribute of the panel element (for `document.getElementById` lookups). */
  panelId: string;
  /** Title text rendered at the top of the panel. */
  title: string;
  /** CSS width for the rows/cols `<input>` elements (e.g. `'60px'`). */
  inputWidth: string;
  /** Additional CSS for the input row (e.g. `'gap:6px;font-size:0.85rem;'`). */
  inputRowStyle: string;
  /**
   * When `true`, resize is blocked when both rows and cols would be ≤ 1 with an
   * error message reminding the user that at least one dimension must be > 1.
   */
  requireOneAxisAbove1?: boolean;
  /** CSS `min-width` of the outer panel div. */
  minWidth?: string;
}

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Build a grid-size editor panel containing:
 *   - rows / cols number inputs
 *   - a ↔ Resize button with range validation
 *   - the shared slide + rotate + reflect compass controls
 *
 * @param callbacks   State accessors and action callbacks.
 * @param btnFactory  Creates styled `<button>` elements.
 * @param options     Visual and behavioural configuration.
 */
export function buildGridSizePanel(
  callbacks: GridSizePanelCallbacks,
  btnFactory: (label: string, bg: string, fg: string, onClick: () => void) => HTMLButtonElement,
  options: GridSizePanelOptions,
): HTMLElement {
  const { panelId, title, inputWidth, inputRowStyle, requireOneAxisAbove1, minWidth } = options;

  const panel = document.createElement('div');
  panel.id = panelId;
  panel.style.cssText =
    EDITOR_PANEL_BASE_CSS +
    'display:flex;flex-direction:column;gap:8px;' +
    (minWidth ? `min-width:${minWidth};` : '');

  const titleEl = document.createElement('div');
  titleEl.style.cssText = EDITOR_PANEL_TITLE_CSS;
  titleEl.textContent = title;
  panel.appendChild(titleEl);

  const inpStyle =
    `padding:4px;width:${inputWidth};background:${EDITOR_INPUT_BG};color:#eee;` +
    `border:1px solid ${UI_BORDER};border-radius:${RADIUS_SM};`;

  const rowsInp = document.createElement('input');
  rowsInp.type = 'number';
  rowsInp.min = String(GRID_MIN_DIM);
  rowsInp.max = String(GRID_MAX_DIM);
  rowsInp.value = String(callbacks.getRows());
  rowsInp.style.cssText = inpStyle;

  const colsInp = document.createElement('input');
  colsInp.type = 'number';
  colsInp.min = String(GRID_MIN_DIM);
  colsInp.max = String(GRID_MAX_DIM);
  colsInp.value = String(callbacks.getCols());
  colsInp.style.cssText = inpStyle;

  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'display:flex;align-items:center;' + inputRowStyle;
  inputRow.appendChild(document.createTextNode('Rows:'));
  inputRow.appendChild(rowsInp);
  inputRow.appendChild(document.createTextNode('Cols:'));
  inputRow.appendChild(colsInp);
  panel.appendChild(inputRow);

  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'font-size:0.78rem;color:#f44;display:none;';
  panel.appendChild(errDiv);

  const showErr = (msg: string): void => {
    showTimedMessage(errDiv, msg);
  };

  panel.appendChild(btnFactory('↔ Resize', UI_BG, '#f0c040', () => {
    const rVal = parseInt(rowsInp.value);
    const cVal = parseInt(colsInp.value);
    let outOfRange = false;
    if (isNaN(rVal) || rVal < GRID_MIN_DIM || rVal > GRID_MAX_DIM) {
      rowsInp.value = String(
        Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(rVal) ? callbacks.getRows() : rVal)),
      );
      outOfRange = true;
    }
    if (isNaN(cVal) || cVal < GRID_MIN_DIM || cVal > GRID_MAX_DIM) {
      colsInp.value = String(
        Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(cVal) ? callbacks.getCols() : cVal)),
      );
      outOfRange = true;
    }
    if (outOfRange) {
      showErr(`Value out of range (${GRID_MIN_DIM}–${GRID_MAX_DIM})`);
      return;
    }
    if (requireOneAxisAbove1 && rVal <= 1 && cVal <= 1) {
      showErr('At least one dimension (rows or cols) must be > 1');
      return;
    }
    callbacks.resize(rVal, cVal);
  }));

  panel.appendChild(buildSlideAndRotateControls(
    (dir) => callbacks.slide(dir),
    (cw)  => { callbacks.rotate(cw); callbacks.rebuildPanel(); },
    ()    => { callbacks.reflect();        callbacks.rebuildPanel(); },
    ()    => { callbacks.flipHorizontal(); callbacks.rebuildPanel(); },
    ()    => { callbacks.flipVertical();   callbacks.rebuildPanel(); },
  ));

  return panel;
}
