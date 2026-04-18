/**
 * CampaignMapEditorSection – encapsulates all campaign map editor state and UI
 * for editing the campaign-level map grid (where chapters are placed as chambers).
 *
 * Mirrors ChapterMapEditorSection but operates on CampaignDef rather than ChapterDef:
 *   • Entity tiles use chamberContent:'chapter' + chapterIdx (not 'level' + levelIdx).
 *   • Inventory shows campaign chapters (not chapter levels).
 *   • Grid state is persisted to campaign.grid/rows/cols/style.
 *   • Validation uses validateCampaignMap().
 */

import { CampaignDef, TileDef, PipeShape, Direction, Rotation, LevelStyle, LevelDef } from '../types';
import { PIPE_SHAPES, isEmptyFloor, EMPTY_FLOOR_SHAPES } from '../board';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';
import { renderEditorCanvas, HoverOverlay, DragState } from './renderer';
import {
  EditorPalette,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
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
  rotateGridBy90,
  rotatePositionBy90,
  reflectGridAboutDiagonal,
  reflectPositionAboutDiagonal,
  flipGridHorizontal,
  flipGridVertical,
  flipPositionHorizontal,
  flipPositionVertical,
  buildMapTileDef,
  rotateConnectionsBy90,
  computeEditorFilledCells,
} from './types';
import { validateCampaignMap } from './campaignMapValidator';
import { sfxManager, SfxId } from '../sfxManager';
import { resizeGrid, slideGrid, hasShapeElsewhere } from './gridUtils';
import { HistoryManager } from './historyManager';
import { buildStyleSectionPanel } from './tileParamsPanel';
import { buildCompassConnectionsWidget } from './connectionsWidget';
import { buildGridSizePanel } from './gridSizePanel';
import { EDITOR_INPUT_BG, MUTED_BTN_BG, RADIUS_SM, UI_BG } from '../uiConstants';
import { showTimedMessage, updateUndoRedoButtonPair } from '../uiHelpers';
import { canvasPos as computeCanvasPos, updateMapEditorCanvas } from './canvasUtils';
import { isTileConnectedToSource } from '../tile';
import { buildCompletionInputWidget } from './chapterEditorUI';

/** The palette entry that places a chapter-chamber tile on the campaign map. */
const CHAPTER_CHAMBER_PALETTE: EditorPalette = 'chamber:chapter';

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

export class CampaignMapEditorSection {
  private readonly _cbs: CampaignMapEditorCallbacks;

  // ── Grid state ────────────────────────────────────────────────────────────
  private _editRows = 3;
  private _editCols = 6;
  private _editGrid: (TileDef | null)[][] = [];

  // ── Palette / selection state ─────────────────────────────────────────────
  private _palette: EditorPalette = PipeShape.Source;
  private _params: TileParams = { ...DEFAULT_PARAMS };
  private _selectedChapterIdx: number | null = null;
  private _focusedTilePos: { row: number; col: number } | null = null;

  // ── Canvas / render state ─────────────────────────────────────────────────
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _mainLayout: HTMLDivElement = document.createElement('div');
  private _errorEl: HTMLDivElement | null = null;

  // ── Undo/redo ─────────────────────────────────────────────────────────────
  private readonly _hist = new HistoryManager<EditorSnapshot>();

  // ── Style panel state ─────────────────────────────────────────────────────
  private _styleSectionExpanded = false;

  // ── Mouse gesture state ───────────────────────────────────────────────────
  private _hover: { row: number; col: number } | null = null;
  private _dragState: CampaignDragState | null = null;
  private _paintDragActive = false;
  private _rightEraseDragActive = false;
  private _suppressContextMenu = false;
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;

  /** Default campaign grid dimensions (same as chapter map defaults). */
  private static readonly DEFAULT_ROWS = 3;
  private static readonly DEFAULT_COLS = 6;

