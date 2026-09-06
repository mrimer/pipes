/**
 * CampaignMapEditorSection – encapsulates all campaign map editor state and UI
 * for editing the campaign-level map grid (where chapters are placed as chambers).
 *
 * Mirrors ChapterMapEditorSection but operates on CampaignDef rather than ChapterDef:
 *   • Entity tiles use chamberContent:'chapter' + chapterIdx (not 'level' + levelIdx).
 *   • Inventory shows campaign chapters (not chapter levels).
 *   • Grid state is persisted to campaign.grid/rows/cols/style.
 *   • Validation uses validateCampaignMap().
 *
 * Extends {@link MapEditorBase} for shared grid operations, undo/redo,
 * rotation helpers, and reachability utilities.
 */

import type { CampaignDef, ChapterDef, TileDef, LevelDef } from '../types';
import { PipeShape, Direction } from '../types';
import { PIPE_SHAPES, isEmptyFloor, EMPTY_FLOOR_SHAPES } from '../board';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';
import type { HoverOverlay, DragState } from './editorRenderer';
import { renderEditorCanvas } from './editorRenderer';
import type {
  EditorPalette,
  TileParams,
  EditorSnapshot} from './types';
import {
  EDITOR_CANVAS_BORDER,
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
  PALETTE_ITEM_SELECTED_BORDER,
  PALETTE_ITEM_UNSELECTED_BORDER,
  PALETTE_ITEM_SELECTED_BG,
  PALETTE_ITEM_UNSELECTED_BG,
  PALETTE_ITEM_SELECTED_COLOR,
  PALETTE_ITEM_UNSELECTED_COLOR,
  REPEATABLE_EDITOR_TILES,
  isPipePlacementPalette,
  isTreeShape,
  buildMapTileDef,
  CAMPAIGN_MAP_MAX_DIM,
} from './types';
import { validateCampaignMap } from './campaignMapValidator';
import { sfxManager, SfxId } from '../audio/sfxManager';
import { hasShapeElsewhere } from './gridUtils';
import { buildStyleSectionPanel } from './tileParamsPanel';
import { buildCompassConnectionsWidget } from './connectionsWidget';
import { buildGridSizePanel } from './gridSizePanel';
import { EDITOR_INPUT_BG, MUTED_BTN_BG, RADIUS_SM, UI_BG } from '../uiConstants';
import { saveCampaignEditorMapBoxCollapsed } from '../persistence';
import {
  updateMapEditorCanvas,
  drawFocusedTileOverlay,
  buildCanvasWithErrorDiv,
} from './canvasUtils';
import { isTileConnectedToSource } from '../tile';
import { buildCompletionInputWidget } from './chapterEditorUI';
import { handleMapEditorKeyDown, applyMapValidationState, buildPaletteSubSection } from './mapEditorSectionUtils';
import { MAP_VIEW_MAX_COLS, MAP_VIEW_MAX_ROWS } from '../screens/chapterMapScreen';
import { computeViewBounds } from '../mapUtils';
import { MapEditorBase } from './mapEditorBase';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';

/** The palette entry that places a chapter-chamber tile on the campaign map. */
const CHAPTER_CHAMBER_PALETTE: EditorPalette = 'chamber:chapter';
const DEFAULT_CHAPTER_MAP_ROWS = 3;
const DEFAULT_CHAPTER_MAP_COLS = 6;

export function buildChapterPreviewLevelDefs(
  chapters: readonly ChapterDef[] | undefined,
  defaultRows = DEFAULT_CHAPTER_MAP_ROWS,
  defaultCols = DEFAULT_CHAPTER_MAP_COLS,
): LevelDef[] {
  return (chapters ?? []).map(ch => {
    const inferredRows = ch.grid?.length ?? 0;
    const inferredCols = ch.grid?.reduce((max, row) => Math.max(max, row?.length ?? 0), 0) ?? 0;
    const rows = typeof ch.rows === 'number' && ch.rows > 0
      ? ch.rows
      : (inferredRows > 0 ? inferredRows : defaultRows);
    const cols = typeof ch.cols === 'number' && ch.cols > 0
      ? ch.cols
      : (inferredCols > 0 ? inferredCols : defaultCols);
    const grid = ch.grid ?? Array.from(
      { length: rows },
      () => Array(cols).fill(null) as (TileDef | null)[],
    );
    return {
      id: ch.id,
      name: ch.name,
      rows,
      cols,
      grid,
      inventory: [],
      style: ch.style,
    };
  });
}

// ─── Internal drag state ──────────────────────────────────────────────────────

interface CampaignDragState {
  startPos: { row: number; col: number };
  tile: TileDef;
  currentPos: { row: number; col: number };
  moved: boolean;
}

// ─── Callback interface ────────────────────────────────────────────────────────

export interface CampaignMapEditorCallbacks {
  buildBtn(label: string, bg: string, color: string, onClick: () => void, suppressClick?: boolean): HTMLButtonElement;
  getActiveCampaign(): CampaignDef | null;
  touchCampaign(campaign: CampaignDef): void;
  saveCampaigns(): void;
  /** Navigate to the chapter detail screen for the given chapter. */
  openChapterEditor(chapterIdx: number, readOnly: boolean): void;
}

// ─── CampaignMapEditorSection ──────────────────────────────────────────────────

export class CampaignMapEditorSection extends MapEditorBase {
  private readonly _cbs: CampaignMapEditorCallbacks;
  private _seaAnimationFrameId: number | null = null;
  private _seaAnimationLoopToken = 0;

  // ── Palette / selection state ─────────────────────────────────────────────
  private _selectedChapterIdx: number | null = null;

  // ── Style panel state ─────────────────────────────────────────────────────
  private _styleSectionExpanded = false;

  // ── Palette sub-section expand state ──────────────────────────────────────
  private _floorSectionExpanded = false;
  private _pipesSectionExpanded = false;

  // ── Map box collapsed state ────────────────────────────────────────────────
  private _mapBoxCollapsed = false;

  // ── Mouse gesture state ───────────────────────────────────────────────────
  private _hover: { row: number; col: number } | null = null;
  private _dragState: CampaignDragState | null = null;
  private _paintDragActive = false;
  private _rightEraseDragActive = false;
  private _rightEraseChanged = false;
  private _suppressContextMenu = false;
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _dblClickHandler: ((e: MouseEvent) => void) | null = null;
  private _contextMenuHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseLeaveHandler: (() => void) | null = null;
  private _wheelHandler: ((e: WheelEvent) => void) | null = null;

