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

import { CampaignDef, LevelDef, TileDef, InventoryItem, PipeShape, Direction, Rotation, TEMP_CHAMBER_CONTENTS } from '../types';
import { loadCampaignProgress, computeCampaignCompletionPct, loadActiveCampaignId } from '../persistence';
import { TILE_SIZE, setTileSize, computeTileSize } from '../renderer';
import { ChapterMapEditorSection, ChapterMapEditorCallbacks } from './chapterMapEditor';
import { CampaignService, ImportResult } from './campaignService';
import { LevelEditorState } from './levelEditorState';

/** Horizontal padding (px) of the main editor layout container. */
const EDITOR_LAYOUT_PADDING = 16;
/** Gap (px) between flex columns in the main editor layout. */
const EDITOR_LAYOUT_GAP = 16;
/** CSS for a flex row that centers items and adds a small gap (used for label+input pairs). */
const EDITOR_FLEX_ROW_CSS = 'display:flex;align-items:center;gap:8px;';
/** CSS for a button row aligned to the trailing edge (used at the bottom of modal/confirm dialogs). */
const EDITOR_BTN_ROW_CSS = 'display:flex;gap:12px;justify-content:flex-end;';
import { Board, PIPE_SHAPES, SPIN_CEMENT_SHAPES, parseKey } from '../board';
import {
  EditorPalette,
  EditorScreen,
  ChamberPalette,
  ChamberContent,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
  ValidationResult,
  generateLevelId,
  isChamberPalette,
  chamberPaletteContent,
  ungzipBlob,
  getValidTileDefKeys,
  MAX_EDITOR_CANVAS_PX,
  EDITOR_CANVAS_BORDER,
  GRID_MIN_DIM,
  GRID_MAX_DIM,
  PALETTE_ITEM_SELECTED_BORDER,
  PALETTE_ITEM_UNSELECTED_BORDER,
  PALETTE_ITEM_SELECTED_BG,
  PALETTE_ITEM_UNSELECTED_BG,
  PALETTE_ITEM_SELECTED_COLOR,
  PALETTE_ITEM_UNSELECTED_COLOR,
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
} from './types';
import { renderEditorCanvas, drawEditorTile, HoverOverlay, DragState } from './renderer';
import { EditorInputHandler } from './editorInputHandler';
import { renderMinimap } from '../minimap';

// ─── Chamber parameter descriptors ───────────────────────────────────────────

/** A single numeric parameter shown in the tile-params panel for a Chamber tile. */
interface ChamberParamDescriptor {
  /** Label text rendered to the left of the input. */
  label: string;
  /** Which field of {@link TileParams} this input controls. */
  field: keyof Pick<TileParams, 'temperature' | 'cost' | 'pressure' | 'hardness' | 'shatter'>;
  /**
   * When provided, the input value is clamped to this minimum (via `Math.max`).
   * When omitted, the raw `parseInt` result is used (allowing negative values).
   */
  clampMin?: number;
}

/**
 * Declarative map from Chamber content type → ordered list of numeric param inputs.
 * Drives {@link CampaignEditor._buildChamberContentParams} so each new content
 * type only needs an entry here rather than a new `if` branch.
 *
 * Content types with no numeric params (tank, star) are omitted – the method
 * is a no-op for them.  The `item` type is handled separately (it has a shape
 * selector in addition to a numeric count field).
 */
const CHAMBER_PARAM_DESCRIPTORS: Partial<Record<ChamberContent, ChamberParamDescriptor[]>> = {
  dirt:      [{ label: 'Mass',      field: 'cost' }],
  heater:    [{ label: 'Temp',      field: 'temperature' }],
  ice:       [{ label: 'Temp °',    field: 'temperature', clampMin: 0 }, { label: 'Mass', field: 'cost', clampMin: 0 }],
  snow:      [{ label: 'Temp °',    field: 'temperature', clampMin: 0 }, { label: 'Mass', field: 'cost', clampMin: 0 }],
  sandstone: [
    { label: 'Temp °',   field: 'temperature', clampMin: 0 },
    { label: 'Mass',     field: 'cost',        clampMin: 0 },
    { label: 'Hardness', field: 'hardness',    clampMin: 0 },
    { label: 'Shatter',  field: 'shatter',     clampMin: 0 },
  ],
  pump:      [{ label: 'Pressure',  field: 'pressure' }],
  hot_plate: [{ label: 'Boiling °', field: 'temperature', clampMin: 0 }, { label: 'Mass', field: 'cost', clampMin: 0 }],
};

// ─── CampaignEditor class ─────────────────────────────────────────────────────

export class CampaignEditor {
  private readonly _el: HTMLElement;

  /** Service that owns all campaign/chapter/level data state and persistence. */
  private _service: CampaignService;

