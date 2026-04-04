/**
 * CampaignManager – owns campaign lifecycle, chapter progression, chapter map
 * screen, and campaign-scoped persistence.
 *
 * This class was extracted from {@link Game} to isolate campaign concerns.
 * Game holds a single {@link CampaignManager} instance and communicates with
 * it through the {@link CampaignCallbacks} interface.
 */

import { CampaignDef, ChapterDef, LevelDef, GameScreen } from './types';
import { ChapterMapScreen } from './chapterMapScreen';
import { CampaignEditor } from './campaignEditor';
import {
  loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress,
  loadActiveCampaignId, saveActiveCampaignId, clearActiveCampaignId,
  computeCampaignCompletionPct,
  loadLevelStars, saveLevelStar, clearLevelStars,
  loadLevelWater, saveLevelWater, clearLevelWater,
  loadCompletedChapters, markChapterCompleted, clearCompletedChapters,
  markLevelCompleted, clearCompletedLevels,
} from './persistence';
import { renderLevelList } from './levelSelect';
import { spawnConfetti } from './visuals/confetti';
import { buildNewChapterModal, buildChallengeModal } from './gameModals';

type SparkleClass = 'sparkle-gold' | 'sparkle-red' | 'sparkle-yellow' | 'sparkle-blue';

/**
 * Callbacks that {@link CampaignManager} uses to interact with {@link Game}.
 * Game implements this interface and passes itself to the CampaignManager
 * constructor.
 */
export interface CampaignCallbacks {
  /** Start playing a level by ID (creates a new Board in Game). */
  startLevel(levelId: number): void;
  /** Start playtesting a level def (used by the campaign editor). */
  startLevelDef(level: LevelDef): void;
  /** Navigate to the level-select screen. */
  showLevelSelect(): void;
  /** Exit to the menu, handling playtesting and chapter-map return cases. */
  exitToMenu(): void;
  /** Hide a modal overlay and clear its sparkle animation. */
  closeModal(modalEl: HTMLElement): void;
  /** Trigger a sparkle animation on the inner box of a modal overlay. */
  triggerModalSparkle(modalEl: HTMLElement, cls: SparkleClass): void;
  /** Update Game's current screen state. */
  setScreen(screen: GameScreen): void;
  /** Show or hide the level-select element. */
  setLevelSelectVisible(visible: boolean): void;
  /** Show or hide the play-screen element. */
  setPlayScreenVisible(visible: boolean): void;

  // ── DOM elements that CampaignManager reads/writes ──────────────────────
  readonly levelHeaderEl: HTMLElement;
  readonly levelListEl: HTMLElement;
  readonly winModalEl: HTMLElement;
  readonly winMenuBtnEl: HTMLButtonElement;
  readonly winNextBtnEl: HTMLButtonElement;
  readonly exitBtnEl: HTMLButtonElement;
  readonly gameoverMenuBtnEl: HTMLButtonElement;

  /** Official-campaign completion progress (used when no campaign is active). */
  readonly completedLevels: Set<number>;

  /** Show the reset-progress confirmation modal. */
  showResetConfirmModal(): void;
  /** Show the game-rules modal overlay. */
  showRules(): void;
}

// ─── Module-level helper ──────────────────────────────────────────────────────

/** Remove sparkle CSS animation classes from the .modal-box inside a modal overlay. */
function clearModalSparkle(modalEl: HTMLElement): void {
  const box = modalEl.querySelector<HTMLElement>('.modal-box');
  if (box) box.classList.remove('sparkle-gold', 'sparkle-red', 'sparkle-yellow', 'sparkle-blue');
}

// ─── CampaignManager ──────────────────────────────────────────────────────────

/**
 * Owns campaign state, chapter progression, chapter map screen, and
 * campaign-scoped persistence.  Communicates with the rest of the game
 * through the {@link CampaignCallbacks} interface.
 */
export class CampaignManager {
  private readonly _callbacks: CampaignCallbacks;
  private readonly _campaignEditor: CampaignEditor;

  // ── Campaign identity & progress ───────────────────────────────────────────

  private _activeCampaign: CampaignDef | null = null;
  private _activeCampaignProgress: Set<number> = new Set();
  private _activeCampaignCompletedChapters: Set<number> = new Set();

