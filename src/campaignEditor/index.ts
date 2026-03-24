/**
 * Campaign Editor – UI class for creating, editing, importing, and exporting
 * game campaigns (collections of chapters and levels).
 *
 * Screens:
 *   list        – shows all campaigns (Official + user campaigns)
 *   campaign    – edit campaign name/author and manage chapters
 *   chapter     – manage levels within a chapter
 *   levelEditor – full level-editing canvas with tile palette, parameters, and validation
 */

import { CampaignDef, LevelDef, TileDef, InventoryItem, PipeShape, Direction, Rotation, COLD_CHAMBER_CONTENTS, TEMP_CHAMBER_CONTENTS } from '../types';
import { loadImportedCampaigns, saveImportedCampaigns, loadCampaignProgress, computeCampaignCompletionPct, loadActiveCampaignId, migrateCampaign, clearLevelStarRecord, clearLevelWaterRecord } from '../persistence';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';

/** Maximum CSS display size (px) for the editor canvas on either axis. */
const MAX_EDITOR_CANVAS_PX = 512;
/** Horizontal padding (px) of the main editor layout container. */
const EDITOR_LAYOUT_PADDING = 16;
/** Gap (px) between flex columns in the main editor layout. */
const EDITOR_LAYOUT_GAP = 16;
/** Border width (px) on each side of the editor canvas. */
const EDITOR_CANVAS_BORDER = 3;
/** Minimum allowed grid dimension (rows or cols). */
const GRID_MIN_DIM = 1;
/** Maximum allowed grid dimension (rows or cols). */
const GRID_MAX_DIM = 20;
/** Border color for the currently selected palette item button. */
const PALETTE_ITEM_SELECTED_BORDER = '#f0c040';
/** Border color for an unselected palette item button. */
const PALETTE_ITEM_UNSELECTED_BORDER = '#2a3a5e';
/** Background color for the currently selected palette item button. */
const PALETTE_ITEM_SELECTED_BG = '#2a3a1a';
/** Background color for an unselected palette item button. */
const PALETTE_ITEM_UNSELECTED_BG = '#0d1a30';
/** Text color for the currently selected palette item button. */
const PALETTE_ITEM_SELECTED_COLOR = '#f0c040';
/** Text color for an unselected palette item button. */
const PALETTE_ITEM_UNSELECTED_COLOR = '#eee';
/** CSS for a flex row that centers items and adds a small gap (used for label+input pairs). */
const EDITOR_FLEX_ROW_CSS = 'display:flex;align-items:center;gap:8px;';
/** CSS for a button row aligned to the trailing edge (used at the bottom of modal/confirm dialogs). */
const EDITOR_BTN_ROW_CSS = 'display:flex;gap:12px;justify-content:flex-end;';
/** Base CSS for a side-panel box in the level editor (background, border, radius, padding). */
const EDITOR_PANEL_BASE_CSS =
  'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;';
/** CSS for the all-caps section-title label inside an editor side-panel. */
const EDITOR_PANEL_TITLE_CSS = 'font-size:0.8rem;color:#7ed321;font-weight:bold;letter-spacing:1px;';
import { Board, PIPE_SHAPES, LEAKY_PIPE_SHAPES, parseKey } from '../board';
import {
  EditorPalette,
  EditorScreen,
  ChamberPalette,
  ChamberContent,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
  ValidationResult,
  generateCampaignId,
  generateLevelId,
  isChamberPalette,
  chamberPaletteContent,
  ungzipBlob,
  VALID_CAMPAIGN_KEYS,
  VALID_CHAPTER_KEYS,
  VALID_LEVEL_KEYS,
  VALID_INVENTORY_ITEM_KEYS,
  getValidTileDefKeys,
} from './types';
import { renderEditorCanvas, drawEditorTile, HoverOverlay, DragState } from './renderer';
import { renderMinimap } from '../minimap';

/**
 * Palette values that support paint-drag: clicking and dragging across multiple
 * empty cells places the tile on each one.  Includes all pipe shapes (regular and
 * gold), gold spaces, and granite – tile types commonly laid in bulk.
 */
const REPEATABLE_EDITOR_TILES = new Set<EditorPalette>([
  PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee, PipeShape.Cross,
  PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross,
  PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee, PipeShape.LeakyCross,
  PipeShape.GoldSpace, PipeShape.OneWay, PipeShape.Cement, PipeShape.Granite, PipeShape.Tree,
  PipeShape.SpinStraight, PipeShape.SpinElbow, PipeShape.SpinTee,
]);

// ─── CampaignEditor class ─────────────────────────────────────────────────────

export class CampaignEditor {
  private readonly _el: HTMLElement;

  /** All user-created / imported campaigns (not including Official). */
  private _campaigns: CampaignDef[];

  // ── Navigation state ──────────────────────────────────────────────────────
  private _screen: EditorScreen = EditorScreen.List;
  private _activeCampaignId: string | null = null;
  private _activeChapterIdx = -1;
  private _activeLevelIdx = -1;

  // ── Level editor state ────────────────────────────────────────────────────
  private _editLevelName = 'New Level';
  private _editLevelNote = '';
  private _editLevelHints: string[] = [''];
  private _editLevelChallenge = false;
  private _editRows = 6;
  private _editCols = 6;
  private _editGrid: (TileDef | null)[][] = [];
  private _editInventory: InventoryItem[] = [];
  private _editorPalette: EditorPalette = PipeShape.Source;
  private _editorParams: TileParams = { ...DEFAULT_PARAMS };
  private _editorCanvas: HTMLCanvasElement | null = null;
  private _editorCtx: CanvasRenderingContext2D | null = null;
  private _editorHover: { row: number; col: number } | null = null;
  private _editorHistory: EditorSnapshot[] = [];
  private _editorHistoryIdx = -1;
  private _goldSectionExpanded = false;
  private _leakySectionExpanded = false;
  private _chamberSectionExpanded = false;
  private _pipesSectionExpanded = false;
  private _floorSectionExpanded = false;
  private _editorSourceErrorEl: HTMLDivElement | null = null;
  /** Drag state: set when the user is dragging a tile across the grid. */
  private _dragState: {
    startPos: { row: number; col: number };
    tile: TileDef;
    currentPos: { row: number; col: number };
    moved: boolean;
  } | null = null;
  /** Bound window mouseup handler for drag completion; stored so it can be removed. */
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  /** True while a paint-drag is active (repeatable palette, dragging over empty cells). */
  private _paintDragActive = false;
  /** True while a right-button erase-drag is active. */
  private _rightEraseDragActive = false;
  /**
   * True when the right-drag gesture already handled removal, so the subsequent
   * contextmenu event (if it fires) should be suppressed.
   */
  private _suppressNextContextMenu = false;
  /** Grid position of the tile currently linked for live param editing, or null if no link active. */
  private _linkedTilePos: { row: number; col: number } | null = null;
  /** True once the first param change in the current linked session has been committed. */
  private _linkedTileDirty = false;
  /** True when the level editor has unsaved changes (any snapshot recorded after initial open). */
  private _editorUnsavedChanges = false;
  /** The history index at which the level was last saved (or 0 if never saved in this session). */
  private _editorSavedHistoryIdx = 0;
  /** The outermost flex container of the level editor layout, used to measure available canvas space. */
  private _editorMainLayout: HTMLElement | null = null;

  private readonly _onClose: () => void;
  private readonly _onPlaytest: (level: LevelDef) => void;
  private readonly _onPlayCampaign: (campaign: CampaignDef) => void;

