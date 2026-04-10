/**
 * LevelMetadataPanel – self-contained UI component that owns the right-side
 * panel and mid-column UI builders for level metadata editing: name, note,
 * hints, challenge toggle, grid size / slide controls, and inventory editor.
 *
 * It reads/writes LevelEditorState through the callback interface and notifies
 * the level editor when visual updates are needed.
 */

import { InventoryItem, PipeShape } from '../types';
import {
  EDITOR_FLEX_ROW_CSS,
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
  GRID_MIN_DIM,
  GRID_MAX_DIM,
} from './types';
import { LevelEditorState } from './levelEditorState';

// ─── Callback interface ───────────────────────────────────────────────────────

export interface LevelMetadataPanelCallbacks {
  getState(): LevelEditorState;
  renderCanvas(): void;
  updateUndoRedoButtons(): void;
  resizeGrid(newRows: number, newCols: number): void;
  slideGrid(dir: 'N' | 'E' | 'S' | 'W'): void;
  rotateGrid(clockwise: boolean): void;
  reflectGrid(): void;
}

// ─── LevelMetadataPanel class ─────────────────────────────────────────────────

export class LevelMetadataPanel {
  constructor(
    private readonly _cb: LevelMetadataPanelCallbacks,
    private readonly _btn: (label: string, bg: string, fg: string, onClick: () => void) => HTMLButtonElement,
  ) {}

  // ─── Mid-column builders ──────────────────────────────────────────────────

  /** Build the level-name row: an editable input in edit mode, or a styled label in read-only mode. */
  buildNameSection(readOnly: boolean): HTMLElement {
    const state = this._cb.getState();
    if (!readOnly) {
      const nameWrap = document.createElement('div');
      nameWrap.style.cssText = EDITOR_FLEX_ROW_CSS;
      const nameLbl = document.createElement('label');
      nameLbl.textContent = 'Level Name:';
      nameLbl.style.cssText = 'font-size:0.85rem;color:#aaa;';
      const nameInp = document.createElement('input');
      nameInp.type = 'text';
      nameInp.value = state.levelName;
      nameInp.style.cssText =
        'padding:6px 10px;font-size:0.9rem;background:#0d1a30;color:#eee;' +
        'border:1px solid #4a90d9;border-radius:4px;flex:1;';
      nameInp.addEventListener('input', () => { state.levelName = nameInp.value; });
      nameWrap.appendChild(nameLbl);
      nameWrap.appendChild(nameInp);
      return nameWrap;
    } else {
      const lvlNameEl = document.createElement('div');
      lvlNameEl.style.cssText = 'font-size:1rem;font-weight:bold;color:#f0c040;';
      lvlNameEl.textContent = state.levelName;
      return lvlNameEl;
    }
  }

