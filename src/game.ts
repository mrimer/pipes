import type { MoveResult} from './board';
import { Board, ERR_GOLD_SPACE, ERR_SANDSTONE_TOO_HARD, ERR_REGULATOR_CHECK, parseKey, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors, isEmptyFloor } from './board';
import type { Tile } from './tile';
import type { GridPos, InventoryItem, LevelDef, CampaignDef, Rotation, AmbientDecoration, PlaySequenceRecord } from './types';
import { GameScreen, GameState, PipeShape } from './types';
import type { InputCallbacks} from './inputHandler';
import { InputHandler } from './inputHandler';
import { TILE_SIZE, renderBoard, setTileSize, computeTileSize, getInventoryItemDisplayName } from './renderer';
import {
  loadPlayerName,
  loadSfxVolume,
  loadMusicVolume,
  loadTouchUiEnabled,
  saveSfxVolume,
  saveMusicVolume,
  saveTouchUiEnabled,
  loadRecordingsForLevel,
  saveRecording,
  deleteRecording,
  loadRecordingSettings,
  saveRecordingSettings,
  loadBackgroundEnabled,
  saveBackgroundEnabled,
  loadEnvironmentalEnabled,
  saveEnvironmentalEnabled,
  loadMusicMuteOnFocusLoss,
  saveMusicMuteOnFocusLoss,
  savePartialProgressEntry,
  deletePartialProgress,
  getPartialProgressFor,
  getMostRecentPartialProgress,
  loadSaveNoticeSuppressed,
  saveSaveNoticeSuppressed,
} from './persistence';
import { createGameRulesModal, refreshGameRulesModalCommands } from './rulesModal';
import { createCreditsModal } from './creditsModal';
import { CampaignEditor } from './campaignEditor';
import type { CampaignCallbacks } from './campaignManager';
import { CampaignManager } from './campaignManager';
import { spawnConfetti, clearConfetti } from './visuals/confetti';
import { spawnStarSparkles, clearStarSparkles } from './visuals/starSparkle';
import { ROTATION_ANIM_DURATION } from './visuals/pipeEffects';
import type { ResetProgressInfo} from './gameModals';
import {
  buildResetModal,
  buildSaveProgressNoticeModal, buildUnplayableModal,
  buildSettingsModal,
} from './gameModals';
import type { RecordModalInfo} from './recordingModals';
import {
  buildRecordModal,
  buildPlaybackListModal,
  showReplayImportSuccessModal,
} from './recordingModals';
import { AnimationManager } from './animationManager';
import { PLACE_EFFECT_DURATION } from './visuals/placementEffects';
import { TooltipManager } from './tooltipManager';
import { MetricsDisplay } from './metricsDisplay';
import { playLevelTransition, playLevelExitTransition } from './levelTransition';
import { sfxManager, SfxId } from './sfxManager';
import { musicManager, selectGroupForContext } from './musicManager';
import { hasTouchUiSupport, isPortrait, isTouchDevice, setTouchUiEnabledOverride } from './deviceUtils';
import { ERROR_COLOR, ERROR_DARK, RADIUS_MD, UI_BG, UI_BORDER, UI_GOLD, UI_OVERLAY_BG, UI_TEXT } from './uiConstants';
import { showTimedMessage } from './uiHelpers';
import { encodePlaceMove, encodeRotateMove, encodeDeleteMove } from './moveRecorder';
import type { PlaybackCallbacks, MoveAnimationInfo } from './playbackScreen';
import { PlaybackScreen } from './playbackScreen';
import { exportReplay, importReplay } from './profileIO';
import { getActiveSlotIndex, setActiveSlotIndex } from './activeProfile';
import { loadSlotMeta, saveActiveSlotIndex } from './playerProfileSlots';
import { PlayerProfileScreen } from './playerProfileScreen';
import { applyScrollingPipeBackground, setGlobalBackgroundPatternEnabled, unregisterScrollingPipeBackground } from './uiBackground';
import { isEnvironmentalEnabled, setEnvironmentalEnabled } from './graphicsSettings';
import { CloudShadowField } from './visuals/cloudShadows';
import { FireflyField } from './visuals/fireflyField';
import { ButterflyField } from './visuals/butterflyField';
import { hasDuplicateAutoRecording } from './autoRecording';
import { t } from './i18n';
import { ResumePlayer } from './resumePlayer';

/** How long (ms) error flash messages and tile error highlights are displayed. */
const ERROR_DISPLAY_MS = 3000;
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
/** Sandstone-sfx threshold: sandstone cost above this uses Sandstone2 sfx (instead of Sandstone1). */
const SANDSTONE_SFX_THRESHOLD_MID = 5;
/** Sandstone-sfx threshold: sandstone cost above this uses Sandstone3 sfx (instead of Sandstone2). */
const SANDSTONE_SFX_THRESHOLD_HIGH = 10;

/** CSS style for the toggle button of each hint in the hint box. */
const HINT_TOGGLE_BTN_STYLE =
  'width:100%;padding:10px 16px;font-size:0.9rem;background:#1a1400;color:#f0c040;' +
  'border:none;cursor:pointer;text-align:left;font-family:inherit;';

/** CSS style for the collapsible text area of each hint in the hint box. */
const HINT_TEXT_STYLE =
  `display:none;padding:12px 16px;font-size:0.9rem;color:${UI_TEXT};background:${UI_BG};`;

/** CSS style for the note box shown beneath the grid when a level has a note. */
const NOTE_BOX_CSS =
  `display:none;background:${UI_BG};border:1px solid ${UI_BORDER};border-radius:${RADIUS_MD};` +
  'padding:12px 16px;font-size:0.9rem;color:#eee;max-width:600px;width:100%;box-sizing:border-box;';

/** CSS style for the collapsible hint box shown beneath the grid when a level has hints. */
const HINT_BOX_CSS =
  `display:none;border:1px solid ${UI_GOLD};border-radius:${RADIUS_MD};` +
  'max-width:600px;width:100%;box-sizing:border-box;overflow:hidden;';

/** CSS style for the brief error-flash message shown when an action is blocked. */
const ERROR_FLASH_CSS =
  'display:none;position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
  'background:' + ERROR_DARK + ';color:#fff;border:2px solid ' + ERROR_COLOR + ';' +
  `border-radius:${RADIUS_MD};padding:8px 18px;font-size:0.95rem;pointer-events:none;z-index:60;` +
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
/** Estimated height (px) of the note panel: 12 px padding × 2 + two text lines (worst-case wrapping). */
const PLAY_NOTE_PANEL_H = 64;
/** Estimated height (px) of the collapsed hint panel: toggle-button 10 px padding × 2 + font + border. */
const PLAY_HINT_PANEL_H = 42;
/** Vertical border height (px) added by the 3 px CSS border on #game-canvas (3 px × 2 sides). */
const PLAY_CANVAS_BORDER_H = 6;
/** Horizontal border width (px) added by the 3 px CSS border on #game-canvas (3 px × 2 sides). */
const PLAY_CANVAS_BORDER_W = 6;
/**
 * Estimated height (px) of the right panel (stats + inventory) when it is
 * stacked below the canvas in portrait/narrow layout.
 * Covers: inventory bar (~72 px) + stats box (~60 px) + gap between them.
 */
const PLAY_RIGHT_PANEL_STACKED_H = 150;

/**
 * Manages the game loop, rendering, and user input for the Pipes puzzle.
 * Handles both the level-selection menu and the active play screen.
 */
export class Game implements InputCallbacks {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  /** Input handler that owns all event listeners and input state. */
  private readonly _input: InputHandler;
  /** Window resize handler stored for proper listener cleanup on destroy. */
  private _resizeHandler!: () => void;
  /** Debounce timer for resize handling. */
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;
  /** RAF id for the main render loop. */
  private _renderRafId: number | null = null;
  /** True after destroy() is called to stop async callbacks. */
  private _destroyed = false;

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

