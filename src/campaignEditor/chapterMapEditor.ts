/**
 * ChapterMapEditorSection – encapsulates all chapter map editor state and UI
 * methods that were previously part of CampaignEditor in index.ts.
 */

import { CampaignDef, ChapterDef, LevelDef, TileDef, PipeShape, Direction, Rotation } from '../types';
import { PIPE_SHAPES } from '../board';
import { Tile } from '../tile';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';
import { renderEditorCanvas, HoverOverlay, DragState } from './renderer';
import { computeChapterMapReachable } from '../chapterMapUtils';
import {
  EditorPalette,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
  ValidationResult,
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
  EDITOR_CANVAS_BORDER,
  MAX_EDITOR_CANVAS_PX,
  REPEATABLE_EDITOR_TILES,
  isChamberPalette,
} from './types';

// ─── Callback interface ────────────────────────────────────────────────────────

export interface ChapterMapEditorCallbacks {
  buildBtn(label: string, bg: string, color: string, onClick: () => void): HTMLButtonElement;
  buildConnectionsWidget(panel: HTMLElement): HTMLElement;
  getActiveCampaign(): CampaignDef | null;
  getActiveChapterIdx(): number;
  touchCampaign(campaign: CampaignDef): void;
  saveCampaigns(): void;
}

// ─── ChapterMapEditorSection ───────────────────────────────────────────────────

export class ChapterMapEditorSection {
  private readonly _callbacks: ChapterMapEditorCallbacks;

  // ── State fields ──────────────────────────────────────────────────────────
  private _chapterEditRows = 3;
  private _chapterEditCols = 6;
  private _chapterEditGrid: (TileDef | null)[][] = [];
  private _chapterPalette: EditorPalette = PipeShape.Source;
  private _chapterParams: TileParams = { ...DEFAULT_PARAMS };
  private _chapterCanvas: HTMLCanvasElement | null = null;
  private _chapterCtx: CanvasRenderingContext2D | null = null;
  private _chapterHover: { row: number; col: number } | null = null;
  private _chapterDragState: {
    startPos: { row: number; col: number };
    tile: TileDef;
    currentPos: { row: number; col: number };
    moved: boolean;
  } | null = null;
  private _chapterPaintDragActive = false;
  private _chapterRightEraseDragActive = false;
  private _chapterSuppressContextMenu = false;
  private _chapterHistory: EditorSnapshot[] = [];
  private _chapterHistoryIdx = -1;
  private _chapterSelectedLevelIdx: number | null = null;
  private _chapterWindowMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private _chapterEditorMainLayout: HTMLDivElement = document.createElement('div');

  /** Default chapter grid dimensions. */
  private static readonly CHAPTER_DEFAULT_ROWS = 3;
  private static readonly CHAPTER_DEFAULT_COLS = 6;

