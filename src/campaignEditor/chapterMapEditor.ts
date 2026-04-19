/**
 * ChapterMapEditorSection – encapsulates all chapter map editor state and UI
 * methods that were previously part of CampaignEditor in index.ts.
 *
 * Extends {@link MapEditorBase} for shared grid operations, undo/redo,
 * rotation helpers, and reachability utilities.
 */

import { CampaignDef, ChapterDef, LevelDef, TileDef, PipeShape, LevelStyle } from '../types';
import { isEmptyFloor } from '../board';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';
import { renderEditorCanvas, HoverOverlay, DragState } from './renderer';
import {
  EditorSnapshot,
  EDITOR_CANVAS_BORDER,
  buildMapTileDef,
} from './types';
import { ChapterEditorUI, ChapterEditorUICallbacks } from './chapterEditorUI';
import { ChapterMapInput, ChapterMapInputCallbacks } from './chapterMapInput';
import { validateChapterMap } from './chapterMapValidator';
import { hasShapeElsewhere } from './gridUtils';
import { EDITOR_INPUT_BG, MUTED_BTN_BG, RADIUS_SM, UI_BG } from '../uiConstants';
import {
  updateMapEditorCanvas,
  drawFocusedTileOverlay,
  buildCanvasWithErrorDiv,
} from './canvasUtils';
import { handleMapEditorKeyDown } from './mapEditorSectionUtils';
import { MapEditorBase } from './mapEditorBase';
import { saveChapterEditorMapBoxCollapsed } from '../persistence';

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

export class ChapterMapEditorSection extends MapEditorBase {
  private readonly _callbacks: ChapterMapEditorCallbacks;
  private _ui: ChapterEditorUI | null = null;
  private _input: ChapterMapInput | null = null;

  // ── State fields ──────────────────────────────────────────────────────────
  private _chapterSelectedLevelIdx: number | null = null;
  private _chapterEditorMainLayout: HTMLDivElement = document.createElement('div');

  // ── Map box collapsed state ────────────────────────────────────────────────
  private _mapBoxCollapsed = false;

  /** Default chapter grid dimensions. */
  private static readonly CHAPTER_DEFAULT_ROWS = 3;
  private static readonly CHAPTER_DEFAULT_COLS = 6;

  protected get _chamberContentType(): 'level' { return 'level'; }
  protected get _undoBtnId(): string { return 'chapter-undo-btn'; }
  protected get _redoBtnId(): string { return 'chapter-redo-btn'; }
  get _chapterHist() { return this._hist; }

  constructor(callbacks: ChapterMapEditorCallbacks) {
    super(
      ChapterMapEditorSection.CHAPTER_DEFAULT_ROWS,
      ChapterMapEditorSection.CHAPTER_DEFAULT_COLS,
    );
    this._callbacks = callbacks;
  }

  /** Initialize grid state from the given chapter (or create defaults). */
  init(chapter: ChapterDef): void {
    this._input?.detach();
    this._input = null;
    this._initChapterGridState(chapter);
  }

  /**
   * Set the collapsed state of the Map box (e.g. restored from localStorage).
   * Must be called before {@link buildSection} so the initial UI reflects the state.
   */
  setMapBoxCollapsed(collapsed: boolean): void {
    this._mapBoxCollapsed = collapsed;
  }

  /** Build and return the full chapter map editor section element. */
  buildSection(campaign: CampaignDef, chapter: ChapterDef, isOfficial: boolean): HTMLElement {
    return this._buildChapterMapSection(campaign, chapter, isOfficial);
  }

  /** Update the chapter canvas CSS display size. */
  updateCanvasDisplaySize(): void {
    this._updateCanvasDisplaySize();
  }

  /** Re-render the chapter map canvas. */
  renderCanvas(): void {
    this._renderCanvas();
  }

  /** Sync undo/redo button enabled state with current history availability. */
  syncUndoRedoButtons(): void {
    this._updateUndoRedoButtons();
  }

  // ── Abstract method implementations ───────────────────────────────────────

  protected _recordSnapshot(markChanged = true): void {
    const campaign = this._callbacks.getActiveCampaign();
    const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
    this._recordSnapshotBase(chapter?.style, markChanged);
  }

  /** Backward-compatible test hook retained for legacy callers. */
  _recordChapterSnapshot(): void {
    this._recordSnapshot();
  }

