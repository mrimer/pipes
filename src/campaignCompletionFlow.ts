/**
 * CampaignCompletionFlow — owns the chapter-complete and campaign-complete
 * sequences: recognizing newly-completed/mastered progress, playing win/mastery
 * animations, and building the completion/mastery modals.
 *
 * Extracted from {@link CampaignManager}, which still owns the underlying
 * progress state (Sets, shown-flags, screens) and passes it in through
 * {@link CampaignCompletionCallbacks}.
 */

import type { CampaignDef, ChapterDef } from './types';
import type { ChapterMapScreen } from './screens/chapterMapScreen';
import type { CampaignMapScreen } from './screens/campaignMapScreen';
import {
  loadLevelStars, loadLevelWater,
  markChapterCompleted, removeChapterCompleted,
  markMasteredChapterShown, removeMasteredChapterShown,
  markCampaignMasteredShown,
  markCampaignCompleteShown, clearCampaignCompleteShown,
} from './persistence';
import { spawnConfetti } from './visuals/confetti';
import { spawnBalloons } from './visuals/balloons';
import { spawnFireworks } from './visuals/fireworks';
import { buildCampaignMasteredModal } from './modals/gameModals';
import { sfxManager, SfxId } from './audio/sfxManager';
import { ERROR_COLOR, RADIUS_MD, UI_BG, UI_BORDER, UI_OVERLAY_BG } from './uiConstants';
import { t } from './i18n';
import { resolveLocalizedText } from './campaignLocalization';

/** Aggregated stats shown on the chapter-complete modal. */
export interface ChapterCompleteStats {
  waterTotal: number;
  starsCollected: number;
  starsTotal: number;
  challengesDone: number;
  challengesTotal: number;
  isMastered: boolean;
}

/** Aggregated stats shown on the campaign-complete modal. */
export interface CampaignCompleteStats {
  chaptersDone: number;
  chaptersTotal: number;
  waterTotal: number;
  starsCollected: number;
  starsTotal: number;
  challengesDone: number;
  challengesTotal: number;
}

/**
 * State/collaborators {@link CampaignCompletionFlow} needs from
 * {@link CampaignManager}. CampaignManager keeps ownership of all progress
 * state (persisted Sets, shown-flags, screens) and navigation; the flow only
 * reads/mutates it through here.
 */
export interface CampaignCompletionCallbacks {
  getActiveCampaignProgress(): Set<number>;
  getActiveCampaignCompletedChapters(): Set<number>;
  getActiveCampaignMasteredChaptersShown(): Set<number>;
  isCampaignMasteredShown(): boolean;
  setCampaignMasteredShown(shown: boolean): void;
  isCampaignCompleteShown(): boolean;
  setCampaignCompleteShown(shown: boolean): void;
  /** True when every level in the chapter is completed and every available star collected. */
  isChapterMastered(chapter: ChapterDef): boolean;
  getChapterMapScreen(): ChapterMapScreen | null;
  getCampaignMapScreen(): CampaignMapScreen | null;
  showLevelSelect(): void;
  readonly levelListEl: HTMLElement;
  showChapterMap(chapterIdx: number): void;
  showCampaignMap(): void;
}

export class CampaignCompletionFlow {
  constructor(private readonly _cb: CampaignCompletionCallbacks) {}

  // ── Chapter completion ───────────────────────────────────────────────────

  /** True when the chapter map reports this chapter no longer complete (its completion/mastery flags need clearing). */
  private _shouldResetChapterCompletion(chapter: ChapterDef): boolean {
    const chapterMapScreen = this._cb.getChapterMapScreen();
    return chapter.id !== undefined && !!chapterMapScreen && !chapterMapScreen.isChapterComplete();
  }

  /** True when a chapter just became mastered and its mastery sequence hasn't been shown yet. */
  private _shouldShowChapterMasterySequence(chapter: ChapterDef): boolean {
    return (
      chapter.id !== undefined &&
      this._cb.isChapterMastered(chapter) &&
      !this._cb.getActiveCampaignMasteredChaptersShown().has(chapter.id)
    );
  }