  constructor(callbacks: ChapterMapEditorCallbacks) {
    this._callbacks = callbacks;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Initialize grid state from the given chapter (or create defaults). */
  init(chapter: ChapterDef): void {
    this._initChapterGridState(chapter);
  }

  /** Build and return the full chapter map editor section element. */
  buildSection(campaign: CampaignDef, chapter: ChapterDef, isOfficial: boolean): HTMLElement {
    return this._buildChapterMapSection(campaign, chapter, isOfficial);
  }

  /** Update the chapter canvas CSS display size. */
  updateCanvasDisplaySize(): void {
    this._updateChapterCanvasDisplaySize();
  }

  /** Re-render the chapter map canvas. */
  renderCanvas(): void {
    this._renderChapterCanvas();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Initialize `_chapterEditRows`, `_chapterEditCols`, `_chapterEditGrid` from
   * the chapter's saved grid data, or create a default 3×6 grid with source/sink.
   */
  private _initChapterGridState(chapter: ChapterDef): void {
    if (chapter.grid && chapter.rows && chapter.cols) {
      this._chapterEditRows = chapter.rows;
      this._chapterEditCols = chapter.cols;
      this._chapterEditGrid = JSON.parse(JSON.stringify(chapter.grid)) as (TileDef | null)[][];
    } else {
      // Create default 3×6 grid
      const rows = ChapterMapEditorSection.CHAPTER_DEFAULT_ROWS;
      const cols = ChapterMapEditorSection.CHAPTER_DEFAULT_COLS;
      const grid: (TileDef | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null) as null[]);
      // Source at [1, 0] with connection to the right
      grid[1][0] = { shape: PipeShape.Source, capacity: 10, connections: [Direction.East] };
      // Sink at [1, 5] with connection to the left
      grid[1][cols - 1] = { shape: PipeShape.Sink, connections: [Direction.West] };
      this._chapterEditRows = rows;
      this._chapterEditCols = cols;
      this._chapterEditGrid = grid;
    }
    // Reset chapter editor state
    this._chapterHistory = [];
    this._chapterHistoryIdx = -1;
    this._chapterSelectedLevelIdx = null;
    this._chapterHover = null;
    this._chapterDragState = null;
    this._chapterPaintDragActive = false;
    this._chapterRightEraseDragActive = false;
    this._recordChapterSnapshot(chapter, false);
  }

  /** Write current chapter grid state back to the chapter object and persist. */
  private _saveChapterGridState(chapter: ChapterDef, campaign: CampaignDef): void {
    chapter.rows = this._chapterEditRows;
    chapter.cols = this._chapterEditCols;
    chapter.grid = JSON.parse(JSON.stringify(this._chapterEditGrid)) as (TileDef | null)[][];
    this._callbacks.touchCampaign(campaign);
    this._callbacks.saveCampaigns();
  }

  /**
   * Build the "Chapter Map" section: a 3-column layout with palette on the left,
   * canvas + validation button in the center, and level inventory + size controls
   * on the right.
   */
  private _buildChapterMapSection(campaign: CampaignDef, chapter: ChapterDef, isOfficial: boolean): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText =
      'background:#0d1a30;border:1px solid #4a90d9;border-radius:8px;padding:16px;' +
      'display:flex;flex-direction:column;gap:12px;';

    const sectionHeader = document.createElement('div');
    sectionHeader.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = '🗺️ Chapter Map';
    sectionTitle.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    sectionHeader.appendChild(sectionTitle);
    section.appendChild(sectionHeader);

    if (isOfficial) {
      const readonlyMsg = document.createElement('p');
      readonlyMsg.style.cssText = 'color:#888;font-size:0.85rem;';
      readonlyMsg.textContent = 'Chapter map is read-only for official campaigns.';
      section.appendChild(readonlyMsg);
      // Still render the canvas in read-only mode
      const canvas = this._buildChapterMapCanvas(campaign, chapter, true);
      section.appendChild(canvas);
      return section;
    }

    // 3-column layout: [palette] [canvas+validation] [level inventory + size]
    const layout = document.createElement('div');
    layout.style.cssText = 'display:flex;flex-wrap:nowrap;gap:12px;align-items:flex-start;';
    this._chapterEditorMainLayout = layout;

    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:140px;';
    leftCol.appendChild(this._buildChapterPalettePanel(chapter, campaign));
    layout.appendChild(leftCol);

    const midCol = document.createElement('div');
    midCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;';

    // Toolbar: undo/redo + validate
    const midToolbar = document.createElement('div');
    midToolbar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const undoBtn = this._callbacks.buildBtn('↩ Undo', '#2a2a4a', '#aaa', () => this._chapterUndo(campaign, chapter));
    undoBtn.id = 'chapter-undo-btn';
    midToolbar.appendChild(undoBtn);
    const redoBtn = this._callbacks.buildBtn('↪ Redo', '#2a2a4a', '#aaa', () => this._chapterRedo(campaign, chapter));
    redoBtn.id = 'chapter-redo-btn';
    midToolbar.appendChild(redoBtn);

    midToolbar.appendChild(this._callbacks.buildBtn('✔ Validate', '#16213e', '#7ed321', () => {
      const result = this._validateChapterMap(chapter);
      const icon = result.ok ? '✅' : '❌';
      alert(`${icon} Chapter Map Validation\n\n${result.messages.join('\n')}`);
    }));
    midCol.appendChild(midToolbar);

    midCol.appendChild(this._buildChapterMapCanvas(campaign, chapter, false));
    layout.appendChild(midCol);

    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:160px;';
    rightCol.appendChild(this._buildChapterLevelInventoryPanel(chapter, campaign));
    rightCol.appendChild(this._buildChapterGridSizePanel(chapter, campaign));
    layout.appendChild(rightCol);

    section.appendChild(layout);
    return section;
  }