  /**
   * Backward-compat accessor so that tests (which cast the editor to a plain
   * object type) can still read `_campaigns` directly.  All editor code should
   * use `_service.*` instead.
   */
  private get _campaigns(): readonly CampaignDef[] {
    return this._service.campaigns;
  }

  // ── Navigation state ──────────────────────────────────────────────────────
  private _screen: EditorScreen = EditorScreen.List;
  private _activeCampaignId: string | null = null;
  private _activeChapterIdx = -1;
  private _activeLevelIdx = -1;

  // ── Level editor state (owned by LevelEditorState) ────────────────────────
  private _state: LevelEditorState = new LevelEditorState();

  // ── Level editor DOM/drag state (stays on CampaignEditor) ─────────────────
  private _editorCanvas: HTMLCanvasElement | null = null;
  private _editorCtx: CanvasRenderingContext2D | null = null;
  private _editorSourceErrorEl: HTMLDivElement | null = null;
  /** The outermost flex container of the level editor layout, used to measure available canvas space. */
  private _editorMainLayout: HTMLElement | null = null;
  /** Canvas input handler: owns all gesture state and event listeners. */
  private _editorInput: EditorInputHandler | null = null;
  /** Palette section expand flags (UI-only). */
  private _goldSectionExpanded = false;
  private _leakySectionExpanded = false;
  private _chamberSectionExpanded = false;
  private _pipesSectionExpanded = false;
  private _floorSectionExpanded = false;
  private _spinSectionExpanded = false;

  private readonly _onClose: () => void;
  private readonly _onPlaytest: (level: LevelDef) => void;
  private readonly _onPlayCampaign: (campaign: CampaignDef) => void;

  /** Chapter map editor sub-section (manages grid, palette, canvas, undo/redo). */
  private readonly _chapterMapEditor: ChapterMapEditorSection;

