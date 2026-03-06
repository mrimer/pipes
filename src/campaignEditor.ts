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
import { loadImportedCampaigns, saveImportedCampaigns } from './persistence';
import { TILE_SIZE } from './renderer';
import { Tile } from './tile';
import { Board } from './board';

// ─── The built-in "Official" campaign ────────────────────────────────────────

/** The pre-loaded read-only campaign derived from the built-in levels. */
export const OFFICIAL_CAMPAIGN: CampaignDef = {
  id: 'official',
  name: 'Official',
  author: 'Pipes Team',
  chapters: CHAPTERS,
};

// ─── Editor palette tool ──────────────────────────────────────────────────────

/** Which palette item is currently active in the level editor. */
type EditorPalette =
  | 'erase'
  | PipeShape;

// ─── Tile parameter state ────────────────────────────────────────────────────

/** Editable parameters for the currently selected palette tile. */
interface TileParams {
  rotation: Rotation;
  capacity: number;
  cost: number;
  temperature: number;
  chamberContent: 'tank' | 'dirt' | 'item' | 'heater' | 'ice';
  itemShape: PipeShape;
  itemCount: number;
  connections: { N: boolean; E: boolean; S: boolean; W: boolean };
}

const DEFAULT_PARAMS: TileParams = {
  rotation: 0,
  capacity: 6,
  cost: 1,
  temperature: 0,
  chamberContent: 'tank',
  itemShape: PipeShape.Straight,
  itemCount: 1,
  connections: { N: true, E: true, S: true, W: true },
};

// ─── Editor snapshot for undo/redo ───────────────────────────────────────────

interface EditorSnapshot {
  grid: (TileDef | null)[][];
  rows: number;
  cols: number;
  inventory: InventoryItem[];
}

// ─── Validation result ────────────────────────────────────────────────────────

interface ValidationResult {
  ok: boolean;
  messages: string[];
}

// ─── Editor tile colors ────────────────────────────────────────────────────────

const EDITOR_COLORS: Partial<Record<PipeShape, string>> = {
  [PipeShape.Source]:       '#27ae60',
  [PipeShape.Sink]:         '#2980b9',
  [PipeShape.Straight]:     '#4a90d9',
  [PipeShape.Elbow]:        '#4a90d9',
  [PipeShape.Tee]:          '#4a90d9',
  [PipeShape.Cross]:        '#4a90d9',
  [PipeShape.Granite]:      '#636e72',
  [PipeShape.GoldSpace]:    '#b8860b',
  [PipeShape.GoldStraight]: '#f39c12',
  [PipeShape.GoldElbow]:    '#f39c12',
  [PipeShape.GoldTee]:      '#f39c12',
  [PipeShape.GoldCross]:    '#f39c12',
};

function chamberColor(content: string): string {
  switch (content) {
    case 'tank':   return '#74b9ff';
    case 'dirt':   return '#a29bfe';
    case 'item':   return '#ffd700';
    case 'heater': return '#e17055';
    case 'ice':    return '#00cec9';
    default:       return '#b2bec3';
  }
}

// ─── Helper: generate a unique ID ─────────────────────────────────────────────