  // ── Viewport / pan state (for oversized maps > MAP_VIEW_MAX_COLS × MAP_VIEW_MAX_ROWS) ──
  /** Horizontal pixel scroll offset in canvas-pixels. */
  private _panPixelX = 0;
  /** Vertical pixel scroll offset in canvas-pixels. */
  private _panPixelY = 0;
  /** Number of tile rows in the current view window (≤ MAP_VIEW_MAX_ROWS). */
  private _viewRows = MAP_VIEW_MAX_ROWS;
  /** Number of tile cols in the current view window (≤ MAP_VIEW_MAX_COLS). */
  private _viewCols = MAP_VIEW_MAX_COLS;
  /** Active pan drag state (middle-mouse-button or space+drag, etc.). */
  private _panDrag: {
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null = null;
  /** Left-button drag candidate for Shift+left-drag map panning. */
  private _leftPanCandidate: {
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null = null;

  /** Default campaign grid dimensions (same as chapter map defaults). */
  private static readonly DEFAULT_ROWS = DEFAULT_CHAPTER_MAP_ROWS;
  private static readonly DEFAULT_COLS = DEFAULT_CHAPTER_MAP_COLS;

  protected get _chamberContentType(): 'chapter' { return 'chapter'; }
  protected get _undoBtnId(): string { return 'campaign-map-undo-btn'; }
  protected get _redoBtnId(): string { return 'campaign-map-redo-btn'; }

  constructor(callbacks: CampaignMapEditorCallbacks) {
    super(
      CampaignMapEditorSection.DEFAULT_ROWS,
      CampaignMapEditorSection.DEFAULT_COLS,
    );
    this._cbs = callbacks;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Initialize grid state from the given campaign (or create defaults). */
  init(campaign: CampaignDef): void {
    this.stopSeaAnimationLoop();
    this._detachInput();
    // Canvas/ctx teardown belongs here (editor close/re-open), not inside
    // _detachInput, which is also called by _attachInput and must only manage
    // event-listener lifecycle.
    this._canvas = null;
    this._ctx = null;
    this._panPixelX = 0;
    this._panPixelY = 0;
    this._initGridState(campaign);
  }

  /**
   * Set the collapsed state of the Map box (e.g. restored from localStorage).
   * Must be called before {@link buildSection} so the initial UI reflects the state.
   */
  setMapBoxCollapsed(collapsed: boolean): void {
    this._mapBoxCollapsed = collapsed;
  }

  /** Build and return the full campaign map editor section element. */
  buildSection(campaign: CampaignDef, isOfficial: boolean): HTMLElement {
    return this._buildSection(campaign, isOfficial);
  }

  /** Update the canvas CSS display size. */
  updateCanvasDisplaySize(): void {
    this._updateCanvasDisplaySize();
  }

  /** Re-render the campaign map canvas. */
  renderCanvas(): void {
    this._renderCanvas();
  }

  /** Start continuously refreshing the campaign-map canvas (for animated sea tiles). */
  startSeaAnimationLoop(): void {
    if (this._seaAnimationFrameId !== null) return;
    const token = ++this._seaAnimationLoopToken;
    this._seaAnimationFrameId = requestAnimationFrame(() => this._seaAnimationTick(token));
  }

  /** Stop continuously refreshing the campaign-map canvas. */
  stopSeaAnimationLoop(): void {
    this._seaAnimationLoopToken++;
    if (this._seaAnimationFrameId === null) return;
    cancelAnimationFrame(this._seaAnimationFrameId);
    this._seaAnimationFrameId = null;
  }

  /** Sync undo/redo button enabled state with current history availability. */
  syncUndoRedoButtons(): void {
    this._updateUndoRedoButtons();
  }

  /**
   * Handle a keydown event for the campaign map editor.
   * Called from the campaign editor's global keyboard handler when on the Campaign screen.
   */
  handleCampaignEditorKeyDown(e: KeyboardEvent): void {
    handleMapEditorKeyDown(e, {
      onUndo: () => this._doUndo(),
      onRedo: () => this._doRedo(),
      getHoverTileAndPos: () => {
        const pos = this._hover;
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

  // ── Abstract method implementations ──────────────────────────────────────

  protected _recordSnapshot(markChanged = true): void {
    const campaign = this._cbs.getActiveCampaign();
    this._recordSnapshotBase(campaign?.style, markChanged);
  }

  protected _saveGrid(): void {
    const campaign = this._cbs.getActiveCampaign();
    if (!campaign) return;
    campaign.rows = this._gridState.rows;
    campaign.cols = this._gridState.cols;
    campaign.grid = structuredClone(this._gridState.grid);
    this._cbs.touchCampaign(campaign);
    this._cbs.saveCampaigns();
  }

  protected _renderCanvas(): void {
    this._renderCampaignCanvas();
  }

  protected _updateCanvasDisplaySize(): void {
    if (!this._canvas) return;
    const rows = this._gridState.rows;
    const cols = this._gridState.cols;
    const newViewRows = Math.min(rows, MAP_VIEW_MAX_ROWS);
    const newViewCols = Math.min(cols, MAP_VIEW_MAX_COLS);
    this._viewRows = newViewRows;
    this._viewCols = newViewCols;
    this._clampPan();
    updateMapEditorCanvas(this._canvas, newViewRows, newViewCols, this._mainLayout);
  }

  protected _rebuildTileParamsPanel(): void {
    const campaign = this._cbs.getActiveCampaign();
    if (!campaign) return;
    document.getElementById('campaign-map-tile-params-panel')
      ?.replaceWith(this._buildTileParamsPanel(campaign));
  }

  protected _applySnapshot(snap: EditorSnapshot): void {
    const campaign = this._cbs.getActiveCampaign();
    if (!campaign) return;
    this._applySnapshotBase(snap, (style) => {
      campaign.style = style;
    });
    document.getElementById('campaign-map-chapter-inventory')
      ?.replaceWith(this._buildChapterInventoryPanel(campaign));
    document.getElementById('campaign-map-grid-size-panel')
      ?.replaceWith(this._buildGridSizePanel(campaign));
    document.getElementById('campaign-map-style-panel')
      ?.replaceWith(this._buildStylePanel(campaign));
  }

  // ── Private: initialization ────────────────────────────────────────────────

  private _initGridState(campaign: CampaignDef): void {
    this._gridState.init(campaign.rows, campaign.cols, campaign.grid);
    this._hist.clear();
    this._selectedChapterIdx = null;
    this._recordSnapshot(false);
  }

  // ── Private: section layout ────────────────────────────────────────────────

  private _buildSection(campaign: CampaignDef, isOfficial: boolean): HTMLElement {
    const section = document.createElement('div');
    section.id = 'campaign-map-editor-section';
    section.style.cssText =
      `background:${EDITOR_INPUT_BG};border:1px solid #4a90d9;border-radius:8px;padding:16px;` +
      'display:flex;flex-direction:column;gap:12px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const title = document.createElement('h3');
    title.textContent = t('editor.campaignMap.title');
    title.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    header.appendChild(title);

    // Validation warning icon – stays in the header so it is visible even when the box is collapsed.
    const validationWarningIcon = document.createElement('span');
    validationWarningIcon.title = t('editor.campaignMap.validationErrors');
    validationWarningIcon.style.cssText = 'display:none;font-size:1rem;cursor:default;';
    validationWarningIcon.textContent = '⚠️';
    header.appendChild(validationWarningIcon);

    // Collapsible body containing all map editor content
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
    if (this._mapBoxCollapsed) body.style.display = 'none';

    const toggleBtn = this._cbs.buildBtn(
      this._mapBoxCollapsed ? t('editor.map.expand') : t('editor.map.collapse'),
      MUTED_BTN_BG, '#aaa',
      () => {
        this._mapBoxCollapsed = !this._mapBoxCollapsed;
        saveCampaignEditorMapBoxCollapsed(this._mapBoxCollapsed);
        toggleBtn.textContent = this._mapBoxCollapsed ? t('editor.map.expand') : t('editor.map.collapse');
        body.style.display = this._mapBoxCollapsed ? 'none' : '';
        if (!this._mapBoxCollapsed) {
          requestAnimationFrame(() => {
            this._updateCanvasDisplaySize();
            this._renderCanvas();
          });
        }
      },
      true,
    );
    header.appendChild(toggleBtn);
    section.appendChild(header);

    if (isOfficial) {
      const msg = document.createElement('p');
      msg.style.cssText = 'color:#888;font-size:0.85rem;';
      msg.textContent = t('editor.campaignMap.readOnly');
      body.appendChild(msg);
      body.appendChild(this._buildCanvas(campaign, true));
      section.appendChild(body);
      return section;
    }

    // 3-column layout: [palette+style] [canvas+toolbar] [chapter inventory+grid size]
    const layout = document.createElement('div');
    layout.style.cssText = 'display:flex;flex-wrap:nowrap;gap:12px;align-items:flex-start;';
    this._mainLayout = layout;

    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:140px;';
    leftCol.appendChild(this._buildStylePanel(campaign));
    leftCol.appendChild(this._buildPalettePanel(campaign));
    leftCol.appendChild(this._buildTileParamsPanel(campaign));
    layout.appendChild(leftCol);

    const midCol = document.createElement('div');
    midCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const undoBtn = this._cbs.buildBtn(t('editor.common.undo'), MUTED_BTN_BG, '#aaa', () => this._doUndo(), true);
    undoBtn.id = 'campaign-map-undo-btn';
    toolbar.appendChild(undoBtn);

    const redoBtn = this._cbs.buildBtn(t('editor.common.redo'), MUTED_BTN_BG, '#aaa', () => this._doRedo(), true);
    redoBtn.id = 'campaign-map-redo-btn';
    toolbar.appendChild(redoBtn);

    // Helper: update the validate button and warning icon to reflect a validation result.
    const applyValidationState = (ok: boolean) =>
      applyMapValidationState(validateBtn, validationWarningIcon, ok);

    const validateBtn = this._cbs.buildBtn(t('editor.common.validateOk'), UI_BG, '#7ed321', () => {
      const c = this._cbs.getActiveCampaign();
      if (!c) return;
      const result = validateCampaignMap(this._gridState.grid, this._gridState.rows, this._gridState.cols, c);
      const icon = result.ok ? '✅' : '❌';
      this._showValidationModal(t('editor.campaignMap.validationTitle'), icon, result.messages);
      applyValidationState(result.ok);
    });
    toolbar.appendChild(validateBtn);

    // Auto-validate on screen activation.
    const initResult = validateCampaignMap(this._gridState.grid, this._gridState.rows, this._gridState.cols, campaign);
    applyValidationState(initResult.ok);

    midCol.appendChild(toolbar);
    midCol.appendChild(this._buildCanvas(campaign, false));
    layout.appendChild(midCol);

    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:210px;';
    rightCol.appendChild(this._buildChapterInventoryPanel(campaign));
    rightCol.appendChild(this._buildGridSizePanel(campaign));
    layout.appendChild(rightCol);

    body.appendChild(layout);
    section.appendChild(body);
    return section;
  }

  // ── Private: panel builders ────────────────────────────────────────────────

  private _buildStylePanel(campaign: CampaignDef): HTMLElement {
    return buildStyleSectionPanel(
      'campaign-map-style-panel',
      this._styleSectionExpanded,
      campaign.style,
      () => {
        this._styleSectionExpanded = !this._styleSectionExpanded;
        document.getElementById('campaign-map-style-panel')?.replaceWith(this._buildStylePanel(campaign));
      },
      (style) => {
        if (campaign.style !== style) {
          campaign.style = style;
          this._recordSnapshot();
          this._saveGrid();
          this._renderCanvas();
        }
        document.getElementById('campaign-map-style-panel')?.replaceWith(this._buildStylePanel(campaign));
      },
    );
  }

  private _buildPalettePanel(campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'campaign-map-palette-panel';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    titleEl.textContent = t('editor.palette.title');
    panel.appendChild(titleEl);

    const FLOOR_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
      { palette: PipeShape.Empty,       label: '🟩 Empty - Summer' },
      { palette: PipeShape.EmptyFall,   label: '🍂 Empty - Fall' },
      { palette: PipeShape.EmptyDark,   label: '⬛ Empty - Dark' },
      { palette: PipeShape.EmptyWinter, label: '⬜ Empty - Winter' },
      { palette: PipeShape.EmptySpring, label: '🌸 Empty - Spring' },
      { palette: PipeShape.Sea,         label: '🌊 Sea' },
      { palette: PipeShape.Granite,     label: '🪨 Granite' },
      { palette: PipeShape.Tree,        label: '🌿 Tree' },
      { palette: PipeShape.Tree2,       label: '🌳 Tree 2' },
      { palette: PipeShape.Tree3,       label: '🌲 Tree 3' },
      { palette: PipeShape.Tree4,       label: '🌴 Tree 4' },
    ];

    const PIPES_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
      { palette: PipeShape.Straight, label: '━ Straight' },
      { palette: PipeShape.Elbow,    label: '┗ Elbow' },
      { palette: PipeShape.Tee,      label: '┣ Tee' },
      { palette: PipeShape.Cross,    label: '╋ Cross' },
    ];

    // Auto-expand section containing the currently selected palette item.
    this._autoExpandPaletteSectionForSelection(FLOOR_ITEMS, PIPES_ITEMS);

    const makeItemBtn = (item: { palette: EditorPalette; label: string }, indent = false): HTMLButtonElement =>
      this._buildPaletteItemButton(panel, campaign, item, indent);

    // Source and Sink at the top
    for (const item of [
      { palette: PipeShape.Source as EditorPalette, label: '💧 Source' },
      { palette: PipeShape.Sink   as EditorPalette, label: '🏁 Sink' },
    ]) {
      panel.appendChild(makeItemBtn(item));
    }

    // Chapter chamber item
    panel.appendChild(makeItemBtn({ palette: CHAPTER_CHAMBER_PALETTE, label: '📂 Chapter' }));

    // Collapsible Floor sub-menu
    buildPaletteSubSection(
      panel, t('editor.palette.section.floor'), this._floorSectionExpanded,
      () => { this._floorSectionExpanded = !this._floorSectionExpanded; panel.replaceWith(this._buildPalettePanel(campaign)); },
      '#888', '#1a1a1a', '#ccc', FLOOR_ITEMS, makeItemBtn,
    );

    // Collapsible Pipes sub-menu
    buildPaletteSubSection(
      panel, t('editor.palette.section.pipes'), this._pipesSectionExpanded,
      () => { this._pipesSectionExpanded = !this._pipesSectionExpanded; panel.replaceWith(this._buildPalettePanel(campaign)); },
      '#4a90d9', '#0a1520', '#4a90d9', PIPES_ITEMS, makeItemBtn,
    );

    return panel;
  }

  private _autoExpandPaletteSectionForSelection(
    floorItems: Array<{ palette: EditorPalette; label: string }>,
    pipesItems: Array<{ palette: EditorPalette; label: string }>,
  ): void {
    if (floorItems.some(i => i.palette === this._palette)) this._floorSectionExpanded = true;
    if (pipesItems.some(i => i.palette === this._palette)) this._pipesSectionExpanded = true;
  }

  private _buildPaletteItemButton(
    panel: HTMLElement,
    campaign: CampaignDef,
    item: { palette: EditorPalette; label: string },
    indent = false,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    const isSelected = this._palette === item.palette;
    btn.style.cssText = this._buildPaletteItemStyle(indent, isSelected);
    btn.addEventListener('click', () => this._onPaletteItemButtonClick(item, campaign, panel));
    return btn;
  }

  private _buildPaletteItemStyle(indent: boolean, isSelected: boolean): string {
    return `padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:${RADIUS_SM};cursor:pointer;` +
      (indent ? 'margin-left:12px;' : '') +
      'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
      'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
      'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';
  }

  private _onPaletteItemButtonClick(
    item: { palette: EditorPalette; label: string },
    campaign: CampaignDef,
    panel: HTMLElement,
  ): void {
    const changed = this._palette !== item.palette;
    this._palette = item.palette;
    this._selectedChapterIdx = null;
    if (changed) sfxManager.play(SfxId.InventorySelect);
    panel.replaceWith(this._buildPalettePanel(campaign));
    document.getElementById('campaign-map-tile-params-panel')
      ?.replaceWith(this._buildTileParamsPanel(campaign));
    document.getElementById('campaign-map-chapter-inventory')
      ?.replaceWith(this._buildChapterInventoryPanel(campaign));
    this._renderCanvas();
  }

  private _buildChapterInventoryPanel(campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'campaign-map-chapter-inventory';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    titleEl.textContent = t('editor.campaignMap.chapters');
    panel.appendChild(titleEl);

    if (campaign.chapters.length === 0) {
      this._appendNoChaptersHint(panel);
      return panel;
    }

    const placedChapters = this._computePlacedChapterIndices();

    for (let ci = 0; ci < campaign.chapters.length; ci++) {
      panel.appendChild(this._buildChapterInventoryButton(panel, campaign, ci, placedChapters));
    }

    return panel;
  }

  private _appendNoChaptersHint(panel: HTMLElement): void {
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.8rem;color:#555;';
    msg.textContent = t('editor.campaignMap.addChaptersHint');
    panel.appendChild(msg);
  }

  private _computePlacedChapterIndices(): Set<number> {
    const placedChapters = new Set<number>();
    for (const row of this._gridState.grid) {
      for (const tile of row) {
        if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'chapter' && tile.chapterIdx !== undefined) {
          placedChapters.add(tile.chapterIdx);
        }
      }
    }
    return placedChapters;
  }

  private _buildChapterInventoryButton(
    panel: HTMLElement,
    campaign: CampaignDef,
    ci: number,
    placedChapters: Set<number>,
  ): HTMLButtonElement {
    const chapter = campaign.chapters[ci];
    const isPlaced = placedChapters.has(ci);
    const isSelected = this._selectedChapterIdx === ci;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `Ch-${ci + 1}: ${resolveLocalizedText(chapter.name)}${isPlaced ? ' ✓' : ''}`;
    btn.title = isPlaced ? t('editor.chapter.alreadyPlaced') : t('editor.campaignMap.selectToPlaceChapter', { index: ci + 1 });
    btn.disabled = isPlaced;
    btn.style.cssText = this._chapterInventoryButtonStyle(isPlaced, isSelected);
    if (!isPlaced) {
      btn.addEventListener('mousedown', () => this._onChapterInventoryButtonClick(ci, campaign, panel));
    }
    return btn;
  }

  private _chapterInventoryButtonStyle(isPlaced: boolean, isSelected: boolean): string {
    const base = `padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:${RADIUS_SM};`;
    if (isPlaced) return base + 'border:1px solid #555;background:#1a1a1a;color:#555;cursor:default;opacity:0.6;';
    if (isSelected) return base + 'border:1px solid #f0c040;background:#2a2a10;color:#f0c040;cursor:pointer;';
    return base + 'border:1px solid #4a90d9;background:#0a1520;color:#7ed321;cursor:pointer;';
  }

  private _onChapterInventoryButtonClick(ci: number, campaign: CampaignDef, panel: HTMLElement): void {
    if (this._selectedChapterIdx === ci) {
      this._selectedChapterIdx = null;
    } else {
      this._selectedChapterIdx = ci;
      // Clear any active palette tool selection so the palette panel
      // reflects "no tile active" while the chapter placement is pending.
      this._palette = CHAPTER_CHAMBER_PALETTE;
      document.getElementById('campaign-map-palette-panel')
        ?.replaceWith(this._buildPalettePanel(campaign));
      sfxManager.play(SfxId.LevelSelect);
    }
    panel.replaceWith(this._buildChapterInventoryPanel(campaign));
    this._renderCanvas();
  }

  private _buildTileParamsPanel(campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'campaign-map-tile-params-panel';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    titleEl.textContent = t('editor.params.title');
    panel.appendChild(titleEl);

    const focusedTile = this._getFocusedTile();

    if (this._isConnectableFocusedTile(focusedTile)) {
      this._appendFocusedTileParams(panel, focusedTile, campaign);
    } else if (this._palette === PipeShape.Source || this._palette === PipeShape.Sink) {
      this._appendPaletteTileParams(panel, campaign);
    } else {
      this._appendNoParamsNote(panel);
    }

    return panel;
  }

  private _getFocusedTile(): TileDef | null {
    const pos = this._gridState.focusedTilePos;
    if (!pos) return null;
    return this._gridState.grid[pos.row]?.[pos.col] ?? null;
  }

  private _isConnectableFocusedTile(tile: TileDef | null): tile is TileDef {
    if (!tile) return false;
    return (tile.shape === PipeShape.Chamber && tile.chamberContent === 'chapter') ||
      tile.shape === PipeShape.Source || tile.shape === PipeShape.Sink;
  }

  private _appendFocusedTileParams(panel: HTMLElement, focusedTile: TileDef, campaign: CampaignDef): void {
    panel.appendChild(this._buildFocusedConnectionsWidget(panel, focusedTile, campaign));
    if (focusedTile.shape === PipeShape.Sink) {
      panel.appendChild(this._buildFocusedSinkCompletionWidget(panel, focusedTile, campaign));
    }
  }

  private _appendPaletteTileParams(panel: HTMLElement, campaign: CampaignDef): void {
    panel.appendChild(this._buildPaletteConnectionsWidget(panel, campaign));
    if (this._palette === PipeShape.Sink) {
      panel.appendChild(this._buildSinkCompletionWidget(panel, campaign));
    }
  }

  private _appendNoParamsNote(panel: HTMLElement): void {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:0.78rem;color:#555;';
    note.textContent = t('editor.params.noneForTile');
    panel.appendChild(note);
  }

  private _buildGridSizePanel(campaign: CampaignDef): HTMLElement {
    return buildGridSizePanel(
      {
        getRows: () => this._gridState.rows,
        getCols: () => this._gridState.cols,
        resize: (r, c) => this._resizeGrid(r, c),
        slide:  (dir)  => this._slideGrid(dir),
        rotate: (cw)   => this._rotateGrid(cw),
        reflect: ()    => this._reflectGrid(),
        flipHorizontal: () => this._flipGridHorizontal(),
        flipVertical:   () => this._flipGridVertical(),
        rebuildPanel: () => {
          document.getElementById('campaign-map-grid-size-panel')
            ?.replaceWith(this._buildGridSizePanel(campaign));
        },
      },
      (l, bg, fg, cb) => this._cbs.buildBtn(l, bg, fg, cb),
      {
        panelId: 'campaign-map-grid-size-panel',
        title: t('editor.map.size'),
        inputWidth: '52px',
        inputRowStyle: 'gap:4px;font-size:0.8rem;',
        minWidth: '210px',
        maxDim: CAMPAIGN_MAP_MAX_DIM,
      },
    );
  }

  // ── Private: canvas construction and rendering ─────────────────────────────

  private _buildCanvas(campaign: CampaignDef, readOnly: boolean): HTMLElement {
    const canvas = document.createElement('canvas');
    const rows = this._gridState.rows;
    const cols = this._gridState.cols;
    const viewRows = Math.min(rows, MAP_VIEW_MAX_ROWS);
    const viewCols = Math.min(cols, MAP_VIEW_MAX_COLS);
    this._viewRows = viewRows;
    this._viewCols = viewCols;
    // Clamp pan to valid bounds for new dimensions.
    this._clampPan();
    setTileSize(computeTileSize(viewRows, viewCols));
    canvas.width  = viewCols * TILE_SIZE;
    canvas.height = viewRows * TILE_SIZE;
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:${RADIUS_SM};` +
      'cursor:' + (readOnly ? 'default' : 'crosshair') + ';display:block;';
    this._canvas = canvas;
    this._updateCanvasDisplaySize();

    if (!readOnly) {
      this._attachInput(canvas, campaign);
    }

    // Acquire the 2D context AFTER _attachInput as defense-in-depth: _detachInput
    // no longer nulls _ctx, but keeping this order makes the code robust to any
    // future reordering that might otherwise reintroduce a blank-canvas regression.
    const ctx = canvas.getContext('2d');
    if (ctx) this._ctx = ctx;
    
    this._renderCanvas();

    if (!readOnly) {
      const { wrapper, errorEl } = buildCanvasWithErrorDiv(canvas);
      this._errorEl = errorEl;

      if (this._canPan()) {
        const container = document.createElement('div');
        container.appendChild(wrapper);
        const panHint = document.createElement('p');
        panHint.style.cssText = 'color:#aaa;font-size:0.9rem;text-align:center;margin:4px 0 0;';
        panHint.textContent = t('editor.map.panHint');
        container.appendChild(panHint);
        return container;
      }

      return wrapper;
    }

    return canvas;
  }

  private _showValidationModal(title: string, icon: string, messages: string[]): void {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:1000;';
    const dialog = document.createElement('div');
    dialog.style.cssText =
      'background:#111827;border:1px solid #4a90d9;border-radius:8px;padding:16px;max-width:560px;width:90%;color:#eee;';
    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:bold;margin-bottom:8px;color:#7ed321;';
    heading.textContent = `${icon} ${title}`;
    const body = document.createElement('pre');
    body.style.cssText = 'white-space:pre-wrap;margin:0 0 12px 0;font-family:inherit;font-size:0.9rem;';
    body.textContent = messages.join('\n');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = t('editor.common.ok');
    close.style.cssText = 'padding:6px 12px;background:#4a90d9;color:#fff;border:none;border-radius:6px;cursor:pointer;';
    close.addEventListener('click', () => overlay.remove());
    dialog.appendChild(heading);
    dialog.appendChild(body);
    dialog.appendChild(close);
    overlay.appendChild(dialog);
    (this._canvas?.ownerDocument.body ?? document.body).appendChild(overlay);
  }

  /** Clamp pan to valid bounds (edge clamping only, no source-connectivity restriction). */
  private _clampPan(): void {
    const rows = this._gridState.rows;
    const cols = this._gridState.cols;
    const viewRows = this._viewRows;
    const viewCols = this._viewCols;
    const maxPanX = Math.max(0, (cols - viewCols) * TILE_SIZE);
    const maxPanY = Math.max(0, (rows - viewRows) * TILE_SIZE);
    this._panPixelX = Math.max(0, Math.min(maxPanX, this._panPixelX));
    this._panPixelY = Math.max(0, Math.min(maxPanY, this._panPixelY));
  }

  private _canPan(): boolean {
    return this._gridState.rows > this._viewRows || this._gridState.cols > this._viewCols;
  }

  /** Start a pan candidate for Shift+left-drag panning.  Caller must verify that Shift is held and the map is oversized before calling. */
  private _beginShiftPanCandidate(e: MouseEvent): void {
    this._leftPanCandidate = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: this._panPixelX,
      startPanY: this._panPixelY,
      moved: false,
    };
  }

  private _advancePanDrag(
    drag: { startClientX: number; startClientY: number; startPanX: number; startPanY: number; moved: boolean },
    e: MouseEvent,
  ): boolean {
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      drag.moved = true;
    }
    if (!drag.moved) return false;
    const scale = this._canvasScale();
    if (scale) {
      this._panPixelX = drag.startPanX - dx * scale.scaleX;
      this._panPixelY = drag.startPanY - dy * scale.scaleY;
    }
    this._clampPan();
    return true;
  }

  private _renderCampaignCanvas(): void {
    const ctx = this._ctx;
    if (!ctx) return;

    const drag = this._computeCanvasDrag();
    const overlay = drag ? null : this._computeHoverOverlay();

    const filledKeys = this._computeFilledCells();

    // Build pseudo-LevelDefs from campaign chapters so that chapter chambers
    // render with the chapter's own map minimap inside the tile.
    const campaign = this._cbs.getActiveCampaign();
    const chapterDefs = buildChapterPreviewLevelDefs(campaign?.chapters);

    // Apply pan transform so the view window scrolls over the full grid.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this._viewCols * TILE_SIZE, this._viewRows * TILE_SIZE);
    ctx.clip();
    ctx.translate(-this._panPixelX, -this._panPixelY);
    const viewBounds = computeViewBounds(
      this._panPixelX,
      this._panPixelY,
      this._viewCols,
      this._viewRows,
      this._gridState.cols,
      this._gridState.rows,
      TILE_SIZE,
    );

    renderEditorCanvas(
      ctx,
      this._gridState.grid,
      this._gridState.rows,
      this._gridState.cols,
      overlay,
      drag,
      null,
      undefined,  // levelDefs: not needed on the campaign map
      undefined,  // levelProgress
      filledKeys,
      campaign?.style,
      chapterDefs,
      viewBounds,
    );

    drawFocusedTileOverlay(ctx, this._gridState.focusedTilePos);

    ctx.restore();
  }

  private _computeCanvasDrag(): DragState | null {
    if (!this._dragState) return null;
    return {
      fromPos: this._dragState.startPos,
      toPos: this._dragState.currentPos,
      tile: this._dragState.tile,
    };
  }

  private _computeHoverOverlay(): HoverOverlay | null {
    const hover = this._hover;
    if (!hover) return null;
    if (this._palette === 'erase') return this._computeEraseHoverOverlay(hover);
    if (this._selectedChapterIdx !== null) return this._computeChapterPlacementHoverOverlay(hover, this._selectedChapterIdx);
    return this._computeTilePlacementHoverOverlay(hover);
  }

  private _computeEraseHoverOverlay(hover: { row: number; col: number }): HoverOverlay {
    const cell = this._gridState.grid[hover.row]?.[hover.col] ?? null;
    return { pos: hover, def: null, alpha: cell === null ? 0.2 : 1 };
  }

  private _isHoverCellEmpty(hover: { row: number; col: number }): boolean {
    const cell = this._gridState.grid[hover.row]?.[hover.col] ?? null;
    return cell === null || isEmptyFloor(cell.shape);
  }

  private _computeChapterPlacementHoverOverlay(hover: { row: number; col: number }, chapterIdx: number): HoverOverlay | null {
    if (!this._isHoverCellEmpty(hover)) return null;
    return {
      pos: hover,
      def: { shape: PipeShape.Chamber, chamberContent: 'chapter', chapterIdx },
      alpha: 0.55,
    };
  }

  private _computeTilePlacementHoverOverlay(hover: { row: number; col: number }): HoverOverlay | null {
    if (!this._isHoverCellEmpty(hover)) return null;
    return { pos: hover, def: this._buildTileDef(), alpha: 0.55 };
  }

  /** RAF callback that keeps animated sea tiles updating while this editor is active. */
  private _seaAnimationTick = (token: number): void => {
    if (this._seaAnimationFrameId === null || token !== this._seaAnimationLoopToken) return;
    if (this._canvas && this._ctx && !this._mapBoxCollapsed) {
      this._renderCampaignCanvas();
    }
    this._seaAnimationFrameId = requestAnimationFrame(() => this._seaAnimationTick(token));
  };

  // ── Private: tile building ─────────────────────────────────────────────────

  private _buildTileDef(): TileDef {
    return buildMapTileDef(this._palette, this._params);
  }

  // ── Private: mouse input ───────────────────────────────────────────────────

  private _attachInput(canvas: HTMLCanvasElement, campaign: CampaignDef): void {
    this._detachInput();
    this._canvas = canvas;

    this._mouseDownHandler = (e: MouseEvent) => this._onMouseDown(e, campaign);
    this._mouseMoveHandler = (e: MouseEvent) => this._onMouseMove(e);
    this._dblClickHandler = (e: MouseEvent) => this._onDblClick(e);
    this._contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      if (this._suppressContextMenu) { this._suppressContextMenu = false; return; }
      this._onRightClick(e, campaign);
    };
    this._mouseLeaveHandler = () => this._onMouseLeave();
    this._wheelHandler = (e: WheelEvent) => this._onWheel(e);

    canvas.addEventListener('mousedown', this._mouseDownHandler);
    canvas.addEventListener('mousemove', this._mouseMoveHandler);
    canvas.addEventListener('dblclick', this._dblClickHandler);
    canvas.addEventListener('contextmenu', this._contextMenuHandler);
    canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
    canvas.addEventListener('wheel', this._wheelHandler, { passive: false });

    if (this._windowMouseUpHandler) window.removeEventListener('mouseup', this._windowMouseUpHandler);
    this._windowMouseUpHandler = (e: MouseEvent) => this._onMouseUp(e, campaign);
    window.addEventListener('mouseup', this._windowMouseUpHandler);
  }

  private _detachInput(): void {
    if (this._canvas) {
      if (this._mouseDownHandler) this._canvas.removeEventListener('mousedown', this._mouseDownHandler);
      if (this._mouseMoveHandler) this._canvas.removeEventListener('mousemove', this._mouseMoveHandler);
      if (this._dblClickHandler) this._canvas.removeEventListener('dblclick', this._dblClickHandler);
      if (this._contextMenuHandler) this._canvas.removeEventListener('contextmenu', this._contextMenuHandler);
      if (this._mouseLeaveHandler) this._canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
      if (this._wheelHandler) this._canvas.removeEventListener('wheel', this._wheelHandler);
    }
    this._mouseDownHandler = null;
    this._mouseMoveHandler = null;
    this._dblClickHandler = null;
    this._contextMenuHandler = null;
    this._mouseLeaveHandler = null;
    this._wheelHandler = null;
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
      this._windowMouseUpHandler = null;
    }
    // Note: _canvas and _ctx are NOT nulled here — _detachInput only removes
    // event listeners. Canvas/ctx teardown is handled by the caller (init) so
    // that _attachInput → _detachInput does not wipe out the canvas reference.
  }

  private _canvasPos(e: MouseEvent): { row: number; col: number } | null {
    if (!this._canvas) return null;
    // Map client coords to canvas intrinsic pixels, then shift by pan offset to
    // obtain the actual grid cell under the pointer.
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const canvasPxX = (e.clientX - rect.left) * scaleX;
    const canvasPxY = (e.clientY - rect.top)  * scaleY;
    const col = Math.floor((canvasPxX + this._panPixelX) / TILE_SIZE);
    const row = Math.floor((canvasPxY + this._panPixelY) / TILE_SIZE);
    // Ensure we clicked within the visible view area.
    const viewCol = Math.floor(canvasPxX / TILE_SIZE);
    const viewRow = Math.floor(canvasPxY / TILE_SIZE);
    if (viewRow < 0 || viewRow >= this._viewRows || viewCol < 0 || viewCol >= this._viewCols) return null;
    if (row < 0 || row >= this._gridState.rows || col < 0 || col >= this._gridState.cols) return null;
    return { row, col };
  }

  /** Return the canvas-intrinsic pixel scale (intrinsic / CSS) in both axes. */
  private _canvasScale(): { scaleX: number; scaleY: number } | null {
    const canvas = this._canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      scaleX: canvas.width  / rect.width,
      scaleY: canvas.height / rect.height,
    };
  }

  private _onMouseDown(e: MouseEvent, campaign: CampaignDef): void {
    if (e.button === 1) { this._startMiddlePanDrag(e); return; }
    if (e.button === 2) { this._handleRightEraseMouseDown(e); return; }
    if (e.button !== 0) return;
    this._handleLeftMouseDown(e, campaign);
  }

  /** Middle-mouse button starts pan drag. */
  private _startMiddlePanDrag(e: MouseEvent): void {
    this._leftPanCandidate = null;
    e.preventDefault();
    this._panDrag = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: this._panPixelX,
      startPanY: this._panPixelY,
      moved: false,
    };
  }

  private _handleRightEraseMouseDown(e: MouseEvent): void {
    this._leftPanCandidate = null;
    this._panDrag = null;
    const pos = this._canvasPos(e);
    if (!pos) return;
    this._rightEraseDragActive = true;
    this._rightEraseChanged = false;
    this._suppressContextMenu = false;
    if ((this._gridState.grid[pos.row]?.[pos.col] ?? null) === null) return;
    this._gridState.grid[pos.row][pos.col] = null;
    this._gridState.clearFocusIfAt(pos);
    this._rightEraseChanged = true;
    sfxManager.play(SfxId.Delete);
    this._renderCanvas();
  }

  private _handleLeftMouseDown(e: MouseEvent, campaign: CampaignDef): void {
    this._leftPanCandidate = null;

    // Shift+left: pan the map (takes priority over all tile-editing operations).
    if (e.shiftKey && this._canPan()) {
      this._beginShiftPanCandidate(e);
      return;
    }

    const pos = this._canvasPos(e);
    if (!pos) return;

    this._gridState.focusedTilePos = pos;
    this._syncPaletteAndParamsPanelsForTile(pos, campaign);

    const existingTile = this._gridState.grid[pos.row]?.[pos.col] ?? null;

    if (this._selectedChapterIdx !== null) {
      this._handleChapterPlacementMouseDown(pos, existingTile, this._selectedChapterIdx, campaign);
      return;
    }

    if (this._palette === CHAPTER_CHAMBER_PALETTE) {
      this._handleChapterChamberDragStart(pos, existingTile);
      return;
    }

    this._handleTilePlacementMouseDown(pos, existingTile, campaign);
  }

  /** Switches the palette to match the clicked tile (unless a tree selection should be preserved), and rebuilds the tile-params panel. */
  private _syncPaletteAndParamsPanelsForTile(pos: { row: number; col: number }, campaign: CampaignDef): void {
    const tileAtPos = this._gridState.grid[pos.row]?.[pos.col] ?? null;
    if (tileAtPos !== null) {
      this._maybeSwitchPaletteForTile(tileAtPos, campaign);
    }
    document.getElementById('campaign-map-tile-params-panel')
      ?.replaceWith(this._buildTileParamsPanel(campaign));
  }

  private _maybeSwitchPaletteForTile(tileAtPos: TileDef, campaign: CampaignDef): void {
    const preserveTreePaletteSelection =
      isTreeShape(this._palette as PipeShape) && isTreeShape(tileAtPos.shape);
    const paletteForTile: EditorPalette | null =
      tileAtPos.shape === PipeShape.Chamber && tileAtPos.chamberContent === 'chapter'
        ? CHAPTER_CHAMBER_PALETTE
        : tileAtPos.shape === PipeShape.Chamber
          ? null  // Non-chapter chamber (e.g. stray 'level' content): don't corrupt the palette
          : tileAtPos.shape;
    if (paletteForTile === null || preserveTreePaletteSelection) return;
    this._palette = paletteForTile;
    document.getElementById('campaign-map-palette-panel')
      ?.replaceWith(this._buildPalettePanel(campaign));
  }

  private _handleChapterPlacementMouseDown(
    pos: { row: number; col: number },
    existingTile: TileDef | null,
    chapterIdx: number,
    campaign: CampaignDef,
  ): void {
    // Place onto empty cells AND empty-floor tiles, matching the placement
    // ghost (see _computeOverlay: isEmpty = null || isEmptyFloor).  Gating on
    // `=== null` alone left empty-floor clicks as a silent no-op despite the
    // ghost inviting placement there.
    if (existingTile === null || isEmptyFloor(existingTile.shape)) {
      this._placeChapterChamber(pos, chapterIdx, campaign);
      return;
    }
    if (existingTile.shape === PipeShape.Chamber && existingTile.chamberContent === 'chapter') {
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._renderCanvas();
    }
  }

  private _placeChapterChamber(pos: { row: number; col: number }, chapterIdx: number, campaign: CampaignDef): void {
    this._gridState.grid[pos.row][pos.col] = {
      shape: PipeShape.Chamber,
      chamberContent: 'chapter',
      chapterIdx,
      connections: [Direction.East, Direction.West],
    };
    this._selectedChapterIdx = null;
    this._palette = CHAPTER_CHAMBER_PALETTE;
    document.getElementById('campaign-map-palette-panel')
      ?.replaceWith(this._buildPalettePanel(campaign));
    document.getElementById('campaign-map-tile-params-panel')
      ?.replaceWith(this._buildTileParamsPanel(campaign));
    this._recordSnapshot();
    this._saveGrid();
    document.getElementById('campaign-map-chapter-inventory')
      ?.replaceWith(this._buildChapterInventoryPanel(campaign));
    this._renderCanvas();
  }

  private _handleChapterChamberDragStart(pos: { row: number; col: number }, existingTile: TileDef | null): void {
    if (existingTile === null) return;
    this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
    this._renderCanvas();
  }

  private _isEmptyFloorTile(existingTile: TileDef | null): boolean {
    return existingTile === null || isEmptyFloor(existingTile.shape);
  }

  private _isEmptyFloorPalette(palette: EditorPalette): boolean {
    return palette !== 'erase' && EMPTY_FLOOR_SHAPES.includes(palette as PipeShape);
  }

  private _canOverwriteTreeAt(existingTile: TileDef | null, palette: EditorPalette): boolean {
    return existingTile !== null &&
      REPEATABLE_EDITOR_TILES.has(palette) &&
      isTreeShape(palette as PipeShape) &&
      isTreeShape(existingTile.shape);
  }

  private _shouldStartTileDragForExistingTile(
    existingIsEmptyFloor: boolean,
    palette: EditorPalette,
    canOverwriteTree: boolean,
  ): boolean {
    return !existingIsEmptyFloor && palette !== 'erase' &&
      !this._isEmptyFloorPalette(palette) && !canOverwriteTree;
  }

  private _handleTilePlacementMouseDown(pos: { row: number; col: number }, existingTile: TileDef | null, campaign: CampaignDef): void {
    const palette = this._palette;
    const existingIsEmptyFloor = this._isEmptyFloorTile(existingTile);
    const canOverwriteTree = this._canOverwriteTreeAt(existingTile, palette);

    if (existingTile !== null && this._shouldStartTileDragForExistingTile(existingIsEmptyFloor, palette, canOverwriteTree)) {
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._renderCanvas();
      return;
    }

    this._placeOrEraseTile(pos, existingTile, existingIsEmptyFloor, canOverwriteTree, palette, campaign);
  }

  private _placeOrEraseTile(
    pos: { row: number; col: number },
    existingTile: TileDef | null,
    existingIsEmptyFloor: boolean,
    canOverwriteTree: boolean,
    palette: EditorPalette,
    campaign: CampaignDef,
  ): void {
    if (palette === PipeShape.Source && hasShapeElsewhere(this._gridState.grid, this._gridState.rows, this._gridState.cols, PipeShape.Source)) {
      return;
    }
    if (palette === PipeShape.Sink && hasShapeElsewhere(this._gridState.grid, this._gridState.rows, this._gridState.cols, PipeShape.Sink)) {
      this._showSinkError();
      return;
    }
    if ((existingIsEmptyFloor || canOverwriteTree) && REPEATABLE_EDITOR_TILES.has(palette)) {
      this._paintDragActive = true;
      this._gridState.grid[pos.row][pos.col] = this._buildTileDef();
      this._playPlacementSfx(pos);
      this._renderCanvas();
      return;
    }
    this._eraseOrPlaceTile(pos, existingTile, palette, campaign);
    this._recordSnapshot();
    this._saveGrid();
    this._renderCanvas();
  }

  private _eraseOrPlaceTile(pos: { row: number; col: number }, existingTile: TileDef | null, palette: EditorPalette, campaign: CampaignDef): void {
    if (palette === 'erase' || palette === PipeShape.Empty) {
      if (existingTile !== null) sfxManager.play(SfxId.Delete);
      this._gridState.grid[pos.row][pos.col] = null;
      this._gridState.clearFocusIfAt(pos);
      document.getElementById('campaign-map-chapter-inventory')
        ?.replaceWith(this._buildChapterInventoryPanel(campaign));
    } else {
      this._gridState.grid[pos.row][pos.col] = this._buildTileDef();
      this._playPlacementSfx(pos);
    }
  }

  private _onMouseUp(e: MouseEvent, campaign: CampaignDef): void {
    // Release pan drag on any button up.
    if (this._panDrag) {
      this._panDrag = null;
      return;
    }
    if (e.button === 0 && this._releaseLeftPanCandidate()) return;
    if (e.button === 2) { this._handleRightEraseMouseUp(campaign); return; }
    if (e.button !== 0) return;
    if (this._paintDragActive) { this._finishPaintDrag(); return; }
    this._finishTileDrag(e, campaign);
  }

  /** Releases the shift+left pan candidate. Returns whether it had already started panning. */
  private _releaseLeftPanCandidate(): boolean {
    const leftPanMoved = this._leftPanCandidate?.moved === true;
    this._leftPanCandidate = null;
    return leftPanMoved;
  }

  private _handleRightEraseMouseUp(campaign: CampaignDef): void {
    if (!this._rightEraseDragActive) return;
    this._rightEraseDragActive = false;
    this._suppressContextMenu = true;
    if (this._rightEraseChanged) {
      document.getElementById('campaign-map-chapter-inventory')
        ?.replaceWith(this._buildChapterInventoryPanel(campaign));
      this._recordSnapshot();
      this._saveGrid();
    }
    this._rightEraseChanged = false;
    this._renderCanvas();
  }

  private _finishPaintDrag(): void {
    this._paintDragActive = false;
    this._recordSnapshot();
    this._saveGrid();
    this._renderCanvas();
  }

  private _finishTileDrag(e: MouseEvent, campaign: CampaignDef): void {
    if (!this._dragState) return;
    const { startPos, tile, currentPos, moved } = this._dragState;
    this._dragState = null;

    if (moved) {
      this._commitTileDragMove(startPos, currentPos, tile, campaign);
    } else if (PIPE_SHAPES.has(tile.shape)) {
      this._rotateTileAt(startPos, !e.shiftKey);
      return;
    }
    this._renderCanvas();
  }

  private _commitTileDragMove(
    startPos: { row: number; col: number },
    currentPos: { row: number; col: number },
    tile: TileDef,
    campaign: CampaignDef,
  ): void {
    this._gridState.grid[startPos.row][startPos.col] = null;
    this._gridState.grid[currentPos.row][currentPos.col] = tile;
    this._gridState.focusedTilePos = currentPos;
    document.getElementById('campaign-map-tile-params-panel')
      ?.replaceWith(this._buildTileParamsPanel(campaign));
    this._recordSnapshot();
    this._saveGrid();
  }

  private _onMouseMove(e: MouseEvent): void {
    if (this._advanceActivePanDrags(e)) return;

    const pos = this._canvasPos(e);
    this._hover = pos;
    this._updateHoverTooltip(pos);
    this._advanceActiveEditGesture(pos);
    this._renderCanvas();
  }

  /** Advances a middle-mouse pan drag or a shift+left-drag pan candidate. Returns whether the move was fully handled. */
  private _advanceActivePanDrags(e: MouseEvent): boolean {
    if (this._panDrag && this._advancePanDrag(this._panDrag, e)) {
      this._renderCanvas();
      return true;
    }
    // Shift+left-drag pan: the candidate may have been started without a dragState
    // (e.g. on an empty cell), so allow pan to begin as soon as the pointer moves
    // far enough, regardless of whether _dragState is set.
    if (this._leftPanCandidate && this._advancePanDrag(this._leftPanCandidate, e)) {
      this._dragState = null;
      this._hover = null;
      this._renderCanvas();
      return true;
    }
    return false;
  }

  private _updateHoverTooltip(pos: { row: number; col: number } | null): void {
    if (!this._canvas) return;
    const tile = pos ? (this._gridState.grid[pos.row]?.[pos.col] ?? null) : null;
    if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'chapter' && tile.chapterIdx !== undefined) {
      this._canvas.title = this._formatChapterTileTitle(tile.chapterIdx);
    } else {
      this._canvas.title = '';
    }
  }

  private _formatChapterTileTitle(chapterIdx: number): string {
    const camp = this._cbs.getActiveCampaign();
    const chapter = camp?.chapters[chapterIdx];
    return chapter
      ? `Ch-${chapterIdx + 1}: ${resolveLocalizedText(chapter.name)}`
      : `Chapter ${chapterIdx + 1}`;
  }

  private _advanceActiveEditGesture(pos: { row: number; col: number } | null): void {
    if (!pos) return;
    if (this._paintDragActive) { this._advancePaintDrag(pos); return; }
    if (this._rightEraseDragActive) { this._advanceEraseDrag(pos); return; }
    if (this._dragState) this._advanceTileDrag(pos, this._dragState);
  }

  private _advancePaintDrag(pos: { row: number; col: number }): void {
    const cur = this._gridState.grid[pos.row]?.[pos.col] ?? null;
    const canOverwriteTree = cur !== null &&
      REPEATABLE_EDITOR_TILES.has(this._palette) &&
      isTreeShape(this._palette as PipeShape) &&
      isTreeShape(cur.shape);
    if (cur === null || isEmptyFloor(cur.shape) || canOverwriteTree) {
      this._gridState.grid[pos.row][pos.col] = this._buildTileDef();
    }
  }

  private _advanceEraseDrag(pos: { row: number; col: number }): void {
    if ((this._gridState.grid[pos.row]?.[pos.col] ?? null) === null) return;
    this._gridState.grid[pos.row][pos.col] = null;
    this._gridState.clearFocusIfAt(pos);
    this._rightEraseChanged = true;
  }

  private _advanceTileDrag(pos: { row: number; col: number }, dragState: CampaignDragState): void {
    const { startPos, currentPos } = dragState;
    if (pos.row === currentPos.row && pos.col === currentPos.col) return;
    if (pos.row === startPos.row && pos.col === startPos.col) {
      dragState.currentPos = pos;
      dragState.moved = false;
      return;
    }
    const targetTile = this._gridState.grid[pos.row]?.[pos.col] ?? null;
    if (targetTile === null || isEmptyFloor(targetTile.shape)) {
      dragState.currentPos = pos;
      dragState.moved = true;
    }
  }

  private _onRightClick(e: MouseEvent, campaign: CampaignDef): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    if ((this._gridState.grid[pos.row]?.[pos.col] ?? null) === null) return;
    sfxManager.play(SfxId.Delete);
    this._gridState.grid[pos.row][pos.col] = null;
    this._gridState.clearFocusIfAt(pos);
    document.getElementById('campaign-map-chapter-inventory')
      ?.replaceWith(this._buildChapterInventoryPanel(campaign));
    this._recordSnapshot();
    this._saveGrid();
    this._renderCanvas();
  }

  private _onDblClick(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    const tile = this._gridState.grid[pos.row]?.[pos.col] ?? null;
    if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'chapter' || tile.chapterIdx === undefined) return;
    sfxManager.play(SfxId.LevelSelect);
    const readOnly = this._cbs.getActiveCampaign()?.official === true;
    this._cbs.openChapterEditor(tile.chapterIdx, readOnly);
  }

  private _onMouseLeave(): void {
    this._hover = null;
    this._panDrag = null;
    this._leftPanCandidate = null;
    if (this._dragState) this._dragState = null;
    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._recordSnapshot();
      this._saveGrid();
    }
    if (this._rightEraseDragActive) {
      this._rightEraseDragActive = false;
      if (this._rightEraseChanged) {
        this._recordSnapshot();
        this._saveGrid();
      }
      this._rightEraseChanged = false;
    }
    this._renderCanvas();
  }

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    const pos = this._canvasPos(e);
    if (!pos) return;
    const tile = this._gridState.grid[pos.row]?.[pos.col] ?? null;
    if (tile && PIPE_SHAPES.has(tile.shape)) {
      this._rotateTileAt(pos, e.deltaY > 0);
    } else if (tile && this._isSourceSinkOrChapterChamber(tile)) {
      this._rotateSourceSinkAt(pos, e.deltaY > 0);
    } else if (PIPE_SHAPES.has(this._palette as PipeShape)) {
      this._rotatePendingPaletteByWheel(e.deltaY);
    }
  }

  private _isSourceSinkOrChapterChamber(tile: TileDef): boolean {
    return tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === 'chapter');
  }

  private _rotatePendingPaletteByWheel(deltaY: number): void {
    this._rotatePalette(deltaY > 0);
    sfxManager.play(deltaY > 0 ? SfxId.PendingCW : SfxId.PendingCCW);
  }

  private _playPlacementSfx(pos: { row: number; col: number }): void {
    if (isPipePlacementPalette(this._palette)) {
      const isConnected = isTileConnectedToSource(this._gridState.grid, pos);
      sfxManager.play(isConnected ? SfxId.PipeConnected : SfxId.PipePlacement);
    }
  }

  // ── Private: tile params panel widgets ────────────────────────────────────

  private _buildPaletteConnectionsWidget(replaceTarget: HTMLElement, campaign: CampaignDef): HTMLElement {
    const dirToKey: Record<Direction, keyof TileParams['connections']> = {
      [Direction.North]: 'N', [Direction.East]: 'E',
      [Direction.South]: 'S', [Direction.West]: 'W',
    };
    return buildCompassConnectionsWidget(
      (dir) => this._params.connections[dirToKey[dir]],
      (dir) => {
        const conns = this._params.connections;
        conns[dirToKey[dir]] = !conns[dirToKey[dir]];
        replaceTarget.replaceWith(this._buildTileParamsPanel(campaign));
        this._renderCanvas();
      },
    );
  }

  private _buildFocusedConnectionsWidget(replaceTarget: HTMLElement, tile: TileDef, campaign: CampaignDef): HTMLElement {
    const allDirs = [Direction.North, Direction.East, Direction.South, Direction.West];
    return buildCompassConnectionsWidget(
      (dir) => new Set(tile.connections ?? allDirs).has(dir),
      (dir) => {
        const conns = new Set(tile.connections ?? allDirs);
        if (conns.has(dir)) conns.delete(dir); else conns.add(dir);
        tile.connections = [...conns];
        this._recordSnapshot();
        this._saveGrid();
        replaceTarget.replaceWith(this._buildTileParamsPanel(campaign));
        this._renderCanvas();
      },
    );
  }

  private _buildSinkCompletionWidget(replaceTarget: HTMLElement, campaign: CampaignDef): HTMLElement {
    return buildCompletionInputWidget(
      () => this._params.completion,
      (val) => {
        this._params.completion = val;
        replaceTarget.replaceWith(this._buildTileParamsPanel(campaign));
        this._renderCanvas();
      },
    );
  }

  private _buildFocusedSinkCompletionWidget(replaceTarget: HTMLElement, tile: TileDef, campaign: CampaignDef): HTMLElement {
    return buildCompletionInputWidget(
      () => tile.completion ?? 0,
      (val) => {
        tile.completion = val > 0 ? val : undefined;
        this._recordSnapshot();
        this._saveGrid();
        replaceTarget.replaceWith(this._buildTileParamsPanel(campaign));
        this._renderCanvas();
      },
    );
  }
}