  /**
   * Build the note, hints, and challenge-flag fields for edit mode
   * (displayed below the editor canvas).
   */
  buildTextFieldsSection(): HTMLElement {
    const state = this._cb.getState();
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    const textareaStyle =
      'padding:6px 10px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;resize:vertical;min-height:52px;font-family:inherit;';

    const noteWrap = document.createElement('div');
    noteWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const noteLbl = document.createElement('label');
    noteLbl.textContent = 'Note (shown beneath the grid while playing):';
    noteLbl.style.cssText = 'font-size:0.8rem;color:#aaa;';
    const noteInp = document.createElement('textarea');
    noteInp.value = state.levelNote;
    noteInp.placeholder = 'Optional – displayed in a box below the puzzle grid.';
    noteInp.style.cssText = textareaStyle;
    noteInp.addEventListener('input', () => { state.levelNote = noteInp.value; });
    noteWrap.appendChild(noteLbl);
    noteWrap.appendChild(noteInp);
    container.appendChild(noteWrap);

    const hintWrap = document.createElement('div');
    hintWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const hintLbl = document.createElement('label');
    hintLbl.textContent = 'Hints (collapsible, revealed in sequence while playing):';
    hintLbl.style.cssText = 'font-size:0.8rem;color:#aaa;';
    hintWrap.appendChild(hintLbl);

    const hintListEl = document.createElement('div');
    hintListEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const rebuildHintList = (): void => {
      hintListEl.innerHTML = '';
      state.levelHints.forEach((hint, idx) => {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;gap:4px;align-items:flex-start;';
        const inp = document.createElement('textarea');
        inp.value = hint;
        inp.placeholder = idx === 0
          ? 'Hint 1 – hidden until the player clicks "Show Hint".'
          : `Hint ${idx + 1} – revealed after expanding the previous hint.`;
        inp.style.cssText = textareaStyle + 'border-color:#f0c040;flex:1;';
        inp.addEventListener('input', () => { state.levelHints[idx] = inp.value; });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove this hint';
        removeBtn.style.cssText =
          'padding:4px 7px;font-size:0.8rem;background:#2c1a00;color:#f0c040;' +
          'border:1px solid #f0c040;border-radius:4px;cursor:pointer;flex-shrink:0;';
        removeBtn.addEventListener('click', () => {
          state.levelHints.splice(idx, 1);
          if (state.levelHints.length === 0) state.levelHints = [''];
          rebuildHintList();
        });
        rowEl.appendChild(inp);
        rowEl.appendChild(removeBtn);
        hintListEl.appendChild(rowEl);
      });
    };

    rebuildHintList();
    hintWrap.appendChild(hintListEl);

    const addHintBtn = document.createElement('button');
    addHintBtn.type = 'button';
    addHintBtn.textContent = '+ Add Hint';
    addHintBtn.style.cssText =
      'align-self:flex-start;padding:4px 10px;font-size:0.8rem;background:#1a1400;color:#f0c040;' +
      'border:1px solid #f0c040;border-radius:4px;cursor:pointer;';
    addHintBtn.addEventListener('click', () => {
      state.levelHints.push('');
      rebuildHintList();
    });
    hintWrap.appendChild(addHintBtn);
    container.appendChild(hintWrap);

    // Challenge level checkbox
    const challengeWrap = document.createElement('div');
    challengeWrap.style.cssText = EDITOR_FLEX_ROW_CSS;
    const challengeChk = document.createElement('input');
    challengeChk.type = 'checkbox';
    challengeChk.id = 'editor-challenge-chk';
    challengeChk.checked = state.levelChallenge;
    challengeChk.addEventListener('change', () => { state.levelChallenge = challengeChk.checked; });
    const challengeLbl = document.createElement('label');
    challengeLbl.htmlFor = 'editor-challenge-chk';
    challengeLbl.textContent = '💀 Challenge level (optional – not required to unlock next chapter)';
    challengeLbl.style.cssText = 'font-size:0.8rem;color:#aaa;cursor:pointer;';
    challengeWrap.appendChild(challengeChk);
    challengeWrap.appendChild(challengeLbl);
    container.appendChild(challengeWrap);

    return container;
  }

  /** Build the read-only info boxes for note, hints, and challenge flag (displayed below the canvas). */
  buildReadOnlyMetaSection(): HTMLElement {
    const state = this._cb.getState();
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    if (state.levelNote) {
      container.appendChild(this._createInfoBox('#4a90d9', `📝 ${state.levelNote}`));
    }
    const activeHints = state.levelHints.filter(h => h.trim());
    if (activeHints.length > 0) {
      container.appendChild(this._createInfoBox('#f0c040', `💡 ${activeHints.join(' → ')}`));
    }
    if (state.levelChallenge) {
      container.appendChild(this._createInfoBox('#e74c3c', '💀 Challenge level'));
    }
    return container;
  }

  // ─── Right-column builders ────────────────────────────────────────────────