/** Generate a unique campaign ID. */
function generateCampaignId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Generate a numeric level ID unlikely to collide with official levels (1–99). */
function generateLevelId(): number {
  return 10000 + Math.floor(Math.random() * 89999);
}

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
  private _editorPalette: EditorPalette = 'erase';
  private _editorParams: TileParams = { ...DEFAULT_PARAMS };
  private _editorCanvas: HTMLCanvasElement | null = null;
  private _editorCtx: CanvasRenderingContext2D | null = null;
  private _editorHover: { row: number; col: number } | null = null;
  private _editorHistory: EditorSnapshot[] = [];
  private _editorHistoryIdx = -1;

  private readonly _onClose: () => void;
  private readonly _onPlaytest: (level: LevelDef) => void;

  constructor(onClose: () => void, onPlaytest: (level: LevelDef) => void) {
    this._onClose = onClose;
    this._onPlaytest = onPlaytest;
    this._campaigns = loadImportedCampaigns();

    this._el = document.createElement('div');
    this._el.style.cssText =
      'display:none;position:fixed;inset:0;background:#0d1520;overflow:auto;z-index:200;' +
      'font-family:Arial,sans-serif;color:#eee;flex-direction:column;align-items:center;';
    document.body.appendChild(this._el);
  }

  /** Show the campaign editor (campaign list screen). */
  show(): void {
    this._el.style.display = 'flex';
    this._showCampaignList();
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

  private _labeledInput(labelText: string, value: string, onInput: (v: string) => void, type = 'text'): HTMLElement {
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
      'border:1px solid #4a90d9;border-radius:4px;flex:1;';
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
    meta.textContent = `By ${campaign.author}  ·  ${campaign.chapters.length} chapter(s)  ·  ${levelCount} level(s)`;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    if (!isOfficial) {
      btns.appendChild(this._btn('✏️ Edit', '#16213e', '#f0c040', () => {
        this._activeCampaignId = campaign.id;
        this._showCampaignDetail();
      }));
    } else {
      btns.appendChild(this._btn('👁 View', '#16213e', '#7ed321', () => {
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
    this._editorPalette = 'erase';
    this._editorParams = { ...DEFAULT_PARAMS };
    this._editorHistory = [];
    this._editorHistoryIdx = -1;
    this._editorHover = null;
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
      canvas.addEventListener('click',       (e) => this._onEditorCanvasClick(e));
      canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this._onEditorCanvasRightClick(e); });
      canvas.addEventListener('mousemove',   (e) => this._onEditorCanvasMouseMove(e));
      canvas.addEventListener('mouseleave',  () => { this._editorHover = null; this._renderEditorCanvas(); });
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
    { palette: 'erase',            label: '🗑 Erase (→ Empty)' },
    { palette: PipeShape.Empty,    label: '░ Player Cell' },
    { palette: PipeShape.Source,   label: '💧 Source' },
    { palette: PipeShape.Sink,     label: '🏁 Sink' },
    { palette: PipeShape.Straight, label: '━ Straight (fixed)' },
    { palette: PipeShape.Elbow,    label: '┗ Elbow (fixed)' },
    { palette: PipeShape.Tee,      label: '┣ Tee (fixed)' },
    { palette: PipeShape.Cross,    label: '╋ Cross (fixed)' },
    { palette: PipeShape.Chamber,  label: '■ Chamber' },
    { palette: PipeShape.Granite,  label: '▪ Granite' },
    { palette: PipeShape.GoldSpace, label: '✦ Gold Space' },
    { palette: PipeShape.GoldStraight, label: '━ Gold Straight' },
    { palette: PipeShape.GoldElbow,    label: '┗ Gold Elbow' },
    { palette: PipeShape.GoldTee,      label: '┣ Gold Tee' },
    { palette: PipeShape.GoldCross,    label: '╋ Gold Cross' },
  ];

  private _buildPalette(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;' +
      'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.8rem;color:#7ed321;font-weight:bold;margin-bottom:4px;letter-spacing:1px;';
    title.textContent = 'TILE PALETTE';
    panel.appendChild(title);

    for (const item of this._PALETTE_ITEMS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.dataset['palette'] = String(item.palette);
      btn.style.cssText =
        'padding:5px 8px;font-size:0.78rem;text-align:left;border-radius:4px;cursor:pointer;' +
        'border:1px solid ' + (this._editorPalette === item.palette ? '#f0c040' : '#2a3a5e') + ';' +
        'background:' + (this._editorPalette === item.palette ? '#2a3a1a' : '#0d1a30') + ';' +
        'color:' + (this._editorPalette === item.palette ? '#f0c040' : '#eee') + ';';

      btn.addEventListener('click', () => {
        this._editorPalette = item.palette;
        // Re-render the palette to update button states
        const newPanel = this._buildPalette();
        panel.replaceWith(newPanel);
        // Update param panel
        const paramPanel = document.getElementById('editor-param-panel');
        if (paramPanel) {
          const newParam = this._buildParamPanel();
          newParam.id = 'editor-param-panel';
          paramPanel.replaceWith(newParam);
        }
        this._renderEditorCanvas();
      });
      panel.appendChild(btn);
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
    if (p === 'erase' || p === PipeShape.Empty || p === PipeShape.Granite || p === PipeShape.GoldSpace) {
      const none = document.createElement('div');
      none.style.cssText = 'font-size:0.8rem;color:#555;';
      none.textContent = 'No parameters';
      panel.appendChild(none);
      return panel;
    }

    // Rotation (for pipes and most tiles)
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
        const newPanel = this._buildParamPanel();
        newPanel.id = 'editor-param-panel';
        panel.replaceWith(newPanel);
      });
      rotWrap.appendChild(rb);
    }
    panel.appendChild(rotWrap);

    // Source/Chamber: capacity
    if (p === PipeShape.Source || (p === PipeShape.Chamber && this._editorParams.chamberContent === 'tank')) {
      panel.appendChild(this._labeledInput('Capacity', String(this._editorParams.capacity), (v) => {
        this._editorParams.capacity = parseInt(v) || 0;
      }, 'number'));
    }

    // Source: temperature
    if (p === PipeShape.Source) {
      panel.appendChild(this._labeledInput('Base Temp', String(this._editorParams.temperature), (v) => {
        this._editorParams.temperature = parseInt(v) || 0;
      }, 'number'));
    }

    // Chamber: content type
    if (p === PipeShape.Chamber) {
      const sel = document.createElement('select');
      sel.style.cssText =
        'padding:5px 8px;font-size:0.85rem;background:#0d1a30;color:#eee;' +
        'border:1px solid #4a90d9;border-radius:4px;flex:1;';
      for (const opt of ['tank', 'dirt', 'item', 'heater', 'ice']) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
        if (this._editorParams.chamberContent === opt) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        this._editorParams.chamberContent = sel.value as TileParams['chamberContent'];
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

      // Chamber content-specific params
      const cc = this._editorParams.chamberContent;
      if (cc === 'dirt') {
        panel.appendChild(this._labeledInput('Cost', String(this._editorParams.cost), (v) => {
          this._editorParams.cost = parseInt(v) || 0;
        }, 'number'));
      }
      if (cc === 'heater') {
        panel.appendChild(this._labeledInput('Temp +', String(this._editorParams.temperature), (v) => {
          this._editorParams.temperature = parseInt(v) || 0;
        }, 'number'));
      }
      if (cc === 'ice') {
        panel.appendChild(this._labeledInput('Cost/Δ', String(this._editorParams.cost), (v) => {
          this._editorParams.cost = parseInt(v) || 0;
        }, 'number'));
        panel.appendChild(this._labeledInput('Thresh°', String(this._editorParams.temperature), (v) => {
          this._editorParams.temperature = parseInt(v) || 0;
        }, 'number'));
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
        itemSel.addEventListener('change', () => { this._editorParams.itemShape = itemSel.value as PipeShape; });
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
        }, 'number'));
      }
    }

    // Connections (Source, Sink, Chamber)
    if (p === PipeShape.Source || p === PipeShape.Sink || p === PipeShape.Chamber) {
      const connWrap = document.createElement('div');
      connWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
      const connLbl = document.createElement('div');
      connLbl.style.cssText = 'font-size:0.78rem;color:#aaa;';
      connLbl.textContent = 'Connections (default=all):';
      connWrap.appendChild(connLbl);
      const cbRow = document.createElement('div');
      cbRow.style.cssText = 'display:flex;gap:8px;';
      for (const dir of ['N', 'E', 'S', 'W'] as Array<keyof TileParams['connections']>) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this._editorParams.connections[dir];
        cb.id = `editor-conn-${dir}`;
        cb.addEventListener('change', () => { this._editorParams.connections[dir] = cb.checked; });
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
    const CELL = TILE_SIZE;
    ctx.clearRect(0, 0, this._editCols * CELL, this._editRows * CELL);

    for (let r = 0; r < this._editRows; r++) {
      for (let c = 0; c < this._editCols; c++) {
        const x = c * CELL;
        const y = r * CELL;
        const def = this._editGrid[r]?.[c] ?? null;

        // Cell background
        if (def === null) {
          // Empty (player-fillable) – light grid cell
          ctx.fillStyle = '#1a2840';
          ctx.fillRect(x, y, CELL, CELL);
          // Dashed border
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#2a3a5e';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
          ctx.setLineDash([]);
          // Subtle dot
          ctx.fillStyle = '#2a3a5e';
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          this._drawEditorTile(ctx, x, y, def);
          // Solid border for fixed tiles
          ctx.strokeStyle = '#2a3a5e';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        }
      }
    }

    // Hover highlight
    if (this._editorHover) {
      const { row, col } = this._editorHover;
      ctx.fillStyle = 'rgba(240,192,64,0.18)';
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
    }

    // Grid lines overlay
    ctx.strokeStyle = 'rgba(74,144,217,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let r = 0; r <= this._editRows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(this._editCols * CELL, r * CELL);
      ctx.stroke();
    }
    for (let c = 0; c <= this._editCols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, this._editRows * CELL);
      ctx.stroke();
    }
  }

  /** Draw a single editor tile (from TileDef) at canvas pixel (x, y). */
  private _drawEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, def: TileDef): void {
    const CELL = TILE_SIZE;
    const { shape } = def;
    const chamberContent = def.chamberContent ?? 'tank';

    // Background color
    let bgColor: string;
    if (shape === PipeShape.Chamber) {
      bgColor = chamberColor(chamberContent);
    } else if (shape === PipeShape.GoldSpace) {
      bgColor = '#b8860b';
    } else if (shape === PipeShape.Granite) {
      bgColor = '#4a5568';
    } else {
      bgColor = EDITOR_COLORS[shape] ?? '#4a90d9';
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, CELL, CELL);

    // Draw the tile as a Tile object using existing drawPipe infrastructure
    // We construct a temporary Tile to render it
    const rot = (def.rotation ?? 0) as Rotation;
    const customConns = def.connections ? new Set(def.connections) : null;
    const tile = new Tile(
      shape,
      rot,
      true,
      def.capacity ?? 0,
      def.cost ?? 0,
      def.itemShape ?? null,
      def.itemCount ?? 1,
      customConns,
      def.chamberContent ?? null,
      def.temperature ?? 0,
    );

    // Draw using a simplified tile renderer for the editor
    this._drawTileOnEditor(ctx, x, y, tile);
  }

  /** Simplified tile drawing for the editor canvas. */
  private _drawTileOnEditor(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile): void {
    const CELL = TILE_SIZE;
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;

    ctx.save();
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const shape = tile.shape;

    if (shape === PipeShape.Empty) {
      // Already drawn as empty cell
    } else if (shape === PipeShape.Granite) {
      // Render granite as a textured block
      ctx.fillStyle = '#636e72';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = '#4a5568';
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if ((i + j) % 2 === 0) {
            ctx.fillRect(x + i * (CELL / 3), y + j * (CELL / 3), CELL / 3, CELL / 3);
          }
        }
      }
      ctx.fillStyle = '#fff';
      ctx.fillText('GRA', cx, cy);
    } else if (shape === PipeShape.GoldSpace) {
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = '#ffd700';
      ctx.fillText('GOLD', cx, cy);
      ctx.fillText('SPACE', cx, cy + 14);
    } else if (shape === PipeShape.Source) {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = '#fff';
      ctx.fillText('SRC', cx, cy - 8);
      ctx.font = '10px Arial';
      ctx.fillText(`cap:${tile.capacity}`, cx, cy + 8);
      if (tile.temperature > 0) ctx.fillText(`${tile.temperature}°`, cx, cy + 20);
      // Draw connection lines
      this._drawConnectionLines(ctx, x, y, tile);
    } else if (shape === PipeShape.Sink) {
      ctx.fillStyle = '#2980b9';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = '#fff';
      ctx.fillText('SINK', cx, cy);
      this._drawConnectionLines(ctx, x, y, tile);
    } else if (shape === PipeShape.Chamber) {
      const cc = tile.chamberContent ?? 'tank';
      ctx.fillStyle = chamberColor(cc);
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = '#fff';
      ctx.fillText(cc.toUpperCase(), cx, cy - 6);
      ctx.font = '10px Arial';
      if (cc === 'tank') ctx.fillText(`cap:${tile.capacity}`, cx, cy + 8);
      else if (cc === 'dirt') ctx.fillText(`cost:${tile.cost}`, cx, cy + 8);
      else if (cc === 'heater') ctx.fillText(`+${tile.temperature}°`, cx, cy + 8);
      else if (cc === 'ice') ctx.fillText(`${tile.cost}/Δ thr:${tile.temperature}°`, cx, cy + 8);
      else if (cc === 'item') ctx.fillText(`${tile.itemShape?.slice(0, 3)}×${tile.itemCount}`, cx, cy + 8);
      this._drawConnectionLines(ctx, x, y, tile);
    } else {
      // Fixed pipe shapes (Straight, Elbow, Tee, Cross, Gold variants)
      const isGold = [PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross].includes(shape);
      ctx.fillStyle = isGold ? '#b8860b' : '#1a2a4e';
      ctx.fillRect(x, y, CELL, CELL);
      // Draw pipe lines
      ctx.strokeStyle = isGold ? '#ffd700' : '#4a90d9';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((tile.rotation * Math.PI) / 180);
      const h = CELL / 2;
      if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight) {
        ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
      } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow) {
        ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
      } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee) {
        ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
      } else if (shape === PipeShape.Cross || shape === PipeShape.GoldCross) {
        ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, 0); ctx.stroke();
      }
      ctx.restore();
      // Fixed label
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 9px Arial';
      ctx.fillText('FIX', cx, cy + 22);
    }

    ctx.restore();
  }

  private _drawConnectionLines(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile): void {
    const CELL = TILE_SIZE;
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const dir of tile.connections) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      if (dir === Direction.North) ctx.lineTo(cx, y);
      else if (dir === Direction.South) ctx.lineTo(cx, y + CELL);
      else if (dir === Direction.East)  ctx.lineTo(x + CELL, cy);
      else if (dir === Direction.West)  ctx.lineTo(x, cy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─── Editor canvas mouse events ────────────────────────────────────────────

  private _onEditorCanvasClick(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    this._recordEditorSnapshot();
    if (this._editorPalette === 'erase') {
      this._editGrid[pos.row][pos.col] = null;
    } else {
      this._editGrid[pos.row][pos.col] = this._buildTileDef(this._editorPalette);
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

    const p = this._editorParams;
    const def: TileDef = { shape: palette as PipeShape, rotation: p.rotation };

    // Connections
    const connDirs: Direction[] = [];
    if (p.connections.N) connDirs.push(Direction.North);
    if (p.connections.E) connDirs.push(Direction.East);
    if (p.connections.S) connDirs.push(Direction.South);
    if (p.connections.W) connDirs.push(Direction.West);
    // Only set explicit connections for Source/Sink/Chamber (not all-4-default)
    const needsConn = (palette === PipeShape.Source || palette === PipeShape.Sink || palette === PipeShape.Chamber);
    if (needsConn && connDirs.length < 4) {
      def.connections = connDirs;
    }

    if (palette === PipeShape.Source) {
      def.capacity = p.capacity;
      if (p.temperature !== 0) def.temperature = p.temperature;
    } else if (palette === PipeShape.Chamber) {
      def.chamberContent = p.chamberContent;
      if (p.chamberContent === 'tank') def.capacity = p.capacity;
      if (p.chamberContent === 'dirt') def.cost = p.cost;
      if (p.chamberContent === 'heater') def.temperature = p.temperature;
      if (p.chamberContent === 'ice') { def.cost = p.cost; def.temperature = p.temperature; }
      if (p.chamberContent === 'item') { def.itemShape = p.itemShape; def.itemCount = p.itemCount; }
    } else if (palette === PipeShape.Empty) {
      // Player-fillable: no special params
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
    this._updateEditorUndoRedoButtons();
    this._renderEditorCanvas();
  }

  private _editorRedo(): void {
    if (this._editorHistoryIdx >= this._editorHistory.length - 1) return;
    this._editorHistoryIdx++;
    this._restoreEditorSnapshot(this._editorHistory[this._editorHistoryIdx]);
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
    if (undoBtn) undoBtn.disabled = this._editorHistoryIdx <= 0;
    if (redoBtn) redoBtn.disabled = this._editorHistoryIdx >= this._editorHistory.length - 1;
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
