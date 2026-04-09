/**
 * ChapterEditorUI – panel builders and widget builders for the chapter map
 * editor.  Extracted from ChapterMapEditorSection to reduce file size.
 */

import { CampaignDef, ChapterDef, TileDef, PipeShape, Direction } from '../types';
import {
  EditorPalette,
  TileParams,
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
  PALETTE_ITEM_SELECTED_BORDER,
  PALETTE_ITEM_UNSELECTED_BORDER,
  PALETTE_ITEM_SELECTED_BG,
  PALETTE_ITEM_UNSELECTED_BG,
  PALETTE_ITEM_SELECTED_COLOR,
  PALETTE_ITEM_UNSELECTED_COLOR,
  GRID_MIN_DIM,
  GRID_MAX_DIM,
} from './types';
import { buildSlideAndRotateControls } from './levelMetadataPanel';
import { sfxManager, SfxId } from '../sfxManager';

/** The palette entry used for level chamber tiles in the chapter map editor. */
const LEVEL_CHAMBER_PALETTE: EditorPalette = 'chamber:level';

// ─── Callback interface ────────────────────────────────────────────────────────

export interface ChapterEditorUICallbacks {
  // State access
  getChapterPalette(): EditorPalette;
  setChapterPalette(p: EditorPalette): void;
  getChapterParams(): TileParams;
  getChapterSelectedLevelIdx(): number | null;
  setChapterSelectedLevelIdx(idx: number | null): void;
  getChapterEditGrid(): (TileDef | null)[][];
  getChapterEditRows(): number;
  getChapterEditCols(): number;
  getChapterFocusedTilePos(): { row: number; col: number } | null;

  // Actions
  recordSnapshot(chapter: ChapterDef, markChanged?: boolean): void;
  saveGridState(chapter: ChapterDef, campaign: CampaignDef): void;
  resizeGrid(newRows: number, newCols: number, chapter: ChapterDef, campaign: CampaignDef): void;
  slideGrid(dir: 'N' | 'E' | 'S' | 'W', chapter: ChapterDef): void;
  rotateGrid(clockwise: boolean, chapter: ChapterDef): void;
  renderCanvas(): void;

  // Parent callbacks (forwarded from ChapterMapEditorCallbacks)
  buildBtn(label: string, bg: string, color: string, onClick: () => void): HTMLButtonElement;
}

// ─── ChapterEditorUI ──────────────────────────────────────────────────────────

export class ChapterEditorUI {
  constructor(private readonly _cb: ChapterEditorUICallbacks) {}

  // ── Panel builders (called from _buildChapterMapSection layout) ────────────

  /** Build the palette panel for the chapter map editor. */
  buildPalettePanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'chapter-palette-panel';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'TILE PALETTE';
    panel.appendChild(title);

