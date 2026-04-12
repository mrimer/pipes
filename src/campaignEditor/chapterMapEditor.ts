/**
 * ChapterMapEditorSection – encapsulates all chapter map editor state and UI
 * methods that were previously part of CampaignEditor in index.ts.
 */

import { CampaignDef, ChapterDef, LevelDef, TileDef, PipeShape, Direction, Rotation } from '../types';
import { PIPE_SHAPES, isEmptyFloor } from '../board';
import { TILE_SIZE, setTileSize, computeTileSize, BASE_TILE_SIZE } from '../renderer';
import { renderEditorCanvas, HoverOverlay, DragState } from './renderer';
import { computeChapterMapReachable, findChapterMapTile, editorTileConns } from '../chapterMapUtils';
import {
  EditorPalette,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
  EDITOR_CANVAS_BORDER,
  MAX_EDITOR_CANVAS_PX,
  rotateGridBy90,
  rotatePositionBy90,
  reflectGridAboutDiagonal,
  reflectPositionAboutDiagonal,
  flipGridHorizontal,
  flipGridVertical,
  flipPositionHorizontal,
  flipPositionVertical,
} from './types';
import { ChapterEditorUI, ChapterEditorUICallbacks } from './chapterEditorUI';
import { ChapterMapInput, ChapterMapInputCallbacks } from './chapterMapInput';
import { validateChapterMap } from './chapterMapValidator';
import { sfxManager, SfxId } from '../sfxManager';
import { resizeGrid, slideGrid, hasShapeElsewhere } from './gridUtils';
import { HistoryManager } from './historyManager';

// ─── Callback interface ────────────────────────────────────────────────────────

export interface ChapterMapEditorCallbacks {
  buildBtn(label: string, bg: string, color: string, onClick: () => void, suppressClick?: boolean): HTMLButtonElement;
  getActiveCampaign(): CampaignDef | null;
  getActiveChapterIdx(): number;
  touchCampaign(campaign: CampaignDef): void;
  saveCampaigns(): void;
  openLevelEditor(levelIdx: number, readOnly: boolean): void;
}

// ─── ChapterMapEditorSection ───────────────────────────────────────────────────

export class ChapterMapEditorSection {
  private readonly _callbacks: ChapterMapEditorCallbacks;
  private _ui: ChapterEditorUI | null = null;
  private _input: ChapterMapInput | null = null;

  // ── State fields ──────────────────────────────────────────────────────────
  private _chapterEditRows = 3;
  private _chapterEditCols = 6;
  private _chapterEditGrid: (TileDef | null)[][] = [];
  private _chapterPalette: EditorPalette = PipeShape.Source;
  private _chapterParams: TileParams = { ...DEFAULT_PARAMS };
  private _chapterCanvas: HTMLCanvasElement | null = null;
  private _chapterCtx: CanvasRenderingContext2D | null = null;
  private readonly _chapterHist = new HistoryManager<EditorSnapshot>();
  private _chapterSelectedLevelIdx: number | null = null;
  private _chapterEditorMainLayout: HTMLDivElement = document.createElement('div');
  private _chapterFocusedTilePos: { row: number; col: number } | null = null;
  /** Error flash element shown below the chapter map canvas. */
  private _chapterErrorEl: HTMLDivElement | null = null;

  /** Default chapter grid dimensions. */
  private static readonly CHAPTER_DEFAULT_ROWS = 3;
  private static readonly CHAPTER_DEFAULT_COLS = 6;