  buildGridSizePanel(): HTMLElement {
    const state = this._cb.getState();
    const panel = document.createElement('div');
    panel.id = 'editor-grid-size-panel';
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:8px;min-width:180px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS;
    title.textContent = 'GRID SIZE';
    panel.appendChild(title);

    const gridSizeInputStyle = 'padding:4px;width:60px;background:#0d1a30;color:#eee;border:1px solid #4a90d9;border-radius:4px;';

    const rowsInp = document.createElement('input');
    rowsInp.type = 'number';
    rowsInp.min = String(GRID_MIN_DIM);
    rowsInp.max = String(GRID_MAX_DIM);
    rowsInp.value = String(state.rows);
    rowsInp.style.cssText = gridSizeInputStyle;
    const colsInp = document.createElement('input');
    colsInp.type = 'number';
    colsInp.min = String(GRID_MIN_DIM);
    colsInp.max = String(GRID_MAX_DIM);
    colsInp.value = String(state.cols);
    colsInp.style.cssText = gridSizeInputStyle;

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.85rem;';
    inputRow.appendChild(document.createTextNode('Rows:'));
    inputRow.appendChild(rowsInp);
    inputRow.appendChild(document.createTextNode('Cols:'));
    inputRow.appendChild(colsInp);
    panel.appendChild(inputRow);

    const resizeError = document.createElement('div');
    resizeError.style.cssText = 'font-size:0.8rem;color:#f44;display:none;';
    panel.appendChild(resizeError);

    panel.appendChild(this._btn('↔ Resize', '#16213e', '#f0c040', () => {
      const showErr = (msg: string) => {
        resizeError.textContent = msg;
        resizeError.style.display = 'block';
        setTimeout(() => { resizeError.style.display = 'none'; }, 2000);
      };
      const rVal = parseInt(rowsInp.value);
      const cVal = parseInt(colsInp.value);
      let outOfRange = false;
      if (isNaN(rVal) || rVal < GRID_MIN_DIM || rVal > GRID_MAX_DIM) {
        rowsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(rVal) ? state.rows : rVal)));
        outOfRange = true;
      }
      if (isNaN(cVal) || cVal < GRID_MIN_DIM || cVal > GRID_MAX_DIM) {
        colsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(cVal) ? state.cols : cVal)));
        outOfRange = true;
      }
      if (outOfRange) {
        showErr(`Value out of range (${GRID_MIN_DIM} to ${GRID_MAX_DIM})`);
        return;
      }
      if (rVal <= 1 && cVal <= 1) {
        showErr('At least one dimension (rows or cols) must be > 1');
        return;
      }
      this._cb.resizeGrid(rVal, cVal);
    }));

    const slideRotateSection = buildSlideAndRotateControls(
      (dir) => this._cb.slideGrid(dir),
      (cw)  => this._cb.rotateGrid(cw),
      ()    => this._cb.reflectGrid(),
    );
    panel.appendChild(slideRotateSection);

    return panel;
  }

  rebuildGridSizePanel(): void {
    const existing = document.getElementById('editor-grid-size-panel');
    if (existing) existing.replaceWith(this.buildGridSizePanel());
  }

  buildInventoryEditor(): HTMLElement {
    const state = this._cb.getState();
    const panel = document.createElement('div');
    panel.id = 'editor-inventory-panel';
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:6px;min-width:180px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'PLAYER INVENTORY';
    panel.appendChild(title);

    for (let i = 0; i < state.inventory.length; i++) {
      const item = state.inventory[i];
      panel.appendChild(this._buildInventoryItemRow(i, item));
    }

    // Add item controls
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;';

    const shapeSel = document.createElement('select');
    shapeSel.style.cssText =
      'padding:4px 6px;font-size:0.8rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;flex:1;';
    for (const shp of [PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee, PipeShape.Cross,
                       PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross,
                       PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee, PipeShape.LeakyCross]) {
      const o = document.createElement('option');
      o.value = shp;
      o.textContent = shp;
      shapeSel.appendChild(o);
    }

    addRow.appendChild(shapeSel);
    addRow.appendChild(this._btn('+ Add', '#16213e', '#7ed321', () => {
      const shp = shapeSel.value as PipeShape;
      const existing = state.inventory.find((it) => it.shape === shp);
      if (existing) {
        existing.count++;
      } else {
        state.inventory.push({ shape: shp, count: 1 });
      }
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
      const newPanel = this.buildInventoryEditor();
      panel.replaceWith(newPanel);
    }));
    panel.appendChild(addRow);

    return panel;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _buildInventoryItemRow(idx: number, item: InventoryItem): HTMLElement {
    const state = this._cb.getState();
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;gap:6px;background:#0d1a30;' +
      'border-radius:4px;padding:4px 6px;';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'flex:1;font-size:0.8rem;';
    lbl.textContent = item.shape;
    row.appendChild(lbl);

    const countInp = document.createElement('input');
    countInp.type = 'number';
    countInp.min = '0';
    countInp.value = String(item.count);
    countInp.style.cssText = 'width:44px;padding:2px 4px;background:#16213e;color:#eee;border:1px solid #4a90d9;border-radius:3px;font-size:0.8rem;';
    countInp.addEventListener('change', () => {
      state.inventory[idx].count = Math.max(0, parseInt(countInp.value) || 0);
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
    });
    row.appendChild(countInp);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '✕';
    delBtn.style.cssText =
      'padding:2px 6px;font-size:0.75rem;background:#2a2a4a;color:#e74c3c;' +
      'border:1px solid #e74c3c;border-radius:3px;cursor:pointer;';
    delBtn.addEventListener('click', () => {
      state.inventory.splice(idx, 1);
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
      const panel = document.getElementById('editor-inventory-panel');
      if (panel) panel.replaceWith(this.buildInventoryEditor());
    });
    row.appendChild(delBtn);
    return row;
  }

  private _createInfoBox(borderColor: string, text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      `background:#16213e;border:1px solid ${borderColor};border-radius:6px;` +
      'padding:10px 14px;font-size:0.85rem;color:#eee;';
    el.textContent = text;
    return el;
  }
}

