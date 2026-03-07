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

import { CampaignDef, LevelDef, TileDef, InventoryItem, PipeShape, Direction, Rotation } from './types';
import { CHAPTERS } from './levels';
import { loadImportedCampaigns, saveImportedCampaigns, loadCampaignProgress, computeCampaignCompletionPct } from './persistence';
import { TILE_SIZE } from './renderer';
import { Board, PIPE_SHAPES } from './board';
import {
  EditorPalette,
  ChamberPalette,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
  ValidationResult,
  generateCampaignId,
  generateLevelId,
  isChamberPalette,
  chamberPaletteContent,
} from './campaignEditorTypes';
import { renderEditorCanvas, HoverOverlay, DragState } from './campaignEditorRenderer';

// ─── The built-in "Official" campaign ────────────────────────────────────────

/** The pre-loaded read-only campaign derived from the built-in levels. */
export const OFFICIAL_CAMPAIGN: CampaignDef = {
  id: 'official',
  name: 'Official',
  author: 'Pipes Team',
  chapters: CHAPTERS,
};

// ─── CampaignEditor class ─────────────────────────────────────────────────────

export class CampaignEditor {
  private readonly _el: HTMLElement;

  /** All user-created / imported campaigns (not including Official). */
  private _campaigns: CampaignDef[];

  // ── Navigation state ──────────────────────────────────────────────────────
  private _screen: 'list' | 'campaign' | 'chapter' | 'levelEditor' = 'list';
  private _activeCampaignId: string | null = null;
  private _activeChapterIdx = -1;
  private _activeLevelIdx = -1;

  // ── Level editor state ────────────────────────────────────────────────────
  private _editLevelName = 'New Level';
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
  private _chamberSectionExpanded = false;
  /** Drag state: set when the user is dragging a tile across the grid. */
  private _dragState: {
    startPos: { row: number; col: number };
    tile: TileDef;
    currentPos: { row: number; col: number };
    moved: boolean;
  } | null = null;
  /** Bound window mouseup handler for drag completion; stored so it can be removed. */
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  /** Grid position of the tile currently linked for live param editing, or null if no link active. */
  private _linkedTilePos: { row: number; col: number } | null = null;
  /** True once the first param change in the current linked session has been committed. */
  private _linkedTileDirty = false;

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