  constructor(callbacks: CampaignMapEditorCallbacks) {
    this._cbs = callbacks;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Initialize grid state from the given campaign (or create defaults). */
  init(campaign: CampaignDef): void {
    this._detachInput();
    this._initGridState(campaign);
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

  /**
   * Handle a keydown event for the campaign map editor.
   * Called from the campaign editor's global keyboard handler when on the Campaign screen.
   */
  handleCampaignEditorKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.altKey || isInputFocused) return;
    const key = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (key === 'z') {
        e.preventDefault();
        const c = this._cbs.getActiveCampaign();
        if (c) this._undo(c);
      }
      if (key === 'y') {
        e.preventDefault();
        const c = this._cbs.getActiveCampaign();
        if (c) this._redo(c);
      }
      return;
    }
    if (key === 'q' || key === 'w') {
      e.preventDefault();
      const clockwise = key === 'w';
      if (this._hover) {
        const tile = this._editGrid[this._hover.row]?.[this._hover.col] ?? null;
        if (tile) {
          const campaign = this._cbs.getActiveCampaign();
          if (campaign) {
            if (PIPE_SHAPES.has(tile.shape)) {
              this._rotateTileAt(this._hover, clockwise, campaign);
              return;
            } else if (
              tile.shape === PipeShape.Source ||
              tile.shape === PipeShape.Sink ||
              (tile.shape === PipeShape.Chamber && tile.chamberContent === 'chapter')
            ) {
              this._rotateSourceSinkAt(this._hover, clockwise, campaign);
              return;
            }
          }
        }
      }
      this._rotatePalette(clockwise);
    }
  }

  // ── Private: initialization ────────────────────────────────────────────────

  private _initGridState(campaign: CampaignDef): void {
    if (campaign.grid && campaign.rows && campaign.cols) {
      this._editRows = campaign.rows;
      this._editCols = campaign.cols;
      this._editGrid = structuredClone(campaign.grid);
    } else {
      const rows = CampaignMapEditorSection.DEFAULT_ROWS;
      const cols = CampaignMapEditorSection.DEFAULT_COLS;
      const grid: (TileDef | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null) as null[]);
      grid[1][0] = { shape: PipeShape.Source, connections: [Direction.East] };
      grid[1][cols - 1] = { shape: PipeShape.Sink, connections: [Direction.West] };
      this._editRows = rows;
      this._editCols = cols;
      this._editGrid = grid;
    }
    this._hist.clear();
    this._selectedChapterIdx = null;
    this._focusedTilePos = null;
    this._recordSnapshot(campaign, false);
  }

  private _saveGridState(campaign: CampaignDef): void {
    campaign.rows = this._editRows;
    campaign.cols = this._editCols;
    campaign.grid = structuredClone(this._editGrid);
    this._cbs.touchCampaign(campaign);
    this._cbs.saveCampaigns();
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
    title.textContent = '🗺️ Campaign Map';
    title.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    header.appendChild(title);
    section.appendChild(header);

    if (isOfficial) {
      const msg = document.createElement('p');
      msg.style.cssText = 'color:#888;font-size:0.85rem;';
      msg.textContent = 'Campaign map is read-only for official campaigns.';
      section.appendChild(msg);
      section.appendChild(this._buildCanvas(campaign, true));
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

    const undoBtn = this._cbs.buildBtn('↩ Undo', MUTED_BTN_BG, '#aaa', () => {
      const c = this._cbs.getActiveCampaign(); if (c) this._undo(c);
    }, true);
    undoBtn.id = 'campaign-map-undo-btn';
    toolbar.appendChild(undoBtn);

    const redoBtn = this._cbs.buildBtn('↪ Redo', MUTED_BTN_BG, '#aaa', () => {
      const c = this._cbs.getActiveCampaign(); if (c) this._redo(c);
    }, true);
    redoBtn.id = 'campaign-map-redo-btn';
    toolbar.appendChild(redoBtn);

    toolbar.appendChild(this._cbs.buildBtn('✔ Validate', UI_BG, '#7ed321', () => {
      const c = this._cbs.getActiveCampaign();
      if (!c) return;
      const result = validateCampaignMap(this._editGrid, this._editRows, this._editCols, c);
      const icon = result.ok ? '✅' : '❌';
      alert(`${icon} Campaign Map Validation\n\n${result.messages.join('\n')}`);
    }));
    midCol.appendChild(toolbar);
    midCol.appendChild(this._buildCanvas(campaign, false));
    layout.appendChild(midCol);

    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:210px;';
    rightCol.appendChild(this._buildChapterInventoryPanel(campaign));
    rightCol.appendChild(this._buildGridSizePanel(campaign));
    layout.appendChild(rightCol);

    section.appendChild(layout);
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
          this._recordSnapshot(campaign);
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
    titleEl.textContent = 'TILE PALETTE';
    panel.appendChild(titleEl);

    const CAMPAIGN_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
      { palette: PipeShape.Empty,       label: '🟩 Empty - Grass' },
      { palette: PipeShape.EmptyDirt,   label: '🟫 Empty - Dirt' },
      { palette: PipeShape.EmptyDark,   label: '⬛ Empty - Dark' },
      { palette: PipeShape.EmptyWinter, label: '⬜ Empty - Winter' },
      { palette: PipeShape.Source,      label: '💧 Source' },
      { palette: PipeShape.Sink,        label: '🏁 Sink' },
      { palette: CHAPTER_CHAMBER_PALETTE, label: '📂 Chapter' },
      { palette: PipeShape.Tree,        label: '🌳 Tree' },
      { palette: PipeShape.Sea,         label: '🌊 Sea' },
      { palette: PipeShape.Granite,     label: '🪨 Granite' },
      { palette: PipeShape.Straight,    label: '━ Straight' },
      { palette: PipeShape.Elbow,       label: '┗ Elbow' },
      { palette: PipeShape.Tee,         label: '┣ Tee' },
      { palette: PipeShape.Cross,       label: '╋ Cross' },
    ];

    for (const item of CAMPAIGN_PALETTE_ITEMS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      const isSelected = this._palette === item.palette;
      btn.style.cssText =
        `padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:${RADIUS_SM};cursor:pointer;` +
        'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
        'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
        'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';
      btn.addEventListener('click', () => {
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
      });
      panel.appendChild(btn);
    }

    return panel;
  }

  private _buildChapterInventoryPanel(campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'campaign-map-chapter-inventory';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    titleEl.textContent = 'CHAPTERS';
    panel.appendChild(titleEl);

    if (campaign.chapters.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:0.8rem;color:#555;';
      msg.textContent = 'Add chapters to place them on the map.';
      panel.appendChild(msg);
      return panel;
    }

    const placedChapters = new Set<number>();
    for (const row of this._editGrid) {
      for (const tile of row) {
        if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'chapter' && tile.chapterIdx !== undefined) {
          placedChapters.add(tile.chapterIdx);
        }
      }
    }

    for (let ci = 0; ci < campaign.chapters.length; ci++) {
      const chapter = campaign.chapters[ci];
      const isPlaced = placedChapters.has(ci);
      const isSelected = this._selectedChapterIdx === ci;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `Ch-${ci + 1}: ${chapter.name}${isPlaced ? ' ✓' : ''}`;
      btn.title = isPlaced ? 'Already placed on the map' : `Select to place Ch-${ci + 1}`;
      btn.disabled = isPlaced;
      btn.style.cssText =
        `padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:${RADIUS_SM};` +
        (isPlaced
          ? 'border:1px solid #555;background:#1a1a1a;color:#555;cursor:default;opacity:0.6;'
          : isSelected
            ? 'border:1px solid #f0c040;background:#2a2a10;color:#f0c040;cursor:pointer;'
            : 'border:1px solid #4a90d9;background:#0a1520;color:#7ed321;cursor:pointer;');
      if (!isPlaced) {
        btn.addEventListener('mousedown', () => {
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
        });
      }
      panel.appendChild(btn);
    }

    return panel;
  }

  private _buildTileParamsPanel(campaign: CampaignDef): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'campaign-map-tile-params-panel';
    panel.style.cssText = EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    titleEl.textContent = 'TILE PARAMS';
    panel.appendChild(titleEl);

    const focusedTile = this._focusedTilePos
      ? this._editGrid[this._focusedTilePos.row]?.[this._focusedTilePos.col] ?? null
      : null;
    const isFocusedChapterChamber =
      focusedTile?.shape === PipeShape.Chamber && focusedTile.chamberContent === 'chapter';
    const isFocusedSourceOrSink =
      focusedTile?.shape === PipeShape.Source || focusedTile?.shape === PipeShape.Sink;

    if ((isFocusedChapterChamber || isFocusedSourceOrSink) && focusedTile) {
      panel.appendChild(this._buildFocusedConnectionsWidget(panel, focusedTile, campaign));
      if (focusedTile.shape === PipeShape.Sink) {
        panel.appendChild(this._buildFocusedSinkCompletionWidget(panel, focusedTile, campaign));
      }
    } else if (this._palette === PipeShape.Source || this._palette === PipeShape.Sink) {
      panel.appendChild(this._buildPaletteConnectionsWidget(panel, campaign));
      if (this._palette === PipeShape.Sink) {
        panel.appendChild(this._buildSinkCompletionWidget(panel, campaign));
      }
    } else {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:0.78rem;color:#555;';
      note.textContent = 'No params for this tile.';
      panel.appendChild(note);
    }

    return panel;
  }

  private _buildGridSizePanel(campaign: CampaignDef): HTMLElement {
    return buildGridSizePanel(
      {
        getRows: () => this._editRows,
        getCols: () => this._editCols,
        resize: (r, c) => this._resizeGrid(r, c, campaign),
        slide:  (dir)  => this._slideGrid(dir, campaign),
        rotate: (cw)   => this._rotateGrid(cw, campaign),
        reflect: ()    => this._reflectGrid(campaign),
        flipHorizontal: () => this._flipGridHorizontal(campaign),
        flipVertical:   () => this._flipGridVertical(campaign),
        rebuildPanel: () => {
          document.getElementById('campaign-map-grid-size-panel')
            ?.replaceWith(this._buildGridSizePanel(campaign));
        },
      },
      (l, bg, fg, cb) => this._cbs.buildBtn(l, bg, fg, cb),
      {
        panelId: 'campaign-map-grid-size-panel',
        title: 'MAP SIZE',
        inputWidth: '52px',
        inputRowStyle: 'gap:4px;font-size:0.8rem;',
        minWidth: '210px',
      },
    );
  }

  // ── Private: canvas construction and rendering ─────────────────────────────

  private _buildCanvas(campaign: CampaignDef, readOnly: boolean): HTMLElement {
    const canvas = document.createElement('canvas');
    setTileSize(computeTileSize(this._editRows, this._editCols));
    canvas.width  = this._editCols * TILE_SIZE;
    canvas.height = this._editRows * TILE_SIZE;
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:${RADIUS_SM};` +
      'cursor:' + (readOnly ? 'default' : 'crosshair') + ';display:block;';
    this._canvas = canvas;
    this._updateCanvasDisplaySize();
    const ctx = canvas.getContext('2d');
    if (ctx) this._ctx = ctx;

    if (!readOnly) {
      this._attachInput(canvas, campaign);
    }

    this._renderCanvas();

    if (!readOnly) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
      wrap.appendChild(canvas);
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'font-size:0.85rem;color:#f44;display:none;font-weight:bold;';
      this._errorEl = errorDiv;
      wrap.appendChild(errorDiv);
      return wrap;
    }

    return canvas;
  }

  private _updateCanvasDisplaySize(): void {
    if (!this._canvas) return;
    updateMapEditorCanvas(this._canvas, this._editRows, this._editCols, this._mainLayout);
  }

  private _renderCanvas(): void {
    const ctx = this._ctx;
    if (!ctx) return;

    let overlay: HoverOverlay | null = null;
    let drag: DragState | null = null;

    if (this._dragState) {
      drag = {
        fromPos: this._dragState.startPos,
        toPos: this._dragState.currentPos,
        tile: this._dragState.tile,
      };
    }

    if (!drag && this._hover) {
      const hover = this._hover;
      if (this._palette === 'erase') {
        const cell = this._editGrid[hover.row]?.[hover.col] ?? null;
        overlay = { pos: hover, def: null, alpha: cell === null ? 0.2 : 1 };
      } else if (this._selectedChapterIdx !== null) {
        const cell = this._editGrid[hover.row]?.[hover.col] ?? null;
        const isEmpty = cell === null || (cell !== null && isEmptyFloor(cell.shape));
        if (isEmpty) {
          overlay = {
            pos: hover,
            def: { shape: PipeShape.Chamber, chamberContent: 'chapter', chapterIdx: this._selectedChapterIdx },
            alpha: 0.55,
          };
        }
      } else {
        const cell = this._editGrid[hover.row]?.[hover.col] ?? null;
        const isEmpty = cell === null || (cell !== null && isEmptyFloor(cell.shape));
        if (isEmpty) {
          overlay = { pos: hover, def: this._buildTileDef(), alpha: 0.55 };
        }
      }
    }

    const filledKeys = this._computeFilledCells();

    // Build pseudo-LevelDefs from campaign chapters so that chapter chambers
    // render with the chapter's own map minimap inside the tile.
    const campaign = this._cbs.getActiveCampaign();
    const chapterDefs: LevelDef[] = (campaign?.chapters ?? []).map(ch => ({
      id: ch.id,
      name: ch.name,
      rows: ch.rows ?? 0,
      cols: ch.cols ?? 0,
      grid: ch.grid ?? [],
      inventory: [],
    }));

    renderEditorCanvas(
      ctx,
      this._editGrid,
      this._editRows,
      this._editCols,
      overlay,
      drag,
      null,
      undefined,  // levelDefs: not needed on the campaign map
      undefined,  // levelProgress
      filledKeys,
      campaign?.style,
      chapterDefs,
    );

    if (this._focusedTilePos && this._ctx) {
      const { row, col } = this._focusedTilePos;
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      this._ctx.save();
      this._ctx.strokeStyle = '#f0c040';
      this._ctx.lineWidth = 3;
      this._ctx.setLineDash([5, 3]);
      this._ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      this._ctx.setLineDash([]);
      this._ctx.restore();
    }
  }

  // ── Private: tile building ─────────────────────────────────────────────────

  private _buildTileDef(): TileDef {
    return buildMapTileDef(this._palette, this._params);
  }

  // ── Private: mouse input ───────────────────────────────────────────────────

  private _attachInput(canvas: HTMLCanvasElement, campaign: CampaignDef): void {
    canvas.addEventListener('mousedown',   (e) => this._onMouseDown(e, campaign));
    canvas.addEventListener('mousemove',   (e) => this._onMouseMove(e, campaign));
    canvas.addEventListener('dblclick',    (e) => this._onDblClick(e));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this._suppressContextMenu) { this._suppressContextMenu = false; return; }
      this._onRightClick(e, campaign);
    });
    canvas.addEventListener('mouseleave',  () => this._onMouseLeave(campaign));
    canvas.addEventListener('wheel',       (e) => this._onWheel(e, campaign), { passive: false });

    if (this._windowMouseUpHandler) window.removeEventListener('mouseup', this._windowMouseUpHandler);
    this._windowMouseUpHandler = (e: MouseEvent) => this._onMouseUp(e, campaign);
    window.addEventListener('mouseup', this._windowMouseUpHandler);
  }

  private _detachInput(): void {
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
      this._windowMouseUpHandler = null;
    }
    this._canvas = null;
    this._ctx = null;
  }

  private _canvasPos(e: MouseEvent): { row: number; col: number } | null {
    if (!this._canvas) return null;
    return computeCanvasPos(e, this._canvas, this._editRows, this._editCols);
  }

  private _onMouseDown(e: MouseEvent, campaign: CampaignDef): void {
    if (e.button === 2) {
      const pos = this._canvasPos(e);
      if (!pos) return;
      this._rightEraseDragActive = true;
      this._suppressContextMenu = false;
      if ((this._editGrid[pos.row]?.[pos.col] ?? null) !== null) {
        this._editGrid[pos.row][pos.col] = null;
        this._clearFocusIfAt(pos);
        sfxManager.play(SfxId.Delete);
        this._renderCanvas();
      }
      return;
    }
    if (e.button !== 0) return;
    const pos = this._canvasPos(e);
    if (!pos) return;

    this._focusedTilePos = pos;

    const tileAtPos = this._editGrid[pos.row]?.[pos.col] ?? null;
    if (tileAtPos !== null) {
      const paletteForTile: EditorPalette =
        tileAtPos.shape === PipeShape.Chamber && tileAtPos.chamberContent === 'chapter'
          ? CHAPTER_CHAMBER_PALETTE
          : tileAtPos.shape;
      this._palette = paletteForTile;
      document.getElementById('campaign-map-palette-panel')
        ?.replaceWith(this._buildPalettePanel(campaign));
    }

    document.getElementById('campaign-map-tile-params-panel')
      ?.replaceWith(this._buildTileParamsPanel(campaign));

    const existingTile = this._editGrid[pos.row]?.[pos.col] ?? null;

    if (this._selectedChapterIdx !== null) {
      if (existingTile === null) {
        this._editGrid[pos.row][pos.col] = {
          shape: PipeShape.Chamber,
          chamberContent: 'chapter',
          chapterIdx: this._selectedChapterIdx,
          connections: [Direction.East, Direction.West],
        };
        this._selectedChapterIdx = null;
        this._palette = CHAPTER_CHAMBER_PALETTE;
        document.getElementById('campaign-map-palette-panel')
          ?.replaceWith(this._buildPalettePanel(campaign));
        document.getElementById('campaign-map-tile-params-panel')
          ?.replaceWith(this._buildTileParamsPanel(campaign));
        this._recordSnapshot(campaign);
        this._saveGridState(campaign);
        document.getElementById('campaign-map-chapter-inventory')
          ?.replaceWith(this._buildChapterInventoryPanel(campaign));
        this._renderCanvas();
      } else if (existingTile.shape === PipeShape.Chamber && existingTile.chamberContent === 'chapter') {
        this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
        this._renderCanvas();
      }
      return;
    }

    if (this._palette === CHAPTER_CHAMBER_PALETTE) {
      if (existingTile !== null) {
        this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
        this._renderCanvas();
      }
      return;
    }

    const palette = this._palette;
    const isEmptyFloorPalette = palette !== 'erase' && EMPTY_FLOOR_SHAPES.includes(palette as PipeShape);
    const existingIsEmptyFloor = existingTile === null ||
      (existingTile !== null && isEmptyFloor(existingTile.shape));

    if (existingTile !== null && !existingIsEmptyFloor && palette !== 'erase' && !isEmptyFloorPalette) {
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._renderCanvas();
    } else {
      if (palette === PipeShape.Source && hasShapeElsewhere(this._editGrid, this._editRows, this._editCols, PipeShape.Source)) {
        return;
      }
      if (palette === PipeShape.Sink && hasShapeElsewhere(this._editGrid, this._editRows, this._editCols, PipeShape.Sink)) {
        this._showSinkError();
        return;
      }
      if (existingIsEmptyFloor && REPEATABLE_EDITOR_TILES.has(palette)) {
        this._paintDragActive = true;
        this._editGrid[pos.row][pos.col] = this._buildTileDef();
        this._playPlacementSfx(pos);
        this._renderCanvas();
        return;
      }
      if (palette === 'erase' || palette === PipeShape.Empty) {
        if (existingTile !== null) sfxManager.play(SfxId.Delete);
        this._editGrid[pos.row][pos.col] = null;
        this._clearFocusIfAt(pos);
        document.getElementById('campaign-map-chapter-inventory')
          ?.replaceWith(this._buildChapterInventoryPanel(campaign));
      } else {
        this._editGrid[pos.row][pos.col] = this._buildTileDef();
        this._playPlacementSfx(pos);
      }
      this._recordSnapshot(campaign);
      this._saveGridState(campaign);
      this._renderCanvas();
    }
  }

  private _onMouseUp(e: MouseEvent, campaign: CampaignDef): void {
    if (e.button === 2) {
      if (!this._rightEraseDragActive) return;
      this._rightEraseDragActive = false;
      this._suppressContextMenu = true;
      document.getElementById('campaign-map-chapter-inventory')
        ?.replaceWith(this._buildChapterInventoryPanel(campaign));
      this._recordSnapshot(campaign);
      this._saveGridState(campaign);
      this._renderCanvas();
      return;
    }
    if (e.button !== 0) return;

    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._recordSnapshot(campaign);
      this._saveGridState(campaign);
      this._renderCanvas();
      return;
    }

    if (!this._dragState) return;
    const { startPos, tile, currentPos, moved } = this._dragState;
    this._dragState = null;

    if (moved) {
      this._focusedTilePos = null;
      this._editGrid[startPos.row][startPos.col] = null;
      this._editGrid[currentPos.row][currentPos.col] = tile;
      this._recordSnapshot(campaign);
      this._saveGridState(campaign);
    } else {
      if (PIPE_SHAPES.has(tile.shape)) {
        this._rotateTileAt(startPos, !e.shiftKey, campaign);
        return;
      }
    }
    this._renderCanvas();
  }

  private _onMouseMove(e: MouseEvent, campaign: CampaignDef): void {
    const pos = this._canvasPos(e);
    this._hover = pos;

    if (this._canvas) {
      const tile = pos ? (this._editGrid[pos.row]?.[pos.col] ?? null) : null;
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'chapter' && tile.chapterIdx !== undefined) {
        const camp = this._cbs.getActiveCampaign();
        const chapter = camp?.chapters[tile.chapterIdx];
        this._canvas.title = chapter
          ? `Ch-${tile.chapterIdx + 1}: ${chapter.name}`
          : `Chapter ${tile.chapterIdx + 1}`;
      } else {
        this._canvas.title = '';
      }
    }

    if (this._paintDragActive && pos) {
      const cur = this._editGrid[pos.row]?.[pos.col] ?? null;
      if (cur === null || isEmptyFloor(cur.shape)) {
        this._editGrid[pos.row][pos.col] = this._buildTileDef();
      }
    } else if (this._rightEraseDragActive && pos) {
      if ((this._editGrid[pos.row]?.[pos.col] ?? null) !== null) {
        this._editGrid[pos.row][pos.col] = null;
        this._clearFocusIfAt(pos);
      }
    } else if (this._dragState && pos) {
      const { startPos, currentPos } = this._dragState;
      if (pos.row !== currentPos.row || pos.col !== currentPos.col) {
        if (pos.row === startPos.row && pos.col === startPos.col) {
          this._dragState.currentPos = pos;
          this._dragState.moved = false;
        } else if ((this._editGrid[pos.row]?.[pos.col] ?? null) === null) {
          this._dragState.currentPos = pos;
          this._dragState.moved = true;
        }
      }
    }
    this._renderCanvas();
  }

  private _onRightClick(e: MouseEvent, campaign: CampaignDef): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    if ((this._editGrid[pos.row]?.[pos.col] ?? null) !== null) sfxManager.play(SfxId.Delete);
    this._editGrid[pos.row][pos.col] = null;
    this._clearFocusIfAt(pos);
    document.getElementById('campaign-map-chapter-inventory')
      ?.replaceWith(this._buildChapterInventoryPanel(campaign));
    this._recordSnapshot(campaign);
    this._saveGridState(campaign);
    this._renderCanvas();
  }

  private _onDblClick(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    const tile = this._editGrid[pos.row]?.[pos.col] ?? null;
    if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'chapter' || tile.chapterIdx === undefined) return;
    sfxManager.play(SfxId.LevelSelect);
    const readOnly = this._cbs.getActiveCampaign()?.official === true;
    this._cbs.openChapterEditor(tile.chapterIdx, readOnly);
  }

  private _onMouseLeave(campaign: CampaignDef): void {
    this._hover = null;
    if (this._dragState) this._dragState = null;
    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._recordSnapshot(campaign);
    }
    if (this._rightEraseDragActive) {
      this._rightEraseDragActive = false;
      this._recordSnapshot(campaign);
    }
    this._renderCanvas();
  }

  private _onWheel(e: WheelEvent, campaign: CampaignDef): void {
    e.preventDefault();
    const pos = this._canvasPos(e);
    if (!pos) return;
    const tile = this._editGrid[pos.row]?.[pos.col] ?? null;
    if (tile && PIPE_SHAPES.has(tile.shape)) {
      this._rotateTileAt(pos, e.deltaY > 0, campaign);
    } else if (tile && (
      tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === 'chapter')
    )) {
      this._rotateSourceSinkAt(pos, e.deltaY > 0, campaign);
    } else if (PIPE_SHAPES.has(this._palette as PipeShape)) {
      this._rotatePalette(e.deltaY > 0);
      sfxManager.play(e.deltaY > 0 ? SfxId.PendingCW : SfxId.PendingCCW);
    }
  }

  private _playPlacementSfx(pos: { row: number; col: number }): void {
    if (isPipePlacementPalette(this._palette)) {
      const isConnected = isTileConnectedToSource(this._editGrid, pos);
      sfxManager.play(isConnected ? SfxId.PipeConnected : SfxId.PipePlacement);
    }
  }

  // ── Private: rotation helpers ──────────────────────────────────────────────

  private _rotateTileAt(pos: { row: number; col: number }, clockwise: boolean, campaign: CampaignDef): void {
    const tile = this._editGrid[pos.row]?.[pos.col];
    if (!tile || !PIPE_SHAPES.has(tile.shape)) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
    const cur = (tile.rotation ?? 0) as Rotation;
    tile.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    if (this._palette === tile.shape) this._params.rotation = tile.rotation;
    this._recordSnapshot(campaign);
    this._saveGridState(campaign);
    this._renderCanvas();
  }

  private _rotatePalette(clockwise: boolean): void {
    if (!PIPE_SHAPES.has(this._palette as PipeShape)) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
    const cur = this._params.rotation ?? 0;
    this._params.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    this._renderCanvas();
  }

  private _rotateSourceSinkAt(pos: { row: number; col: number }, clockwise: boolean, campaign: CampaignDef): void {
    const tile = this._editGrid[pos.row]?.[pos.col];
    if (!tile) return;
    const isConnectable =
      tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === 'chapter');
    if (!isConnectable) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);

    const newConns = rotateConnectionsBy90(tile.connections, clockwise);
    tile.connections = newConns;

    if (this._palette === tile.shape) {
      this._params.connections = {
        N: newConns.includes(Direction.North),
        E: newConns.includes(Direction.East),
        S: newConns.includes(Direction.South),
        W: newConns.includes(Direction.West),
      };
    }

    this._focusedTilePos = pos;
    document.getElementById('campaign-map-tile-params-panel')
      ?.replaceWith(this._buildTileParamsPanel(campaign));

    this._recordSnapshot(campaign);
    this._saveGridState(campaign);
    this._renderCanvas();
  }

  // ── Private: reachability ──────────────────────────────────────────────────

  private _computeFilledCells(): Set<string> {
    return computeEditorFilledCells(this._editGrid, this._editRows, this._editCols);
  }

  private _clearFocusIfAt(pos: { row: number; col: number }): void {
    if (this._focusedTilePos?.row === pos.row && this._focusedTilePos?.col === pos.col) {
      this._focusedTilePos = null;
    }
  }

  private _showSinkError(): void {
    const el = this._errorEl;
    if (!el) return;
    showTimedMessage(el, 'Only one sink tile is allowed.');
  }

  // ── Private: grid operations ───────────────────────────────────────────────

  private _resizeGrid(newRows: number, newCols: number, campaign: CampaignDef): void {
    this._editGrid = resizeGrid(this._editGrid, this._editRows, this._editCols, newRows, newCols);
    this._editRows = newRows;
    this._editCols = newCols;
    this._recordSnapshot(campaign);
    this._updateCanvasDisplaySize();
    this._saveGridState(campaign);
    this._renderCanvas();
  }

  private _slideGrid(dir: 'N' | 'E' | 'S' | 'W', campaign: CampaignDef): void {
    this._editGrid = slideGrid(this._editGrid, this._editRows, this._editCols, dir);
    this._recordSnapshot(campaign);
    sfxManager.play(SfxId.BoardSlide);
    this._renderCanvas();
  }

  private _rotateGrid(clockwise: boolean, campaign: CampaignDef): void {
    const oldRows = this._editRows;
    const oldCols = this._editCols;
    const { newGrid, newRows, newCols } = rotateGridBy90(this._editGrid, oldRows, oldCols, clockwise);
    this._editRows = newRows;
    this._editCols = newCols;
    this._editGrid = newGrid;
    if (this._focusedTilePos) {
      this._focusedTilePos = rotatePositionBy90(this._focusedTilePos, oldRows, oldCols, clockwise);
    }
    this._recordSnapshot(campaign);
    sfxManager.play(SfxId.BoardSlide);
    this._updateCanvasDisplaySize();
    this._renderCanvas();
  }

  private _reflectGrid(campaign: CampaignDef): void {
    const oldRows = this._editRows;
    const oldCols = this._editCols;
    const { newGrid, newRows, newCols } = reflectGridAboutDiagonal(this._editGrid, oldRows, oldCols);
    this._editRows = newRows;
    this._editCols = newCols;
    this._editGrid = newGrid;
    if (this._focusedTilePos) {
      this._focusedTilePos = reflectPositionAboutDiagonal(this._focusedTilePos);
    }
    this._recordSnapshot(campaign);
    sfxManager.play(SfxId.BoardSlide);
    this._updateCanvasDisplaySize();
    this._renderCanvas();
  }

  private _flipGridHorizontal(campaign: CampaignDef): void {
    const { newGrid } = flipGridHorizontal(this._editGrid, this._editRows, this._editCols);
    this._editGrid = newGrid;
    if (this._focusedTilePos) {
      this._focusedTilePos = flipPositionHorizontal(this._focusedTilePos, this._editCols);
    }
    this._recordSnapshot(campaign);
    sfxManager.play(SfxId.BoardSlide);
    this._renderCanvas();
  }

  private _flipGridVertical(campaign: CampaignDef): void {
    const { newGrid } = flipGridVertical(this._editGrid, this._editRows, this._editCols);
    this._editGrid = newGrid;
    if (this._focusedTilePos) {
      this._focusedTilePos = flipPositionVertical(this._focusedTilePos, this._editRows);
    }
    this._recordSnapshot(campaign);
    sfxManager.play(SfxId.BoardSlide);
    this._renderCanvas();
  }

  // ── Private: undo/redo ─────────────────────────────────────────────────────

  private _recordSnapshot(campaign: CampaignDef, markChanged = true): void {
    const snapshot: EditorSnapshot = {
      grid: this._editGrid,
      rows: this._editRows,
      cols: this._editCols,
      inventory: [],
      levelStyle: campaign.style,
    };
    this._hist.record(snapshot);
    if (markChanged) this._updateUndoRedoButtons();
  }

  private _undo(campaign: CampaignDef): void {
    const snap = this._hist.undo();
    if (!snap) return;
    sfxManager.play(SfxId.Undo);
    this._applySnapshot(snap, campaign);
  }

  private _redo(campaign: CampaignDef): void {
    const snap = this._hist.redo();
    if (!snap) return;
    sfxManager.play(SfxId.Redo);
    this._applySnapshot(snap, campaign);
  }

  private _applySnapshot(snap: EditorSnapshot, campaign: CampaignDef): void {
    this._editGrid = snap.grid as (TileDef | null)[][];
    this._editRows = snap.rows;
    this._editCols = snap.cols;
    campaign.style = snap.levelStyle as typeof campaign.style;
    this._updateCanvasDisplaySize();
    this._saveGridState(campaign);
    document.getElementById('campaign-map-chapter-inventory')
      ?.replaceWith(this._buildChapterInventoryPanel(campaign));
    document.getElementById('campaign-map-grid-size-panel')
      ?.replaceWith(this._buildGridSizePanel(campaign));
    document.getElementById('campaign-map-style-panel')
      ?.replaceWith(this._buildStylePanel(campaign));
    this._updateUndoRedoButtons();
    this._renderCanvas();
  }

  private _updateUndoRedoButtons(): void {
    updateUndoRedoButtonPair('campaign-map-undo-btn', 'campaign-map-redo-btn', this._hist.canUndo, this._hist.canRedo);
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
        this._recordSnapshot(campaign);
        this._saveGridState(campaign);
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
        this._recordSnapshot(campaign);
        this._saveGridState(campaign);
        replaceTarget.replaceWith(this._buildTileParamsPanel(campaign));
        this._renderCanvas();
      },
    );
  }
}