  /** Manages the playback screen (replaying saved move sequences). */
  private _playbackScreen!: PlaybackScreen;

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

  /** Active resume-player driver, or null when no resume is in progress. */
  private _resumePlayer: ResumePlayer | null = null;

  /** Set of "row,col" keys for sandstone tiles currently highlighted due to a validation error. */
  private _errorHighlightKeys: Set<string> = new Set();
  /** Timer ID for clearing the sandstone highlight. */
  private _errorHighlightTimer: ReturnType<typeof setTimeout> | null = null;

  /** Modal overlay showing game rules and tile legend. */
  private readonly _rulesModalEl: HTMLElement;
  /** Modal overlay showing the game credits. */
  private readonly _creditsModalEl: HTMLElement;

  /** Campaign editor overlay (manages its own DOM). */
  private readonly campaignEditor: CampaignEditor;

  /** Manages campaign lifecycle, chapter map, modals, and campaign persistence. */
  private readonly _campaign: CampaignManager;

  /** Manages all canvas-based visual effects (particles, fill/rotation animations, labels, rings). */
  private readonly _animMgr: AnimationManager;
  /** Procedural ambient cloud-shadow overlay rendered above board visuals. */
  private readonly _cloudShadows = new CloudShadowField();
  /** Dark-level ambient fireflies rendered above tile visuals. */
  private readonly _fireflies = new FireflyField();
  /** Summer-level ambient butterflies rendered above tile visuals. */
  private readonly _butterflies = new ButterflyField();

  /** Manages the play-screen HUD metrics, inventory bar, and best-score box. */
  private readonly _metrics: MetricsDisplay;

  /** Box shown beneath the grid with level notes (when the level has a note). */
  private readonly noteBoxEl: HTMLElement;

  /** Collapsible box shown beneath the grid with the level hints (when the level has hints). */
  private readonly hintBoxEl: HTMLElement;

  /** Modal overlay for confirming a progress reset. */
  private readonly resetConfirmModalEl: HTMLElement;
  /** Updater function for the reset-progress confirmation modal content. */
  private readonly _updateResetModalInfo: (info: ResetProgressInfo | null) => void;

  /** Modal overlay shown when the player exits a level mid-game (save-progress notice). */
  private readonly _exitConfirmModalEl: HTMLElement;

  /** Modal overlay shown when a level starts in an already-lost state (unplayable). */
  private readonly _unplayableModalEl: HTMLElement;

  /** Modal overlay for the game settings (SFX volume, etc.). */
  private readonly _settingsModalEl: HTMLElement;

  /** Player profile selection screen overlay. */
  private readonly _profileScreen: PlayerProfileScreen;

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- win-next-btn is always present in the win modal HTML
    this.winNextBtnEl = winModalEl.querySelector<HTMLButtonElement>('#win-next-btn')!;
    this.winChallengeEl = winModalEl.querySelector<HTMLElement>('#win-challenge');
    this.winWaterEl = winModalEl.querySelector<HTMLElement>('#win-water');
    this.winStarsEl = winModalEl.querySelector<HTMLElement>('#win-stars');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- gameover-menu-btn is always present in the gameover modal HTML
    this.gameoverMenuBtnEl = gameoverModalEl.querySelector<HTMLButtonElement>('#gameover-menu-btn')!;

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

    // Create the error-flash element for brief action-blocked messages.
    // role="status" makes flashed error text announced by screen readers.
    this.errorFlashEl = document.createElement('div');
    this.errorFlashEl.setAttribute('role', 'status');
    this.errorFlashEl.style.cssText = ERROR_FLASH_CSS;
    document.body.appendChild(this.errorFlashEl);

    // Create the reset-progress confirmation modal
    const resetModal = buildResetModal(
      () => { this._campaign.resetProgress(); this._closeModal(this.resetConfirmModalEl); },
      () => { this._closeModal(this.resetConfirmModalEl); },
    );
    this.resetConfirmModalEl = resetModal.el;
    this._updateResetModalInfo = resetModal.updateInfo;

    // Create the game-rules modal (appends itself to document.body)
    this._rulesModalEl = createGameRulesModal();
    this._creditsModalEl = createCreditsModal();

    // Create the save-progress notice modal (shown when the player exits a level mid-game)
    this._exitConfirmModalEl = buildSaveProgressNoticeModal(
      (dontShowAgain) => {
        if (dontShowAgain) saveSaveNoticeSuppressed(true);
        this._closeModal(this._exitConfirmModalEl);
        this.exitToMenu();
      },
    );

    // Create the unplayable-level modal (shown when a level starts already lost)
    this._unplayableModalEl = buildUnplayableModal(
      () => { this._closeModal(this._unplayableModalEl); this.exitToMenu(); },
    );

    // Create the settings modal (SFX/music volume control, etc.)
    this._settingsModalEl = buildSettingsModal(
      () => sfxManager.getVolume(),
      (v) => { sfxManager.setVolume(v); },
      () => { sfxManager.play(SfxId.PipePlacement); },
      () => musicManager.getVolume(),
      (v) => {
        const wasMuted = musicManager.getVolume() === 0;
        musicManager.setVolume(v);
        // Start playing the menu track when the player raises volume from 0.
        if (wasMuted && v > 0) musicManager.playGroup('menu');
      },
      () => { /* no audio ping for music preview */ },
      () => isTouchDevice(),
      () => hasTouchUiSupport(),
      (enabled) => {
        setTouchUiEnabledOverride(enabled);
        document.body.classList.toggle('is-touch', enabled);
      },
      (el) => {
        const recordSuccessesToggle = el.querySelector<HTMLInputElement>('[data-record-successes]');
        const recordFailuresToggle  = el.querySelector<HTMLInputElement>('[data-record-failures]');
        const bgToggle  = el.querySelector<HTMLInputElement>('[data-graphics-background]');
        const envToggle = el.querySelector<HTMLInputElement>('[data-graphics-environmental]');
        const muteOnFocusLossToggle = el.querySelector<HTMLInputElement>('[data-music-mute-on-focus-loss]');
        sfxManager.play(SfxId.Click);
        saveSfxVolume(sfxManager.getVolume());
        saveMusicVolume(musicManager.getVolume());
        saveTouchUiEnabled(isTouchDevice());
        saveRecordingSettings({
          recordSuccesses: recordSuccessesToggle?.checked ?? true,
          recordFailures:  recordFailuresToggle?.checked  ?? false,
        });
        saveBackgroundEnabled(bgToggle?.checked ?? true);
        saveEnvironmentalEnabled(envToggle?.checked ?? true);
        saveMusicMuteOnFocusLoss(muteOnFocusLossToggle?.checked ?? true);
        el.style.display = 'none';
      },
      () => loadRecordingSettings(),
      // Graphics: initial values loaded from persistence
      loadBackgroundEnabled(),
      // live background toggle: update in-memory flag and all registered backgrounds immediately
      (enabled) => {
        setGlobalBackgroundPatternEnabled(enabled);
      },
      loadEnvironmentalEnabled(),
      // live environmental toggle: update in-memory flag immediately
      (enabled) => { setEnvironmentalEnabled(enabled); },
      // Esc cancels: revert live changes and hide modal
      () => { this._cancelSettingsModal(); },
      // Mute on focus loss: initial value and live toggle
      loadMusicMuteOnFocusLoss(),
      (enabled) => { musicManager.setMuteOnFocusLoss(enabled); },
    );
    applyScrollingPipeBackground(this._settingsModalEl, {
      baseColor: UI_OVERLAY_BG,
      overlayAlpha: 0.84,
    });

    // Create the campaign editor (appends its own overlay to document.body)
    this.campaignEditor = new CampaignEditor(
      () => this._showLevelSelect(false),             // onClose: return to level select (no stopAll – no game audio playing in editor)
      (level) => this._campaign.playtestLevel(level), // onPlaytest: start the level in play mode
      (campaign) => this._campaign.activate(campaign), // onPlayCampaign: activate campaign for play
    );

