/**
 * CampaignManager – owns campaign lifecycle, chapter progression, chapter map
 * screen, and campaign-scoped persistence.
 *
 * This class was extracted from {@link Game} to isolate campaign concerns.
 * Game holds a single {@link CampaignManager} instance and communicates with
 * it through the {@link CampaignCallbacks} interface.
 */

import type { CampaignDef, ChapterDef, LevelDef, LevelStyle } from './types';
import { GameScreen } from './types';
import { ChapterMapScreen } from './screens/chapterMapScreen';
import { CampaignMapScreen } from './screens/campaignMapScreen';
import type { CampaignEditor } from './campaignEditor';
import {
  loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress,
  loadActiveCampaignId, saveActiveCampaignId, clearActiveCampaignId,
  computeCampaignCompletionPct,
  loadLevelStars, saveLevelStar, clearLevelStars,
  loadLevelWater, saveLevelWater, clearLevelWater,
  getPartialProgressFor,
  loadCompletedChapters, markChapterCompleted, clearCompletedChapters,
  loadMasteredChaptersShown, clearMasteredChaptersShown,
   loadCampaignMasteredShown, clearCampaignMasteredShown,
   loadCampaignCompleteShown, clearCampaignCompleteShown,
   loadGnomeAppearance,
} from './persistence';
import { renderLevelList } from './screens/levelSelect';
import { buildNewChapterModal, buildChallengeModal } from './modals/gameModals';
import type { ResetProgressInfo } from './modals/gameModals';
import type { ChapterMapSnapshot } from './visuals/levelTransition';
import { playMapScreenEnterTransition, playMapScreenExitTransition, playSwirlScreenTransition } from './visuals/levelTransition';
import { sfxManager, SfxId } from './audio/sfxManager';
import { t } from './i18n';
import { resolveLocalizedText } from './campaignLocalization';
import { CampaignCompletionFlow } from './campaignCompletionFlow';
import type { CampaignCompletionCallbacks } from './campaignCompletionFlow';

