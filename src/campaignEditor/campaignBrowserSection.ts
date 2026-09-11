/**
 * Campaign browser — the campaign-list, campaign-detail, and chapter-detail
 * screens (plus their CRUD actions: create/add/delete/duplicate/reorder/move)
 * extracted from CampaignEditor. Unlike ChapterMapEditorSection/
 * CampaignMapEditorSection (sub-panels within a screen), this owns top-level
 * screen switching for its three screens — but the underlying navigation
 * state (`_screen`, `_activeCampaignId`, `_activeChapterIdx`,
 * `_activeLevelIdx`) stays on CampaignEditor because the level-editor screen
 * (still there) reads/writes it too. Hence the wide callback interface below:
 * this split is a locality win (smaller file to read for list/detail bugs),
 * not as clean a leverage win as CampaignImportExportFlow/GridGestureEngine.
 */

import type { CampaignDef, ChapterDef, LevelDef, TileDef } from '../types';
import { EditorScreen } from './types';
import type { CampaignService } from './campaignService';
import type { EditorDialogs } from './editorDialogs';
import type { DataValidationDialog } from './dataValidationDialog';
import type { CampaignImportExportFlow } from './campaignImportExportFlow';
import type { ChapterMapEditorSection } from './chapterMapEditor';
import type { CampaignMapEditorSection } from './campaignMapEditor';
import { buildLocalizedTextInput } from './localizedTextInput';
import { renderMinimap } from '../visuals/minimap';
import { sfxManager, SfxId } from '../audio/sfxManager';
import { t, getLocale } from '../i18n';
import { resolveLocalizedText, writeLocalizedText } from '../campaignLocalization';
import { isTouchDevice } from '../deviceUtils';
import { ERROR_COLOR, RADIUS_MD, UI_BG, UI_BORDER, UI_GOLD } from '../uiConstants';
import { EDITOR_FLEX_ROW_CSS } from './types';
import { getActiveSlotIndex } from '../profile/activeProfile';
import { loadSlotMeta, loadAllSlotMetas } from '../profile/playerProfileSlots';
import {
  loadCampaignProgress,
  computeCampaignCompletionPct,
  loadActiveCampaignId,
  loadCampaignEditorMapBoxCollapsed,
  loadChapterEditorMapBoxCollapsed,
  loadPlayerName,
} from '../persistence';

/** Context for building one level row in the chapter detail screen's level list. */
interface LevelRowContext {
  campaign: CampaignDef;
  chapterIdx: number;
  levelIdx: number;
  chapter: ChapterDef;
  level: LevelDef;
  readOnly: boolean;
}

/** Builds the "author · N chapters · M levels [· progress]" meta line for a campaign list row. */
function buildCampaignMetaText(campaign: CampaignDef, isOfficial: boolean, levelCount: number): string {
  // Compute play completion percentage for non-official campaigns
  let progressText = '';
  if (!isOfficial && levelCount > 0) {
    const progress = loadCampaignProgress(campaign.id);
    const pct = computeCampaignCompletionPct(campaign, progress);
    progressText = `  ·  ${t('editor.campaign.progressComplete', { percent: pct })}`;
  }

  const chapterWord = campaign.chapters.length === 1 ? t('editor.common.chapterSingular') : t('editor.common.chapterPlural');
  const levelWord = levelCount === 1 ? t('editor.common.levelSingular') : t('editor.common.levelPlural');
  return t('editor.campaign.meta', {
    author: campaign.author,
    chapterCount: campaign.chapters.length,
    chapterWord,
    levelCount,
    levelWord,
    progressText,
  });
}

/** Effects and shared state CampaignBrowserSection needs from the owning CampaignEditor. */
export interface CampaignBrowserCallbacks {
  buildBtn(label: string, bg: string, color: string, onClick: () => void, extraStyle?: string, suppressClick?: boolean): HTMLButtonElement;
  buildToolbar(title: string, onBack: (() => void) | null): HTMLElement;
  getActiveCampaign(): CampaignDef | null;
  touchCampaign(campaign: CampaignDef): void;
  canActivePlayerEdit(campaign: CampaignDef): boolean;
  saveCampaigns(): void;
  hide(): void;
  onClose(): void;
  onPlayCampaign(campaign: CampaignDef): void;
  openLevelEditor(level: LevelDef, readOnly: boolean): void;
  stopEditorSeaAnimationLoops(): void;
  clearSaveFeedbackTimer(): void;
  detachEditorInput(): void;
  setScreen(screen: EditorScreen): void;
  getActiveChapterIdx(): number;
  setActiveChapterIdx(idx: number): void;
  setActiveLevelIdx(idx: number): void;
  setActiveCampaignId(id: string): void;
}

