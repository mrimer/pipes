/**
 * ChapterMapEditorSection – encapsulates all chapter map editor state and UI
 * methods that were previously part of CampaignEditor in index.ts.
 */

import { CampaignDef, ChapterDef, LevelDef, TileDef, PipeShape, Direction, Rotation, LevelStyle } from '../types';
import { PIPE_SHAPES, isEmptyFloor } from '../board';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';
import { renderEditorCanvas, HoverOverlay, DragState } from './renderer';
import {
  EditorPalette,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
  EDITOR_CANVAS_BORDER,
  buildMapTileDef,
  rotateConnectionsBy90,
  computeEditorFilledCells,
} from './types';
import { ChapterEditorUI, ChapterEditorUICallbacks } from './chapterEditorUI';
import { ChapterMapInput, ChapterMapInputCallbacks } from './chapterMapInput';
import { validateChapterMap } from './chapterMapValidator';
import { sfxManager, SfxId } from '../sfxManager';
import { hasShapeElsewhere } from './gridUtils';
import { HistoryManager } from './historyManager';
import { EDITOR_INPUT_BG, MUTED_BTN_BG, RADIUS_SM, UI_BG } from '../uiConstants';
import { showTimedMessage, updateUndoRedoButtonPair } from '../uiHelpers';
import {
  updateMapEditorCanvas,
  drawFocusedTileOverlay,
  buildCanvasWithErrorDiv,
} from './canvasUtils';
import { MapEditorGridState } from './mapEditorGridState';
import { handleMapEditorKeyDown } from './mapEditorSectionUtils';

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

  // ── Grid state (delegated to MapEditorGridState) ──────────────────────────
  private readonly _gridState: MapEditorGridState;

  // ── State fields ──────────────────────────────────────────────────────────
  private _chapterPalette: EditorPalette = PipeShape.Source;
  private _chapterParams: TileParams = { ...DEFAULT_PARAMS };
  private _chapterCanvas: HTMLCanvasElement | null = null;
  private _chapterCtx: CanvasRenderingContext2D | null = null;
  private readonly _chapterHist = new HistoryManager<EditorSnapshot>();
  private _chapterSelectedLevelIdx: number | null = null;
  private _chapterEditorMainLayout: HTMLDivElement = document.createElement('div');
  /** Error flash element shown below the chapter map canvas. */
  private _chapterErrorEl: HTMLDivElement | null = null;

  /** Default chapter grid dimensions. */
  private static readonly CHAPTER_DEFAULT_ROWS = 3;
  private static readonly CHAPTER_DEFAULT_COLS = 6;

  constructor(callbacks: ChapterMapEditorCallbacks) {
    this._callbacks = callbacks;
    this._gridState = new MapEditorGridState(
      ChapterMapEditorSection.CHAPTER_DEFAULT_ROWS,
      ChapterMapEditorSection.CHAPTER_DEFAULT_COLS,
    );
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
    this._gridState.init(chapter.rows, chapter.cols, chapter.grid);
    this._chapterHist.clear();
    this._chapterSelectedLevelIdx = null;
    this._recordChapterSnapshot(chapter, false);
  }

  /** Write current chapter grid state back to the chapter object and persist. */
  private _saveChapterGridState(chapter: ChapterDef, campaign: CampaignDef): void {
    chapter.rows = this._gridState.rows;
    chapter.cols = this._gridState.cols;
    chapter.grid = structuredClone(this._gridState.grid);
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
      `background:${EDITOR_INPUT_BG};border:1px solid #4a90d9;border-radius:8px;padding:16px;` +
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
    leftCol.appendChild(this._ui.buildStylePanel(chapter, campaign));
    leftCol.appendChild(this._ui.buildPalettePanel(chapter, campaign));
    leftCol.appendChild(this._ui.buildTileParamsPanel(chapter, campaign));
    layout.appendChild(leftCol);

    const midCol = document.createElement('div');
    midCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;';

    // Toolbar: undo/redo + validate
    const midToolbar = document.createElement('div');
    midToolbar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const undoBtn = this._callbacks.buildBtn('↩ Undo', MUTED_BTN_BG, '#aaa', () => this._chapterUndo(campaign, chapter), true);
    undoBtn.id = 'chapter-undo-btn';
    midToolbar.appendChild(undoBtn);
    const redoBtn = this._callbacks.buildBtn('↪ Redo', MUTED_BTN_BG, '#aaa', () => this._chapterRedo(campaign, chapter), true);
    redoBtn.id = 'chapter-redo-btn';
    midToolbar.appendChild(redoBtn);

    midToolbar.appendChild(this._callbacks.buildBtn('✔ Validate', UI_BG, '#7ed321', () => {
      const result = validateChapterMap(
        this._gridState.grid, this._gridState.rows, this._gridState.cols, chapter,
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
      getChapterEditGrid:         () => this._gridState.grid,
      getChapterEditRows:         () => this._gridState.rows,
      getChapterEditCols:         () => this._gridState.cols,
      getChapterFocusedTilePos:   () => this._gridState.focusedTilePos,
      getChapterStyle: (ch) => ch.style,
      setChapterStyle: (style: LevelStyle, ch: ChapterDef) => {
        ch.style = style;
        this._recordChapterSnapshot(ch);
        this._renderChapterCanvas();
      },
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
      getEditGrid:          () => this._gridState.grid,
      getEditRows:          () => this._gridState.rows,
      getEditCols:          () => this._gridState.cols,
      getPalette:           () => this._chapterPalette,
      setPalette:           (p) => { this._chapterPalette = p; },
      getSelectedLevelIdx:  () => this._chapterSelectedLevelIdx,
      setSelectedLevelIdx:  (i) => { this._chapterSelectedLevelIdx = i; },
      getFocusedTilePos:    () => this._gridState.focusedTilePos,
      setFocusedTilePos:    (pos) => { this._gridState.focusedTilePos = pos; },
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
      clearFocusIfAt:       (pos) => this._gridState.clearFocusIfAt(pos),
      getActiveCampaign:    () => this._callbacks.getActiveCampaign(),
      getActiveChapterIdx:  () => this._callbacks.getActiveChapterIdx(),
      openLevelEditor:      (idx, ro) => this._callbacks.openLevelEditor(idx, ro),
    };
  }

  private _slideChapterGrid(dir: 'N' | 'E' | 'S' | 'W', chapter: ChapterDef): void {
    this._gridState.slide(dir);
    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._renderChapterCanvas();
  }

  private _rotateChapterGrid(clockwise: boolean, chapter: ChapterDef): void {
    this._gridState.rotate(clockwise);
    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._updateChapterCanvasDisplaySize();
    this._renderChapterCanvas();
  }

  private _reflectChapterGrid(chapter: ChapterDef): void {
    this._gridState.reflect();
    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._updateChapterCanvasDisplaySize();
    this._renderChapterCanvas();
  }

  private _flipChapterGridHorizontal(chapter: ChapterDef): void {
    this._gridState.flipHorizontal();
    this._recordChapterSnapshot(chapter);
    sfxManager.play(SfxId.BoardSlide);
    this._renderChapterCanvas();
  }

  private _flipChapterGridVertical(chapter: ChapterDef): void {
    this._gridState.flipVertical();
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
    setTileSize(computeTileSize(this._gridState.rows, this._gridState.cols));
    canvas.width  = this._gridState.cols * TILE_SIZE;
    canvas.height = this._gridState.rows * TILE_SIZE;
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:${RADIUS_SM};` +
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
      const { wrapper, errorEl } = buildCanvasWithErrorDiv(canvas);
      this._chapterErrorEl = errorEl;
      return wrapper;
    }

    return canvas;
  }

  /** Update the chapter canvas display size and intrinsic tile size to fill the available space. */
  private _updateChapterCanvasDisplaySize(): void {
    if (!this._chapterCanvas) return;
    updateMapEditorCanvas(
      this._chapterCanvas,
      this._gridState.rows,
      this._gridState.cols,
      this._chapterEditorMainLayout,
    );
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
        const hoverCell = this._gridState.grid[hover.row]?.[hover.col] ?? null;
        const isEmpty = hoverCell === null;
        overlay = { pos: hover, def: null, alpha: isEmpty ? 0.2 : 1 };
      } else if (this._chapterSelectedLevelIdx !== null) {
        // Preview: level chamber placeholder – only on empty cells
        const hoverCell = this._gridState.grid[hover.row]?.[hover.col] ?? null;
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
        const hoverCell = this._gridState.grid[hover.row]?.[hover.col] ?? null;
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
      this._gridState.grid,
      this._gridState.rows,
      this._gridState.cols,
      overlay,
      drag,
      null,
      levelDefs,
      undefined,
      filledKeys,
      chapter?.style,
    );

    drawFocusedTileOverlay(ctx, this._gridState.focusedTilePos);
  }

  /** Build a TileDef from the current chapter palette selection and params. */
  private _buildChapterTileDef(): TileDef {
    return buildMapTileDef(this._chapterPalette, this._chapterParams);
  }

  private _chapterHasSourceElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this._gridState.grid, this._gridState.rows, this._gridState.cols, PipeShape.Source, exceptPos);
  }

  private _chapterHasSinkElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this._gridState.grid, this._gridState.rows, this._gridState.cols, PipeShape.Sink, exceptPos);
  }

  /** Flash an error below the chapter map canvas when the Sink placement constraint is violated. */
  private _showChapterSinkError(): void {
    const el = this._chapterErrorEl;
    if (!el) return;
    showTimedMessage(el, 'Only one sink tile is allowed.');
  }

  private _computeChapterEditorFilledCells(): Set<string> {
    return computeEditorFilledCells(this._gridState.grid, this._gridState.rows, this._gridState.cols);
  }

  private _rotateChapterTileAt(
    pos: { row: number; col: number },
    clockwise: boolean,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): void {
    const tile = this._gridState.grid[pos.row]?.[pos.col];
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

  private _rotateChapterSourceSinkAt(
    pos: { row: number; col: number },
    clockwise: boolean,
    chapter: ChapterDef,
    campaign: CampaignDef,
  ): void {
    const tile = this._gridState.grid[pos.row]?.[pos.col];
    if (!tile) return;
    const isConnectable =
      tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === 'level');
    if (!isConnectable) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);

    const newConns = rotateConnectionsBy90(tile.connections, clockwise);
    tile.connections = newConns;

    // Sync palette params when the palette matches the tile shape
    if (this._chapterPalette === tile.shape) {
      this._chapterParams.connections = {
        N: newConns.includes(Direction.North),
        E: newConns.includes(Direction.East),
        S: newConns.includes(Direction.South),
        W: newConns.includes(Direction.West),
      };
    }

    // Update focused tile and rebuild params panel
    this._gridState.focusedTilePos = pos;
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
    handleMapEditorKeyDown(e, {
      onUndo: () => {
        const campaign = this._callbacks.getActiveCampaign();
        const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
        if (campaign && chapter) this._chapterUndo(campaign, chapter);
      },
      onRedo: () => {
        const campaign = this._callbacks.getActiveCampaign();
        const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
        if (campaign && chapter) this._chapterRedo(campaign, chapter);
      },
      getHoverTileAndPos: () => {
        const pos = this._input?.hover ?? null;
        if (!pos) return null;
        const tile = this._gridState.grid[pos.row]?.[pos.col] ?? null;
        return tile ? { tile, pos } : null;
      },
      isConnectableForRotation: (tile) =>
        tile.shape === PipeShape.Source ||
        tile.shape === PipeShape.Sink ||
        (tile.shape === PipeShape.Chamber && tile.chamberContent === 'level'),
      rotateTileAt: (pos, cw) => {
        const campaign = this._callbacks.getActiveCampaign();
        const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
        if (campaign && chapter) this._rotateChapterTileAt(pos, cw, chapter, campaign);
      },
      rotateSourceSinkAt: (pos, cw) => {
        const campaign = this._callbacks.getActiveCampaign();
        const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
        if (campaign && chapter) this._rotateChapterSourceSinkAt(pos, cw, chapter, campaign);
      },
      rotatePalette: (cw) => this._rotateChapterPalette(cw),
    });
  }

  // ─── Chapter editor undo/redo ────────────────────────────────────────────

  private _recordChapterSnapshot(chapter: ChapterDef, markChanged = true): void {
    // Passing live reference is intentional: HistoryManager.record() deep-clones
    // via structuredClone() so the stored copy is independent.
    const snapshot: EditorSnapshot = {
      grid: this._gridState.grid,
      rows: this._gridState.rows,
      cols: this._gridState.cols,
      inventory: [],
      levelStyle: chapter.style,
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

  private _applyChapterSnapshot(snap: EditorSnapshot, chapter: ChapterDef, campaign: CampaignDef): void {
    this._gridState.grid = snap.grid as (TileDef | null)[][];
    this._gridState.rows = snap.rows;
    this._gridState.cols = snap.cols;
    chapter.style = snap.levelStyle as typeof chapter.style;
    this._updateChapterCanvasDisplaySize();
    this._saveChapterGridState(chapter, campaign);
    this._ui!.rebuildLevelInventory(chapter, campaign);
    this._ui!.rebuildGridSizePanel(chapter, campaign);
    this._ui!.rebuildStylePanel(chapter, campaign);
    this._updateChapterUndoRedoButtons();
    this._renderChapterCanvas();
  }

  private _updateChapterUndoRedoButtons(): void {
    updateUndoRedoButtonPair('chapter-undo-btn', 'chapter-redo-btn', this._chapterHist.canUndo, this._chapterHist.canRedo);
  }

  /** Resize the chapter grid. */
  private _resizeChapterGrid(newRows: number, newCols: number, campaign: CampaignDef, chapter: ChapterDef): void {
    this._gridState.resize(newRows, newCols);
    this._recordChapterSnapshot(chapter);
    this._updateChapterCanvasDisplaySize();
    this._saveChapterGridState(chapter, campaign);
    this._renderChapterCanvas();
  }

}

