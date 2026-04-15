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

import { CampaignDef, LevelDef, TileDef, PipeShape } from '../types';
import { loadCampaignProgress, computeCampaignCompletionPct, loadActiveCampaignId } from '../persistence';
import { ChapterMapEditorSection, ChapterMapEditorCallbacks } from './chapterMapEditor';
import { CampaignService, ImportResult } from './campaignService';
import { LevelEditorState } from './levelEditorState';
import { TileParamsPanel } from './tileParamsPanel';
import { LevelMetadataPanel } from './levelMetadataPanel';

/** Horizontal padding (px) of the main editor layout container. */
const EDITOR_LAYOUT_PADDING = 16;
/** Gap (px) between flex columns in the main editor layout. */
const EDITOR_LAYOUT_GAP = 16;
import {
  EditorScreen,
  generateLevelId,
  gzipString,
  ungzipBytes,
  blobToBytes,
  isGzipBytes,
  getValidTileDefKeys,
  EDITOR_CANVAS_BORDER,
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
} from './types';
import { renderEditorCanvas, HoverOverlay, DragState } from './renderer';
import { EditorInputHandler } from './editorInputHandler';
import { DataValidationDialog } from './dataValidationDialog';
import { EditorDialogs } from './editorDialogs';
import { renderMinimap } from '../visuals/minimap';
import { validateLevel } from './levelValidator';
import { sfxManager, SfxId } from '../sfxManager';
import { updateCanvasDisplaySize } from './canvasUtils';
import { isTouchDevice } from '../deviceUtils';
import { ERROR_COLOR, MUTED_BTN_BG, RADIUS_MD, RADIUS_SM, UI_BG, UI_BORDER, UI_GOLD } from '../uiConstants';
import { createButton, showTimedMessage } from '../uiHelpers';
import { ONLY_ONE_SOURCE } from './validationMessages';

// ─── CampaignEditor class ─────────────────────────────────────────────────────

export class CampaignEditor {
  private readonly _el: HTMLElement;

  /** Service that owns all campaign/chapter/level data state and persistence. */
  private _service: CampaignService;

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
  /** Tile palette + parameter panel component. */
  private readonly _paramsPanel: TileParamsPanel;
  /** Level metadata panel (name, note, hints, challenge, grid size, inventory). */
  private _metadataPanel: LevelMetadataPanel | null = null;

  private readonly _onClose: () => void;
  private readonly _onPlaytest: (level: LevelDef) => void;
  private readonly _onPlayCampaign: (campaign: CampaignDef) => void;

  /** Chapter map editor sub-section (manages grid, palette, canvas, undo/redo). */
  private readonly _chapterMapEditor: ChapterMapEditorSection;

  /** Data validation dialog (dev tool). */
  private readonly _dataValidator: DataValidationDialog;

  /** Import and unsaved-changes modal dialogs. */
  private readonly _dialogs: EditorDialogs;

  /** Bound keydown handler stored so it can be removed by destroy(). */
  private readonly _keydownHandler: (e: KeyboardEvent) => void;

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
      buildBtn: (l, bg, c, cb, suppressClick) => this._btn(l, bg, c, cb, '', suppressClick),
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

    this._dataValidator = new DataValidationDialog(this._service, this._btn.bind(this));

    this._paramsPanel = new TileParamsPanel({
      getState: () => this._state,
      renderCanvas: () => this._renderEditorCanvas(),
      updateUndoRedoButtons: () => this._updateEditorUndoRedoButtons(),
    });

    this._el = document.createElement('div');
    this._el.style.cssText =
      'display:none;position:fixed;inset:0;background:#0d1520;overflow:auto;z-index:200;' +
      'font-family:Arial,sans-serif;color:#eee;flex-direction:column;align-items:center;';
    document.body.appendChild(this._el);

    this._dialogs = new EditorDialogs(this._el, this._btn.bind(this));