  // ── Chapter map ───────────────────────────────────────────────────────────

  private _chapterMapScreen: ChapterMapScreen | null = null;
  private _winFromChapterMap = false;

  // ── Chapter/challenge modals ──────────────────────────────────────────────

  private _pendingLevelId: number | null = null;
  private readonly _newChapterModalEl: HTMLElement;
  private readonly _newChapterNumberEl: HTMLElement;
  private readonly _newChapterNameEl: HTMLElement;
  private readonly _challengeModalEl: HTMLElement;
  private readonly _challengeMsgEl: HTMLElement;
  private readonly _challengeSkipBtnEl: HTMLButtonElement;

  // ── Chapter context for current level ─────────────────────────────────────

  /** Chapter ID of the level currently being played (0 if unknown). */
  currentChapterId = 0;

  // ── Campaign editor & playtesting ─────────────────────────────────────────

  private _playtestExitCallback: (() => void) | null = null;

  constructor(callbacks: CampaignCallbacks, campaignEditor: CampaignEditor) {
    this._callbacks = callbacks;
    this._campaignEditor = campaignEditor;

    // Build the new-chapter intro modal
    const newChapterModal = buildNewChapterModal(() => this.startChapterLevel());
    this._newChapterModalEl = newChapterModal.el;
    this._newChapterNumberEl = newChapterModal.numberEl;
    this._newChapterNameEl = newChapterModal.nameEl;

    // Build the challenge-level warning modal
    const challengeModal = buildChallengeModal(
      () => this.playChallengeLevel(),
      () => this.skipChallengeLevel(),
    );
    this._challengeModalEl = challengeModal.el;
    this._challengeMsgEl = challengeModal.msgEl;
    this._challengeSkipBtnEl = challengeModal.skipBtnEl;
  }

  // ── Public API: campaign activation ──────────────────────────────────────

  /** The non-official campaign currently activated for play, or null for the official campaign. */
  get activeCampaign(): CampaignDef | null { return this._activeCampaign; }

  /** Completion progress (level IDs) for the active campaign. */
  get progress(): Set<number> { return this._activeCampaignProgress; }

  /** Completed chapter IDs for the active campaign. */
  get completedChapters(): Set<number> { return this._activeCampaignCompletedChapters; }

  /** True when a playtest exit callback is pending (i.e. level launched from editor). */
  get isPlaytesting(): boolean { return this._playtestExitCallback !== null; }

  /** Activate a campaign for play and navigate to the level-select screen. */
  activate(campaign: CampaignDef): void {
    this._activeCampaign = campaign;
    this._activeCampaignProgress = loadCampaignProgress(campaign.id);
    this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
    saveActiveCampaignId(campaign.id);
    this._callbacks.showLevelSelect();
  }

  /** Deactivate the current campaign and revert to the official campaign. */
  deactivate(): void {
    this._activeCampaign = null;
    this._activeCampaignProgress = new Set();
    clearActiveCampaignId();
    this._callbacks.showLevelSelect();
  }

  /**
   * Restore the active campaign from localStorage.
   * If a campaign ID was saved, try to find it.  If not found (e.g. deleted),
   * fall back to auto-selection.  Call this once during Game construction.
   */
  restoreFromPersistence(): void {
    const savedCampaignId = loadActiveCampaignId();
    if (savedCampaignId) {
      this._restoreActiveCampaign(savedCampaignId);
    } else {
      this._autoSelectCampaign();
    }
  }

  // ── Public API: chapter map ──────────────────────────────────────────────

  /** The chapter map screen instance (built lazily on first use), or null. */
  get chapterMapScreen(): ChapterMapScreen | null { return this._chapterMapScreen; }

  /** True when the win modal's "Level Select" button should return to the chapter map. */
  get winFromChapterMap(): boolean { return this._winFromChapterMap; }
  set winFromChapterMap(v: boolean) { this._winFromChapterMap = v; }

  /** Show the chapter map screen for the given chapter index (0-based). */
  showChapterMap(chapterIdx: number): void {
    const campaign = this._activeCampaign;
    if (!campaign) return;
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter?.grid) return;