    // Create the player-profile selection screen (appends itself to document.body).
    this._profileScreen = new PlayerProfileScreen();
    this._profileScreen.onProfileSelected = (slotIndex) => {
      // Update settings that depend on the newly active slot.
      // These load* calls are slot-prefixed in persistence.ts, so activate the
      // selected slot first to read the correct profile's settings.
      setActiveSlotIndex(slotIndex);
      const backgroundEnabled = loadBackgroundEnabled();
      const environmentalEnabled = loadEnvironmentalEnabled();
      sfxManager.setVolume(loadSfxVolume());
      musicManager.setVolume(loadMusicVolume());
      musicManager.setMuteOnFocusLoss(loadMusicMuteOnFocusLoss());
      setGlobalBackgroundPatternEnabled(backgroundEnabled);
      setEnvironmentalEnabled(environmentalEnabled);
      saveActiveSlotIndex(slotIndex);
      // Restore the active campaign from the new slot's persisted state, then
      // show the level-select screen.
      this._campaign.restoreFromPersistence();
      this._showLevelSelect(false);
    };
    this._profileScreen.onReturnToMenu = () => {
      this._showLevelSelect(false);
    };

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
      levelSelectEl: this.levelSelectEl,
      levelHeaderEl: this.levelHeaderEl,
      levelListEl: this.levelListEl,
      winModalEl: this.winModalEl,
      winNextBtnEl: this.winNextBtnEl,
      exitBtnEl: this.exitBtnEl,
      gameoverMenuBtnEl: this.gameoverMenuBtnEl,
      showResetConfirmModal: (info) => {
        this._updateResetModalInfo(info);
        this.resetConfirmModalEl.style.display = 'flex';
      },
      showRules: () => this.showRules(),
      showCredits: () => this.showCredits(),
      showSettings: () => {
        // Sync slider, toggles to current persisted values before showing.
        const v = sfxManager.getVolume();
        const mv = musicManager.getVolume();
        const savedTouchUiEnabled = loadTouchUiEnabled();
        const effectiveTouchEnabled = hasTouchUiSupport() ? (savedTouchUiEnabled ?? isTouchDevice()) : false;
        const slider = this._settingsModalEl.querySelector<HTMLInputElement>('[data-sfx-slider]');
        const valueEl = this._settingsModalEl.querySelector<HTMLElement>('[data-sfx-value]');
        const musicSlider = this._settingsModalEl.querySelector<HTMLInputElement>('[data-music-slider]');
        const musicValueEl = this._settingsModalEl.querySelector<HTMLElement>('[data-music-value]');
        const touchToggle = this._settingsModalEl.querySelector<HTMLInputElement>('[data-touch-ui-toggle]');
        const bgToggle  = this._settingsModalEl.querySelector<HTMLInputElement>('[data-graphics-background]');
        const envToggle = this._settingsModalEl.querySelector<HTMLInputElement>('[data-graphics-environmental]');
        const muteOnFocusLossToggle = this._settingsModalEl.querySelector<HTMLInputElement>('[data-music-mute-on-focus-loss]');
        if (slider) slider.value = String(v);
        if (valueEl) valueEl.textContent = String(v);
        if (musicSlider) musicSlider.value = String(mv);
        if (musicValueEl) musicValueEl.textContent = String(mv);
        if (touchToggle) {
          touchToggle.checked = effectiveTouchEnabled;
          touchToggle.disabled = !hasTouchUiSupport();
        }
        if (bgToggle)  bgToggle.checked  = loadBackgroundEnabled();
        if (envToggle) envToggle.checked = loadEnvironmentalEnabled();
        if (muteOnFocusLossToggle) muteOnFocusLossToggle.checked = loadMusicMuteOnFocusLoss();
        this._settingsModalEl.style.display = 'flex';
      },
      showPlayerProfile: () => this._showPlayerProfileScreen(),
      getPlayerName: () => {
        const idx = getActiveSlotIndex();
        return idx !== null ? (loadSlotMeta(idx)?.name ?? null) : null;
      },
      getPartialLevelId: () => {
        const recent = getMostRecentPartialProgress();
        if (!recent) return null;
        // Only surface partials that belong to the currently active campaign.
        if (this._campaign.activeCampaign && recent.campaignId !== this._campaign.activeCampaign.id) {
          return null;
        }
        return recent.levelId;
      },
      startLevelFromPartial: (levelId: number) => {
        this._campaign.startLevelFromMainMenuPartial(levelId);
      },
      onMapScreenEntered: (style, isCampaignMap) => {
        musicManager.playGroup(selectGroupForContext({ style, isCampaignMap }));
      },
    };
    this._campaign = new CampaignManager(campaignCallbacks, this.campaignEditor);
    this._campaign.restoreFromPersistence();

    // Create the input handler – registers all event listeners on canvas/window/document.
    this._input = new InputHandler(canvas, this);

    // Re-layout on orientation change / window resize (debounced at 100 ms).
    this._resizeHandler = () => {
      if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null;
        this._handleResize();
      }, 100);
    };
    window.addEventListener('resize', this._resizeHandler);

    // Initialize music volume and focus-loss mute setting from persistence.
    musicManager.setVolume(loadMusicVolume());
    musicManager.setMuteOnFocusLoss(loadMusicMuteOnFocusLoss());

    // Show the level-select screen or, if no profile slot is active, show the
    // profile screen so the player can choose or create a profile first.
    if (getActiveSlotIndex() !== null) {
      this._showLevelSelect(false);
    } else {
      this._showPlayerProfileScreen();
    }
    this._loop();

    // Wire the recording HUD buttons
    const recordBtn = document.getElementById('record-btn') as HTMLButtonElement | null;
    const playbackBtn = document.getElementById('playback-btn') as HTMLButtonElement | null;
    if (recordBtn) {
      recordBtn.addEventListener('click', () => this._openRecordModal());
    }
    if (playbackBtn) {
      playbackBtn.addEventListener('click', () => this._openPlaybackListModal());
    }

    // Initialize the playback screen controller.
    const playbackCbs: PlaybackCallbacks = {
      getBoard: () => this.board,
      getGameState: () => this.gameState,
      setBoard: (b) => { this.board = b; },
      setGameState: (s) => { this.gameState = s; },
      setScreen: (s) => { this.screen = s; },
      refreshUI: () => this._refreshPlayUI(),
      canvas: this.canvas,
      hudEl: document.getElementById('hud') as HTMLElement,
      errorFlashEl: this.errorFlashEl,
      levelHeaderEl: this.levelHeaderEl,
      spawnMoveAnimations: (board, info: MoveAnimationInfo) => {
        this._animMgr.completeAnims();
        this._animMgr.resetIdleTimer();
        const sparkle = this._metrics.sparkleCallbacks();
        if (info.rotationInfo) {
          const tile = board.getTile(info.rotationInfo);
          this._animMgr.spawnRotationAnim(
            info.rotationInfo.row, info.rotationInfo.col,
            info.rotationInfo.oldRotation,
            tile?.rotation ?? info.rotationInfo.oldRotation,
          );
        }
        this._animMgr.spawnConnectionAnimations(board, info.filledBefore, sparkle);
        if (info.decodedMove.type === 'delete') {
          this._animMgr.spawnDisconnectionAnimations(
            board, info.filledBefore, sparkle,
            info.reclaimedTile, info.decodedMove.row, info.decodedMove.col,
            info.lockedWaterImpactBefore, info.lockedHotPlateGainBefore,
          );
        } else {
          this._animMgr.spawnDisconnectionAnimations(
            board, info.filledBefore, sparkle, undefined, undefined, undefined,
            info.lockedWaterImpactBefore, info.lockedHotPlateGainBefore,
          );
        }
        const fillDelay = info.rotationInfo ? ROTATION_ANIM_DURATION : 0;
        this._animMgr.spawnFillAnims(board, info.filledBefore, fillDelay);
        this._animMgr.spawnLockedCostChangeAnimations(info.turnChanges);
        this._animMgr.spawnCementDecrementAnimation(info.moveResult.cementDecrement);
        this._refreshPlayUI();
      },
      resetMetricBaselines: () => this._metrics.resetBaselines(),
    };
    this._playbackScreen = new PlaybackScreen(playbackCbs);
  }

  // ─── Screen transitions ───────────────────────────────────────────────────

  private _showLevelSelect(stopAudio = true, keepMusicGroup = false): void {
    // Cancel any pending intro-ring spawn before leaving the play screen.
    this._cancelPendingRings();
    // Stop any in-flight resume-replay driver: exiting to the menu keeps the
    // board and leaves gameState === Playing, so its _tick guard would not stop
    // it and it would otherwise keep ticking against an off-screen board.
    this._resumePlayer?.cancel();
    this._resumePlayer = null;
    // Stop any sounds still playing from the previous screen (skip when exiting editor screens).
    if (stopAudio) sfxManager.stopAll();
    // Switch to main-menu music, unless the caller is about to restore the editor
    // (which will re-apply the correct group itself, so interrupting with 'menu' would
    // restart the track for no reason).
    if (!keepMusicGroup) musicManager.playGroup('menu');
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
    this.winNextBtnEl.textContent = t('modal.win.continue');
    this.gameoverMenuBtnEl.textContent = t('modal.gameover.menu');
    // Reset HUD exit button label in case it was changed for playtesting.
    this.exitBtnEl.textContent = t('hud.exit.menu');
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
   * Called when the window is resized or the device orientation changes.
   * Re-computes the tile size and resizes the canvas to match the new viewport,
   * then triggers a fresh render so the board fills the updated area.
   */
  private _handleResize(): void {
    if ((this.screen !== GameScreen.Play && this.screen !== GameScreen.Playback) || !this.currentLevel || !this.board) return;
    setTileSize(computeTileSize(
      this.currentLevel.rows,
      this.currentLevel.cols,
      this._computePlayOverhead(this.currentLevel),
      PLAY_CANVAS_BORDER_W,
    ));
    this.canvas.width  = this.currentLevel.cols * TILE_SIZE;
    this.canvas.height = this.currentLevel.rows * TILE_SIZE;
    this._fireflies.resetForLevel(
      this.canvas.width,
      this.canvas.height,
      TILE_SIZE,
      this.currentLevel.style,
    );
    this._butterflies.resetForLevel(
      this.canvas.width,
      this.canvas.height,
      TILE_SIZE,
      this.currentLevel.style,
      this.board,
    );
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
    // On portrait (stacked) layout the right panel appears below the canvas and
    // consumes vertical space that would otherwise be available to the grid.
    if (isPortrait()) overhead += PLAY_RIGHT_PANEL_STACKED_H + PLAY_GAP;
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- board is always set before _enterPlayScreenState is called
    this.board!.initHistory();
    this.gameState = GameState.Playing;
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
  startLevel(levelId: number, existingDecorations?: ReadonlyMap<string, AmbientDecoration>, isUserRestart = false): void {
    const isResumingSameLevel = !isUserRestart
      && this.screen === GameScreen.Play
      && this.currentLevel?.id === levelId;

    let level: LevelDef | undefined;
    if (this._campaign.isPlaytesting) {
      // During playtesting the level lives in the editor, not in the active campaign.
      // Use currentLevel directly when the ID matches.
      if (this.currentLevel?.id === levelId) level = this.currentLevel;
    } else {
      // Look up the level in the active campaign; no-op if no campaign is active.
      if (!this._campaign.activeCampaign) return;
      for (const ch of this._campaign.activeCampaign.chapters) {
        level = ch.levels.find((l) => l.id === levelId);
        if (level) break;
      }
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
    // Cancel any resume-replay driver still running from a prior level/session
    // before the board is replaced. Its chained setTimeout ticks hold a captured
    // reference to the OLD board but call back into this live Game
    // (checkWinLose/spawnMoveAnimations/updateUndoRedoButtons), so a surviving
    // driver would fire against the new board → spurious win/lose and desynced
    // HUD. Done unconditionally here (not only in the new-resume branch below)
    // so restarts and partial-less level starts also clear it.
    this._resumePlayer?.cancel();
    this._resumePlayer = null;
    this.board = new Board(level.rows, level.cols, level, existingDecorations);
    this._enterPlayScreenState(level);
    this._animMgr.resetIdleTimer();

    // Switch to music appropriate for this level's style/challenge flag.
    musicManager.playGroup(selectGroupForContext({ isChallenge: level.challenge, style: level.style }));
    const isNewLevelStart = !isUserRestart && !isResumingSameLevel;
    if (isNewLevelStart) {
      this._cloudShadows.resetForScreen(
        this.canvas.width,
        this.canvas.height,
        TILE_SIZE,
        'level',
        level.style,
      );
    }
    this._fireflies.resetForLevel(
      this.canvas.width,
      this.canvas.height,
      TILE_SIZE,
      level.style,
    );
    this._butterflies.resetForLevel(
      this.canvas.width,
      this.canvas.height,
      TILE_SIZE,
      level.style,
      this.board,
    );

    if (!this._campaign.isPlaytesting) {
      this._campaign.updateLevelHeader(levelId);
    }
    this._refreshPlayUI();
    this._updateNoteHintBoxes(level);
    this._metrics.updateBestScore(levelId, this._campaign);
    this.canvas.focus();

    this._checkAndShowInitialError();

    // If the level starts already in a losing state, show the unplayable modal.
    if (this.board.getCurrentWater() <= 0) {
      this._showModalWithAnimation(this._unplayableModalEl, 'sparkle-red');
      return;
    }

    // Trigger resume-replay driver when a partial-progress entry exists for this level
    // (but not during restarts or editor playtests).
    if (!isUserRestart && !this._campaign.isPlaytesting) {
      const campaignId = this._campaign.activeCampaign?.id ?? '';
      const partial = getPartialProgressFor(campaignId, levelId);
      if (partial && partial.moves.length > 0) {
        // Any prior driver was already cancelled near the top of startLevel.
        this._resumePlayer = new ResumePlayer(this, this.board, partial.moves, this.errorFlashEl);
        this._resumePlayer.start();
      }
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
      toggleBtn.textContent = idx === 0 ? t('game.hint.show') : t('game.hint.showNext');
      toggleBtn.style.cssText = HINT_TOGGLE_BTN_STYLE;

      const textEl = document.createElement('div');
      textEl.style.cssText = HINT_TEXT_STYLE;
      textEl.textContent = hint;

      toggleBtn.addEventListener('click', () => {
        const isHidden = textEl.style.display === 'none';
        textEl.style.display = isHidden ? 'block' : 'none';
        if (idx === 0) {
          toggleBtn.textContent = isHidden ? t('game.hint.hide') : t('game.hint.show');
        } else {
          toggleBtn.textContent = isHidden ? t('game.hint.hideNext') : t('game.hint.showNext');
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
      (el, shape, count) => this._input.attachInventoryItemTouchHandlers(el, shape, count),
      (el, shape) => {
        el.addEventListener('mousemove', (e) => { this._input.setInventoryHover(shape, e.clientX, e.clientY); });
        el.addEventListener('mouseleave', () => { this._input.clearInventoryHover(); });
      },
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
    if (this._destroyed) return;
    if (this.screen === GameScreen.Play || this.screen === GameScreen.Playback) {
      this._renderBoard();
      this._animMgr.tick(this.board, this.gameState);
      this._metrics.tickGoldenInventoryTwinkle();
      if (isEnvironmentalEnabled()) {
        const now = performance.now();
        this._fireflies.updateAndRender(this.ctx, now);
        this._butterflies.updateAndRender(this.ctx, now);
      }
    }
    this._renderRafId = requestAnimationFrame(() => {
      if (this._destroyed) return;
      this._loop();
    });
  }

  private _renderBoard(): void {
    if (!this.board) return;
    const now = performance.now();
    const currentTemp = this.board.getCurrentTemperature();
    const currentPressure = this.board.getCurrentPressure();

    // Build per-frame animation overrides for the renderer.
    const rotationOverrides = this._animMgr.getRotationOverrides(now);
    const scaleOverrides = this._animMgr.getScaleOverrides(now);
    const fillExclude = this._animMgr.getFillExclude(now);

    renderBoard(
      this.ctx,
      this.canvas,
      this.board,
      this.selectedShape,
      this.pendingRotation,
      this._input.mouseCanvasPos,
      this._input.shiftHeld,
      currentTemp,
      currentPressure,
      this._errorHighlightKeys,
      this._input.hoverRotationDelta,
      rotationOverrides,
      scaleOverrides,
      fillExclude,
      () => {
        this._animMgr.renderWinTileGlowsOverlay(now);
        if (this.gameState === GameState.GameOver) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- board is always set during play state
          this._animMgr.renderDrySourcePulseOverlay(this.board!, now);
        }
      },
      // Vortex callback: rendered inside drawSourceOrSink after the outer circle
      // but before the connector arms, so particles appear above the sink backdrop
      // and underneath the arms.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- board is always set during play state
      () => this._animMgr.tickVortex(this.board!),
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

    if (isEnvironmentalEnabled()) {
      this._cloudShadows.updateAndRender(this.ctx, now);
    }
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
    this.gameoverMsgEl.textContent = t('modal.gameover.message.tankDry');
    sfxManager.play(SfxId.Dry);
    this._showModalWithAnimation(this.gameoverModalEl, 'sparkle-red');

    // Auto-record failure if the setting is enabled.
    if (!this._campaign.isPlaytesting && loadRecordingSettings().recordFailures) {
      this._maybeAutoRecord('failure', undefined, undefined);
    }
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
        this.winChallengeEl.textContent = t('game.win.challengeComplete');
        this.winChallengeEl.style.display = 'block';
      } else {
        this.winChallengeEl.style.display = 'none';
      }
    }
    // Show water retained on win modal (always show since water is the core resource)
    if (this.winWaterEl) {
      const isNewBest = previousBest !== undefined && waterRemaining > previousBest;
      this.winWaterEl.textContent = t('game.win.waterRetained', {
        count: waterRemaining,
        newBest: isNewBest ? ` ${t('game.win.newBest')}` : '',
      });
      this.winWaterEl.style.display = 'block';
    }
    // Show star count on win modal when at least one star was connected
    if (this.winStarsEl) {
      if (starsCollected > 0) {
        this.winStarsEl.textContent = t('game.win.starCount', { count: starsCollected });
        this.winStarsEl.style.display = 'block';
      } else {
        this.winStarsEl.style.display = 'none';
      }
    }
    // Play win sound immediately on winning, then spawn confetti and show modal.
    sfxManager.play(SfxId.WinLevel);

    // Auto-record success if the setting is enabled.
    if (!this._campaign.isPlaytesting && loadRecordingSettings().recordSuccesses) {
      this._maybeAutoRecord('success', waterRemaining, starsCollected);
    }

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
    const lockedWaterImpactBefore = this.board.captureLockedWaterImpacts();
    const lockedHotPlateGainBefore = this.board.captureLockedHotPlateGains();
    const result = this.board.reclaimTile(pos);
    if (result.success) {
      const reclaimedPosKey = `${pos.row},${pos.col}`;
      const filledAfterReclaim = this.board.getFilledPositions();
      const anyDisconnected = [...filledBefore].some(key => key !== reclaimedPosKey && !filledAfterReclaim.has(key));
      sfxManager.play(anyDisconnected ? SfxId.Disconnect : SfxId.Delete);
      this._animMgr.completeAnims();
      this._animMgr.resetIdleTimer();
      const changes = this.board.applyTurnDelta();
      this._playLeakSfxIfNeeded(this.board, changes);
      this._playGoldSfxIfNeeded(this.board, filledBefore);

      // Record delete move before board.recordMove() increments historyIndex.
      this.board.recordMove(encodeDeleteMove(pos.row, pos.col));
      const sparkle = this._metrics.sparkleCallbacks();
      this._animMgr.spawnDisconnectionAnimations(
        this.board, filledBefore, sparkle, tileBeforeReclaim, pos.row, pos.col,
        lockedWaterImpactBefore, lockedHotPlateGainBefore,
      );
      this._animMgr.spawnLockedCostChangeAnimations(changes);
      this._animMgr.spawnCementDecrementAnimation(result.cementDecrement);
      this._animMgr.spawnRemovalEffect(pos.row, pos.col);
      if (reclaimedShape !== undefined) this._metrics.scheduleCountBounce(reclaimedShape);
      this._deselectIfDepleted();
      if (hadNoSelection && reclaimedShape !== undefined) {
        const inv = this.board.inventory.find((it) => it.shape === reclaimedShape);
        const bonuses = this.board.getContainerBonuses();
        const effectiveCount = (inv?.count ?? 0) + (bonuses.get(reclaimedShape) ?? 0);
        if (effectiveCount > 0) {
          this.selectedShape = reclaimedShape;
          this.pendingRotation = reclaimedRotation;
        }
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
   * @param rotationInfo - Position and pre-rotation angle of the rotated tile.
   *   A pipe-rotation animation is spawned from `oldRotation` to the tile's
   *   current rotation, and subsequent fill animations are delayed until after
   *   the rotation completes.
   */
  afterTileRotated(
    filledBefore: Set<string>,
    result: MoveResult,
    rotationInfo: { row: number; col: number; oldRotation: number },
  ): void {
    if (!this.board) return;
    const lockedWaterImpactBefore = this.board.captureLockedWaterImpacts();
    const lockedHotPlateGainBefore = this.board.captureLockedHotPlateGains();
    const tile = this.board.getTile(rotationInfo);
    const delta = tile ? (tile.rotation - rotationInfo.oldRotation + 360) % 360 : 0;
    sfxManager.play(delta > 180 ? SfxId.RotateCCW : SfxId.RotateCW);
    this._animMgr.completeAnims();
    this._animMgr.resetIdleTimer();
    const changes = this.board.applyTurnDelta();
    this._playLeakSfxIfNeeded(this.board, changes);
    this._playGoldSfxIfNeeded(this.board, filledBefore);
    this._playAfterTileRotatedSfx(this.board, filledBefore);

    // Compute the encoded move string and record the snapshot.
    const encodedMove = tile
      ? encodeRotateMove(rotationInfo.row, rotationInfo.col, delta > 180 ? 'CCW' : 'CW')
      : '';
    this.board.recordMove(encodedMove);

    let fillDelay = 0;
    if (tile) {
      this._animMgr.spawnRotationAnim(
        rotationInfo.row, rotationInfo.col,
        rotationInfo.oldRotation, tile.rotation,
      );
      // Fill animations begin only after the rotation animation completes.
      fillDelay = ROTATION_ANIM_DURATION;
    }
    const sparkle = this._metrics.sparkleCallbacks();
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, sparkle);
    this._animMgr.spawnDisconnectionAnimations(
      this.board, filledBefore, sparkle, undefined, undefined, undefined,
      lockedWaterImpactBefore, lockedHotPlateGainBefore,
    );
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

  showInventoryItemTooltip(shape: PipeShape, clientX: number, clientY: number): void {
    this._tooltip.showText(clientX, clientY, getInventoryItemDisplayName(shape));
  }

  /** Show a brief error message that auto-dismisses after ~2 seconds. */
  private _showErrorFlash(message: string): void {
    if (this._errorFlashTimer !== null) clearTimeout(this._errorFlashTimer);
    this._errorFlashTimer = showTimedMessage(this.errorFlashEl, message, ERROR_DISPLAY_MS);
  }

  /**
   * Collect the SFX IDs to play for all chamber tiles that became newly
   * connected to the fill path since `filledBefore` was captured.
   *
   * Iterates over newly-connected tiles and collects one sfx per chamber type:
   * - Per-tile sounds: Tank, Heater, Pump, Sizzle, Star, NegativeCount (item).
   * - Single-per-turn sounds: one Ice (based on the highest raw ice cost) and
   *   one Snow (based on the highest raw snow cost), one Dirt (based on the
   *   highest dirt cost), and one Sandstone (based on the highest cost sandstone
   *   or SandstoneShatter if the most costly tile was shattered this turn).
   */
  private _collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[] {
    const filledAfter = board.getFilledPositions();
    const currentTemp = board.getCurrentTemperature(filledAfter);
    const currentPressure = board.getCurrentPressure(filledAfter);

    let maxIceRaw = -1;
    let maxSnowRaw = -1;
    let maxDirtCost = -1;
    let hotPlateSfx: SfxId | null = null;
    // Track highest-cost sandstone tile connected this turn, and whether it shattered.
    let maxSandstoneInfo: { cost: number; shattered: boolean } | null = null;

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
      } else if (tile.chamberContent === 'gel') {
        sfxToPlay.push(SfxId.Gel);
      } else if (tile.chamberContent === 'siphon') {
        sfxToPlay.push(SfxId.Siphon);
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
      } else if (tile.chamberContent === 'sandstone') {
        // Track the sandstone tile with the highest base cost connected this turn.
        // When the highest-cost tile shatters, play SandstoneShatter; otherwise Sandstone1/2/3.
        const { shatterOverride } = sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
        if (maxSandstoneInfo === null || tile.cost > maxSandstoneInfo.cost) {
          maxSandstoneInfo = { cost: tile.cost, shattered: shatterOverride };
        }
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

    // Collect a single sandstone sfx based on the highest-cost sandstone tile connected.
    // SandstoneShatter plays when the highest-cost tile was shattered (pressure ≥ shatter).
    if (maxSandstoneInfo !== null) {
      if (maxSandstoneInfo.shattered) {
        sfxToPlay.push(SfxId.SandstoneShatter);
      } else if (maxSandstoneInfo.cost < SANDSTONE_SFX_THRESHOLD_MID) {
        sfxToPlay.push(SfxId.Sandstone1);
      } else if (maxSandstoneInfo.cost < SANDSTONE_SFX_THRESHOLD_HIGH) {
        sfxToPlay.push(SfxId.Sandstone2);
      } else {
        sfxToPlay.push(SfxId.Sandstone3);
      }
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
      LEAKY_PIPE_SHAPES.has(board.grid[row]?.[col]?.shape),
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
    this._showErrorFlash(t(result.error, result.errorParams));
    if (result.errorTilePositions && result.errorTilePositions.length > 0) {
      this._startErrorHighlight(result.errorTilePositions);
    }
    if (result.error === ERR_GOLD_SPACE) {
      sfxManager.play(SfxId.Locked);
    } else if (result.error === ERR_SANDSTONE_TOO_HARD) {
      sfxManager.play(SfxId.SandstoneHard);
    } else if (result.error === ERR_REGULATOR_CHECK) {
      sfxManager.play(SfxId.BadConnection);
    } else if (result.errorTilePositions && result.errorTilePositions.length > 0) {
      sfxManager.play(SfxId.BadConnection);
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
    replacedTile: Tile | undefined,
    replacedRow: number,
    replacedCol: number,
  ): void {
    if (!this.board) return;
    const lockedWaterImpactBefore = this.board.captureLockedWaterImpacts();
    const lockedHotPlateGainBefore = this.board.captureLockedHotPlateGains();
    this._animMgr.completeAnims();
    this._animMgr.resetIdleTimer();
    const changes = this.board.applyTurnDelta();
    const posKey = `${replacedRow},${replacedCol}`;
    const placedIsLeakyAndConnected = LEAKY_PIPE_SHAPES.has(placedShape)
      && this.board.getFilledPositions().has(posKey);

    // Record the move in the log before board.recordMove() increments historyIndex.
    this.board.recordMove(encodePlaceMove(placedShape, replacedRow, replacedCol, this.pendingRotation));

    const sparkle = this._metrics.sparkleCallbacks();

    // Spawn all animations.
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, sparkle);
    this._animMgr.spawnDisconnectionAnimations(
      this.board, filledBefore, sparkle, replacedTile, replacedRow, replacedCol,
      lockedWaterImpactBefore, lockedHotPlateGainBefore,
    );
    this._animMgr.spawnFillAnims(this.board, filledBefore, PLACE_EFFECT_DURATION);
    this._animMgr.spawnLockedCostChangeAnimations(changes);
    this._animMgr.spawnCementDecrementAnimation(result.cementDecrement);
    if (result.cementDecrement) sfxManager.play(SfxId.Cement);

    this._animMgr.spawnPlacementEffect(replacedRow, replacedCol);
    this._metrics.scheduleCountBounce(placedShape);
    if (replacedTile) this._metrics.scheduleCountBounce(replacedTile.shape);

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
    if (isEmptyFloor(currentTile.shape)) {
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

  renderInventoryBar(): void { this._renderInventoryBar(); }

  /** Flash a red "unavailable" sparkle on the given inventory item, then re-render. */
  flashInventoryItemError(shape: PipeShape): void {
    this._metrics.pendingRedSparkleShapes.add(shape);
    this._renderInventoryBar();
  }

  /** Returns true while a resume-replay is replaying saved moves. */
  isResuming(): boolean { return this._resumePlayer?.isActive() ?? false; }

  /**
   * Handle the Escape key: close the rules modal if open, toggle the exit-
   * confirm modal during play, or exit to the menu otherwise.
   */
  handleEscapeKey(): void {
    if (this._settingsModalEl.style.display !== 'none') {
      this._cancelSettingsModal();
    } else if (this._creditsModalEl.style.display !== 'none') {
      this._creditsModalEl.style.display = 'none';
      this.canvas.focus();
    } else if (this._rulesModalEl.style.display !== 'none') {
      this._rulesModalEl.style.display = 'none';
      this.canvas.focus();
    } else if (this.screen === GameScreen.Play && this.gameState === GameState.Playing) {
      if (this._exitConfirmModalEl.style.display !== 'none') {
        // Modal already open: the modal's own Esc/onClose handler will dismiss it.
        return;
      } else {
        this.requestExitLevel();
      }
    } else {
      this.exitToMenu();
    }
  }

  checkWinLose(): void { this._checkWinLoseAfterMove(); }
  updateUndoRedoButtons(): void { this._updateUndoRedoButtons(); }

  /** Spawn board animations for a single replayed move and refresh the play UI. */
  spawnMoveAnimations(board: Board, info: MoveAnimationInfo): void {
    this._animMgr.completeAnims();
    this._animMgr.resetIdleTimer();
    const sparkle = this._metrics.sparkleCallbacks();
    if (info.rotationInfo) {
      const tile = board.getTile(info.rotationInfo);
      this._animMgr.spawnRotationAnim(
        info.rotationInfo.row, info.rotationInfo.col,
        info.rotationInfo.oldRotation,
        tile?.rotation ?? info.rotationInfo.oldRotation,
      );
    }
    this._animMgr.spawnConnectionAnimations(board, info.filledBefore, sparkle);
    if (info.decodedMove.type === 'delete') {
      this._animMgr.spawnDisconnectionAnimations(
        board, info.filledBefore, sparkle,
        info.reclaimedTile, info.decodedMove.row, info.decodedMove.col,
        info.lockedWaterImpactBefore, info.lockedHotPlateGainBefore,
      );
    } else {
      this._animMgr.spawnDisconnectionAnimations(
        board, info.filledBefore, sparkle, undefined, undefined, undefined,
        info.lockedWaterImpactBefore, info.lockedHotPlateGainBefore,
      );
    }
    const fillDelay = info.rotationInfo ? ROTATION_ANIM_DURATION : 0;
    this._animMgr.spawnFillAnims(board, info.filledBefore, fillDelay);
    this._animMgr.spawnLockedCostChangeAnimations(info.turnChanges);
    this._animMgr.spawnCementDecrementAnimation(info.moveResult.cementDecrement);
    this._refreshPlayUI();
  }

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
    // The new board's initial snapshot serves as the restart boundary marker
    // (move === undefined), so getMoveLog() automatically returns only the
    // moves from the current session when the board history is assembled.
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
    // A winning move is undone via the dedicated win-flow teardown, which
    // dismisses the win modal and clears confetti / star sparkles / win-flow
    // drops.  performUndo only closes the game-over modal, so routing a Won
    // undo here directly would revert the board while leaving the win modal
    // and celebration overlays stuck on a now-playable board.
    if (this.gameState === GameState.Won) {
      this.undoWinningMove();
      return;
    }
    // In GameOver state, allow undo if canUndo() is true (normal case) or if the
    // failing move was the very first move and discardLastMoveFromHistory() was
    // already called, leaving _historyIndex at 0 with the initial snapshot available.
    if (this.gameState === GameState.GameOver) {
      if (!this.board.canRestoreAfterGameOver()) return;
    } else if (!this.board.canUndo()) {
      return;
    }
    this._animMgr.completeAnims();
    this._animMgr.resetIdleTimer();
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
    this._animMgr.resetIdleTimer();
    const filledBefore = this.board.getFilledPositions();
    const lockedWaterImpactBefore = this.board.captureLockedWaterImpacts();
    const lockedHotPlateGainBefore = this.board.captureLockedHotPlateGains();
    this.board.redoMove();
    const sparkle = this._metrics.sparkleCallbacks();
    this._animMgr.spawnConnectionAnimations(this.board, filledBefore, sparkle);
    this._animMgr.spawnDisconnectionAnimations(
      this.board, filledBefore, sparkle, undefined, undefined, undefined,
      lockedWaterImpactBefore, lockedHotPlateGainBefore,
    );
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

  /**
   * Save or delete the partial-progress entry for the current level on exit.
   *
   * - Won levels: delete the partial (no longer needed).
   * - No moves yet (pristine): delete any stale partial.
   * - Mid-game exit with moves: save the current move sequence.
   * - Editor playtests: never touch storage.
   */
  private _persistPartialProgressOnExit(): void {
    if (!this.currentLevel || !this.board) return;

    const campaignId = this._campaign.activeCampaign?.id ?? '';
    const levelId = this.currentLevel.id;

    if (this._hasSaveableProgress()) {
      const moves = this.board.getMoveSequence();
      savePartialProgressEntry({ campaignId, levelId, moves, timestamp: Date.now(), formatVersion: 1 });
    } else {
      deletePartialProgress(campaignId, levelId);
    }
  }

  /**
   * Returns true when there is meaningful progress worth saving on exit:
   *  - not playtesting (playtest sessions are never persisted),
   *  - game is not yet won (won state is persisted via the win flow, not here),
   *  - the current-session move sequence is non-empty.
   *
   * Using getMoveSequence() (rather than canUndo()) ensures the gate matches
   * exactly the data that would be persisted, so "modal shown" ⟺ "something
   * will be saved" by construction.  After a retryLevel(), pre-restart moves
   * remain in the undo history but getMoveSequence() returns only post-restart
   * moves, so a retry with no subsequent moves correctly reports no progress.
   */
  private _hasSaveableProgress(): boolean {
    return !this._campaign.isPlaytesting
      && this.gameState !== GameState.Won
      && (this.board?.getMoveSequence().length ?? 0) > 0;
  }

  /**
   * Request an exit from the current level to the level-select menu.
   *
   * When the player is mid-game (Playing state with moves on the board) and
   * the save-progress notice has not been suppressed, show the notice modal
   * first.  In all other cases exit immediately.
   */
  requestExitLevel(): void {
    if (this.screen !== GameScreen.Play || this.gameState !== GameState.Playing) {
      this.exitToMenu();
      return;
    }
    if (!this._hasSaveableProgress()) {
      // No post-restart moves — nothing to save; skip the notice.
      this.exitToMenu();
      return;
    }
    if (loadSaveNoticeSuppressed()) {
      // Player has suppressed the notice; save silently via exitToMenu hook.
      this.exitToMenu();
      return;
    }
    this._exitConfirmModalEl.style.display = 'flex';
  }

  /** Exit to the level-selection screen. */
  exitToMenu(): void {
    this._persistPartialProgressOnExit();
    if (this._campaign.isPlaytesting) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- takePlaytestCallback is always set when isPlaytesting is true
      const cb = this._campaign.takePlaytestCallback()!;
      // keepMusicGroup=true: the editor restores the correct group itself, so skip
      // the interim 'menu' switch that would restart the track for no reason.
      this._showLevelSelect(true, true);
      cb(); // re-open the campaign editor
    } else if (this._campaign.winFromChapterMap && this._campaign.chapterMapScreen?.chapter) {
      this._campaign.winFromChapterMap = false;
      this.winModalEl.style.display = 'none';
      this._exitConfirmModalEl.style.display = 'none';
      this._closeModal(this.gameoverModalEl);
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
          renderBoard(offCtx, offscreen, this.board, null, 0, null);
          boardSnapshot = offscreen;
        }
      }

      // Reshow the chapter map (restores chapter-map TILE_SIZE and renders the canvas).
      this._campaign.reshowChapterMap();
      this.screen = GameScreen.ChapterMap;

      // Compute the minimap screen rect for the current level (uses chapter-map TILE_SIZE).
      const chapterMapScreen = this._campaign.chapterMapScreen;
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
            chapterMapScreen.screenEl.style.overflow = '';
            // Only hide the play screen if the user hasn't already selected a new
            // level while this exit animation was running.  If a new level was
            // chosen mid-animation the screen is already GameScreen.Play, and
            // unconditionally hiding the play screen here would leave a permanent
            // black screen (the enter transition's onComplete sets opacity:1 on a
            // display:none element, so nothing becomes visible).
            if (this.screen === GameScreen.ChapterMap) {
              this.playScreenEl.style.display = 'none';
              this.currentLevel = null;
            }
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
    refreshGameRulesModalCommands(this._rulesModalEl);
    this._rulesModalEl.style.display = 'flex';
  }

  /** Show the game-credits modal overlay. */
  showCredits(): void {
    this._creditsModalEl.style.display = 'flex';
  }

  /**
   * Release all resources held by this Game instance.
   * Removes input event listeners registered on the canvas and document so
   * that they do not accumulate when multiple Game instances are created in
   * the same document (e.g. across test cases).
   */
  destroy(): void {
    this._destroyed = true;
    if (this._resizeTimer !== null) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
    window.removeEventListener('resize', this._resizeHandler);
    if (this._renderRafId !== null) {
      cancelAnimationFrame(this._renderRafId);
      this._renderRafId = null;
    }
    // Clear the remaining one-shot timers so their callbacks cannot fire after
    // teardown (matters for test isolation when many Game instances share a
    // document; the production Game is a page-lifetime singleton).
    if (this._pendingRingsTimerId !== null) {
      clearTimeout(this._pendingRingsTimerId);
      this._pendingRingsTimerId = null;
    }
    if (this._errorFlashTimer !== null) {
      clearTimeout(this._errorFlashTimer);
      this._errorFlashTimer = null;
    }
    if (this._errorHighlightTimer !== null) {
      clearTimeout(this._errorHighlightTimer);
      this._errorHighlightTimer = null;
    }
    // Stop any in-flight resume-replay driver so its chained setTimeout cannot
    // fire after teardown.
    this._resumePlayer?.cancel();
    this._resumePlayer = null;

    unregisterScrollingPipeBackground(this._settingsModalEl);
    this._input.destroy();
  }

  // ─── Recording ────────────────────────────────────────────────────────────

  /**
   * Return the current canonical move sequence for the active play session.
   *
   * Delegates to {@link Board.getMoveSequence}, which walks the snapshot
   * history back to the most recent restart boundary (a snapshot with
   * `move === undefined`).  Handles any number of restarts and undo-past-
   * restart actions automatically without any extra state in Game.
   */
  getMoveLog(): string[] {
    return this.board?.getMoveSequence() ?? [];
  }

  /**
   * Open the manual "Record Play Sequence" modal.
   * Only meaningful when a level is active.
   */
  private _openRecordModal(): void {
    if (!this.board || !this.currentLevel) return;
    const moves = this.getMoveLog();
    const outcome: 'success' | 'failure' | 'partial' = this.gameState === GameState.Won ? 'success'
      : this.gameState === GameState.GameOver ? 'failure'
      : 'partial';
    const info: RecordModalInfo = {
      outcome,
      playerName: loadPlayerName(),
      timestamp: Date.now(),
      moveCount: moves.length,
      waterScore: this.gameState === GameState.Won ? this.board.getCurrentWater() : undefined,
      stars: this.gameState === GameState.Won ? this.board.getStarsCollected() : undefined,
    };
    buildRecordModal(
      info,
      (annotation) => {
        if (!this.board || !this.currentLevel) return;
        // A recording is meaningless without a campaign to file it under, and a
        // blank campaignId is rejected on load anyway — never create one.
        const activeCampaignId = this._campaign.activeCampaign?.id;
        if (!activeCampaignId) return;
        const activeSlot = getActiveSlotIndex();
        const record: PlaySequenceRecord = {
          formatVersion: 1,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          campaignId: activeCampaignId,
          levelId: this.currentLevel.id,
          moves,
          outcome,
          autoRecorded: false,
          timestamp: Date.now(),
          playerName: loadPlayerName(),
          playerGuid: activeSlot !== null ? loadSlotMeta(activeSlot)?.guid : undefined,
          waterScore: info.waterScore,
          stars: info.stars,
          annotation: annotation || undefined,
          corrupted: false,
        };
        saveRecording(record);
      },
      () => { /* cancelled */ },
    );
  }

  /**
   * Open the playback list modal for the current level.
   * Only meaningful when a level is active.
   */
  private _openPlaybackListModal(): void {
    if (!this.currentLevel) return;
    const campaignId = this._campaign.activeCampaign?.id ?? '';
    const levelId = this.currentLevel.id;

    buildPlaybackListModal({
      getRecords: () => loadRecordingsForLevel(campaignId, levelId),
      onReplay: (record) => {
        if (!this.currentLevel) return;
        this._playbackScreen.enter(record, this.currentLevel);
      },
      onReturn: () => { /* modal removes itself */ },
      onDelete: (record) => {
        deleteRecording(record.id);
      },
      onExport: (record) => {
        this._exportReplay(record);
      },
      onImport: () => {
        this._importReplay();
      },
    });
  }

  /**
   * Auto-record the current move sequence when the settings permit it.
   * Skips recording if an identical auto-recorded sequence already exists.
   */
  private _maybeAutoRecord(
    outcome: 'success' | 'failure',
    waterScore: number | undefined,
    stars: number | undefined,
  ): void {
    if (!this.board || !this.currentLevel) return;
    // A recording is meaningless without a campaign to file it under, and a
    // blank campaignId is rejected on load anyway — never create one.
    const campaignId = this._campaign.activeCampaign?.id;
    if (!campaignId) return;
    const moves = this.getMoveLog();
    const levelId = this.currentLevel.id;

    // Dedup: skip if an identical auto-recorded sequence already exists for this level.
    const existing = loadRecordingsForLevel(campaignId, levelId);
    const isDuplicate = hasDuplicateAutoRecording(existing, moves);
    if (isDuplicate) return;

    const autoActiveSlot = getActiveSlotIndex();
    const record: PlaySequenceRecord = {
      formatVersion: 1,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      campaignId,
      levelId,
      moves,
      outcome,
      autoRecorded: true,
      timestamp: Date.now(),
      playerName: loadPlayerName(),
      playerGuid: autoActiveSlot !== null ? loadSlotMeta(autoActiveSlot)?.guid : undefined,
      waterScore,
      stars,
      corrupted: false,
    };
    saveRecording(record);
  }

  /**
   * Export a replay record as a gzip-compressed JSON file.
   * The file contains campaign and level ids to support importing on other installs.
   */
  private _exportReplay(record: PlaySequenceRecord): void {
    void exportReplay(record, this.campaignEditor.getAllCampaigns());
  }

  /**
   * Open a file picker and import a replay file.
   * On success shows a confirmation modal with campaign/chapter/level info.
   */
  private _importReplay(): void {
    importReplay(this.campaignEditor.getAllCampaigns(), (...args) => {
      const [, campaignName, chapterNumber, levelNumber] = args;
      showReplayImportSuccessModal(campaignName, chapterNumber, levelNumber);
    });
  }

  /** Show the player-profile selection screen (hides the level-select screen). */
  private _showPlayerProfileScreen(): void {
    this.levelSelectEl.style.display = 'none';
    this._profileScreen.show(this.campaignEditor.getAllCampaigns());
  }

  /** Revert live Settings previews and hide the settings modal. */
  private _cancelSettingsModal(): void {
    const bgToggle  = this._settingsModalEl.querySelector<HTMLInputElement>('[data-graphics-background]');
    const envToggle = this._settingsModalEl.querySelector<HTMLInputElement>('[data-graphics-environmental]');
    const muteOnFocusLossToggle = this._settingsModalEl.querySelector<HTMLInputElement>('[data-music-mute-on-focus-loss]');
    sfxManager.play(SfxId.Back);
    const persistedBg  = loadBackgroundEnabled();
    const persistedEnv = loadEnvironmentalEnabled();
    const persistedMuteOnFocusLoss = loadMusicMuteOnFocusLoss();
    if (bgToggle) bgToggle.checked = persistedBg;
    if (envToggle) envToggle.checked = persistedEnv;
    if (muteOnFocusLossToggle) muteOnFocusLossToggle.checked = persistedMuteOnFocusLoss;
    setGlobalBackgroundPatternEnabled(persistedBg);
    setEnvironmentalEnabled(persistedEnv);
    musicManager.setMuteOnFocusLoss(persistedMuteOnFocusLoss);
    this._settingsModalEl.style.display = 'none';
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

    // Switch to music appropriate for this level's style/challenge flag.
    musicManager.playGroup(selectGroupForContext({ isChallenge: level.challenge, style: level.style }));
    this._cloudShadows.resetForScreen(
      this.canvas.width,
      this.canvas.height,
      TILE_SIZE,
      'level',
      level.style,
    );
    this._fireflies.resetForLevel(
      this.canvas.width,
      this.canvas.height,
      TILE_SIZE,
      level.style,
    );
    this._butterflies.resetForLevel(
      this.canvas.width,
      this.canvas.height,
      TILE_SIZE,
      level.style,
      this.board,
    );
    this._campaign.currentChapterId = 0;
    this.levelHeaderEl.innerHTML = '';
    const ptLine1 = document.createElement('div');
    ptLine1.style.cssText = 'font-size:0.9rem;color:#aaa;';
    ptLine1.textContent = t('game.playtesting');
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
