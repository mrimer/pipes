import { Board, MoveResult, ERR_GOLD_SPACE, parseKey, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, computeDeltaTemp, snowCostPerDeltaTemp } from './board';
import { Tile } from './tile';
import { GameScreen, GameState, GridPos, InventoryItem, LevelDef, PipeShape, CampaignDef, Rotation, AmbientDecoration } from './types';
import { InputCallbacks, InputHandler } from './inputHandler';
import { TILE_SIZE, renderBoard, setTileSize, computeTileSize } from './renderer';
import { loadCompletedLevels, saveSfxVolume } from './persistence';
import { createGameRulesModal } from './rulesModal';
import { CampaignEditor } from './campaignEditor';
import { CampaignManager, CampaignCallbacks } from './campaignManager';
import { spawnConfetti, clearConfetti } from './visuals/confetti';
import { spawnStarSparkles, clearStarSparkles } from './visuals/starSparkle';
import { ROTATION_ANIM_DURATION } from './visuals/pipeEffects';
import {
  buildResetModal,
  buildExitConfirmModal, buildUnplayableModal,
  buildSettingsModal,
} from './gameModals';
import { AnimationManager } from './animationManager';
import { TooltipManager } from './tooltipManager';
import { MetricsDisplay } from './metricsDisplay';
import { playLevelTransition, playLevelExitTransition } from './levelTransition';
import { sfxManager, SfxId } from './sfxManager';

/** How long (ms) error flash messages and tile error highlights are displayed. */
const ERROR_DISPLAY_MS = 2000;
/** Delay (ms) after the win-level sfx before playing the star sfx and sparkles. */
const STAR_SFX_DELAY_MS = 500;
/** Ice-sfx threshold: raw cost at or above this uses Ice2 sfx (instead of Ice1). */
const ICE_SFX_THRESHOLD_MID = 5;
/** Ice-sfx threshold: raw cost at or above this uses Ice3 sfx (instead of Ice2). */
const ICE_SFX_THRESHOLD_HIGH = 10;
/** Snow-sfx threshold: raw cost at or above this uses Snow2 sfx (instead of Snow1). */
const SNOW_SFX_THRESHOLD_MID = 5;
/** Snow-sfx threshold: raw cost at or above this uses Snow3 sfx (instead of Snow2). */
const SNOW_SFX_THRESHOLD_HIGH = 10;
/** Dirt-sfx threshold: dirt cost at or above this uses Dirt2 sfx (instead of Dirt1). */
const DIRT_SFX_THRESHOLD_MID = 5;
/** Dirt-sfx threshold: dirt cost at or above this uses Dirt3 sfx (instead of Dirt2). */
const DIRT_SFX_THRESHOLD_HIGH = 10;

/** CSS style for the toggle button of each hint in the hint box. */
const HINT_TOGGLE_BTN_STYLE =
  'width:100%;padding:10px 16px;font-size:0.9rem;background:#1a1400;color:#f0c040;' +
  'border:none;cursor:pointer;text-align:left;font-family:inherit;';

/** CSS style for the collapsible text area of each hint in the hint box. */
const HINT_TEXT_STYLE =
  'display:none;padding:12px 16px;font-size:0.9rem;color:#eee;background:#16213e;';

/** CSS style for the note box shown beneath the grid when a level has a note. */
const NOTE_BOX_CSS =
  'display:none;background:#16213e;border:1px solid #4a90d9;border-radius:6px;' +
  'padding:12px 16px;font-size:0.9rem;color:#eee;max-width:600px;width:100%;box-sizing:border-box;';

/** CSS style for the collapsible hint box shown beneath the grid when a level has hints. */
const HINT_BOX_CSS =
  'display:none;border:1px solid #f0c040;border-radius:6px;' +
  'max-width:600px;width:100%;box-sizing:border-box;overflow:hidden;';

/** CSS style for the brief error-flash message shown when an action is blocked. */
const ERROR_FLASH_CSS =
  'display:none;position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
  'background:#c0392b;color:#fff;border:2px solid #e74c3c;' +
  'border-radius:6px;padding:8px 18px;font-size:0.95rem;pointer-events:none;z-index:60;' +
  'text-align:center;max-width:360px;';

// ── Play-screen layout overhead estimates ────────────────────────────────────
// These CSS-derived pixel heights are used by _computePlayOverhead() to calculate
// how much vertical space is consumed by UI elements outside the game canvas, so
// the canvas can be sized to fill the remaining viewport height.

/** Top padding (px) of the #play-screen element – mirrors the CSS `padding: 20px 0 24px`. */
const PLAY_TOP_PADDING = 20;
/** Estimated height (px) of the two-line #level-header: campaign-name row
 *  (0.9 rem ≈ 14 px × 1.4 + a couple px rounding ≈ 22 px) plus chapter/level row
 *  (1 rem ≈ 16 px × 1.4 ≈ 23 px) plus a 4 px gap between lines ≈ 49. */
const PLAY_LEVEL_HEADER_H = 49;
/** Estimated height (px) of the #hud button row (buttons with 6 px vertical padding). */
const PLAY_HUD_H = 32;
/** Gap (px) between flex children in the #play-screen column layout. */
const PLAY_GAP = 10;
/** Bottom padding (px) of the #play-screen element. */
const PLAY_PADDING_BOTTOM = 24;
/** Estimated height (px) of the note panel: 12 px padding × 2 + one text line. */
const PLAY_NOTE_PANEL_H = 42;
/** Estimated height (px) of the collapsed hint panel: toggle-button 10 px padding × 2 + font. */
const PLAY_HINT_PANEL_H = 37;
/** Vertical border height (px) added by the 3 px CSS border on #game-canvas (3 px × 2 sides). */
const PLAY_CANVAS_BORDER_H = 6;
/** Horizontal border width (px) added by the 3 px CSS border on #game-canvas (3 px × 2 sides). */
const PLAY_CANVAS_BORDER_W = 6;

/**
 * Manages the game loop, rendering, and user input for the Pipes puzzle.
 * Handles both the level-selection menu and the active play screen.
 */
export class Game implements InputCallbacks {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  /** Input handler that owns all event listeners and input state. */
  private readonly _input: InputHandler;

  // Screens / overlays (managed by DOM, not canvas)
  private readonly levelSelectEl: HTMLElement;
  private readonly levelListEl: HTMLElement;
  private readonly playScreenEl: HTMLElement;
  private readonly levelHeaderEl: HTMLElement;
  private readonly winModalEl: HTMLElement;
  private readonly gameoverModalEl: HTMLElement;
  private readonly gameoverMsgEl: HTMLElement;

  /** Undo button in the play-screen HUD. */
  private readonly undoBtnEl: HTMLButtonElement;

  /** Redo button in the play-screen HUD. */
  private readonly redoBtnEl: HTMLButtonElement;

  /** "← Menu" / "← Edit" exit button in the play-screen HUD. */
  private readonly exitBtnEl: HTMLButtonElement;

  /** "Next Level" / "Continue" / "Return to Editor" button in the win modal. */
  private readonly winNextBtnEl: HTMLButtonElement;

  /** Challenge level indicator element in the win modal. */
  private readonly winChallengeEl: HTMLElement | null;

  /** Water retained display element in the win modal. */
  private readonly winWaterEl: HTMLElement | null;

  /** Star count display element in the win modal. */
  private readonly winStarsEl: HTMLElement | null;

  /** "Level Select" / "Return to Editor" button in the gameover modal. */
  private readonly gameoverMenuBtnEl: HTMLButtonElement;

  private screen: GameScreen = GameScreen.LevelSelect;
  private gameState: GameState = GameState.Playing;
  private board: Board | null = null;
  private currentLevel: LevelDef | null = null;
  private focusPos: GridPos = { row: 0, col: 0 };

  /** The pipe shape currently selected from the inventory, ready to be placed. */
  private selectedShape: PipeShape | null = null;

  /** Rotation that will be applied when the pending inventory item is placed. */
  private pendingRotation: Rotation = 0;

  /**
   * When true, a level-intro ring effect is waiting to be spawned.  Set whenever
   * a new level begins; cleared after the rings are actually shown (which may be
   * deferred until a campaign modal is dismissed).
   */
  private _pendingRings = false;
  /** `setTimeout` handle for the pending ring check, or null when none is queued. */
  private _pendingRingsTimerId: ReturnType<typeof setTimeout> | null = null;
  /**
   * True while the level-enter zoom transition animation is in progress.
   * Ring spawning and other post-load effects are deferred until it completes.
   */
  private _levelTransitionInProgress = false;

  /** Tooltip manager for displaying grid coordinates and tile info under Ctrl. */
  private readonly _tooltip: TooltipManager;

  /** Floating error message element shown briefly when an action is blocked. */
  private readonly errorFlashEl: HTMLElement;
  /** Timer ID for auto-hiding the error flash message. */
  private _errorFlashTimer: ReturnType<typeof setTimeout> | null = null;