  private _checkAutoCompleteChapter(chapterIdx: number, campaign: CampaignDef): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter || chapter.id === undefined) return;
    if (this._cb.getActiveCampaignCompletedChapters().has(chapter.id)) return;
    if (this._cb.getChapterMapScreen()?.isChapterComplete()) {
      this._completeChapter(chapterIdx, campaign);
    }
  }

  /**
   * Removes stale completion records when edited content makes the chapter incomplete,
   * then independently recognizes first-time completion and first-time mastery.
   */
  recognizeChapterProgress(chapterIdx: number, campaign: CampaignDef): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;

    if (this._shouldResetChapterCompletion(chapter)) {
      removeChapterCompleted(campaign.id, chapter.id, this._cb.getActiveCampaignCompletedChapters());
      removeMasteredChapterShown(campaign.id, chapter.id, this._cb.getActiveCampaignMasteredChaptersShown());
    }

    this._checkAutoCompleteChapter(chapterIdx, campaign);

    if (this._shouldShowChapterMasterySequence(chapter)) {
      this._showMasterySequence(chapterIdx, campaign, () => {});
    }
  }

  /** Show the chapter-complete modal, first playing the mastery sequence if one is due. */
  private _showChapterCompletionSequence(chapterIdx: number, campaign: CampaignDef, masterySequenceNeeded: boolean): void {
    if (masterySequenceNeeded) {
      this._showMasterySequence(chapterIdx, campaign, () => {
        this._showChapterCompleteModal(chapterIdx, campaign);
      });
    } else {
      this._showChapterCompleteModal(chapterIdx, campaign);
    }
  }

  private _completeChapter(chapterIdx: number, campaign: CampaignDef): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;

    // Check mastery BEFORE marking the chapter completed
    const wasMastered = this._cb.isChapterMastered(chapter);
    const masterySequenceNeeded =
      wasMastered &&
      chapter.id !== undefined &&
      !this._cb.getActiveCampaignMasteredChaptersShown().has(chapter.id);

    markChapterCompleted(campaign.id, chapter.id, this._cb.getActiveCampaignCompletedChapters());

    // Start the win animation (plays WinChapter sfx internally)
    const chapterMapScreen = this._cb.getChapterMapScreen();
    if (chapterMapScreen) {
      chapterMapScreen.playWinAnimation(() => this._showChapterCompletionSequence(chapterIdx, campaign, masterySequenceNeeded));
    } else {
      this._showChapterCompletionSequence(chapterIdx, campaign, masterySequenceNeeded);
    }
  }

  /** Aggregate a chapter's water/stars/challenge totals for the chapter-complete modal. */
  private _computeChapterCompleteStats(chapter: ChapterDef, campaign: CampaignDef): ChapterCompleteStats {
    const progress = this._cb.getActiveCampaignProgress();
    const levelStars = loadLevelStars(campaign.id);
    const levelWater = loadLevelWater(campaign.id);
    const chLevels = chapter.levels;
    return {
      waterTotal: chLevels.reduce((sum, l) => sum + (progress.has(l.id) ? (levelWater[l.id] ?? 0) : 0), 0),
      starsCollected: chLevels.reduce((sum, l) => sum + Math.min(levelStars[l.id] ?? 0, l.starCount ?? 0), 0),
      starsTotal: chLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0),
      challengesDone: chLevels.filter(l => l.challenge && progress.has(l.id)).length,
      challengesTotal: chLevels.filter(l => l.challenge).length,
      isMastered: this._cb.isChapterMastered(chapter),
    };
  }

  /** Append one stat span to `statsDiv` if its total is nonzero. */
  private _appendChapterCompleteStat(statsDiv: HTMLElement, opts: { total: number; color: string; text: string }): void {
    if (opts.total <= 0) return;
    const span = document.createElement('span');
    span.style.color = opts.color;
    span.textContent = opts.text;
    statsDiv.appendChild(span);
  }

  /** Build the stats row (water/stars/challenges), or nothing if all totals are zero. */
  private _buildChapterCompleteStatsDiv(stats: ChapterCompleteStats): HTMLElement {
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;font-size:1rem;margin-bottom:16px;';
    this._appendChapterCompleteStat(statsDiv, { total: stats.waterTotal, color: '#4fc3f7', text: `💧 ${stats.waterTotal}` });
    this._appendChapterCompleteStat(statsDiv, { total: stats.starsTotal, color: '#f0c040', text: `⭐ ${stats.starsCollected}/${stats.starsTotal}` });
    this._appendChapterCompleteStat(statsDiv, { total: stats.challengesTotal, color: ERROR_COLOR, text: `💀 ${stats.challengesDone}/${stats.challengesTotal}` });
    return statsDiv;
  }

  /** Build the "campaign map" / "main menu" button, whichever applies. */
  private _buildChapterCompleteMenuButton(modal: HTMLElement, campaign: CampaignDef, btnStyle: string): HTMLButtonElement {
    const hasCampaignMap = !!campaign.grid;
    const menuBtn = document.createElement('button');
    menuBtn.textContent = hasCampaignMap ? t('campaign.complete.campaignMap') : t('campaign.complete.mainMenu');
    menuBtn.style.cssText = btnStyle + `background:${UI_BG};border-color:${UI_BORDER};color:#aaa;`;
    menuBtn.addEventListener('click', () => {
      modal.remove();
      if (hasCampaignMap) {
        this._cb.showCampaignMap();
      } else {
        this._cb.showLevelSelect();
      }
    });
    return menuBtn;
  }

  /** Navigate to the next chapter after dismissing the chapter-complete modal. */
  private _goToNextChapterFromCompleteModal(nextChapter: ChapterDef, chapterIdx: number): void {
    if (nextChapter.grid) {
      this._cb.showChapterMap(chapterIdx + 1);
      return;
    }
    this._cb.showLevelSelect();
    const chapterBoxes = this._cb.levelListEl.querySelectorAll<HTMLElement>('.chapter-box');
    chapterBoxes[chapterIdx + 1]?.scrollIntoView?.({ behavior: 'instant', block: 'center' });
  }

  /** Build the "next chapter" button, or null when this was the last chapter. */
  private _buildChapterCompleteNextButton(
    modal: HTMLElement, nextChapter: ChapterDef | null, chapterIdx: number, btnStyle: string,
  ): HTMLButtonElement | null {
    if (!nextChapter) return null;
    const nextBtn = document.createElement('button');
    nextBtn.textContent = t('campaign.complete.nextChapter');
    nextBtn.style.cssText = btnStyle + 'background:#1a3a10;border-color:#7ed321;color:#7ed321;';
    nextBtn.addEventListener('click', () => {
      modal.remove();
      this._goToNextChapterFromCompleteModal(nextChapter, chapterIdx);
    });
    return nextBtn;
  }

  private _showChapterCompleteModal(chapterIdx: number, campaign: CampaignDef): void {
    const existingModal = document.getElementById('chapter-complete-modal');
    if (existingModal) existingModal.remove();

    const chapter = campaign.chapters[chapterIdx];
    const nextChapter = campaign.chapters[chapterIdx + 1] ?? null;
    const stats = this._computeChapterCompleteStats(chapter, campaign);

    const modal = document.createElement('div');
    modal.id = 'chapter-complete-modal';
    modal.style.cssText = `position:fixed;inset:0;background:${UI_OVERLAY_BG};display:flex;align-items:center;justify-content:center;z-index:100;`;

    const box = document.createElement('div');
    box.style.cssText = 'background:#0a0e1a;border:2px solid #f0c040;border-radius:12px;padding:24px;max-width:400px;width:90%;text-align:center;';

    const titleEl = document.createElement('h2');
    titleEl.textContent = stats.isMastered ? t('campaign.chapterMastered.title') : t('campaign.chapterComplete.title');
    titleEl.style.cssText = 'color:' + (stats.isMastered ? '#f0c040' : '#7ed321') + ';margin:0 0 16px;font-size:1.5rem;';
    box.appendChild(titleEl);

    const statsDiv = this._buildChapterCompleteStatsDiv(stats);
    if (statsDiv.children.length > 0) box.appendChild(statsDiv);

    const btnStyle = `padding:10px 20px;font-size:0.9rem;border-radius:${RADIUS_MD};cursor:pointer;border:1px solid;margin:4px;`;

    const remainBtn = document.createElement('button');
    remainBtn.textContent = t('campaign.complete.remainHere');
    remainBtn.style.cssText = btnStyle + `background:${UI_BG};border-color:${UI_BORDER};color:#7ed321;`;
    remainBtn.addEventListener('click', () => { modal.remove(); });

    const menuBtn = this._buildChapterCompleteMenuButton(modal, campaign, btnStyle);
    const nextBtn = this._buildChapterCompleteNextButton(modal, nextChapter, chapterIdx, btnStyle);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;margin-top:16px;gap:8px;';
    if (nextBtn) btnRow.appendChild(nextBtn);
    btnRow.appendChild(menuBtn);
    btnRow.appendChild(remainBtn);

    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);

    spawnConfetti(() => {});
  }

  /** Manually trigger the full-campaign mastery sequence (e.g. from a level-select "claim" affordance). */
  showCampaignMasterySequence(campaign: CampaignDef): void {
    this._showCampaignMasterySequence(campaign);
  }

  // ── Campaign completion ──────────────────────────────────────────────────

  /** True when the campaign map is complete, every chapter is mastered, and the mastery sequence hasn't been shown yet. */
  private _shouldShowCampaignMasterySequence(campaign: CampaignDef): boolean {
    return (
      !!this._cb.getCampaignMapScreen()?.isCampaignComplete() &&
      campaign.chapters.every((chapter) => this._cb.isChapterMastered(chapter)) &&
      !this._cb.isCampaignMasteredShown()
    );
  }

  /** Auto-trigger campaign completion on campaign-map entry when newly complete. */
  private _checkAutoCompleteCampaign(campaign: CampaignDef): void {
    if (!campaign.grid || this._cb.isCampaignCompleteShown()) return;
    if (this._cb.getCampaignMapScreen()?.isCampaignComplete()) {
      this._completeCampaign(campaign);
    }
  }

  /**
   * Reconcile campaign completion and mastery state after the campaign map is shown.
   * Clears stale completion flags when the map is no longer complete, then independently
   * recognizes first-time campaign completion and first-time full-campaign mastery.
   */
  recognizeCampaignProgress(campaign: CampaignDef): void {
    const campaignMapScreen = this._cb.getCampaignMapScreen();
    if (!campaign.grid || !campaignMapScreen) return;

    if (this._cb.isCampaignCompleteShown() && !campaignMapScreen.isCampaignComplete()) {
      clearCampaignCompleteShown(campaign.id);
      this._cb.setCampaignCompleteShown(false);
    }

    this._checkAutoCompleteCampaign(campaign);

    if (this._shouldShowCampaignMasterySequence(campaign)) {
      this._showCampaignMasterySequence(campaign);
    }
  }

  /** Aggregate a campaign's chapters/stars/water/challenge totals for the campaign-complete modal. */
  private _computeCampaignCompleteStats(campaign: CampaignDef): CampaignCompleteStats {
    const allLevels = campaign.chapters.flatMap((ch) => ch.levels);
    const levelStars = loadLevelStars(campaign.id);
    const levelWater = loadLevelWater(campaign.id);
    const progress = this._cb.getActiveCampaignProgress();
    const completedChapters = this._cb.getActiveCampaignCompletedChapters();
    return {
      chaptersDone: campaign.chapters.reduce((sum, ch) => sum + (completedChapters.has(ch.id) ? 1 : 0), 0),
      chaptersTotal: campaign.chapters.length,
      starsCollected: allLevels.reduce((sum, l) => sum + Math.min(levelStars[l.id] ?? 0, l.starCount ?? 0), 0),
      starsTotal: allLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0),
      waterTotal: allLevels.reduce((sum, l) => sum + (progress.has(l.id) ? (levelWater[l.id] ?? 0) : 0), 0),
      challengesDone: allLevels.filter(l => l.challenge && progress.has(l.id)).length,
      challengesTotal: allLevels.filter(l => l.challenge).length,
    };
  }

  /** Build the campaign-complete modal's stats row: chapters (always shown) + the 3 optional stat spans. */
  private _buildCampaignCompleteStatsDiv(stats: CampaignCompleteStats): HTMLElement {
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;font-size:1rem;margin-bottom:16px;';
    const chaptersEl = document.createElement('span');
    chaptersEl.style.color = '#7ed321';
    chaptersEl.textContent = `📘 ${stats.chaptersDone}/${stats.chaptersTotal}`;
    statsDiv.appendChild(chaptersEl);
    this._appendChapterCompleteStat(statsDiv, { total: stats.waterTotal, color: '#4fc3f7', text: `💧 ${stats.waterTotal}` });
    this._appendChapterCompleteStat(statsDiv, { total: stats.starsTotal, color: '#f0c040', text: `⭐ ${stats.starsCollected}/${stats.starsTotal}` });
    this._appendChapterCompleteStat(statsDiv, { total: stats.challengesTotal, color: ERROR_COLOR, text: `💀 ${stats.challengesDone}/${stats.challengesTotal}` });
    return statsDiv;
  }

  /** Show the campaign-complete modal (final celebration screen after finishing every chapter). */
  private _showCampaignCompleteModal(campaign: CampaignDef): void {
    const stats = this._computeCampaignCompleteStats(campaign);

    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:${UI_OVERLAY_BG};display:flex;align-items:center;justify-content:center;z-index:100;`;
    const box = document.createElement('div');
    box.style.cssText = 'background:#0a0e1a;border:2px solid #f0c040;border-radius:12px;padding:24px;max-width:430px;width:90%;text-align:center;';
    const titleEl = document.createElement('h2');
    titleEl.textContent = t('campaign.complete.title');
    titleEl.style.cssText = 'color:#7ed321;margin:0 0 8px;font-size:1.5rem;';
    box.appendChild(titleEl);

    const msgEl = document.createElement('p');
    msgEl.textContent = t('modal.campaignComplete.message');
    msgEl.style.cssText = 'color:#ccc;margin:0 0 16px;font-size:0.95rem;';
    box.appendChild(msgEl);

    box.appendChild(this._buildCampaignCompleteStatsDiv(stats));

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:center;gap:8px;flex-wrap:wrap;';
    const remainBtn = document.createElement('button');
    remainBtn.textContent = t('campaign.complete.remainHere');
    remainBtn.style.cssText = `padding:10px 20px;font-size:0.9rem;border-radius:${RADIUS_MD};cursor:pointer;border:1px solid ${UI_BORDER};background:${UI_BG};color:#7ed321;`;
    remainBtn.addEventListener('click', () => modal.remove());
    const menuBtn = document.createElement('button');
    menuBtn.textContent = t('campaign.complete.mainMenu');
    menuBtn.style.cssText = `padding:10px 20px;font-size:0.9rem;border-radius:${RADIUS_MD};cursor:pointer;border:1px solid ${UI_BORDER};background:${UI_BG};color:#aaa;`;
    menuBtn.addEventListener('click', () => { modal.remove(); this._cb.showLevelSelect(); });
    btnRow.appendChild(menuBtn);
    btnRow.appendChild(remainBtn);
    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);
    sfxManager.play(SfxId.WinCampaign);
    spawnConfetti(() => {});
    spawnBalloons(() => {});
  }

  /** Play the campaign-map win animation (or its sfx fallback) then show the campaign-complete modal. */
  private _playCampaignWinThenModal(campaign: CampaignDef): void {
    const showModal = () => this._showCampaignCompleteModal(campaign);
    const campaignMapScreen = this._cb.getCampaignMapScreen();
    if (campaignMapScreen) {
      campaignMapScreen.playWinAnimation(showModal);
    } else {
      sfxManager.play(SfxId.WinChapter);
      showModal();
    }
  }

  private _completeCampaign(campaign: CampaignDef): void {
    if (this._cb.isCampaignCompleteShown()) return;
    this._cb.setCampaignCompleteShown(true);
    markCampaignCompleteShown(campaign.id);

    const allChaptersMastered = campaign.chapters.every((ch) => this._cb.isChapterMastered(ch));
    const playWinThenModal = () => this._playCampaignWinThenModal(campaign);

    if (allChaptersMastered && !this._cb.isCampaignMasteredShown()) {
      this._showCampaignMasterySequence(campaign, playWinThenModal);
    } else {
      playWinThenModal();
    }
  }

  /**
   * Show the chapter mastery sequence: play the master-chapter sfx, spawn
   * confetti, and display a "Level mastered!" modal with a "Congrats!" button.
   * Records the sequence as shown so it is not repeated for this chapter.
   * Calls {@link onComplete} after the modal is dismissed.
   */
  private _showMasterySequence(chapterIdx: number, campaign: CampaignDef, onComplete: () => void): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) { onComplete(); return; }

    if (chapter.id !== undefined) {
      markMasteredChapterShown(campaign.id, chapter.id, this._cb.getActiveCampaignMasteredChaptersShown());
    }

    sfxManager.play(SfxId.MasterChapter);
    spawnConfetti();

    const modal = document.createElement('div');
    modal.style.cssText =
      `position:fixed;inset:0;background:${UI_OVERLAY_BG};display:flex;align-items:center;justify-content:center;z-index:200;`;

    const box = document.createElement('div');
    box.style.cssText =
      'background:#0a0e1a;border:2px solid #f0c040;border-radius:12px;padding:28px 24px;' +
      'max-width:380px;width:90%;text-align:center;';

    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'font-size:3rem;line-height:1;margin-bottom:12px;';
    iconEl.textContent = '🎉';
    box.appendChild(iconEl);

    const titleEl = document.createElement('h2');
    titleEl.textContent = t('campaign.chapterMastery.title');
    titleEl.style.cssText = 'color:#f0c040;margin:0 0 10px;font-size:1.5rem;';
    box.appendChild(titleEl);

    const msgEl = document.createElement('p');
    msgEl.textContent = t('campaign.chapterMastery.message');
    msgEl.style.cssText = 'color:#eee;font-size:1rem;margin:0 0 20px;';
    box.appendChild(msgEl);

    const congratsBtn = document.createElement('button');
    congratsBtn.textContent = t('campaign.chapterMastery.button');
    congratsBtn.style.cssText =
      `padding:10px 28px;font-size:1rem;border-radius:${RADIUS_MD};cursor:pointer;` +
      'background:#1a3a10;border:1px solid #f0c040;color:#f0c040;';
    congratsBtn.addEventListener('click', () => {
      modal.remove();
      onComplete();
    });
    box.appendChild(congratsBtn);

    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  /**
   * Show the full-campaign mastery sequence: play the master-chapter sfx, spawn
   * confetti, and display a golden "Campaign Mastered!" modal with a "Kudos!"
   * button.  Records the sequence as shown so it is never repeated.
   * Calls {@link onComplete} after the modal is dismissed.
   */
  private _showCampaignMasterySequence(campaign: CampaignDef, onComplete: () => void = () => {}): void {
    this._cb.setCampaignMasteredShown(true);
    markCampaignMasteredShown(campaign.id);

    sfxManager.play(SfxId.MasterCampaign);
    spawnConfetti();
    spawnFireworks();

    const modal = buildCampaignMasteredModal(resolveLocalizedText(campaign.name), () => {
      modal.remove();
      onComplete();
    });
  }
}
