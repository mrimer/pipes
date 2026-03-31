/**
 * ChapterMapEditorSection – encapsulates all chapter map editor state and UI
 * methods that were previously part of CampaignEditor in index.ts.
 */

import { CampaignDef, ChapterDef, LevelDef, TileDef, PipeShape, Direction, Rotation } from '../types';
import { PIPE_SHAPES } from '../board';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';
import { renderEditorCanvas, HoverOverlay, DragState } from './renderer';
import { computeChapterMapReachable, findChapterMapTile, editorTileConns } from '../chapterMapUtils';
import { generateChapterMapDecorations } from '../visuals/chapterMap';
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

/** The palette entry used for level chamber tiles in the chapter map editor. */
const LEVEL_CHAMBER_PALETTE: EditorPalette = 'chamber:level';

// ─── Callback interface ────────────────────────────────────────────────────────

export interface ChapterMapEditorCallbacks {
  buildBtn(label: string, bg: string, color: string, onClick: () => void): HTMLButtonElement;
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
  private _chapterFocusedTilePos: { row: number; col: number } | null = null;
  /** Ambient decorations for empty cells in the chapter editor canvas. */
  private _chapterDecorations: ReadonlyMap<string, import('../types').AmbientDecoration> = new Map();

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
    // Generate ambient decorations for the grid
    this._chapterDecorations = generateChapterMapDecorations(this._chapterEditRows, this._chapterEditCols);
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
    leftCol.appendChild(this._buildChapterTileParamsPanel(chapter, campaign));
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
      { palette: PipeShape.Source,       label: '💧 Source' },
      { palette: PipeShape.Sink,         label: '🏁 Sink' },
      { palette: LEVEL_CHAMBER_PALETTE,       label: '🚪 Level' },
      { palette: PipeShape.Tree,         label: '🌳 Tree' },
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
      const isSelected = this._chapterPalette === item.palette;
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
        'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
        'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';
      btn.addEventListener('click', () => {
        this._chapterPalette = item.palette;
        this._chapterSelectedLevelIdx = null;
        panel.replaceWith(this._buildChapterPalettePanel(chapter, campaign));
        const existingParams = document.getElementById('chapter-tile-params-panel');
        if (existingParams) existingParams.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));
        this._rebuildChapterLevelInventory(chapter, campaign);
        this._renderChapterCanvas();
      });
      panel.appendChild(btn);
    }

    // Connections widget for Source/Sink is now in the separate tile params panel
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
    const existingParams = document.getElementById('chapter-tile-params-panel');
    if (existingParams) existingParams.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));
  }

  private _buildChapterTileParamsPanel(chapter: ChapterDef, campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'chapter-tile-params-panel';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'TILE PARAMS';
    panel.appendChild(title);

    const focusedTile = this._chapterFocusedTilePos
      ? this._chapterEditGrid[this._chapterFocusedTilePos.row]?.[this._chapterFocusedTilePos.col] ?? null
      : null;
    const isFocusedLevelChamber =
      focusedTile?.shape === PipeShape.Chamber && focusedTile.chamberContent === 'level';
    const isFocusedSourceOrSink =
      focusedTile?.shape === PipeShape.Source || focusedTile?.shape === PipeShape.Sink;

    if ((isFocusedLevelChamber || isFocusedSourceOrSink) && this._chapterFocusedTilePos) {
      panel.appendChild(this._buildFocusedChamberConnectionsWidget(panel, focusedTile!, chapter, campaign));
      // For focused Sink tile, also show completion param editor
      if (focusedTile?.shape === PipeShape.Sink) {
        panel.appendChild(this._buildFocusedSinkCompletionWidget(panel, focusedTile, chapter, campaign));
      }
    } else if (this._chapterPalette === PipeShape.Source || this._chapterPalette === PipeShape.Sink) {
      panel.appendChild(this._buildChapterConnectionsWidget(panel, chapter, campaign));
      // For Sink palette, also show completion param
      if (this._chapterPalette === PipeShape.Sink) {
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
      () => this._chapterParams.completion,
      (val) => {
        this._chapterParams.completion = val;
        replaceTarget.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));
        this._renderChapterCanvas();
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
        this._recordChapterSnapshot(chapter);
        this._saveChapterGridState(chapter, campaign);
        replaceTarget.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));
        this._renderChapterCanvas();
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
      (dir) => this._chapterParams.connections[dirToKey[dir]],
      (dir) => {
        this._chapterParams.connections[dirToKey[dir]] = !this._chapterParams.connections[dirToKey[dir]];
        replaceTarget.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));
        this._renderChapterCanvas();
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
        this._recordChapterSnapshot(chapter);
        this._saveChapterGridState(chapter, campaign);
        replaceTarget.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));
        this._renderChapterCanvas();
      },
    );
  }


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
      // Mouse wheel: rotate the hovered rotatable tile, or the ghost preview when hovering empty/non-pipe cells
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const pos = this._chapterCanvasPos(e);
        if (!pos) return;
        const tile = this._chapterEditGrid[pos.row]?.[pos.col] ?? null;
        if (tile && PIPE_SHAPES.has(tile.shape)) {
          this._rotateChapterTileAt(pos, e.deltaY > 0, chapter, campaign);
        } else if (tile && (tile.shape === PipeShape.Source || tile.shape === PipeShape.Sink)) {
          this._rotateChapterSourceSinkAt(pos, e.deltaY > 0, chapter, campaign);
        } else if (PIPE_SHAPES.has(this._chapterPalette as PipeShape)) {
          this._rotateChapterPalette(e.deltaY > 0);
        }
      }, { passive: false });
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

    // Compute which cells are water-reachable from the source for visual feedback
    const filledKeys = this._computeChapterEditorFilledCells();

    renderEditorCanvas(
      ctx,
      this._chapterEditGrid,
      this._chapterEditRows,
      this._chapterEditCols,
      overlay,
      drag,
      null,
      levelDefs,
      undefined,
      filledKeys,
      this._chapterDecorations,
    );

    if (this._chapterFocusedTilePos && this._chapterCtx) {
      const { row, col } = this._chapterFocusedTilePos;
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      this._chapterCtx.save();
      this._chapterCtx.strokeStyle = '#f0c040';
      this._chapterCtx.lineWidth = 3;
      this._chapterCtx.setLineDash([5, 3]);
      this._chapterCtx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      this._chapterCtx.setLineDash([]);
      this._chapterCtx.restore();
    }
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
      // Sink can have an optional completion threshold; Source no longer uses capacity on chapter maps
      if (shape === PipeShape.Sink && p.completion > 0) def.completion = p.completion;
      if (connDirs.length < 4) def.connections = connDirs;
      return def;
    }
    // Tree, Granite, and other shapes with no special params
    if (shape === PipeShape.Tree || shape === PipeShape.Granite) {
      return { shape };
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

  /**
   * Compute which cells are water-reachable from the source in the editor grid.
   * For rendering purposes, all chambers and source/sink are treated as open
   * (water flows through unconditionally, simulating an ideal path).
   */
  private _computeChapterEditorFilledCells(): Set<string> {
    const sourcePos = findChapterMapTile(
      this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols, PipeShape.Source);
    if (!sourcePos) return new Set();

    return computeChapterMapReachable(
      this._chapterEditGrid,
      this._chapterEditRows,
      this._chapterEditCols,
      sourcePos,
      (def) => editorTileConns(def),
    );
  }

  /**
   * Rotate a placed pipe tile at the given position clockwise or counterclockwise.
   * No-op if the tile at pos is not a rotatable pipe shape.
   */
  private _rotateChapterTileAt(
    pos: { row: number; col: number },
    clockwise: boolean,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): void {
    const tile = this._chapterEditGrid[pos.row]?.[pos.col];
    if (!tile || !PIPE_SHAPES.has(tile.shape)) return;
    const cur = (tile.rotation ?? 0) as Rotation;
    tile.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    this._recordChapterSnapshot(chapter);
    this._saveChapterGridState(chapter, campaign);
    this._renderChapterCanvas();
  }

  /**
   * Rotate the current chapter palette's rotation param clockwise or counterclockwise.
   * Only applies when the palette is a pipe shape.
   */
  private _rotateChapterPalette(clockwise: boolean): void {
    if (!PIPE_SHAPES.has(this._chapterPalette as PipeShape)) return;
    const cur = this._chapterParams.rotation ?? 0;
    this._chapterParams.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    this._renderChapterCanvas();
  }

  /**
   * Rotate a placed Source or Sink tile at the given position by rotating its connections CW/CCW.
   * Also updates `_chapterParams.connections` when the palette matches the tile shape,
   * and rebuilds the Tile Params panel so it reflects the new orientation.
   */
  private _rotateChapterSourceSinkAt(
    pos: { row: number; col: number },
    clockwise: boolean,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): void {
    const tile = this._chapterEditGrid[pos.row]?.[pos.col];
    if (!tile || (tile.shape !== PipeShape.Source && tile.shape !== PipeShape.Sink)) return;

    const allDirs: Direction[] = [Direction.North, Direction.East, Direction.South, Direction.West];
    const currentConns = new Set(tile.connections ?? allDirs);

    // Rotate each connection direction CW or CCW
    const newConns = new Set<Direction>();
    for (const dir of currentConns) {
      let d = dir;
      if (clockwise) {
        // CW: N→E→S→W→N
        switch (d) {
          case Direction.North: d = Direction.East;  break;
          case Direction.East:  d = Direction.South; break;
          case Direction.South: d = Direction.West;  break;
          case Direction.West:  d = Direction.North; break;
        }
      } else {
        // CCW: N→W→S→E→N
        switch (d) {
          case Direction.North: d = Direction.West;  break;
          case Direction.West:  d = Direction.South; break;
          case Direction.South: d = Direction.East;  break;
          case Direction.East:  d = Direction.North; break;
        }
      }
      newConns.add(d);
    }
    tile.connections = [...newConns];

    // Sync palette params when the palette matches the tile shape
    if (this._chapterPalette === tile.shape) {
      this._chapterParams.connections = {
        N: newConns.has(Direction.North),
        E: newConns.has(Direction.East),
        S: newConns.has(Direction.South),
        W: newConns.has(Direction.West),
      };
    }

    // Update focused tile and rebuild params panel
    this._chapterFocusedTilePos = pos;
    const existingParams = document.getElementById('chapter-tile-params-panel');
    if (existingParams) existingParams.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));

    this._recordChapterSnapshot(chapter);
    this._saveChapterGridState(chapter, campaign);
    this._renderChapterCanvas();
  }

  /**
   * Handle a keydown event for the chapter map editor.
   * Called from the campaign editor's global keyboard handler when on the Chapter screen.
   */
  handleChapterEditorKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.ctrlKey || e.altKey || isInputFocused) return;
    const key = e.key.toLowerCase();
    if (key === 'q' || key === 'w') {
      e.preventDefault();
      this._rotateChapterPalette(key === 'w');
    }
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

    this._chapterFocusedTilePos = pos;

    // Auto-select the 'Level' palette item when a level chamber is focused
    const tileAtPos = this._chapterEditGrid[pos.row]?.[pos.col] ?? null;
    if (tileAtPos?.shape === PipeShape.Chamber && tileAtPos.chamberContent === 'level') {
      this._chapterPalette = LEVEL_CHAMBER_PALETTE;
      this._rebuildChapterPalette(chapter, campaign);
    }

    // Rebuild the tile params panel so it reflects the newly focused tile
    const existingParams = document.getElementById('chapter-tile-params-panel');
    if (existingParams) existingParams.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));

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
        // Auto-select the 'Level' palette and sync params panel after placement
        this._chapterPalette = LEVEL_CHAMBER_PALETTE;
        this._rebuildChapterPalette(chapter, campaign);
        const placedParams = document.getElementById('chapter-tile-params-panel');
        if (placedParams) placedParams.replaceWith(this._buildChapterTileParamsPanel(chapter, campaign));
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

    // 'chamber:level' palette: only focus/drag existing tiles; never place new ones
    if (this._chapterPalette === LEVEL_CHAMBER_PALETTE) {
      if (existingTile !== null) {
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
        this._rebuildChapterLevelInventory(chapter, campaign);
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
      this._rebuildChapterLevelInventory(chapter, campaign);
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
      this._chapterFocusedTilePos = null;
      this._chapterEditGrid[startPos.row][startPos.col] = null;
      this._chapterEditGrid[currentPos.row][currentPos.col] = tile;
      this._recordChapterSnapshot(chapter);
      this._saveChapterGridState(chapter, campaign);
    } else {
      // Click on a placed pipe tile: rotate it (shift = counter-clockwise)
      if (PIPE_SHAPES.has(tile.shape)) {
        this._rotateChapterTileAt(startPos, !e.shiftKey, chapter, campaign);
        return; // _rotateChapterTileAt already calls _renderChapterCanvas
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
    this._rebuildChapterLevelInventory(chapter, campaign);
    this._recordChapterSnapshot(chapter);
    this._saveChapterGridState(chapter, campaign);
    this._renderChapterCanvas();
  }

  // ─── Chapter editor undo/redo ────────────────────────────────────────────

  private _recordChapterSnapshot(_chapter: ChapterDef, markChanged = true): void {
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
  }

  private _chapterUndo(campaign: CampaignDef, chapter: ChapterDef): void {
    if (this._chapterHistoryIdx <= 0) return;
    this._applyChapterSnapshot(this._chapterHistory[--this._chapterHistoryIdx], chapter, campaign);
  }

  private _chapterRedo(campaign: CampaignDef, chapter: ChapterDef): void {
    if (this._chapterHistoryIdx >= this._chapterHistory.length - 1) return;
    this._applyChapterSnapshot(this._chapterHistory[++this._chapterHistoryIdx], chapter, campaign);
  }

  /** Apply a saved snapshot: restore grid dimensions, resize canvas, save, and re-render. */
  private _applyChapterSnapshot(snap: EditorSnapshot, chapter: ChapterDef, campaign: CampaignDef): void {
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
    // Regenerate decorations for the new grid dimensions
    this._chapterDecorations = generateChapterMapDecorations(newRows, newCols);
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
    const reached = computeChapterMapReachable(
      this._chapterEditGrid,
      this._chapterEditRows,
      this._chapterEditCols,
      sourcePos,
      (def) => editorTileConns(def),
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