    if (!this._chapterMapScreen) {
      this._chapterMapScreen = new ChapterMapScreen({
        getDisplayProgress: () =>
          this._activeCampaign ? this._activeCampaignProgress : this._callbacks.completedLevels,
        getActiveCampaignId: () => this._activeCampaign?.id ?? null,
        onShowLevelSelect: () => this._callbacks.showLevelSelect(),
        onLevelSelected: (levelDef) => {
          this._winFromChapterMap = true;
          this._callbacks.winMenuBtnEl.textContent = 'Chapter Map';
          this._callbacks.exitBtnEl.textContent = '← Chapter Map';
          if (levelDef.challenge) {
            this._pendingLevelId = levelDef.id;
            this._callbacks.startLevel(levelDef.id);
            this._showChallengeLevelModal(false);
          } else {
            this._callbacks.startLevel(levelDef.id);
          }
        },
        getActiveCampaign: () => this._activeCampaign,
        getCompletedChapters: () => this._activeCampaignCompletedChapters,
        onChapterSinkClicked: (idx) => this._onChapterSinkClicked(idx),
      });
    }

    this._chapterMapScreen.show(campaign, chapterIdx);
    this._callbacks.setLevelSelectVisible(false);
    this._callbacks.setPlayScreenVisible(false);
    this._callbacks.setScreen(GameScreen.ChapterMap);
  }

  /** Hide the chapter map screen element (if it exists). */
  hideChapterMap(): void {
    if (this._chapterMapScreen) {
      this._chapterMapScreen.hide();
    }
  }

  /**
   * Re-show the chapter map (reattaching listeners) and repopulate it with
   * current progress. Used when returning from a level that was entered via
   * the chapter map.
   */
  reshowChapterMap(): void {
    if (this._chapterMapScreen && this._activeCampaign && this._chapterMapScreen.chapterIdx >= 0) {
      this._chapterMapScreen.show(this._activeCampaign, this._chapterMapScreen.chapterIdx);
    }
  }

  /** Repopulate the chapter map with current progress (e.g. after undoing the winning move). */
  repopulateChapterMap(): void {
    if (this._chapterMapScreen?.chapter && this._activeCampaign) {
      this._chapterMapScreen.repopulate(this._activeCampaign);
    }
  }

  // ── Public API: level transitions ────────────────────────────────────────

  /**
   * Advance to the next level after the level with the given ID.
   * Called by Game.nextLevel() which knows the current level ID.
   */
  nextLevelFrom(currentLevelId: number): void {
    if (!this._activeCampaign) { this._callbacks.exitToMenu(); return; }
    const chapters = this._activeCampaign.chapters;
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const idx = allLevels.findIndex((l) => l.id === currentLevelId);
    if (idx === -1 || idx + 1 >= allLevels.length) {
      this._callbacks.exitToMenu();
      return;
    }

    const nextLevelDef = allLevels[idx + 1];
    this._pendingLevelId = nextLevelDef.id;

    const currentChapter = chapters.find((ch) => ch.levels.some((l) => l.id === currentLevelId));
    const nextChapter = chapters.find((ch) => ch.levels.some((l) => l.id === nextLevelDef.id));

    // If the last level of a grid-map chapter was just completed, go to the chapter map
    if (currentChapter?.grid && nextChapter && currentChapter !== nextChapter) {
      this._pendingLevelId = null;
      this._callbacks.winModalEl.style.display = 'none';
      this._winFromChapterMap = true;
      this._callbacks.winMenuBtnEl.textContent = 'Chapter Map';
      this.showChapterMap(chapters.indexOf(currentChapter));
      return;
    }

    if (
      currentChapter !== undefined &&
      nextChapter !== undefined &&
      currentChapter !== nextChapter &&
      nextChapter.levels[0].id === nextLevelDef.id
    ) {
      const chapterIdx = chapters.indexOf(nextChapter);
      if (nextChapter.grid) {
        this._pendingLevelId = null;
        this._callbacks.winModalEl.style.display = 'none';
        this._winFromChapterMap = true;
        this._callbacks.winMenuBtnEl.textContent = 'Chapter Map';
        this.showChapterMap(chapterIdx);
        this._showNewChapterModal(chapterIdx, nextChapter);
      } else {
        this._callbacks.startLevel(nextLevelDef.id);
        this._showNewChapterModal(chapterIdx, nextChapter);
      }
    } else if (nextLevelDef.challenge) {
      this._callbacks.startLevel(nextLevelDef.id);
      this._showChallengeLevelModal(/* canSkip */ true);
    } else {
      this._pendingLevelId = null;
      this._callbacks.startLevel(nextLevelDef.id);
    }
  }

  /**
   * Request to start a level by ID, showing a challenge-level warning first
   * when the level is marked as a challenge.
   * Use this instead of startLevel() when navigating from the level-select screen.
   */
  requestLevel(levelId: number): void {
    if (!this._activeCampaign) return;
    const chapters = this._activeCampaign.chapters;
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === levelId);
    if (level?.challenge) {
      this._pendingLevelId = levelId;
      this._callbacks.startLevel(levelId);
      this._showChallengeLevelModal(/* canSkip */ false);
    } else {
      this._callbacks.startLevel(levelId);
    }
  }

  /**
   * Called when the player confirms the new-chapter modal ("Start Level" button).
   * Dismisses the modal and either starts the pending level or shows the
   * challenge-level modal when the pending level is a challenge.
   */
  startChapterLevel(): void {
    this._callbacks.closeModal(this._newChapterModalEl);
    if (this._pendingLevelId === null) return;

    const chapters = this._activeCampaign?.chapters ?? [];
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === this._pendingLevelId);
    if (level?.challenge) {
      this._showChallengeLevelModal(/* canSkip */ true);
    } else {
      const id = this._pendingLevelId;
      this._pendingLevelId = null;
      this._callbacks.startLevel(id);
    }
  }

  /**
   * Called when the player chooses to play the challenge level.
   * Dismisses the challenge modal and starts the pending level.
   */
  playChallengeLevel(): void {
    this._callbacks.closeModal(this._challengeModalEl);
    if (this._pendingLevelId === null) return;
    const id = this._pendingLevelId;
    this._pendingLevelId = null;
    this._callbacks.startLevel(id);
  }

  /**
   * Called when the player chooses to skip the challenge level.
   * Dismisses the challenge modal and advances to the next level after the challenge.
   */
  skipChallengeLevel(): void {
    this._callbacks.closeModal(this._challengeModalEl);
    if (this._pendingLevelId === null) { this._callbacks.exitToMenu(); return; }

    const chapters = this._activeCampaign?.chapters ?? [];
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const idx = allLevels.findIndex((l) => l.id === this._pendingLevelId);
    this._pendingLevelId = null;

    if (idx !== -1 && idx + 1 < allLevels.length) {
      this._callbacks.startLevel(allLevels[idx + 1].id);
    } else {
      this._callbacks.exitToMenu();
    }
  }

  // ── Public API: level header & context ───────────────────────────────────

  /** Update the level-header element with chapter, level number, and level name. */
  updateLevelHeader(levelId: number): void {
    const chapters = this._activeCampaign?.chapters ?? [];
    for (let ci = 0; ci < chapters.length; ci++) {
      const chapter = chapters[ci];
      const idx = chapter.levels.findIndex((l) => l.id === levelId);
      if (idx !== -1) {
        this.currentChapterId = chapter.id;
        const level = chapter.levels[idx];
        const campaignPrefix = this._activeCampaign
          ? `${this._activeCampaign.name}  ·  `
          : '';
        const chapterNumber = ci + 1;
        const challengeSuffix = level.challenge ? '  💀' : '';
        this._callbacks.levelHeaderEl.textContent =
          `${campaignPrefix}Chapter ${chapterNumber}: ${chapter.name}  ·  Level ${idx + 1}: ${level.name}${challengeSuffix}`;
        return;
      }
    }
    // Fallback if level isn't in any chapter
    this.currentChapterId = 0;
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === levelId);
    const challengeSuffix = level?.challenge ? '  💀' : '';
    this._callbacks.levelHeaderEl.textContent = level ? `Level ${levelId}: ${level.name}${challengeSuffix}` : '';
  }

  // ── Public API: persistence (campaign-scoped) ────────────────────────────

  /** Record a level as completed.  No-op during playtesting. */
  markLevelCompleted(levelId: number): void {
    if (this._playtestExitCallback) return; // don't persist during playtesting
    if (this._activeCampaign) {
      markCampaignLevelCompleted(this._activeCampaign.id, levelId, this._activeCampaignProgress);
    } else {
      markLevelCompleted(this._callbacks.completedLevels, levelId);
    }
  }

  /** Save the star count for a level.  No-op during playtesting. */
  saveStars(levelId: number, count: number): void {
    if (this._playtestExitCallback) return;
    saveLevelStar(levelId, count, this._activeCampaign?.id);
  }

  /** Save the water remaining for a level (only records the max).  No-op during playtesting. */
  saveWater(levelId: number, water: number): void {
    if (this._playtestExitCallback) return;
    saveLevelWater(levelId, water, this._activeCampaign?.id);
  }

  /**
   * Load the best water remaining for a level, or null if the level has never
   * been completed.  Respects the active campaign.
   */
  loadBestWater(levelId: number): number | null {
    const record = loadLevelWater(this._activeCampaign?.id);
    const val = record[levelId];
    return val !== undefined ? val : null;
  }

  /**
   * Load the best star record for all levels.
   * Returns a map of levelId → star count.
   */
  loadBestStars(): Record<number, number> {
    return loadLevelStars(this._activeCampaign?.id);
  }

  /** Clear all level-completion progress and refresh the level list. */
  resetProgress(): void {
    if (this._activeCampaign) {
      clearCampaignProgress(this._activeCampaign.id, this._activeCampaignProgress);
      clearLevelStars(this._activeCampaign.id);
      clearLevelWater(this._activeCampaign.id);
      clearCompletedChapters(this._activeCampaign.id, this._activeCampaignCompletedChapters);
    } else {
      clearCompletedLevels(this._callbacks.completedLevels);
      clearLevelStars();
      clearLevelWater();
    }
    this.renderLevelList();
  }

  /** Dev cheat: mark all levels completed and refresh the level list. */
  unlockAll(): void {
    if (this._activeCampaign) {
      const allIds = this._activeCampaign.chapters.flatMap((ch) => ch.levels.map((l) => l.id));
      for (const id of allIds) {
        markCampaignLevelCompleted(this._activeCampaign.id, id, this._activeCampaignProgress);
      }
    }
    this.renderLevelList();
  }

  // ── Public API: level-select rendering ──────────────────────────────────

  /** Re-render the level list on the level-select screen. */
  renderLevelList(): void {
    const campaignChapters = this._activeCampaign?.chapters ?? [];
    const displayProgress = this._activeCampaign ? this._activeCampaignProgress : this._callbacks.completedLevels;
    const levelStars = loadLevelStars(this._activeCampaign?.id);
    const levelWater = loadLevelWater(this._activeCampaign?.id);
    let activeCampaignInfo: { name: string; author: string; completionPct: number } | undefined;
    if (this._activeCampaign) {
      const pct = computeCampaignCompletionPct(this._activeCampaign, this._activeCampaignProgress);
      activeCampaignInfo = {
        name: this._activeCampaign.name,
        author: this._activeCampaign.author,
        completionPct: pct,
      };
    }
    renderLevelList(
      this._callbacks.levelListEl,
      displayProgress,
      (id) => this.requestLevel(id),
      () => this._callbacks.showResetConfirmModal(),
      () => this._callbacks.showRules(),
      () => this._openCampaignEditor(),
      () => this.unlockAll(),
      activeCampaignInfo,
      campaignChapters,
      levelStars,
      levelWater,
      (ci) => this.showChapterMap(ci),
      this._activeCampaignCompletedChapters,
    );
  }

  // ── Public API: editor integration ──────────────────────────────────────

  /** Open the campaign editor overlay. */
  openCampaignEditor(): void {
    this._openCampaignEditor();
  }

  /**
   * Start a level in play mode for playtesting from the campaign editor.
   * On exit the campaign editor is re-opened.
   */
  playtestLevel(level: LevelDef): void {
    this._campaignEditor.hide();
    this._playtestExitCallback = () => {
      this._callbacks.setLevelSelectVisible(false);
      this._campaignEditor.showAndRestore();
    };
    this._callbacks.winMenuBtnEl.textContent = '↩ Return to Editor';
    this._callbacks.gameoverMenuBtnEl.textContent = '↩ Return to Editor';
    this._callbacks.winNextBtnEl.style.display = 'none';
    this._callbacks.exitBtnEl.textContent = '← Edit';
    this._callbacks.startLevelDef(level);
  }

  // ── Public API: inter-class coordination ────────────────────────────────

  /**
   * Hide campaign-owned modals and reset campaign transient state.
   * Called by Game._showLevelSelect() to prepare for the level-select screen.
   */
  prepareForLevelSelect(): void {
    this.hideChapterMap();
    this._newChapterModalEl.style.display = 'none';
    this._challengeModalEl.style.display = 'none';
    clearModalSparkle(this._newChapterModalEl);
    clearModalSparkle(this._challengeModalEl);
    this._pendingLevelId = null;
    this._winFromChapterMap = false;
  }

  /**
   * Hide campaign-owned modals (new-chapter and challenge modals).
   * Called by Game._enterPlayScreenState() to clear modals when starting a level.
   */
  hideCampaignModals(): void {
    this._newChapterModalEl.style.display = 'none';
    this._challengeModalEl.style.display = 'none';
  }

  /**
   * Consume (read and clear) the playtest exit callback.
   * Called by Game.exitToMenu() when leaving a playtested level.
   */
  takePlaytestCallback(): (() => void) | null {
    const cb = this._playtestExitCallback;
    this._playtestExitCallback = null;
    return cb;
  }

  // ── Internal access for test backward compatibility (via Game proxies) ──

  /**
   * @internal Exposed for Game's test-proxy getters only.
   * Do not use in production code outside of Game.
   */
  get _newChapterModalElInternal(): HTMLElement { return this._newChapterModalEl; }
  /** @internal */
  get _challengeModalElInternal(): HTMLElement { return this._challengeModalEl; }
  /** @internal */
  get _challengeMsgElInternal(): HTMLElement { return this._challengeMsgEl; }
  /** @internal */
  get _challengeSkipBtnElInternal(): HTMLButtonElement { return this._challengeSkipBtnEl; }
  /** @internal */
  get _pendingLevelIdInternal(): number | null { return this._pendingLevelId; }
  /** @internal */
  get _playtestExitCallbackInternal(): (() => void) | null { return this._playtestExitCallback; }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _openCampaignEditor(): void {
    this._callbacks.setScreen(GameScreen.CampaignEditor);
    this._callbacks.setLevelSelectVisible(false);
    this._campaignEditor.show();
  }

  private _showNewChapterModal(chapterIdx: number, chapter: ChapterDef): void {
    this._newChapterNumberEl.textContent = `Chapter ${chapterIdx + 1}`;
    this._newChapterNameEl.textContent = chapter.name;
    this._newChapterModalEl.style.display = 'flex';
    this._callbacks.triggerModalSparkle(this._newChapterModalEl, 'sparkle-blue');
  }

  private _showChallengeLevelModal(canSkip: boolean): void {
    this._challengeMsgEl.style.display    = canSkip ? '' : 'none';
    this._challengeSkipBtnEl.style.display = canSkip ? '' : 'none';
    this._challengeModalEl.style.display = 'flex';
    this._callbacks.triggerModalSparkle(this._challengeModalEl, 'sparkle-yellow');
  }

  private _onChapterSinkClicked(chapterIdx: number): void {
    const campaign = this._activeCampaign;
    if (!campaign) return;
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;

    markChapterCompleted(campaign.id, chapter.id, this._activeCampaignCompletedChapters);
    this._showChapterCompleteModal(chapterIdx, campaign);
  }

  private _showChapterCompleteModal(chapterIdx: number, campaign: CampaignDef): void {
    const existingModal = document.getElementById('chapter-complete-modal');
    if (existingModal) existingModal.remove();

    const chapter = campaign.chapters[chapterIdx];
    const nextChapter = campaign.chapters[chapterIdx + 1] ?? null;

    const progress = this._activeCampaign ? this._activeCampaignProgress : this._callbacks.completedLevels;
    const levelStars = loadLevelStars(campaign.id);
    const levelWater = loadLevelWater(campaign.id);

    const chLevels = chapter.levels;
    const waterTotal = chLevels.reduce((sum, l) => sum + (progress.has(l.id) ? (levelWater[l.id] ?? 0) : 0), 0);
    const starsCollected = chLevels.reduce((sum, l) => sum + Math.min(levelStars[l.id] ?? 0, l.starCount ?? 0), 0);
    const starsTotal = chLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
    const challengesDone = chLevels.filter(l => l.challenge && progress.has(l.id)).length;
    const challengesTotal = chLevels.filter(l => l.challenge).length;
    const isMastered = (starsTotal === 0 || starsCollected >= starsTotal) && (challengesTotal === 0 || challengesDone >= challengesTotal);

    const modal = document.createElement('div');
    modal.id = 'chapter-complete-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#0a0e1a;border:2px solid #f0c040;border-radius:12px;padding:24px;max-width:400px;width:90%;text-align:center;';

    const titleEl = document.createElement('h2');
    titleEl.textContent = isMastered ? '🏆 Chapter Mastered!' : '🎉 Chapter Complete!';
    titleEl.style.cssText = 'color:' + (isMastered ? '#f0c040' : '#7ed321') + ';margin:0 0 16px;font-size:1.5rem;';
    box.appendChild(titleEl);

    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;font-size:1rem;margin-bottom:16px;';
    if (waterTotal > 0) {
      const w = document.createElement('span');
      w.style.color = '#4fc3f7';
      w.textContent = `💧 ${waterTotal}`;
      statsDiv.appendChild(w);
    }
    if (starsTotal > 0) {
      const s = document.createElement('span');
      s.style.color = '#f0c040';
      s.textContent = `⭐ ${starsCollected}/${starsTotal}`;
      statsDiv.appendChild(s);
    }
    if (challengesTotal > 0) {
      const c = document.createElement('span');
      c.style.color = '#e74c3c';
      c.textContent = `💀 ${challengesDone}/${challengesTotal}`;
      statsDiv.appendChild(c);
    }
    if (statsDiv.children.length > 0) box.appendChild(statsDiv);

    const btnStyle = 'padding:10px 20px;font-size:0.9rem;border-radius:6px;cursor:pointer;border:1px solid;margin:4px;';

    const remainBtn = document.createElement('button');
    remainBtn.textContent = 'Remain here';
    remainBtn.style.cssText = btnStyle + 'background:#16213e;border-color:#4a90d9;color:#7ed321;';
    remainBtn.addEventListener('click', () => { modal.remove(); });

    const menuBtn = document.createElement('button');
    menuBtn.textContent = 'Main Menu';
    menuBtn.style.cssText = btnStyle + 'background:#16213e;border-color:#4a90d9;color:#aaa;';
    menuBtn.addEventListener('click', () => { modal.remove(); this._callbacks.showLevelSelect(); });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;margin-top:16px;gap:8px;';

    if (nextChapter) {
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next Chapter →';
      nextBtn.style.cssText = btnStyle + 'background:#1a3a10;border-color:#7ed321;color:#7ed321;';
      nextBtn.addEventListener('click', () => {
        modal.remove();
        if (nextChapter.grid) {
          this.showChapterMap(chapterIdx + 1);
        } else {
          this._callbacks.showLevelSelect();
          const chapterBoxes = this._callbacks.levelListEl.querySelectorAll<HTMLElement>('.chapter-box');
          chapterBoxes[chapterIdx + 1]?.scrollIntoView?.({ behavior: 'instant', block: 'center' });
        }
      });
      btnRow.appendChild(nextBtn);
    }
    btnRow.appendChild(menuBtn);
    btnRow.appendChild(remainBtn);

    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);

    spawnConfetti(() => {});
  }

  private _autoSelectCampaign(): void {
    const allCampaigns = this._campaignEditor.getAllCampaigns();
    if (allCampaigns.length === 0) return;
    const campaign = allCampaigns.find((c) => c.official === true) ?? allCampaigns[0];
    this._activeCampaign = campaign;
    this._activeCampaignProgress = loadCampaignProgress(campaign.id);
    this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
    saveActiveCampaignId(campaign.id);
  }

  private _restoreActiveCampaign(campaignId: string): void {
    const allCampaigns = this._campaignEditor.getAllCampaigns();
    const campaign = allCampaigns.find((c) => c.id === campaignId);
    if (campaign) {
      this._activeCampaign = campaign;
      this._activeCampaignProgress = loadCampaignProgress(campaign.id);
      this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
    } else {
      clearActiveCampaignId();
    }
  }
}