  /** Set of "row,col" keys for sandstone tiles currently highlighted due to a validation error. */
  private _errorHighlightKeys: Set<string> = new Set();
  /** Timer ID for clearing the sandstone highlight. */
  private _errorHighlightTimer: ReturnType<typeof setTimeout> | null = null;

  /** Modal overlay showing game rules and tile legend. */
  private readonly _rulesModalEl: HTMLElement;

  /** Campaign editor overlay (manages its own DOM). */
  private readonly campaignEditor: CampaignEditor;

  /** Manages campaign lifecycle, chapter map, modals, and campaign persistence. */
  private readonly _campaign: CampaignManager;

  /** Levels that have been successfully completed (persisted in localStorage). */
  private completedLevels: Set<number>;

  /** Manages all canvas-based visual effects (particles, fill/rotation animations, labels, rings). */
  private readonly _animMgr: AnimationManager;

  /** Manages the play-screen HUD metrics, inventory bar, and best-score box. */
  private readonly _metrics: MetricsDisplay;

  /** Box shown beneath the grid with level notes (when the level has a note). */
  private readonly noteBoxEl: HTMLElement;

  /** Collapsible box shown beneath the grid with the level hints (when the level has hints). */
  private readonly hintBoxEl: HTMLElement;

  /** Modal overlay for confirming a progress reset. */
  private readonly resetConfirmModalEl: HTMLElement;

  /** Modal overlay shown when the player presses Esc to confirm abandoning the level. */
  private readonly _exitConfirmModalEl: HTMLElement;

  /** Modal overlay shown when a level starts in an already-lost state (unplayable). */
  private readonly _unplayableModalEl: HTMLElement;

  /** Modal overlay for the game settings (SFX volume, etc.). */
  private readonly _settingsModalEl: HTMLElement;

  constructor(
    canvas: HTMLCanvasElement,
    levelSelectEl: HTMLElement,
    levelListEl: HTMLElement,
    playScreenEl: HTMLElement,
    levelHeaderEl: HTMLElement,
    inventoryBarEl: HTMLElement,
    waterDisplayEl: HTMLElement,
    winModalEl: HTMLElement,
    gameoverModalEl: HTMLElement,
    gameoverMsgEl: HTMLElement,
    undoBtnEl: HTMLButtonElement,
    redoBtnEl: HTMLButtonElement,
    exitBtnEl: HTMLButtonElement,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context');
    this.ctx = ctx;
    this._animMgr = new AnimationManager(canvas, ctx);

    this.levelSelectEl = levelSelectEl;
    this.levelListEl = levelListEl;
    this.playScreenEl = playScreenEl;
    this.levelHeaderEl = levelHeaderEl;
    this.winModalEl = winModalEl;
    this.gameoverModalEl = gameoverModalEl;
    this.gameoverMsgEl = gameoverMsgEl;
    this.undoBtnEl = undoBtnEl;
    this.redoBtnEl = redoBtnEl;
    this.exitBtnEl = exitBtnEl;
    this.winNextBtnEl = winModalEl.querySelector<HTMLButtonElement>('#win-next-btn')!;
    this.winChallengeEl = winModalEl.querySelector<HTMLElement>('#win-challenge');
    this.winWaterEl = winModalEl.querySelector<HTMLElement>('#win-water');
    this.winStarsEl = winModalEl.querySelector<HTMLElement>('#win-stars');
    this.gameoverMenuBtnEl = gameoverModalEl.querySelector<HTMLButtonElement>('#gameover-menu-btn')!;

    // Load persisted completions
    this.completedLevels = loadCompletedLevels();

    // Create the tooltip manager for Ctrl+hover grid coordinates
    this._tooltip = TooltipManager.create();

    // Create the metrics display manager (HUD stats, inventory bar, best-score box)
    const bestScoreBoxEl = document.getElementById('best-score-box') as HTMLElement;
    this._metrics = new MetricsDisplay(waterDisplayEl, inventoryBarEl, bestScoreBoxEl);

    // Create the note box (appended to the play screen, shown beneath the grid)
    this.noteBoxEl = document.createElement('div');
    this.noteBoxEl.style.cssText = NOTE_BOX_CSS;
    playScreenEl.appendChild(this.noteBoxEl);

    // Create the hint box (appended to the play screen after the note box, collapsible)
    this.hintBoxEl = document.createElement('div');
    this.hintBoxEl.style.cssText = HINT_BOX_CSS;
    playScreenEl.appendChild(this.hintBoxEl);

    // Create the error-flash element for brief action-blocked messages
    this.errorFlashEl = document.createElement('div');
    this.errorFlashEl.style.cssText = ERROR_FLASH_CSS;
    document.body.appendChild(this.errorFlashEl);

    // Create the reset-progress confirmation modal
    this.resetConfirmModalEl = buildResetModal(
      () => { this._campaign.resetProgress(); this._closeModal(this.resetConfirmModalEl); },
      () => { this._closeModal(this.resetConfirmModalEl); },
    );

    // Create the game-rules modal (appends itself to document.body)
    this._rulesModalEl = createGameRulesModal();

    // Create the exit-confirmation modal (shown when the player presses Esc mid-level)
    this._exitConfirmModalEl = buildExitConfirmModal(
      () => { this._closeModal(this._exitConfirmModalEl); this.exitToMenu(); },
      () => { this._closeModal(this._exitConfirmModalEl); this.canvas.focus(); },
    );

    // Create the unplayable-level modal (shown when a level starts already lost)
    this._unplayableModalEl = buildUnplayableModal(
      () => { this._closeModal(this._unplayableModalEl); this.exitToMenu(); },
    );

    // Create the settings modal (SFX volume control, etc.)
    this._settingsModalEl = buildSettingsModal(
      () => sfxManager.getVolume(),
      (v) => { sfxManager.setVolume(v); },
      () => { sfxManager.play(SfxId.PipePlacement); },
      (el) => {
        saveSfxVolume(sfxManager.getVolume());
        el.style.display = 'none';
      },
    );

    // Create the campaign editor (appends its own overlay to document.body)
    this.campaignEditor = new CampaignEditor(
      () => this._showLevelSelect(),              // onClose: return to level select
      (level) => this._campaign.playtestLevel(level), // onPlaytest: start the level in play mode
      (campaign) => this._campaign.activate(campaign), // onPlayCampaign: activate campaign for play
    );

    // Create the campaign manager and restore persisted campaign state
    const campaignCallbacks: CampaignCallbacks = {
      startLevel: (id) => this.startLevel(id),
      startLevelDef: (level) => this.startLevelDef(level),
      showLevelSelect: () => this._showLevelSelect(),
      exitToMenu: () => this.exitToMenu(),
      closeModal: (el) => {
        this._closeModal(el);
        // After a campaign modal is dismissed, the campaign manager may call
        // startLevel() synchronously in the same tick.  Use setTimeout so the
        // ring check runs after that second startLevel() completes.
        setTimeout(() => this._spawnPendingRingsIfReady(), 0);
      },
      triggerModalSparkle: (el, cls) => this._triggerModalSparkle(el, cls),
      setScreen: (s) => { this.screen = s; },
      setLevelSelectVisible: (v) => { this.levelSelectEl.style.display = v ? 'flex' : 'none'; },
      setPlayScreenVisible: (v) => { this.playScreenEl.style.display = v ? 'flex' : 'none'; },
      playLevelTransition: (minimapRect, chapterMapSnapshot, onComplete) => {
        if (!this.board) { onComplete(); return; }
        // Force-render the board so the game canvas has the level content.
        this._renderBoard();
        this._levelTransitionInProgress = true;
        playLevelTransition(
          minimapRect,
          this.canvas,
          this.board,
          chapterMapSnapshot,
          this.playScreenEl,
          () => {
            this._levelTransitionInProgress = false;
            onComplete();
            this._spawnPendingRingsIfReady();
          },
        );
      },
      levelHeaderEl: this.levelHeaderEl,
      levelListEl: this.levelListEl,
      winModalEl: this.winModalEl,
      winNextBtnEl: this.winNextBtnEl,
      exitBtnEl: this.exitBtnEl,
      gameoverMenuBtnEl: this.gameoverMenuBtnEl,
      completedLevels: this.completedLevels,
      showResetConfirmModal: () => { this.resetConfirmModalEl.style.display = 'flex'; },
      showRules: () => { this._rulesModalEl.style.display = 'flex'; },
      showSettings: () => {
        // Sync slider and value display to current volume before showing.
        const v = sfxManager.getVolume();
        const slider = this._settingsModalEl.querySelector<HTMLInputElement>('[data-sfx-slider]');
        const valueEl = this._settingsModalEl.querySelector<HTMLElement>('[data-sfx-value]');
        if (slider) slider.value = String(v);
        if (valueEl) valueEl.textContent = String(v);
        this._settingsModalEl.style.display = 'flex';
      },
    };
    this._campaign = new CampaignManager(campaignCallbacks, this.campaignEditor);
    this._campaign.restoreFromPersistence();

    // Create the input handler – registers all event listeners on canvas/window/document.
    this._input = new InputHandler(canvas, this);

    this._showLevelSelect();
    this._loop();
  }