type SparkleClass = 'sparkle-gold' | 'sparkle-red' | 'sparkle-yellow' | 'sparkle-blue';
const NO_OP = (): void => {};

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

  /**
   * Play the zoom transition from the chapter-map minimap to the full game canvas.
   * @param minimapRect        Screen-space rect of the minimap on the chapter map.
   * @param chapterMapSnapshot Pre-captured snapshot of the chapter map canvas.
   * @param onComplete         Called when the animation finishes.
   */
  playLevelTransition(
    minimapRect: { x: number; y: number; width: number; height: number },
    chapterMapSnapshot: ChapterMapSnapshot | null,
    onComplete: () => void,
  ): void;

  // ── DOM elements that CampaignManager reads/writes ──────────────────────
  readonly levelSelectEl: HTMLElement;
  readonly levelHeaderEl: HTMLElement;
  readonly levelListEl: HTMLElement;
  readonly winModalEl: HTMLElement;
  readonly winNextBtnEl: HTMLButtonElement;
  readonly exitBtnEl: HTMLButtonElement;
  readonly gameoverMenuBtnEl: HTMLButtonElement;

  /** Show the reset-progress confirmation modal with the given progress info. */
  showResetConfirmModal(info: ResetProgressInfo | null): void;
  /** Show the game-rules modal overlay. */
  showRules(): void;
  /** Show the credits modal overlay. */
  showCredits(): void;
  /** Show the settings modal overlay. */
  showSettings(): void;
  /** Open the player-profile selection screen. */
  showPlayerProfile(): void;
  /** Return the display name of the currently active player, or null. */
  getPlayerName(): string | null;
  /**
   * Return the level ID of the most recently saved partial progress for the
   * active campaign, or null when none exists.
   * Optional – callers that do not implement partial-progress can omit it.
   */
  getPartialLevelId?(): number | null;
  /**
   * Start the given level and let the resume driver pick up saved progress.
   * Equivalent to `startLevel(levelId)` but semantically scoped to resume.
   * Optional – callers that do not implement partial-progress can omit it.
   */
  startLevelFromPartial?(levelId: number): void;

  /**
   * Called when entering a chapter or campaign map for the first time
   * (not when returning from a level via {@link reshowChapterMap} /
   * {@link reshowCampaignMap}).  The game uses this to start the appropriate
   * background music group.
   *
   * `isCampaignMap` is true when entering the campaign-overview map (which uses
   * the 'overworld' music group) and false when entering a chapter map (which
   * uses the chapter's style group).
   *
   * Optional – callers that do not implement music can omit it.
   */
  onMapScreenEntered?: (style: LevelStyle | undefined, isCampaignMap: boolean) => void;
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
  private readonly _completionFlow: CampaignCompletionFlow;

  // ── Campaign identity & progress ───────────────────────────────────────────

  private _activeCampaign: CampaignDef | null = null;
  private _activeCampaignProgress: Set<number> = new Set();
  private _activeCampaignCompletedChapters: Set<number> = new Set();
  /** Set of chapter IDs for which the mastery sequence has already been shown. */
  private _activeCampaignMasteredChaptersShown: Set<number> = new Set();
  /** True when the full-campaign mastery sequence has already been shown. */
  private _campaignMasteredShown = false;
  /** True when the full-campaign complete sequence has already been shown. */
  private _campaignCompleteShown = false;

  // ── Chapter map ───────────────────────────────────────────────────────────

  private _chapterMapScreen: ChapterMapScreen | null = null;
  private _campaignMapScreen: CampaignMapScreen | null = null;
  private _winFromChapterMap = false;

  // ── Chapter/challenge modals ──────────────────────────────────────────────

  private _pendingLevelId: number | null = null;
  private readonly _newChapterModalEl: HTMLElement;
  private readonly _newChapterNumberEl: HTMLElement;
  private readonly _newChapterNameEl: HTMLElement;
  private readonly _challengeModalEl: HTMLElement;
  private readonly _challengeMsgEl: HTMLElement;
  private readonly _challengePlayBtnEl: HTMLButtonElement;
  private readonly _challengeSkipBtnEl: HTMLButtonElement;
  /** Timer IDs for the challenge modal's auto-dismiss sequence (fade + close). */
  private _challengeFadeTimerId: ReturnType<typeof setTimeout> | null = null;
  private _challengeCloseTimerId: ReturnType<typeof setTimeout> | null = null;

  // ── Chapter context for current level ─────────────────────────────────────

  /** Chapter ID of the level currently being played (0 if unknown). */
  currentChapterId = 0;

  // ── Campaign editor & playtesting ─────────────────────────────────────────

  private _playtestExitCallback: (() => void) | null = null;

  constructor(callbacks: CampaignCallbacks, campaignEditor: CampaignEditor) {
    this._callbacks = callbacks;
    this._campaignEditor = campaignEditor;
    this._completionFlow = new CampaignCompletionFlow(this._buildCompletionCallbacks());

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
    this._challengePlayBtnEl = challengeModal.playBtnEl;
    this._challengeSkipBtnEl = challengeModal.skipBtnEl;
  }

  /** Build the callbacks {@link CampaignCompletionFlow} uses to read/mutate this manager's completion state. */
  private _buildCompletionCallbacks(): CampaignCompletionCallbacks {
    return {
      getActiveCampaignProgress: () => this._activeCampaignProgress,
      getActiveCampaignCompletedChapters: () => this._activeCampaignCompletedChapters,
      getActiveCampaignMasteredChaptersShown: () => this._activeCampaignMasteredChaptersShown,
      isCampaignMasteredShown: () => this._campaignMasteredShown,
      setCampaignMasteredShown: (v) => { this._campaignMasteredShown = v; },
      isCampaignCompleteShown: () => this._campaignCompleteShown,
      setCampaignCompleteShown: (v) => { this._campaignCompleteShown = v; },
      isChapterMastered: (chapter) => this._isCampaignChapterMastered(chapter),
      getChapterMapScreen: () => this._chapterMapScreen,
      getCampaignMapScreen: () => this._campaignMapScreen,
      showLevelSelect: () => this._callbacks.showLevelSelect(),
      levelListEl: this._callbacks.levelListEl,
      showChapterMap: (chapterIdx) => this.showChapterMap(chapterIdx),
      showCampaignMap: () => this.showCampaignMap(),
    };
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
    this._activeCampaignMasteredChaptersShown = loadMasteredChaptersShown(campaign.id);
    this._campaignMasteredShown = loadCampaignMasteredShown(campaign.id);
    this._campaignCompleteShown = loadCampaignCompleteShown(campaign.id);
    saveActiveCampaignId(campaign.id);
    this._callbacks.showLevelSelect();
  }

  /** Deactivate the current campaign and revert to the official campaign. */
  deactivate(): void {
    this._activeCampaign = null;
    this._activeCampaignProgress = new Set();
    this._activeCampaignCompletedChapters = new Set();
    this._activeCampaignMasteredChaptersShown = new Set();
    this._campaignMasteredShown = false;
    this._campaignCompleteShown = false;
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

  /**
   * Reload the active campaign's progress from localStorage and re-render
   * the level list.  Call this after external changes to localStorage, such
   * as after a player-profile import.
   */
  reloadActiveCampaignProgress(): void {
    if (this._activeCampaign) {
      this._activeCampaignProgress               = loadCampaignProgress(this._activeCampaign.id);
      this._activeCampaignCompletedChapters       = loadCompletedChapters(this._activeCampaign.id);
      this._activeCampaignMasteredChaptersShown   = loadMasteredChaptersShown(this._activeCampaign.id);
      this._campaignMasteredShown                 = loadCampaignMasteredShown(this._activeCampaign.id);
      this._campaignCompleteShown                 = loadCampaignCompleteShown(this._activeCampaign.id);
    }
    this.renderLevelList();
  }

  // ── Public API: chapter map ──────────────────────────────────────────────

  /** The chapter map screen instance (built lazily on first use), or null. */
  get chapterMapScreen(): ChapterMapScreen | null { return this._chapterMapScreen; }

  /** True when the win modal's "Level Select" button should return to the chapter map. */
  get winFromChapterMap(): boolean { return this._winFromChapterMap; }
  set winFromChapterMap(v: boolean) { this._winFromChapterMap = v; }

  /** Show the chapter map screen for the given chapter index (0-based). */
  showChapterMap(chapterIdx: number, hideCampaignMap = true, animateFromMainScreen = false): void {
    const campaign = this._activeCampaign;
    if (!campaign) return;
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter?.grid) return;
    if (hideCampaignMap) this._campaignMapScreen?.hide();

    const chapterMapScreen = this._ensureChapterMapScreen();
    
    if (animateFromMainScreen) {
      const chapterMapEl = chapterMapScreen.screenEl;
      this._playMainScreenTransition(() => {
        this.showChapterMap(chapterIdx, hideCampaignMap, false);
        return chapterMapEl;
      });
      return;
    }

    chapterMapScreen.show(campaign, chapterIdx);
    this._callbacks.setLevelSelectVisible(false);
    this._callbacks.setPlayScreenVisible(false);
    this._callbacks.setScreen(GameScreen.ChapterMap);
    this._callbacks.onMapScreenEntered?.(chapter.style, false);
    this._completionFlow.recognizeChapterProgress(chapterIdx, campaign);
  }

  /** Hide the chapter map screen element (if it exists). */
  hideChapterMap(): void {
    if (this._chapterMapScreen) {
      this._chapterMapScreen.hide();
    }
  }

  /** Show the campaign map when the active campaign defines a campaign-level grid. */
  showCampaignMap(animateFromMainScreen = false): void {
    if (animateFromMainScreen) {
      this._playMainScreenTransition(() => {
        this.showCampaignMap(false);
        return this._campaignMapScreen?.screenEl ?? null;
      });
      return;
    }
    const campaign = this._activeCampaign;
    if (!campaign?.grid) return;
    this._ensureCampaignMapScreen();
    const campaignMapScreen = this._campaignMapScreen;
    if (!campaignMapScreen) return;

    this.hideChapterMap();
    this._winFromChapterMap = false;
    campaignMapScreen.show(campaign);
    this._callbacks.setLevelSelectVisible(false);
    this._callbacks.setPlayScreenVisible(false);
    this._callbacks.setScreen(GameScreen.ChapterMap);
    this._callbacks.onMapScreenEntered?.(campaign.style, true);
    this._completionFlow.recognizeCampaignProgress(campaign);
  }

  /** Re-show the campaign map after returning from a chapter map. */
  reshowCampaignMap(): void {
    const campaign = this._activeCampaign;
    if (this._campaignMapScreen && campaign?.grid) {
      this._campaignMapScreen.repopulate(campaign);
      this._callbacks.setLevelSelectVisible(false);
      this._callbacks.setPlayScreenVisible(false);
      this._callbacks.setScreen(GameScreen.ChapterMap);
      this._callbacks.onMapScreenEntered?.(campaign.style, true);
      this._completionFlow.recognizeCampaignProgress(campaign);
    }
  }

  /** Hide the campaign map screen element (if it exists). */
  hideCampaignMap(): void {
    this._campaignMapScreen?.hide();
  }

  /**
   * Lazily construct the chapter map screen, returning the live instance.
   * Wiring its callbacks once here keeps every entry path (campaign map,
   * main-menu resume) sharing the same screen and listeners.
   */
  /** Play the zoom-out transition from the chapter map back to the campaign map. */
  private _playChapterToCampaignMapTransition(chapterMapScreen: ChapterMapScreen): void {
    const chapterIdx = chapterMapScreen.chapterIdx;
    const chapterSnapshot = chapterMapScreen.captureCanvasSnapshot();
    this._ensureCampaignMapScreen();
    this.reshowCampaignMap();
    const campaignMapScreen = this._campaignMapScreen;
    const minimapRect = chapterIdx >= 0 && campaignMapScreen
      ? campaignMapScreen.getMinimapScreenRect(chapterIdx)
      : null;
    if (!campaignMapScreen) { chapterMapScreen.hide(); return; }
    if (!chapterSnapshot) { chapterMapScreen.hide(); return; }
    if (!minimapRect) { chapterMapScreen.hide(); return; }
    const chapterEl = chapterMapScreen.screenEl;
    const campaignEl = campaignMapScreen.screenEl;
    chapterEl.style.overflow = 'hidden';
    campaignEl.style.overflow = 'hidden';
    // Stop the chapter map animation loop before the transition to prevent
    // it from rendering at the (now campaign-map) TILE_SIZE and corrupting
    // the destination canvas – mirrors stopAnimLoop() in the zoom-in path.
    chapterMapScreen.stopAnimLoop();
    playMapScreenExitTransition(
      minimapRect,
      chapterSnapshot,
      chapterEl,
      campaignEl,
      () => {
        chapterEl.style.overflow = '';
        campaignEl.style.overflow = '';
        chapterMapScreen.hide();
      },
    );
  }

  /** ChapterMapScreen's onShowLevelSelect callback: campaign has a map -> zoom out to it; otherwise go straight to level select. */
  private _handleShowLevelSelectFromChapterMap(): void {
    if (!this._activeCampaign?.grid) {
      this._callbacks.showLevelSelect();
      return;
    }
    const chapterMapScreen = this._chapterMapScreen;
    if (!chapterMapScreen) return;
    this._playChapterToCampaignMapTransition(chapterMapScreen);
  }

  /** ChapterMapScreen's onLevelSelected callback: start the level, playing the zoom-in transition when possible. */
  private _handleLevelSelectedFromChapterMap(levelDef: LevelDef): void {
    this._winFromChapterMap = true;
    this._callbacks.exitBtnEl.textContent = t('campaign.nav.chapterMap');

    // Capture minimap screen rect AND a canvas snapshot BEFORE startLevel
    // hides the chapter map or changes TILE_SIZE.  The snapshot is used to
    // create a precisely-aligned fade-out overlay during the transition.
    const minimapRect = this._chapterMapScreen?.getMinimapScreenRect(levelDef) ?? null;
    const chapterMapSnapshot = this._chapterMapScreen?.captureCanvasSnapshot() ?? null;

    if (levelDef.challenge) {
      this._pendingLevelId = levelDef.id;
    }

    this._callbacks.startLevel(levelDef.id);

    if (minimapRect) {
      this._callbacks.playLevelTransition(
        minimapRect,
        chapterMapSnapshot,
        () => {
          if (levelDef.challenge) {
            this._showChallengeLevelModal(false);
          }
        },
      );
    } else if (levelDef.challenge) {
      this._showChallengeLevelModal(false);
    }
  }

  private _ensureChapterMapScreen(): ChapterMapScreen {
    if (this._chapterMapScreen) return this._chapterMapScreen;
    this._chapterMapScreen = new ChapterMapScreen({
      getDisplayProgress: () => this._activeCampaignProgress,
      getActiveCampaignId: () => this._activeCampaign?.id ?? null,
      onShowLevelSelect: () => this._handleShowLevelSelectFromChapterMap(),
      onLevelSelected: (levelDef) => this._handleLevelSelectedFromChapterMap(levelDef),
      getActiveCampaign: () => this._activeCampaign,
      getCompletedChapters: () => this._activeCampaignCompletedChapters,
    });
    return this._chapterMapScreen;
  }

  /**
   * Start a level resumed via the main-menu "Continue X-Y" button.  When the
   * level lives in a grid-map chapter, silently establish that chapter's map
   * context so exiting the level zooms back out to the chapter map, matching
   * the chapter-map entry flow.  Otherwise start it plainly so exit returns to
   * the level-select screen as before.
   */
  startLevelFromMainMenuPartial(levelId: number): void {
    const prepared = this._prepareChapterMapContextForLevel(levelId);
    this._winFromChapterMap = prepared;
    if (prepared) {
      this._callbacks.exitBtnEl.textContent = t('campaign.nav.chapterMap');
    }
    this._callbacks.startLevel(levelId);
  }

  /**
   * Populate the chapter map screen for the chapter containing `levelId`
   * without switching music or firing progress modals.  `show()` makes the
   * screen visible, but `startLevel` hides it again in the same synchronous
   * call stack (via `_enterPlayScreenState` → `hideChapterMap`), so no frame is
   * painted in between and no flash is seen.  Returns true when a grid-map
   * chapter context was established.
   */
  private _prepareChapterMapContextForLevel(levelId: number): boolean {
    const campaign = this._activeCampaign;
    if (!campaign) return false;
    const chapterIdx = campaign.chapters.findIndex(
      (ch) => ch.levels.some((l) => l.id === levelId),
    );
    if (chapterIdx < 0) return false;
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter?.grid) return false;
    this._ensureChapterMapScreen().show(campaign, chapterIdx);
    return true;
  }

  private _ensureCampaignMapScreen(): void {
    if (this._campaignMapScreen) return;
    this._campaignMapScreen = new CampaignMapScreen({
      getCompletedChapters: () => this._activeCampaignCompletedChapters,
      getCompletedLevels: () => this._activeCampaignProgress,
      getActiveCampaignId: () => this._activeCampaign?.id ?? null,
      onShowLevelSelect: () => this._exitCampaignMapToMainScreen(),
      onChapterSelected: (chapterIdx) => this._showChapterMapFromCampaign(chapterIdx),
    });
  }

  private _showChapterMapFromCampaign(chapterIdx: number): void {
    const campaignMapScreen = this._campaignMapScreen;
    if (!campaignMapScreen) {
      this.showChapterMap(chapterIdx);
      return;
    }

    const minimapRect = campaignMapScreen.getMinimapScreenRect(chapterIdx);
    const campaignSnapshot = campaignMapScreen.captureCanvasSnapshot();
    if (!minimapRect || !campaignSnapshot) {
      this.showChapterMap(chapterIdx);
      return;
    }

    campaignMapScreen.stopAnimLoop();
    this.showChapterMap(chapterIdx, false);
    const chapterMapScreen = this._chapterMapScreen;
    const chapterSnapshot = chapterMapScreen?.captureCanvasSnapshot();
    if (!chapterMapScreen || !chapterSnapshot) {
      campaignMapScreen.hide();
      return;
    }

    // Stop the chapter map animation loop for the duration of the zoom-in
    // transition – mirrors stopAnimLoop() in the zoom-out path.  This prevents
    // any concurrent TILE_SIZE change or sparkle rendering from corrupting the
    // transition visuals on the destination canvas.
    chapterMapScreen.stopAnimLoop();

    const campaignEl = campaignMapScreen.screenEl;
    const chapterEl = chapterMapScreen.screenEl;
    campaignEl.style.overflow = 'hidden';
    chapterEl.style.overflow = 'hidden';
    playMapScreenEnterTransition(
      minimapRect,
      chapterSnapshot,
      campaignEl,
      chapterEl,
      () => {
        campaignEl.style.overflow = '';
        chapterEl.style.overflow = '';
        campaignMapScreen.hide();
        chapterMapScreen.startAnimLoop();
      },
      campaignSnapshot,
    );
  }

  private _playMainScreenTransition(showDestination: () => HTMLElement | null): void {
    if (getComputedStyle(this._callbacks.levelSelectEl).display === 'none') {
      showDestination();
      return;
    }
    playSwirlScreenTransition(
      this._callbacks.levelSelectEl,
      showDestination,
      NO_OP,
    );
  }

  private _exitCampaignMapToMainScreen(): void {
    const campaignMapEl = this._campaignMapScreen?.screenEl;
    if (!campaignMapEl || getComputedStyle(campaignMapEl).display === 'none') {
      this._callbacks.showLevelSelect();
      return;
    }

    playSwirlScreenTransition(
      campaignMapEl,
      () => {
        this._callbacks.showLevelSelect();
        return this._callbacks.levelSelectEl;
      },
      NO_OP,
    );
  }

  /**
   * Re-show the chapter map (reattaching listeners) and repopulate it with
   * current progress. Used when returning from a level that was entered via
   * the chapter map.
   */
  reshowChapterMap(): void {
    const campaign = this._activeCampaign;
    if (!this._chapterMapScreen) return;
    if (!campaign) return;
    if (this._chapterMapScreen.chapterIdx < 0) return;
    const chapterIdx = this._chapterMapScreen.chapterIdx;
    this._chapterMapScreen.show(campaign, chapterIdx);
    this._completionFlow.recognizeChapterProgress(chapterIdx, campaign);
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
  /** True when `currentLevelId`'s chapter just finished and had its own grid map (go to the chapter map, not the next level). */
  private _isLastLevelOfGridChapter(
    currentChapter: ChapterDef | undefined, nextChapter: ChapterDef | undefined,
  ): currentChapter is ChapterDef {
    return !!currentChapter?.grid && !!nextChapter && currentChapter !== nextChapter;
  }

  /** True when `nextLevelDef` is the first level of a chapter different from the one just completed. */
  private _isFirstLevelOfNewChapter(
    currentChapter: ChapterDef | undefined, nextChapter: ChapterDef | undefined, nextLevelDef: LevelDef,
  ): nextChapter is ChapterDef {
    return (
      currentChapter !== undefined &&
      nextChapter !== undefined &&
      currentChapter !== nextChapter &&
      nextChapter.levels[0].id === nextLevelDef.id
    );
  }

  /** The chapter just completed had its own grid map: show it instead of continuing to the next level. */
  private _advanceToChapterMap(chapters: ChapterDef[], currentChapter: ChapterDef): void {
    this._pendingLevelId = null;
    this._callbacks.winModalEl.style.display = 'none';
    this._winFromChapterMap = true;
    this.showChapterMap(chapters.indexOf(currentChapter));
  }

  /** `nextLevelDef` starts a new chapter: show its map (if it has one) or start the level, then the new-chapter modal. */
  private _advanceToNewChapter(chapters: ChapterDef[], nextChapter: ChapterDef, nextLevelDef: LevelDef): void {
    const chapterIdx = chapters.indexOf(nextChapter);
    if (nextChapter.grid) {
      this._pendingLevelId = null;
      this._callbacks.winModalEl.style.display = 'none';
      this._winFromChapterMap = true;
      this.showChapterMap(chapterIdx);
    } else {
      this._callbacks.startLevel(nextLevelDef.id);
    }
    this._showNewChapterModal(chapterIdx, nextChapter);
  }

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
    if (this._isLastLevelOfGridChapter(currentChapter, nextChapter)) {
      this._advanceToChapterMap(chapters, currentChapter);
      return;
    }

    if (this._isFirstLevelOfNewChapter(currentChapter, nextChapter, nextLevelDef)) {
      this._advanceToNewChapter(chapters, nextChapter, nextLevelDef);
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
   * Called when the player chooses to play the challenge level (or by the
   * auto-dismiss timer after the modal fades out).
   * Dismisses the challenge modal and starts the pending level.
   *
   * Safe against concurrent calls: `_cancelChallengeAutoPlay()` cancels any
   * pending timers, and the `_pendingLevelId === null` guard ensures
   * `startLevel` is invoked at most once even if this is called from both a
   * button click and the close timer in quick succession.
   */
  playChallengeLevel(): void {
    this._cancelChallengeAutoPlay();
    this._callbacks.closeModal(this._challengeModalEl);
    if (this._pendingLevelId === null) return;
    const id = this._pendingLevelId;
    this._pendingLevelId = null;
    this._callbacks.startLevel(id);
  }

  /**
   * Called when the player chooses to skip the challenge level.
   * Cancels the auto-dismiss timer, dismisses the challenge modal and advances
   * to the next level after the challenge.
   */
  skipChallengeLevel(): void {
    this._cancelChallengeAutoPlay();
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
  /** Locate the chapter (and its index within `chapters`) containing `levelId`, or null if none does. */
  private _findChapterContainingLevel(chapters: ChapterDef[], levelId: number): { chapter: ChapterDef; ci: number; idx: number } | null {
    for (let ci = 0; ci < chapters.length; ci++) {
      const idx = chapters[ci].levels.findIndex((l) => l.id === levelId);
      if (idx !== -1) return { chapter: chapters[ci], ci, idx };
    }
    return null;
  }

  /** Render the level header for a level found within a campaign chapter. */
  private _renderLevelHeaderForChapter(el: HTMLElement, found: { chapter: ChapterDef; ci: number; idx: number }): void {
    const { chapter, ci, idx } = found;
    this.currentChapterId = chapter.id;
    const level = chapter.levels[idx];
    const chapterNumber = ci + 1;
    const challengeSuffix = level.challenge ? '  💀' : '';
    el.replaceChildren();
    if (this._activeCampaign) {
      const line1 = document.createElement('div');
      line1.style.cssText = 'font-size:0.9rem;color:#aaa;';
      line1.textContent = resolveLocalizedText(this._activeCampaign.name);
      el.appendChild(line1);
    }
    const line2 = document.createElement('div');
    line2.style.cssText = 'font-size:1rem;color:#f0c040;';
    line2.textContent =
      `Chapter ${chapterNumber}: ${resolveLocalizedText(chapter.name)}  ·  Level ${idx + 1}: ${resolveLocalizedText(level.name)}${challengeSuffix}`;
    el.appendChild(line2);
  }

  /** Render the level header when the level isn't in any chapter (non-campaign play). */
  private _renderLevelHeaderFallback(el: HTMLElement, chapters: ChapterDef[], levelId: number): void {
    this.currentChapterId = 0;
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === levelId);
    const challengeSuffix = level?.challenge ? '  💀' : '';
    el.replaceChildren();
    const line2 = document.createElement('div');
    line2.style.cssText = 'font-size:1rem;color:#f0c040;';
    line2.textContent = level ? `Level ${levelId}: ${resolveLocalizedText(level.name)}${challengeSuffix}` : '';
    el.appendChild(line2);
  }

  updateLevelHeader(levelId: number): void {
    const el = this._callbacks.levelHeaderEl;
    const chapters = this._activeCampaign?.chapters ?? [];
    const found = this._findChapterContainingLevel(chapters, levelId);
    if (found) {
      this._renderLevelHeaderForChapter(el, found);
      return;
    }
    this._renderLevelHeaderFallback(el, chapters, levelId);
  }

  // ── Public API: persistence (campaign-scoped) ────────────────────────────

  /** Record a level as completed.  No-op during playtesting. */
  markLevelCompleted(levelId: number): void {
    if (this._playtestExitCallback) return; // don't persist during playtesting
    if (this._activeCampaign) {
      markCampaignLevelCompleted(this._activeCampaign.id, levelId, this._activeCampaignProgress);
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
    return val ?? null;
  }

  /**
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
      clearMasteredChaptersShown(this._activeCampaign.id, this._activeCampaignMasteredChaptersShown);
      clearCampaignMasteredShown(this._activeCampaign.id);
      clearCampaignCompleteShown(this._activeCampaign.id);
      this._campaignMasteredShown = false;
      this._campaignCompleteShown = false;
    }
    this.renderLevelList();
  }

  /** Dev cheat: mark all levels completed and refresh the level list. */
  /** Mark one level fully completed (and award its stars) for the "unlock all" debug/testing action. */
  private _unlockLevel(campaignId: string, level: LevelDef): void {
    markCampaignLevelCompleted(campaignId, level.id, this._activeCampaignProgress);
    if ((level.starCount ?? 0) > 0) {
      saveLevelStar(level.id, level.starCount ?? 0, campaignId);
    }
  }

  /** Unlock every level of one chapter, then mark the chapter itself completed. */
  private _unlockChapter(campaignId: string, chapter: ChapterDef): void {
    for (const level of chapter.levels) this._unlockLevel(campaignId, level);
    markChapterCompleted(campaignId, chapter.id, this._activeCampaignCompletedChapters);
  }

  unlockAll(): void {
    if (this._activeCampaign) {
      for (const chapter of this._activeCampaign.chapters) this._unlockChapter(this._activeCampaign.id, chapter);
    }
    this.renderLevelList();
  }

  // ── Public API: level-select rendering ──────────────────────────────────

  /** Re-render the level list on the level-select screen. */
  /** Summary info for the active-campaign header row, or undefined when no campaign is active. */
  private _buildActiveCampaignInfo(): { name: string; author: string; completionPct: number } | undefined {
    if (!this._activeCampaign) return undefined;
    return {
      name: resolveLocalizedText(this._activeCampaign.name),
      author: this._activeCampaign.author,
      completionPct: computeCampaignCompletionPct(this._activeCampaign, this._activeCampaignProgress),
    };
  }

  /**
   * Clicking a chapter navigates to that chapter's own map when it has one —
   * regardless of completion state. Only fall back to the campaign map when
   * the chapter itself has no map but the campaign does. No else branch: the
   * chapter header only wires this callback when a map exists (campaign grid
   * or chapter grid), so a "no map anywhere" click never reaches here.
   */
  private _handleChapterHeaderClick(chapterIdx: number): void {
    const chapter = this._activeCampaign?.chapters[chapterIdx];
    if (chapter?.grid) {
      this.showChapterMap(chapterIdx, true, true);
    } else if (this._activeCampaign?.grid) {
      this.showCampaignMap(true);
    }
  }

  /** Reset-progress confirmation info for the active campaign, or null when no campaign is active. */
  private _buildResetInfoOrNull(
    displayProgress: Set<number>, levelStars: Record<number, number>, levelWater: Record<number, number>,
  ): ResetProgressInfo | null {
    if (!this._activeCampaign) return null;
    return this._buildResetProgressInfo(this._activeCampaign, displayProgress, levelStars, levelWater);
  }

  /** Callback that shows the campaign-mastery sequence, or undefined once it's already been shown. */
  private _buildOnShowCampaignMastery(): (() => void) | undefined {
    if (this._campaignMasteredShown) return undefined;
    return () => {
      if (this._activeCampaign) this._completionFlow.showCampaignMasterySequence(this._activeCampaign);
    };
  }

  /** Callback that resumes a partially-played level, or undefined when the host doesn't support it. */
  private _buildOnStartLevelFromPartial(): ((id: number) => void) | undefined {
    if (!this._callbacks.startLevelFromPartial) return undefined;
    return (id: number) => this._callbacks.startLevelFromPartial?.(id);
  }

  renderLevelList(): void {
    const campaignChapters = this._activeCampaign?.chapters ?? [];
    const displayProgress = this._activeCampaignProgress;
    const levelStars = loadLevelStars(this._activeCampaign?.id);
    const levelWater = loadLevelWater(this._activeCampaign?.id);
    const resetInfo = this._buildResetInfoOrNull(displayProgress, levelStars, levelWater);
    renderLevelList(
      this._callbacks.levelListEl,
      displayProgress,
      (id) => this.requestLevel(id),
      () => this._callbacks.showResetConfirmModal(resetInfo),
      () => this._callbacks.showRules(),
      () => this._openCampaignEditor(),
      () => this.unlockAll(),
      this._buildActiveCampaignInfo(),
      campaignChapters,
      levelStars,
      levelWater,
      (ci) => this._handleChapterHeaderClick(ci),
      this._activeCampaignCompletedChapters,
      () => this._callbacks.showSettings(),
      this._buildOnShowCampaignMastery(),
      this._activeCampaign?.grid !== undefined,
      () => this.showCampaignMap(true),
      () => this._callbacks.showPlayerProfile(),
      this._callbacks.getPlayerName() ?? undefined,
      () => this._callbacks.showCredits(),
      this._buildOnStartLevelFromPartial(),
      this._callbacks.getPartialLevelId?.() ?? null,
      loadGnomeAppearance(),
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
    this._callbacks.winNextBtnEl.textContent = t('modal.win.returnToEditor');
    this._callbacks.gameoverMenuBtnEl.textContent = t('modal.gameover.returnToEditor');
    this._callbacks.exitBtnEl.textContent = t('hud.exit.editor');
    this._callbacks.startLevelDef(level);
  }

  // ── Public API: inter-class coordination ────────────────────────────────

  /**
   * Hide campaign-owned modals and reset campaign transient state.
   * Called by Game._showLevelSelect() to prepare for the level-select screen.
   */
  prepareForLevelSelect(): void {
    this.hideChapterMap();
    this.hideCampaignMap();
    this._newChapterModalEl.style.display = 'none';
    this._cancelChallengeAutoPlay();
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
    this._cancelChallengeAutoPlay();
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
  get _challengePlayBtnElInternal(): HTMLButtonElement { return this._challengePlayBtnEl; }
  /** @internal */
  get _challengeSkipBtnElInternal(): HTMLButtonElement { return this._challengeSkipBtnEl; }
  /** @internal */
  get _pendingLevelIdInternal(): number | null { return this._pendingLevelId; }
  /** @internal */
  get _playtestExitCallbackInternal(): (() => void) | null { return this._playtestExitCallback; }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Compute the progress summary used to populate the reset-progress confirmation modal.
   */
  private _buildResetProgressInfo(
    campaign: CampaignDef,
    progress: Set<number>,
    levelStars: Record<number, number>,
    levelWater: Record<number, number>,
  ): ResetProgressInfo {
    const allLevels = campaign.chapters.flatMap((ch) => ch.levels);
    const levelsCompleted = allLevels.filter(l => progress.has(l.id)).length;
    const levelsTotal = allLevels.length;
    const challengesCompleted = allLevels.filter(l => l.challenge && progress.has(l.id)).length;
    const challengesTotal = allLevels.filter(l => l.challenge).length;
    const starsCollected = allLevels.reduce((sum, l) =>
      sum + Math.min(levelStars[l.id] ?? 0, l.starCount ?? 0), 0);
    const starsTotal = allLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
    const waterScore = allLevels.reduce((sum, l) =>
      sum + (progress.has(l.id) ? (levelWater[l.id] ?? 0) : 0), 0);
    const chaptersWithMaps = campaign.chapters.filter(ch => ch.grid);
    const chaptersTotal = chaptersWithMaps.length;
    const chaptersCompleted = chaptersWithMaps.filter(
      ch => ch.id !== undefined && this._activeCampaignCompletedChapters.has(ch.id)
    ).length;
    return {
      campaignName: resolveLocalizedText(campaign.name),
      chaptersCompleted,
      chaptersTotal,
      levelsCompleted,
      levelsTotal,
      challengesCompleted,
      challengesTotal,
      starsCollected,
      starsTotal,
      waterScore,
    };
  }

  private _openCampaignEditor(): void {
    this._callbacks.setScreen(GameScreen.CampaignEditor);
    this._callbacks.setLevelSelectVisible(false);
    this._campaignEditor.show();
  }

  private _showNewChapterModal(chapterIdx: number, chapter: ChapterDef): void {
    this._newChapterNumberEl.textContent = t('campaign.chapterLabel', { number: chapterIdx + 1 });
    this._newChapterNameEl.textContent = resolveLocalizedText(chapter.name);
    this._newChapterModalEl.style.display = 'flex';
    sfxManager.play(SfxId.NewChapter);
    this._callbacks.triggerModalSparkle(this._newChapterModalEl, 'sparkle-blue');
  }

  /** If the pending challenge level already has in-progress moves saved, resume it directly. @returns true when it did (caller should stop). */
  private _resumePartialChallengeIfAny(): boolean {
    const pendingLevelId = this._pendingLevelId;
    if (pendingLevelId === null) return false;
    const partial = getPartialProgressFor(this._activeCampaign?.id ?? '', pendingLevelId);
    if (!partial || partial.moves.length === 0) return false;
    this.playChallengeLevel();
    return true;
  }

  /**
   * canSkip=true (sequential): show the message and both action buttons so the
   * player must click to proceed. canSkip=false (directly selected): hide them
   * all and let the auto-fade sequence advance to the level.
   */
  private _setChallengeModalControlsVisible(canSkip: boolean): void {
    const display = canSkip ? '' : 'none';
    this._challengeMsgEl.style.display = display;
    this._challengePlayBtnEl.style.display = display;
    this._challengeSkipBtnEl.style.display = display;
  }

  /** Auto-advance after 2s display + 1s fade, for a directly-selected (non-skippable) challenge level. */
  private _scheduleChallengeAutoAdvance(): void {
    this._challengeFadeTimerId = setTimeout(() => {
      this._challengeFadeTimerId = null;
      this._challengeModalEl.style.transition = 'opacity 1s ease-out';
      this._challengeModalEl.style.opacity = '0';
      this._challengeCloseTimerId = setTimeout(() => {
        this._challengeCloseTimerId = null;
        this.playChallengeLevel();
      }, 1000);
    }, 2000);
  }

  private _showChallengeLevelModal(canSkip: boolean): void {
    this._cancelChallengeAutoPlay();
    if (this._resumePartialChallengeIfAny()) return;

    this._setChallengeModalControlsVisible(canSkip);
    // Reset opacity and transition from any previous auto-dismiss sequence.
    this._challengeModalEl.style.opacity = '1';
    this._challengeModalEl.style.transition = '';
    this._challengeModalEl.style.display = 'flex';
    sfxManager.play(SfxId.Challenge);
    this._callbacks.triggerModalSparkle(this._challengeModalEl, 'sparkle-yellow');
    if (!canSkip) this._scheduleChallengeAutoAdvance();
  }

  /** Cancel any pending challenge auto-dismiss timers and reset opacity styles. */
  private _cancelChallengeAutoPlay(): void {
    if (this._challengeFadeTimerId !== null) {
      clearTimeout(this._challengeFadeTimerId);
      this._challengeFadeTimerId = null;
    }
    if (this._challengeCloseTimerId !== null) {
      clearTimeout(this._challengeCloseTimerId);
      this._challengeCloseTimerId = null;
    }
    this._challengeModalEl.style.opacity = '';
    this._challengeModalEl.style.transition = '';
  }

  /**
   * Returns true when all levels in the chapter are completed and all available
   * stars have been collected (using the active campaign's progress).
   */
  private _isCampaignChapterMastered(chapter: ChapterDef): boolean {
    const progress = this._activeCampaignProgress;
    const levelStars = loadLevelStars(this._activeCampaign?.id);
    const chLevels = chapter.levels;
    const allLevelsCompleted = chLevels.every(l => progress.has(l.id));
    const starsCollected = chLevels.reduce((sum, l) => sum + Math.min(levelStars[l.id] ?? 0, l.starCount ?? 0), 0);
    const starsTotal = chLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
    return allLevelsCompleted && (starsTotal === 0 || starsCollected >= starsTotal);
  }

  private _autoSelectCampaign(): void {
    const allCampaigns = this._campaignEditor.getAllCampaigns();
    if (allCampaigns.length === 0) return;
    const campaign = allCampaigns.find((c) => c.official === true) ?? allCampaigns[0];
    this._activeCampaign = campaign;
    this._activeCampaignProgress = loadCampaignProgress(campaign.id);
    this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
    this._activeCampaignMasteredChaptersShown = loadMasteredChaptersShown(campaign.id);
    this._campaignMasteredShown = loadCampaignMasteredShown(campaign.id);
    this._campaignCompleteShown = loadCampaignCompleteShown(campaign.id);
    saveActiveCampaignId(campaign.id);
  }

  private _restoreActiveCampaign(campaignId: string): void {
    const allCampaigns = this._campaignEditor.getAllCampaigns();
    const campaign = allCampaigns.find((c) => c.id === campaignId);
    if (campaign) {
      this._activeCampaign = campaign;
      this._activeCampaignProgress = loadCampaignProgress(campaign.id);
      this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
      this._activeCampaignMasteredChaptersShown = loadMasteredChaptersShown(campaign.id);
      this._campaignMasteredShown = loadCampaignMasteredShown(campaign.id);
      this._campaignCompleteShown = loadCampaignCompleteShown(campaign.id);
    } else {
      clearActiveCampaignId();
    }
  }
}