  protected _saveGrid(): void {
    const campaign = this._callbacks.getActiveCampaign();
    const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
    if (!campaign || !chapter) return;
    chapter.rows = this._gridState.rows;
    chapter.cols = this._gridState.cols;
    chapter.grid = structuredClone(this._gridState.grid);
    this._callbacks.touchCampaign(campaign);
    this._callbacks.saveCampaigns();
  }

  protected _renderCanvas(): void {
    this._renderChapterCanvas();
  }

  protected _updateCanvasDisplaySize(): void {
    this._updateChapterCanvasDisplaySize();
  }

  protected _rebuildTileParamsPanel(): void {
    const campaign = this._callbacks.getActiveCampaign();
    const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
    const existing = document.getElementById('chapter-tile-params-panel');
    if (existing && this._ui && campaign && chapter) {
      existing.replaceWith(this._ui.buildTileParamsPanel(chapter, campaign));
    }
  }

  protected _applySnapshot(snap: EditorSnapshot): void {
    const campaign = this._callbacks.getActiveCampaign();
    const chapter = campaign?.chapters[this._callbacks.getActiveChapterIdx()];
    this._applySnapshotBase(snap, (style) => {
      if (chapter) chapter.style = style as typeof chapter.style;
    });
    if (this._ui && campaign && chapter) {
      this._ui.rebuildLevelInventory(chapter, campaign);
      this._ui.rebuildGridSizePanel(chapter, campaign);
      this._ui.rebuildStylePanel(chapter, campaign);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Initialize grid state from the chapter's saved grid data, or create a
   * default 3×6 grid with source/sink.
   */
  private _initChapterGridState(chapter: ChapterDef): void {
    this._gridState.init(chapter.rows, chapter.cols, chapter.grid);
    this._hist.clear();
    this._chapterSelectedLevelIdx = null;
    this._recordSnapshot(false);
  }

  /**
   * Build the "Chapter Map" section: a 3-column layout with palette on the left,
   * canvas + validation button in the center, and level inventory + size controls
   * on the right.
   */
  private _buildChapterMapSection(campaign: CampaignDef, chapter: ChapterDef, isOfficial: boolean): HTMLElement {
    const section = document.createElement('div');
    section.id = 'chapter-map-editor-section';
    section.style.cssText =
      `background:${EDITOR_INPUT_BG};border:1px solid #4a90d9;border-radius:8px;padding:16px;` +
      'display:flex;flex-direction:column;gap:12px;';

    const sectionHeader = document.createElement('div');
    sectionHeader.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = '🗺️ Chapter Map';
    sectionTitle.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    sectionHeader.appendChild(sectionTitle);

    // Validation warning icon – stays in the header so it is visible even when the box is collapsed.
    const validationWarningIcon = document.createElement('span');
    validationWarningIcon.title = 'Chapter map has validation errors – click Validate for details';
    validationWarningIcon.style.cssText = 'display:none;font-size:1rem;cursor:default;';
    validationWarningIcon.textContent = '⚠️';
    sectionHeader.appendChild(validationWarningIcon);

    // Collapsible body containing all map editor content
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
    if (this._mapBoxCollapsed) body.style.display = 'none';

    const toggleBtn = this._callbacks.buildBtn(
      this._mapBoxCollapsed ? '▶ Expand' : '▼ Collapse',
      MUTED_BTN_BG, '#aaa',
      () => {
        this._mapBoxCollapsed = !this._mapBoxCollapsed;
        saveChapterEditorMapBoxCollapsed(this._mapBoxCollapsed);
        toggleBtn.textContent = this._mapBoxCollapsed ? '▶ Expand' : '▼ Collapse';
        body.style.display = this._mapBoxCollapsed ? 'none' : '';
        if (!this._mapBoxCollapsed) {
          requestAnimationFrame(() => {
            this._updateChapterCanvasDisplaySize();
            this._renderChapterCanvas();
          });
        }
      },
      true,
    );
    sectionHeader.appendChild(toggleBtn);
    section.appendChild(sectionHeader);

    if (isOfficial) {
      const readonlyMsg = document.createElement('p');
      readonlyMsg.style.cssText = 'color:#888;font-size:0.85rem;';
      readonlyMsg.textContent = 'Chapter map is read-only for official campaigns.';
      body.appendChild(readonlyMsg);
      // Still render the canvas in read-only mode
      const canvas = this._buildChapterMapCanvas(campaign, chapter, true);
      body.appendChild(canvas);
      section.appendChild(body);
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

    const undoBtn = this._callbacks.buildBtn('↩ Undo', MUTED_BTN_BG, '#aaa', () => this._doUndo(), true);
    undoBtn.id = 'chapter-undo-btn';
    midToolbar.appendChild(undoBtn);
    const redoBtn = this._callbacks.buildBtn('↪ Redo', MUTED_BTN_BG, '#aaa', () => this._doRedo(), true);
    redoBtn.id = 'chapter-redo-btn';
    midToolbar.appendChild(redoBtn);

    // Helper: update the validate button and warning icon to reflect a validation result.
    const applyValidationState = (ok: boolean) => {
      if (ok) {
        validateBtn.textContent = '✔ Validate';
        validateBtn.style.color = '#7ed321';
        validateBtn.style.borderColor = '#7ed321';
        validateBtn.style.background = UI_BG;
        validationWarningIcon.style.display = 'none';
      } else {
        validateBtn.textContent = '✗ Validate';
        validateBtn.style.color = '#ff8c00';
        validateBtn.style.borderColor = '#ff8c00';
        validateBtn.style.background = UI_BG;
        validationWarningIcon.style.display = '';
      }
    };

    const validateBtn = this._callbacks.buildBtn('✔ Validate', UI_BG, '#7ed321', () => {
      const result = validateChapterMap(
        this._gridState.grid, this._gridState.rows, this._gridState.cols, chapter,
      );
      const icon = result.ok ? '✅' : '❌';
      alert(`${icon} Chapter Map Validation\n\n${result.messages.join('\n')}`);
      applyValidationState(result.ok);
    });
    midToolbar.appendChild(validateBtn);

    // Auto-validate on screen activation.
    const initResult = validateChapterMap(
      this._gridState.grid, this._gridState.rows, this._gridState.cols, chapter,
    );
    applyValidationState(initResult.ok);

    midCol.appendChild(midToolbar);

    midCol.appendChild(this._buildChapterMapCanvas(campaign, chapter, false));
    layout.appendChild(midCol);

    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:210px;';
    rightCol.appendChild(this._ui.buildLevelInventoryPanel(chapter, campaign));
    rightCol.appendChild(this._ui.buildGridSizePanel(chapter, campaign));
    layout.appendChild(rightCol);

    body.appendChild(layout);
    section.appendChild(body);
    return section;
  }

  /** Build the callback object that wires ChapterEditorUI to this section's state. */
  private _makeUICallbacks(): ChapterEditorUICallbacks {
    return {
      getChapterPalette:          () => this._palette,
      setChapterPalette:          (p) => { this._palette = p; },
      getChapterParams:           () => this._params,
      getChapterSelectedLevelIdx: () => this._chapterSelectedLevelIdx,
      setChapterSelectedLevelIdx: (i) => { this._chapterSelectedLevelIdx = i; },
      getChapterEditGrid:         () => this._gridState.grid,
      getChapterEditRows:         () => this._gridState.rows,
      getChapterEditCols:         () => this._gridState.cols,
      getChapterFocusedTilePos:   () => this._gridState.focusedTilePos,
      getChapterStyle: (ch) => ch.style,
      setChapterStyle: (style: LevelStyle, ch: ChapterDef) => {
        ch.style = style;
        this._recordSnapshot();
        this._renderCanvas();
      },
      recordSnapshot: (...args) => this._recordSnapshot(args[1] as boolean | undefined),
      saveGridState:  () => this._saveGrid(),
      resizeGrid: (r, c) => this._resizeGrid(r, c),
      slideGrid:  (d)    => this._slideGrid(d),
      rotateGrid: (cw)   => this._rotateGrid(cw),
      reflectGrid: () => this._reflectGrid(),
      flipGridHorizontal: () => this._flipGridHorizontal(),
      flipGridVertical:   () => this._flipGridVertical(),
      renderCanvas: () => this._renderCanvas(),
      buildBtn: (...args) => this._callbacks.buildBtn(...args),
    };
  }

  /** Build the callback object that wires ChapterMapInput to this section's state. */
  private _makeInputCallbacks(): ChapterMapInputCallbacks {
    return {
      getEditGrid:          () => this._gridState.grid,
      getEditRows:          () => this._gridState.rows,
      getEditCols:          () => this._gridState.cols,
      getPalette:           () => this._palette,
      setPalette:           (p) => { this._palette = p; },
      getSelectedLevelIdx:  () => this._chapterSelectedLevelIdx,
      setSelectedLevelIdx:  (i) => { this._chapterSelectedLevelIdx = i; },
      getFocusedTilePos:    () => this._gridState.focusedTilePos,
      setFocusedTilePos:    (pos) => { this._gridState.focusedTilePos = pos; },
      buildTileDef:         () => this._buildChapterTileDef(),
      hasSourceElsewhere:   () => this._chapterHasSourceElsewhere(),
      hasSinkElsewhere:     () => this._chapterHasSinkElsewhere(),
      showSinkError:        () => this._showSinkError(),
      rotateTileAt:         (pos, cw) => this._rotateTileAt(pos, cw),
      rotateSourceSinkAt:   (pos, cw) => this._rotateSourceSinkAt(pos, cw),
      rotatePalette:        (cw) => this._rotatePalette(cw),
      recordSnapshot:       () => this._recordSnapshot(),
      saveGridState:        () => this._saveGrid(),
      renderCanvas:         () => this._renderCanvas(),
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

  private _buildChapterMapCanvas(campaign: CampaignDef, chapter: ChapterDef, readOnly: boolean): HTMLElement {
    const canvas = document.createElement('canvas');
    setTileSize(computeTileSize(this._gridState.rows, this._gridState.cols));
    canvas.width  = this._gridState.cols * TILE_SIZE;
    canvas.height = this._gridState.rows * TILE_SIZE;
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:${RADIUS_SM};` +
      'cursor:' + (readOnly ? 'default' : 'crosshair') + ';display:block;';
    this._canvas = canvas;
    this._updateChapterCanvasDisplaySize();
    const ctx = canvas.getContext('2d');
    if (ctx) this._ctx = ctx;

    if (!readOnly) {
      this._input = new ChapterMapInput(this._makeInputCallbacks());
      this._input.attach(canvas, campaign, chapter);
    }

    if (!readOnly) {
      const { wrapper, errorEl } = buildCanvasWithErrorDiv(canvas);
      this._errorEl = errorEl;
      return wrapper;
    }

    return canvas;
  }

  /** Update the chapter canvas display size and intrinsic tile size to fill the available space. */
  private _updateChapterCanvasDisplaySize(): void {
    if (!this._canvas) return;
    updateMapEditorCanvas(
      this._canvas,
      this._gridState.rows,
      this._gridState.cols,
      this._chapterEditorMainLayout,
    );
  }

  /** Render the chapter map editor canvas. */
  private _renderChapterCanvas(): void {
    const ctx = this._ctx;
    if (!ctx) return;

    let overlay: HoverOverlay | null = null;
    let drag: DragState | null = null;

    const hover = this._input?.hover ?? null;
    drag = this._input?.dragState ?? null;

    if (!drag && hover) {
      if (this._palette === 'erase') {
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
    const filledKeys = this._computeFilledCells();

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
    return buildMapTileDef(this._palette, this._params);
  }

  private _chapterHasSourceElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this._gridState.grid, this._gridState.rows, this._gridState.cols, PipeShape.Source, exceptPos);
  }

  private _chapterHasSinkElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this._gridState.grid, this._gridState.rows, this._gridState.cols, PipeShape.Sink, exceptPos);
  }

  /**
   * Handle a keydown event for the chapter map editor.
   * Called from the campaign editor's global keyboard handler when on the Chapter screen.
   */
  handleChapterEditorKeyDown(e: KeyboardEvent): void {
    handleMapEditorKeyDown(e, {
      onUndo: () => this._doUndo(),
      onRedo: () => this._doRedo(),
      getHoverTileAndPos: () => {
        const pos = this._input?.hover ?? null;
        if (!pos) return null;
        const tile = this._gridState.grid[pos.row]?.[pos.col] ?? null;
        return tile ? { tile, pos } : null;
      },
      isConnectableForRotation: (tile) =>
        tile.shape === PipeShape.Source ||
        tile.shape === PipeShape.Sink ||
        (tile.shape === PipeShape.Chamber && tile.chamberContent === this._chamberContentType),
      rotateTileAt: (pos, cw) => this._rotateTileAt(pos, cw),
      rotateSourceSinkAt: (pos, cw) => this._rotateSourceSinkAt(pos, cw),
      rotatePalette: (cw) => this._rotatePalette(cw),
    });
  }

  // ─── Chapter editor undo/redo (legacy section - now delegated to MapEditorBase) ─

}