  /** Build the palette panel for the chapter map editor. */
  private _buildChapterPalettePanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'chapter-palette-panel';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'TILE PALETTE';
    panel.appendChild(title);

    const CHAPTER_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
      { palette: PipeShape.Source,   label: '💧 Source' },
      { palette: PipeShape.Sink,     label: '🏁 Sink' },
      { palette: PipeShape.Straight, label: '━ Straight' },
      { palette: PipeShape.Elbow,    label: '┗ Elbow' },
      { palette: PipeShape.Tee,      label: '┣ Tee' },
      { palette: PipeShape.Cross,    label: '╋ Cross' },
      { palette: 'erase',            label: '🗑 Erase' },
    ];

    for (const item of CHAPTER_PALETTE_ITEMS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      const isSelected = this._chapterPalette === item.palette;
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
        'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
        'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';
      btn.addEventListener('click', () => {
        this._chapterPalette = item.palette;
        this._chapterSelectedLevelIdx = null; // Deselect level when palette item selected
        panel.replaceWith(this._buildChapterPalettePanel(chapter, campaign));
        this._rebuildChapterLevelInventory(chapter, campaign);
        this._renderChapterCanvas();
      });
      panel.appendChild(btn);
    }

    // Connections widget for Source/Sink
    if (this._chapterPalette === PipeShape.Source || this._chapterPalette === PipeShape.Sink) {
      panel.appendChild(this._callbacks.buildConnectionsWidget(panel));
    }

    return panel;
  }

  /** Re-render the level inventory panel (used after selection changes). */
  private _rebuildChapterLevelInventory(chapter: ChapterDef, campaign: CampaignDef): void {
    const existing = document.getElementById('chapter-level-inventory');
    if (existing) existing.replaceWith(this._buildChapterLevelInventoryPanel(chapter, campaign));
  }

  /**
   * Build the chapter level inventory panel.
   * Shows each level in the chapter as a clickable item for placement on the board.
   */
  private _buildChapterLevelInventoryPanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
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
    for (const row of this._chapterEditGrid) {
      for (const tile of row) {
        if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'level' && tile.levelIdx !== undefined) {
          placedLevels.add(tile.levelIdx);
        }
      }
    }

    for (let li = 0; li < chapter.levels.length; li++) {
      const level = chapter.levels[li];
      const isPlaced = placedLevels.has(li);
      const isSelected = this._chapterSelectedLevelIdx === li;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `L-${li + 1}: ${level.name}${isPlaced ? ' ✓' : ''}`;
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
        btn.addEventListener('click', () => {
          if (this._chapterSelectedLevelIdx === li) {
            this._chapterSelectedLevelIdx = null;
          } else {
            this._chapterSelectedLevelIdx = li;
            this._chapterPalette = PipeShape.Source; // deselect palette
            this._rebuildChapterPalette(chapter, campaign);
          }
          panel.replaceWith(this._buildChapterLevelInventoryPanel(chapter, campaign));
          this._renderChapterCanvas();
        });
      }
      panel.appendChild(btn);
    }

    return panel;
  }

  /** Re-render the chapter palette panel. */
  private _rebuildChapterPalette(chapter: ChapterDef, campaign: CampaignDef): void {
    const existing = document.getElementById('chapter-palette-panel');
    if (existing) existing.replaceWith(this._buildChapterPalettePanel(chapter, campaign));
  }

  /** Build the grid size panel for the chapter map editor. */
  private _buildChapterGridSizePanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
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
    rowsInp.value = String(this._chapterEditRows);
    rowsInp.style.cssText = inpStyle;
    const colsInp = document.createElement('input');
    colsInp.type = 'number';
    colsInp.min = String(GRID_MIN_DIM);
    colsInp.max = String(GRID_MAX_DIM);
    colsInp.value = String(this._chapterEditCols);
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

    panel.appendChild(this._callbacks.buildBtn('↔ Resize', '#16213e', '#f0c040', () => {
      const rVal = parseInt(rowsInp.value);
      const cVal = parseInt(colsInp.value);
      const showErr = (msg: string) => {
        errDiv.textContent = msg;
        errDiv.style.display = 'block';
        setTimeout(() => { errDiv.style.display = 'none'; }, 2000);
      };
      let outOfRange = false;
      if (isNaN(rVal) || rVal < GRID_MIN_DIM || rVal > GRID_MAX_DIM) {
        rowsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(rVal) ? this._chapterEditRows : rVal)));
        outOfRange = true;
      }
      if (isNaN(cVal) || cVal < GRID_MIN_DIM || cVal > GRID_MAX_DIM) {
        colsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(cVal) ? this._chapterEditCols : cVal)));
        outOfRange = true;
      }
      if (outOfRange) { showErr(`Value out of range (${GRID_MIN_DIM}–${GRID_MAX_DIM})`); return; }
      this._resizeChapterGrid(rVal, cVal, campaign, chapter);
    }));

    return panel;
  }

  /**
   * Build the chapter map canvas element and attach mouse event listeners.
   * Sets `_chapterCanvas` and `_chapterCtx` as side effects.
   */
  private _buildChapterMapCanvas(campaign: CampaignDef, chapter: ChapterDef, readOnly: boolean): HTMLElement {
    const canvas = document.createElement('canvas');
    setTileSize(computeTileSize(this._chapterEditRows, this._chapterEditCols));
    canvas.width  = this._chapterEditCols * TILE_SIZE;
    canvas.height = this._chapterEditRows * TILE_SIZE;
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:4px;` +
      'cursor:' + (readOnly ? 'default' : 'crosshair') + ';display:block;';
    this._chapterCanvas = canvas;
    this._updateChapterCanvasDisplaySize();
    const ctx = canvas.getContext('2d');
    if (ctx) this._chapterCtx = ctx;

    if (!readOnly) {
      canvas.addEventListener('mousedown', (e) => this._onChapterCanvasMouseDown(e, campaign, chapter));
      canvas.addEventListener('mousemove', (e) => this._onChapterCanvasMouseMove(e, campaign, chapter));
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this._chapterSuppressContextMenu) { this._chapterSuppressContextMenu = false; return; }
        this._onChapterCanvasRightClick(e, campaign, chapter);
      });
      canvas.addEventListener('mouseleave', () => {
        this._chapterHover = null;
        if (this._chapterDragState) this._chapterDragState = null;
        if (this._chapterPaintDragActive) {
          this._chapterPaintDragActive = false;
          this._recordChapterSnapshot(chapter);
        }
        if (this._chapterRightEraseDragActive) {
          this._chapterRightEraseDragActive = false;
          this._recordChapterSnapshot(chapter);
        }
        this._renderChapterCanvas();
      });
      if (this._chapterWindowMouseUpHandler) {
        window.removeEventListener('mouseup', this._chapterWindowMouseUpHandler);
      }
      this._chapterWindowMouseUpHandler = (e: MouseEvent) => this._onChapterMouseUp(e, campaign, chapter);
      window.addEventListener('mouseup', this._chapterWindowMouseUpHandler);
    }

    return canvas;
  }

  /** Convert a mouse event to a grid position on the chapter canvas. */
  private _chapterCanvasPos(e: MouseEvent): { row: number; col: number } | null {
    if (!this._chapterCanvas) return null;
    const rect = this._chapterCanvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) * this._chapterEditCols / rect.width);
    const row = Math.floor((e.clientY - rect.top)  * this._chapterEditRows / rect.height);
    if (row < 0 || row >= this._chapterEditRows || col < 0 || col >= this._chapterEditCols) return null;
    return { row, col };
  }

  /** Update the chapter canvas CSS display size to fit the available space. */
  private _updateChapterCanvasDisplaySize(): void {
    if (!this._chapterCanvas) return;
    const intrinsicW = this._chapterEditCols * TILE_SIZE;
    const intrinsicH = this._chapterEditRows * TILE_SIZE;
    let maxPx = MAX_EDITOR_CANVAS_PX;
    if (this._chapterEditorMainLayout) {
      const layoutW = this._chapterEditorMainLayout.clientWidth;
      let otherW = 0;
      let colCount = 0;
      for (const child of this._chapterEditorMainLayout.children) {
        if (!child.contains(this._chapterCanvas)) {
          otherW += (child as HTMLElement).offsetWidth;
          colCount++;
        }
      }
      const availW = layoutW - otherW - colCount * 12 - 2 * EDITOR_CANVAS_BORDER;
      if (availW > maxPx) maxPx = availW;
    }
    const scale = Math.min(1, maxPx / Math.max(intrinsicW, intrinsicH));
    this._chapterCanvas.style.width  = Math.round(intrinsicW * scale) + 'px';
    this._chapterCanvas.style.height = Math.round(intrinsicH * scale) + 'px';
  }

  /** Render the chapter map editor canvas. */
  private _renderChapterCanvas(): void {
    const ctx = this._chapterCtx;
    if (!ctx) return;

    let overlay: HoverOverlay | null = null;
    let drag: DragState | null = null;

    if (this._chapterDragState) {
      drag = {
        fromPos: this._chapterDragState.startPos,
        toPos: this._chapterDragState.currentPos,
        tile: this._chapterDragState.tile,
      };
    } else if (this._chapterHover) {
      if (this._chapterPalette === 'erase') {
        const isEmpty = (this._chapterEditGrid[this._chapterHover.row]?.[this._chapterHover.col] ?? null) === null;
        overlay = { pos: this._chapterHover, def: null, alpha: isEmpty ? 0.2 : 1 };
      } else if (this._chapterSelectedLevelIdx !== null) {
        // Preview: level chamber placeholder
        const levelDef: TileDef = {
          shape: PipeShape.Chamber,
          chamberContent: 'level',
          levelIdx: this._chapterSelectedLevelIdx,
        };
        overlay = { pos: this._chapterHover, def: levelDef, alpha: 0.55 };
      } else {
        overlay = { pos: this._chapterHover, def: this._buildChapterTileDef(), alpha: 0.55 };
      }
    }

    const campaign = this._callbacks.getActiveCampaign();
    const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
    const levelDefs: LevelDef[] = chapter?.levels ?? [];

    renderEditorCanvas(
      ctx,
      this._chapterEditGrid,
      this._chapterEditRows,
      this._chapterEditCols,
      overlay,
      drag,
      null,
      levelDefs,
    );
  }

  /** Build a TileDef from the current chapter palette selection and params. */
  private _buildChapterTileDef(): TileDef {
    if (this._chapterPalette === 'erase') return { shape: PipeShape.Empty };
    const p = this._chapterParams;
    const shape = this._chapterPalette as PipeShape;
    const needsConn = shape === PipeShape.Source || shape === PipeShape.Sink;
    if (needsConn) {
      const connDirs: Direction[] = [];
      if (p.connections.N) connDirs.push(Direction.North);
      if (p.connections.E) connDirs.push(Direction.East);
      if (p.connections.S) connDirs.push(Direction.South);
      if (p.connections.W) connDirs.push(Direction.West);
      const def: TileDef = { shape };
      if (shape === PipeShape.Source) def.capacity = p.capacity;
      if (connDirs.length < 4) def.connections = connDirs;
      return def;
    }
    // Pipe shapes
    return { shape, rotation: p.rotation };
  }

  /** Check if a source tile already exists on the chapter grid (outside a given position). */
  private _chapterHasSourceElsewhere(exceptPos?: { row: number; col: number }): boolean {
    for (let r = 0; r < this._chapterEditRows; r++) {
      for (let c = 0; c < this._chapterEditCols; c++) {
        if (exceptPos && r === exceptPos.row && c === exceptPos.col) continue;
        if (this._chapterEditGrid[r]?.[c]?.shape === PipeShape.Source) return true;
      }
    }
    return false;
  }

  // ─── Chapter canvas mouse events ──────────────────────────────────────────

  private _onChapterCanvasMouseDown(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    if (e.button === 2) {
      const pos = this._chapterCanvasPos(e);
      if (!pos) return;
      this._chapterRightEraseDragActive = true;
      this._chapterSuppressContextMenu = false;
      const existingTile = this._chapterEditGrid[pos.row]?.[pos.col] ?? null;
      if (existingTile !== null) {
        this._chapterEditGrid[pos.row][pos.col] = null;
        this._renderChapterCanvas();
      }
      return;
    }
    if (e.button !== 0) return;
    const pos = this._chapterCanvasPos(e);
    if (!pos) return;

    const existingTile = this._chapterEditGrid[pos.row]?.[pos.col] ?? null;

    // If a level is selected for placement
    if (this._chapterSelectedLevelIdx !== null) {
      if (existingTile === null) {
        // Place level chamber
        this._chapterEditGrid[pos.row][pos.col] = {
          shape: PipeShape.Chamber,
          chamberContent: 'level',
          levelIdx: this._chapterSelectedLevelIdx,
          connections: [Direction.North, Direction.East, Direction.South, Direction.West],
        };
        this._chapterSelectedLevelIdx = null;
        this._recordChapterSnapshot(chapter);
        this._saveChapterGridState(chapter, campaign);
        this._rebuildChapterLevelInventory(chapter, campaign);
        this._renderChapterCanvas();
      } else if (existingTile.shape === PipeShape.Chamber && existingTile.chamberContent === 'level') {
        // Start dragging existing level chamber
        this._chapterDragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
        this._renderChapterCanvas();
      }
      return;
    }

    // Regular tile placement / dragging
    if (existingTile !== null && this._chapterPalette !== 'erase') {
      // Start dragging the existing tile
      this._chapterDragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._renderChapterCanvas();
    } else {
      if (this._chapterPalette === PipeShape.Source && this._chapterHasSourceElsewhere()) {
        return; // Only one source allowed
      }
      if (existingTile === null && REPEATABLE_EDITOR_TILES.has(this._chapterPalette)) {
        this._chapterPaintDragActive = true;
        this._chapterEditGrid[pos.row][pos.col] = this._buildChapterTileDef();
        this._renderChapterCanvas();
        return;
      }
      if (this._chapterPalette === 'erase') {
        this._chapterEditGrid[pos.row][pos.col] = null;
      } else {
        this._chapterEditGrid[pos.row][pos.col] = this._buildChapterTileDef();
      }
      this._recordChapterSnapshot(chapter);
      this._saveChapterGridState(chapter, campaign);
      this._renderChapterCanvas();
    }
  }

  private _onChapterMouseUp(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    if (e.button === 2) {
      if (!this._chapterRightEraseDragActive) return;
      this._chapterRightEraseDragActive = false;
      this._chapterSuppressContextMenu = true;
      this._recordChapterSnapshot(chapter);
      this._saveChapterGridState(chapter, campaign);
      this._renderChapterCanvas();
      return;
    }
    if (e.button !== 0) return;

    if (this._chapterPaintDragActive) {
      this._chapterPaintDragActive = false;
      this._recordChapterSnapshot(chapter);
      this._saveChapterGridState(chapter, campaign);
      this._renderChapterCanvas();
      return;
    }

    if (!this._chapterDragState) return;
    const { startPos, tile, currentPos, moved } = this._chapterDragState;
    this._chapterDragState = null;

    if (moved) {
      this._chapterEditGrid[startPos.row][startPos.col] = null;
      this._chapterEditGrid[currentPos.row][currentPos.col] = tile;
      this._recordChapterSnapshot(chapter);
      this._saveChapterGridState(chapter, campaign);
    } else {
      // Click on tile: for pipe shapes of same type, rotate; otherwise select
      if (
        this._chapterPalette !== 'erase' &&
        PIPE_SHAPES.has(this._chapterPalette as PipeShape) &&
        PIPE_SHAPES.has(tile.shape)
      ) {
        this._chapterEditGrid[startPos.row][startPos.col] = this._buildChapterTileDef();
        this._recordChapterSnapshot(chapter);
        this._saveChapterGridState(chapter, campaign);
      }
    }
    this._renderChapterCanvas();
  }

  private _onChapterCanvasMouseMove(e: MouseEvent, _campaign: CampaignDef, _chapter: ChapterDef): void {
    const pos = this._chapterCanvasPos(e);
    this._chapterHover = pos;

    if (this._chapterPaintDragActive && pos) {
      if ((this._chapterEditGrid[pos.row]?.[pos.col] ?? null) === null) {
        this._chapterEditGrid[pos.row][pos.col] = this._buildChapterTileDef();
      }
    } else if (this._chapterRightEraseDragActive && pos) {
      if ((this._chapterEditGrid[pos.row]?.[pos.col] ?? null) !== null) {
        this._chapterEditGrid[pos.row][pos.col] = null;
      }
    } else if (this._chapterDragState && pos) {
      const { startPos, currentPos } = this._chapterDragState;
      if (pos.row !== currentPos.row || pos.col !== currentPos.col) {
        if (pos.row === startPos.row && pos.col === startPos.col) {
          this._chapterDragState.currentPos = pos;
          this._chapterDragState.moved = false;
        } else if ((this._chapterEditGrid[pos.row]?.[pos.col] ?? null) === null) {
          this._chapterDragState.currentPos = pos;
          this._chapterDragState.moved = true;
        }
      }
    }
    this._renderChapterCanvas();
  }

  private _onChapterCanvasRightClick(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    const pos = this._chapterCanvasPos(e);
    if (!pos) return;
    this._chapterEditGrid[pos.row][pos.col] = null;
    this._recordChapterSnapshot(chapter);
    this._saveChapterGridState(chapter, campaign);
    this._renderChapterCanvas();
  }

  // ─── Chapter editor undo/redo ────────────────────────────────────────────

  private _recordChapterSnapshot(chapter: ChapterDef, markChanged = true): void {
    const snapshot: EditorSnapshot = {
      grid: JSON.parse(JSON.stringify(this._chapterEditGrid)) as (TileDef | null)[][],
      rows: this._chapterEditRows,
      cols: this._chapterEditCols,
      inventory: [],
    };
    if (this._chapterHistoryIdx < this._chapterHistory.length - 1) {
      this._chapterHistory = this._chapterHistory.slice(0, this._chapterHistoryIdx + 1);
    }
    this._chapterHistory.push(snapshot);
    this._chapterHistoryIdx = this._chapterHistory.length - 1;
    if (markChanged) {
      this._updateChapterUndoRedoButtons();
    }
    void chapter;
  }

  private _chapterUndo(campaign: CampaignDef, chapter: ChapterDef): void {
    if (this._chapterHistoryIdx <= 0) return;
    this._chapterHistoryIdx--;
    const snap = this._chapterHistory[this._chapterHistoryIdx];
    this._chapterEditGrid = JSON.parse(JSON.stringify(snap.grid)) as (TileDef | null)[][];
    this._chapterEditRows = snap.rows;
    this._chapterEditCols = snap.cols;
    if (this._chapterCanvas) {
      setTileSize(computeTileSize(snap.rows, snap.cols));
      this._chapterCanvas.width  = snap.cols * TILE_SIZE;
      this._chapterCanvas.height = snap.rows * TILE_SIZE;
    }
    this._updateChapterCanvasDisplaySize();
    this._saveChapterGridState(chapter, campaign);
    this._rebuildChapterLevelInventory(chapter, campaign);
    this._updateChapterUndoRedoButtons();
    this._renderChapterCanvas();
  }

  private _chapterRedo(campaign: CampaignDef, chapter: ChapterDef): void {
    if (this._chapterHistoryIdx >= this._chapterHistory.length - 1) return;
    this._chapterHistoryIdx++;
    const snap = this._chapterHistory[this._chapterHistoryIdx];
    this._chapterEditGrid = JSON.parse(JSON.stringify(snap.grid)) as (TileDef | null)[][];
    this._chapterEditRows = snap.rows;
    this._chapterEditCols = snap.cols;
    if (this._chapterCanvas) {
      setTileSize(computeTileSize(snap.rows, snap.cols));
      this._chapterCanvas.width  = snap.cols * TILE_SIZE;
      this._chapterCanvas.height = snap.rows * TILE_SIZE;
    }
    this._updateChapterCanvasDisplaySize();
    this._saveChapterGridState(chapter, campaign);
    this._rebuildChapterLevelInventory(chapter, campaign);
    this._updateChapterUndoRedoButtons();
    this._renderChapterCanvas();
  }

  private _updateChapterUndoRedoButtons(): void {
    const undoBtn = document.getElementById('chapter-undo-btn') as HTMLButtonElement | null;
    const redoBtn = document.getElementById('chapter-redo-btn') as HTMLButtonElement | null;
    if (undoBtn) {
      undoBtn.disabled = this._chapterHistoryIdx <= 0;
      undoBtn.style.opacity = undoBtn.disabled ? '0.4' : '1';
    }
    if (redoBtn) {
      redoBtn.disabled = this._chapterHistoryIdx >= this._chapterHistory.length - 1;
      redoBtn.style.opacity = redoBtn.disabled ? '0.4' : '1';
    }
  }

  /** Resize the chapter grid. */
  private _resizeChapterGrid(newRows: number, newCols: number, campaign: CampaignDef, chapter: ChapterDef): void {
    const newGrid: (TileDef | null)[][] = [];
    for (let r = 0; r < newRows; r++) {
      newGrid[r] = [];
      for (let c = 0; c < newCols; c++) {
        newGrid[r][c] = (r < this._chapterEditRows && c < this._chapterEditCols)
          ? (this._chapterEditGrid[r]?.[c] ?? null) : null;
      }
    }
    this._chapterEditRows = newRows;
    this._chapterEditCols = newCols;
    this._chapterEditGrid = newGrid;
    this._recordChapterSnapshot(chapter);
    if (this._chapterCanvas) {
      setTileSize(computeTileSize(newRows, newCols));
      this._chapterCanvas.width  = newCols * TILE_SIZE;
      this._chapterCanvas.height = newRows * TILE_SIZE;
    }
    this._updateChapterCanvasDisplaySize();
    this._saveChapterGridState(chapter, campaign);
    this._renderChapterCanvas();
  }

  // ─── Chapter map validation ───────────────────────────────────────────────

  private _validateChapterMap(chapter: ChapterDef): ValidationResult {
    const msgs: string[] = [];
    let ok = true;

    let sourcePos: { row: number; col: number } | null = null;
    let sinkPos: { row: number; col: number } | null = null;
    const levelChamberIdxs = new Set<number>();

    for (let r = 0; r < this._chapterEditRows; r++) {
      for (let c = 0; c < this._chapterEditCols; c++) {
        const def = this._chapterEditGrid[r]?.[c];
        if (!def) continue;
        if (def.shape === PipeShape.Source) {
          if (sourcePos) { msgs.push('Multiple Source tiles found.'); ok = false; }
          else sourcePos = { row: r, col: c };
        }
        if (def.shape === PipeShape.Sink) {
          if (sinkPos) msgs.push('⚠️ Multiple Sink tiles found – only first is checked.');
          else sinkPos = { row: r, col: c };
        }
        if (def.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
          levelChamberIdxs.add(def.levelIdx);
        }
      }
    }

    if (!sourcePos) { msgs.push('❌ No Source tile found.'); ok = false; }
    if (!sinkPos) { msgs.push('❌ No Sink tile found.'); ok = false; }

    // Check all levels are placed
    for (let li = 0; li < chapter.levels.length; li++) {
      if (!levelChamberIdxs.has(li)) {
        msgs.push(`❌ Level ${li + 1} (${chapter.levels[li].name}) is not placed on the map.`);
        ok = false;
      }
    }

    if (!sourcePos || !sinkPos) return { ok, messages: msgs };

    // BFS reachability check
    const getConns = (def: TileDef, _isEntry: boolean): Set<Direction> => {
      if (def.connections) return new Set(def.connections);
      // Source/Sink/Chamber default: all 4 sides
      if (def.shape === PipeShape.Source || def.shape === PipeShape.Sink || def.shape === PipeShape.Chamber) {
        return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
      }
      // Pipe shapes
      const t = new Tile(def.shape, (def.rotation ?? 0) as Rotation, true, 0, 0, null, 1, null, null, 0, 0, 0, 0);
      return t.connections;
    };

    const reached = computeChapterMapReachable(
      this._chapterEditGrid,
      this._chapterEditRows,
      this._chapterEditCols,
      sourcePos,
      getConns,
    );

    // Check sink reachable
    const sinkKey = `${sinkPos.row},${sinkPos.col}`;
    if (!reached.has(sinkKey)) {
      msgs.push('❌ Sink is not reachable from the Source through connections.');
      ok = false;
    }

    // Check all level chambers reachable
    for (let r = 0; r < this._chapterEditRows; r++) {
      for (let c = 0; c < this._chapterEditCols; c++) {
        const def = this._chapterEditGrid[r]?.[c];
        if (def?.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
          if (!reached.has(`${r},${c}`)) {
            msgs.push(`❌ Level ${def.levelIdx + 1} chamber at (${r},${c}) is not reachable from the Source.`);
            ok = false;
          }
        }
      }
    }

    if (msgs.length === 0 || ok) msgs.push('✅ Chapter map structure looks valid.');
    return { ok, messages: msgs };
  }
}