  constructor(
    onClose: () => void,
    onPlaytest: (level: LevelDef) => void,
    onPlayCampaign: (campaign: CampaignDef) => void,
  ) {
    this._onClose = onClose;
    this._onPlaytest = onPlaytest;
    this._onPlayCampaign = onPlayCampaign;
    this._service = new CampaignService();

    const chapterCallbacks: ChapterMapEditorCallbacks = {
      buildBtn: (l, bg, c, cb) => this._btn(l, bg, c, cb),
      getActiveCampaign: () => this._getActiveCampaign(),
      getActiveChapterIdx: () => this._activeChapterIdx,
      touchCampaign: (campaign) => this._touchCampaign(campaign),
      saveCampaigns: () => this._saveCampaigns(),
      openLevelEditor: (levelIdx, readOnly) => {
        const campaign = this._getActiveCampaign();
        const chapter = campaign?.chapters[this._activeChapterIdx];
        const level = chapter?.levels[levelIdx];
        if (!level) return;
        this._activeLevelIdx = levelIdx;
        this._openLevelEditor(level, readOnly);
      },
    };
    this._chapterMapEditor = new ChapterMapEditorSection(chapterCallbacks);

    this._el = document.createElement('div');
    this._el.style.cssText =
      'display:none;position:fixed;inset:0;background:#0d1520;overflow:auto;z-index:200;' +
      'font-family:Arial,sans-serif;color:#eee;flex-direction:column;align-items:center;';
    document.body.appendChild(this._el);

    // Global keyboard handler for shortcuts (guarded by active screen)
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this._el.style.display === 'none') return;
      // Chapter map editor: Q/W rotation
      if (this._screen === EditorScreen.Chapter) {
        this._chapterMapEditor.handleChapterEditorKeyDown(e);
        return;
      }
      if (this._screen !== EditorScreen.LevelEditor) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this._editorUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this._editorRedo(); }
      if (e.key === 'Escape' && this._state.linkedTilePos !== null) {
        // Unlink the linked tile
        e.preventDefault();
        this._state.clearLink();
        this._renderEditorCanvas();
      }
      // Q = rotate counter-clockwise, W = rotate clockwise (mirrors in-game mouse wheel)
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (!e.ctrlKey && !e.altKey && !isInputFocused) {
        const key = e.key.toLowerCase();
        if (key === 'q' || key === 'w') {
          e.preventDefault();
          this._state.rotatePalette(key === 'w');
          if (this._state.linkedTilePos) this._state.applyParamsToLinkedTile();
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
   *
   * @param afterSwap - Optional callback invoked immediately after the swap,
   *   before saving.  Receives the two indices that were exchanged (a < b).
   */
  private _appendReorderButtons<T>(
    btns: HTMLElement,
    items: T[],
    idx: number,
    campaign: CampaignDef,
    onRefresh: () => void,
    onReorder?: (fromIdx: number, toIdx: number) => void,
  ): void {
    if (idx > 0) {
      btns.appendChild(this._btn('▲', '#16213e', '#aaa', () => {
        if (onReorder) {
          onReorder(idx, idx - 1);
        } else {
          [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
          this._touchCampaign(campaign);
          this._saveCampaigns();
        }
        onRefresh();
      }));
    }
    if (idx < items.length - 1) {
      btns.appendChild(this._btn('▼', '#16213e', '#aaa', () => {
        if (onReorder) {
          onReorder(idx, idx + 1);
        } else {
          [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
          this._touchCampaign(campaign);
          this._saveCampaigns();
        }
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
   * @param borderColor - CSS color for the 2px solid border.
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
   * Create a standard full-screen modal overlay and a centered dialog box,
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
   * color changes to distinguish note (blue), hint (gold), and challenge (red).
   *
   * @param borderColor CSS color for the 1 px solid border (e.g. `'#4a90d9'`).
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
    this._service.touch(campaign);
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
   * as the local copy. The import is canceled.
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

    const toolbar = this._buildToolbar('🗺️ Select Campaign', () => {
      this.hide();
      this._onClose();
    });

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
    const allCampaigns = this._service.getAllCampaigns();
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
    return this._service.getCampaign(this._activeCampaignId ?? '');
  }

  private _showCampaignDetail(): void {
    this._screen = EditorScreen.Campaign;
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const isOfficial = campaign.official === true;
    // Determine whether this is a user campaign that can have its official flag toggled
    const isUserCampaign = this._service.campaigns.includes(campaign);

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
        this._service.updateCampaignField(campaign, 'official', toggleCb.checked);
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
        this._service.updateCampaignField(campaign, 'name', v);
      }));
      fields.appendChild(this._labeledInput('Author', campaign.author, (v) => {
        this._service.updateCampaignField(campaign, 'author', v);
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
          this._service.deleteChapter(campaign, chapterIdx);
          this._showCampaignDetail();
        }
      }));
    }

    return row;
  }

  // ─── Screen: Chapter detail ───────────────────────────────────────────────

  private _showChapterDetail(): void {
    this._editorInput?.detach();
    this._editorInput = null;
    this._screen = EditorScreen.Chapter;
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const chapter = campaign.chapters[this._activeChapterIdx];
    if (!chapter) { this._showCampaignDetail(); return; }
    const isOfficial = campaign.official === true;

    // Initialize chapter grid state
    this._chapterMapEditor.init(chapter);

    const toolbar = this._buildToolbar(
      `${isOfficial ? '📋' : '✏️'} Chapter ${this._activeChapterIdx + 1}: ${chapter.name}`,
      () => this._showCampaignDetail(),
    );
    this._el.appendChild(toolbar);

    const content = document.createElement('div');
    content.style.cssText =
      'width:100%;max-width:1200px;padding:20px;box-sizing:border-box;display:flex;' +
      'flex-direction:column;gap:16px;';

    if (!isOfficial) {
      // Chapter name field
      const nameWrap = document.createElement('div');
      nameWrap.style.cssText =
        'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:16px;';
      nameWrap.appendChild(this._labeledInput('Chapter Name', chapter.name, (v) => {
        this._service.renameChapter(campaign, this._activeChapterIdx, v);
      }));
      content.appendChild(nameWrap);
    }

    // Chapter map grid editor section
    content.appendChild(this._chapterMapEditor.buildSection(campaign, chapter, isOfficial));

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

    // Resize canvas after layout is in the DOM
    requestAnimationFrame(() => {
      this._chapterMapEditor.updateCanvasDisplaySize();
      this._chapterMapEditor.renderCanvas();
    });
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
        this._service.duplicateLevel(campaign, chapterIdx, levelIdx);
        this._showChapterDetail();
      }));

      this._appendReorderButtons(btns, chapter.levels, levelIdx, campaign, () => this._showChapterDetail(),
        (fromIdx, toIdx) => this._service.reorderLevels(campaign, chapterIdx, fromIdx, toIdx));
      btns.appendChild(this._btn('🗑', '#16213e', '#e74c3c', () => {
        if (confirm(`Delete level "${level.name}"?`)) {
          this._service.deleteLevel(campaign, chapterIdx, levelIdx);
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
          this._service.moveLevel(
            campaign, chapterIdx, levelIdx,
            targetIdx, campaign.chapters[targetIdx].levels.length,
          );
          this._showChapterDetail();
        });
        btns.appendChild(sel);
      }
    }

    return row;
  }

  // ─── Screen: Level editor ─────────────────────────────────────────────────

  private _openLevelEditor(level: LevelDef, readOnly: boolean): void {
    this._state.initFromLevel(level);
    this._showLevelEditor(readOnly);
  }

  private _showLevelEditor(readOnly: boolean): void {
    // Clean up any existing input handler before building a new one.
    this._editorInput?.detach();
    this._editorInput = null;
    this._screen = EditorScreen.LevelEditor;
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const chapter = campaign.chapters[this._activeChapterIdx];
    if (!chapter) { this._showCampaignDetail(); return; }

    const toolbar = this._buildToolbar(
      readOnly ? `👁 View Level: ${this._state.levelName}` : `✏️ Level Editor`,
      () => {
        if (!readOnly && this._state.hasUnsavedChanges) {
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
      nameInp.value = this._state.levelName;
      nameInp.style.cssText =
        'padding:6px 10px;font-size:0.9rem;background:#0d1a30;color:#eee;' +
        'border:1px solid #4a90d9;border-radius:4px;flex:1;';
      nameInp.addEventListener('input', () => { this._state.levelName = nameInp.value; });
      nameWrap.appendChild(nameLbl);
      nameWrap.appendChild(nameInp);
      return nameWrap;
    } else {
      const lvlNameEl = document.createElement('div');
      lvlNameEl.style.cssText = 'font-size:1rem;font-weight:bold;color:#f0c040;';
      lvlNameEl.textContent = this._state.levelName;
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
    setTileSize(computeTileSize(this._state.rows, this._state.cols));
    canvas.width  = this._state.cols * TILE_SIZE;
    canvas.height = this._state.rows * TILE_SIZE;
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:4px;cursor:` + (readOnly ? 'default' : 'crosshair') + ';' +
      'display:block;';
    this._editorCanvas = canvas;
    this._updateCanvasDisplaySize();
    const ctx = canvas.getContext('2d');
    if (ctx) this._editorCtx = ctx;

    if (!readOnly) {
      this._editorInput = new EditorInputHandler(canvas, {
        getState: () => this._state,
        renderCanvas: () => this._renderEditorCanvas(),
        refreshPaletteUI: () => this._refreshPaletteUI(),
        updateUndoRedoButtons: () => this._updateEditorUndoRedoButtons(),
        showSourceError: () => this._showSourceError(),
      });
      this._editorInput.attach();
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
    noteInp.value = this._state.levelNote;
    noteInp.placeholder = 'Optional – displayed in a box below the puzzle grid.';
    noteInp.style.cssText = textareaStyle;
    noteInp.addEventListener('input', () => { this._state.levelNote = noteInp.value; });
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
      this._state.levelHints.forEach((hint, idx) => {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;gap:4px;align-items:flex-start;';
        const inp = document.createElement('textarea');
        inp.value = hint;
        inp.placeholder = idx === 0
          ? 'Hint 1 – hidden until the player clicks "Show Hint".'
          : `Hint ${idx + 1} – revealed after expanding the previous hint.`;
        inp.style.cssText = textareaStyle + 'border-color:#f0c040;flex:1;';
        inp.addEventListener('input', () => { this._state.levelHints[idx] = inp.value; });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove this hint';
        removeBtn.style.cssText =
          'padding:4px 7px;font-size:0.8rem;background:#2c1a00;color:#f0c040;' +
          'border:1px solid #f0c040;border-radius:4px;cursor:pointer;flex-shrink:0;';
        removeBtn.addEventListener('click', () => {
          this._state.levelHints.splice(idx, 1);
          if (this._state.levelHints.length === 0) this._state.levelHints = [''];
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
      this._state.levelHints.push('');
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
    challengeChk.checked = this._state.levelChallenge;
    challengeChk.addEventListener('change', () => { this._state.levelChallenge = challengeChk.checked; });
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
    if (this._state.levelNote) {
      container.appendChild(this._createInfoBox('#4a90d9', `📝 ${this._state.levelNote}`));
    }
    const activeHints = this._state.levelHints.filter(h => h.trim());
    if (activeHints.length > 0) {
      container.appendChild(this._createInfoBox('#f0c040', `💡 ${activeHints.join(' → ')}`));
    }
    if (this._state.levelChallenge) {
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
  ];

  private readonly _SPIN_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.SpinStraight,       label: '↻ Spin Straight' },
    { palette: PipeShape.SpinElbow,          label: '↻ Spin Elbow' },
    { palette: PipeShape.SpinTee,            label: '↻ Spin Tee' },
    { palette: PipeShape.SpinStraightCement, label: '↻ Spin Straight (Cement)' },
    { palette: PipeShape.SpinElbowCement,    label: '↻ Spin Elbow (Cement)' },
    { palette: PipeShape.SpinTeeCement,      label: '↻ Spin Tee (Cement)' },
  ];

  private readonly _CHAMBER_PALETTE_ITEMS: Array<{ palette: ChamberPalette; label: string }> = [
    { palette: 'chamber:item',      label: '🎁 Item' },
    { palette: 'chamber:tank',      label: '💧 Tank' },
    { palette: 'chamber:heater',    label: '🔥 Heater / Cooler' },
    { palette: 'chamber:pump',      label: '⬆ Pump / Vacuum' },
    { palette: 'chamber:dirt',      label: '🟫 Dirt' },
    { palette: 'chamber:ice',       label: '🧊 Ice' },
    { palette: 'chamber:snow',      label: '❄ Snow' },
    { palette: 'chamber:sandstone', label: '🪨 Sandstone' },
    { palette: 'chamber:hot_plate', label: '🌡 Hot Plate' },
    { palette: 'chamber:star',      label: '⭐ Star' },
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

    const isGoldSelected = this._GOLD_PALETTE_ITEMS.some(i => i.palette === this._state.palette);
    const isLeakySelected = this._LEAKY_PALETTE_ITEMS.some(i => i.palette === this._state.palette);
    const isFloorSelected = this._FLOOR_PALETTE_ITEMS.some(i => i.palette === this._state.palette);
    // Auto-expand the gold section if a gold item is currently selected
    if (isGoldSelected) this._goldSectionExpanded = true;
    // Auto-expand the leaky section if a leaky item is currently selected
    if (isLeakySelected) this._leakySectionExpanded = true;
    // Auto-expand the floor section if a floor item is currently selected
    if (isFloorSelected) this._floorSectionExpanded = true;
    // Auto-expand the chamber section if a chamber item is currently selected
    if (isChamberPalette(this._state.palette)) this._chamberSectionExpanded = true;
    // Auto-expand the pipes section if a pipe item is currently selected
    if (this._PIPES_PALETTE_ITEMS.some(i => i.palette === this._state.palette)) this._pipesSectionExpanded = true;
    // Auto-expand the spin section if a spin item is currently selected
    if (this._SPIN_PALETTE_ITEMS.some(i => i.palette === this._state.palette)) this._spinSectionExpanded = true;

    const makeItemBtn = (item: { palette: EditorPalette; label: string }, indent = false): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.dataset['palette'] = String(item.palette);
      const isSelected = this._state.palette === item.palette;
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        (indent ? 'margin-left:12px;' : '') +
        'border:1px solid ' + (isSelected ? PALETTE_ITEM_SELECTED_BORDER : PALETTE_ITEM_UNSELECTED_BORDER) + ';' +
        'background:' + (isSelected ? PALETTE_ITEM_SELECTED_BG : PALETTE_ITEM_UNSELECTED_BG) + ';' +
        'color:' + (isSelected ? PALETTE_ITEM_SELECTED_COLOR : PALETTE_ITEM_UNSELECTED_COLOR) + ';';

      btn.addEventListener('click', () => {
        this._state.palette = item.palette;
        this._state.clearLink();
        if (isChamberPalette(item.palette)) {
          this._state.params.chamberContent = chamberPaletteContent(item.palette);
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

    // Collapsible sections: Floor, Pipes, Spin, Gold, Leaky, Blocks (chambers)
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
      panel, 'Spin', this._spinSectionExpanded,
      () => { this._spinSectionExpanded = !this._spinSectionExpanded; panel.replaceWith(this._buildPalette()); },
      '#5a7fbf', '#0a1528', '#7090c0', this._SPIN_PALETTE_ITEMS, makeItemBtn,
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

    const p = this._state.palette;
    const isChm = isChamberPalette(p);
    // Spin-cement shapes are in PIPE_SHAPES but do have a parameter (Drying Time), so exclude them
    // from the "no parameters" early-return check.
    const isParamFreePipe = PIPE_SHAPES.has(p as PipeShape) && !SPIN_CEMENT_SHAPES.has(p as PipeShape);
    if (p === 'erase' || p === PipeShape.Granite || p === PipeShape.Tree || p === PipeShape.GoldSpace ||
        p === PipeShape.OneWay || isParamFreePipe) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = 'No parameters';
      panel.appendChild(none);
      return panel;
    }

    // Cement: show only Drying Time input.
    // Spin-cement tiles: show Drying Time; rotation is adjusted via wheel/Q/W in the editor.
    if (p === PipeShape.Cement || SPIN_CEMENT_SHAPES.has(p as PipeShape)) {
      panel.appendChild(this._labeledInput('Drying Time', String(this._state.params.dryingTime), (v) => {
        this._state.params.dryingTime = Math.max(0, parseInt(v) || 0);
        this._state.applyParamsToLinkedTile();
        this._updateEditorUndoRedoButtons();
        this._renderEditorCanvas();
      }, 'number', '90px'));
      return panel;
    }

    // Source/Chamber(tank): capacity
    const cc = isChm ? chamberPaletteContent(p as ChamberPalette) : null;
    if (p === PipeShape.Source || cc === 'tank') {
      panel.appendChild(this._labeledInput('Capacity', String(this._state.params.capacity), (v) => {
        this._state.params.capacity = Math.max(0, parseInt(v) || 0);
        this._state.applyParamsToLinkedTile();
        this._updateEditorUndoRedoButtons();
        this._renderEditorCanvas();
      }, 'number', '90px'));
    }

    // Source: temperature and pressure
    if (p === PipeShape.Source) {
      panel.appendChild(this._labeledInput('Base Temp', String(this._state.params.temperature), (v) => {
        this._state.params.temperature = Math.max(0, parseInt(v) || 0);
        this._state.applyParamsToLinkedTile();
        this._updateEditorUndoRedoButtons();
        this._renderEditorCanvas();
      }, 'number', '90px'));
      panel.appendChild(this._labeledInput('Base Pressure', String(this._state.params.pressure), (v) => {
        this._state.params.pressure = Math.max(0, parseInt(v) || 0);
        this._state.applyParamsToLinkedTile();
        this._updateEditorUndoRedoButtons();
        this._renderEditorCanvas();
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
      if (this._state.params.chamberContent === opt) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      this._state.params.chamberContent = sel.value as TileParams['chamberContent'];
      if ((TEMP_CHAMBER_CONTENTS as ReadonlySet<string>).has(sel.value)) {
        if (this._state.params.temperature === 0) this._state.params.temperature = 1;
      }
      this._state.applyParamsToLinkedTile();
      this._updateEditorUndoRedoButtons();
      this._renderEditorCanvas();
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
    const descriptors = CHAMBER_PARAM_DESCRIPTORS[cc];
    if (descriptors) {
      for (const { label, field, clampMin } of descriptors) {
        parent.appendChild(this._labeledInput(label, String(this._state.params[field]), (v) => {
          const parsed = parseInt(v) || 0;
          this._state.params[field] = clampMin !== undefined ? Math.max(clampMin, parsed) : parsed;
          this._state.applyParamsToLinkedTile();
          this._updateEditorUndoRedoButtons();
          this._renderEditorCanvas();
        }, 'number', '90px'));
      }
    }
    if (cc === 'item') {
      parent.appendChild(this._buildItemShapeSelector());
      parent.appendChild(this._labeledInput('Count', String(this._state.params.itemCount), (v) => {
        const parsed = parseInt(v);
        this._state.params.itemCount = isNaN(parsed) ? 1 : parsed;
        this._state.applyParamsToLinkedTile();
        this._updateEditorUndoRedoButtons();
        this._renderEditorCanvas();
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
      if (this._state.params.itemShape === shp) o.selected = true;
      itemSel.appendChild(o);
    }
    itemSel.addEventListener('change', () => {
      this._state.params.itemShape = itemSel.value as PipeShape;
      this._state.applyParamsToLinkedTile();
      this._updateEditorUndoRedoButtons();
      this._renderEditorCanvas();
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
      const active = this._state.params.connections[dir];
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
        this._state.params.connections[dir] = !this._state.params.connections[dir];
        this._state.applyParamsToLinkedTile();
        this._updateEditorUndoRedoButtons();
        this._renderEditorCanvas();
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
      drawEditorTile(previewCtx, 0, 0, this._state.buildTileDef());
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
    rowsInp.value = String(this._state.rows);
    rowsInp.style.cssText = gridSizeInputStyle;
    const colsInp = document.createElement('input');
    colsInp.type = 'number';
    colsInp.min = String(GRID_MIN_DIM);
    colsInp.max = String(GRID_MAX_DIM);
    colsInp.value = String(this._state.cols);
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
        rowsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(rVal) ? this._state.rows : rVal)));
        outOfRange = true;
      }
      if (isNaN(cVal) || cVal < GRID_MIN_DIM || cVal > GRID_MAX_DIM) {
        colsInp.value = String(Math.max(GRID_MIN_DIM, Math.min(GRID_MAX_DIM, isNaN(cVal) ? this._state.cols : cVal)));
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

    for (let i = 0; i < this._state.inventory.length; i++) {
      const item = this._state.inventory[i];
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
      const existing = this._state.inventory.find((it) => it.shape === shp);
      if (existing) {
        existing.count++;
      } else {
        this._state.inventory.push({ shape: shp, count: 1 });
      }
      this._state.recordSnapshot();
      this._updateEditorUndoRedoButtons();
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
      this._state.inventory[idx].count = Math.max(0, parseInt(countInp.value) || 0);
      this._state.recordSnapshot();
      this._updateEditorUndoRedoButtons();
    });
    row.appendChild(countInp);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '✕';
    delBtn.style.cssText =
      'padding:2px 6px;font-size:0.75rem;background:#2a2a4a;color:#e74c3c;' +
      'border:1px solid #e74c3c;border-radius:3px;cursor:pointer;';
    delBtn.addEventListener('click', () => {
      this._state.inventory.splice(idx, 1);
      this._state.recordSnapshot();
      this._updateEditorUndoRedoButtons();
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

    if (this._state.inventory.length === 0) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = 'None';
      panel.appendChild(none);
    }
    for (const item of this._state.inventory) {
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
    const drag: DragState | null = this._editorInput?.dragState ?? null;

    if (!drag && this._state.hover) {
      if (this._state.palette === 'erase') {
        const isEmptyCell = (this._state.grid[this._state.hover.row]?.[this._state.hover.col] ?? null) === null;
        overlay = { pos: this._state.hover, def: null, alpha: isEmptyCell ? 0.2 : 1 };
      } else {
        // Placement preview: transparent tile at hover
        overlay = { pos: this._state.hover, def: this._state.buildTileDef(), alpha: 0.55 };
      }
    }

    renderEditorCanvas(ctx, this._state.grid, this._state.rows, this._state.cols, overlay, drag, this._state.linkedTilePos);
  }

  // ─── Editor canvas mouse events ────────────────────────────────────────────

  /** Flashes an error message below the canvas when the Source placement constraint is violated. */
  private _showSourceError(): void {
    const el = this._editorSourceErrorEl;
    if (!el) return;
    el.textContent = 'Only one source tile is allowed.';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2000);
  }

  // ─── Backward-compat proxies for test access ──────────────────────────────
  // Tests cast CampaignEditor to typed interfaces and call these methods directly.
  // They delegate to _editorInput so that gesture logic stays in EditorInputHandler.

  private _onEditorMouseDown(e: MouseEvent): void { this._editorInput?._onMouseDown(e); }
  private _onEditorMouseUp(e: MouseEvent): void { this._editorInput?._onMouseUp(e); }
  private _onEditorCanvasMouseMove(e: MouseEvent): void { this._editorInput?._onMouseMove(e); }
  private _onEditorCanvasWheel(e: WheelEvent): void { this._editorInput?._onWheel(e); }
  private _onEditorCanvasRightClick(e: MouseEvent): void { this._editorInput?._onRightClick(e); }
  private get _paintDragActive(): boolean { return this._editorInput?.paintDragActive ?? false; }
  private get _rightEraseDragActive(): boolean { return this._editorInput?.rightEraseDragActive ?? false; }
  private get _suppressNextContextMenu(): boolean { return this._editorInput?.suppressNextContextMenu ?? false; }
  private _canvasPos(e: MouseEvent): { row: number; col: number } | null {
    return this._editorInput?._canvasPos(e) ?? null;
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
    const intrinsicW = this._state.cols * TILE_SIZE;
    const intrinsicH = this._state.rows * TILE_SIZE;

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

  // ─── Editor undo / redo ────────────────────────────────────────────────────

  private _editorUndo(): void {
    if (!this._state.undo()) return;
    this._onStateRestored();
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  private _editorRedo(): void {
    if (!this._state.redo()) return;
    this._onStateRestored();
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  /**
   * Called after undo/redo restores state: updates the canvas dimensions and
   * rebuilds the inventory panel to reflect the newly restored state.
   */
  private _onStateRestored(): void {
    if (this._editorCanvas) {
      setTileSize(computeTileSize(this._state.rows, this._state.cols));
      this._editorCanvas.width  = this._state.cols * TILE_SIZE;
      this._editorCanvas.height = this._state.rows * TILE_SIZE;
    }
    this._updateCanvasDisplaySize();
    const invPanel = document.getElementById('editor-inventory-panel');
    if (invPanel) invPanel.replaceWith(this._buildInventoryEditor());
  }

  private _updateEditorUndoRedoButtons(): void {
    const undoBtn = document.getElementById('editor-undo-btn') as HTMLButtonElement | null;
    const redoBtn = document.getElementById('editor-redo-btn') as HTMLButtonElement | null;
    if (undoBtn) {
      undoBtn.disabled = !this._state.canUndo;
      undoBtn.style.opacity = undoBtn.disabled ? '0.4' : '1';
      undoBtn.style.cursor = undoBtn.disabled ? 'not-allowed' : 'pointer';
    }
    if (redoBtn) {
      redoBtn.disabled = !this._state.canRedo;
      redoBtn.style.opacity = redoBtn.disabled ? '0.4' : '1';
      redoBtn.style.cursor = redoBtn.disabled ? 'not-allowed' : 'pointer';
    }
  }

  // ─── Grid resize ──────────────────────────────────────────────────────────

  private _resizeGrid(newRows: number, newCols: number): void {
    this._state.resize(newRows, newCols);
    this._updateEditorUndoRedoButtons();
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
    this._state.slide(dir);
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  // ─── Level validation ──────────────────────────────────────────────────────

  private _validateLevel(): ValidationResult {
    const msgs: string[] = [];
    let sourcePos: { row: number; col: number } | null = null;
    const sinkPositions: Array<{ row: number; col: number }> = [];
    let ok = true;

    // Count sources and sinks
    for (let r = 0; r < this._state.rows; r++) {
      for (let c = 0; c < this._state.cols; c++) {
        const def = this._state.grid[r]?.[c];
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
    const hasInventory = this._state.inventory.some((it) => it.count > 0);
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
    for (const row of this._state.grid) {
      for (const cell of row) {
        if (cell?.shape === PipeShape.Chamber && cell.chamberContent === 'star') {
          starCount++;
        }
      }
    }

    const rawGrid = JSON.parse(JSON.stringify(this._state.grid)) as (TileDef | null)[][];
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
      name: this._state.levelName,
      rows: this._state.rows,
      cols: this._state.cols,
      grid: cleanGrid,
      inventory: JSON.parse(JSON.stringify(this._state.inventory)) as InventoryItem[],
    };
    if (this._state.levelNote.trim()) def.note = this._state.levelNote.trim();
    const activeHints = this._state.levelHints.map(h => h.trim()).filter(h => h.length > 0);
    if (activeHints.length > 0) def.hints = activeHints;
    if (starCount > 0) def.starCount = starCount;
    if (this._state.levelChallenge) def.challenge = true;
    return def;
  }

  // ─── Save level ────────────────────────────────────────────────────────────

  private _saveLevel(campaign: CampaignDef, chapterIdx: number, levelIdx: number): void {
    const newLevel = this._buildCurrentLevelDef();
    this._service.saveLevel(campaign, chapterIdx, levelIdx, newLevel);
    this._state.markSaved();

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
    this._service.createCampaign(name.trim(), author);
    this._showCampaignList();
  }

  private _addChapter(campaign: CampaignDef): void {
    const name = prompt('Chapter name:');
    if (!name?.trim()) return;
    this._service.addChapter(campaign, name.trim());
    this._showCampaignDetail();
  }

  private _addLevel(campaign: CampaignDef, chapterIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    const name = prompt('Level name:', 'New Level');
    if (!name?.trim()) return;
    const newLevel = this._service.addLevel(campaign, chapterIdx, name.trim());
    // Open the level editor immediately
    this._activeLevelIdx = chapter.levels.length - 1;
    this._openLevelEditor(newLevel, false);
  }

  private _deleteCampaign(campaignId: string): void {
    const campaign = this._service.getCampaign(campaignId);
    if (!campaign) return;
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
    this._service.deleteCampaign(campaignId);
    this._showCampaignList();
  }

  // ─── Dev: Data validation ─────────────────────────────────────────────────

  /**
   * Delegate to {@link CampaignService.scanData} for backward compatibility.
   * All validation logic lives in the service.
   */
  private _scanCampaignData(
    campaign: CampaignDef,
    dryRun: boolean,
  ): Map<string, Map<string, number>> {
    return this._service.scanData(campaign, dryRun);
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
        const cleanIssues = this._service.scanData(campaign, false);
        this._service.touch(campaign);
        this._service.save();
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
    const json = this._service.exportToJson(campaign);
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
        let result: ImportResult;
        try {
          result = this._service.parseImport(text);
        } catch {
          alert('Failed to parse campaign file. Please check the format.');
          return;
        }

        if (result.conflict === 'same_version') {
          this._showImportSameVersionDialog(result.campaign.name, result.campaign.lastUpdated);
          return;
        }

        if (result.conflict === 'version_conflict') {
          this._showImportVersionConflictDialog(result.campaign, result.existing!, result.isNewer!, () => {
            // Replace the campaign record while retaining player progress (keyed by ID).
            this._service.acceptImport(result);
            alert(`Campaign "${result.campaign.name}" imported successfully.`);
            this.hide();
            this._onPlayCampaign(result.campaign);
          });
          return;
        }

        // No conflict – add the new campaign directly.
        this._service.acceptImport(result);
        alert(`Campaign "${result.campaign.name}" imported successfully.`);
        this.hide();
        this._onPlayCampaign(result.campaign);
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
    this._service.save();
  }

  /** Return all campaigns (user campaigns) for external use (e.g. campaign select screen). */
  getAllCampaigns(): CampaignDef[] {
    return this._service.getAllCampaigns();
  }

  /** Reload campaigns from storage (called after an import or external change). */
  reloadCampaigns(): void {
    this._service.reload();
  }
}

// ─── Re-exports from sub-modules ────────────────────────────────────────────
export { CampaignService, ImportResult } from './campaignService';