    // Global keyboard handler for shortcuts (guarded by active screen)
    this._keydownHandler = (e: KeyboardEvent) => {
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
    };
    document.addEventListener('keydown', this._keydownHandler);
  }

  /** Show the campaign editor (campaign list screen). */
  show(): void {
    this._service.ensureCampaignMaps();
    this._el.style.display = 'flex';
    document.body.classList.add('editor-open');
    this._showCampaignList();
  }

  /**
   * Show the campaign editor, restoring the screen that was active when hide() was called.
   * Use this after playtesting to return the user to the level they were editing.
   */
  showAndRestore(): void {
    this._service.ensureCampaignMaps();
    this._el.style.display = 'flex';
    document.body.classList.add('editor-open');
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
    document.body.classList.remove('editor-open');
  }

  /** Remove event listeners and clean up DOM resources. */
  destroy(): void {
    document.removeEventListener('keydown', this._keydownHandler);
  }

  // ─── Toolbar ─────────────────────────────────────────────────────────────

  private _buildToolbar(title: string, onBack: (() => void) | null): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.style.cssText =
      'width:100%;max-width:900px;display:flex;align-items:center;gap:12px;' +
      `padding:14px 20px;background:${UI_BG};border-bottom:2px solid ${UI_BORDER};` +
      'box-sizing:border-box;position:sticky;top:0;z-index:10;';

    if (onBack) {
      const backBtn = this._btn('← Back', MUTED_BTN_BG, '#aaa', () => {
        sfxManager.play(SfxId.Back);
        onBack();
      }, '', true);
      toolbar.appendChild(backBtn);
    }

    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.cssText = 'font-size:1.2rem;font-weight:bold;flex:1;';
    toolbar.appendChild(titleEl);

    return toolbar;
  }

  // ─── Button helpers ────────────────────────────────────────────────────────

  private _btn(label: string, bg: string, color: string, onClick: () => void, extraStyle = '', suppressClick = false): HTMLButtonElement {
    return createButton(label, bg, color, () => {
      if (!suppressClick) sfxManager.play(SfxId.Click);
      onClick();
    }, extraStyle);
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
      btns.appendChild(this._btn('▲', UI_BG, '#aaa', () => {
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
      btns.appendChild(this._btn('▼', UI_BG, '#aaa', () => {
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
      `background:${UI_BG};border:2px solid ${borderColor};border-radius:8px;` +
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
      `background:${UI_BG};border:1px solid ${borderColor};border-radius:${RADIUS_MD};` +
      'padding:10px 14px;font-size:0.85rem;color:#eee;';
    el.textContent = text;
    return el;
  }

  /** Set the campaign's lastUpdated timestamp to the current time. */
  private _touchCampaign(campaign: CampaignDef): void {
    this._service.touch(campaign);
  }

  private _labeledInput(labelText: string, value: string, onInput: (v: string) => void, type = 'text', inputWidth?: string): HTMLElement {
    return this._paramsPanel.labeledInput(labelText, value, onInput, type, inputWidth);
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

    // Touch device notice
    if (isTouchDevice()) {
      const notice = document.createElement('div');
      notice.style.cssText =
        `background:#2a1a00;border:1px solid #ffa500;border-radius:${RADIUS_MD};padding:12px 16px;` +
        'color:#ffa500;font-size:0.9rem;line-height:1.5;';
      notice.textContent =
        '⚠️ The Campaign Editor is designed for desktop use and may be difficult to operate on touch devices. ' +
        'For the best experience, use a mouse and keyboard.';
      content.appendChild(notice);
    }

    // Action bar
    const actionBar = document.createElement('div');
    actionBar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
    actionBar.appendChild(
      this._btn('➕ New Campaign', UI_BG, '#7ed321', () => this._createCampaign()),
    );
    actionBar.appendChild(
      this._btn('📥 Import', UI_BG, '#4a90d9', () => this._importCampaign()),
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
      const activeBtn = this._btn('Active', UI_BG, '#888', () => {}, 'cursor:default;');
      activeBtn.disabled = true;
      btns.appendChild(activeBtn);
    } else {
      btns.appendChild(this._btn('▶ Play', UI_BG, '#7ed321', () => {
        sfxManager.play(SfxId.ChapterSelect);
        this.hide();
        this._onPlayCampaign(campaign);
      }));
    }

    if (!isOfficial) {
      btns.appendChild(this._btn('✏️ Edit', UI_BG, '#f0c040', () => {
        sfxManager.play(SfxId.ChapterSelect);
        this._activeCampaignId = campaign.id;
        this._showCampaignDetail();
      }));
    } else {
      btns.appendChild(this._btn('👁 View', UI_BG, '#aaa', () => {
        this._activeCampaignId = campaign.id;
        this._showCampaignDetail();
      }));
    }

    btns.appendChild(this._btn('📤 Export', UI_BG, '#4a90d9', () => {
      this._exportCampaign(campaign);
    }));

    if (!isOfficial) {
      btns.appendChild(this._btn('🗑 Delete', UI_BG, ERROR_COLOR, () => {
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
      toolbar.appendChild(this._btn('📤 Export', UI_BG, '#4a90d9', () => this._exportCampaign(campaign)));
      toolbar.appendChild(this._btn('🔍 Dev – Validate data', UI_BG, '#f0c040',
        () => this._dataValidator.show(this._el, campaign)));
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
        `background:${UI_BG};border:1px solid ${UI_GOLD};border-radius:8px;padding:12px 16px;` +
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
        `background:${UI_BG};border:1px solid ${UI_BORDER};border-radius:8px;padding:16px;` +
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
      chaptersHeader.appendChild(this._btn('➕ Add Chapter', UI_BG, '#7ed321', () => {
        sfxManager.play(SfxId.ChapterSelect);
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
    if (chapter.grid && chapter.rows && chapter.cols) {
      const pseudoLevel: LevelDef = {
        id: chapter.id,
        name: chapter.name,
        rows: chapter.rows,
        cols: chapter.cols,
        grid: chapter.grid,
        inventory: [],
      };
      const minimap = renderMinimap(pseudoLevel);
      minimap.style.cssText = 'display:block;margin-top:4px;image-rendering:pixelated;border:2px solid white;';
      info.appendChild(minimap);
    }

    const editOrViewLabel = readOnly ? '👁 View' : '✏️ Edit';
    btns.appendChild(this._btn(editOrViewLabel, UI_BG, '#f0c040', () => {
      this._activeChapterIdx = chapterIdx;
      this._showChapterDetail();
    }));

    if (!readOnly) {
      this._appendReorderButtons(btns, campaign.chapters, chapterIdx, campaign, () => this._showCampaignDetail());
      btns.appendChild(this._btn('🗑', UI_BG, ERROR_COLOR, () => {
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
        `background:${UI_BG};border:1px solid ${UI_BORDER};border-radius:8px;padding:16px;`;
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
      levelsHeader.appendChild(this._btn('➕ Add Level', UI_BG, '#7ed321', () => {
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
    minimap.style.cssText = 'display:block;margin-top:4px;image-rendering:pixelated;cursor:pointer;border:2px solid white;';
    minimap.addEventListener('click', () => {
      this._activeLevelIdx = levelIdx;
      this._openLevelEditor(level, readOnly);
    });
    info.appendChild(name);
    info.appendChild(minimap);

    const editOrViewLabel = readOnly ? '👁 View' : '✏️ Edit';
    btns.appendChild(this._btn(editOrViewLabel, UI_BG, '#f0c040', () => {
      this._activeLevelIdx = levelIdx;
      this._openLevelEditor(level, readOnly);
    }));

    if (!readOnly) {
      btns.appendChild(this._btn('📋 Duplicate', UI_BG, '#aaa', () => {
        this._service.duplicateLevel(campaign, chapterIdx, levelIdx);
        this._showChapterDetail();
      }));

      this._appendReorderButtons(btns, chapter.levels, levelIdx, campaign, () => this._showChapterDetail(),
        (fromIdx, toIdx) => this._service.reorderLevels(campaign, chapterIdx, fromIdx, toIdx));
      btns.appendChild(this._btn('🗑', UI_BG, ERROR_COLOR, () => {
        if (confirm(`Delete level "${level.name}"?`)) {
          this._service.deleteLevel(campaign, chapterIdx, levelIdx);
          this._showChapterDetail();
        }
      }));

      if (campaign.chapters.length > 1) {
        const sel = document.createElement('select');
        sel.style.cssText =
          `background:${UI_BG};color:#aaa;border:1px solid ${UI_BORDER};` +
          `border-radius:${RADIUS_MD};padding:6px 8px;font-size:0.85rem;cursor:pointer;`;
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

    this._metadataPanel = new LevelMetadataPanel(
      {
        getState: () => this._state,
        renderCanvas: () => this._renderEditorCanvas(),
        updateUndoRedoButtons: () => this._updateEditorUndoRedoButtons(),
        resizeGrid: (r, c) => this._resizeGrid(r, c),
        slideGrid: (d) => this._slideGrid(d),
        rotateGrid: (cw) => this._rotateGrid(cw),
        reflectGrid: () => this._reflectGrid(),
        flipGridHorizontal: () => this._flipGridHorizontal(),
        flipGridVertical:   () => this._flipGridVertical(),
      },
      this._btn.bind(this),
    );

    const toolbar = this._buildToolbar(
      readOnly ? `👁 View Level: ${this._state.levelName}` : `✏️ Level Editor (${this._activeChapterIdx + 1}-${this._activeLevelIdx + 1})`,
      () => {
        if (!readOnly && this._state.hasUnsavedChanges) {
          this._dialogs.showUnsavedChanges(
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
      leftCol.appendChild(this._paramsPanel.buildStylePanel());
      leftCol.appendChild(this._paramsPanel.buildPalette());
    }

    // ── Middle column: canvas + metadata ──────────────────────────────────
    const midCol = this._buildLevelEditorMidCol(readOnly);

    // ── Right column: inventory editor, tile params, grid size ────────────
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:180px;';

    if (!readOnly) {
      rightCol.appendChild(this._metadataPanel!.buildInventoryEditor());
      rightCol.appendChild(this._paramsPanel.buildParamPanel());
      rightCol.appendChild(this._metadataPanel!.buildGridSizePanel());
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
    const undoBtn = this._btn('↩ Undo', MUTED_BTN_BG, '#aaa', () => this._editorUndo(), '', true);
    undoBtn.id = 'editor-undo-btn';
    toolbar.appendChild(undoBtn);
    const redoBtn = this._btn('↪ Redo', MUTED_BTN_BG, '#aaa', () => this._editorRedo(), '', true);
    redoBtn.id = 'editor-redo-btn';
    toolbar.appendChild(redoBtn);

    // Validate
    toolbar.appendChild(this._btn('✔ Validate', UI_BG, '#7ed321', () => {
      const levelDef = this._buildCurrentLevelDef();
      const result = this._validateLevel(levelDef);
      const icon = result.ok ? '✅' : '❌';
      alert(`${icon} Validation\n\n${result.messages.join('\n')}`);
    }));

    // Playtest
    toolbar.appendChild(this._btn('▶ Playtest', UI_BG, '#f0c040', () => {
      const levelDef = this._buildCurrentLevelDef();
      const result = this._validateLevel(levelDef);
      if (!result.ok) {
        alert(`❌ Validation\n\n${result.messages.join('\n')}`);
        return;
      }
      this._saveLevel(campaign, this._activeChapterIdx, this._activeLevelIdx);
      const chapter = campaign.chapters[this._activeChapterIdx];
      const level = chapter?.levels[this._activeLevelIdx];
      if (!level) return;
      const chapterNum = this._activeChapterIdx + 1;
      const levelNum = this._activeLevelIdx + 1;
      this._onPlaytest({ ...level, name: `${chapterNum}-${levelNum}: ${level.name}` });
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
    midCol.appendChild(this._metadataPanel!.buildNameSection(readOnly));
    midCol.appendChild(this._buildEditorCanvasSection(readOnly));
    if (!readOnly) {
      midCol.appendChild(this._metadataPanel!.buildTextFieldsSection());
    } else {
      midCol.appendChild(this._metadataPanel!.buildReadOnlyMetaSection());
    }
    return midCol;
  }


  /**
   * Build the editor canvas element and (in edit mode) attach mouse event
   * listeners and a source-placement error div.  Sets `_editorCanvas`,
   * `_editorCtx`, and `_editorSourceErrorEl` as side effects.
   */
  private _buildEditorCanvasSection(readOnly: boolean): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      `border:${EDITOR_CANVAS_BORDER}px solid #4a90d9;border-radius:${RADIUS_SM};cursor:` + (readOnly ? 'default' : 'crosshair') + ';' +
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
        showSinkError: () => this._showSinkError(),
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

    renderEditorCanvas(ctx, this._state.grid, this._state.rows, this._state.cols, overlay, drag, this._state.linkedTilePos, undefined, undefined, undefined, this._state.levelStyle);
  }

  // ─── Editor canvas mouse events ────────────────────────────────────────────

  /** Flashes an error message below the canvas when the Source placement constraint is violated. */
  private _showSourceError(): void {
    const el = this._editorSourceErrorEl;
    if (!el) return;
    showTimedMessage(el, ONLY_ONE_SOURCE);
  }

  /** Flashes an error message below the canvas when the Sink placement constraint is violated. */
  private _showSinkError(): void {
    const el = this._editorSourceErrorEl;
    if (!el) return;
    showTimedMessage(el, 'Only one sink tile is allowed.');
  }

  /** Rebuild and replace the palette and param panels in the DOM. */
  private _refreshPaletteUI(): void {
    this._paramsPanel.refresh();
  }

  private _updateCanvasDisplaySize(): void {
    if (!this._editorCanvas) return;
    updateCanvasDisplaySize(
      this._editorCanvas,
      this._state.rows,
      this._state.cols,
      this._editorMainLayout,
      EDITOR_LAYOUT_GAP,
      EDITOR_LAYOUT_PADDING,
      false,
    );
  }

  // ─── Editor undo / redo ────────────────────────────────────────────────────

  private _editorUndo(): void {
    if (!this._state.undo()) return;
    sfxManager.play(SfxId.Undo);
    this._onStateRestored();
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  private _editorRedo(): void {
    if (!this._state.redo()) return;
    sfxManager.play(SfxId.Redo);
    this._onStateRestored();
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  /**
   * Called after undo/redo restores state: updates the canvas dimensions and
   * rebuilds the inventory panel to reflect the newly restored state.
   */
  private _onStateRestored(): void {
    this._updateCanvasDisplaySize();
    const invPanel = document.getElementById('editor-inventory-panel');
    if (invPanel) invPanel.replaceWith(this._metadataPanel!.buildInventoryEditor());
    this._metadataPanel?.rebuildGridSizePanel();
    this._paramsPanel.refreshStylePanel();
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
    sfxManager.play(SfxId.BoardSlide);
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  /**
   * Rotate the entire board 90° CW or CCW, updating tile positions,
   * connections, and orientations.  Swaps canvas dimensions, refreshes
   * the palette/param panel to reflect the rotated selected tile, and
   * records an undo snapshot.
   */
  private _rotateGrid(clockwise: boolean): void {
    this._state.rotate(clockwise);
    sfxManager.play(SfxId.BoardSlide);
    this._updateEditorUndoRedoButtons();
    this._updateCanvasDisplaySize();
    this._refreshPaletteUI();
    this._metadataPanel?.rebuildGridSizePanel();
    this._renderEditorCanvas();
  }

  /**
   * Reflect the entire board about the main diagonal (x=y / transpose),
   * updating tile positions, connections, and orientations.  Swaps canvas
   * dimensions, refreshes the palette/param panel, and records an undo snapshot.
   */
  private _reflectGrid(): void {
    this._state.reflect();
    sfxManager.play(SfxId.BoardSlide);
    this._updateEditorUndoRedoButtons();
    this._updateCanvasDisplaySize();
    this._refreshPaletteUI();
    this._metadataPanel?.rebuildGridSizePanel();
    this._renderEditorCanvas();
  }

  /**
   * Flip the entire board horizontally (left–right reflection), updating tile
   * positions, connections, and orientations.  Refreshes the palette/param
   * panel and records an undo snapshot.
   */
  private _flipGridHorizontal(): void {
    this._state.flipHorizontal();
    sfxManager.play(SfxId.BoardSlide);
    this._updateEditorUndoRedoButtons();
    this._refreshPaletteUI();
    this._metadataPanel?.rebuildGridSizePanel();
    this._renderEditorCanvas();
  }

  /**
   * Flip the entire board vertically (top–bottom reflection), updating tile
   * positions, connections, and orientations.  Refreshes the palette/param
   * panel and records an undo snapshot.
   */
  private _flipGridVertical(): void {
    this._state.flipVertical();
    sfxManager.play(SfxId.BoardSlide);
    this._updateEditorUndoRedoButtons();
    this._refreshPaletteUI();
    this._metadataPanel?.rebuildGridSizePanel();
    this._renderEditorCanvas();
  }

  // ─── Validate level ────────────────────────────────────────────────────────

  private _validateLevel(levelDef: LevelDef): { ok: boolean; messages: string[] } {
    return validateLevel(levelDef);
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

    const rawGrid = structuredClone(this._state.grid);
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
      inventory: structuredClone(this._state.inventory),
    };
    if (this._state.levelNote.trim()) def.note = this._state.levelNote.trim();
    const activeHints = this._state.levelHints.map(h => h.trim()).filter(h => h.length > 0);
    if (activeHints.length > 0) def.hints = activeHints;
    if (starCount > 0) def.starCount = starCount;
    if (this._state.levelChallenge) def.challenge = true;
    if (this._state.levelStyle) def.style = this._state.levelStyle;
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
  // (Moved to DataValidationDialog — see dataValidationDialog.ts)

  /**
   * Delegate to {@link CampaignService.scanData} for backward compatibility.
   * @deprecated Use this._service.scanData() or DataValidationDialog directly.
   */
  private _scanCampaignData(
    campaign: CampaignDef,
    dryRun: boolean,
  ): Map<string, Map<string, number>> {
    return this._service.scanData(campaign, dryRun);
  }

  /** Export a campaign by compressing the JSON with gzip and triggering a download.
   *  Unrecognized fields are stripped from the output via a clean pass.
   *
   *  An on-screen diagnostic overlay is shown so users can identify the step
   *  that fails if the download does not start. */
  private _exportCampaign(campaign: CampaignDef): void {
    const log = this._createExportLog();

    let json: string;
    try {
      json = this._service.exportToJson(campaign);
      log.append(`✅ JSON serialised (${json.length} chars)`);
    } catch (err) {
      log.append(`❌ JSON serialisation failed: ${String(err)}`);
      log.done(false);
      return;
    }

    log.append('⏳ Compressing with gzip …');

    gzipString(json).then((compressed) => {
      log.append(`✅ gzip complete (${compressed.byteLength} bytes)`);

      try {
        // Copy to a plain ArrayBuffer to satisfy strict BlobPart typing.
        const buf = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
        const blob = new Blob([buf], { type: 'application/gzip' });
        log.append(`✅ Blob created (${blob.size} bytes, type=${blob.type})`);

        const url = URL.createObjectURL(blob);
        log.append(`✅ Object URL: ${url}`);

        const filename = `${campaign.name.replace(/\s+/g, '_')}.pipes.json.gz`;
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        // Attach to document so Firefox triggers the download on programmatic click.
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        log.append(`✅ Anchor click fired (filename="${filename}")`);

        // Defer revocation long enough for the browser to initiate the download.
        // A 0 ms delay is too short for Chrome; use 10 s as a safe margin.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);

        log.append('✅ Export complete – download should have started.');
        log.done(true);
      } catch (err) {
        log.append(`❌ Post-compression step failed: ${String(err)}`);
        log.done(false);
      }
    }).catch((err) => {
      log.append(`❌ gzip compression failed: ${String(err)}`);
      log.done(false);
    });
  }

  /**
   * Create a small on-screen diagnostic overlay that accumulates timestamped
   * log lines.  The overlay is only shown onscreen if there was a failure;
   * on success it is never attached to the DOM.  On failure it stays visible
   * until the user clicks it.
   */
  private _createExportLog(): { append(msg: string): void; done(ok: boolean): void } {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;bottom:12px;right:12px;z-index:99999;max-width:480px;' +
      'background:#1a1a2e;color:#ccc;font:12px/1.5 monospace;' +
      'padding:10px 14px;border-radius:8px;border:1px solid #4a90d9;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.6);max-height:50vh;overflow-y:auto;';
    const title = document.createElement('div');
    title.textContent = '📤 Export log';
    title.style.cssText = 'font-weight:bold;color:#4a90d9;margin-bottom:6px;';
    overlay.appendChild(title);

    const t0 = performance.now();

    return {
      append(msg: string) {
        const ms = (performance.now() - t0).toFixed(0);
        const line = document.createElement('div');
        line.textContent = `[${ms} ms] ${msg}`;
        overlay.appendChild(line);
        overlay.scrollTop = overlay.scrollHeight;
      },
      done(ok: boolean) {
        if (ok) {
          return;
        }
        title.textContent = '📤 Export log ❌ Failed (click to dismiss)';
        title.style.color = ERROR_COLOR;
        overlay.style.cursor = 'pointer';
        overlay.addEventListener('click', () => { overlay.remove(); }, { once: true });
        document.body.appendChild(overlay);
      },
    };
  }

  /** Import a campaign from a JSON or gzip-compressed JSON file.
   *  Compression is detected automatically by inspecting the gzip magic bytes. */
  private _importCampaign(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gz,.pipes.json.gz,application/json,application/gzip';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const processText = (text: string) => {
        let result: ImportResult;
        try {
          result = this._service.parseImport(text);
        } catch {
          alert('Failed to parse campaign file. Please check the format.');
          return;
        }

        if (result.conflict === 'same_version') {
          this._dialogs.showImportSameVersion(result.campaign.name, result.campaign.lastUpdated);
          return;
        }

        if (result.conflict === 'version_conflict') {
          this._dialogs.showImportVersionConflict(result.campaign, result.existing!, result.isNewer!, () => {
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

      blobToBytes(file).then((bytes) => {
        if (isGzipBytes(bytes)) {
          return ungzipBytes(bytes).then(processText);
        }
        processText(new TextDecoder().decode(bytes));
      }).catch(() => {
        alert('Failed to read campaign file. The file may be corrupted or invalid.');
      });
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