  // ─── Screen transitions ───────────────────────────────────────────────────

  private _showLevelSelect(): void {
    // Cancel any pending intro-ring spawn before leaving the play screen.
    this._cancelPendingRings();
    // Stop any sounds still playing from the previous screen.
    sfxManager.stopAll();
    // Remember the last played level ID for the scroll below, then clear currentLevel
    // so that re-entering the same level via the level-select screen will be treated
    // as a new entry (showing the ring effect again).
    const scrollToLevelId = this.currentLevel?.id ?? null;
    this.currentLevel = null;

    this.screen = GameScreen.LevelSelect;
    this.levelSelectEl.style.display = 'flex';
    this.playScreenEl.style.display = 'none';
    // Hide the chapter map screen and reset campaign transient state.
    this._campaign.prepareForLevelSelect();
    // Explicitly hide all modal overlays so they cannot cover the level-select
    // screen when returning from a completed or failed level.
    this.winModalEl.style.display = 'none';
    this.gameoverModalEl.style.display = 'none';
    this._exitConfirmModalEl.style.display = 'none';
    this._unplayableModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    this._clearModalSparkle(this.gameoverModalEl);
    clearConfetti();
    clearStarSparkles();
    // Clear particle arrays so stale drops don't persist on the level-select screen.
    this._animMgr.clearAll();
    // Reset modal button labels in case they were changed for playtesting.
    this.winNextBtnEl.textContent = 'Continue';
    this.gameoverMenuBtnEl.textContent = 'Level Select';
    // Reset HUD exit button label in case it was changed for playtesting.
    this.exitBtnEl.textContent = '← Menu';
    this._campaign.renderLevelList();
    // Scroll the active level's row into view near the center of the viewport.
    if (scrollToLevelId !== null) {
      const levelRow = this.levelListEl.querySelector<HTMLElement>(`[data-level-id="${scrollToLevelId}"]`);
      if (levelRow) {
        levelRow.scrollIntoView?.({ behavior: 'instant', block: 'center' });
      }
    }
  }

  /**
   * Estimate the total vertical pixels consumed by UI elements that appear
   * alongside the grid while playing (page title, level header, HUD buttons,
   * play-screen gaps / padding, and any visible collapsed panels below the
   * grid).  The result is passed to {@link computeTileSize} so the grid fits
   * on screen together with all of these elements.
   */
  private _computePlayOverhead(level: LevelDef): number {
    const hasNote  = !!level.note;
    const hasHints = !!(level.hints?.length);

    let overhead = PLAY_TOP_PADDING + PLAY_LEVEL_HEADER_H + PLAY_GAP + PLAY_HUD_H + PLAY_GAP + PLAY_CANVAS_BORDER_H + PLAY_PADDING_BOTTOM;
    if (hasNote)  overhead += PLAY_NOTE_PANEL_H + PLAY_GAP;
    if (hasHints) overhead += PLAY_HINT_PANEL_H + PLAY_GAP;
    return overhead;
  }


  /**
   * Initialize all game state and UI for entering the play screen with the given level.
   * Assumes `this.board` has already been created and assigned for the level.
   * Initializes board history, resets interaction state, sizes the canvas,
   * switches to the play screen, hides all modal overlays, and clears all
   * visual effects leftover from any previous level.
   */
  private _enterPlayScreenState(level: LevelDef): void {
    this.board!.initHistory();
    this.gameState = GameState.Playing;
    this.focusPos = { ...this.board!.source };
    this.selectedShape = null;
    this.pendingRotation = 0;
    this._input.hoverRotationDelta = 0;

    setTileSize(computeTileSize(level.rows, level.cols, this._computePlayOverhead(level), PLAY_CANVAS_BORDER_W));
    this.canvas.width  = level.cols * TILE_SIZE;
    this.canvas.height = level.rows * TILE_SIZE;

    this.screen = GameScreen.Play;
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display  = 'flex';
    this._campaign.hideChapterMap();
    this.winModalEl.style.display         = 'none';
    this.gameoverModalEl.style.display    = 'none';
    this._campaign.hideCampaignModals();
    this._exitConfirmModalEl.style.display = 'none';
    this._unplayableModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    this._clearModalSparkle(this.gameoverModalEl);
    clearConfetti();
    clearStarSparkles();
    this._animMgr.clearRings();
    this._animMgr.clearAll();
    this._metrics.resetBaselines();
  }

  /**
   * Check for an invalid initial board state (e.g. pre-connected tiles with
   * negative water impact) and display an error flash and tile highlight if
   * one is found.  Call this once immediately after a level is loaded.
   */
  private _checkAndShowInitialError(): void {
    if (!this.board) return;
    const { error: initialError, positions } = this.board.checkInitialStateErrors();
    if (initialError) {
      this._showErrorFlash(initialError);
      if (positions && positions.length > 0) {
        this._startErrorHighlight(positions);
      }
    }
  }

  /** Start (or restart) the given level. */
  startLevel(levelId: number, existingDecorations?: readonly AmbientDecoration[], isUserRestart = false): void {
    // Look up the level in the active campaign; no-op if no campaign is active.
    if (!this._campaign.activeCampaign) return;
    let level: LevelDef | undefined;
    for (const ch of this._campaign.activeCampaign.chapters) {
      level = ch.levels.find((l) => l.id === levelId);
      if (level) break;
    }
    if (!level) return;

    // Determine whether this is the first time entering this level (not a restart
    // or the campaign manager's second startLevel call for the same level).
    const isNewLevel = !this.currentLevel || this.currentLevel.id !== levelId;

    if (isUserRestart) {
      // Explicit restart: cancel any ring spawning scheduled by a prior new-level entry.
      this._cancelPendingRings();
    } else if (isNewLevel) {
      // New level: schedule the intro ring effect.  It is deferred (setTimeout) so
      // that if a campaign modal (challenge / new-chapter) appears synchronously
      // after this call the ring check can detect and wait for it.
      this._schedulePendingRings();
    }
    // A campaign manager "second startLevel for same level" (e.g. from playChallengeLevel)
    // falls through without touching the pending rings state so the already-scheduled
    // check from the first startLevel call still fires correctly.

    this.currentLevel = level;
    this.board = new Board(level.rows, level.cols, level, existingDecorations);
    this._enterPlayScreenState(level);

    this._campaign.updateLevelHeader(levelId);
    this._refreshPlayUI();
    this._updateNoteHintBoxes(level);
    this._metrics.updateBestScore(levelId, this._campaign);
    this.canvas.focus();

    this._checkAndShowInitialError();

    // If the level starts already in a losing state, show the unplayable modal.
    if (this.board.getCurrentWater() <= 0) {
      this._showModalWithAnimation(this._unplayableModalEl, 'sparkle-red');
    }
  }

  // ─── Level-select rendering ───────────────────────────────────────────────
  // Delegated to CampaignManager. Private proxy kept for test backward compatibility.

  private _renderLevelList(): void { this._campaign.renderLevelList(); }
  private _updateNoteHintBoxes(level: LevelDef): void {
    // Note box
    if (level.note) {
      this.noteBoxEl.textContent = '\u2755  ' + level.note;
      this.noteBoxEl.style.display = 'block';
    } else {
      this.noteBoxEl.style.display = 'none';
    }

    // Hint box – always starts collapsed when a new level loads.
    // Supports multiple hints nested sequentially: Hint 2 is revealed inside Hint 1, etc.
    const hints = level.hints ?? [];

    this.hintBoxEl.innerHTML = '';
    if (hints.length === 0) {
      this.hintBoxEl.style.display = 'none';
      return;
    }

    this.hintBoxEl.style.display = 'block';

    // Build nested hint elements. Each hint has a toggle button and a content div.
    // Hints after the first are nested inside the previous hint's content div.
    let containerEl: HTMLElement = this.hintBoxEl;

    hints.forEach((hint, idx) => {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.textContent = idx === 0 ? '💡 Show Hint' : '💡 Show Next Hint';
      toggleBtn.style.cssText = HINT_TOGGLE_BTN_STYLE;

      const textEl = document.createElement('div');
      textEl.style.cssText = HINT_TEXT_STYLE;
      textEl.textContent = hint;

      toggleBtn.addEventListener('click', () => {
        const isHidden = textEl.style.display === 'none';
        textEl.style.display = isHidden ? 'block' : 'none';
        if (idx === 0) {
          toggleBtn.textContent = isHidden ? '💡 Hide Hint' : '💡 Show Hint';
        } else {
          toggleBtn.textContent = isHidden ? '💡 Hide Next Hint' : '💡 Show Next Hint';
        }
      });

      containerEl.appendChild(toggleBtn);
      containerEl.appendChild(textEl);
      // Next hint is nested inside this hint's text element
      containerEl = textEl;
    });
  }

