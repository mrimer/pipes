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

import type { CampaignDef, LevelDef, TileDef} from '../types';
import { PipeShape } from '../types';
import { getActiveSlotIndex } from '../profile/activeProfile';
import { loadSlotMeta } from '../profile/playerProfileSlots';
import type { ChapterMapEditorCallbacks } from './chapterMapEditor';
import { ChapterMapEditorSection } from './chapterMapEditor';
import type { CampaignMapEditorCallbacks } from './campaignMapEditor';
import { CampaignMapEditorSection } from './campaignMapEditor';
import { CampaignService } from './campaignService';
import { CampaignImportExportFlow } from './campaignImportExportFlow';
import { CampaignBrowserSection } from './campaignBrowserSection';
import { LevelEditorState } from './levelEditorState';
import { TileParamsPanel } from './tileParamsPanel';
import { LevelMetadataPanel } from './levelMetadataPanel';
import {
  EditorScreen,
  generateLevelId,
  getValidTileDefKeys,
  EDITOR_CANVAS_BORDER,
  EDITOR_PANEL_BASE_CSS,
  EDITOR_PANEL_TITLE_CSS,
} from './types';
import type { HoverOverlay, DragState } from './editorRenderer';
import { renderEditorCanvas } from './editorRenderer';
import { EditorInputHandler } from './editorInputHandler';
import { DataValidationDialog } from './dataValidationDialog';
import { EditorDialogs } from './editorDialogs';
import { isTextEntryShortcutTarget } from './mapEditorSectionUtils';
import { validateLevel } from './levelValidator';
import { sfxManager, SfxId } from '../audio/sfxManager';
import { musicManager, selectGroupForContext } from '../audio/musicManager';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';
import { updateCanvasDisplaySize } from './canvasUtils';
import { ERROR_COLOR, MUTED_BTN_BG, RADIUS_SM, UI_BG, UI_BORDER } from '../uiConstants';
import { createButton, showTimedMessage } from '../uiHelpers';
import { ONLY_ONE_SOURCE } from './validationMessages';
import { commandKeyManager } from '../commandKeyManager';
import { applyScrollingPipeBackground, unregisterScrollingPipeBackground } from '../uiBackground';

/** Horizontal padding (px) of the main editor layout container. */
const EDITOR_LAYOUT_PADDING = 16;
/** Gap (px) between flex columns in the main editor layout. */
const EDITOR_LAYOUT_GAP = 16;
const EDITOR_BG_COLOR = '#0d1520';

/** Counts chambers whose content is a star, across the whole grid. */
function _countStarChambers(grid: (TileDef | null)[][]): number {
  let starCount = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell?.shape === PipeShape.Chamber && cell.chamberContent === 'star') {
        starCount++;
      }
    }
  }
  return starCount;
}

/** Deep-clones a grid and strips any fields not supported by each tile's shape. */
function _buildCleanGrid(grid: (TileDef | null)[][]): (TileDef | null)[][] {
  const rawGrid = structuredClone(grid);
  return rawGrid.map(row =>
    row.map(tile => {
      if (!tile) return null;
      const validKeys = getValidTileDefKeys(tile);
      for (const key of Object.keys(tile)) {
        if (!validKeys.has(key)) delete (tile as unknown as Record<string, unknown>)[key];
      }
      return tile;
    })
  );
}

/** Sets the optional LevelDef fields (note, hints, starCount, challenge, style) that only apply when non-empty. */
function _applyOptionalLevelDefFields(def: LevelDef, state: LevelEditorState, starCount: number): void {
  if (resolveLocalizedText(state.levelNote).trim()) def.note = state.levelNote;
  const activeHints = state.levelHints.filter((h) => resolveLocalizedText(h).trim() !== '');
  if (activeHints.length > 0) def.hints = activeHints;
  if (starCount > 0) def.starCount = starCount;
  if (state.levelChallenge) def.challenge = true;
  if (state.levelStyle) def.style = state.levelStyle;
}