  constructor(callbacks: ChapterMapEditorCallbacks) {
    this._callbacks = callbacks;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Initialize grid state from the given chapter (or create defaults). */
  init(chapter: ChapterDef): void {
    this._input?.detach();
    this._input = null;
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
    this._chapterHist.clear();
    this._chapterSelectedLevelIdx = null;
    this._chapterFocusedTilePos = null;
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
    this._ui = new ChapterEditorUI(this._makeUICallbacks());
    leftCol.appendChild(this._ui.buildPalettePanel(chapter, campaign));
    leftCol.appendChild(this._ui.buildTileParamsPanel(chapter, campaign));
    layout.appendChild(leftCol);

    const midCol = document.createElement('div');
    midCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;';

    // Toolbar: undo/redo + validate
    const midToolbar = document.createElement('div');
    midToolbar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const undoBtn = this._callbacks.buildBtn('↩ Undo', '#2a2a4a', '#aaa', () => this._chapterUndo(campaign, chapter), true);
    undoBtn.id = 'chapter-undo-btn';
    midToolbar.appendChild(undoBtn);
    const redoBtn = this._callbacks.buildBtn('↪ Redo', '#2a2a4a', '#aaa', () => this._chapterRedo(campaign, chapter), true);
    redoBtn.id = 'chapter-redo-btn';
    midToolbar.appendChild(redoBtn);

    midToolbar.appendChild(this._callbacks.buildBtn('✔ Validate', '#16213e', '#7ed321', () => {
      const result = validateChapterMap(
        this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols, chapter,
      );
      const icon = result.ok ? '✅' : '❌';
      alert(`${icon} Chapter Map Validation\n\n${result.messages.join('\n')}`);
    }));
    midCol.appendChild(midToolbar);

    midCol.appendChild(this._buildChapterMapCanvas(campaign, chapter, false));
    layout.appendChild(midCol);

    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:210px;';
    rightCol.appendChild(this._ui.buildLevelInventoryPanel(chapter, campaign));
    rightCol.appendChild(this._ui.buildGridSizePanel(chapter, campaign));
    layout.appendChild(rightCol);

    section.appendChild(layout);
    return section;
  }

  /** Build the callback object that wires ChapterEditorUI to this section's state. */
  private _makeUICallbacks(): ChapterEditorUICallbacks {
    return {
      getChapterPalette:          () => this._chapterPalette,
      setChapterPalette:          (p) => { this._chapterPalette = p; },
      getChapterParams:           () => this._chapterParams,
      getChapterSelectedLevelIdx: () => this._chapterSelectedLevelIdx,
      setChapterSelectedLevelIdx: (i) => { this._chapterSelectedLevelIdx = i; },
      getChapterEditGrid:         () => this._chapterEditGrid,
      getChapterEditRows:         () => this._chapterEditRows,
      getChapterEditCols:         () => this._chapterEditCols,
      getChapterFocusedTilePos:   () => this._chapterFocusedTilePos,
      recordSnapshot: (ch, mark?) => this._recordChapterSnapshot(ch, mark),
      saveGridState:  (ch, camp)  => this._saveChapterGridState(ch, camp),
      resizeGrid: (r, c, ch, camp) => this._resizeChapterGrid(r, c, camp, ch),
      slideGrid:  (d, ch)         => this._slideChapterGrid(d, ch),
      rotateGrid: (cw, ch)        => this._rotateChapterGrid(cw, ch),
      reflectGrid: (ch)           => this._reflectChapterGrid(ch),
      flipGridHorizontal: (ch)    => this._flipChapterGridHorizontal(ch),
      flipGridVertical:   (ch)    => this._flipChapterGridVertical(ch),
      renderCanvas: () => this._renderChapterCanvas(),
      buildBtn: (...args) => this._callbacks.buildBtn(...args),
    };
  }

  /** Build the callback object that wires ChapterMapInput to this section's state. */
  private _makeInputCallbacks(): ChapterMapInputCallbacks {
    return {
      getEditGrid:          () => this._chapterEditGrid,
      getEditRows:          () => this._chapterEditRows,
      getEditCols:          () => this._chapterEditCols,
      getPalette:           () => this._chapterPalette,
      setPalette:           (p) => { this._chapterPalette = p; },
      getSelectedLevelIdx:  () => this._chapterSelectedLevelIdx,
      setSelectedLevelIdx:  (i) => { this._chapterSelectedLevelIdx = i; },
      getFocusedTilePos:    () => this._chapterFocusedTilePos,
      setFocusedTilePos:    (pos) => { this._chapterFocusedTilePos = pos; },
      buildTileDef:         () => this._buildChapterTileDef(),
      hasSourceElsewhere:   () => this._chapterHasSourceElsewhere(),
      hasSinkElsewhere:     () => this._chapterHasSinkElsewhere(),
      showSinkError:        () => this._showChapterSinkError(),
      rotateTileAt:         (pos, cw, ch, camp) => this._rotateChapterTileAt(pos, cw, ch, camp),
      rotateSourceSinkAt:   (pos, cw, ch, camp) => this._rotateChapterSourceSinkAt(pos, cw, ch, camp),
      rotatePalette:        (cw) => this._rotateChapterPalette(cw),
      recordSnapshot:       (ch) => this._recordChapterSnapshot(ch),
      saveGridState:        (ch, camp) => this._saveChapterGridState(ch, camp),
      renderCanvas:         () => this._renderChapterCanvas(),
      rebuildPalette:       (ch, camp) => this._ui!.rebuildPalette(ch, camp),
      rebuildLevelInventory: (ch, camp) => this._ui!.rebuildLevelInventory(ch, camp),
      rebuildTileParamsPanel: (ch, camp) => {
        const el = document.getElementById('chapter-tile-params-panel');
        if (el) el.replaceWith(this._ui!.buildTileParamsPanel(ch, camp));
      },
      clearFocusIfAt:       (pos) => this._clearFocusIfAt(pos),
      getActiveCampaign:    () => this._callbacks.getActiveCampaign(),
      getActiveChapterIdx:  () => this._callbacks.getActiveChapterIdx(),
      openLevelEditor:      (idx, ro) => this._callbacks.openLevelEditor(idx, ro),
    };
  }

  /**
   * Slide all chapter map tiles one cell in the given direction.  Tiles that
   * would fall off the edge of the grid are discarded.  The operation is
   * recorded as an undo snapshot.
   */
  private _slideChapterGrid(dir: 'N' | 'E' | 'S' | 'W', chapter: ChapterDef): void {
    this._chapterEditGrid = slideGrid(this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols, dir);
    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._renderChapterCanvas();
  }

  /**
   * Rotate the entire chapter map board 90° CW or CCW.  Swaps rows/cols,
   * repositions all tiles, and rotates each tile's connections/rotation
   * to match the new orientation.  Records an undo snapshot.
   */
  private _rotateChapterGrid(clockwise: boolean, chapter: ChapterDef): void {
    const oldRows = this._chapterEditRows;
    const oldCols = this._chapterEditCols;

    const { newGrid, newRows, newCols } = rotateGridBy90(this._chapterEditGrid, oldRows, oldCols, clockwise);

    this._chapterEditRows = newRows;
    this._chapterEditCols = newCols;
    this._chapterEditGrid = newGrid;

    // Update focused tile position to follow the rotation.
    if (this._chapterFocusedTilePos) {
      this._chapterFocusedTilePos = rotatePositionBy90(this._chapterFocusedTilePos, oldRows, oldCols, clockwise);
    }

    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._updateChapterCanvasDisplaySize();
    this._renderChapterCanvas();
  }

  /**
   * Reflect the entire chapter map board about the main diagonal (x=y /
   * transpose).  Swaps rows/cols, repositions all tiles, and reflects each
   * tile's connections/rotation.  Records an undo snapshot.
   */
  private _reflectChapterGrid(chapter: ChapterDef): void {
    const oldRows = this._chapterEditRows;
    const oldCols = this._chapterEditCols;

    const { newGrid, newRows, newCols } = reflectGridAboutDiagonal(this._chapterEditGrid, oldRows, oldCols);

    this._chapterEditRows = newRows;
    this._chapterEditCols = newCols;
    this._chapterEditGrid = newGrid;

    if (this._chapterFocusedTilePos) {
      this._chapterFocusedTilePos = reflectPositionAboutDiagonal(this._chapterFocusedTilePos);
    }

    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._updateChapterCanvasDisplaySize();
    this._renderChapterCanvas();
  }

  /**
   * Flip the entire chapter map board horizontally (left–right reflection).
   * Mirrors column positions and updates each tile's connections/rotation.
   * Records an undo snapshot.
   */
  private _flipChapterGridHorizontal(chapter: ChapterDef): void {
    const { newGrid } = flipGridHorizontal(
      this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols,
    );

    this._chapterEditGrid = newGrid;

    if (this._chapterFocusedTilePos) {
      this._chapterFocusedTilePos = flipPositionHorizontal(
        this._chapterFocusedTilePos, this._chapterEditCols,
      );
    }

    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._renderChapterCanvas();
  }

  /**
   * Flip the entire chapter map board vertically (top–bottom reflection).
   * Mirrors row positions and updates each tile's connections/rotation.
   * Records an undo snapshot.
   */
  private _flipChapterGridVertical(chapter: ChapterDef): void {
    const { newGrid } = flipGridVertical(
      this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols,
    );

    this._chapterEditGrid = newGrid;

    if (this._chapterFocusedTilePos) {
      this._chapterFocusedTilePos = flipPositionVertical(
        this._chapterFocusedTilePos, this._chapterEditRows,
      );
    }

    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._renderChapterCanvas();
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
      this._input = new ChapterMapInput(this._makeInputCallbacks());
      this._input.attach(canvas, campaign, chapter);
    }

    if (!readOnly) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
      wrap.appendChild(canvas);
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'font-size:0.85rem;color:#f44;display:none;font-weight:bold;';
      this._chapterErrorEl = errorDiv;
      wrap.appendChild(errorDiv);
      return wrap;
    }