  constructor(
    onClose: () => void,
    onPlaytest: (level: LevelDef) => void,
    onPlayCampaign: (campaign: CampaignDef) => void,
  ) {
    this._onClose = onClose;
    this._onPlaytest = onPlaytest;
    this._onPlayCampaign = onPlayCampaign;
    this._campaigns = loadImportedCampaigns();

    this._el = document.createElement('div');
    this._el.style.cssText =
      'display:none;position:fixed;inset:0;background:#0d1520;overflow:auto;z-index:200;' +
      'font-family:Arial,sans-serif;color:#eee;flex-direction:column;align-items:center;';
    document.body.appendChild(this._el);

    // Global keyboard handler for shortcuts (guarded to the level editor screen)
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this._screen !== EditorScreen.LevelEditor || this._el.style.display === 'none') return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this._editorUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this._editorRedo(); }
      if (e.key === 'Escape' && this._linkedTilePos !== null) {
        // Unlink the linked tile
        e.preventDefault();
        this._linkedTilePos = null;
        this._linkedTileDirty = false;
        this._renderEditorCanvas();
      }
      // Q = rotate counter-clockwise, W = rotate clockwise (mirrors in-game mouse wheel)
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (!e.ctrlKey && !e.altKey && !isInputFocused) {
        const key = e.key.toLowerCase();
        if (key === 'q' || key === 'w') {
          e.preventDefault();
          this._rotateEditorPalette(key === 'w');
          if (this._linkedTilePos) this._applyParamsToLinkedTile();
          this._refreshPaletteUI();
          this._renderEditorCanvas();
        }
      }
    });
  }

  /** Show the campaign editor (campaign list screen). */
  show(): void {
    this._el.style.display = 'flex';
    this._showCampaignList();
  }

  /**
   * Show the campaign editor, restoring the screen that was active when hide() was called.
   * Use this after playtesting to return the user to the level they were editing.
   */
  showAndRestore(): void {
    this._el.style.display = 'flex';
    switch (this._screen) {
      case EditorScreen.LevelEditor: {
        const campaign = this._getActiveCampaign();
        const readOnly = campaign?.official === true;
        this._showLevelEditor(readOnly);
        break;
      }
      case EditorScreen.Chapter:
        this._showChapterDetail();
        break;
      case EditorScreen.Campaign:
        this._showCampaignDetail();
        break;
      default:
        this._showCampaignList();
    }
  }

  /** Hide the campaign editor. */
  hide(): void {
    this._el.style.display = 'none';
  }

  // ─── Toolbar ─────────────────────────────────────────────────────────────

  private _buildToolbar(title: string, onBack: (() => void) | null): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.style.cssText =
      'width:100%;max-width:900px;display:flex;align-items:center;gap:12px;' +
      'padding:14px 20px;background:#16213e;border-bottom:2px solid #4a90d9;' +
      'box-sizing:border-box;position:sticky;top:0;z-index:10;';

    if (onBack) {
      const backBtn = this._btn('← Back', '#2a2a4a', '#aaa', onBack);
      toolbar.appendChild(backBtn);
    }

    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.cssText = 'font-size:1.2rem;font-weight:bold;flex:1;';
    toolbar.appendChild(titleEl);

    return toolbar;
  }

  // ─── Button helpers ────────────────────────────────────────────────────────

  private _btn(label: string, bg: string, color: string, onClick: () => void, extraStyle = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      `padding:8px 16px;font-size:0.9rem;background:${bg};color:${color};` +
      `border:1px solid ${color};border-radius:6px;cursor:pointer;${extraStyle}`;
    b.addEventListener('click', onClick);
    return b;
  }

  /**
   * Append ▲ / ▼ reorder buttons to `btns` for the item at `idx` within
   * `items`.  Each button swaps adjacent items, touches the campaign, saves,
   * and calls `onRefresh` to re-render.  No button is appended when the move
   * would be out of bounds.
   */
  private _appendReorderButtons<T>(
    btns: HTMLElement,
    items: T[],
    idx: number,
    campaign: CampaignDef,
    onRefresh: () => void,
  ): void {
    if (idx > 0) {
      btns.appendChild(this._btn('▲', '#16213e', '#aaa', () => {
        [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
        this._touchCampaign(campaign);
        this._saveCampaigns();
        onRefresh();
      }));
    }
    if (idx < items.length - 1) {
      btns.appendChild(this._btn('▼', '#16213e', '#aaa', () => {
        [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
        this._touchCampaign(campaign);
        this._saveCampaigns();
        onRefresh();
      }));
    }
  }

  /**
   * Create the common skeleton shared by {@link _buildCampaignRow},
   * {@link _buildChapterRow}, and {@link _buildLevelRow}: an outer flex row, an
   * expandable info area, and a button cluster.  Callers populate `info` and
   * `btns` with their specific content, then return `row`.
   *
   * @param borderColor - CSS colour for the 2px solid border.
   * @param padding     - CSS padding shorthand for the outer row.
   * @param btnGap      - CSS gap for the button container (default `'8px'`).
   */
  private _buildItemRow(
    borderColor: string,
    padding: string,
    btnGap = '8px',
  ): { row: HTMLElement; info: HTMLElement; btns: HTMLElement } {
    const row = document.createElement('div');
    row.style.cssText =
      `background:#16213e;border:2px solid ${borderColor};border-radius:8px;` +
      `padding:${padding};display:flex;align-items:center;gap:12px;`;
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;';
    const btns = document.createElement('div');
    btns.style.cssText = `display:flex;gap:${btnGap};flex-wrap:wrap;`;
    row.appendChild(info);
    row.appendChild(btns);
    return { row, info, btns };
  }

  /**
   * Create a standard full-screen modal overlay and a centred dialog box,
   * append the overlay to `_el`, and return both elements for the caller to
   * populate.
   * @param maxWidth CSS max-width for the dialog (default '460px').
   */
  private _createDialogOverlay(maxWidth = '460px'): { overlay: HTMLDivElement; dialog: HTMLDivElement } {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;' +
      'justify-content:center;z-index:300;';
    const dialog = document.createElement('div');
    dialog.style.cssText =
      `background:#16213e;border:2px solid #4a90d9;border-radius:10px;padding:28px 32px;` +
      `display:flex;flex-direction:column;gap:18px;min-width:300px;max-width:${maxWidth};` +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6);';
    overlay.appendChild(dialog);
    this._el.appendChild(overlay);
    return { overlay, dialog };
  }

  /**
   * Create a small styled info-box `<div>` used to display a level note, hint
   * summary, or challenge badge in the non-edit level card view.
   *
   * All three box types share the same background and padding; only the border
   * colour changes to distinguish note (blue), hint (gold), and challenge (red).
   *
   * @param borderColor CSS colour for the 1 px solid border (e.g. `'#4a90d9'`).
   * @param text        Content to display inside the box.
   */
  private _createInfoBox(borderColor: string, text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      `background:#16213e;border:1px solid ${borderColor};border-radius:6px;` +
      'padding:10px 14px;font-size:0.85rem;color:#eee;';
    el.textContent = text;
    return el;
  }

  /** Set the campaign's lastUpdated timestamp to the current time. */
  private _touchCampaign(campaign: CampaignDef): void {
    campaign.lastUpdated = new Date().toISOString();
  }

  /** Format an ISO timestamp for display, or return a fallback string if absent. */
  private _formatTimestamp(ts: string | undefined): string {
    if (!ts) return 'unknown';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  }

  /**
   * Show an info dialog telling the user the imported campaign is the same version
   * as the local copy. The import is cancelled.
   */
  private _showImportSameVersionDialog(name: string, ts: string | undefined): void {
    const { overlay, dialog } = this._createDialogOverlay('460px');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#4a90d9;';
    title.textContent = '✅ Same Version';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;';
    msg.innerHTML =
      `<strong style="color:#fff;">"${name}"</strong> is already up to date.<br><br>` +
      `The imported campaign has the same version as your local copy<br>` +
      `(last updated: <em>${this._formatTimestamp(ts)}</em>).<br><br>` +
      `The campaign will not be updated.`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;
    btnRow.appendChild(this._btn('OK', '#4a90d9', '#fff', () => overlay.remove()));

    dialog.appendChild(title);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  /**
   * Show a confirmation dialog asking the user whether to overwrite a local campaign
   * with an imported one of a different version.
   * @param imported  The campaign data being imported.
   * @param existing  The local campaign with the same ID.
   * @param isNewer   True when the imported campaign is more recent.
   * @param onConfirm Called when the user confirms the import.
   */
  private _showImportVersionConflictDialog(
    imported: CampaignDef,
    existing: CampaignDef,
    isNewer: boolean,
    onConfirm: () => void,
  ): void {
    const { overlay, dialog } = this._createDialogOverlay('480px');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#f0c040;';
    title.textContent = isNewer ? '⏩ Import Newer Version?' : '⏪ Import Older Version?';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;';
    const localLabel = `Local version: <em>${this._formatTimestamp(existing.lastUpdated)}</em>`;
    const importedLabel = `Imported version: <em>${this._formatTimestamp(imported.lastUpdated)}</em> (${isNewer ? 'newer' : 'older'})`;
    msg.innerHTML =
      `<strong style="color:#fff;">"${imported.name}"</strong> already exists locally.<br><br>` +
      `${localLabel}<br>` +
      `${importedLabel}<br><br>` +
      `Importing will replace all chapters and levels in the local campaign.<br>` +
      `Player progress will be retained.`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;

    const confirmLabel = isNewer ? '⏩ Import newer version' : '⏪ Overwrite with older version';
    const confirmColor = isNewer ? '#27ae60' : '#e67e22';
    const confirmBtn = this._btn(confirmLabel, confirmColor, '#fff', () => {
      overlay.remove();
      onConfirm();
    });
    const cancelBtn = this._btn('Cancel', '#2a2a4a', '#aaa', () => overlay.remove());

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    dialog.appendChild(title);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  /**
   * Show a modal dialog asking the user to Save or Discard unsaved level changes.
   * Appended to `_el`; removed when either button is clicked.
   */
  private _showUnsavedModal(onSave: () => void, onDiscard: () => void): void {
    const { overlay, dialog } = this._createDialogOverlay('420px');

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:1rem;color:#eee;line-height:1.5;';
    msg.textContent = 'You have unsaved changes. Would you like to save before leaving?';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;

    const saveBtn = this._btn('💾 Save', '#27ae60', '#fff', () => {
      overlay.remove();
      onSave();
    });
    const discardBtn = this._btn('🗑 Discard', '#c0392b', '#fff', () => {
      overlay.remove();
      onDiscard();
    });
    const cancelBtn = this._btn('Cancel', '#2a2a4a', '#aaa', () => {
      overlay.remove();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(discardBtn);
    btnRow.appendChild(saveBtn);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  private _labeledInput(labelText: string, value: string, onInput: (v: string) => void, type = 'text', inputWidth?: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = EDITOR_FLEX_ROW_CSS;
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    lbl.style.cssText = 'font-size:0.85rem;color:#aaa;min-width:80px;';
    const inp = document.createElement('input');
    inp.type = type;
    inp.value = value;
    inp.style.cssText =
      'padding:6px 10px;font-size:0.9rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;' +
      (inputWidth ? `width:${inputWidth};` : 'flex:1;');
    inp.addEventListener('input', () => onInput(inp.value));
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  }

  // ─── Screen: Campaign list ────────────────────────────────────────────────

  private _showCampaignList(): void {
    this._screen = EditorScreen.List;
    this._el.innerHTML = '';

    const toolbar = this._buildToolbar('🗺️ Select Campaign', null);

    // Close button
    const closeBtn = this._btn('✕ Close', '#2a2a4a', '#aaa', () => {
      this.hide();
      this._onClose();
    });
    toolbar.appendChild(closeBtn);

    this._el.appendChild(toolbar);

    const content = document.createElement('div');
    content.style.cssText =
      'width:100%;max-width:900px;padding:20px;box-sizing:border-box;display:flex;' +
      'flex-direction:column;gap:16px;';

    // Action bar
    const actionBar = document.createElement('div');
    actionBar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
    actionBar.appendChild(
      this._btn('➕ New Campaign', '#16213e', '#7ed321', () => this._createCampaign()),
    );
    actionBar.appendChild(
      this._btn('📥 Import', '#16213e', '#4a90d9', () => this._importCampaign()),
    );
    content.appendChild(actionBar);

    // Campaign list
    const allCampaigns: CampaignDef[] = [...this._campaigns];
    for (const campaign of allCampaigns) {
      content.appendChild(this._buildCampaignRow(campaign));
    }

    this._el.appendChild(content);
  }

  private _buildCampaignRow(campaign: CampaignDef): HTMLElement {
    const isOfficial = campaign.official === true;
    const activeCampaignId = loadActiveCampaignId();
    const isActive = activeCampaignId === campaign.id;
    const { row, info, btns } = this._buildItemRow('#4a90d9', '14px 18px');

    const name = document.createElement('div');
    name.style.cssText = 'font-size:1rem;font-weight:bold;';
    name.textContent = campaign.name + (isOfficial ? ' 🔒' : '');
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem;color:#aaa;margin-top:4px;';
    const levelCount = campaign.chapters.reduce((n, ch) => n + ch.levels.length, 0);

    // Compute play completion percentage for non-official campaigns
    let progressText = '';
    if (!isOfficial && levelCount > 0) {
      const progress = loadCampaignProgress(campaign.id);
      const pct = computeCampaignCompletionPct(campaign, progress);
      progressText = `  ·  ${pct}% complete`;
    }

    const chapterWord = campaign.chapters.length === 1 ? 'chapter' : 'chapters';
    const levelWord = levelCount === 1 ? 'level' : 'levels';
    meta.textContent = `By ${campaign.author}  ·  ${campaign.chapters.length} ${chapterWord}  ·  ${levelCount} ${levelWord}${progressText}`;
    info.appendChild(name);
    info.appendChild(meta);

    // Play or Active button (shared for both official and user campaigns)
    if (isActive) {
      const activeBtn = this._btn('Active', '#16213e', '#888', () => {}, 'cursor:default;');
      activeBtn.disabled = true;
      btns.appendChild(activeBtn);
    } else {
      btns.appendChild(this._btn('▶ Play', '#16213e', '#7ed321', () => {
        this.hide();
        this._onPlayCampaign(campaign);
      }));
    }

    if (!isOfficial) {
      btns.appendChild(this._btn('✏️ Edit', '#16213e', '#f0c040', () => {
        this._activeCampaignId = campaign.id;
        this._showCampaignDetail();
      }));
    } else {
      btns.appendChild(this._btn('👁 View', '#16213e', '#aaa', () => {
        this._activeCampaignId = campaign.id;
        this._showCampaignDetail();
      }));
    }

    btns.appendChild(this._btn('📤 Export', '#16213e', '#4a90d9', () => {
      this._exportCampaign(campaign);
    }));

    if (!isOfficial) {
      btns.appendChild(this._btn('🗑 Delete', '#16213e', '#e74c3c', () => {
        this._deleteCampaign(campaign.id);
      }));
    }

    return row;
  }

  // ─── Screen: Campaign detail ──────────────────────────────────────────────

  private _getActiveCampaign(): CampaignDef | null {
    return this._campaigns.find((c) => c.id === this._activeCampaignId) ?? null;
  }

  private _showCampaignDetail(): void {
    this._screen = EditorScreen.Campaign;
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const isOfficial = campaign.official === true;
    // Determine whether this is a user campaign that can have its official flag toggled
    const isUserCampaign = this._campaigns.some((c) => c === campaign);

    const toolbar = this._buildToolbar(
      isOfficial ? `📋 ${campaign.name} (read-only)` : `✏️ Edit Campaign: ${campaign.name}`,
      () => this._showCampaignList(),
    );
    if (!isOfficial) {
      toolbar.appendChild(this._btn('📤 Export', '#16213e', '#4a90d9', () => this._exportCampaign(campaign)));
      toolbar.appendChild(this._btn('🔍 Dev – Validate data', '#16213e', '#f0c040', () => this._showValidateDataModal(campaign)));
    }
    this._el.appendChild(toolbar);

    const content = document.createElement('div');
    content.style.cssText =
      'width:100%;max-width:900px;padding:20px;box-sizing:border-box;display:flex;' +
      'flex-direction:column;gap:16px;';

    // ── Dev – Official Campaign toggle (user campaigns only) ──────────────────
    if (isUserCampaign) {
      const toggleWrap = document.createElement('div');
      toggleWrap.style.cssText =
        'background:#16213e;border:1px solid #f0c040;border-radius:8px;padding:12px 16px;' +
        'display:flex;align-items:center;gap:10px;';
      const toggleCb = document.createElement('input');
      toggleCb.type = 'checkbox';
      toggleCb.id = 'official-toggle';
      toggleCb.checked = isOfficial;
      toggleCb.style.cssText = 'width:16px;height:16px;cursor:pointer;';
      const toggleLbl = document.createElement('label');
      toggleLbl.htmlFor = 'official-toggle';
      toggleLbl.style.cssText = 'font-size:0.9rem;color:#f0c040;cursor:pointer;';
      toggleLbl.textContent = 'Dev – Official Campaign';
      toggleCb.addEventListener('change', () => {
        campaign.official = toggleCb.checked ? true : undefined;
        this._touchCampaign(campaign);
        this._saveCampaigns();
        // Re-render to update read-only state
        this._showCampaignDetail();
      });
      toggleWrap.appendChild(toggleCb);
      toggleWrap.appendChild(toggleLbl);
      content.appendChild(toggleWrap);
    }

    if (!isOfficial) {
      // Name and author fields
      const fields = document.createElement('div');
      fields.style.cssText =
        'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:16px;' +
        'display:flex;flex-direction:column;gap:10px;';

      fields.appendChild(this._labeledInput('Name', campaign.name, (v) => {
        campaign.name = v;
        this._touchCampaign(campaign);
        this._saveCampaigns();
      }));
      fields.appendChild(this._labeledInput('Author', campaign.author, (v) => {
        campaign.author = v;
        this._touchCampaign(campaign);
        this._saveCampaigns();
      }));
      content.appendChild(fields);
    }

    // Chapters section
    const chaptersHeader = document.createElement('div');
    chaptersHeader.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const chapTitle = document.createElement('h3');
    chapTitle.textContent = 'Chapters';
    chapTitle.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    chaptersHeader.appendChild(chapTitle);

    if (!isOfficial) {
      chaptersHeader.appendChild(this._btn('➕ Add Chapter', '#16213e', '#7ed321', () => {
        this._addChapter(campaign);
      }));
    }
    content.appendChild(chaptersHeader);

    for (let ci = 0; ci < campaign.chapters.length; ci++) {
      content.appendChild(this._buildChapterRow(campaign, ci, isOfficial));
    }

    if (campaign.chapters.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#777;font-size:0.85rem;';
      empty.textContent = 'No chapters yet – click "Add Chapter" to get started.';
      content.appendChild(empty);
    }

    this._el.appendChild(content);
  }

  private _buildChapterRow(campaign: CampaignDef, chapterIdx: number, readOnly: boolean): HTMLElement {
    const chapter = campaign.chapters[chapterIdx];
    const { row, info, btns } = this._buildItemRow('#2a3a5e', '12px 16px', '6px');

    const name = document.createElement('div');
    name.style.cssText = 'font-size:0.95rem;font-weight:bold;';
    name.textContent = `Chapter ${chapterIdx + 1}: ${chapter.name}`;
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem;color:#aaa;margin-top:3px;';
    const totalStars = chapter.levels.reduce((s, l) => s + (l.starCount ?? 0), 0);
    const challengeCount = chapter.levels.filter(l => l.challenge).length;
    const metaParts = [`${chapter.levels.length} ${chapter.levels.length === 1 ? 'level' : 'levels'}`];
    if (totalStars > 0) metaParts.push(`⭐\u202f×\u202f${totalStars}`);
    if (challengeCount > 0) metaParts.push(`💀\u202f×\u202f${challengeCount}`);
    meta.textContent = metaParts.join('  ');
    info.appendChild(name);
    info.appendChild(meta);

    const editOrViewLabel = readOnly ? '👁 View' : '✏️ Edit';
    btns.appendChild(this._btn(editOrViewLabel, '#16213e', '#f0c040', () => {
      this._activeChapterIdx = chapterIdx;
      this._showChapterDetail();
    }));

    if (!readOnly) {
      this._appendReorderButtons(btns, campaign.chapters, chapterIdx, campaign, () => this._showCampaignDetail());
      btns.appendChild(this._btn('🗑', '#16213e', '#e74c3c', () => {
        if (confirm(`Delete chapter "${chapter.name}" and all its levels?`)) {
          campaign.chapters.splice(chapterIdx, 1);
          this._touchCampaign(campaign);
          this._saveCampaigns();
          this._showCampaignDetail();
        }
      }));
    }

    return row;
  }

  // ─── Screen: Chapter detail ───────────────────────────────────────────────

  private _showChapterDetail(): void {
    this._screen = EditorScreen.Chapter;
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const chapter = campaign.chapters[this._activeChapterIdx];
    if (!chapter) { this._showCampaignDetail(); return; }
    const isOfficial = campaign.official === true;

    const toolbar = this._buildToolbar(
      `${isOfficial ? '📋' : '✏️'} Chapter ${this._activeChapterIdx + 1}: ${chapter.name}`,
      () => this._showCampaignDetail(),
    );
    this._el.appendChild(toolbar);

    const content = document.createElement('div');
    content.style.cssText =
      'width:100%;max-width:900px;padding:20px;box-sizing:border-box;display:flex;' +
      'flex-direction:column;gap:16px;';

    if (!isOfficial) {
      // Chapter name field
      const nameWrap = document.createElement('div');
      nameWrap.style.cssText =
        'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:16px;';
      nameWrap.appendChild(this._labeledInput('Chapter Name', chapter.name, (v) => {
        chapter.name = v;
        this._touchCampaign(campaign);
        this._saveCampaigns();
      }));
      content.appendChild(nameWrap);
    }

    // Levels section
    const levelsHeader = document.createElement('div');
    levelsHeader.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const lvlTitle = document.createElement('h3');
    lvlTitle.textContent = 'Levels';
    lvlTitle.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    levelsHeader.appendChild(lvlTitle);

    if (!isOfficial) {
      levelsHeader.appendChild(this._btn('➕ Add Level', '#16213e', '#7ed321', () => {
        this._addLevel(campaign, this._activeChapterIdx);
      }));
    }
    content.appendChild(levelsHeader);

    for (let li = 0; li < chapter.levels.length; li++) {
      content.appendChild(this._buildLevelRow(campaign, this._activeChapterIdx, li, isOfficial));
    }

    if (chapter.levels.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#777;font-size:0.85rem;';
      empty.textContent = 'No levels yet – click "Add Level" to get started.';
      content.appendChild(empty);
    }

    this._el.appendChild(content);
  }

  private _buildLevelRow(
    campaign: CampaignDef,
    chapterIdx: number,
    levelIdx: number,
    readOnly: boolean,
  ): HTMLElement {
    const chapter = campaign.chapters[chapterIdx];
    const level = chapter.levels[levelIdx];
    const { row, info, btns } = this._buildItemRow('#2a3a5e', '12px 16px', '6px');

    const name = document.createElement('div');
    name.style.cssText = 'font-size:0.95rem;font-weight:bold;';
    const starSuffix = (level.starCount ?? 0) > 0 ? ` ⭐×${level.starCount}` : '';
    name.textContent = `Level ${levelIdx + 1}: ${level.name}${level.challenge ? ' 💀' : ''}${starSuffix}`;
    const minimap = renderMinimap(level);
    minimap.style.cssText = 'display:block;margin-top:4px;image-rendering:pixelated;cursor:pointer;';
    minimap.addEventListener('click', () => {
      this._activeLevelIdx = levelIdx;
      this._openLevelEditor(level, readOnly);
    });
    info.appendChild(name);
    info.appendChild(minimap);

    const editOrViewLabel = readOnly ? '👁 View' : '✏️ Edit';
    btns.appendChild(this._btn(editOrViewLabel, '#16213e', '#f0c040', () => {
      this._activeLevelIdx = levelIdx;
      this._openLevelEditor(level, readOnly);
    }));

    if (!readOnly) {
      btns.appendChild(this._btn('📋 Duplicate', '#16213e', '#aaa', () => {
        const copy: LevelDef = {
          ...JSON.parse(JSON.stringify(level)) as LevelDef,
          id: generateLevelId(),
          name: level.name + ' (copy)',
        };
        chapter.levels.splice(levelIdx + 1, 0, copy);
        this._touchCampaign(campaign);
        this._saveCampaigns();
        this._showChapterDetail();
      }));

      this._appendReorderButtons(btns, chapter.levels, levelIdx, campaign, () => this._showChapterDetail());
      btns.appendChild(this._btn('🗑', '#16213e', '#e74c3c', () => {
        if (confirm(`Delete level "${level.name}"?`)) {
          chapter.levels.splice(levelIdx, 1);
          this._touchCampaign(campaign);
          this._saveCampaigns();
          this._showChapterDetail();
        }
      }));

      if (campaign.chapters.length > 1) {
        const sel = document.createElement('select');
        sel.style.cssText =
          'background:#16213e;color:#aaa;border:1px solid #4a90d9;' +
          'border-radius:6px;padding:6px 8px;font-size:0.85rem;cursor:pointer;';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '↪ Move to…';
        placeholder.disabled = true;
        placeholder.selected = true;
        sel.appendChild(placeholder);
        campaign.chapters.forEach((ch, ci) => {
          if (ci !== chapterIdx) {
            const opt = document.createElement('option');
            opt.value = String(ci);
            opt.textContent = `Ch ${ci + 1}: ${ch.name}`;
            sel.appendChild(opt);
          }
        });
        sel.addEventListener('change', () => {
          const targetIdx = parseInt(sel.value, 10);
          if (isNaN(targetIdx)) return;
          const [movedLevel] = chapter.levels.splice(levelIdx, 1);
          if (movedLevel === undefined) return;
          campaign.chapters[targetIdx].levels.push(movedLevel);
          this._touchCampaign(campaign);
          this._saveCampaigns();
          this._showChapterDetail();
        });
        btns.appendChild(sel);
      }
    }

    return row;
  }

  // ─── Screen: Level editor ─────────────────────────────────────────────────

  private _openLevelEditor(level: LevelDef, readOnly: boolean): void {
    this._editLevelName = level.name;
    this._editLevelNote = level.note ?? '';
    this._editLevelHints = level.hints?.length ? [...level.hints] : [''];
    this._editLevelChallenge = level.challenge ?? false;
    this._editRows = level.rows;
    this._editCols = level.cols;
    this._editGrid = JSON.parse(JSON.stringify(level.grid)) as (TileDef | null)[][];
    this._editInventory = JSON.parse(JSON.stringify(level.inventory)) as InventoryItem[];
    this._editorPalette = PipeShape.Source;
    this._editorParams = { ...DEFAULT_PARAMS };
    this._editorHistory = [];
    this._editorHistoryIdx = -1;
    this._editorHover = null;
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
    this._editorUnsavedChanges = false;
    this._editorSavedHistoryIdx = 0;
    this._recordEditorSnapshot();
    this._showLevelEditor(readOnly);
  }

  private _showLevelEditor(readOnly: boolean): void {
    this._screen = EditorScreen.LevelEditor;
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const chapter = campaign.chapters[this._activeChapterIdx];
    if (!chapter) { this._showCampaignDetail(); return; }

    const toolbar = this._buildToolbar(
      readOnly ? `👁 View Level: ${this._editLevelName}` : `✏️ Level Editor`,
      () => {
        if (!readOnly && this._editorUnsavedChanges) {
          this._showUnsavedModal(
            () => {
              this._saveLevel(campaign, this._activeChapterIdx, this._activeLevelIdx);
              this._showChapterDetail();
            },
            () => this._showChapterDetail(),
          );
        } else {
          this._showChapterDetail();
        }
      },
    );
    this._addLevelEditorToolbarActions(toolbar, readOnly, campaign);
    this._el.appendChild(toolbar);

    // ── Main editor layout ─────────────────────────────────────────────────
    const mainLayout = document.createElement('div');
    mainLayout.style.cssText =
      `width:100%;max-width:1200px;padding:${EDITOR_LAYOUT_PADDING}px;box-sizing:border-box;display:flex;` +
      `gap:${EDITOR_LAYOUT_GAP}px;align-items:flex-start;flex-wrap:nowrap;justify-content:flex-start;`;

    // ── Left column: palette ───────────────────────────────────────────────
    const leftCol = document.createElement('div');
    leftCol.style.cssText =
      'display:flex;flex-direction:column;gap:12px;min-width:220px;';

    if (!readOnly) {
      leftCol.appendChild(this._buildPalette());
    }

    // ── Middle column: canvas + metadata ──────────────────────────────────
    const midCol = this._buildLevelEditorMidCol(readOnly);

    // ── Right column: inventory editor, tile params, grid size ────────────
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:180px;';

    if (!readOnly) {
      rightCol.appendChild(this._buildInventoryEditor());
      rightCol.appendChild(this._buildParamPanel());
      rightCol.appendChild(this._buildGridSizePanel());
    } else {
      rightCol.appendChild(this._buildInventoryReadonly());
    }

    this._editorMainLayout = mainLayout;
    mainLayout.appendChild(leftCol);
    // Wrap the canvas column and the right column together so the inventory/
    // grid-size panel always sits to the right of the canvas regardless of
    // how the outer layout wraps relative to the palette column.
    const midRightWrapper = document.createElement('div');
    midRightWrapper.style.cssText =
      `display:flex;flex-wrap:nowrap;gap:${EDITOR_LAYOUT_GAP}px;align-items:flex-start;`;
    midRightWrapper.appendChild(midCol);
    midRightWrapper.appendChild(rightCol);
    mainLayout.appendChild(midRightWrapper);
    this._el.appendChild(mainLayout);

    // Re-compute canvas display size now that the layout is in the DOM, so the
    // board can fill any available horizontal space.
    this._updateCanvasDisplaySize();

    // Initial render
    this._renderEditorCanvas();
    this._updateEditorUndoRedoButtons();
  }

  /**
   * Append the level-editor action buttons (undo, redo, validate, playtest,
   * save) to `toolbar`.  Called only in edit mode; a no-op when `readOnly`.
   */
  private _addLevelEditorToolbarActions(
    toolbar: HTMLElement,
    readOnly: boolean,
    campaign: CampaignDef,
  ): void {
    if (readOnly) return;

    // Undo/redo
    const undoBtn = this._btn('↩ Undo', '#2a2a4a', '#aaa', () => this._editorUndo());
    undoBtn.id = 'editor-undo-btn';
    toolbar.appendChild(undoBtn);
    const redoBtn = this._btn('↪ Redo', '#2a2a4a', '#aaa', () => this._editorRedo());
    redoBtn.id = 'editor-redo-btn';
    toolbar.appendChild(redoBtn);

    // Validate
    toolbar.appendChild(this._btn('✔ Validate', '#16213e', '#7ed321', () => {
      const result = this._validateLevel();
      const icon = result.ok ? '✅' : '❌';
      alert(`${icon} Validation\n\n${result.messages.join('\n')}`);
    }));

    // Playtest
    toolbar.appendChild(this._btn('▶ Playtest', '#16213e', '#f0c040', () => {
      const result = this._validateLevel();
      if (!result.ok) {
        alert(`❌ Validation\n\n${result.messages.join('\n')}`);
        return;
      }
      this._saveLevel(campaign, this._activeChapterIdx, this._activeLevelIdx);
      const chapter = campaign.chapters[this._activeChapterIdx];
      const level = chapter?.levels[this._activeLevelIdx];
      if (!level) return;
      this._onPlaytest(level);
    }));

    // Save
    const saveBtn = this._btn('💾 Save', '#27ae60', '#fff', () => {
      this._saveLevel(campaign, this._activeChapterIdx, this._activeLevelIdx);
    });
    saveBtn.id = 'editor-save-btn';
    toolbar.appendChild(saveBtn);
  }

  /**
   * Build the middle column for the level editor: canvas + level-name field
   * + note/hint/challenge metadata below the canvas.  Populates
   * `_editorCanvas`, `_editorCtx`, and `_editorSourceErrorEl` as side
   * effects.
   */
  private _buildLevelEditorMidCol(readOnly: boolean): HTMLElement {
    const midCol = document.createElement('div');
    midCol.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    midCol.appendChild(this._buildLevelNameSection(readOnly));
    midCol.appendChild(this._buildEditorCanvasSection(readOnly));
    if (!readOnly) {
      midCol.appendChild(this._buildLevelTextFieldsSection());
    } else {
      midCol.appendChild(this._buildReadOnlyMetaSection());
    }
    return midCol;
  }

  /** Build the level-name row: an editable input in edit mode, or a styled label in read-only mode. */
  private _buildLevelNameSection(readOnly: boolean): HTMLElement {
    if (!readOnly) {
      const nameWrap = document.createElement('div');
      nameWrap.style.cssText = EDITOR_FLEX_ROW_CSS;
      const nameLbl = document.createElement('label');
      nameLbl.textContent = 'Level Name:';
      nameLbl.style.cssText = 'font-size:0.85rem;color:#aaa;';
      const nameInp = document.createElement('input');
      nameInp.type = 'text';
      nameInp.value = this._editLevelName;
      nameInp.style.cssText =
        'padding:6px 10px;font-size:0.9rem;background:#0d1a30;color:#eee;' +
        'border:1px solid #4a90d9;border-radius:4px;flex:1;';
      nameInp.addEventListener('input', () => { this._editLevelName = nameInp.value; });
      nameWrap.appendChild(nameLbl);
      nameWrap.appendChild(nameInp);
      return nameWrap;
    } else {
      const lvlNameEl = document.createElement('div');
      lvlNameEl.style.cssText = 'font-size:1rem;font-weight:bold;color:#f0c040;';
      lvlNameEl.textContent = this._editLevelName;
      return lvlNameEl;
    }
  }

  /**
   * Build the editor canvas element and (in edit mode) attach mouse event
   * listeners and a source-placement error div.  Sets `_editorCanvas`,
   * `_editorCtx`, and `_editorSourceErrorEl` as side effects.
   */
  private _buildEditorCanvasSection(readOnly: boolean): HTMLElement {
    const canvas = document.createElement('canvas');
    setTileSize(computeTileSize(this._editRows, this._editCols));
    canvas.width  = this._editCols * TILE_SIZE;
    canvas.height = this._editRows * TILE_SIZE;
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:4px;cursor:` + (readOnly ? 'default' : 'crosshair') + ';' +
      'display:block;';
    this._editorCanvas = canvas;
    this._updateCanvasDisplaySize();
    const ctx = canvas.getContext('2d');
    if (ctx) this._editorCtx = ctx;

    if (!readOnly) {
      canvas.addEventListener('mousedown',   (e) => this._onEditorMouseDown(e));
      canvas.addEventListener('mousemove',   (e) => this._onEditorCanvasMouseMove(e));
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this._suppressNextContextMenu) {
          this._suppressNextContextMenu = false;
          return;
        }
        this._onEditorCanvasRightClick(e);
      });
      canvas.addEventListener('mouseleave',  () => {
        this._editorHover = null;
        // Cancel any active drag when the mouse leaves the canvas.
        if (this._dragState) {
          this._dragState = null;
        }
        if (this._paintDragActive) {
          this._paintDragActive = false;
          this._recordEditorSnapshot();
        }
        if (this._rightEraseDragActive) {
          this._rightEraseDragActive = false;
          this._recordEditorSnapshot();
        }
        this._renderEditorCanvas();
      });
      canvas.addEventListener('wheel', (e) => this._onEditorCanvasWheel(e), { passive: false });
      // Listen on window so mouseup is captured even when released outside the canvas.
      // Remove any previous handler to avoid duplicates when the level editor is re-opened.
      if (this._windowMouseUpHandler) {
        window.removeEventListener('mouseup', this._windowMouseUpHandler);
      }
      this._windowMouseUpHandler = (e: MouseEvent) => this._onEditorMouseUp(e);
      window.addEventListener('mouseup', this._windowMouseUpHandler);
    }

    if (!readOnly) {
      // Wrap canvas + error div in a container element
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
      wrap.appendChild(canvas);
      const sourceErrorDiv = document.createElement('div');
      sourceErrorDiv.style.cssText = 'font-size:0.85rem;color:#f44;display:none;font-weight:bold;';
      this._editorSourceErrorEl = sourceErrorDiv;
      wrap.appendChild(sourceErrorDiv);
      return wrap;
    }
    return canvas;
  }

  /**
   * Build the note, hints, and challenge-flag fields for edit mode
   * (displayed below the editor canvas).
   */
  private _buildLevelTextFieldsSection(): HTMLElement {
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
    noteInp.value = this._editLevelNote;
    noteInp.placeholder = 'Optional – displayed in a box below the puzzle grid.';
    noteInp.style.cssText = textareaStyle;
    noteInp.addEventListener('input', () => { this._editLevelNote = noteInp.value; });
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
      this._editLevelHints.forEach((hint, idx) => {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;gap:4px;align-items:flex-start;';
        const inp = document.createElement('textarea');
        inp.value = hint;
        inp.placeholder = idx === 0
          ? 'Hint 1 – hidden until the player clicks "Show Hint".'
          : `Hint ${idx + 1} – revealed after expanding the previous hint.`;
        inp.style.cssText = textareaStyle + 'border-color:#f0c040;flex:1;';
        inp.addEventListener('input', () => { this._editLevelHints[idx] = inp.value; });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove this hint';
        removeBtn.style.cssText =
          'padding:4px 7px;font-size:0.8rem;background:#2c1a00;color:#f0c040;' +
          'border:1px solid #f0c040;border-radius:4px;cursor:pointer;flex-shrink:0;';
        removeBtn.addEventListener('click', () => {
          this._editLevelHints.splice(idx, 1);
          if (this._editLevelHints.length === 0) this._editLevelHints = [''];
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
      this._editLevelHints.push('');
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
    challengeChk.checked = this._editLevelChallenge;
    challengeChk.addEventListener('change', () => { this._editLevelChallenge = challengeChk.checked; });
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
  private _buildReadOnlyMetaSection(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    if (this._editLevelNote) {
      container.appendChild(this._createInfoBox('#4a90d9', `📝 ${this._editLevelNote}`));
    }
    const activeHints = this._editLevelHints.filter(h => h.trim());
    if (activeHints.length > 0) {
      container.appendChild(this._createInfoBox('#f0c040', `💡 ${activeHints.join(' → ')}`));
    }
    if (this._editLevelChallenge) {
      container.appendChild(this._createInfoBox('#e74c3c', '💀 Challenge level'));
    }
    return container;
  }


  // ─── Palette panel ────────────────────────────────────────────────────────

  private readonly _PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.Source,   label: '💧 Source' },
    { palette: PipeShape.Sink,     label: '🏁 Sink' },
  ];

  private readonly _PIPES_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.Straight,     label: '━ Straight' },
    { palette: PipeShape.Elbow,        label: '┗ Elbow' },
    { palette: PipeShape.Tee,          label: '┣ Tee' },
    { palette: PipeShape.Cross,        label: '╋ Cross' },
    { palette: PipeShape.SpinStraight, label: '↻ Spin Straight' },
    { palette: PipeShape.SpinElbow,    label: '↻ Spin Elbow' },
    { palette: PipeShape.SpinTee,      label: '↻ Spin Tee' },
  ];

  private readonly _CHAMBER_PALETTE_ITEMS: Array<{ palette: ChamberPalette; label: string }> = [
    { palette: 'chamber:tank',     label: '💧 Tank' },
    { palette: 'chamber:dirt',     label: '🟫 Dirt' },
    { palette: 'chamber:item',     label: '🎁 Item' },
    { palette: 'chamber:heater',   label: '🔥 Heater / Cooler' },
    { palette: 'chamber:ice',      label: '🧊 Ice' },
    { palette: 'chamber:pump',     label: '⬆ Pump / Vacuum' },
    { palette: 'chamber:snow',      label: '❄ Snow' },
    { palette: 'chamber:sandstone', label: '🪨 Sandstone' },
    { palette: 'chamber:star',      label: '⭐ Star' },
    { palette: 'chamber:hot_plate', label: '🌡 Hot Plate' },
  ];

  private readonly _GOLD_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.GoldStraight, label: '━ Gold Straight' },
    { palette: PipeShape.GoldElbow,    label: '┗ Gold Elbow' },
    { palette: PipeShape.GoldTee,      label: '┣ Gold Tee' },
    { palette: PipeShape.GoldCross,    label: '╋ Gold Cross' },
  ];

  private readonly _LEAKY_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.LeakyStraight, label: '━ Leaky Straight' },
    { palette: PipeShape.LeakyElbow,    label: '┗ Leaky Elbow' },
    { palette: PipeShape.LeakyTee,      label: '┣ Leaky Tee' },
    { palette: PipeShape.LeakyCross,    label: '╋ Leaky Cross' },
  ];

  private readonly _FLOOR_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.Granite,   label: '▪ Granite' },
    { palette: PipeShape.Tree,      label: '🌿 Tree' },
    { palette: PipeShape.Cement,    label: '🪧 Cement' },
    { palette: PipeShape.GoldSpace, label: '✦ Gold Space' },
    { palette: PipeShape.OneWay,    label: '→ One-Way' },
  ];

  /**
   * Build a collapsible section toggle button plus its items and append both to
   * `parent`.  The toggle button uses the supplied `borderColor`/`bgColor`/`textColor`
   * for its visual style.  When expanded, each item is added via `makeItemBtn`.
   */
  private _buildCollapsibleSection(
    parent: HTMLElement,
    label: string,
    expanded: boolean,
    onToggle: () => void,
    borderColor: string,
    bgColor: string,
    textColor: string,
    items: { palette: EditorPalette; label: string }[],
    makeItemBtn: (item: { palette: EditorPalette; label: string }, indent?: boolean) => HTMLButtonElement,
  ): void {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = (expanded ? '▾' : '▸') + ' ' + label;
    toggle.style.cssText =
      'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
      `border:1px solid ${borderColor};background:${bgColor};color:${textColor};font-weight:bold;margin-top:2px;`;
    toggle.addEventListener('click', onToggle);
    parent.appendChild(toggle);

    if (expanded) {
      for (const item of items) {
        parent.appendChild(makeItemBtn(item, true));
      }
    }
  }

  private _buildPalette(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'editor-palette-panel';
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'TILE PALETTE';
    panel.appendChild(title);

    const isGoldSelected = this._GOLD_PALETTE_ITEMS.some(i => i.palette === this._editorPalette);
    const isLeakySelected = this._LEAKY_PALETTE_ITEMS.some(i => i.palette === this._editorPalette);
    const isFloorSelected = this._FLOOR_PALETTE_ITEMS.some(i => i.palette === this._editorPalette);
    // Auto-expand the gold section if a gold item is currently selected
    if (isGoldSelected) this._goldSectionExpanded = true;
    // Auto-expand the leaky section if a leaky item is currently selected
    if (isLeakySelected) this._leakySectionExpanded = true;
    // Auto-expand the floor section if a floor item is currently selected
    if (isFloorSelected) this._floorSectionExpanded = true;
    // Auto-expand the chamber section if a chamber item is currently selected
    if (isChamberPalette(this._editorPalette)) this._chamberSectionExpanded = true;
    // Auto-expand the pipes section if a pipe item is currently selected
    if (this._PIPES_PALETTE_ITEMS.some(i => i.palette === this._editorPalette)) this._pipesSectionExpanded = true;

    const makeItemBtn = (item: { palette: EditorPalette; label: string }, indent = false): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.dataset['palette'] = String(item.palette);
      const isSelected = this._editorPalette === item.palette;
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        (indent ? 'margin-left:12px;' : '') +
        'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
        'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
        'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';

      btn.addEventListener('click', () => {
        this._editorPalette = item.palette;
        this._linkedTilePos = null;
        this._linkedTileDirty = false;
        if (isChamberPalette(item.palette)) {
          this._editorParams.chamberContent = chamberPaletteContent(item.palette);
        }
        const newPanel = this._buildPalette();
        panel.replaceWith(newPanel);
        const paramPanel = document.getElementById('editor-param-panel');
        if (paramPanel) {
          const newParam = this._buildParamPanel();
          newParam.id = 'editor-param-panel';
          paramPanel.replaceWith(newParam);
        }
        this._renderEditorCanvas();
      });
      return btn;
    };

    for (const item of this._PALETTE_ITEMS) {
      panel.appendChild(makeItemBtn(item));
    }

    // Collapsible sections: Floor, Pipes, Gold, Leaky, Blocks (chambers)
    this._buildCollapsibleSection(
      panel, 'Floor', this._floorSectionExpanded,
      () => { this._floorSectionExpanded = !this._floorSectionExpanded; panel.replaceWith(this._buildPalette()); },
      '#888', '#1a1a1a', '#ccc', this._FLOOR_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Pipes', this._pipesSectionExpanded,
      () => { this._pipesSectionExpanded = !this._pipesSectionExpanded; panel.replaceWith(this._buildPalette()); },
      '#4a90d9', '#0a1520', '#4a90d9', this._PIPES_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Gold', this._goldSectionExpanded,
      () => { this._goldSectionExpanded = !this._goldSectionExpanded; panel.replaceWith(this._buildPalette()); },
      '#b8860b', '#1a1400', '#ffd700', this._GOLD_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Leaky', this._leakySectionExpanded,
      () => { this._leakySectionExpanded = !this._leakySectionExpanded; panel.replaceWith(this._buildPalette()); },
      '#7a2c10', '#1a0c08', '#b07840', this._LEAKY_PALETTE_ITEMS, makeItemBtn,
    );
    this._buildCollapsibleSection(
      panel, 'Blocks', this._chamberSectionExpanded,
      () => { this._chamberSectionExpanded = !this._chamberSectionExpanded; panel.replaceWith(this._buildPalette()); },
      '#74b9ff', '#0a1520', '#74b9ff', this._CHAMBER_PALETTE_ITEMS, makeItemBtn,
    );

    // Erase at the end of the palette
    panel.appendChild(makeItemBtn({ palette: 'erase', label: '🗑 Erase (→ Empty)' }));

    return panel;
  }

  // ─── Tile parameter panel ─────────────────────────────────────────────────

  private _buildParamPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'editor-param-panel';
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:8px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS;
    title.textContent = 'TILE PARAMS';
    panel.appendChild(title);

    const p = this._editorPalette;
    const isChm = isChamberPalette(p);
    if (p === 'erase' || p === PipeShape.Granite || p === PipeShape.Tree || p === PipeShape.GoldSpace ||
        p === PipeShape.OneWay || PIPE_SHAPES.has(p as PipeShape)) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = 'No parameters';
      panel.appendChild(none);
      return panel;
    }

    // Cement: show only Drying Time input (no rotation)
    if (p === PipeShape.Cement) {
      panel.appendChild(this._labeledInput('Drying Time', String(this._editorParams.dryingTime), (v) => {
        this._editorParams.dryingTime = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
      return panel;
    }

    // Source/Chamber(tank): capacity
    const cc = isChm ? chamberPaletteContent(p as ChamberPalette) : null;
    if (p === PipeShape.Source || cc === 'tank') {
      panel.appendChild(this._labeledInput('Capacity', String(this._editorParams.capacity), (v) => {
        this._editorParams.capacity = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }

    // Source: temperature and pressure
    if (p === PipeShape.Source) {
      panel.appendChild(this._labeledInput('Base Temp', String(this._editorParams.temperature), (v) => {
        this._editorParams.temperature = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
      panel.appendChild(this._labeledInput('Base Pressure', String(this._editorParams.pressure), (v) => {
        this._editorParams.pressure = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }

    // Chamber: content type selector + content-specific param inputs
    if (p === PipeShape.Chamber) {
      panel.appendChild(this._buildChamberContentSelector(panel));
    }
    if (isChm) {
      this._buildChamberContentParams(panel, chamberPaletteContent(p as ChamberPalette));
    }

    // Connections (Source, Sink, Chamber) – positional compass layout
    if (p === PipeShape.Source || p === PipeShape.Sink || isChm) {
      panel.appendChild(this._buildConnectionsWidget(panel));
    }

    return panel;
  }

  /**
   * Build the chamber content-type `<select>` element (shown only when the
   * palette selection is the generic Chamber tool, not a specific content type).
   * When the selection changes the param panel rebuilds itself.
   */
  private _buildChamberContentSelector(panel: HTMLElement): HTMLElement {
    const sel = document.createElement('select');
    sel.style.cssText =
      'padding:5px 8px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;flex:1;';
    const CHAMBER_DISPLAY_NAMES: Record<string, string> = {
      tank: 'Tank', dirt: 'Dirt', item: 'Item', heater: 'Heater',
      ice: 'Ice', pump: 'Pump', snow: 'Snow', sandstone: 'Sandstone', star: 'Star', hot_plate: 'Hot Plate',
    };
    for (const opt of ['tank', 'dirt', 'item', 'heater', 'ice', 'pump', 'snow', 'sandstone', 'star', 'hot_plate']) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = CHAMBER_DISPLAY_NAMES[opt] ?? opt;
      if (this._editorParams.chamberContent === opt) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      this._editorParams.chamberContent = sel.value as TileParams['chamberContent'];
      if ((TEMP_CHAMBER_CONTENTS as ReadonlySet<string>).has(sel.value)) {
        if (this._editorParams.temperature === 0) this._editorParams.temperature = 1;
      }
      this._applyParamsToLinkedTile();
      const newPanel = this._buildParamPanel();
      newPanel.id = 'editor-param-panel';
      panel.replaceWith(newPanel);
    });
    const selWrap = document.createElement('div');
    selWrap.style.cssText = EDITOR_FLEX_ROW_CSS;
    const selLbl = document.createElement('span');
    selLbl.style.cssText = 'font-size:0.78rem;color:#aaa;min-width:56px;';
    selLbl.textContent = 'Content:';
    selWrap.appendChild(selLbl);
    selWrap.appendChild(sel);
    return selWrap;
  }

  /**
   * Append content-type-specific parameter inputs for a Chamber tile to `parent`.
   * Called when the active palette is a `ChamberPalette` entry (not the generic
   * Chamber tool), so `cc` is always the concrete content type.
   */
  private _buildChamberContentParams(parent: HTMLElement, cc: ChamberContent): void {
    if (cc === 'dirt') {
      parent.appendChild(this._labeledInput('Mass', String(this._editorParams.cost), (v) => {
        this._editorParams.cost = parseInt(v) || 0;
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }
    if (cc === 'heater') {
      parent.appendChild(this._labeledInput('Temp', String(this._editorParams.temperature), (v) => {
        this._editorParams.temperature = parseInt(v) || 0;
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }
    if (COLD_CHAMBER_CONTENTS.has(cc)) {
      parent.appendChild(this._labeledInput('Temp °', String(this._editorParams.temperature), (v) => {
        this._editorParams.temperature = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
      parent.appendChild(this._labeledInput('Mass', String(this._editorParams.cost), (v) => {
        this._editorParams.cost = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }
    if (cc === 'sandstone') {
      parent.appendChild(this._labeledInput('Hardness', String(this._editorParams.hardness), (v) => {
        this._editorParams.hardness = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
      parent.appendChild(this._labeledInput('Shatter', String(this._editorParams.shatter), (v) => {
        this._editorParams.shatter = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }
    if (cc === 'pump') {
      parent.appendChild(this._labeledInput('Pressure', String(this._editorParams.pressure), (v) => {
        this._editorParams.pressure = parseInt(v) || 0;
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }
    if (cc === 'hot_plate') {
      parent.appendChild(this._labeledInput('Boiling °', String(this._editorParams.temperature), (v) => {
        this._editorParams.temperature = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
      parent.appendChild(this._labeledInput('Mass', String(this._editorParams.cost), (v) => {
        this._editorParams.cost = Math.max(0, parseInt(v) || 0);
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }
    if (cc === 'item') {
      parent.appendChild(this._buildItemShapeSelector());
      parent.appendChild(this._labeledInput('Count', String(this._editorParams.itemCount), (v) => {
        this._editorParams.itemCount = parseInt(v) || 1;
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }
  }

  /**
   * Build the item-shape `<select>` widget for Chamber-item tiles.
   * Extracted to keep {@link _buildChamberContentParams} focused.
   */
  private _buildItemShapeSelector(): HTMLElement {
    const itemSel = document.createElement('select');
    itemSel.style.cssText =
      'padding:5px 8px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
      'border:1px solid #4a90d9;border-radius:4px;flex:1;';
    for (const shp of [PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee, PipeShape.Cross,
                       PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross,
                       PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee, PipeShape.LeakyCross]) {
      const o = document.createElement('option');
      o.value = shp;
      o.textContent = shp;
      if (this._editorParams.itemShape === shp) o.selected = true;
      itemSel.appendChild(o);
    }
    itemSel.addEventListener('change', () => {
      this._editorParams.itemShape = itemSel.value as PipeShape;
      this._applyParamsToLinkedTile();
    });
    const itemSelWrap = document.createElement('div');
    itemSelWrap.style.cssText = EDITOR_FLEX_ROW_CSS;
    const itemLbl = document.createElement('span');
    itemLbl.style.cssText = 'font-size:0.78rem;color:#aaa;min-width:56px;';
    itemLbl.textContent = 'Shape:';
    itemSelWrap.appendChild(itemLbl);
    itemSelWrap.appendChild(itemSel);
    return itemSelWrap;
  }

  /**
   * Build the compass-layout connections widget for Source, Sink, and Chamber tiles.
   * Each direction button toggles the connection and rebuilds the param panel when clicked.
   * @param replaceTarget - The outer param panel element that connection-change rebuilds replace.
   */
  private _buildConnectionsWidget(replaceTarget: HTMLElement): HTMLElement {
    const connWrap = document.createElement('div');
    connWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const connLbl = document.createElement('div');
    connLbl.style.cssText = 'font-size:0.78rem;color:#aaa;';
    connLbl.textContent = 'Connections';
    connWrap.appendChild(connLbl);

    // Compass grid: [empty][N][empty] / [W][tile][E] / [empty][S][empty]
    const connGrid = document.createElement('div');
    connGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,28px);grid-template-rows:repeat(3,28px);gap:2px;';

    const makeConnBtn = (dir: keyof TileParams['connections']): HTMLButtonElement => {
      const active = this._editorParams.connections[dir];
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = dir;
      b.title = `Toggle ${dir} connection`;
      b.style.cssText =
        'width:28px;height:28px;font-size:0.75rem;display:flex;align-items:center;justify-content:center;' +
        'background:' + (active ? '#1a3a1a' : '#0d1a30') + ';' +
        'color:' + (active ? '#7ed321' : '#555') + ';' +
        'border:1px solid ' + (active ? '#7ed321' : '#4a90d9') + ';' +
        'border-radius:4px;cursor:pointer;padding:0;';
      b.addEventListener('click', () => {
        this._editorParams.connections[dir] = !this._editorParams.connections[dir];
        this._applyParamsToLinkedTile();
        const newPanel = this._buildParamPanel();
        newPanel.id = 'editor-param-panel';
        replaceTarget.replaceWith(newPanel);
      });
      return b;
    };

    // Row 1: [empty] [N] [empty]
    connGrid.appendChild(document.createElement('span'));
    connGrid.appendChild(makeConnBtn('N'));
    connGrid.appendChild(document.createElement('span'));
    // Row 2: [W] [tile preview] [E]
    connGrid.appendChild(makeConnBtn('W'));
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = TILE_SIZE;
    previewCanvas.height = TILE_SIZE;
    previewCanvas.style.cssText = 'width:28px;height:28px;border:1px solid #4a90d9;border-radius:4px;';
    const previewCtx = previewCanvas.getContext('2d');
    if (previewCtx) {
      drawEditorTile(previewCtx, 0, 0, this._buildTileDef(this._editorPalette));
    }
    connGrid.appendChild(previewCanvas);
    connGrid.appendChild(makeConnBtn('E'));
    // Row 3: [empty] [S] [empty]
    connGrid.appendChild(document.createElement('span'));
    connGrid.appendChild(makeConnBtn('S'));
    connGrid.appendChild(document.createElement('span'));

    connWrap.appendChild(connGrid);
    return connWrap;
  }

  // ─── Grid size panel ──────────────────────────────────────────────────────

  private _buildGridSizePanel(): HTMLElement {
    const panel = document.createElement('div');
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
    rowsInp.value = String(this._editRows);
    rowsInp.style.cssText = gridSizeInputStyle;
    const colsInp = document.createElement('input');
    colsInp.type = 'number';
    colsInp.min = String(GRID_MIN_DIM);
    colsInp.max = String(GRID_MAX_DIM);
    colsInp.value = String(this._editCols);
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
        rowsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(rVal) ? this._editRows : rVal)));
        outOfRange = true;
      }
      if (isNaN(cVal) || cVal < GRID_MIN_DIM || cVal > GRID_MAX_DIM) {
        colsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(cVal) ? this._editCols : cVal)));
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
      this._resizeGrid(rVal, cVal);
    }));

    // ── Slide buttons (N/E/S/W compass layout) ──
    const slideTitle = document.createElement('div');
    slideTitle.style.cssText = 'font-size:0.75rem;color:#aaa;margin-top:4px;';
    slideTitle.textContent = 'Slide tiles:';
    panel.appendChild(slideTitle);

    const compass = document.createElement('div');
    compass.style.cssText = 'display:grid;grid-template-columns:repeat(3,28px);grid-template-rows:repeat(3,28px);gap:2px;justify-self:start;';

    const arrowBtnStyle =
      'width:28px;height:28px;font-size:1rem;display:flex;align-items:center;justify-content:center;' +
      'background:#0d1a30;color:#7ed321;border:1px solid #4a90d9;border-radius:4px;cursor:pointer;padding:0;';

    const makeArrow = (icon: string, dir: 'N' | 'E' | 'S' | 'W'): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = icon;
      b.title = `Slide all tiles ${dir === 'N' ? 'North (up)' : dir === 'E' ? 'East (right)' : dir === 'S' ? 'South (down)' : 'West (left)'}`;
      b.style.cssText = arrowBtnStyle;
      b.addEventListener('click', () => this._slideGrid(dir));
      return b;
    };

    // Row 1: [empty] [↑] [empty]
    compass.appendChild(document.createElement('span')); // placeholder
    compass.appendChild(makeArrow('↑', 'N'));
    compass.appendChild(document.createElement('span')); // placeholder
    // Row 2: [←] [empty] [→]
    compass.appendChild(makeArrow('←', 'W'));
    compass.appendChild(document.createElement('span')); // center placeholder
    compass.appendChild(makeArrow('→', 'E'));
    // Row 3: [empty] [↓] [empty]
    compass.appendChild(document.createElement('span')); // placeholder
    compass.appendChild(makeArrow('↓', 'S'));
    compass.appendChild(document.createElement('span')); // placeholder

    panel.appendChild(compass);

    return panel;
  }

  // ─── Inventory editor panel ───────────────────────────────────────────────

  private _buildInventoryEditor(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'editor-inventory-panel';
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:6px;min-width:180px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'PLAYER INVENTORY';
    panel.appendChild(title);

    for (let i = 0; i < this._editInventory.length; i++) {
      const item = this._editInventory[i];
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
      const existing = this._editInventory.find((it) => it.shape === shp);
      if (existing) {
        existing.count++;
      } else {
        this._editInventory.push({ shape: shp, count: 1 });
      }
      this._recordEditorSnapshot();
      const newPanel = this._buildInventoryEditor();
      panel.replaceWith(newPanel);
    }));
    panel.appendChild(addRow);

    return panel;
  }

  private _buildInventoryItemRow(idx: number, item: InventoryItem): HTMLElement {
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
      this._editInventory[idx].count = Math.max(0, parseInt(countInp.value) || 0);
      this._recordEditorSnapshot();
    });
    row.appendChild(countInp);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '✕';
    delBtn.style.cssText =
      'padding:2px 6px;font-size:0.75rem;background:#2a2a4a;color:#e74c3c;' +
      'border:1px solid #e74c3c;border-radius:3px;cursor:pointer;';
    delBtn.addEventListener('click', () => {
      this._editInventory.splice(idx, 1);
      this._recordEditorSnapshot();
      const panel = document.getElementById('editor-inventory-panel');
      if (panel) panel.replaceWith(this._buildInventoryEditor());
    });
    row.appendChild(delBtn);
    return row;
  }

  private _buildInventoryReadonly(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText =
      EDITOR_PANEL_BASE_CSS + 'display:flex;flex-direction:column;gap:6px;min-width:180px;';

    const title = document.createElement('div');
    title.style.cssText = EDITOR_PANEL_TITLE_CSS + 'margin-bottom:4px;';
    title.textContent = 'PLAYER INVENTORY';
    panel.appendChild(title);

    if (this._editInventory.length === 0) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = 'None';
      panel.appendChild(none);
    }
    for (const item of this._editInventory) {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:0.85rem;color:#eee;';
      row.textContent = `${item.shape} ×${item.count}`;
      panel.appendChild(row);
    }
    return panel;
  }

  // ─── Editor canvas rendering ──────────────────────────────────────────────

  private _renderEditorCanvas(): void {
    const ctx = this._editorCtx;
    if (!ctx) return;

    let overlay: HoverOverlay | null = null;
    let drag: DragState | null = null;

    if (this._dragState) {
      // Show the dragged tile at its current position
      drag = {
        fromPos: this._dragState.startPos,
        toPos: this._dragState.currentPos,
        tile: this._dragState.tile,
      };
    } else if (this._editorHover) {
      if (this._editorPalette === 'erase') {
        const isEmptyCell = (this._editGrid[this._editorHover.row]?.[this._editorHover.col] ?? null) === null;
        overlay = { pos: this._editorHover, def: null, alpha: isEmptyCell ? 0.2 : 1 };
      } else {
        // Placement preview: transparent tile at hover
        overlay = { pos: this._editorHover, def: this._buildTileDef(this._editorPalette), alpha: 0.55 };
      }
    }

    renderEditorCanvas(ctx, this._editGrid, this._editRows, this._editCols, overlay, drag, this._linkedTilePos);
  }

  // ─── Editor canvas mouse events ────────────────────────────────────────────

  /**
   * Returns true if a Source tile already exists anywhere on the grid except
   * at `exceptPos` (if given).  Used to enforce the one-Source constraint.
   */
  private _hasSourceElsewhere(exceptPos?: { row: number; col: number }): boolean {
    for (let r = 0; r < this._editRows; r++) {
      for (let c = 0; c < this._editCols; c++) {
        if (exceptPos && r === exceptPos.row && c === exceptPos.col) continue;
        if (this._editGrid[r]?.[c]?.shape === PipeShape.Source) return true;
      }
    }
    return false;
  }

  /** Flashes an error message below the canvas when the Source placement constraint is violated. */
  private _showSourceError(): void {
    const el = this._editorSourceErrorEl;
    if (!el) return;
    el.textContent = 'Only one source tile is allowed.';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2000);
  }

  /**
   * Places the current palette tile on the given grid cell.
   */
  private _paintEditorCell(pos: { row: number; col: number }): void {
    this._editGrid[pos.row][pos.col] = this._buildTileDef(this._editorPalette);
    // Only link tiles that have parameters beyond rotation (Source, Sink, Chamber).
    if (this._paletteHasNonRotationParams(this._editorPalette)) {
      this._linkedTilePos = pos;
      this._linkedTileDirty = false;
    }
  }

  private _onEditorMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      const pos = this._canvasPos(e);
      if (!pos) return;
      // Start a right-button erase-drag: erase the first cell immediately.
      this._rightEraseDragActive = true;
      this._suppressNextContextMenu = false;
      if (this._editGrid[pos.row][pos.col] !== null) {
        this._editGrid[pos.row][pos.col] = null;
        this._clearLinkAt(pos);
        this._renderEditorCanvas();
      }
      return;
    }
    if (e.button !== 0) return; // left button only
    const pos = this._canvasPos(e);
    if (!pos) return;

    const existingTile = this._editGrid[pos.row][pos.col];

    // Repeatable tile on an empty cell: start a paint-drag session.
    if (existingTile === null && REPEATABLE_EDITOR_TILES.has(this._editorPalette)) {
      this._paintDragActive = true;
      this._paintEditorCell(pos);
      this._renderEditorCanvas();
      return;
    }

    if (existingTile !== null && this._editorPalette !== 'erase') {
      // Start a drag: track the tile but don't modify the grid yet
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._renderEditorCanvas();
    } else {
      // Guard: only one Source tile is allowed per level.
      if (this._editorPalette === PipeShape.Source && this._hasSourceElsewhere()) {
        this._showSourceError();
        return;
      }
      // Paint / erase immediately; snapshot recorded after the change so that
      // the placed/erased tile is captured in the new history entry.
      if (this._editorPalette === 'erase') {
        this._editGrid[pos.row][pos.col] = null;
        // Clear the link if the erased tile was linked
        this._clearLinkAt(pos);
      } else {
        this._editGrid[pos.row][pos.col] = this._buildTileDef(this._editorPalette);
        // Only link the newly placed tile for live param editing if it has
        // parameters beyond rotation (Source, Sink, Chamber).
        if (this._paletteHasNonRotationParams(this._editorPalette)) {
          this._linkedTilePos = pos;
          this._linkedTileDirty = false;
        }
      }
      this._recordEditorSnapshot();
      this._renderEditorCanvas();
    }
  }

  private _onEditorMouseUp(e: MouseEvent): void {
    if (e.button === 2) {
      if (!this._rightEraseDragActive) return;
      // End right-erase-drag: record the undo snapshot now (PR #101 pattern).
      this._rightEraseDragActive = false;
      this._suppressNextContextMenu = true;
      this._recordEditorSnapshot();
      this._renderEditorCanvas();
      return;
    }
    if (e.button !== 0) return; // left button only

    // End paint-drag session.
    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._recordEditorSnapshot();
      this._renderEditorCanvas();
      return;
    }

    if (!this._dragState) return;

    const { startPos, tile, currentPos, moved } = this._dragState;
    this._dragState = null;

    if (moved) {
      // Commit the drag: move tile from startPos to currentPos; snapshot after.
      this._editGrid[startPos.row][startPos.col] = null;
      this._editGrid[currentPos.row][currentPos.col] = tile;
      // Only link the moved tile if it has parameters beyond rotation.
      if (tile.shape === PipeShape.Source || tile.shape === PipeShape.Sink || tile.shape === PipeShape.Chamber) {
        this._linkedTilePos = currentPos;
        this._linkedTileDirty = false;
      }
      this._recordEditorSnapshot();
    } else {
      // It was a click on a non-empty tile (no movement occurred)
      if (e.ctrlKey) {
        // Guard: only one Source tile is allowed per level.
        if (this._editorPalette === PipeShape.Source && this._hasSourceElsewhere(startPos)) {
          this._showSourceError();
          return;
        }
        // Ctrl+click: force-overwrite; snapshot recorded after the change.
        if (this._editorPalette === 'erase') {
          this._editGrid[startPos.row][startPos.col] = null;
          // Clear the link if the erased tile was linked
          this._clearLinkAt(startPos);
        } else {
          this._editGrid[startPos.row][startPos.col] = this._buildTileDef(this._editorPalette);
          // Only link the overwritten tile if it has parameters beyond rotation.
          if (this._paletteHasNonRotationParams(this._editorPalette)) {
            this._linkedTilePos = startPos;
            this._linkedTileDirty = false;
          }
        }
        this._recordEditorSnapshot();
      } else if (
        this._editorPalette !== 'erase' &&
        PIPE_SHAPES.has(this._editorPalette as PipeShape) &&
        PIPE_SHAPES.has(tile.shape)
      ) {
        // Both palette and tile are pipe shapes: auto-replace; snapshot after.
        this._editGrid[startPos.row][startPos.col] = this._buildTileDef(this._editorPalette);
        // Only link if the new tile has parameters beyond rotation.
        if (this._paletteHasNonRotationParams(this._editorPalette)) {
          this._linkedTilePos = startPos;
          this._linkedTileDirty = false;
        }
        this._recordEditorSnapshot();
      } else {
        // Select the clicked tile in the palette and populate Tile Params
        this._selectTileFromDef(tile, startPos);
      }
    }
    this._renderEditorCanvas();
  }

  private _onEditorCanvasRightClick(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    this._recordEditorSnapshot();
    this._editGrid[pos.row][pos.col] = null;
    // Clear the link if the erased tile was linked
    this._clearLinkAt(pos);
    this._renderEditorCanvas();
  }

  private _onEditorCanvasMouseMove(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    this._editorHover = pos;

    if (this._paintDragActive && pos) {
      // Paint each new empty cell the cursor enters during a paint-drag.
      if (this._editGrid[pos.row][pos.col] === null) {
        this._paintEditorCell(pos);
      }
    } else if (this._rightEraseDragActive && pos) {
      // Erase each non-empty cell the cursor enters during a right-erase-drag.
      if (this._editGrid[pos.row][pos.col] !== null) {
        this._editGrid[pos.row][pos.col] = null;
        this._clearLinkAt(pos);
      }
    } else if (this._dragState && pos) {
      const { startPos, currentPos } = this._dragState;
      const atCurrent = pos.row === currentPos.row && pos.col === currentPos.col;
      if (!atCurrent) {
        if (pos.row === startPos.row && pos.col === startPos.col) {
          // Moved back to start: cancel the move
          this._dragState.currentPos = pos;
          this._dragState.moved = false;
        } else if (this._editGrid[pos.row][pos.col] === null) {
          // Empty cell: move tile here
          this._dragState.currentPos = pos;
          this._dragState.moved = true;
        }
        // Non-empty cell (other than start): tile stays at currentPos
      }
    }

    this._renderEditorCanvas();
  }

  // ─── Mouse wheel: rotate tile or connections ──────────────────────────────

  /**
   * Rotate the currently selected palette item clockwise or counter-clockwise.
   * Updates pending-placement params and, if a tile is linked, applies the change.
   */
  private _rotateEditorPalette(clockwise: boolean): void {
    const p = this._editorPalette;
    if (p === 'erase' || p === PipeShape.GoldSpace || p === PipeShape.Granite || p === PipeShape.Tree || p === PipeShape.Empty) return;

    if (
      p === PipeShape.Source || p === PipeShape.Sink || isChamberPalette(p)
    ) {
      // Rotate the connection set for tiles with optional connections
      const c = this._editorParams.connections;
      if (clockwise) {
        this._editorParams.connections = { N: c.W, E: c.N, S: c.E, W: c.S };
      } else {
        this._editorParams.connections = { N: c.E, E: c.S, S: c.W, W: c.N };
      }
    } else {
      // Rotate the tile shape
      const cur = this._editorParams.rotation;
      if (clockwise) {
        this._editorParams.rotation = ((cur + 90) % 360) as Rotation;
      } else {
        this._editorParams.rotation = ((cur + 270) % 360) as Rotation;
      }
    }
  }

  private _onEditorCanvasWheel(e: WheelEvent): void {
    e.preventDefault();
    const clockwise = e.deltaY > 0;
    this._rotateEditorPalette(clockwise);

    // Only write the rotation/connection change back to the linked tile when the
    // cursor is hovering directly over it.  When the cursor is elsewhere the
    // wheel only updates the pending-placement params (the ghost preview).
    const hover = this._editorHover;
    const linked = this._linkedTilePos;
    if (linked && hover && hover.row === linked.row && hover.col === linked.col) {
      this._applyParamsToLinkedTile();
    }
    this._refreshPaletteUI();
    this._renderEditorCanvas();
  }

  // ─── Select a tile in the palette from a TileDef ──────────────────────────

  /** Populate _editorPalette and _editorParams from a TileDef, then refresh the UI panels. */
  private _selectTileFromDef(def: TileDef, pos?: { row: number; col: number }): void {
    if (def.shape === PipeShape.Empty) {
      this._editorPalette = 'erase';
    } else if (def.shape === PipeShape.Chamber) {
      const cc = def.chamberContent ?? 'tank';
      this._editorPalette = `chamber:${cc}` as ChamberPalette;
    } else {
      this._editorPalette = def.shape;
    }
    // Only link the tile for live param editing if it has parameters beyond rotation.
    if (pos !== undefined && this._paletteHasNonRotationParams(this._editorPalette)) {
      this._linkedTilePos = pos;
    } else {
      // Plain/gold/spin pipe clicked (or no position): clear any existing link.
      this._linkedTilePos = null;
    }
    this._linkedTileDirty = false;
    this._populateParamsFromDef(def);
    this._refreshPaletteUI();
  }

  /**
   * Returns true when the given palette entry has editable parameters beyond
   * rotation alone.  Tiles with only rotation (plain pipes, gold pipes, spin
   * pipes) should not be auto-linked for live param editing; linking is
   * reserved for Source, Sink, and Chamber tiles that expose richer settings.
   */
  private _paletteHasNonRotationParams(palette: EditorPalette): boolean {
    return palette === PipeShape.Source || palette === PipeShape.Sink || palette === PipeShape.Cement || isChamberPalette(palette);
  }

  /** Set _editorParams to match all relevant fields from a TileDef. */
  private _populateParamsFromDef(def: TileDef): void {
    this._editorParams = { ...DEFAULT_PARAMS };
    if (def.rotation !== undefined) this._editorParams.rotation = def.rotation;
    if (def.capacity !== undefined) this._editorParams.capacity = def.capacity;
    if (def.cost !== undefined) this._editorParams.cost = def.cost;
    if (def.temperature !== undefined) this._editorParams.temperature = def.temperature;
    if (def.pressure !== undefined) this._editorParams.pressure = def.pressure;
    if (def.hardness !== undefined) this._editorParams.hardness = def.hardness;
    if (def.shatter !== undefined) this._editorParams.shatter = def.shatter;
    if (def.dryingTime !== undefined) this._editorParams.dryingTime = def.dryingTime;
    if (def.chamberContent !== undefined) this._editorParams.chamberContent = def.chamberContent;
    if (def.itemShape !== undefined) this._editorParams.itemShape = def.itemShape;
    if (def.itemCount !== undefined) this._editorParams.itemCount = def.itemCount;
    if (def.connections) {
      this._editorParams.connections = {
        N: def.connections.includes(Direction.North),
        E: def.connections.includes(Direction.East),
        S: def.connections.includes(Direction.South),
        W: def.connections.includes(Direction.West),
      };
    } else {
      // No explicit connections: default to all open (for Source/Sink/Chamber)
      this._editorParams.connections = { N: true, E: true, S: true, W: true };
    }
  }

  /** Rebuild and replace the palette and param panels in the DOM. */
  private _refreshPaletteUI(): void {
    const palettePanel = document.getElementById('editor-palette-panel');
    if (palettePanel) {
      palettePanel.replaceWith(this._buildPalette());
    }
    const paramPanel = document.getElementById('editor-param-panel');
    if (paramPanel) {
      const newParam = this._buildParamPanel();
      newParam.id = 'editor-param-panel';
      paramPanel.replaceWith(newParam);
    }
  }

  /** Clear the link if the currently linked tile is at the given position. */
  private _clearLinkAt(pos: { row: number; col: number }): void {
    if (this._linkedTilePos &&
        this._linkedTilePos.row === pos.row &&
        this._linkedTilePos.col === pos.col) {
      this._linkedTilePos = null;
      this._linkedTileDirty = false;
    }
  }

  /**
   * If a tile is currently linked for live param editing, update it in the grid
   * with the current palette and params.
   *
   * A single undo snapshot is recorded on the first param change in a linked session;
   * subsequent changes in the same session overwrite the tile without additional snapshots.
   * This means all live edits to the linked tile undo as one step, which avoids flooding
   * the undo history when the user types into a number input.
   */
  private _applyParamsToLinkedTile(): void {
    if (!this._linkedTilePos) return;
    const { row, col } = this._linkedTilePos;
    // Guard against the linked position becoming out-of-bounds (e.g. after a grid resize).
    if (row < 0 || row >= this._editRows || col < 0 || col >= this._editCols) {
      this._linkedTilePos = null;
      this._linkedTileDirty = false;
      return;
    }
    if (!this._linkedTileDirty) {
      this._recordEditorSnapshot();
      this._linkedTileDirty = true;
    }
    this._editGrid[row][col] = this._buildTileDef(this._editorPalette);
    this._renderEditorCanvas();
  }

  private _canvasPos(e: MouseEvent): { row: number; col: number } | null {
    if (!this._editorCanvas) return null;
    const rect = this._editorCanvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) * this._editCols / rect.width);
    const row = Math.floor((e.clientY - rect.top)  * this._editRows / rect.height);
    if (row < 0 || row >= this._editRows || col < 0 || col >= this._editCols) return null;
    return { row, col };
  }

  /** Set the canvas CSS display size so the grid fills available space up to its intrinsic size.
   *
   * When the editor main layout is in the DOM we measure the actual horizontal space
   * remaining after the side columns, allowing the board to grow beyond
   * MAX_EDITOR_CANVAS_PX whenever the viewport has room.  Falls back to
   * MAX_EDITOR_CANVAS_PX when the layout has not yet been attached (e.g. on the
   * first call made during _showLevelEditor before mainLayout is inserted).
   */
  private _updateCanvasDisplaySize(): void {
    if (!this._editorCanvas) return;
    const intrinsicW = this._editCols * TILE_SIZE;
    const intrinsicH = this._editRows * TILE_SIZE;

    // Determine the maximum pixel width the canvas may occupy.
    let maxPx = MAX_EDITOR_CANVAS_PX;
    if (this._editorMainLayout) {
      const layoutW = this._editorMainLayout.clientWidth;
      // Sum the widths of all flex children that do NOT contain the canvas.
      // The canvas may be nested inside a wrapper element (midRightWrapper),
      // so also inspect children of the direct wrapper to catch the right
      // column that shares the row with the canvas.
      let otherW = 0;
      let colCount = 0;
      for (const child of this._editorMainLayout.children) {
        if (!child.contains(this._editorCanvas)) {
          otherW += (child as HTMLElement).offsetWidth;
          colCount++;
        } else {
          // The canvas is inside this child (midRightWrapper).  Also deduct
          // siblings of the canvas's column that sit in the same row.
          for (const innerChild of child.children) {
            if (!innerChild.contains(this._editorCanvas)) {
              otherW += (innerChild as HTMLElement).offsetWidth;
              colCount++;
            }
          }
        }
      }
      // Available width = layout width
      //   − side-column widths
      //   − inter-column gaps  (EDITOR_LAYOUT_GAP × number of non-canvas columns)
      //   − layout's own horizontal padding (EDITOR_LAYOUT_PADDING × 2)
      //   − canvas border     (EDITOR_CANVAS_BORDER × 2 sides)
      const availableW =
        layoutW - otherW - colCount * EDITOR_LAYOUT_GAP - 2 * EDITOR_LAYOUT_PADDING - 2 * EDITOR_CANVAS_BORDER;
      if (availableW > maxPx) {
        maxPx = availableW;
      }
    }

    const scale = Math.min(1.0, maxPx / Math.max(intrinsicW, intrinsicH));
    this._editorCanvas.style.width  = Math.round(intrinsicW * scale) + 'px';
    this._editorCanvas.style.height = Math.round(intrinsicH * scale) + 'px';
  }

  /** Build a TileDef from the current palette and params. */
  private _buildTileDef(palette: EditorPalette): TileDef {
    if (palette === 'erase') return { shape: PipeShape.Empty };

    const isChm = isChamberPalette(palette);
    const effectiveShape = isChm ? PipeShape.Chamber : (palette as PipeShape);
    const p = this._editorParams;

    // Cement: only dryingTime param; no rotation or connections
    if (effectiveShape === PipeShape.Cement) {
      const def: TileDef = { shape: PipeShape.Cement };
      if (p.dryingTime !== 0) def.dryingTime = p.dryingTime;
      return def;
    }

    // Source, Sink, and Chamber are rotationally symmetric – omit rotation from their defs.
    // GoldSpace, Granite, and Tree are connectionless background/block tiles with no rotation either.
    // OneWay uses rotation to encode direction, so it is NOT in the noRotation set.
    const noRotation = new Set([
      PipeShape.Source, PipeShape.Sink, PipeShape.Chamber,
      PipeShape.GoldSpace, PipeShape.Granite, PipeShape.Tree,
    ]).has(effectiveShape);
    const def: TileDef = noRotation ? { shape: effectiveShape } : { shape: effectiveShape, rotation: p.rotation };

    // Connections
    const connDirs: Direction[] = [];
    if (p.connections.N) connDirs.push(Direction.North);
    if (p.connections.E) connDirs.push(Direction.East);
    if (p.connections.S) connDirs.push(Direction.South);
    if (p.connections.W) connDirs.push(Direction.West);
    // Only set explicit connections for Source/Sink/Chamber (not all-4-default)
    const needsConn = (effectiveShape === PipeShape.Source || effectiveShape === PipeShape.Sink || effectiveShape === PipeShape.Chamber);
    if (needsConn && connDirs.length < 4) {
      def.connections = connDirs;
    }

    if (effectiveShape === PipeShape.Source) {
      def.capacity = p.capacity;
      if (p.temperature !== 0) def.temperature = p.temperature;
      if (p.pressure !== 0) def.pressure = p.pressure;
    } else if (isChm) {
      const cc = chamberPaletteContent(palette as ChamberPalette);
      def.chamberContent = cc;
      if (cc === 'tank') def.capacity = p.capacity;
      if (cc === 'dirt') def.cost = p.cost;
      if (cc === 'heater') def.temperature = p.temperature;
      if (cc === 'ice') { def.cost = p.cost; def.temperature = p.temperature; }
      if (cc === 'pump') def.pressure = p.pressure;
      if (cc === 'snow') { def.cost = p.cost; def.temperature = p.temperature; }
      if (cc === 'sandstone') { def.cost = p.cost; def.temperature = p.temperature; if (p.hardness !== 0) def.hardness = p.hardness; if (p.shatter !== 0) def.shatter = p.shatter; }
      if (cc === 'hot_plate') { def.cost = p.cost; def.temperature = p.temperature; }
      if (cc === 'item') { def.itemShape = p.itemShape; def.itemCount = p.itemCount; }
    }

    return def;
  }

  // ─── Editor undo / redo ────────────────────────────────────────────────────

  private _recordEditorSnapshot(): void {
    const snapshot: EditorSnapshot = {
      grid: JSON.parse(JSON.stringify(this._editGrid)) as (TileDef | null)[][],
      rows: this._editRows,
      cols: this._editCols,
      inventory: JSON.parse(JSON.stringify(this._editInventory)) as InventoryItem[],
    };
    if (this._editorHistoryIdx < this._editorHistory.length - 1) {
      this._editorHistory = this._editorHistory.slice(0, this._editorHistoryIdx + 1);
    }
    this._editorHistory.push(snapshot);
    this._editorHistoryIdx = this._editorHistory.length - 1;
    // Mark unsaved changes on any snapshot recorded after the initial open snapshot.
    if (this._editorHistoryIdx > 0) this._editorUnsavedChanges = true;
    this._updateEditorUndoRedoButtons();
  }

  private _editorUndo(): void {
    // If a linked tile has unsaved edits, record the current state first so that
    // a subsequent redo can return to those modified parameters.
    if (this._linkedTileDirty) {
      this._recordEditorSnapshot();
      this._linkedTileDirty = false;
    }
    if (this._editorHistoryIdx <= 0) return;
    this._editorHistoryIdx--;
    this._restoreEditorSnapshot(this._editorHistory[this._editorHistoryIdx]);
    this._editorUnsavedChanges = this._editorHistoryIdx !== this._editorSavedHistoryIdx;
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  private _editorRedo(): void {
    if (this._editorHistoryIdx >= this._editorHistory.length - 1) return;
    this._editorHistoryIdx++;
    this._restoreEditorSnapshot(this._editorHistory[this._editorHistoryIdx]);
    this._editorUnsavedChanges = this._editorHistoryIdx !== this._editorSavedHistoryIdx;
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  private _restoreEditorSnapshot(snapshot: EditorSnapshot): void {
    this._editGrid = JSON.parse(JSON.stringify(snapshot.grid)) as (TileDef | null)[][];
    this._editRows = snapshot.rows;
    this._editCols = snapshot.cols;
    this._editInventory = JSON.parse(JSON.stringify(snapshot.inventory)) as InventoryItem[];
    if (this._editorCanvas) {
      setTileSize(computeTileSize(this._editRows, this._editCols));
      this._editorCanvas.width  = this._editCols * TILE_SIZE;
      this._editorCanvas.height = this._editRows * TILE_SIZE;
    }
    this._updateCanvasDisplaySize();
    // Refresh inventory panel
    const invPanel = document.getElementById('editor-inventory-panel');
    if (invPanel) invPanel.replaceWith(this._buildInventoryEditor());
  }

  private _updateEditorUndoRedoButtons(): void {
    const undoBtn = document.getElementById('editor-undo-btn') as HTMLButtonElement | null;
    const redoBtn = document.getElementById('editor-redo-btn') as HTMLButtonElement | null;
    if (undoBtn) {
      undoBtn.disabled = this._editorHistoryIdx <= 0;
      undoBtn.style.opacity = undoBtn.disabled ? '0.4' : '1';
      undoBtn.style.cursor = undoBtn.disabled ? 'not-allowed' : 'pointer';
    }
    if (redoBtn) {
      redoBtn.disabled = this._editorHistoryIdx >= this._editorHistory.length - 1;
      redoBtn.style.opacity = redoBtn.disabled ? '0.4' : '1';
      redoBtn.style.cursor = redoBtn.disabled ? 'not-allowed' : 'pointer';
    }
  }

  // ─── Grid resize ──────────────────────────────────────────────────────────

  private _resizeGrid(newRows: number, newCols: number): void {
    const newGrid: (TileDef | null)[][] = [];
    for (let r = 0; r < newRows; r++) {
      newGrid[r] = [];
      for (let c = 0; c < newCols; c++) {
        newGrid[r][c] = (r < this._editRows && c < this._editCols)
          ? (this._editGrid[r]?.[c] ?? null)
          : null;
      }
    }
    this._editRows = newRows;
    this._editCols = newCols;
    this._editGrid = newGrid;
    this._recordEditorSnapshot();
    if (this._editorCanvas) {
      setTileSize(computeTileSize(newRows, newCols));
      this._editorCanvas.width  = newCols * TILE_SIZE;
      this._editorCanvas.height = newRows * TILE_SIZE;
    }
    this._updateCanvasDisplaySize();
    this._renderEditorCanvas();
  }

  // ─── Grid slide (N/E/S/W) ─────────────────────────────────────────────────

  /**
   * Slide all tiles one cell in the given direction.  Tiles that would fall off
   * the edge of the grid are discarded.  The operation is recorded as an undo
   * snapshot so it can be undone.
   */
  private _slideGrid(dir: 'N' | 'E' | 'S' | 'W'): void {
    const newGrid: (TileDef | null)[][] = Array.from(
      { length: this._editRows },
      () => Array(this._editCols).fill(null) as null[],
    );
    for (let r = 0; r < this._editRows; r++) {
      for (let c = 0; c < this._editCols; c++) {
        const tile = this._editGrid[r]?.[c] ?? null;
        if (tile === null) continue;
        let nr = r;
        let nc = c;
        if (dir === 'N') nr = r - 1;
        else if (dir === 'S') nr = r + 1;
        else if (dir === 'W') nc = c - 1;
        else nc = c + 1; // E
        if (nr >= 0 && nr < this._editRows && nc >= 0 && nc < this._editCols) {
          newGrid[nr][nc] = tile;
        }
        // Tiles that go out of bounds are simply dropped.
      }
    }
    this._editGrid = newGrid;
    // Clear link since positions have shifted.
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
    this._recordEditorSnapshot();
    this._renderEditorCanvas();
  }

  // ─── Level validation ──────────────────────────────────────────────────────

  private _validateLevel(): ValidationResult {
    const msgs: string[] = [];
    let sourcePos: { row: number; col: number } | null = null;
    const sinkPositions: Array<{ row: number; col: number }> = [];
    let ok = true;

    // Count sources and sinks
    for (let r = 0; r < this._editRows; r++) {
      for (let c = 0; c < this._editCols; c++) {
        const def = this._editGrid[r]?.[c];
        if (!def) continue;
        if (def.shape === PipeShape.Source) {
          if (sourcePos) { msgs.push('Multiple Source tiles found – only one is allowed.'); ok = false; }
          else { sourcePos = { row: r, col: c }; }
        }
        if (def.shape === PipeShape.Sink) sinkPositions.push({ row: r, col: c });
      }
    }

    if (!sourcePos) { msgs.push('No Source tile found – add one to the grid.'); ok = false; }
    if (sinkPositions.length === 0) { msgs.push('No Sink tile found – add at least one.'); ok = false; }
    if (!ok) return { ok, messages: msgs };

    // Check that inventory has at least one item (otherwise level may be impossible)
    const hasInventory = this._editInventory.some((it) => it.count > 0);
    if (!hasInventory) msgs.push('⚠️ Inventory is empty – the player has no tiles to place.');

    // Try to create a Board and check if the level has a valid layout
    try {
      const level = this._buildCurrentLevelDef();
      const board = new Board(level.rows, level.cols, level);
      board.initHistory();

      // Check for sandstone tiles in the initial fill path with invalid deltaDamage.
      const initialFilled = board.getFilledPositions();
      const initialPressure = board.getCurrentPressure(initialFilled);
      for (const key of initialFilled) {
        const [r, c] = parseKey(key);
        const tile = board.grid[r]?.[c];
        if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'sandstone') {
          const deltaDamage = initialPressure - tile.hardness;
          if (deltaDamage <= 0) {
            msgs.push(
              `❌ Sandstone at (${r},${c}) is immediately connected but its hardness (${tile.hardness}) ` +
              `≥ initial pressure (${initialPressure}) — the level starts in a failure state.`,
            );
            ok = false;
          }
        }
      }

      // Check if the initial state already has zero or negative water (immediate game over).
      if (ok && board.getCurrentWater() <= 0) {
        msgs.push('❌ Level starts with zero or negative water – adjust the source capacity or tile costs.');
        ok = false;
      }

      // If source is directly connected to sink (pre-solved), warn
      if (ok) {
        if (board.isSolved()) {
          msgs.push('⚠️ Level is already solved without placing any tiles.');
        } else {
          msgs.push('✅ Level structure looks valid.');
        }
      }
    } catch {
      msgs.push('❌ Level structure error – check tile configurations.');
      ok = false;
    }

    if (msgs.length === 0) msgs.push('✅ All checks passed!');
    return { ok, messages: msgs };
  }

  // ─── Build LevelDef from editor state ────────────────────────────────────

  private _buildCurrentLevelDef(): LevelDef {
    const campaign = this._getActiveCampaign();
    const chapter = campaign?.chapters[this._activeChapterIdx];
    const existingId = chapter?.levels[this._activeLevelIdx]?.id ?? generateLevelId();

    // Count star chambers in the grid and cache in starCount
    let starCount = 0;
    for (const row of this._editGrid) {
      for (const cell of row) {
        if (cell?.shape === PipeShape.Chamber && cell.chamberContent === 'star') {
          starCount++;
        }
      }
    }

    const rawGrid = JSON.parse(JSON.stringify(this._editGrid)) as (TileDef | null)[][];
    // Strip any fields not supported by each tile's shape to keep saved data clean.
    const cleanGrid: (TileDef | null)[][] = rawGrid.map(row =>
      row.map(tile => {
        if (!tile) return null;
        const validKeys = getValidTileDefKeys(tile);
        for (const key of Object.keys(tile)) {
          if (!validKeys.has(key)) delete (tile as unknown as Record<string, unknown>)[key];
        }
        return tile;
      })
    );
    const def: LevelDef = {
      id: existingId,
      name: this._editLevelName,
      rows: this._editRows,
      cols: this._editCols,
      grid: cleanGrid,
      inventory: JSON.parse(JSON.stringify(this._editInventory)) as InventoryItem[],
    };
    if (this._editLevelNote.trim()) def.note = this._editLevelNote.trim();
    const activeHints = this._editLevelHints.map(h => h.trim()).filter(h => h.length > 0);
    if (activeHints.length > 0) def.hints = activeHints;
    if (starCount > 0) def.starCount = starCount;
    if (this._editLevelChallenge) def.challenge = true;
    return def;
  }

  // ─── Save level ────────────────────────────────────────────────────────────

  private _saveLevel(campaign: CampaignDef, chapterIdx: number, levelIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;

    const newLevel = this._buildCurrentLevelDef();
    if (levelIdx >= 0 && levelIdx < chapter.levels.length) {
      // Updating an existing level – clear any stored player progress for it so
      // the player must replay the new version to record a new score.
      clearLevelStarRecord(newLevel.id, campaign.id);
      clearLevelWaterRecord(newLevel.id, campaign.id);
      chapter.levels[levelIdx] = newLevel;
    } else {
      chapter.levels.push(newLevel);
    }
    this._touchCampaign(campaign);
    this._saveCampaigns();
    this._editorUnsavedChanges = false;
    this._editorSavedHistoryIdx = this._editorHistoryIdx;

    // Visual confirmation on the Save button
    const saveBtn = document.getElementById('editor-save-btn') as HTMLButtonElement | null;
    if (saveBtn) {
      const orig = saveBtn.textContent;
      saveBtn.textContent = '✅ Saved!';
      setTimeout(() => { saveBtn.textContent = orig; }, 1500);
    }
  }

  // ─── Campaign management ───────────────────────────────────────────────────

  private _createCampaign(): void {
    const name = prompt('Campaign name:');
    if (!name?.trim()) return;
    const author = prompt('Author name:') ?? '';
    const campaign: CampaignDef = {
      id: generateCampaignId(),
      name: name.trim(),
      author: author.trim(),
      chapters: [],
      lastUpdated: new Date().toISOString(),
    };
    this._campaigns.push(campaign);
    this._saveCampaigns();
    this._showCampaignList();
  }

  private _addChapter(campaign: CampaignDef): void {
    const name = prompt('Chapter name:');
    if (!name?.trim()) return;
    const newId = campaign.chapters.reduce((mx, ch) => Math.max(mx, ch.id), 0) + 1;
    campaign.chapters.push({ id: newId, name: name.trim(), levels: [] });
    this._touchCampaign(campaign);
    this._saveCampaigns();
    this._showCampaignDetail();
  }

  private _addLevel(campaign: CampaignDef, chapterIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    const name = prompt('Level name:', 'New Level');
    if (!name?.trim()) return;
    // Default 6×6 empty grid
    const grid: (TileDef | null)[][] = Array.from({ length: 6 }, () => Array(6).fill(null) as null[]);
    const newLevel: LevelDef = {
      id: generateLevelId(),
      name: name.trim(),
      rows: 6,
      cols: 6,
      grid,
      inventory: [],
    };
    chapter.levels.push(newLevel);
    this._touchCampaign(campaign);
    this._saveCampaigns();
    // Open the level editor immediately
    this._activeLevelIdx = chapter.levels.length - 1;
    this._openLevelEditor(newLevel, false);
  }

  private _deleteCampaign(campaignId: string): void {
    const campaign = this._campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
    this._campaigns = this._campaigns.filter((c) => c.id !== campaignId);
    this._saveCampaigns();
    this._showCampaignList();
  }

  // ─── Dev: Data validation ─────────────────────────────────────────────────

  /**
   * Scan a campaign for unrecognized field names, optionally removing them
   * in place (clean-up pass when dryRun is false).
   *
   * @param campaign  The campaign to scan (may be modified in place when dryRun is false).
   * @param dryRun    When true, only tallies issues without modifying data.
   * @returns Map from record-type label to a Map of { fieldName → occurrence count }.
   */
  private _scanCampaignData(
    campaign: CampaignDef,
    dryRun: boolean,
  ): Map<string, Map<string, number>> {
    const issues = new Map<string, Map<string, number>>();

    const tally = (recordType: string, field: string): void => {
      if (!issues.has(recordType)) issues.set(recordType, new Map());
      const m = issues.get(recordType)!;
      m.set(field, (m.get(field) ?? 0) + 1);
    };

    const checkKeys = (
      obj: Record<string, unknown>,
      validKeys: ReadonlySet<string>,
      recordType: string,
    ): void => {
      for (const key of Object.keys(obj)) {
        if (!validKeys.has(key)) {
          tally(recordType, key);
          if (!dryRun) delete obj[key];
        }
      }
    };

    // Campaign-level fields
    checkKeys(campaign as unknown as Record<string, unknown>, VALID_CAMPAIGN_KEYS, 'Campaign');

    for (const chapter of campaign.chapters) {
      checkKeys(chapter as unknown as Record<string, unknown>, VALID_CHAPTER_KEYS, 'Chapter');

      for (const level of chapter.levels) {
        checkKeys(level as unknown as Record<string, unknown>, VALID_LEVEL_KEYS, 'Level');

        for (const row of level.grid) {
          for (const tile of row) {
            if (!tile) continue;
            checkKeys(
              tile as unknown as Record<string, unknown>,
              getValidTileDefKeys(tile),
              'Tile',
            );
          }
        }

        for (const item of level.inventory) {
          checkKeys(
            item as unknown as Record<string, unknown>,
            VALID_INVENTORY_ITEM_KEYS,
            'InventoryItem',
          );
        }
      }
    }

    return issues;
  }

  /**
   * Build an HTML table summarising the unrecognized field issues found in campaign data.
   * Each row contains the record type, field name, and occurrence count.
   * Returns null when there are no issues to display.
   */
  private _buildValidationIssuesTable(
    issues: Map<string, Map<string, number>>,
  ): HTMLTableElement | null {
    let totalIssues = 0;
    for (const m of issues.values()) for (const c of m.values()) totalIssues += c;
    if (totalIssues === 0) return null;

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const [label, align] of [['Record Type', 'left'], ['Field Name', 'left'], ['Count', 'right']] as const) {
      const th = document.createElement('th');
      th.style.cssText = `text-align:${align};padding:4px 8px;color:#aaa;border-bottom:1px solid #2a3a5e;`;
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const [recordType, fieldMap] of issues) {
      for (const [fieldName, count] of fieldMap) {
        const tr = document.createElement('tr');
        for (const [txt, align] of [
          [recordType, 'left'],
          [fieldName, 'left'],
          [String(count), 'right'],
        ] as const) {
          const td = document.createElement('td');
          td.style.cssText = `text-align:${align};padding:4px 8px;border-bottom:1px solid #1a2a3e;`;
          td.textContent = txt;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    return table;
  }

  /**
   * Render the validate-data dialog content into `overlay`.
   * Called initially with the scan results, and again after a clean-up to show the updated state.
   */
  private _renderValidateDataContent(
    overlay: HTMLElement,
    campaign: CampaignDef,
    issues: Map<string, Map<string, number>>,
    cleanupDone: boolean,
  ): void {
    overlay.innerHTML = '';

    let totalIssues = 0;
    for (const m of issues.values()) for (const c of m.values()) totalIssues += c;

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'background:#16213e;border:2px solid #4a90d9;border-radius:10px;padding:28px 32px;' +
      'display:flex;flex-direction:column;gap:18px;min-width:300px;max-width:520px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6);';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#f0c040;';
    title.textContent = cleanupDone ? '🧹 Cleanup Complete' : '🔍 Dev – Validate Data';
    dialog.appendChild(title);

    const body = document.createElement('div');
    body.style.cssText = 'font-size:0.9rem;color:#eee;line-height:1.6;';

    const issuesTable = this._buildValidationIssuesTable(issues);
    if (!issuesTable) {
      const p = document.createElement('p');
      p.style.margin = '0';
      p.textContent = cleanupDone
        ? 'Cleanup complete. No issues were found.'
        : 'Data validation complete. No issues found.';
      body.appendChild(p);
    } else {
      const intro = document.createElement('p');
      intro.style.margin = '0 0 8px 0';
      intro.textContent = cleanupDone
        ? 'The following unrecognized fields were removed:'
        : 'The following unrecognized fields were found:';
      body.appendChild(intro);
      body.appendChild(issuesTable);
    }
    dialog.appendChild(body);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;

    if (totalIssues > 0 && !cleanupDone) {
      const cleanupBtn = this._btn('🧹 Clean Up', '#e67e22', '#fff', () => {
        const cleanIssues = this._scanCampaignData(campaign, false);
        this._touchCampaign(campaign);
        this._saveCampaigns();
        this._renderValidateDataContent(overlay, campaign, cleanIssues, true);
      });
      btnRow.appendChild(cleanupBtn);
    }

    btnRow.appendChild(this._btn('OK', '#4a90d9', '#fff', () => overlay.remove()));
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
  }

  /**
   * Show a modal dialog that reports unrecognized field names found in the
   * campaign data.  Offers a "Clean Up" button that removes those fields,
   * saves the campaign, and updates its lastUpdated timestamp.
   */
  private _showValidateDataModal(campaign: CampaignDef): void {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;' +
      'justify-content:center;z-index:300;';

    this._renderValidateDataContent(overlay, campaign, this._scanCampaignData(campaign, true), false);
    this._el.appendChild(overlay);
  }



  /** Export a campaign by triggering a JSON file download.
   *  Unrecognized fields are stripped from the output via a clean pass. */
  private _exportCampaign(campaign: CampaignDef): void {
    // Deep-clone and strip any unrecognized fields before serializing.
    const clean = JSON.parse(JSON.stringify(campaign)) as CampaignDef;
    this._scanCampaignData(clean, false);
    const json = JSON.stringify(clean, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaign.name.replace(/\s+/g, '_')}.pipes.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Import a campaign from a JSON or gzip-compressed JSON (.gz) file. */
  private _importCampaign(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gz,application/json,application/gzip';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const isGzip = file.name.endsWith('.gz');
      const processText = (text: string) => {
        try {
          const data = migrateCampaign(JSON.parse(text) as CampaignDef);
          if (!data.id || !data.name || !Array.isArray(data.chapters)) {
            alert('Invalid campaign file format.');
            return;
          }
          // Ensure we don't clobber the official campaign
          if (data.id === 'official') {
            data.id = generateCampaignId();
            alert(`Note: this file has the reserved "official" ID. A new unique ID has been assigned to the imported campaign.`);
          }
          // Clear the official flag on import to prevent imported campaigns from
          // automatically gaining read-only/official status.
          if (data.official) {
            data.official = undefined;
          }
          // Check for a matching campaign ID in the local library.
          const existingIdx = this._campaigns.findIndex((c) => c.id === data.id);
          if (existingIdx !== -1) {
            const existing = this._campaigns[existingIdx];
            const existingTime = existing.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
            const importedTime = data.lastUpdated ? new Date(data.lastUpdated).getTime() : 0;
            if (existingTime === importedTime) {
              // Same version: inform the user and cancel the import.
              this._showImportSameVersionDialog(data.name, data.lastUpdated);
              return;
            }
            const isNewer = importedTime > existingTime;
            this._showImportVersionConflictDialog(data, existing, isNewer, () => {
              // Replace the campaign record while retaining player progress (keyed by ID).
              this._campaigns[existingIdx] = data;
              this._saveCampaigns();
              alert(`Campaign "${data.name}" imported successfully.`);
              this.hide();
              this._onPlayCampaign(data);
            });
            return;
          }
          this._campaigns.push(data);
          this._saveCampaigns();
          alert(`Campaign "${data.name}" imported successfully.`);
          this.hide();
          this._onPlayCampaign(data);
        } catch {
          alert('Failed to parse campaign file. Please check the format.');
        }
      };
      if (isGzip) {
        ungzipBlob(file).then(processText).catch(() => {
          alert('Failed to decompress campaign file. The .gz file may be corrupted or invalid.');
        });
      } else {
        const reader = new FileReader();
        reader.onload = () => { processText(reader.result as string); };
        reader.readAsText(file);
      }
    });
    input.click();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private _saveCampaigns(): void {
    saveImportedCampaigns(this._campaigns);
  }

  /** Return all campaigns (user campaigns) for external use (e.g. campaign select screen). */
  getAllCampaigns(): CampaignDef[] {
    return [...this._campaigns];
  }

  /** Reload campaigns from storage (called after an import or external change). */
  reloadCampaigns(): void {
    this._campaigns = loadImportedCampaigns();
  }
}