/**
 * While dragging a tile that is also the linked tile, the link should visually follow the
 * drag to its destination cell rather than staying anchored at the tile's pre-drag position.
 */
function _computeEditorLinkedTilePos(
  drag: DragState | null,
  linkedTilePos: { row: number; col: number } | null,
): { row: number; col: number } | null {
  if (_isDraggingTileAtLinkedPos(drag, linkedTilePos)) return drag.toPos;
  return linkedTilePos;
}

/** True when the tile being dragged is the one the link currently points at (link should follow the drag). */
function _isDraggingTileAtLinkedPos(
  drag: DragState | null,
  linkedTilePos: { row: number; col: number } | null,
): drag is DragState {
  return drag !== null && linkedTilePos !== null &&
    linkedTilePos.row === drag.fromPos.row && linkedTilePos.col === drag.fromPos.col;
}

/** Builds the hover overlay (erase-preview or placement-preview) shown when not dragging. */
function _computeEditorHoverOverlay(state: LevelEditorState, drag: DragState | null): HoverOverlay | null {
  if (drag) return null;
  if (!state.hover) return null;
  if (state.palette === 'erase') {
    const isEmptyCell = (state.grid[state.hover.row]?.[state.hover.col] ?? null) === null;
    return { pos: state.hover, def: null, alpha: isEmptyCell ? 0.2 : 1 };
  }
  // Placement preview: transparent tile at hover
  return { pos: state.hover, def: state.buildTileDef(), alpha: 0.55 };
}

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
  private _levelSeaAnimationFrameId: number | null = null;
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

  /** Campaign map editor sub-section (manages grid, palette, canvas, undo/redo). */
  private readonly _campaignMapEditor: CampaignMapEditorSection;

  /** Data validation dialog (dev tool). */
  private readonly _dataValidator: DataValidationDialog;

  /** Import and unsaved-changes modal dialogs. */
  private readonly _dialogs: EditorDialogs;

  /** Import/export sequencing (file pick, gzip/JSON sniffing, conflict routing, text-pack merge). */
  private readonly _importExportFlow: CampaignImportExportFlow;

  /** Campaign-list, campaign-detail, and chapter-detail screens + their CRUD actions. */
  private readonly _browserSection: CampaignBrowserSection;

  /** Bound keydown handler stored so it can be removed by destroy(). */
  private readonly _keydownHandler: (e: KeyboardEvent) => void;
  private _keydownAttached = false;
  private _saveFeedbackResetTimer: number | null = null;

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
      openLevelEditor: (levelIdx, readOnly) => this._openLevelEditorFromChapterMap(levelIdx, readOnly),
    };
    this._chapterMapEditor = new ChapterMapEditorSection(chapterCallbacks);

    const campaignMapCallbacks: CampaignMapEditorCallbacks = {
      buildBtn: (l, bg, c, cb, suppressClick) => this._btn(l, bg, c, cb, '', suppressClick),
      getActiveCampaign: () => this._getActiveCampaign(),
      touchCampaign: (campaign) => this._touchCampaign(campaign),
      saveCampaigns: () => this._saveCampaigns(),
      openChapterEditor: (chapterIdx) => {
        this._activeChapterIdx = chapterIdx;
        this._browserSection.showChapterDetail();
      },
    };
    this._campaignMapEditor = new CampaignMapEditorSection(campaignMapCallbacks);

    this._dataValidator = new DataValidationDialog(this._service, this._btn.bind(this));

    this._paramsPanel = new TileParamsPanel({
      getState: () => this._state,
      renderCanvas: () => this._renderEditorCanvas(),
      updateUndoRedoButtons: () => this._updateEditorUndoRedoButtons(),
      onStyleChange: (style) => {
        musicManager.playGroup(selectGroupForContext({ style }));
      },
    });

    this._el = document.createElement('div');
    this._el.style.cssText =
      'display:none;position:fixed;inset:0;overflow:auto;z-index:200;' +
      'font-family:Arial,sans-serif;color:#eee;flex-direction:column;align-items:center;';
    applyScrollingPipeBackground(this._el, {
      baseColor: EDITOR_BG_COLOR,
      overlayAlpha: 0.8,
    });
    document.body.appendChild(this._el);

    this._dialogs = new EditorDialogs(this._el, this._btn.bind(this));

    this._importExportFlow = new CampaignImportExportFlow(this._service, this._dialogs, {
      hide: () => this.hide(),
      onPlayCampaign: (campaign) => this._onPlayCampaign(campaign),
    });

    this._browserSection = new CampaignBrowserSection(
      this._el,
      this._service,
      this._dialogs,
      this._dataValidator,
      this._importExportFlow,
      this._campaignMapEditor,
      this._chapterMapEditor,
      {
        buildBtn: (l, bg, c, cb, extraStyle, suppressClick) => this._btn(l, bg, c, cb, extraStyle, suppressClick),
        buildToolbar: (title, onBack) => this._buildToolbar(title, onBack),
        getActiveCampaign: () => this._getActiveCampaign(),
        touchCampaign: (campaign) => this._touchCampaign(campaign),
        canActivePlayerEdit: (campaign) => this._canActivePlayerEdit(campaign),
        saveCampaigns: () => this._saveCampaigns(),
        hide: () => this.hide(),
        onClose: () => this._onClose(),
        onPlayCampaign: (campaign) => this._onPlayCampaign(campaign),
        openLevelEditor: (level, readOnly) => this._openLevelEditor(level, readOnly),
        stopEditorSeaAnimationLoops: () => this._stopEditorSeaAnimationLoops(),
        clearSaveFeedbackTimer: () => this._clearSaveFeedbackTimer(),
        detachEditorInput: () => { this._editorInput?.detach(); this._editorInput = null; },
        setScreen: (screen) => { this._screen = screen; },
        getActiveChapterIdx: () => this._activeChapterIdx,
        setActiveChapterIdx: (idx) => { this._activeChapterIdx = idx; },
        setActiveLevelIdx: (idx) => { this._activeLevelIdx = idx; },
        setActiveCampaignId: (id) => { this._activeCampaignId = id; },
      },
    );

    // Global keyboard handler for shortcuts (guarded by active screen)
    this._keydownHandler = this._handleGlobalKeydown.bind(this);
    this._attachKeydownHandler();
  }

  /** Resolves and opens the level targeted by the chapter map editor's "edit level" action. */
  private _openLevelEditorFromChapterMap(levelIdx: number, readOnly: boolean): void {
    const campaign = this._getActiveCampaign();
    const chapter = campaign?.chapters[this._activeChapterIdx];
    const level = chapter?.levels[levelIdx];
    if (!level) return;
    this._activeLevelIdx = levelIdx;
    this._openLevelEditor(level, readOnly);
  }

  /** Global keydown handler for editor shortcuts, guarded by the active screen. */
  private _handleGlobalKeydown(e: KeyboardEvent): void {
    if (this._el.style.display === 'none') return;
    // Chapter map editor: Q/W rotation
    if (this._screen === EditorScreen.Chapter) {
      this._chapterMapEditor.handleChapterEditorKeyDown(e);
      return;
    }
    // Campaign map editor: Q/W rotation + Ctrl+Z/Y undo/redo
    if (this._screen === EditorScreen.Campaign) {
      this._campaignMapEditor.handleCampaignEditorKeyDown(e);
      return;
    }
    if (this._screen !== EditorScreen.LevelEditor) return;
    this._handleLevelEditorKeydown(e);
  }

  /** Level-editor-screen keyboard shortcuts: undo/redo, escape-to-unlink, and tile rotation. */
  private _handleLevelEditorKeydown(e: KeyboardEvent): void {
    if (commandKeyManager.matches('undo', e)) { e.preventDefault(); this._editorUndo(); }
    if (commandKeyManager.matches('redo', e)) { e.preventDefault(); this._editorRedo(); }
    if (e.key === 'Escape' && this._state.linkedTilePos !== null) {
      // Unlink the linked tile
      e.preventDefault();
      this._state.clearLink();
      this._renderEditorCanvas();
    }
    this._handleRotateShortcut(e);
  }

  /** Q = rotate counter-clockwise, W = rotate clockwise (mirrors in-game mouse wheel). */
  private _handleRotateShortcut(e: KeyboardEvent): void {
    if (e.altKey || isTextEntryShortcutTarget(e)) return;
    const isCcw = commandKeyManager.matches('rotateCCW', e);
    const isCw = commandKeyManager.matches('rotateCW', e);
    if (!isCcw && !isCw) return;
    e.preventDefault();
    this._state.rotatePalette(isCw);
    if (this._state.linkedTilePos) this._state.applyParamsToLinkedTile();
    this._refreshPaletteUI();
    this._renderEditorCanvas();
  }

  /** Show the campaign editor (campaign list screen). */
  show(): void {
    this._service.ensureCampaignMaps();
    applyScrollingPipeBackground(this._el, {
      baseColor: EDITOR_BG_COLOR,
      overlayAlpha: 0.8,
    });
    this._el.style.display = 'flex';
    document.body.classList.add('editor-open');
    this._attachKeydownHandler();
    this._browserSection.showCampaignList();
  }

  /**
   * Show the campaign editor, restoring the screen that was active when hide() was called.
   * Use this after playtesting to return the user to the level they were editing.
   */
  showAndRestore(): void {
    this._service.ensureCampaignMaps();
    applyScrollingPipeBackground(this._el, {
      baseColor: EDITOR_BG_COLOR,
      overlayAlpha: 0.8,
    });
    this._el.style.display = 'flex';
    document.body.classList.add('editor-open');
    this._attachKeydownHandler();
    switch (this._screen) {
      case EditorScreen.LevelEditor: {
        const campaign = this._getActiveCampaign();
        // Mirror the edit-permission rule used when entering the editor (see
        // _buildCampaignRow): a campaign is read-only when it is official OR the
        // active player lacks edit rights.
        const readOnly = !campaign || campaign.official === true || !this._canActivePlayerEdit(campaign);
        this._showLevelEditor(readOnly);
        break;
      }
      case EditorScreen.Chapter:
        this._browserSection.showChapterDetail();
        break;
      case EditorScreen.Campaign:
        this._browserSection.showCampaignDetail();
        break;
      default:
        this._browserSection.showCampaignList();
    }
  }

  /** Hide the campaign editor. */
  hide(): void {
    this._stopEditorSeaAnimationLoops();
    this._clearSaveFeedbackTimer();
    this._detachKeydownHandler();
    unregisterScrollingPipeBackground(this._el);
    this._el.style.display = 'none';
    document.body.classList.remove('editor-open');
  }

  /** Remove event listeners and clean up DOM resources. */
  destroy(): void {
    this._stopEditorSeaAnimationLoops();
    this._clearSaveFeedbackTimer();
    this._detachKeydownHandler();
    unregisterScrollingPipeBackground(this._el);
  }

  private _attachKeydownHandler(): void {
    if (this._keydownAttached) return;
    document.addEventListener('keydown', this._keydownHandler);
    this._keydownAttached = true;
  }

  private _detachKeydownHandler(): void {
    if (!this._keydownAttached) return;
    document.removeEventListener('keydown', this._keydownHandler);
    this._keydownAttached = false;
  }

  private _clearSaveFeedbackTimer(): void {
    if (this._saveFeedbackResetTimer === null) return;
    clearTimeout(this._saveFeedbackResetTimer);
    this._saveFeedbackResetTimer = null;
  }

  /** Start continuously refreshing the level editor canvas (for animated sea tiles). */
  private _startLevelSeaAnimationLoop(): void {
    if (this._levelSeaAnimationFrameId !== null) return;
    this._levelSeaAnimationFrameId = requestAnimationFrame(this._levelSeaAnimationTick);
  }

  /** Stop continuously refreshing the level editor canvas. */
  private _stopLevelSeaAnimationLoop(): void {
    if (this._levelSeaAnimationFrameId === null) return;
    cancelAnimationFrame(this._levelSeaAnimationFrameId);
    this._levelSeaAnimationFrameId = null;
  }

  /** Stop all editor animation loops that keep animated sea tiles refreshed. */
  private _stopEditorSeaAnimationLoops(): void {
    this._stopLevelSeaAnimationLoop();
    this._campaignMapEditor.stopSeaAnimationLoop();
    this._chapterMapEditor.stopSeaAnimationLoop();
  }

  /** RAF callback for level editor sea-tile animation. */
  private _levelSeaAnimationTick = (): void => {
    if (this._levelSeaAnimationFrameId === null) return;
    if (this._screen === EditorScreen.LevelEditor && this._el.style.display !== 'none') {
      this._renderEditorCanvas();
    }
    this._levelSeaAnimationFrameId = requestAnimationFrame(this._levelSeaAnimationTick);
  };

  // ─── Toolbar ─────────────────────────────────────────────────────────────

  private _buildToolbar(title: string, onBack: (() => void) | null): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.style.cssText =
      'width:100%;max-width:900px;display:flex;align-items:center;gap:12px;' +
      `padding:14px 20px;background:${UI_BG};border-bottom:2px solid ${UI_BORDER};` +
      'box-sizing:border-box;position:sticky;top:0;z-index:10;';

    if (onBack) {
      const backBtn = this._btn(t('editor.toolbar.back'), MUTED_BTN_BG, '#aaa', () => {
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

  /** Set the campaign's lastUpdated timestamp to the current time. */
  private _touchCampaign(campaign: CampaignDef): void {
    this._service.touch(campaign);
  }

  /**
   * Return true when the active player profile has permission to edit the
   * given campaign.  A campaign is editable when:
   * - It has no `authorGuid` (created before this feature or by a legacy import), OR
   * - Its `authorGuid` matches the active player profile's GUID, OR
   * - Its `anyoneEdit` flag is set.
   */
  private _canActivePlayerEdit(campaign: CampaignDef): boolean {
    if (!campaign.authorGuid) return true;
    if (campaign.anyoneEdit) return true;
    const activeSlot = getActiveSlotIndex();
    if (activeSlot === null) return false;
    const meta = loadSlotMeta(activeSlot);
    return meta?.guid === campaign.authorGuid;
  }

  private _getActiveCampaign(): CampaignDef | null {
    return this._service.getCampaign(this._activeCampaignId ?? '');
  }

  // ─── Screen: Level editor ─────────────────────────────────────────────────

  private _openLevelEditor(level: LevelDef, readOnly: boolean): void {
    this._state.initFromLevel(level);
    this._showLevelEditor(readOnly);
  }

  private _showLevelEditor(readOnly: boolean): void {
    this._resetLevelEditorScreen();
    this._playLevelEditorMusic();

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._browserSection.showCampaignList(); return; }
    const chapter = campaign.chapters[this._activeChapterIdx];
    if (!chapter) { this._browserSection.showCampaignDetail(); return; }

    const metadataPanel = this._buildLevelEditorMetadataPanel();
    this._buildLevelEditorToolbarAndLayout(readOnly, campaign, metadataPanel);
    this._finishLevelEditorSetup();
  }

  /** Tears down any prior editor screen state before building the level editor fresh. */
  private _resetLevelEditorScreen(): void {
    this._stopEditorSeaAnimationLoops();
    this._clearSaveFeedbackTimer();
    // Clean up any existing input handler before building a new one.
    this._editorInput?.detach();
    this._editorInput = null;
    this._screen = EditorScreen.LevelEditor;
    this._el.innerHTML = '';
  }

  /** Plays music matching the level's style/challenge flag (Summer is the default for no style). */
  private _playLevelEditorMusic(): void {
    musicManager.playGroup(selectGroupForContext({
      isChallenge: this._state.levelChallenge,
      style: this._state.levelStyle,
    }));
  }

  private _buildLevelEditorMetadataPanel(): LevelMetadataPanel {
    const panel = new LevelMetadataPanel(
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
        onChallengeChange: (isChallenge) => {
          musicManager.playGroup(selectGroupForContext({
            isChallenge,
            style: this._state.levelStyle,
          }));
        },
      },
      this._btn.bind(this),
    );
    this._metadataPanel = panel;
    return panel;
  }

  private _buildLevelEditorToolbarAndLayout(readOnly: boolean, campaign: CampaignDef, metadataPanel: LevelMetadataPanel): void {
    const toolbar = this._buildToolbar(
      readOnly ? `👁 View Level: ${resolveLocalizedText(this._state.levelName)}` : `✏️ Level Editor (${this._activeChapterIdx + 1}-${this._activeLevelIdx + 1})`,
      () => this._handleLevelEditorBack(readOnly, campaign),
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
      rightCol.appendChild(metadataPanel.buildInventoryEditor());
      rightCol.appendChild(this._paramsPanel.buildParamPanel());
      rightCol.appendChild(metadataPanel.buildGridSizePanel());
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
  }

  private _finishLevelEditorSetup(): void {
    // Re-compute canvas display size now that the layout is in the DOM, so the
    // board can fill any available horizontal space.
    this._updateCanvasDisplaySize();

    // Initial render
    this._renderEditorCanvas();
    this._startLevelSeaAnimationLoop();
    this._updateEditorUndoRedoButtons();
  }

  /** Level editor toolbar "back" action: prompts to save unsaved changes before returning to the chapter. */
  private _handleLevelEditorBack(readOnly: boolean, campaign: CampaignDef): void {
    if (!readOnly && this._state.hasUnsavedChanges) {
      this._dialogs.showUnsavedChanges(
        () => {
          this._saveLevel(campaign, this._activeChapterIdx, this._activeLevelIdx);
          this._browserSection.showChapterDetail();
        },
        () => this._browserSection.showChapterDetail(),
      );
    } else {
      this._browserSection.showChapterDetail();
    }
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
    const undoBtn = this._btn(t('editor.common.undo'), MUTED_BTN_BG, '#aaa', () => this._editorUndo(), '', true);
    undoBtn.id = 'editor-undo-btn';
    toolbar.appendChild(undoBtn);
    const redoBtn = this._btn(t('editor.common.redo'), MUTED_BTN_BG, '#aaa', () => this._editorRedo(), '', true);
    redoBtn.id = 'editor-redo-btn';
    toolbar.appendChild(redoBtn);

    // Validate
    toolbar.appendChild(this._btn(t('editor.common.validateOk'), UI_BG, '#7ed321', () => {
      const levelDef = this._buildCurrentLevelDef();
      const result = this._validateLevel(levelDef);
      const icon = result.ok ? '✅' : '❌';
      this._dialogs.showMessage(t('editor.level.validationTitle'), `${icon}\n\n${result.messages.join('\n')}`);
    }));

    // Playtest
    toolbar.appendChild(this._btn(t('editor.toolbar.playtest'), UI_BG, '#f0c040', () => {
      const levelDef = this._buildCurrentLevelDef();
      const result = this._validateLevel(levelDef);
      if (!result.ok) {
        this._dialogs.showMessage(t('editor.level.validationTitle'), `❌\n\n${result.messages.join('\n')}`, ERROR_COLOR);
        return;
      }
      // Save the current level so it persists, but do NOT wipe star/water
      // records: those should only be cleared when the user explicitly saves
      // via the Save button after making design changes.
      this._saveLevel(campaign, this._activeChapterIdx, this._activeLevelIdx, { clearRecords: false });
      const chapterNum = this._activeChapterIdx + 1;
      const levelNum = this._activeLevelIdx + 1;
      this._onPlaytest({ ...levelDef, name: `${chapterNum}-${levelNum}: ${resolveLocalizedText(levelDef.name)}` });
    }));

    // Save
    const saveBtn = this._btn(t('editor.toolbar.save'), '#27ae60', '#fff', () => {
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- _metadataPanel is always set before level editor methods are called
    midCol.appendChild(this._metadataPanel!.buildNameSection(readOnly));
    midCol.appendChild(this._buildEditorCanvasSection(readOnly));
    if (!readOnly) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- _metadataPanel is always set before level editor methods are called
      midCol.appendChild(this._metadataPanel!.buildTextFieldsSection());
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- _metadataPanel is always set before level editor methods are called
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
    title.textContent = t('editor.level.playerInventory');
    panel.appendChild(title);

    if (this._state.inventory.length === 0) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = t('editor.common.none');
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

    const drag: DragState | null = this._editorInput?.dragState ?? null;
    const linkedTilePos = _computeEditorLinkedTilePos(drag, this._state.linkedTilePos);
    const overlay = _computeEditorHoverOverlay(this._state, drag);

    renderEditorCanvas(ctx, this._state.grid, this._state.rows, this._state.cols, overlay, drag, linkedTilePos, undefined, undefined, undefined, this._state.levelStyle);
  }

  // ─── Editor canvas mouse events ────────────────────────────────────────────

  /** Flashes an error message below the canvas when the Source placement constraint is violated. */
  private _showSourceError(): void {
    const el = this._editorSourceErrorEl;
    if (!el) return;
    showTimedMessage(el, t(ONLY_ONE_SOURCE));
  }

  /** Flashes an error message below the canvas when the Sink placement constraint is violated. */
  private _showSinkError(): void {
    const el = this._editorSourceErrorEl;
    if (!el) return;
    showTimedMessage(el, t('editor.level.onlyOneSink'));
  }

  /** Rebuild and replace the palette and param panels in the DOM. */
  private _refreshPaletteUI(): void {
    this._paramsPanel.refresh();
  }

  private _updateCanvasDisplaySize(): void {
    if (!this._editorCanvas) return;
    updateCanvasDisplaySize(this._editorCanvas, {
      rows: this._state.rows,
      cols: this._state.cols,
      mainLayout: this._editorMainLayout,
      layoutGap: EDITOR_LAYOUT_GAP,
      layoutPadding: EDITOR_LAYOUT_PADDING,
      constrainHeight: false,
    });
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- _metadataPanel is always set before _onStateRestored is called
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

    const starCount = _countStarChambers(this._state.grid);
    const cleanGrid = _buildCleanGrid(this._state.grid);

    const def: LevelDef = {
      id: existingId,
      name: this._state.levelName,
      rows: this._state.rows,
      cols: this._state.cols,
      grid: cleanGrid,
      inventory: structuredClone(this._state.inventory),
    };
    _applyOptionalLevelDefFields(def, this._state, starCount);
    return def;
  }

  // ─── Save level ────────────────────────────────────────────────────────────

  private _saveLevel(
    campaign: CampaignDef,
    chapterIdx: number,
    levelIdx: number,
    options?: { clearRecords?: boolean },
  ): void {
    const newLevel = this._buildCurrentLevelDef();
    this._service.saveLevel(campaign, chapterIdx, levelIdx, newLevel, options);
    this._state.markSaved();

    // Visual confirmation on the Save button
    const saveBtn = document.getElementById('editor-save-btn') as HTMLButtonElement | null;
    if (saveBtn) {
      saveBtn.textContent = t('editor.toolbar.saved');
      this._clearSaveFeedbackTimer();
      this._saveFeedbackResetTimer = window.setTimeout(() => {
        this._saveFeedbackResetTimer = null;
        const activeSaveBtn = document.getElementById('editor-save-btn') as HTMLButtonElement | null;
        if (activeSaveBtn) activeSaveBtn.textContent = t('editor.toolbar.save');
      }, 1500);
    }
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