    const CHAPTER_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
      { palette: PipeShape.Source,       label: '💧 Source' },
      { palette: PipeShape.Sink,         label: '🏁 Sink' },
      { palette: LEVEL_CHAMBER_PALETTE,  label: '🚪 Level' },
      { palette: PipeShape.Tree,         label: '🌳 Tree' },
      { palette: PipeShape.Sea,          label: '🌊 Sea' },
      { palette: PipeShape.Granite,      label: '🪨 Granite' },
      { palette: PipeShape.Straight,     label: '━ Straight' },
      { palette: PipeShape.Elbow,        label: '┗ Elbow' },
      { palette: PipeShape.Tee,          label: '┣ Tee' },
      { palette: PipeShape.Cross,        label: '╋ Cross' },
      { palette: 'erase',                label: '🗑 Erase' },
    ];

    for (const item of CHAPTER_PALETTE_ITEMS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      const isSelected = this._cb.getChapterPalette() === item.palette;
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
        'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
        'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';
      btn.addEventListener('click', () => {
        const changed = this._cb.getChapterPalette() !== item.palette;
        this._cb.setChapterPalette(item.palette);
        this._cb.setChapterSelectedLevelIdx(null);
        if (changed) sfxManager.play(SfxId.InventorySelect);
        panel.replaceWith(this.buildPalettePanel(chapter, campaign));
        const existingParams = document.getElementById('chapter-tile-params-panel');
        if (existingParams) existingParams.replaceWith(this.buildTileParamsPanel(chapter, campaign));
        this.rebuildLevelInventory(chapter, campaign);
        this._cb.renderCanvas();
      });
      panel.appendChild(btn);
    }

    return panel;
  }

  /**
   * Build the chapter level inventory panel.
   * Shows each level in the chapter as a clickable item for placement on the board.
   */
  buildLevelInventoryPanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'chapter-level-inventory';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'LEVELS';
    panel.appendChild(title);

    if (chapter.levels.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:0.8rem;color:#555;';
      msg.textContent = 'Add levels below to place them on the map.';
      panel.appendChild(msg);
      return panel;
    }

    // Determine which levels are already placed on the board
    const placedLevels = new Set<number>();
    for (const row of this._cb.getChapterEditGrid()) {
      for (const tile of row) {
        if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'level' && tile.levelIdx !== undefined) {
          placedLevels.add(tile.levelIdx);
        }
      }
    }

    for (let li = 0; li < chapter.levels.length; li++) {
      const level = chapter.levels[li];
      const isPlaced = placedLevels.has(li);
      const isSelected = this._cb.getChapterSelectedLevelIdx() === li;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `L-${li + 1}: ${level.name}${level.challenge ? ' ☠' : ''}${isPlaced ? ' ✓' : ''}`;
      btn.title = isPlaced ? 'Already placed on the map' : `Select to place L-${li + 1}`;
      btn.disabled = isPlaced;
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;' +
        (isPlaced
          ? 'border:1px solid #555;background:#1a1a1a;color:#555;cursor:default;opacity:0.6;'
          : isSelected
            ? 'border:1px solid #f0c040;background:#2a2a10;color:#f0c040;cursor:pointer;'
            : 'border:1px solid #4a90d9;background:#0a1520;color:#7ed321;cursor:pointer;') ;
      if (!isPlaced) {
        btn.addEventListener('mousedown', () => {
          if (this._cb.getChapterSelectedLevelIdx() === li) {
            this._cb.setChapterSelectedLevelIdx(null);
          } else {
            this._cb.setChapterSelectedLevelIdx(li);
            this._cb.setChapterPalette(PipeShape.Source); // deselect palette
            this.rebuildPalette(chapter, campaign);
            sfxManager.play(SfxId.LevelSelect);
          }
          panel.replaceWith(this.buildLevelInventoryPanel(chapter, campaign));
          this._cb.renderCanvas();
        });
      }
      panel.appendChild(btn);
    }

    return panel;
  }

  buildTileParamsPanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'chapter-tile-params-panel';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'TILE PARAMS';
    panel.appendChild(title);

    const focusedPos = this._cb.getChapterFocusedTilePos();
    const focusedTile = focusedPos
      ? this._cb.getChapterEditGrid()[focusedPos.row]?.[focusedPos.col] ?? null
      : null;
    const isFocusedLevelChamber =
      focusedTile?.shape === PipeShape.Chamber && focusedTile.chamberContent === 'level';
    const isFocusedSourceOrSink =
      focusedTile?.shape === PipeShape.Source || focusedTile?.shape === PipeShape.Sink;

    if ((isFocusedLevelChamber || isFocusedSourceOrSink) && focusedPos) {
      panel.appendChild(this._buildFocusedChamberConnectionsWidget(panel, focusedTile!, chapter, campaign));
      // For focused Sink tile, also show completion param editor
      if (focusedTile?.shape === PipeShape.Sink) {
        panel.appendChild(this._buildFocusedSinkCompletionWidget(panel, focusedTile, chapter, campaign));
      }
    } else if (this._cb.getChapterPalette() === PipeShape.Source || this._cb.getChapterPalette() === PipeShape.Sink) {
      panel.appendChild(this._buildChapterConnectionsWidget(panel, chapter, campaign));
      // For Sink palette, also show completion param
      if (this._cb.getChapterPalette() === PipeShape.Sink) {
        panel.appendChild(this._buildSinkCompletionParamWidget(panel, chapter, campaign));
      }
    } else {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:0.78rem;color:#555;';
      note.textContent = 'No params for this tile.';
      panel.appendChild(note);
    }

    return panel;
  }

  buildGridSizePanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:8px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS;
    title.textContent = 'MAP SIZE';
    panel.appendChild(title);

    const inpStyle = 'padding:4px;width:52px;background:#0d1a30;color:#eee;border:1px solid #4a90d9;border-radius:4px;';
    const rowsInp = document.createElement('input');
    rowsInp.type = 'number';
    rowsInp.min = String(GRID_MIN_DIM);
    rowsInp.max = String(GRID_MAX_DIM);
    rowsInp.value = String(this._cb.getChapterEditRows());
    rowsInp.style.cssText = inpStyle;
    const colsInp = document.createElement('input');
    colsInp.type = 'number';
    colsInp.min = String(GRID_MIN_DIM);
    colsInp.max = String(GRID_MAX_DIM);
    colsInp.value = String(this._cb.getChapterEditCols());
    colsInp.style.cssText = inpStyle;

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.8rem;';
    inputRow.appendChild(document.createTextNode('Rows:'));
    inputRow.appendChild(rowsInp);
    inputRow.appendChild(document.createTextNode('Cols:'));
    inputRow.appendChild(colsInp);
    panel.appendChild(inputRow);

    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'font-size:0.78rem;color:#f44;display:none;';
    panel.appendChild(errDiv);

    panel.appendChild(this._cb.buildBtn('↔ Resize', '#16213e', '#f0c040', () => {
      const rVal = parseInt(rowsInp.value);
      const cVal = parseInt(colsInp.value);
      const showErr = (msg: string) => {
        errDiv.textContent = msg;
        errDiv.style.display = 'block';
        setTimeout(() => { errDiv.style.display = 'none'; }, 2000);
      };
      let outOfRange = false;
      if (isNaN(rVal) || rVal < GRID_MIN_DIM || rVal > GRID_MAX_DIM) {
        rowsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(rVal) ? this._cb.getChapterEditRows() : rVal)));
        outOfRange = true;
      }
      if (isNaN(cVal) || cVal < GRID_MIN_DIM || cVal > GRID_MAX_DIM) {
        colsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(cVal) ? this._cb.getChapterEditCols() : cVal)));
        outOfRange = true;
      }
      if (outOfRange) { showErr(`Value out of range (${GRID_MIN_DIM}–${GRID_MAX_DIM})`); return; }
      this._cb.resizeGrid(rVal, cVal, chapter, campaign);
    }));

    panel.appendChild(buildSlideAndRotateControls(
      (dir) => this._cb.slideGrid(dir, chapter),
      (cw)  => this._cb.rotateGrid(cw, chapter),
    ));

    return panel;
  }

  // ── Rebuild helpers (called after state changes) ───────────────────────────

  /** Re-render the chapter palette panel. */
  rebuildPalette(chapter: ChapterDef, campaign: CampaignDef): void {
    const existing = document.getElementById('chapter-palette-panel');
    if (existing) existing.replaceWith(this.buildPalettePanel(chapter, campaign));
    const existingParams = document.getElementById('chapter-tile-params-panel');
    if (existingParams) existingParams.replaceWith(this.buildTileParamsPanel(chapter, campaign));
  }

  /** Re-render the level inventory panel (used after selection changes). */
  rebuildLevelInventory(chapter: ChapterDef, campaign: CampaignDef): void {
    const existing = document.getElementById('chapter-level-inventory');
    if (existing) existing.replaceWith(this.buildLevelInventoryPanel(chapter, campaign));
  }

  // ── Private widget builders ────────────────────────────────────────────────

  /**
   * Build a number input widget for the Sink palette's completion parameter.
   * Reads from and writes to `_chapterParams.completion`.
   */
  private _buildSinkCompletionParamWidget(
    replaceTarget: HTMLElement,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): HTMLElement {
    return this._buildCompletionInputWidget(
      () => this._cb.getChapterParams().completion,
      (val) => {
        this._cb.getChapterParams().completion = val;
        replaceTarget.replaceWith(this.buildTileParamsPanel(chapter, campaign));
        this._cb.renderCanvas();
      },
    );
  }

  /**
   * Build a number input widget for the completion param of a focused Sink tile.
   * Reads from and writes to the tile's `completion` property directly.
   */
  private _buildFocusedSinkCompletionWidget(
    replaceTarget: HTMLElement,
    tile: TileDef,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): HTMLElement {
    return this._buildCompletionInputWidget(
      () => tile.completion ?? 0,
      (val) => {
        tile.completion = val > 0 ? val : undefined;
        this._cb.recordSnapshot(chapter);
        this._cb.saveGridState(chapter, campaign);
        replaceTarget.replaceWith(this.buildTileParamsPanel(chapter, campaign));
        this._cb.renderCanvas();
      },
    );
  }

  /**
   * Build a labeled number input for a Completion threshold value (≥ 0).
   */
  private _buildCompletionInputWidget(
    getValue: () => number,
    setValue: (val: number) => void,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:4px;';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:0.78rem;color:#aaa;';
    lbl.textContent = 'Completion';
    wrap.appendChild(lbl);
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.step = '1';
    inp.value = String(getValue());
    inp.style.cssText =
      'padding:4px;width:60px;background:#0d1a30;color:#eee;border:1px solid #4a90d9;border-radius:4px;';
    inp.addEventListener('change', () => {
      const v = Math.max(0, Math.round(parseFloat(inp.value) || 0));
      inp.value = String(v);
      setValue(v);
    });
    wrap.appendChild(inp);
    return wrap;
  }

  /**
   * Build a compass-layout (3×3 grid) connections toggle widget.
   *
   * @param getActive  Returns true when the given direction is currently active.
   * @param onToggle   Called with the toggled direction when a button is clicked.
   */
  private _buildCompassConnectionsWidget(
    getActive: (dir: Direction) => boolean,
    onToggle: (dir: Direction) => void,
  ): HTMLElement {
    const connWrap = document.createElement('div');
    connWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const connLbl = document.createElement('div');
    connLbl.style.cssText = 'font-size:0.78rem;color:#aaa;';
    connLbl.textContent = 'Connections';
    connWrap.appendChild(connLbl);

    const connGrid = document.createElement('div');
    connGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,28px);grid-template-rows:repeat(3,28px);gap:2px;';

    const makeConnBtn = (dir: Direction): HTMLButtonElement => {
      const label = dir === Direction.North ? 'N' : dir === Direction.East ? 'E' : dir === Direction.South ? 'S' : 'W';
      const active = getActive(dir);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = `Toggle ${label} connection`;
      b.style.cssText =
        'width:28px;height:28px;font-size:0.75rem;display:flex;align-items:center;justify-content:center;' +
        'background:' + (active ? '#1a3a1a' : '#0d1a30') + ';' +
        'color:' + (active ? '#7ed321' : '#555') + ';' +
        'border:1px solid ' + (active ? '#7ed321' : '#4a90d9') + ';' +
        'border-radius:4px;cursor:pointer;padding:0;';
      b.addEventListener('click', () => onToggle(dir));
      return b;
    };

    connGrid.appendChild(document.createElement('span'));
    connGrid.appendChild(makeConnBtn(Direction.North));
    connGrid.appendChild(document.createElement('span'));
    connGrid.appendChild(makeConnBtn(Direction.West));
    connGrid.appendChild(document.createElement('span'));
    connGrid.appendChild(makeConnBtn(Direction.East));
    connGrid.appendChild(document.createElement('span'));
    connGrid.appendChild(makeConnBtn(Direction.South));
    connGrid.appendChild(document.createElement('span'));

    connWrap.appendChild(connGrid);
    return connWrap;
  }

  /**
   * Build a compass-layout connections widget for the chapter map editor.
   * Reads from and writes to `_chapterParams.connections`.
   */
  private _buildChapterConnectionsWidget(
    replaceTarget: HTMLElement,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): HTMLElement {
    const dirToKey: Record<Direction, keyof TileParams['connections']> = {
      [Direction.North]: 'N', [Direction.East]: 'E',
      [Direction.South]: 'S', [Direction.West]: 'W',
    };
    return this._buildCompassConnectionsWidget(
      (dir) => this._cb.getChapterParams().connections[dirToKey[dir]],
      (dir) => {
        const conns = this._cb.getChapterParams().connections;
        conns[dirToKey[dir]] = !conns[dirToKey[dir]];
        replaceTarget.replaceWith(this.buildTileParamsPanel(chapter, campaign));
        this._cb.renderCanvas();
      },
    );
  }

  /**
   * Build a connections widget that reads from and writes to a focused level-chamber tile's
   * `connections` array directly (rather than `_chapterParams`).
   */
  private _buildFocusedChamberConnectionsWidget(
    replaceTarget: HTMLElement,
    tile: TileDef,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): HTMLElement {
    const allDirs = [Direction.North, Direction.East, Direction.South, Direction.West];
    return this._buildCompassConnectionsWidget(
      (dir) => new Set(tile.connections ?? allDirs).has(dir),
      (dir) => {
        const conns = new Set(tile.connections ?? allDirs);
        if (conns.has(dir)) conns.delete(dir); else conns.add(dir);
        tile.connections = [...conns];
        this._cb.recordSnapshot(chapter);
        this._cb.saveGridState(chapter, campaign);
        replaceTarget.replaceWith(this.buildTileParamsPanel(chapter, campaign));
        this._cb.renderCanvas();
      },
    );
  }
}