  // ─── Inventory bar rendering ──────────────────────────────────────────────

  private _renderInventoryBar(): void {
    if (!this.board) return;
    this._metrics.renderInventoryBar(
      this.board,
      this.selectedShape,
      (shape, count) => this._input.handleInventoryClick(shape, count),
      () => this._input.handleInventoryRightClick(),
    );
  }

  // ─── Water display ────────────────────────────────────────────────────────

  /**
   * Refresh the three HUD elements that must stay in sync after every board mutation
   * or undo/redo: the inventory bar, the water/temp/pressure display, and the
   * undo/redo button enabled states.
   *
   * Call this instead of the three individual methods whenever all three need to be
   * updated together (which is the common case).
   */
  refreshUI(): void {
    this._refreshPlayUI();
  }

  private _refreshPlayUI(): void {
    this._renderInventoryBar();
    if (this.board) this._metrics.updateWaterDisplay(this.board);
    this._updateUndoRedoButtons();
  }

  // ─── Main render loop ──────────────────────────────────────────────────────

  private _loop(): void {
    if (this.screen === GameScreen.Play) {
      this._renderBoard();
      this._animMgr.tick(this.board, this.gameState);
      this._metrics.tickGoldenInventoryTwinkle();
    }
    requestAnimationFrame(() => this._loop());
  }

  private _renderBoard(): void {
    if (!this.board) return;
    const now = performance.now();
    const currentTemp = this.board.getCurrentTemperature();
    const currentPressure = this.board.getCurrentPressure();

    // Build per-frame animation overrides for the renderer.
    const rotationOverrides = this._animMgr.getRotationOverrides(now);
    const fillExclude = this._animMgr.getFillExclude(now);

    renderBoard(
      this.ctx,
      this.canvas,
      this.board,
      this.focusPos,
      this.selectedShape,
      this.pendingRotation,
      this._input.mouseCanvasPos,
      this._input.shiftHeld,
      currentTemp,
      currentPressure,
      this._errorHighlightKeys,
      this._input.hoverRotationDelta,
      rotationOverrides,
      fillExclude,
      () => this._animMgr.renderWinTileGlowsOverlay(now),
    );

    // Draw fill-animation overlays on top of the board (tiles rendered as dry above).
    this._animMgr.renderFillEffects(
      this.board,
      this.board.getCurrentWater(),
      this._input.shiftHeld,
      currentTemp,
      currentPressure,
      now,
    );
  }

  // ─── Win / game-over handling ─────────────────────────────────────────────

  /**
   * Position a modal overlay so its inner box appears near the bottom of the
   * viewport, avoiding coverage of the game board and win route.
   * Must be called *after* `display` has been set to `'flex'`.
   */
  private _positionModalBelowCanvas(modalEl: HTMLElement): void {
    // Reset any styles left over from a previous showing.
    modalEl.style.alignItems = '';
    modalEl.style.paddingTop = '';
    modalEl.style.paddingBottom = '';

    const MARGIN = 16;
    modalEl.style.alignItems = 'flex-end';
    modalEl.style.paddingBottom = `${MARGIN}px`;
  }

  /** Add a sparkle CSS animation to the .modal-box inside the given modal overlay. */
  private _triggerModalSparkle(modalEl: HTMLElement, colorClass: 'sparkle-gold' | 'sparkle-red' | 'sparkle-yellow' | 'sparkle-blue'): void {
    const box = modalEl.querySelector<HTMLElement>('.modal-box');
    if (!box) return;
    box.classList.remove('sparkle-gold', 'sparkle-red', 'sparkle-yellow', 'sparkle-blue');
    void box.offsetWidth; // force reflow so removing+re-adding restarts the animation
    box.classList.add(colorClass);
  }

  /**
   * Make a modal overlay visible with a fade-in animation, position it below
   * the canvas, and trigger the given sparkle color on its inner box.
   * Combines the three steps that always appear together for win/gameover modals.
   */
  private _showModalWithAnimation(
    modalEl: HTMLElement,
    sparkleClass: 'sparkle-gold' | 'sparkle-red' | 'sparkle-yellow' | 'sparkle-blue',
  ): void {
    modalEl.style.display = 'flex';
    modalEl.classList.remove('fade-in');
    void modalEl.offsetWidth; // force reflow to restart animation
    modalEl.classList.add('fade-in');
    this._positionModalBelowCanvas(modalEl);
    this._triggerModalSparkle(modalEl, sparkleClass);
  }

  /** Remove sparkle CSS animation classes from the .modal-box inside the given modal overlay. */
  private _clearModalSparkle(modalEl: HTMLElement): void {
    const box = modalEl.querySelector<HTMLElement>('.modal-box');
    if (box) box.classList.remove('sparkle-gold', 'sparkle-red', 'sparkle-yellow', 'sparkle-blue');
  }

  /**
   * Hide a modal overlay and clear its sparkle animation classes.
   * Use whenever a player action dismisses a modal – pairs the two cleanup steps
   * that must always happen together.
   */
  private _closeModal(modalEl: HTMLElement): void {
    modalEl.style.display = 'none';
    this._clearModalSparkle(modalEl);
  }

  // ─── Level-intro ring helpers ─────────────────────────────────────────────

  /**
   * Schedule a deferred check that will spawn the level-intro rings if no
   * campaign modal is blocking them.  Called when a new level starts.
   */
  private _schedulePendingRings(): void {
    this._pendingRings = true;
    if (this._pendingRingsTimerId !== null) clearTimeout(this._pendingRingsTimerId);
    this._pendingRingsTimerId = setTimeout(() => {
      this._pendingRingsTimerId = null;
      this._spawnPendingRingsIfReady();
    }, 0);
  }

  /** Cancel any scheduled or pending level-intro ring spawn (e.g. on explicit restart). */
  private _cancelPendingRings(): void {
    this._pendingRings = false;
    if (this._pendingRingsTimerId !== null) {
      clearTimeout(this._pendingRingsTimerId);
      this._pendingRingsTimerId = null;
    }
  }

  /**
   * Spawn the pending level-intro rings if no campaign modal is currently visible.
   * Called from the deferred timeout set in {@link _schedulePendingRings} and also
   * after a campaign modal (challenge / new-chapter) is dismissed.
   */
  private _spawnPendingRingsIfReady(): void {
    if (!this._pendingRings || !this.board) return;
    // Defer until the zoom transition finishes so rings don't appear mid-animation.
    if (this._levelTransitionInProgress) return;
    // Defer until campaign modals that block the view are dismissed.
    if (
      this._campaign._newChapterModalElInternal.style.display !== 'none' ||
      this._campaign._challengeModalElInternal.style.display !== 'none'
    ) return;
    this._pendingRings = false;
    this._animMgr.spawnLevelIntroRings(this.board);
  }

  /**
   * Check win/lose conditions after a player move and, if game-over was triggered,
   * discard the losing move from history so the player cannot redo into a lost state.
   * Call this at the end of every board-mutating player action.
   */
  private _checkWinLoseAfterMove(): void {
    if (!this.board) return;
    this._checkWinLose();
    if (this.gameState === GameState.GameOver) {
      this.board.discardLastMoveFromHistory();
      this._updateUndoRedoButtons();
    }
  }

  private _checkWinLose(): void {
    if (!this.board || this.gameState !== GameState.Playing) return;

    // Fail condition takes precedence: zero or negative water is always a loss, even if the sink was reached.
    if (this.board.getCurrentWater() <= 0) {
      this._showGameOver();
      return;
    }

    if (this.board.isSolved()) {
      this._showWin();
      return;
    }
  }

  /** Transition the game to the GameOver state and show the gameover modal. */
  private _showGameOver(): void {
    this.gameState = GameState.GameOver;
    this.gameoverMsgEl.textContent = 'The tank ran dry! Undo the last move, reset the level, or return to the menu.';
    sfxManager.play(SfxId.Dry);
    this._showModalWithAnimation(this.gameoverModalEl, 'sparkle-red');
  }