export class CampaignBrowserSection {
  constructor(
    private readonly _el: HTMLElement,
    private readonly _service: CampaignService,
    private readonly _dialogs: EditorDialogs,
    private readonly _dataValidator: DataValidationDialog,
    private readonly _importExportFlow: CampaignImportExportFlow,
    private readonly _campaignMapEditor: CampaignMapEditorSection,
    private readonly _chapterMapEditor: ChapterMapEditorSection,
    private readonly _cb: CampaignBrowserCallbacks,
  ) {}

  // ─── Screen: Campaign list ────────────────────────────────────────────────

  showCampaignList(): void {
    this._cb.stopEditorSeaAnimationLoops();
    this._cb.clearSaveFeedbackTimer();
    this._cb.setScreen(EditorScreen.List);
    this._el.innerHTML = '';

    const toolbar = this._cb.buildToolbar(t('editor.screen.selectCampaign'), () => {
      this._cb.hide();
      this._cb.onClose();
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
      notice.textContent = t('editor.touchNotice');
      content.appendChild(notice);
    }

    // Action bar
    const actionBar = document.createElement('div');
    actionBar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
    actionBar.appendChild(
      this._cb.buildBtn(t('editor.toolbar.newCampaign'), UI_BG, '#7ed321', () => this.createCampaign()),
    );
    actionBar.appendChild(
      this._cb.buildBtn(t('editor.toolbar.import'), UI_BG, '#4a90d9', () => this._importExportFlow.importCampaign()),
    );
    content.appendChild(actionBar);

    // Campaign list
    const allCampaigns = this._service.getAllCampaigns();
    for (const campaign of allCampaigns) {
      content.appendChild(this._buildCampaignRow(campaign));
    }

    this._el.appendChild(content);

    // Resize campaign map canvas after layout is in the DOM so the grid can
    // fill the available space between the side panels.
    requestAnimationFrame(() => {
      this._campaignMapEditor.updateCanvasDisplaySize();
      this._campaignMapEditor.renderCanvas();
    });
  }

  private _buildCampaignRow(campaign: CampaignDef): HTMLElement {
    const isOfficial = campaign.official === true;
    const activeCampaignId = loadActiveCampaignId();
    const isActive = activeCampaignId === campaign.id;
    const canEdit = !isOfficial && this._cb.canActivePlayerEdit(campaign);
    const { row, info, btns } = this._buildItemRow('#4a90d9', '14px 18px');

    const name = document.createElement('div');
    name.style.cssText = 'font-size:1rem;font-weight:bold;';
    name.textContent = resolveLocalizedText(campaign.name) + (isOfficial ? ' 🔒' : '');
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem;color:#aaa;margin-top:4px;';
    const levelCount = campaign.chapters.reduce((n, ch) => n + ch.levels.length, 0);
    meta.textContent = buildCampaignMetaText(campaign, isOfficial, levelCount);
    info.appendChild(name);
    info.appendChild(meta);

    // Play or Active button (shared for both official and user campaigns)
    btns.appendChild(this._buildCampaignPlayButton(campaign, isActive));
    btns.appendChild(this._buildCampaignEditOrViewButton(campaign, isOfficial, canEdit));
    btns.appendChild(this._buildCampaignExportButton(campaign, isOfficial, canEdit));
    this._appendCampaignDeleteButton(btns, campaign, isOfficial);

    return row;
  }

  /** Builds the "Active" (disabled) or "Play" button shared by official and user campaign rows. */
  private _buildCampaignPlayButton(campaign: CampaignDef, isActive: boolean): HTMLElement {
    if (isActive) {
      const activeBtn = this._cb.buildBtn(t('editor.campaign.active'), UI_BG, '#888', () => {}, 'cursor:default;');
      activeBtn.disabled = true;
      return activeBtn;
    }
    return this._cb.buildBtn(t('editor.toolbar.play'), UI_BG, '#7ed321', () => {
      sfxManager.play(SfxId.ChapterSelect);
      this._cb.hide();
      this._cb.onPlayCampaign(campaign);
    });
  }

  /** Builds the read-only "View" button (official campaigns) or the "Edit" button, disabled when the active player isn't the author. */
  private _buildCampaignEditOrViewButton(campaign: CampaignDef, isOfficial: boolean, canEdit: boolean): HTMLElement {
    if (isOfficial) {
      return this._cb.buildBtn(t('editor.toolbar.view'), UI_BG, '#aaa', () => {
        this._cb.setActiveCampaignId(campaign.id);
        this.showCampaignDetail();
      });
    }
    const editBtn = this._cb.buildBtn(t('editor.toolbar.edit'), UI_BG, canEdit ? '#f0c040' : '#666', () => {
      if (!canEdit) return;
      sfxManager.play(SfxId.ChapterSelect);
      this._cb.setActiveCampaignId(campaign.id);
      this.showCampaignDetail();
    });
    if (!canEdit) {
      editBtn.disabled = true;
      editBtn.title = t('editor.campaign.notAuthor');
      editBtn.style.opacity = '0.5';
      editBtn.style.cursor = 'not-allowed';
    }
    return editBtn;
  }

  /** Builds the "Export" button, disabled for a non-official campaign the active player can't edit. */
  private _buildCampaignExportButton(campaign: CampaignDef, isOfficial: boolean, canEdit: boolean): HTMLElement {
    const exportBtn = this._cb.buildBtn(t('editor.toolbar.export'), UI_BG, canEdit ? '#4a90d9' : '#444', () => {
      if (!canEdit) return;
      this._importExportFlow.exportCampaign(campaign);
    });
    if (!isOfficial && !canEdit) {
      exportBtn.disabled = true;
      exportBtn.title = t('editor.campaign.notAuthor');
      exportBtn.style.opacity = '0.5';
      exportBtn.style.cursor = 'not-allowed';
    }
    return exportBtn;
  }

  /** Appends the "Delete" button for non-official campaigns only. */
  private _appendCampaignDeleteButton(btns: HTMLElement, campaign: CampaignDef, isOfficial: boolean): void {
    if (isOfficial) return;
    btns.appendChild(this._cb.buildBtn(t('editor.toolbar.delete'), UI_BG, ERROR_COLOR, () => {
      this.deleteCampaign(campaign.id);
    }));
  }

  // ─── Screen: Campaign detail ──────────────────────────────────────────────

  showCampaignDetail(): void {
    this._cb.stopEditorSeaAnimationLoops();
    this._cb.clearSaveFeedbackTimer();
    this._cb.setScreen(EditorScreen.Campaign);
    this._el.innerHTML = '';

    const campaign = this._cb.getActiveCampaign();
    if (!campaign) { this.showCampaignList(); return; }
    const isOfficial = campaign.official === true;
    // Determine whether this is a user campaign that can have its official flag toggled
    const isUserCampaign = this._service.campaigns.includes(campaign);

    // Initialize campaign map editor grid state before building the section
    this._campaignMapEditor.init(campaign);
    this._campaignMapEditor.setMapBoxCollapsed(loadCampaignEditorMapBoxCollapsed());

    this._el.appendChild(this._buildCampaignDetailToolbar(campaign, isOfficial));

    const content = document.createElement('div');
    content.style.cssText =
      'width:100%;max-width:1200px;padding:20px;box-sizing:border-box;display:flex;' +
      'flex-direction:column;gap:16px;';

    this._appendCampaignToggleSection(content, campaign, isOfficial, isUserCampaign);
    this._appendCampaignFieldsSection(content, campaign, isOfficial);

    // Campaign map editor section (full canvas editor, not just a static preview)
    content.appendChild(this._campaignMapEditor.buildSection(campaign, isOfficial));

    this._appendChaptersSection(content, campaign, isOfficial);

    this._el.appendChild(content);

    // Resize and render campaign map canvas after layout is in the DOM, and
    // ensure undo/redo button state reflects current history on entry.
    requestAnimationFrame(() => {
      this._campaignMapEditor.updateCanvasDisplaySize();
      this._campaignMapEditor.renderCanvas();
      this._campaignMapEditor.syncUndoRedoButtons();
      this._campaignMapEditor.startSeaAnimationLoop();
    });
  }

  /** Builds the top toolbar (back/title + export/validate-data actions) for the campaign detail screen. */
  private _buildCampaignDetailToolbar(campaign: CampaignDef, isOfficial: boolean): HTMLElement {
    const toolbar = this._cb.buildToolbar(
      isOfficial
        ? t('editor.campaign.readOnlyTitle', { name: resolveLocalizedText(campaign.name) })
        : t('editor.campaign.editTitle', { name: resolveLocalizedText(campaign.name) }),
      () => this.showCampaignList(),
    );
    if (!isOfficial) {
      toolbar.appendChild(this._cb.buildBtn(t('editor.toolbar.export'), UI_BG, '#4a90d9', () => this._importExportFlow.exportCampaign(campaign)));
      toolbar.appendChild(this._cb.buildBtn(t('editor.toolbar.exportTexts'), UI_BG, '#7ed321', () => this._importExportFlow.exportCampaignTexts(campaign)));
      if (DEV_CONTROLS) {
        toolbar.appendChild(this._cb.buildBtn(t('editor.toolbar.validateData'), UI_BG, '#f0c040', () => this._onValidateCampaignData(campaign)));
      }
    } else if (DEV_CONTROLS) {
      // Official campaigns get no export UI for non-devs; devs can still produce
      // a text pack to hand out for community translation.
      toolbar.appendChild(this._cb.buildBtn(t('editor.toolbar.exportTexts'), UI_BG, '#7ed321', () => this._importExportFlow.exportCampaignTexts(campaign)));
    }
    return toolbar;
  }

  /** Dev-only "Validate data" toolbar action: remaps legacy styles, backfills authorGuid, then shows the validator dialog. */
  private _onValidateCampaignData(campaign: CampaignDef): void {
    if (this._service.remapLegacyGrassStyles(campaign)) {
      this._service.touch(campaign);
      this._service.save();
    }
    // If no authorGuid is set, try to match by author name across all profiles.
    if (!campaign.authorGuid) {
      const allMetas = loadAllSlotMetas();
      const match = allMetas.find((m) => m !== null && m.name === campaign.author);
      if (match) {
        this._service.updateCampaignField(campaign, 'authorGuid', match.guid);
      }
    }
    this._dataValidator.show(this._el, campaign);
  }

  /** Appends the dev "official" toggle and "anyone edit" checkbox row (user campaigns only). */
  private _appendCampaignToggleSection(
    content: HTMLElement,
    campaign: CampaignDef,
    isOfficial: boolean,
    isUserCampaign: boolean,
  ): void {
    if (!isUserCampaign) return;

    const toggleWrap = document.createElement('div');
    toggleWrap.style.cssText =
      `background:${UI_BG};border:1px solid ${UI_GOLD};border-radius:8px;padding:12px 16px;` +
      'display:flex;align-items:center;gap:20px;flex-wrap:wrap;';

    // Official toggle (dev only)
    if (DEV_CONTROLS) {
      const officialCb = document.createElement('input');
      officialCb.type = 'checkbox';
      officialCb.id = 'official-toggle';
      officialCb.checked = isOfficial;
      officialCb.style.cssText = 'width:16px;height:16px;cursor:pointer;';
      const officialLbl = document.createElement('label');
      officialLbl.htmlFor = 'official-toggle';
      officialLbl.style.cssText = 'font-size:0.9rem;color:#f0c040;cursor:pointer;';
      officialLbl.textContent = t('editor.campaign.officialToggle');
      officialCb.addEventListener('change', () => {
        this._service.updateCampaignField(campaign, 'official', officialCb.checked);
        // Re-render to update read-only state
        this.showCampaignDetail();
      });
      const officialGroup = document.createElement('div');
      officialGroup.style.cssText = 'display:flex;align-items:center;gap:8px;';
      officialGroup.appendChild(officialCb);
      officialGroup.appendChild(officialLbl);
      toggleWrap.appendChild(officialGroup);
    }

    // "Anyone edit" checkbox
    const anyoneEditCb = document.createElement('input');
    anyoneEditCb.type = 'checkbox';
    anyoneEditCb.id = 'anyone-edit-toggle';
    anyoneEditCb.checked = campaign.anyoneEdit === true;
    anyoneEditCb.style.cssText = 'width:16px;height:16px;cursor:pointer;';
    const anyoneEditLbl = document.createElement('label');
    anyoneEditLbl.htmlFor = 'anyone-edit-toggle';
    anyoneEditLbl.style.cssText = 'font-size:0.9rem;color:#f0c040;cursor:pointer;';
    anyoneEditLbl.textContent = t('editor.campaign.anyoneEdit');
    anyoneEditCb.addEventListener('change', () => {
      this._service.updateCampaignField(campaign, 'anyoneEdit', anyoneEditCb.checked);
    });
    const anyoneEditGroup = document.createElement('div');
    anyoneEditGroup.style.cssText = 'display:flex;align-items:center;gap:8px;';
    anyoneEditGroup.appendChild(anyoneEditCb);
    anyoneEditGroup.appendChild(anyoneEditLbl);
    toggleWrap.appendChild(anyoneEditGroup);

    content.appendChild(toggleWrap);
  }

  /** Appends the editable name field + static author display (user campaigns only). */
  private _appendCampaignFieldsSection(content: HTMLElement, campaign: CampaignDef, isOfficial: boolean): void {
    if (isOfficial) return;

    // Name field (editable) and author (static display – author is set automatically from the active player profile)
    const fields = document.createElement('div');
    fields.style.cssText =
      `background:${UI_BG};border:1px solid ${UI_BORDER};border-radius:8px;padding:16px;` +
      'display:flex;flex-direction:column;gap:10px;';

    fields.appendChild(buildLocalizedTextInput(
      t('editor.metadata.name'),
      {
        get: () => campaign.name,
        set: (v) => { this._service.updateCampaignField(campaign, 'name', v ?? ''); },
      },
      EDITOR_FLEX_ROW_CSS,
    ));

    // Author: static text (set from the active player profile at creation time)
    const authorRow = document.createElement('div');
    authorRow.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.9rem;';
    const authorLbl = document.createElement('span');
    authorLbl.style.cssText = 'color:#aaa;min-width:80px;';
    authorLbl.textContent = t('editor.metadata.author');
    const authorVal = document.createElement('span');
    authorVal.style.cssText = 'color:#eee;';
    authorVal.textContent = campaign.author || t('editor.common.noneParen');
    authorRow.appendChild(authorLbl);
    authorRow.appendChild(authorVal);
    fields.appendChild(authorRow);

    content.appendChild(fields);
  }

  /** Appends the chapters header (+ add-chapter button), chapter rows, and the empty-state message. */
  private _appendChaptersSection(content: HTMLElement, campaign: CampaignDef, isOfficial: boolean): void {
    const chaptersHeader = document.createElement('div');
    chaptersHeader.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const chapTitle = document.createElement('h3');
    chapTitle.textContent = t('editor.campaign.chapters');
    chapTitle.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    chaptersHeader.appendChild(chapTitle);

    if (!isOfficial) {
      chaptersHeader.appendChild(this._cb.buildBtn(t('editor.toolbar.addChapter'), UI_BG, '#7ed321', () => {
        sfxManager.play(SfxId.ChapterSelect);
        this.addChapter(campaign);
      }));
    }
    content.appendChild(chaptersHeader);

    for (let ci = 0; ci < campaign.chapters.length; ci++) {
      content.appendChild(this._buildChapterRow(campaign, ci, isOfficial));
    }

    if (campaign.chapters.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#777;font-size:0.85rem;';
      empty.textContent = t('editor.campaign.noChapters');
      content.appendChild(empty);
    }
  }

  private _buildChapterRow(campaign: CampaignDef, chapterIdx: number, readOnly: boolean): HTMLElement {
    const chapter = campaign.chapters[chapterIdx];
    const { row, info, btns } = this._buildItemRow('#2a3a5e', '12px 16px', '6px');

    const name = document.createElement('div');
    name.style.cssText = 'font-size:0.95rem;font-weight:bold;';
    name.textContent = t('editor.chapter.rowTitle', { index: chapterIdx + 1, name: resolveLocalizedText(chapter.name) });
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem;color:#aaa;margin-top:3px;';
    const totalStars = chapter.levels.reduce((s, l) => s + (l.starCount ?? 0), 0);
    const challengeCount = chapter.levels.filter(l => l.challenge).length;
    const metaParts = [`${chapter.levels.length} ${chapter.levels.length === 1 ? t('editor.common.levelSingular') : t('editor.common.levelPlural')}`];
    if (totalStars > 0) metaParts.push(`⭐\u202f×\u202f${totalStars}`);
    if (challengeCount > 0) metaParts.push(`💀\u202f×\u202f${challengeCount}`);
    meta.textContent = metaParts.join('  ');
    info.appendChild(name);
    info.appendChild(meta);
    if (this._hasChapterMapData(chapter)) {
      const pseudoLevel: LevelDef = {
        id: chapter.id,
        name: chapter.name,
        rows: chapter.rows,
        cols: chapter.cols,
        grid: chapter.grid,
        inventory: [],
        style: chapter.style,
      };
      const minimap = renderMinimap(pseudoLevel);
      minimap.style.cssText = 'display:block;margin-top:4px;image-rendering:pixelated;cursor:pointer;border:2px solid white;';
      minimap.addEventListener('click', () => {
        this._cb.setActiveChapterIdx(chapterIdx);
        this.showChapterDetail();
      });
      info.appendChild(minimap);
    }

    const editOrViewLabel = readOnly ? t('editor.toolbar.view') : t('editor.toolbar.edit');
    btns.appendChild(this._cb.buildBtn(editOrViewLabel, UI_BG, '#f0c040', () => {
      this._cb.setActiveChapterIdx(chapterIdx);
      this.showChapterDetail();
    }));

    if (!readOnly) {
      this._appendReorderButtons(btns, campaign.chapters, chapterIdx, campaign, () => this.showCampaignDetail(),
        (fromIdx, toIdx) => this._service.reorderChapters(campaign, fromIdx, toIdx));
      btns.appendChild(this._cb.buildBtn(t('editor.toolbar.deleteIcon'), UI_BG, ERROR_COLOR, () => {
        this._dialogs.showConfirm(
          t('editor.chapter.deleteConfirm', { name: resolveLocalizedText(chapter.name) }),
          () => {
          this._service.deleteChapter(campaign, chapterIdx);
          this.showCampaignDetail();
          },
          t('editor.toolbar.delete'),
          true,
        );
      }));
    }

    return row;
  }

  /** True when chapter has a chapter map grid to render a minimap preview for. */
  private _hasChapterMapData(
    chapter: ChapterDef,
  ): chapter is ChapterDef & { grid: (TileDef | null)[][]; rows: number; cols: number } {
    return !!chapter.grid && !!chapter.rows && !!chapter.cols;
  }

  // ─── Screen: Chapter detail ───────────────────────────────────────────────

  showChapterDetail(): void {
    this._cb.stopEditorSeaAnimationLoops();
    this._cb.clearSaveFeedbackTimer();
    this._cb.detachEditorInput();
    this._cb.setScreen(EditorScreen.Chapter);
    this._el.innerHTML = '';

    const campaign = this._cb.getActiveCampaign();
    if (!campaign) { this.showCampaignList(); return; }
    const activeChapterIdx = this._cb.getActiveChapterIdx();
    const chapter = campaign.chapters[activeChapterIdx];
    if (!chapter) { this.showCampaignDetail(); return; }
    const isOfficial = campaign.official === true;

    // Initialize chapter grid state
    this._chapterMapEditor.init(chapter);
    this._chapterMapEditor.setMapBoxCollapsed(loadChapterEditorMapBoxCollapsed());

    const toolbar = this._cb.buildToolbar(
      t('editor.chapter.title', {
        icon: isOfficial ? '📋' : '✏️',
        index: activeChapterIdx + 1,
        name: resolveLocalizedText(chapter.name),
      }),
      () => this.showCampaignDetail(),
    );
    this._el.appendChild(toolbar);

    const content = document.createElement('div');
    content.style.cssText =
      'width:100%;max-width:1200px;padding:20px;box-sizing:border-box;display:flex;' +
      'flex-direction:column;gap:16px;';

    this._appendChapterNameField(content, campaign, chapter, isOfficial, activeChapterIdx);

    // Chapter map grid editor section
    content.appendChild(this._chapterMapEditor.buildSection(campaign, chapter, isOfficial));

    this._appendChapterLevelsSection(content, campaign, chapter, isOfficial, activeChapterIdx);

    this._el.appendChild(content);

    // Resize canvas after layout is in the DOM
    requestAnimationFrame(() => {
      this._chapterMapEditor.updateCanvasDisplaySize();
      this._chapterMapEditor.renderCanvas();
      this._chapterMapEditor.syncUndoRedoButtons();
      this._chapterMapEditor.startSeaAnimationLoop();
    });
  }

  /** Appends the editable chapter name field (non-official chapters only). */
  private _appendChapterNameField(content: HTMLElement, campaign: CampaignDef, chapter: ChapterDef, isOfficial: boolean, activeChapterIdx: number): void {
    if (isOfficial) return;

    const nameWrap = document.createElement('div');
    nameWrap.style.cssText =
      `background:${UI_BG};border:1px solid ${UI_BORDER};border-radius:8px;padding:16px;`;
    nameWrap.appendChild(buildLocalizedTextInput(
      t('editor.chapter.name'),
      {
        get: () => chapter.name,
        set: (v) => { this._service.renameChapter(campaign, activeChapterIdx, v ?? ''); },
      },
      EDITOR_FLEX_ROW_CSS,
    ));
    content.appendChild(nameWrap);
  }

  /** Appends the levels header (+ add-level button), level rows, and the empty-state message. */
  private _appendChapterLevelsSection(content: HTMLElement, campaign: CampaignDef, chapter: ChapterDef, isOfficial: boolean, activeChapterIdx: number): void {
    const levelsHeader = document.createElement('div');
    levelsHeader.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const lvlTitle = document.createElement('h3');
    lvlTitle.textContent = t('editor.chapter.levels');
    lvlTitle.style.cssText = 'margin:0;font-size:1rem;color:#7ed321;flex:1;';
    levelsHeader.appendChild(lvlTitle);

    if (!isOfficial) {
      levelsHeader.appendChild(this._cb.buildBtn(t('editor.toolbar.addLevel'), UI_BG, '#7ed321', () => {
        this.addLevel(campaign, activeChapterIdx);
      }));
    }
    content.appendChild(levelsHeader);

    for (let li = 0; li < chapter.levels.length; li++) {
      content.appendChild(this._buildLevelRow(campaign, activeChapterIdx, li, isOfficial));
    }

    if (chapter.levels.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#777;font-size:0.85rem;';
      empty.textContent = t('editor.chapter.noLevels');
      content.appendChild(empty);
    }
  }

  private _buildLevelRow(
    campaign: CampaignDef,
    chapterIdx: number,
    levelIdx: number,
    readOnly: boolean,
  ): HTMLElement {
    const chapter = campaign.chapters[chapterIdx];
    const level = chapter.levels[levelIdx];
    const ctx: LevelRowContext = { campaign, chapterIdx, levelIdx, chapter, level, readOnly };
    const { row, info, btns } = this._buildItemRow('#2a3a5e', '12px 16px', '6px');

    this._appendLevelRowNameAndMinimap(info, ctx);
    this._appendLevelRowEditButton(btns, ctx);
    if (!readOnly) this._appendLevelRowEditingButtons(btns, ctx);

    return row;
  }

  private _appendLevelRowNameAndMinimap(info: HTMLElement, ctx: LevelRowContext): void {
    const { level, levelIdx, readOnly } = ctx;
    const name = document.createElement('div');
    name.style.cssText = 'font-size:0.95rem;font-weight:bold;';
    const starSuffix = (level.starCount ?? 0) > 0 ? ` ⭐×${level.starCount}` : '';
    name.textContent = t('editor.level.rowTitle', {
      index: levelIdx + 1,
      name: resolveLocalizedText(level.name),
      challenge: level.challenge ? ' 💀' : '',
      stars: starSuffix,
    });
    const minimap = renderMinimap(level);
    minimap.style.cssText = 'display:block;margin-top:4px;image-rendering:pixelated;cursor:pointer;border:2px solid white;';
    minimap.addEventListener('click', () => {
      this._cb.setActiveLevelIdx(levelIdx);
      this._cb.openLevelEditor(level, readOnly);
    });
    info.appendChild(name);
    info.appendChild(minimap);
  }

  private _appendLevelRowEditButton(btns: HTMLElement, ctx: LevelRowContext): void {
    const { level, levelIdx, readOnly } = ctx;
    const editOrViewLabel = readOnly ? t('editor.toolbar.view') : t('editor.toolbar.edit');
    btns.appendChild(this._cb.buildBtn(editOrViewLabel, UI_BG, '#f0c040', () => {
      this._cb.setActiveLevelIdx(levelIdx);
      this._cb.openLevelEditor(level, readOnly);
    }));
  }

  private _appendLevelRowEditingButtons(btns: HTMLElement, ctx: LevelRowContext): void {
    const { campaign, chapterIdx, levelIdx, chapter, level } = ctx;
    btns.appendChild(this._cb.buildBtn(t('editor.toolbar.duplicate'), UI_BG, '#aaa', () => {
      this._service.duplicateLevel(campaign, chapterIdx, levelIdx);
      this.showChapterDetail();
    }));

    this._appendReorderButtons(btns, chapter.levels, levelIdx, campaign, () => this.showChapterDetail(),
      (fromIdx, toIdx) => this._service.reorderLevels(campaign, chapterIdx, fromIdx, toIdx));
    btns.appendChild(this._cb.buildBtn(t('editor.toolbar.deleteIcon'), UI_BG, ERROR_COLOR, () => {
      this._dialogs.showConfirm(
        t('editor.level.deleteConfirm', { name: resolveLocalizedText(level.name) }),
        () => {
        this._service.deleteLevel(campaign, chapterIdx, levelIdx);
        this.showChapterDetail();
        },
        t('editor.toolbar.delete'),
        true,
      );
    }));

    if (campaign.chapters.length > 1) {
      this._appendLevelMoveToChapterSelect(btns, ctx);
    }
  }

  private _appendLevelMoveToChapterSelect(btns: HTMLElement, ctx: LevelRowContext): void {
    const { campaign, chapterIdx, levelIdx } = ctx;
    const sel = document.createElement('select');
    sel.style.cssText =
      `background:${UI_BG};color:#aaa;border:1px solid ${UI_BORDER};` +
      `border-radius:${RADIUS_MD};padding:6px 8px;font-size:0.85rem;cursor:pointer;`;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('editor.level.moveTo');
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);
    campaign.chapters.forEach((ch, ci) => {
      if (ci !== chapterIdx) {
        const opt = document.createElement('option');
        opt.value = String(ci);
        opt.textContent = t('editor.level.moveToChapter', { index: ci + 1, name: resolveLocalizedText(ch.name) });
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
      this.showChapterDetail();
    });
    btns.appendChild(sel);
  }

  // ─── Shared row-building helpers ──────────────────────────────────────────

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
      btns.appendChild(this._cb.buildBtn('▲', UI_BG, '#aaa', () => {
        if (onReorder) {
          onReorder(idx, idx - 1);
        } else {
          [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
          this._cb.touchCampaign(campaign);
          this._cb.saveCampaigns();
        }
        onRefresh();
      }));
    }
    if (idx < items.length - 1) {
      btns.appendChild(this._cb.buildBtn('▼', UI_BG, '#aaa', () => {
        if (onReorder) {
          onReorder(idx, idx + 1);
        } else {
          [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
          this._cb.touchCampaign(campaign);
          this._cb.saveCampaigns();
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

  // ─── CRUD actions ──────────────────────────────────────────────────────────

  createCampaign(): void {
    const name = prompt(t('editor.prompt.campaignName'));
    if (!name?.trim()) return;
    const author = loadPlayerName();
    const activeSlot = getActiveSlotIndex();
    const authorGuid = activeSlot !== null ? loadSlotMeta(activeSlot)?.guid : undefined;
    this._service.createCampaign(writeLocalizedText(undefined, getLocale(), name.trim()) ?? '', author, authorGuid);
    this.showCampaignList();
  }

  addChapter(campaign: CampaignDef): void {
    const name = prompt(t('editor.prompt.chapterName'));
    if (!name?.trim()) return;
    this._service.addChapter(campaign, writeLocalizedText(undefined, getLocale(), name.trim()) ?? '');
    this._cb.setActiveChapterIdx(campaign.chapters.length - 1);
    this.showChapterDetail();
  }

  addLevel(campaign: CampaignDef, chapterIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    const name = prompt(t('editor.prompt.levelName'), t('editor.prompt.newLevelDefault'));
    if (!name?.trim()) return;
    const newLevel = this._service.addLevel(campaign, chapterIdx, writeLocalizedText(undefined, getLocale(), name.trim()) ?? '');
    // Open the level editor immediately
    this._cb.setActiveLevelIdx(chapter.levels.length - 1);
    this._cb.openLevelEditor(newLevel, false);
  }

  deleteCampaign(campaignId: string): void {
    const campaign = this._service.getCampaign(campaignId);
    if (!campaign) return;
    this._dialogs.showConfirm(
      t('editor.campaign.deleteConfirm', { name: resolveLocalizedText(campaign.name) }),
      () => {
        this._service.deleteCampaign(campaignId);
        this.showCampaignList();
      },
      t('editor.toolbar.delete'),
      true,
    );
  }
}