    // Global keyboard handler for undo/redo shortcuts (active only in level editor screen)
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this._screen !== 'levelEditor' || this._el.style.display === 'none') return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this._editorUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this._editorRedo(); }
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
      case 'levelEditor': {
        const campaign = this._getActiveCampaign();
        const readOnly = campaign?.id === 'official';
        this._showLevelEditor(readOnly);
        break;
      }
      case 'chapter':
        this._showChapterDetail();
        break;
      case 'campaign':
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

  private _labeledInput(labelText: string, value: string, onInput: (v: string) => void, type = 'text', inputWidth?: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
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
    this._screen = 'list';
    this._el.innerHTML = '';

    const toolbar = this._buildToolbar('🗺️ Campaign Editor', null);

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
    const allCampaigns: CampaignDef[] = [OFFICIAL_CAMPAIGN, ...this._campaigns];
    for (const campaign of allCampaigns) {
      content.appendChild(this._buildCampaignRow(campaign));
    }

    this._el.appendChild(content);
  }

  private _buildCampaignRow(campaign: CampaignDef): HTMLElement {
    const isOfficial = campaign.id === 'official';
    const row = document.createElement('div');
    row.style.cssText =
      'background:#16213e;border:2px solid #4a90d9;border-radius:8px;' +
      'padding:14px 18px;display:flex;align-items:center;gap:12px;';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;';
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

    meta.textContent = `By ${campaign.author}  ·  ${campaign.chapters.length} chapter(s)  ·  ${levelCount} level(s)${progressText}`;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    if (!isOfficial) {
      btns.appendChild(this._btn('▶ Play', '#16213e', '#7ed321', () => {
        this.hide();
        this._onPlayCampaign(campaign);
      }));
      btns.appendChild(this._btn('✏️ Edit', '#16213e', '#f0c040', () => {
        this._activeCampaignId = campaign.id;
        this._showCampaignDetail();
      }));
    } else {
      btns.appendChild(this._btn('▶ Play', '#16213e', '#7ed321', () => {
        this.hide();
        this._onPlayCampaign(campaign);
      }));
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

    row.appendChild(btns);
    return row;
  }

  // ─── Screen: Campaign detail ──────────────────────────────────────────────

  private _getActiveCampaign(): CampaignDef | null {
    if (this._activeCampaignId === 'official') return OFFICIAL_CAMPAIGN;
    return this._campaigns.find((c) => c.id === this._activeCampaignId) ?? null;
  }

  private _showCampaignDetail(): void {
    this._screen = 'campaign';
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const isOfficial = campaign.id === 'official';

    const toolbar = this._buildToolbar(
      isOfficial ? `📋 ${campaign.name} (read-only)` : `✏️ Edit Campaign: ${campaign.name}`,
      () => this._showCampaignList(),
    );
    if (!isOfficial) {
      toolbar.appendChild(this._btn('📤 Export', '#16213e', '#4a90d9', () => this._exportCampaign(campaign)));
    }
    this._el.appendChild(toolbar);

    const content = document.createElement('div');
    content.style.cssText =
      'width:100%;max-width:900px;padding:20px;box-sizing:border-box;display:flex;' +
      'flex-direction:column;gap:16px;';

    if (!isOfficial) {
      // Name and author fields
      const fields = document.createElement('div');
      fields.style.cssText =
        'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:16px;' +
        'display:flex;flex-direction:column;gap:10px;';

      fields.appendChild(this._labeledInput('Name', campaign.name, (v) => {
        campaign.name = v;
        this._saveCampaigns();
      }));
      fields.appendChild(this._labeledInput('Author', campaign.author, (v) => {
        campaign.author = v;
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
    const row = document.createElement('div');
    row.style.cssText =
      'background:#16213e;border:2px solid #2a3a5e;border-radius:8px;' +
      'padding:12px 16px;display:flex;align-items:center;gap:12px;';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;';
    const name = document.createElement('div');
    name.style.cssText = 'font-size:0.95rem;font-weight:bold;';
    name.textContent = `Chapter ${chapterIdx + 1}: ${chapter.name}`;
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem;color:#aaa;margin-top:3px;';
    meta.textContent = `${chapter.levels.length} level(s)`;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const editOrViewLabel = readOnly ? '👁 View' : '✏️ Edit';
    btns.appendChild(this._btn(editOrViewLabel, '#16213e', '#f0c040', () => {
      this._activeChapterIdx = chapterIdx;
      this._showChapterDetail();
    }));

    if (!readOnly) {
      if (chapterIdx > 0) {
        btns.appendChild(this._btn('▲', '#16213e', '#aaa', () => {
          [campaign.chapters[chapterIdx - 1], campaign.chapters[chapterIdx]] =
            [campaign.chapters[chapterIdx], campaign.chapters[chapterIdx - 1]];
          this._saveCampaigns();
          this._showCampaignDetail();
        }));
      }
      if (chapterIdx < campaign.chapters.length - 1) {
        btns.appendChild(this._btn('▼', '#16213e', '#aaa', () => {
          [campaign.chapters[chapterIdx], campaign.chapters[chapterIdx + 1]] =
            [campaign.chapters[chapterIdx + 1], campaign.chapters[chapterIdx]];
          this._saveCampaigns();
          this._showCampaignDetail();
        }));
      }
      btns.appendChild(this._btn('🗑', '#16213e', '#e74c3c', () => {
        if (confirm(`Delete chapter "${chapter.name}" and all its levels?`)) {
          campaign.chapters.splice(chapterIdx, 1);
          this._saveCampaigns();
          this._showCampaignDetail();
        }
      }));
    }

    row.appendChild(btns);
    return row;
  }

  // ─── Screen: Chapter detail ───────────────────────────────────────────────

  private _showChapterDetail(): void {
    this._screen = 'chapter';
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const chapter = campaign.chapters[this._activeChapterIdx];
    if (!chapter) { this._showCampaignDetail(); return; }
    const isOfficial = campaign.id === 'official';

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
    const row = document.createElement('div');
    row.style.cssText =
      'background:#16213e;border:2px solid #2a3a5e;border-radius:8px;' +
      'padding:12px 16px;display:flex;align-items:center;gap:12px;';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;';
    const name = document.createElement('div');
    name.style.cssText = 'font-size:0.95rem;font-weight:bold;';
    name.textContent = `Level ${levelIdx + 1}: ${level.name}`;
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem;color:#aaa;margin-top:3px;';
    meta.textContent = `${level.rows} × ${level.cols} grid`;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

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
        this._saveCampaigns();
        this._showChapterDetail();
      }));

      if (levelIdx > 0) {
        btns.appendChild(this._btn('▲', '#16213e', '#aaa', () => {
          [chapter.levels[levelIdx - 1], chapter.levels[levelIdx]] =
            [chapter.levels[levelIdx], chapter.levels[levelIdx - 1]];
          this._saveCampaigns();
          this._showChapterDetail();
        }));
      }
      if (levelIdx < chapter.levels.length - 1) {
        btns.appendChild(this._btn('▼', '#16213e', '#aaa', () => {
          [chapter.levels[levelIdx], chapter.levels[levelIdx + 1]] =
            [chapter.levels[levelIdx + 1], chapter.levels[levelIdx]];
          this._saveCampaigns();
          this._showChapterDetail();
        }));
      }
      btns.appendChild(this._btn('🗑', '#16213e', '#e74c3c', () => {
        if (confirm(`Delete level "${level.name}"?`)) {
          chapter.levels.splice(levelIdx, 1);
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
          this._saveCampaigns();
          this._showChapterDetail();
        });
        btns.appendChild(sel);
      }
    }

    row.appendChild(btns);
    return row;
  }

  // ─── Screen: Level editor ─────────────────────────────────────────────────

  private _openLevelEditor(level: LevelDef, readOnly: boolean): void {
    this._editLevelName = level.name;
    this._editRows = level.rows;
    this._editCols = level.cols;
    this._editGrid = JSON.parse(JSON.stringify(level.grid)) as (TileDef | null)[][];
    this._editInventory = JSON.parse(JSON.stringify(level.inventory)) as InventoryItem[];
    this._editorPalette = PipeShape.Source;
    this._editorParams = { ...DEFAULT_PARAMS };
    this._editorHistory = [];
    this._editorHistoryIdx = -1;
    this._editorHover = null;
    this._goldSectionExpanded = false;
    this._chamberSectionExpanded = false;
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
    this._recordEditorSnapshot();
    this._showLevelEditor(readOnly);
  }

  private _showLevelEditor(readOnly: boolean): void {
    this._screen = 'levelEditor';
    this._el.innerHTML = '';

    const campaign = this._getActiveCampaign();
    if (!campaign) { this._showCampaignList(); return; }
    const chapter = campaign.chapters[this._activeChapterIdx];
    if (!chapter) { this._showCampaignDetail(); return; }

    const toolbar = this._buildToolbar(
      readOnly ? `👁 View Level: ${this._editLevelName}` : `✏️ Level Editor`,
      () => this._showChapterDetail(),
    );

    if (!readOnly) {
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
        const level = this._buildCurrentLevelDef();
        this._onPlaytest(level);
      }));

      // Save
      const saveBtn = this._btn('💾 Save', '#27ae60', '#fff', () => {
        this._saveLevel(campaign, this._activeChapterIdx, this._activeLevelIdx);
      });
      saveBtn.id = 'editor-save-btn';
      toolbar.appendChild(saveBtn);
    }

    this._el.appendChild(toolbar);

    // ── Main editor layout ─────────────────────────────────────────────────
    const mainLayout = document.createElement('div');
    mainLayout.style.cssText =
      'width:100%;max-width:1200px;padding:16px;box-sizing:border-box;display:flex;' +
      'gap:16px;align-items:flex-start;flex-wrap:wrap;';

    // ── Left column: palette + params ──────────────────────────────────────
    const leftCol = document.createElement('div');
    leftCol.style.cssText =
      'display:flex;flex-direction:column;gap:12px;min-width:180px;';

    if (!readOnly) {
      leftCol.appendChild(this._buildPalette());
      leftCol.appendChild(this._buildParamPanel());
      leftCol.appendChild(this._buildGridSizePanel());
    }

    // ── Middle column: canvas ──────────────────────────────────────────────
    const midCol = document.createElement('div');
    midCol.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    if (!readOnly) {
      // Level name input above canvas
      const nameWrap = document.createElement('div');
      nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
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
      midCol.appendChild(nameWrap);
    } else {
      const lvlNameEl = document.createElement('div');
      lvlNameEl.style.cssText = 'font-size:1rem;font-weight:bold;color:#f0c040;';
      lvlNameEl.textContent = this._editLevelName;
      midCol.appendChild(lvlNameEl);
    }

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.width  = this._editCols * TILE_SIZE;
    canvas.height = this._editRows * TILE_SIZE;
    canvas.style.cssText =
      'border:3px solid #4a90d9;border-radius:4px;cursor:' + (readOnly ? 'default' : 'crosshair') + ';' +
      'display:block;';
    this._editorCanvas = canvas;
    const ctx = canvas.getContext('2d');
    if (ctx) this._editorCtx = ctx;

    if (!readOnly) {
      canvas.addEventListener('mousedown',   (e) => this._onEditorMouseDown(e));
      canvas.addEventListener('mousemove',   (e) => this._onEditorCanvasMouseMove(e));
      canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this._onEditorCanvasRightClick(e); });
      canvas.addEventListener('mouseleave',  () => {
        this._editorHover = null;
        // Cancel drag when mouse leaves the canvas
        if (this._dragState) {
          this._dragState = null;
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

    midCol.appendChild(canvas);

    // ── Right column: inventory editor ─────────────────────────────────────
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:180px;';

    if (!readOnly) {
      rightCol.appendChild(this._buildInventoryEditor());
    } else {
      rightCol.appendChild(this._buildInventoryReadonly());
    }

    mainLayout.appendChild(leftCol);
    mainLayout.appendChild(midCol);
    mainLayout.appendChild(rightCol);
    this._el.appendChild(mainLayout);

    // Initial render
    this._renderEditorCanvas();
    this._updateEditorUndoRedoButtons();
  }

  // ─── Palette panel ────────────────────────────────────────────────────────

  private readonly _PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.Source,   label: '💧 Source' },
    { palette: PipeShape.Sink,     label: '🏁 Sink' },
    { palette: PipeShape.Straight, label: '━ Straight' },
    { palette: PipeShape.Elbow,    label: '┗ Elbow' },
    { palette: PipeShape.Tee,      label: '┣ Tee' },
    { palette: PipeShape.Cross,    label: '╋ Cross' },
    { palette: PipeShape.Granite,  label: '▪ Granite' },
    { palette: 'erase',            label: '🗑 Erase (→ Empty)' },
  ];

  private readonly _CHAMBER_PALETTE_ITEMS: Array<{ palette: ChamberPalette; label: string }> = [
    { palette: 'chamber:tank',     label: '💧 Tank' },
    { palette: 'chamber:dirt',     label: '🟫 Dirt' },
    { palette: 'chamber:item',     label: '🎁 Item' },
    { palette: 'chamber:heater',   label: '🔥 Heater' },
    { palette: 'chamber:ice',      label: '❄ Ice' },
    { palette: 'chamber:pump',     label: '⬆ Pump' },
    { palette: 'chamber:weak_ice', label: '🧊 Weak Ice' },
  ];

  private readonly _GOLD_PALETTE_ITEMS: Array<{ palette: EditorPalette; label: string }> = [
    { palette: PipeShape.GoldSpace,    label: '✦ Gold Space' },
    { palette: PipeShape.GoldStraight, label: '━ Gold Straight' },
    { palette: PipeShape.GoldElbow,    label: '┗ Gold Elbow' },
    { palette: PipeShape.GoldTee,      label: '┣ Gold Tee' },
    { palette: PipeShape.GoldCross,    label: '╋ Gold Cross' },
  ];

  private _buildPalette(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'editor-palette-panel';
    panel.style.cssText =
      'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;' +
      'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.8rem;color:#7ed321;font-weight:bold;margin-bottom:4px;letter-spacing:1px;';
    title.textContent = 'TILE PALETTE';
    panel.appendChild(title);

    const isGoldSelected = this._GOLD_PALETTE_ITEMS.some(i => i.palette === this._editorPalette);
    // Auto-expand the gold section if a gold item is currently selected
    if (isGoldSelected) this._goldSectionExpanded = true;
    // Auto-expand the chamber section if a chamber item is currently selected
    if (isChamberPalette(this._editorPalette)) this._chamberSectionExpanded = true;

    const makeItemBtn = (item: { palette: EditorPalette; label: string }, indent = false): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.dataset['palette'] = String(item.palette);
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        (indent ? 'margin-left:12px;' : '') +
        'border:1px solid ' + (this._editorPalette === item.palette ? '#f0c040' : '#2a3a5e') + ';' +
        'background:' + (this._editorPalette === item.palette ? '#2a3a1a' : '#0d1a30') + ';' +
        'color:' + (this._editorPalette === item.palette ? '#f0c040' : '#eee') + ';';

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

    // Chamber collapsible section
    const chamberToggle = document.createElement('button');
    chamberToggle.type = 'button';
    chamberToggle.textContent = (this._chamberSectionExpanded ? '▾' : '▸') + ' Chamber';
    chamberToggle.style.cssText =
      'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
      'border:1px solid #74b9ff;background:#0a1520;color:#74b9ff;font-weight:bold;margin-top:2px;';
    chamberToggle.addEventListener('click', () => {
      this._chamberSectionExpanded = !this._chamberSectionExpanded;
      const newPanel = this._buildPalette();
      panel.replaceWith(newPanel);
    });
    panel.appendChild(chamberToggle);

    if (this._chamberSectionExpanded) {
      for (const item of this._CHAMBER_PALETTE_ITEMS) {
        panel.appendChild(makeItemBtn(item, true));
      }
    }

    // Gold collapsible section
    const goldToggle = document.createElement('button');
    goldToggle.type = 'button';
    goldToggle.textContent = (this._goldSectionExpanded ? '▾' : '▸') + ' Gold';
    goldToggle.style.cssText =
      'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
      'border:1px solid #b8860b;background:#1a1400;color:#ffd700;font-weight:bold;margin-top:2px;';
    goldToggle.addEventListener('click', () => {
      this._goldSectionExpanded = !this._goldSectionExpanded;
      const newPanel = this._buildPalette();
      panel.replaceWith(newPanel);
    });
    panel.appendChild(goldToggle);

    if (this._goldSectionExpanded) {
      for (const item of this._GOLD_PALETTE_ITEMS) {
        panel.appendChild(makeItemBtn(item, true));
      }
    }

    return panel;
  }

  // ─── Tile parameter panel ─────────────────────────────────────────────────

  private _buildParamPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'editor-param-panel';
    panel.style.cssText =
      'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;' +
      'display:flex;flex-direction:column;gap:8px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.8rem;color:#7ed321;font-weight:bold;letter-spacing:1px;';
    title.textContent = 'TILE PARAMS';
    panel.appendChild(title);

    const p = this._editorPalette;
    const isChm = isChamberPalette(p);
    if (p === 'erase' || p === PipeShape.Granite || p === PipeShape.GoldSpace) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = 'No parameters';
      panel.appendChild(none);
      return panel;
    }

    // Rotation (for pipe tiles only; Source, Sink, and Chamber use explicit connections instead)
    const noRotation = p === PipeShape.Source || p === PipeShape.Sink || isChm;
    if (!noRotation) {
      const rotWrap = document.createElement('div');
      rotWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;';
      const rotLbl = document.createElement('span');
      rotLbl.style.cssText = 'font-size:0.78rem;color:#aaa;width:56px;';
      rotLbl.textContent = 'Rotation:';
      rotWrap.appendChild(rotLbl);
      for (const rot of [0, 90, 180, 270] as Rotation[]) {
        const rb = document.createElement('button');
        rb.type = 'button';
        rb.textContent = `${rot}°`;
        rb.style.cssText =
          'padding:3px 7px;font-size:0.78rem;border-radius:3px;cursor:pointer;' +
          'border:1px solid ' + (this._editorParams.rotation === rot ? '#f0c040' : '#555') + ';' +
          'background:' + (this._editorParams.rotation === rot ? '#2a3a1a' : '#0d1a30') + ';' +
          'color:' + (this._editorParams.rotation === rot ? '#f0c040' : '#aaa') + ';';
        rb.addEventListener('click', () => {
          this._editorParams.rotation = rot;
          this._applyParamsToLinkedTile();
          const newPanel = this._buildParamPanel();
          newPanel.id = 'editor-param-panel';
          panel.replaceWith(newPanel);
        });
        rotWrap.appendChild(rb);
      }
      panel.appendChild(rotWrap);
    }

    // Source/Chamber(tank): capacity
    const cc = isChm ? chamberPaletteContent(p as ChamberPalette) : null;
    if (p === PipeShape.Source || cc === 'tank') {
      panel.appendChild(this._labeledInput('Capacity', String(this._editorParams.capacity), (v) => {
        this._editorParams.capacity = parseInt(v) || 0;
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }

    // Source: temperature and pressure
    if (p === PipeShape.Source) {
      panel.appendChild(this._labeledInput('Base Temp', String(this._editorParams.temperature), (v) => {
        this._editorParams.temperature = parseInt(v) || 0;
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
      panel.appendChild(this._labeledInput('Base Pressure', String(this._editorParams.pressure), (v) => {
        this._editorParams.pressure = parseInt(v) || 1;
        this._applyParamsToLinkedTile();
      }, 'number', '90px'));
    }

    // Chamber: content type
    if (p === PipeShape.Chamber) {
      const sel = document.createElement('select');
      sel.style.cssText =
        'padding:5px 8px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
        'border:1px solid #4a90d9;border-radius:4px;flex:1;';
      for (const opt of ['tank', 'dirt', 'item', 'heater', 'ice', 'pump', 'weak_ice']) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt === 'weak_ice' ? 'Weak Ice' : opt.charAt(0).toUpperCase() + opt.slice(1);
        if (this._editorParams.chamberContent === opt) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        this._editorParams.chamberContent = sel.value as TileParams['chamberContent'];
        if (sel.value === 'ice' || sel.value === 'weak_ice') {
          if (this._editorParams.temperature === 0) this._editorParams.temperature = 1;
        }
        this._applyParamsToLinkedTile();
        const newPanel = this._buildParamPanel();
        newPanel.id = 'editor-param-panel';
        panel.replaceWith(newPanel);
      });
      const selWrap = document.createElement('div');
      selWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const selLbl = document.createElement('span');
      selLbl.style.cssText = 'font-size:0.78rem;color:#aaa;min-width:56px;';
      selLbl.textContent = 'Content:';
      selWrap.appendChild(selLbl);
      selWrap.appendChild(sel);
      panel.appendChild(selWrap);
    }

    if (isChm) {
      // Chamber content-specific params (content type is determined by the palette selection)
      const cc = chamberPaletteContent(p as ChamberPalette);
      if (cc === 'dirt') {
        panel.appendChild(this._labeledInput('Cost', String(this._editorParams.cost), (v) => {
          this._editorParams.cost = parseInt(v) || 0;
          this._applyParamsToLinkedTile();
        }, 'number', '90px'));
      }
      if (cc === 'heater') {
        panel.appendChild(this._labeledInput('Temp +', String(this._editorParams.temperature), (v) => {
          this._editorParams.temperature = parseInt(v) || 0;
          this._applyParamsToLinkedTile();
        }, 'number', '90px'));
      }
      if (cc === 'ice' || cc === 'weak_ice') {
        panel.appendChild(this._labeledInput('Cost/°', String(this._editorParams.cost), (v) => {
          this._editorParams.cost = parseInt(v) || 0;
          this._applyParamsToLinkedTile();
        }, 'number', '90px'));
        panel.appendChild(this._labeledInput('Temp °', String(this._editorParams.temperature), (v) => {
          this._editorParams.temperature = parseInt(v) || 0;
          this._applyParamsToLinkedTile();
        }, 'number', '90px'));
      }
      if (cc === 'pump') {
        panel.appendChild(this._labeledInput('Pressure +', String(this._editorParams.pressure), (v) => {
          this._editorParams.pressure = parseInt(v) || 1;
          this._applyParamsToLinkedTile();
        }, 'number', '90px'));
      }
      if (cc === 'item') {
        // Item shape selector
        const itemSel = document.createElement('select');
        itemSel.style.cssText =
          'padding:5px 8px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
          'border:1px solid #4a90d9;border-radius:4px;flex:1;';
        for (const shp of [PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee, PipeShape.Cross,
                           PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross]) {
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
        itemSelWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const itemLbl = document.createElement('span');
        itemLbl.style.cssText = 'font-size:0.78rem;color:#aaa;min-width:56px;';
        itemLbl.textContent = 'Shape:';
        itemSelWrap.appendChild(itemLbl);
        itemSelWrap.appendChild(itemSel);
        panel.appendChild(itemSelWrap);
        panel.appendChild(this._labeledInput('Count', String(this._editorParams.itemCount), (v) => {
          this._editorParams.itemCount = parseInt(v) || 1;
          this._applyParamsToLinkedTile();
        }, 'number', '90px'));
      }
    }

    // Connections (Source, Sink, Chamber)
    if (p === PipeShape.Source || p === PipeShape.Sink || isChm) {
      const connWrap = document.createElement('div');
      connWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
      const connLbl = document.createElement('div');
      connLbl.style.cssText = 'font-size:0.78rem;color:#aaa;';
      connLbl.textContent = 'Connections';
      connWrap.appendChild(connLbl);
      const cbRow = document.createElement('div');
      cbRow.style.cssText = 'display:flex;gap:8px;';
      for (const dir of ['N', 'E', 'S', 'W'] as Array<keyof TileParams['connections']>) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this._editorParams.connections[dir];
        cb.id = `editor-conn-${dir}`;
        cb.addEventListener('change', () => {
          this._editorParams.connections[dir] = cb.checked;
          this._applyParamsToLinkedTile();
        });
        const cbLbl = document.createElement('label');
        cbLbl.htmlFor = cb.id;
        cbLbl.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:0.8rem;';
        cbLbl.appendChild(cb);
        cbLbl.appendChild(document.createTextNode(dir));
        cbRow.appendChild(cbLbl);
      }
      connWrap.appendChild(cbRow);
      panel.appendChild(connWrap);
    }

    return panel;
  }

  // ─── Grid size panel ──────────────────────────────────────────────────────

  private _buildGridSizePanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;' +
      'display:flex;flex-direction:column;gap:8px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.8rem;color:#7ed321;font-weight:bold;letter-spacing:1px;';
    title.textContent = 'GRID SIZE';
    panel.appendChild(title);

    const rowsInp = document.createElement('input');
    rowsInp.type = 'number';
    rowsInp.min = '2';
    rowsInp.max = '20';
    rowsInp.value = String(this._editRows);
    rowsInp.style.cssText = 'padding:4px;width:60px;background:#0d1a30;color:#eee;border:1px solid #4a90d9;border-radius:4px;';
    const colsInp = document.createElement('input');
    colsInp.type = 'number';
    colsInp.min = '2';
    colsInp.max = '20';
    colsInp.value = String(this._editCols);
    colsInp.style.cssText = 'padding:4px;width:60px;background:#0d1a30;color:#eee;border:1px solid #4a90d9;border-radius:4px;';

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.85rem;';
    inputRow.appendChild(document.createTextNode('Rows:'));
    inputRow.appendChild(rowsInp);
    inputRow.appendChild(document.createTextNode('Cols:'));
    inputRow.appendChild(colsInp);
    panel.appendChild(inputRow);

    panel.appendChild(this._btn('↔ Resize', '#16213e', '#f0c040', () => {
      const newR = Math.max(2, Math.min(20, parseInt(rowsInp.value) || this._editRows));
      const newC = Math.max(2, Math.min(20, parseInt(colsInp.value) || this._editCols));
      this._resizeGrid(newR, newC);
    }));

    return panel;
  }

  // ─── Inventory editor panel ───────────────────────────────────────────────

  private _buildInventoryEditor(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'editor-inventory-panel';
    panel.style.cssText =
      'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;' +
      'display:flex;flex-direction:column;gap:6px;min-width:180px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.8rem;color:#7ed321;font-weight:bold;letter-spacing:1px;margin-bottom:4px;';
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
                       PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross]) {
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
      const panel = document.getElementById('editor-inventory-panel');
      if (panel) panel.replaceWith(this._buildInventoryEditor());
    });
    row.appendChild(delBtn);
    return row;
  }

  private _buildInventoryReadonly(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;' +
      'display:flex;flex-direction:column;gap:6px;min-width:180px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.8rem;color:#7ed321;font-weight:bold;letter-spacing:1px;margin-bottom:4px;';
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

  private _onEditorMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // left button only
    const pos = this._canvasPos(e);
    if (!pos) return;

    const existingTile = this._editGrid[pos.row][pos.col];

    if (existingTile !== null && this._editorPalette !== 'erase') {
      // Start a drag: track the tile but don't modify the grid yet
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._renderEditorCanvas();
    } else {
      // Paint / erase immediately
      this._recordEditorSnapshot();
      if (this._editorPalette === 'erase') {
        this._editGrid[pos.row][pos.col] = null;
      } else {
        this._editGrid[pos.row][pos.col] = this._buildTileDef(this._editorPalette);
      }
      this._renderEditorCanvas();
    }
  }

  private _onEditorMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return; // left button only
    if (!this._dragState) return;

    const { startPos, tile, currentPos, moved } = this._dragState;
    this._dragState = null;

    if (moved) {
      // Commit the drag: move tile from startPos to currentPos
      this._recordEditorSnapshot();
      this._editGrid[startPos.row][startPos.col] = null;
      this._editGrid[currentPos.row][currentPos.col] = tile;
    } else {
      // It was a click on a non-empty tile (no movement occurred)
      if (e.ctrlKey) {
        // Ctrl+click: force-overwrite with current palette selection
        this._recordEditorSnapshot();
        if (this._editorPalette === 'erase') {
          this._editGrid[startPos.row][startPos.col] = null;
        } else {
          this._editGrid[startPos.row][startPos.col] = this._buildTileDef(this._editorPalette);
        }
      } else if (
        this._editorPalette !== 'erase' &&
        PIPE_SHAPES.has(this._editorPalette as PipeShape) &&
        PIPE_SHAPES.has(tile.shape)
      ) {
        // Both palette and tile are pipe shapes: auto-replace
        this._recordEditorSnapshot();
        this._editGrid[startPos.row][startPos.col] = this._buildTileDef(this._editorPalette);
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
    this._renderEditorCanvas();
  }

  private _onEditorCanvasMouseMove(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    this._editorHover = pos;

    if (this._dragState && pos) {
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

  private _onEditorCanvasWheel(e: WheelEvent): void {
    e.preventDefault();
    const clockwise = e.deltaY > 0;
    const p = this._editorPalette;
    if (p === 'erase' || p === PipeShape.GoldSpace || p === PipeShape.Granite || p === PipeShape.Empty) return;

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

    this._applyParamsToLinkedTile();
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
    this._linkedTilePos = pos ?? null;
    this._linkedTileDirty = false;
    this._populateParamsFromDef(def);
    this._refreshPaletteUI();
  }

  /** Set _editorParams to match all relevant fields from a TileDef. */
  private _populateParamsFromDef(def: TileDef): void {
    this._editorParams = { ...DEFAULT_PARAMS };
    if (def.rotation !== undefined) this._editorParams.rotation = def.rotation;
    if (def.capacity !== undefined) this._editorParams.capacity = def.capacity;
    if (def.cost !== undefined) this._editorParams.cost = def.cost;
    if (def.temperature !== undefined) this._editorParams.temperature = def.temperature;
    if (def.pressure !== undefined) this._editorParams.pressure = def.pressure;
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
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)  / TILE_SIZE);
    if (row < 0 || row >= this._editRows || col < 0 || col >= this._editCols) return null;
    return { row, col };
  }

  /** Build a TileDef from the current palette and params. */
  private _buildTileDef(palette: EditorPalette): TileDef {
    if (palette === 'erase') return { shape: PipeShape.Empty };

    const isChm = isChamberPalette(palette);
    const effectiveShape = isChm ? PipeShape.Chamber : (palette as PipeShape);
    const p = this._editorParams;
    // Source, Sink, and Chamber are rotationally symmetric – omit rotation from their defs.
    const noRotation = effectiveShape === PipeShape.Source || effectiveShape === PipeShape.Sink || effectiveShape === PipeShape.Chamber;
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
      if (p.pressure !== 1) def.pressure = p.pressure;
    } else if (isChm) {
      const cc = chamberPaletteContent(palette as ChamberPalette);
      def.chamberContent = cc;
      if (cc === 'tank') def.capacity = p.capacity;
      if (cc === 'dirt') def.cost = p.cost;
      if (cc === 'heater') def.temperature = p.temperature;
      if (cc === 'ice') { def.cost = p.cost; def.temperature = p.temperature; }
      if (cc === 'pump') def.pressure = p.pressure;
      if (cc === 'weak_ice') { def.cost = p.cost; def.temperature = p.temperature; }
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
    this._updateEditorUndoRedoButtons();
  }

  private _editorUndo(): void {
    if (this._editorHistoryIdx <= 0) return;
    this._editorHistoryIdx--;
    this._restoreEditorSnapshot(this._editorHistory[this._editorHistoryIdx]);
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  private _editorRedo(): void {
    if (this._editorHistoryIdx >= this._editorHistory.length - 1) return;
    this._editorHistoryIdx++;
    this._restoreEditorSnapshot(this._editorHistory[this._editorHistoryIdx]);
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
      this._editorCanvas.width  = this._editCols * TILE_SIZE;
      this._editorCanvas.height = this._editRows * TILE_SIZE;
    }
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
    this._recordEditorSnapshot();
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
    if (this._editorCanvas) {
      this._editorCanvas.width  = newCols * TILE_SIZE;
      this._editorCanvas.height = newRows * TILE_SIZE;
    }
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
      // If source is directly connected to sink (pre-solved), warn
      if (board.isSolved()) {
        msgs.push('⚠️ Level is already solved without placing any tiles.');
      } else {
        msgs.push('✅ Level structure looks valid.');
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

    return {
      id: existingId,
      name: this._editLevelName,
      rows: this._editRows,
      cols: this._editCols,
      grid: JSON.parse(JSON.stringify(this._editGrid)) as (TileDef | null)[][],
      inventory: JSON.parse(JSON.stringify(this._editInventory)) as InventoryItem[],
    };
  }

  // ─── Save level ────────────────────────────────────────────────────────────

  private _saveLevel(campaign: CampaignDef, chapterIdx: number, levelIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;

    const newLevel = this._buildCurrentLevelDef();
    if (levelIdx >= 0 && levelIdx < chapter.levels.length) {
      chapter.levels[levelIdx] = newLevel;
    } else {
      chapter.levels.push(newLevel);
    }
    this._saveCampaigns();

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

  // ─── Import / Export ──────────────────────────────────────────────────────

  /** Export a campaign by triggering a JSON file download. */
  private _exportCampaign(campaign: CampaignDef): void {
    const json = JSON.stringify(campaign, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaign.name.replace(/\s+/g, '_')}.pipes.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Import a campaign from a JSON file. */
  private _importCampaign(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as CampaignDef;
          if (!data.id || !data.name || !Array.isArray(data.chapters)) {
            alert('Invalid campaign file format.');
            return;
          }
          // Ensure we don't clobber the official campaign
          if (data.id === 'official') {
            data.id = generateCampaignId();
            alert(`Note: this file has the reserved "official" ID. A new unique ID has been assigned to the imported campaign.`);
          }
          // Check for duplicate ID and reassign silently
          if (this._campaigns.some((c) => c.id === data.id)) {
            data.id = generateCampaignId();
          }
          this._campaigns.push(data);
          this._saveCampaigns();
          alert(`Campaign "${data.name}" imported successfully.`);
          this._showCampaignList();
        } catch {
          alert('Failed to parse campaign file. Please check the format.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private _saveCampaigns(): void {
    saveImportedCampaigns(this._campaigns);
  }

  /** Return all campaigns (Official + user campaigns) for external use (e.g. campaign select screen). */
  getAllCampaigns(): CampaignDef[] {
    return [OFFICIAL_CAMPAIGN, ...this._campaigns];
  }

  /** Reload campaigns from storage (called after an import or external change). */
  reloadCampaigns(): void {
    this._campaigns = loadImportedCampaigns();
  }
}