// ── Shared widget ─────────────────────────────────────────────────────────────

/**
 * Build the combined "Slide tiles" compass + "Rotate board" CW/CCW button
 * section that appears in both the level editor and chapter map editor grid
 * size panels.
 *
 * @param onSlide   - Called with a direction when a slide arrow is clicked.
 * @param onRotate  - Called with `true` for CW, `false` for CCW when a rotate
 *                    button is clicked.
 * @param onReflect - Called when the Reflect button is clicked.
 * @returns A DocumentFragment containing the sub-sections (slide, rotate, reflect).
 */
export function buildSlideAndRotateControls(
  onSlide:   (dir: 'N' | 'E' | 'S' | 'W') => void,
  onRotate:  (clockwise: boolean) => void,
  onReflect: () => void,
): DocumentFragment {
  const frag = document.createDocumentFragment();

  const arrowBtnStyle =
    'width:28px;height:28px;font-size:1rem;display:flex;align-items:center;justify-content:center;' +
    'background:#0d1a30;color:#7ed321;border:1px solid #4a90d9;border-radius:4px;cursor:pointer;padding:0;';

  // ── Slide section ──────────────────────────────────────────────────────────

  const slideTitle = document.createElement('div');
  slideTitle.style.cssText = 'font-size:0.75rem;color:#aaa;margin-top:4px;';
  slideTitle.textContent = 'Slide tiles:';
  frag.appendChild(slideTitle);

  const compass = document.createElement('div');
  compass.style.cssText = 'display:grid;grid-template-columns:repeat(3,28px);grid-template-rows:repeat(3,28px);gap:2px;justify-self:start;';

  const makeArrow = (icon: string, dir: 'N' | 'E' | 'S' | 'W'): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = icon;
    b.title = `Slide all tiles ${dir === 'N' ? 'North (up)' : dir === 'E' ? 'East (right)' : dir === 'S' ? 'South (down)' : 'West (left)'}`;
    b.style.cssText = arrowBtnStyle;
    b.addEventListener('click', () => onSlide(dir));
    return b;
  };

  // Row 1: [empty] [↑] [empty]
  compass.appendChild(document.createElement('span'));
  compass.appendChild(makeArrow('↑', 'N'));
  compass.appendChild(document.createElement('span'));
  // Row 2: [←] [empty] [→]
  compass.appendChild(makeArrow('←', 'W'));
  compass.appendChild(document.createElement('span'));
  compass.appendChild(makeArrow('→', 'E'));
  // Row 3: [empty] [↓] [empty]
  compass.appendChild(document.createElement('span'));
  compass.appendChild(makeArrow('↓', 'S'));
  compass.appendChild(document.createElement('span'));

  frag.appendChild(compass);

  // ── Rotate section ─────────────────────────────────────────────────────────

  const rotateTitle = document.createElement('div');
  rotateTitle.style.cssText = 'font-size:0.75rem;color:#aaa;margin-top:4px;';
  rotateTitle.textContent = 'Rotate board:';
  frag.appendChild(rotateTitle);

  const rotateRow = document.createElement('div');
  rotateRow.style.cssText = 'display:flex;gap:4px;';

  const makeRotateBtn = (icon: string, clockwise: boolean): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = icon;
    b.title = clockwise ? 'Rotate board 90° clockwise' : 'Rotate board 90° counter-clockwise';
    b.style.cssText = arrowBtnStyle;
    b.addEventListener('click', () => onRotate(clockwise));
    return b;
  };

  rotateRow.appendChild(makeRotateBtn('↻', true));
  rotateRow.appendChild(makeRotateBtn('↺', false));
  frag.appendChild(rotateRow);

  // ── Reflect section ────────────────────────────────────────────────────────

  const reflectTitle = document.createElement('div');
  reflectTitle.style.cssText = 'font-size:0.75rem;color:#aaa;margin-top:4px;';
  reflectTitle.textContent = 'Reflect board:';
  frag.appendChild(reflectTitle);

  const reflectRow = document.createElement('div');
  reflectRow.style.cssText = 'display:flex;gap:4px;';

  const reflectBtn = document.createElement('button');
  reflectBtn.type = 'button';
  reflectBtn.textContent = '⤢';
  reflectBtn.title = 'Reflect board about the diagonal (transpose)';
  reflectBtn.style.cssText = arrowBtnStyle;
  reflectBtn.addEventListener('click', () => onReflect());
  reflectRow.appendChild(reflectBtn);
  frag.appendChild(reflectRow);

  return frag;
}