  /** Transition the game to the Won state and show the win modal after confetti. */
  private _showWin(): void {
    if (!this.board || !this.currentLevel) return;
    this.gameState = GameState.Won;
    this._animMgr.initWinFlow(this.board);
    this._animMgr.initWinTileGlows(this.board);
    const starsCollected = this.board.getStarsCollected();
    const waterRemaining = this.board.getCurrentWater();
    const isChallenge = !!this.currentLevel.challenge;
    this._campaign.markLevelCompleted(this.currentLevel.id);
    this._campaign.saveStars(this.currentLevel.id, starsCollected);
    // Load previous best before saving so we can detect a new personal record.
    // Skip the comparison during playtesting (data isn't persisted in that mode).
    let previousBest: number | undefined;
    if (!this._campaign.isPlaytesting) {
      previousBest = this._campaign.loadBestWater(this.currentLevel.id) ?? undefined;
    }
    this._campaign.saveWater(this.currentLevel.id, waterRemaining);
    // Show challenge skull icon on win modal when the completed level is a challenge level
    if (this.winChallengeEl) {
      if (isChallenge) {
        this.winChallengeEl.textContent = '💀 Challenge level completed!';
        this.winChallengeEl.style.display = 'block';
      } else {
        this.winChallengeEl.style.display = 'none';
      }
    }
    // Show water retained on win modal (always show since water is the core resource)
    if (this.winWaterEl) {
      const isNewBest = previousBest !== undefined && waterRemaining > previousBest;
      this.winWaterEl.textContent = `💧 ${waterRemaining} water retained${isNewBest ? ' (New Best!)' : ''}`;
      this.winWaterEl.style.display = 'block';
    }
    // Show star count on win modal when at least one star was connected
    if (this.winStarsEl) {
      if (starsCollected > 0) {
        this.winStarsEl.textContent = `⭐ × ${starsCollected}`;
        this.winStarsEl.style.display = 'block';
      } else {
        this.winStarsEl.style.display = 'none';
      }
    }
    // Play win sound immediately on winning, then spawn confetti and show modal.
    sfxManager.play(SfxId.WinLevel);
    spawnConfetti(() => {
      if (this.gameState !== GameState.Won) return;
      this._showModalWithAnimation(this.winModalEl, 'sparkle-gold');
      // Spawn golden sparkles over the star icon in the win modal when stars were collected,
      // and play the star sfx 0.5 s after the win-level sound.
      if (starsCollected > 0 && this.winStarsEl) {
        const winStarsEl = this.winStarsEl;
        setTimeout(() => {
          if (this.gameState !== GameState.Won) return;
          sfxManager.play(SfxId.Star);
          const rect = winStarsEl.getBoundingClientRect();
          spawnStarSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2, 30);
        }, STAR_SFX_DELAY_MS);
      }
    });
  }

  /**
   * Reclaims (removes) the tile at pos, records the move, and updates UI.
   * Shared by both single right-click and right-drag-erase.
   */
  reclaimTileAt(pos: GridPos): void {
    if (!this.board) return;
    const tileBeforeReclaim = this.board.grid[pos.row]?.[pos.col];
    const reclaimedShape = tileBeforeReclaim?.shape;
    const reclaimedRotation = tileBeforeReclaim?.rotation ?? 0;
    const hadNoSelection = this.selectedShape === null;
    const filledBefore = this.board.getFilledPositions();
    const result = this.board.reclaimTile(pos);
    if (result.success) {
      const reclaimedPosKey = `${pos.row},${pos.col}`;
      const filledAfterReclaim = this.board.getFilledPositions();
      const anyDisconnected = [...filledBefore].some(key => key !== reclaimedPosKey && !filledAfterReclaim.has(key));
      sfxManager.play(anyDisconnected ? SfxId.Disconnect : SfxId.Delete);
      this._animMgr.completeAnims();
      const changes = this.board.applyTurnDelta();
      this._playLeakSfxIfNeeded(this.board, changes);
      this._playGoldSfxIfNeeded(this.board, filledBefore);
      this.board.recordMove();
      const sparkle = this._metrics.sparkleCallbacks();
      this._animMgr.spawnDisconnectionAnimations(this.board, filledBefore, sparkle, tileBeforeReclaim, pos.row, pos.col);
      this._animMgr.spawnLockedCostChangeAnimations(changes);
      this._animMgr.spawnCementDecrementAnimation(result.cementDecrement);
      this._deselectIfDepleted();
      if (hadNoSelection && reclaimedShape !== undefined) {
        this.selectedShape = reclaimedShape;
        this.pendingRotation = reclaimedRotation;
      }
      this._refreshPlayUI();
      this._checkWinLoseAfterMove();
    } else if (result.error) {
      this.handleBoardError(result);
    }
  }

  /**
   * Called after successfully rotating any tile (spinner or regular pipe).
   * Records the move and updates animations.  The caller (InputHandler) is
   * responsible for invoking {@link refreshUI} and {@link checkWinLose} afterwards.
   *
   * @param filledBefore - Filled positions snapshot taken before the rotation.
   * @param rotationInfo - When provided, a pipe-rotation animation is spawned
   *   for the rotated tile from `oldRotation` to the tile's current rotation.
   *   Any subsequent fill animation is delayed until after the rotation completes.
   */
  afterTileRotated(
    filledBefore: Set<string>,
    result: MoveResult,
    rotationInfo?: { row: number; col: number; oldRotation: number },
  ): void {
    if (!this.board) return;
    // Play rotation sound based on the direction of rotation.
    if (rotationInfo) {
      const tile = this.board.getTile(rotationInfo);
      if (tile) {
        const delta = (tile.rotation - rotationInfo.oldRotation + 360) % 360;
        sfxManager.play(delta > 180 ? SfxId.RotateCCW : SfxId.RotateCW);
      } else {
        sfxManager.play(SfxId.RotateCW);
      }
    } else {
      sfxManager.play(SfxId.RotateCW);
    }
    this._animMgr.completeAnims();
    const changes = this.board.applyTurnDelta();
    this._playLeakSfxIfNeeded(this.board, changes);
    this._playGoldSfxIfNeeded(this.board, filledBefore);
    this._playAfterTileRotatedSfx(this.board, filledBefore);
    this.board.recordMove();
    let fillDelay = 0;
    if (rotationInfo) {
      const tile = this.board.getTile(rotationInfo);
      if (tile) {
        this._animMgr.spawnRotationAnim(
          rotationInfo.row, rotationInfo.col,
          rotationInfo.oldRotation, tile.rotation,
        );
        // Fill animations begin only after the rotation animation completes.
        fillDelay = ROTATION_ANIM_DURATION;
      }
    }
    const sparkle = this._metrics.sparkleCallbacks();
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, sparkle);
    this._animMgr.spawnDisconnectionAnimations(this.board, filledBefore, sparkle);
    this._animMgr.spawnFillAnims(this.board, filledBefore, fillDelay);
    this._animMgr.spawnLockedCostChangeAnimations(changes);
    this._animMgr.spawnCementDecrementAnimation(result.cementDecrement);
  }


  showTooltip(clientX: number, clientY: number): void {
    if (!this._input.mouseCanvasPos || !this.board) return;
    this._tooltip.show(clientX, clientY, this.board, this._input.mouseCanvasPos, this.screen);
  }

  hideTooltip(): void {
    this._tooltip.hide();
  }

  /** Show a brief error message that auto-dismisses after ~2 seconds. */
  private _showErrorFlash(message: string): void {
    this.errorFlashEl.textContent = message;
    this.errorFlashEl.style.display = 'block';
    if (this._errorFlashTimer !== null) clearTimeout(this._errorFlashTimer);
    this._errorFlashTimer = setTimeout(() => {
      this.errorFlashEl.style.display = 'none';
      this._errorFlashTimer = null;
    }, ERROR_DISPLAY_MS);
  }

  /**
   * Collect the SFX IDs to play for all chamber tiles that became newly
   * connected to the fill path since `filledBefore` was captured.
   *
   * Iterates over newly-connected tiles and collects one sfx per chamber type:
   * - Per-tile sounds: Tank, Heater, Pump, Sizzle, Star, NegativeCount (item).
   * - Single-per-turn sounds: one Ice (based on the highest raw ice cost) and
   *   one Snow (based on the highest raw snow cost), one Dirt (based on the
   *   highest dirt cost).
   */
  private _collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[] {
    const filledAfter = board.getFilledPositions();
    const currentTemp = board.getCurrentTemperature(filledAfter);
    const currentPressure = board.getCurrentPressure(filledAfter);

    let maxIceRaw = -1;
    let maxSnowRaw = -1;
    let maxDirtCost = -1;
    let hotPlateSfx: SfxId | null = null;

    const sfxToPlay: SfxId[] = [];

    for (const key of filledAfter) {
      if (filledBefore.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = board.grid[r]?.[c];
      if (tile?.shape !== PipeShape.Chamber) continue;

      if (tile.chamberContent === 'tank') {
        sfxToPlay.push(SfxId.Tank);
      } else if (tile.chamberContent === 'item' && tile.itemShape !== null) {
        if (tile.itemCount <= 0) sfxToPlay.push(SfxId.NegativeCount);
      } else if (tile.chamberContent === 'heater') {
        sfxToPlay.push(tile.temperature < 0 ? SfxId.Cooler : SfxId.Heater);
      } else if (tile.chamberContent === 'pump') {
        sfxToPlay.push(tile.pressure < 0 ? SfxId.Vacuum : SfxId.Pump);
      } else if (tile.chamberContent === 'hot_plate') {
        // Sizzle overrides SizzleIce; collect at most one hot-plate sound per turn.
        // Use getLockedHotPlateGain to check if frozen water was actually consumed
        // when this hot plate's cost was computed during applyTurnDelta this turn.
        const frozenGain = board.getLockedHotPlateGain({ row: r, col: c }) ?? 0;
        const candidate = frozenGain > 0 ? SfxId.SizzleIce : SfxId.Sizzle;
        if (candidate === SfxId.Sizzle || hotPlateSfx === null) hotPlateSfx = candidate;
      } else if (tile.chamberContent === 'star') {
        sfxToPlay.push(SfxId.Star);
      } else if (tile.chamberContent === 'ice') {
        const rawIceCost = tile.cost * computeDeltaTemp(tile.temperature, currentTemp);
        if (rawIceCost > maxIceRaw) maxIceRaw = rawIceCost;
      } else if (tile.chamberContent === 'snow') {
        // Snow cost is pressure-adjusted (unlike ice): snowCostPerDeltaTemp factors in
        // the current pressure, which reduces the effective cost per deltaTemp unit.
        const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
        const rawSnowCost = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
        if (rawSnowCost > maxSnowRaw) maxSnowRaw = rawSnowCost;
      } else if (tile.chamberContent === 'dirt') {
        if (tile.cost > maxDirtCost) maxDirtCost = tile.cost;
      }
    }

    // Collect a single hot-plate sfx per turn (Sizzle overrides SizzleIce).
    if (hotPlateSfx !== null) sfxToPlay.push(hotPlateSfx);

    // Collect a single ice sfx based on the highest-cost ice tile connected this turn.
    if (maxIceRaw >= 0) {
      if (maxIceRaw === 0) sfxToPlay.push(SfxId.Ice0);
      else if (maxIceRaw < ICE_SFX_THRESHOLD_MID) sfxToPlay.push(SfxId.Ice1);
      else if (maxIceRaw < ICE_SFX_THRESHOLD_HIGH) sfxToPlay.push(SfxId.Ice2);
      else sfxToPlay.push(SfxId.Ice3);
    }

    // Collect a single snow sfx based on the highest-cost snow tile connected this turn.
    if (maxSnowRaw >= 0) {
      if (maxSnowRaw === 0) sfxToPlay.push(SfxId.Snow0);
      else if (maxSnowRaw < SNOW_SFX_THRESHOLD_MID) sfxToPlay.push(SfxId.Snow1);
      else if (maxSnowRaw < SNOW_SFX_THRESHOLD_HIGH) sfxToPlay.push(SfxId.Snow2);
      else sfxToPlay.push(SfxId.Snow3);
    }

    // Collect a single dirt sfx based on the highest-cost dirt tile connected this turn.
    if (maxDirtCost >= 0) {
      if (maxDirtCost < DIRT_SFX_THRESHOLD_MID) sfxToPlay.push(SfxId.Dirt1);
      else if (maxDirtCost < DIRT_SFX_THRESHOLD_HIGH) sfxToPlay.push(SfxId.Dirt2);
      else sfxToPlay.push(SfxId.Dirt3);
    }

    return sfxToPlay;
  }

  /**
   * Play all SFX for a tile-placement action.
   *
   * - When a leaky pipe tile is placed and immediately connected to the source,
   *   plays only the Leak sound (suppresses PipePlacement and connection sounds).
   * - Otherwise plays PipeConnected when the placed tile is connected to the source
   *   (only when no chamber-connection sounds fire), or PipePlacement when it is not
   *   connected to the source (only when no chamber-connection sounds fire),
   *   Leak (if a leaky tile penalty was applied), Gold/Pickup (if applicable),
   *   and all chamber-connection sounds collected by {@link _collectConnectionSfx}.
   */
  private _playAfterTilePlacedSfx(
    board: Board,
    filledBefore: Set<string>,
    changes: Array<{ row: number; col: number; delta: number }>,
    placedIsLeakyAndConnected: boolean,
    placedPosKey: string | null,
  ): void {
    if (placedIsLeakyAndConnected) {
      sfxManager.play(SfxId.Leak);
      return;
    }
    const connectionSfx = this._collectConnectionSfx(board, filledBefore);
    // Only play PipePlacement/PipeConnected when no chamber-connection sounds fire this turn.
    if (connectionSfx.length === 0) {
      const filledAfter = board.getFilledPositions();
      const isConnected = placedPosKey !== null && filledAfter.has(placedPosKey);
      sfxManager.play(isConnected ? SfxId.PipeConnected : SfxId.PipePlacement);
    }
    this._playLeakSfxIfNeeded(board, changes);
    this._playGoldSfxIfNeeded(board, filledBefore);
    for (const sfx of connectionSfx) {
      sfxManager.play(sfx);
    }
  }

  /**
   * Play connection and disconnection SFX after a tile rotation.
   *
   * - Plays the chamber-specific connection sound for each newly connected chamber.
   * - Plays PipeConnected if any tile is newly connected and no chamber-specific sfx fired.
   * - Plays Disconnect if any previously filled position is no longer filled.
   */
  private _playAfterTileRotatedSfx(board: Board, filledBefore: Set<string>): void {
    const filledAfter = board.getFilledPositions();
    const connectionSfx = this._collectConnectionSfx(board, filledBefore);
    if (connectionSfx.length === 0) {
      let anyNewlyConnected = false;
      for (const key of filledAfter) {
        if (!filledBefore.has(key)) { anyNewlyConnected = true; break; }
      }
      if (anyNewlyConnected) sfxManager.play(SfxId.PipeConnected);
    }
    let anyDisconnected = false;
    for (const key of filledBefore) {
      if (!filledAfter.has(key)) { anyDisconnected = true; break; }
    }
    if (anyDisconnected) sfxManager.play(SfxId.Disconnect);
    for (const sfx of connectionSfx) {
      sfxManager.play(sfx);
    }
  }

  /**
   * Play the leak sound if any leaky-pipe penalty was applied in `changes`.
   * Called once per board action so the sound plays at most once per turn.
   */
  private _playLeakSfxIfNeeded(board: Board, changes: Array<{ row: number; col: number; delta: number }>): void {
    const hasLeak = changes.some(({ row, col }) =>
      LEAKY_PIPE_SHAPES.has(board.grid[row]?.[col]?.shape as PipeShape),
    );
    if (hasLeak) sfxManager.play(SfxId.Leak);
  }

  /**
   * Play the gold sound if any gold item chamber became newly connected since
   * `filledBefore` was captured.  If no gold item connected but a positive-count
   * non-gold item chamber did, play the pickup sound instead.
   * Gold takes precedence over pickup.
   */
  private _playGoldSfxIfNeeded(board: Board, filledBefore: Set<string>): void {
    const filledAfter = board.getFilledPositions();
    let hasPickup = false;
    for (const key of filledAfter) {
      if (filledBefore.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = board.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'item' &&
          tile.itemShape !== null) {
        if (GOLD_PIPE_SHAPES.has(tile.itemShape)) {
          sfxManager.play(SfxId.Gold);
          return;
        } else if (tile.itemCount > 0) {
          hasPickup = true;
        }
      }
    }
    if (hasPickup) sfxManager.play(SfxId.Pickup);
  }

  /**
   * Highlight the given tile positions with a pulsing red overlay for ~2 seconds.
   * Used to visually identify tiles that are blocking a move.
   */
  private _startErrorHighlight(positions: GridPos[]): void {
    this._errorHighlightKeys = new Set(positions.map((p) => `${p.row},${p.col}`));
    if (this._errorHighlightTimer !== null) clearTimeout(this._errorHighlightTimer);
    this._errorHighlightTimer = setTimeout(() => {
      this._errorHighlightKeys = new Set();
      this._errorHighlightTimer = null;
    }, ERROR_DISPLAY_MS);
  }

  /**
   * Show the error from a failed board operation as a flash message, and if
   * errorTilePositions is set, temporarily highlight those tiles.
   * Call this whenever a board operation fails.
   */
  handleBoardError(result: MoveResult): void {
    if (!result.error) return;
    this._showErrorFlash(result.error);
    if (result.errorTilePositions && result.errorTilePositions.length > 0) {
      this._startErrorHighlight(result.errorTilePositions);
    }
    if (result.error === ERR_GOLD_SPACE) {
      sfxManager.play(SfxId.Locked);
    }
  }


  /**
   * Deselects the current shape if the effective count of that shape
   * (base inventory + container bonuses) has dropped below 1.
   * Call this after any board mutation that may reduce available quantities.
   */
  private _deselectIfDepleted(): void {
    if (!this.board || this.selectedShape === null) return;
    const inv = this.board.inventory.find((it) => it.shape === this.selectedShape);
    const bonuses = this.board.getContainerBonuses();
    const effectiveCount = (inv?.count ?? 0) + (bonuses.get(this.selectedShape) ?? 0);
    if (effectiveCount < 1) {
      this.selectedShape = null;
    }
  }

  /**
   * Cycle to the next available (effective count > 0) inventory item.
   * Items with a zero or negative effective count are skipped entirely.
   * Mirrors the ordering used by renderInventoryBar(): base inventory first,
   * then bonus-only shapes from connected Chamber-item tiles.
   * Wraps around; if no items are available the selection is unchanged.
   */
  selectNextAvailableInventory(): void {
    if (!this.board) return;

    const bonuses = this.board.getContainerBonuses();

    // Build the ordered list of selectable shapes, exactly as rendered by the
    // inventory bar, so the visual order and the cycling order agree.
    // Shapes with a zero or negative effective count are skipped.
    const available: PipeShape[] = [];
    const seen = new Set<PipeShape>();

    for (const item of this.board.inventory) {
      seen.add(item.shape);
      const effectiveCount = item.count + (bonuses.get(item.shape) ?? 0);
      if (effectiveCount > 0) available.push(item.shape);
    }

    // Shapes that are only available via container bonuses (not in base inventory).
    for (const [bonusShape, bonusCount] of bonuses) {
      if (seen.has(bonusShape)) continue;
      if (bonusCount > 0) available.push(bonusShape);
    }

    if (available.length === 0) return;

    const currentIdx = this.selectedShape !== null ? available.indexOf(this.selectedShape) : -1;
    const nextShape = available[(currentIdx + 1) % available.length];

    this.selectedShape = nextShape;
    this.pendingRotation = this._input.lastPlacedRotations.get(nextShape) ?? 0;
    this._renderInventoryBar();
    this.canvas.focus();
  }

  /**
   * Post-placement bookkeeping shared by both place and replace actions.
   * Records the move, updates last-used rotation, deselects the shape when
   * inventory is exhausted, and refreshes all affected UI elements.
   */
  afterTilePlaced(
    placedShape: PipeShape,
    result: MoveResult,
    filledBefore: Set<string>,
    replacedTile?: Tile,
    replacedRow?: number,
    replacedCol?: number,
  ): void {
    if (!this.board) return;
    this._animMgr.completeAnims();
    const changes = this.board.applyTurnDelta();
    const posKey = (replacedRow !== undefined && replacedCol !== undefined)
      ? `${replacedRow},${replacedCol}` : null;
    const placedIsLeakyAndConnected = LEAKY_PIPE_SHAPES.has(placedShape)
      && posKey !== null && this.board.getFilledPositions().has(posKey);
    this.board.recordMove();
    const sparkle = this._metrics.sparkleCallbacks();

    // Spawn all animations.
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, sparkle);
    this._animMgr.spawnDisconnectionAnimations(this.board, filledBefore, sparkle, replacedTile, replacedRow, replacedCol);
    this._animMgr.spawnFillAnims(this.board, filledBefore);
    this._animMgr.spawnLockedCostChangeAnimations(changes);
    this._animMgr.spawnCementDecrementAnimation(result.cementDecrement);
    if (result.cementDecrement) sfxManager.play(SfxId.Cement);

    this._playAfterTilePlacedSfx(this.board, filledBefore, changes, placedIsLeakyAndConnected, posKey);

    this._input.lastPlacedRotations.set(placedShape, this.pendingRotation);
    this._deselectIfDepleted();
    this._refreshPlayUI();
    this._checkWinLoseAfterMove();
  }

  /**
   * Attempt to place or replace the currently selected inventory shape at `pos`.
   *
   * - If `currentTile` is empty, tries {@link Board.placeInventoryTile}.
   * - If `currentTile` differs in shape or rotation from the selection, tries
   *   {@link Board.replaceInventoryTile}.
   * - If the tile already matches the selected shape and rotation exactly, this
   *   is a no-op (returns `false`) so the caller can fall through to another
   *   action (e.g. rotation).
   *
   * On success, calls {@link afterTilePlaced} (which includes the cement-decrement
   * animation).  On board error, calls {@link handleBoardError}.
   *
   * @returns `true` when a board operation was attempted (whether it succeeded
   *   or failed with an error), `false` when the tile already matched (no-op).
   */
  tryPlaceOrReplace(
    pos: GridPos,
    currentTile: Tile,
    filledBefore: Set<string>,
  ): boolean {
    if (!this.board || this.selectedShape === null) return false;
    let replacedTile: Tile | undefined;
    let result: MoveResult;
    if (currentTile.shape === PipeShape.Empty) {
      result = this.board.placeInventoryTile(pos, this.selectedShape, this.pendingRotation);
    } else if (currentTile.shape !== this.selectedShape || currentTile.rotation !== this.pendingRotation) {
      replacedTile = currentTile;
      result = this.board.replaceInventoryTile(pos, this.selectedShape, this.pendingRotation);
    } else {
      return false; // tile already has the selected shape+rotation – no action
    }
    if (result.success) {
      this.afterTilePlaced(this.selectedShape, result, filledBefore, replacedTile, pos.row, pos.col);
    } else if (result.error) {
      this.handleBoardError(result);
    }
    return true; // a board operation was attempted
  }

  // ─── InputCallbacks implementation ────────────────────────────────────────

  getBoard(): Board | null { return this.board; }
  getGameState(): GameState { return this.gameState; }
  getScreen(): GameScreen { return this.screen; }
  getSelectedShape(): PipeShape | null { return this.selectedShape; }
  setSelectedShape(shape: PipeShape | null): void { this.selectedShape = shape; }
  getPendingRotation(): Rotation { return this.pendingRotation; }
  setPendingRotation(r: Rotation): void { this.pendingRotation = r; }
  getFocusPos(): GridPos { return this.focusPos; }
  setFocusPos(pos: GridPos): void { this.focusPos = pos; }

  renderInventoryBar(): void { this._renderInventoryBar(); }

  /** Flash a red "unavailable" sparkle on the given inventory item, then re-render. */
  flashInventoryItemError(shape: PipeShape): void {
    this._metrics.pendingRedSparkleShapes.add(shape);
    this._renderInventoryBar();
  }

  /**
   * Handle the Escape key: close the rules modal if open, toggle the exit-
   * confirm modal during play, or exit to the menu otherwise.
   */
  handleEscapeKey(): void {
    if (this._rulesModalEl.style.display !== 'none') {
      this._rulesModalEl.style.display = 'none';
      this.canvas.focus();
    } else if (this.screen === GameScreen.Play && this.gameState === GameState.Playing) {
      if (this._exitConfirmModalEl.style.display !== 'none') {
        this._exitConfirmModalEl.style.display = 'none';
        this.canvas.focus();
      } else {
        this._exitConfirmModalEl.style.display = 'flex';
      }
    } else {
      this.exitToMenu();
    }
  }

  checkWinLose(): void { this._checkWinLoseAfterMove(); }

  // ─── Public API called by main.ts button handlers ─────────────────────────

  /**
   * Retry the current level from scratch.
   * Preserves the undo history so the player can undo back to the state that
   * was in play before the restart (if there is any previous history).
   * Persists the ambient decorations from the previous board so the grid decor
   * does not change on restart.
   */
  retryLevel(): void {
    if (!this.currentLevel) return;
    sfxManager.stopAll();
    const prevBoard = this.board;
    const prevDecorations = prevBoard?.ambientDecorations;
    this.startLevel(this.currentLevel.id, prevDecorations, /* isUserRestart */ true);
    // Graft the pre-restart history onto the new board so Undo can revert to
    // the state the player was in before restarting.
    // Any losing-move snapshot will have already been removed by
    // discardLastMoveFromHistory(), so it will not appear in the grafted history.
    // Guard against the edge case where startLevel() returned early (level not
    // found) and this.board was not replaced with a new Board instance.
    if (prevBoard && this.board && this.board !== prevBoard) {
      this.board.graftPreRestartHistory(prevBoard);
      this._updateUndoRedoButtons();
    }
  }

  /** Advance to the next level in the campaign/chapter sequence. */
  nextLevel(): void {
    if (!this.currentLevel) return;
    this._campaign.nextLevelFrom(this.currentLevel.id);
  }

  /**
   * Request to start a level by ID, potentially showing a challenge-level warning
   * modal first (when the level is marked as a challenge).
   * Use this instead of `startLevel()` when navigating from the level-select screen.
   */
  requestLevel(levelId: number): void {
    this._campaign.requestLevel(levelId);
  }

  /**
   * Called when the player confirms the new-chapter modal ("Start Level" button).
   * Dismisses the chapter modal and either starts the pending level or shows the
   * challenge-level modal when the pending level is a challenge.
   */
  startChapterLevel(): void {
    this._campaign.startChapterLevel();
  }

  /**
   * Called when the player chooses to play the challenge level ("Play Level" button).
   * Dismisses the challenge modal and starts the pending level.
   */
  playChallengeLevel(): void {
    this._campaign.playChallengeLevel();
  }

  /**
   * Called when the player chooses to skip the challenge level ("Skip Level" button).
   * Dismisses the challenge modal and advances to the next level after the challenge.
   */
  skipChallengeLevel(): void {
    this._campaign.skipChallengeLevel();
  }

  /**
   * Undo the last (winning) move from the win modal and resume playing the level.
   * Dismisses the win modal and restores the board to the state before the winning move.
   */
  undoWinningMove(): void {
    if (!this.board || !this.board.canUndo()) return;
    const filledBefore = this.board.getFilledPositions();
    this.board.undoMove();
    this.gameState = GameState.Playing;
    this._closeModal(this.winModalEl);
    clearConfetti();
    clearStarSparkles();
    // Clear win-flow drops since we're no longer in a won state.
    this._animMgr.clearWinFlow();
    // Clear all fill animations (including the persistent sink entry) before
    // spawning fresh ones for the restored board state.
    this._animMgr.completeAnims();
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, this._metrics.sparkleCallbacks());
    this._finalizeHistoryJump();
  }

  /**
   * Finalize UI state after an undo, redo, or undo-win action:
   * deselect any exhausted inventory shape, reset metric sparkle baselines,
   * refresh the play HUD, and re-render the board.
   */
  private _finalizeHistoryJump(): void {
    this._deselectIfDepleted();
    this._metrics.resetBaselines();
    this._refreshPlayUI();
    this._renderBoard();
  }

  /**
   * Undo the last player action.
   * When called from the game-over modal, also dismisses the modal and resumes play.
   */
  performUndo(): void {
    if (!this.board) return;
    // In GameOver state, allow undo if canUndo() is true (normal case) or if the
    // failing move was the very first move and discardLastMoveFromHistory() was
    // already called, leaving _historyIndex at 0 with the initial snapshot available.
    if (this.gameState === GameState.GameOver) {
      if (!this.board.canRestoreAfterGameOver()) return;
    } else if (!this.board.canUndo()) {
      return;
    }
    this._animMgr.completeAnims();
    const turnBefore = this.board.turnNumber;
    const filledBefore = this.board.getFilledPositions();
    if (this.gameState === GameState.GameOver) {
      // discardLastMoveFromHistory() was already called when the fail was detected,
      // so _historyIndex already points to the pre-fail snapshot.  Just restore it
      // without decrementing the pointer further (which would skip an extra turn).
      this.board.restoreFromCurrentSnapshot();
    } else {
      this.board.undoMove();
    }
    // Play UndoBeforeRestart when undoing from turn 0 restores a prior play sequence
    // (turn count goes up), otherwise play the regular Undo sound.
    if (turnBefore === 0 && this.board.turnNumber > 0) {
      sfxManager.play(SfxId.UndoBeforeRestart);
    } else {
      sfxManager.play(SfxId.Undo);
    }
    this.gameState = GameState.Playing;
    this._closeModal(this.gameoverModalEl);
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, this._metrics.sparkleCallbacks());
    this._finalizeHistoryJump();
  }

  /** Redo the last undone player action. */
  performRedo(): void {
    if (!this.board || !this.board.canRedo()) return;
    sfxManager.play(SfxId.Redo);
    const filledBefore = this.board.getFilledPositions();
    this.board.redoMove();
    const sparkle = this._metrics.sparkleCallbacks();
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, sparkle);
    this._animMgr.spawnDisconnectionAnimations(this.board, filledBefore, sparkle);
    this._finalizeHistoryJump();
    this._checkWinLose();
  }

  /**
   * Undo the last player action and resume playing from the restored state.
   * Only meaningful when the game-over modal is showing and a snapshot exists.
   * @deprecated Use {@link performUndo} instead.
   */
  undoLastMove(): void {
    this.performUndo();
  }

  /** Exit to the level-selection screen. */
  exitToMenu(): void {
    if (this._campaign.isPlaytesting) {
      const cb = this._campaign.takePlaytestCallback()!;
      this._showLevelSelect();
      cb(); // re-open the campaign editor
    } else if (this._campaign.winFromChapterMap && this._campaign.chapterMapScreen?.chapter) {
      this._campaign.winFromChapterMap = false;
      this.winModalEl.style.display = 'none';
      this._exitConfirmModalEl.style.display = 'none';
      // Cancel any pending ring spawning before leaving the play screen.
      this._cancelPendingRings();
      // Stop any sounds still playing from the play screen.
      sfxManager.stopAll();

      // Pre-render the board snapshot at the current game TILE_SIZE BEFORE
      // reshowChapterMap() changes TILE_SIZE to the chapter-map tile size.
      let boardSnapshot: HTMLCanvasElement | null = null;
      if (this.board) {
        const offscreen = document.createElement('canvas');
        offscreen.width = this.board.cols * TILE_SIZE;
        offscreen.height = this.board.rows * TILE_SIZE;
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
          renderBoard(offCtx, offscreen, this.board, { ...this.board.source }, null, 0, null);
          boardSnapshot = offscreen;
        }
      }

      // Reshow the chapter map (restores chapter-map TILE_SIZE and renders the canvas).
      this._campaign.reshowChapterMap();
      this.screen = GameScreen.ChapterMap;

      // Compute the minimap screen rect for the current level (uses chapter-map TILE_SIZE).
      const chapterMapScreen = this._campaign.chapterMapScreen!;
      const minimapRect = this.currentLevel
        ? chapterMapScreen.getMinimapScreenRect(this.currentLevel)
        : null;

      if (minimapRect && boardSnapshot) {
        // Play zoom-out animation: level snapshot shrinks back to minimap position.
        chapterMapScreen.screenEl.style.opacity = '0';
        // Suppress scrollbar on the chapter map screen during the animation to
        // prevent a momentary layout shift if the map content exceeds the viewport.
        chapterMapScreen.screenEl.style.overflow = 'hidden';
        playLevelExitTransition(
          minimapRect,
          chapterMapScreen.screenEl,
          this.canvas,
          boardSnapshot,
          this.playScreenEl,
          () => {
            // Animation complete: hide the play screen and clean up.
            chapterMapScreen.screenEl.style.overflow = '';
            this.playScreenEl.style.display = 'none';
            this.currentLevel = null;
          },
        );
      } else {
        // No minimap or snapshot available – skip animation and switch immediately.
        this.levelSelectEl.style.display = 'none';
        this.playScreenEl.style.display = 'none';
        this.currentLevel = null;
      }
    } else {
      this._showLevelSelect();
    }
  }

  /** Show the game-rules modal overlay. */
  showRules(): void {
    this._rulesModalEl.style.display = 'flex';
  }

  // ─── Campaign Editor integration ──────────────────────────────────────────
  // Delegated to CampaignManager. Private proxy kept for test backward compatibility.

  private _openCampaignEditor(): void { this._campaign.openCampaignEditor(); }
  private _playtestLevel(level: LevelDef): void { this._campaign.playtestLevel(level); }

  /**
   * Start any given LevelDef in play mode.
   * Similar to {@link startLevel} but accepts a LevelDef directly instead of a level ID.
   */
  startLevelDef(level: LevelDef): void {
    this.currentLevel = level;
    this.board = new Board(level.rows, level.cols, level);
    this._enterPlayScreenState(level);
    this._campaign.currentChapterId = 0;
    this.levelHeaderEl.innerHTML = '';
    const ptLine1 = document.createElement('div');
    ptLine1.style.cssText = 'font-size:0.9rem;color:#aaa;';
    ptLine1.textContent = '▶ Playtesting';
    this.levelHeaderEl.appendChild(ptLine1);
    const ptLine2 = document.createElement('div');
    ptLine2.style.cssText = 'font-size:1rem;color:#f0c040;';
    ptLine2.textContent = level.name;
    this.levelHeaderEl.appendChild(ptLine2);
    this._refreshPlayUI();
    this._updateNoteHintBoxes(level);
    this._metrics.hideBestScore();
    this.canvas.focus();

    this._checkAndShowInitialError();
    this._animMgr.spawnLevelIntroRings(this.board);
  }

  // ─── Undo / redo button state ─────────────────────────────────────────────

  /** Enable or disable the undo/redo HUD buttons based on current history state. */
  private _updateUndoRedoButtons(): void {
    const canUndo = !!(this.board?.canUndo());
    const canRedo = !!(this.board?.canRedo());
    this.undoBtnEl.disabled = !canUndo;
    this.redoBtnEl.disabled = !canRedo;
  }

  // ─── Campaign management delegates ────────────────────────────────────────
  // Private delegates kept for test backward compatibility (tests access these
  // via `game as unknown as GameTestHooks`).

  private _markLevelCompleted(levelId: number): void { this._campaign.markLevelCompleted(levelId); }
  private _saveStars(levelId: number, count: number): void { this._campaign.saveStars(levelId, count); }
  private _saveWater(levelId: number, water: number): void { this._campaign.saveWater(levelId, water); }
  private _resetProgress(): void { this._campaign.resetProgress(); }
  private _unlockAll(): void { this._campaign.unlockAll(); }
  private _activateCampaign(campaign: CampaignDef): void { this._campaign.activate(campaign); }
  private _deactivateCampaign(): void { this._campaign.deactivate(); }

}

// Re-export for backward compatibility with tests that import InventoryItem via game.ts
export type { InventoryItem, LevelDef };