    return canvas;
  }

  /** Update the chapter canvas display size and intrinsic tile size to fill the available space. */
  private _updateChapterCanvasDisplaySize(): void {
    if (!this._chapterCanvas) return;
    const rows = this._chapterEditRows;
    const cols = this._chapterEditCols;
    const BORDER = EDITOR_CANVAS_BORDER;
    const GAP = 12; // flex gap between columns in the main layout

    const mainLayout = this._chapterEditorMainLayout;
    let newTileSize = computeTileSize(rows, cols); // window-based fallback
    let scale = 1;

    if (mainLayout && mainLayout.clientWidth > 0) {
      // Compute available width in the mid column by subtracting sibling widths and gaps.
      let siblingW = 0;
      let siblingCount = 0;
      for (const child of mainLayout.children) {
        if (!child.contains(this._chapterCanvas)) {
          siblingW += (child as HTMLElement).offsetWidth;
          siblingCount++;
        }
      }
      const availW = mainLayout.clientWidth - siblingW - siblingCount * GAP - 2 * BORDER;

      // Compute available height based on the canvas's position in the viewport.
      let availH = Infinity;
      let absTop = 0;
      let el: HTMLElement | null = this._chapterCanvas;
      while (el) {
        absTop += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      if (absTop > 0) {
        const BOTTOM_MARGIN = 16;
        availH = window.innerHeight + window.scrollY - absTop - 2 * BORDER - BOTTOM_MARGIN;
      }

      if (availW > 0 && availH > 0) {
        // Choose the largest whole-pixel tile size that fits, capped at MAX_TILE_SIZE and
        // floored at BASE_TILE_SIZE.  This fills the available space without
        // exceeding the parent box dimensions.
        const MAX_TILE_SIZE = 128;
        const fit = Math.floor(Math.min(availW / cols, availH / rows));
        newTileSize = Math.max(BASE_TILE_SIZE, Math.min(MAX_TILE_SIZE, fit));
        // Scale down only if the container is narrower than BASE_TILE_SIZE per tile.
        const intrinsicW = cols * newTileSize;
        const intrinsicH = rows * newTileSize;
        scale = Math.min(1, availW / intrinsicW, availH / intrinsicH);
      }
    } else {
      // Layout not yet in the DOM – fall back to a CSS scale-down relative to
      // the maximum editor canvas size.
      const intrinsicW = cols * newTileSize;
      const intrinsicH = rows * newTileSize;
      scale = Math.min(1, MAX_EDITOR_CANVAS_PX / intrinsicW, MAX_EDITOR_CANVAS_PX / intrinsicH);
    }

    setTileSize(newTileSize);
    this._chapterCanvas.width  = cols * TILE_SIZE;
    this._chapterCanvas.height = rows * TILE_SIZE;
    this._chapterCanvas.style.width  = Math.round(cols * TILE_SIZE * scale) + 'px';
    this._chapterCanvas.style.height = Math.round(rows * TILE_SIZE * scale) + 'px';
  }

  /** Render the chapter map editor canvas. */
  private _renderChapterCanvas(): void {
    const ctx = this._chapterCtx;
    if (!ctx) return;

    let overlay: HoverOverlay | null = null;
    let drag: DragState | null = null;

    const hover = this._input?.hover ?? null;
    drag = this._input?.dragState ?? null;

    if (!drag && hover) {
      if (this._chapterPalette === 'erase') {
        const hoverCell = this._chapterEditGrid[hover.row]?.[hover.col] ?? null;
        const isEmpty = hoverCell === null;
        overlay = { pos: hover, def: null, alpha: isEmpty ? 0.2 : 1 };
      } else if (this._chapterSelectedLevelIdx !== null) {
        // Preview: level chamber placeholder – only on empty cells
        const hoverCell = this._chapterEditGrid[hover.row]?.[hover.col] ?? null;
        const isEmpty = hoverCell === null || (hoverCell !== null && isEmptyFloor(hoverCell.shape));
        if (isEmpty) {
          const levelDef: TileDef = {
            shape: PipeShape.Chamber,
            chamberContent: 'level',
            levelIdx: this._chapterSelectedLevelIdx,
          };
          overlay = { pos: hover, def: levelDef, alpha: 0.55 };
        }
      } else {
        // Show placement ghost on empty or empty-floor cells
        const hoverCell = this._chapterEditGrid[hover.row]?.[hover.col] ?? null;
        const isEmpty = hoverCell === null || (hoverCell !== null && isEmptyFloor(hoverCell.shape));
        if (isEmpty) {
          overlay = { pos: hover, def: this._buildChapterTileDef(), alpha: 0.55 };
        }
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
    if (this._chapterPalette === PipeShape.EmptyDirt) return { shape: PipeShape.EmptyDirt };
    if (this._chapterPalette === PipeShape.EmptyDark) return { shape: PipeShape.EmptyDark };
    if (this._chapterPalette === PipeShape.Empty) return { shape: PipeShape.Empty };
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
    // Tree, Granite, Sea, and other shapes with no special params
    if (shape === PipeShape.Tree || shape === PipeShape.Granite || shape === PipeShape.Sea) {
      return { shape };
    }
    // Pipe shapes
    return { shape, rotation: p.rotation };
  }

  private _chapterHasSourceElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols, PipeShape.Source, exceptPos);
  }

  private _chapterHasSinkElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols, PipeShape.Sink, exceptPos);
  }

  /** Flash an error below the chapter map canvas when the Sink placement constraint is violated. */
  private _showChapterSinkError(): void {
    const el = this._chapterErrorEl;
    if (!el) return;
    el.textContent = 'Only one sink tile is allowed.';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2000);
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

  /** Clear the focus tile if it matches the given position. */
  private _clearFocusIfAt(pos: { row: number; col: number }): void {
    if (this._chapterFocusedTilePos?.row === pos.row && this._chapterFocusedTilePos?.col === pos.col) {
      this._chapterFocusedTilePos = null;
    }
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
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
    const cur = (tile.rotation ?? 0) as Rotation;
    tile.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    // When the palette matches the rotated tile's shape, keep the ghost preview in sync
    if (this._chapterPalette === tile.shape) {
      this._chapterParams.rotation = tile.rotation;
    }
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
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
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
    if (!tile) return;
    const isConnectable =
      tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === 'level');
    if (!isConnectable) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);

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
    if (existingParams && this._ui) existingParams.replaceWith(this._ui.buildTileParamsPanel(chapter, campaign));

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
      const clockwise = key === 'w';
      // If hovering over a tile with connections, rotate it; otherwise rotate the palette ghost
      const hover = this._input?.hover ?? null;
      if (hover) {
        const tile = this._chapterEditGrid[hover.row]?.[hover.col] ?? null;
        if (tile) {
          const campaign = this._callbacks.getActiveCampaign();
          const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
          if (campaign && chapter) {
            if (PIPE_SHAPES.has(tile.shape)) {
              this._rotateChapterTileAt(hover, clockwise, chapter, campaign);
              return;
            } else if (
              tile.shape === PipeShape.Source ||
              tile.shape === PipeShape.Sink ||
              (tile.shape === PipeShape.Chamber && tile.chamberContent === 'level')
            ) {
              this._rotateChapterSourceSinkAt(hover, clockwise, chapter, campaign);
              return;
            }
          }
        }
      }
      this._rotateChapterPalette(clockwise);
    }
  }

  // ─── Chapter editor undo/redo ────────────────────────────────────────────

  private _recordChapterSnapshot(_chapter: ChapterDef, markChanged = true): void {
    // Passing live reference is intentional: HistoryManager.record() deep-clones
    // via JSON.parse(JSON.stringify()) so the stored copy is independent.
    const snapshot: EditorSnapshot = {
      grid: this._chapterEditGrid,
      rows: this._chapterEditRows,
      cols: this._chapterEditCols,
      inventory: [],
    };
    this._chapterHist.record(snapshot);
    if (markChanged) {
      this._updateChapterUndoRedoButtons();
    }
  }

  private _chapterUndo(campaign: CampaignDef, chapter: ChapterDef): void {
    const snap = this._chapterHist.undo();
    if (!snap) return;
    sfxManager.play(SfxId.Undo);
    this._applyChapterSnapshot(snap, chapter, campaign);
  }

  private _chapterRedo(campaign: CampaignDef, chapter: ChapterDef): void {
    const snap = this._chapterHist.redo();
    if (!snap) return;
    sfxManager.play(SfxId.Redo);
    this._applyChapterSnapshot(snap, chapter, campaign);
  }

  /**
   * Apply a saved snapshot: restore grid dimensions, resize canvas, save, and re-render.
   * Direct assignment is intentional: HistoryManager.undo()/redo() return deep clones
   * so the snapshot is independent of stored history entries.
   */
  private _applyChapterSnapshot(snap: EditorSnapshot, chapter: ChapterDef, campaign: CampaignDef): void {
    this._chapterEditGrid = snap.grid as (TileDef | null)[][];
    this._chapterEditRows = snap.rows;
    this._chapterEditCols = snap.cols;
    this._updateChapterCanvasDisplaySize();
    this._saveChapterGridState(chapter, campaign);
    this._ui!.rebuildLevelInventory(chapter, campaign);
    this._ui!.rebuildGridSizePanel(chapter, campaign);
    this._updateChapterUndoRedoButtons();
    this._renderChapterCanvas();
  }

  private _updateChapterUndoRedoButtons(): void {
    const undoBtn = document.getElementById('chapter-undo-btn') as HTMLButtonElement | null;
    const redoBtn = document.getElementById('chapter-redo-btn') as HTMLButtonElement | null;
    if (undoBtn) {
      undoBtn.disabled = !this._chapterHist.canUndo;
      undoBtn.style.opacity = undoBtn.disabled ? '0.4' : '1';
    }
    if (redoBtn) {
      redoBtn.disabled = !this._chapterHist.canRedo;
      redoBtn.style.opacity = redoBtn.disabled ? '0.4' : '1';
    }
  }

  /** Resize the chapter grid. */
  private _resizeChapterGrid(newRows: number, newCols: number, campaign: CampaignDef, chapter: ChapterDef): void {
    this._chapterEditGrid = resizeGrid(this._chapterEditGrid, this._chapterEditRows, this._chapterEditCols, newRows, newCols);
    this._chapterEditRows = newRows;
    this._chapterEditCols = newCols;
    this._recordChapterSnapshot(chapter);
    this._updateChapterCanvasDisplaySize();
    this._saveChapterGridState(chapter, campaign);
    this._renderChapterCanvas();
  }

}


