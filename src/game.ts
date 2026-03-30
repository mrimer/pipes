import { Board, PIPE_SHAPES, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, SPIN_PIPE_SHAPES, posKey, parseKey, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './board';
import { Tile } from './tile';
import { GameScreen, GameState, GridPos, InventoryItem, LevelDef, TileDef, PipeShape, CampaignDef, ChapterDef, Direction, Rotation, AmbientDecoration, COLD_CHAMBER_CONTENTS } from './types';
import { WATER_COLOR, LOW_WATER_COLOR, MEDIUM_WATER_COLOR, SINK_COLOR, SINK_WATER_COLOR, GOLD_PIPE_WATER_COLOR, FIXED_PIPE_WATER_COLOR, LEAKY_PIPE_WATER_COLOR } from './colors';
import { TILE_SIZE, LINE_WIDTH, renderBoard, renderContainerFillAnims, getTileDisplayName, setTileSize, computeTileSize } from './renderer';
import { renderInventoryBar } from './inventoryRenderer';
import { renderLevelList } from './levelSelect';
import { ChapterMapScreen } from './chapterMapScreen';
import {
  loadCompletedLevels, markLevelCompleted, clearCompletedLevels,
  loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress,
  loadActiveCampaignId, saveActiveCampaignId, clearActiveCampaignId,
  computeCampaignCompletionPct,
  loadLevelStars, saveLevelStar, clearLevelStars,
  loadLevelWater, saveLevelWater, clearLevelWater,
  loadCompletedChapters, markChapterCompleted, clearCompletedChapters,
} from './persistence';
import { createGameRulesModal } from './rulesModal';
import { TileAnimation, renderAnimations, animColor, ANIM_DURATION, ANIM_NEGATIVE_COLOR, ANIM_POSITIVE_COLOR, ANIM_ZERO_COLOR, ANIM_ITEM_COLOR, ANIM_ITEM_NEG_COLOR } from './visuals/tileAnimation';
import { CampaignEditor } from './campaignEditor';
import { spawnConfetti, clearConfetti } from './visuals/confetti';
import { spawnStarSparkles, clearStarSparkles } from './visuals/starSparkle';
import {
  SourceSprayDrop, FlowDrop, BubbleParticle, DryPuff, LeakySprayDrop,
  spawnSourceSprayDrop, renderSourceSpray,
  spawnDryPuff, renderDryPuffs,
  spawnFlowDrop, renderFlowDrops,
  spawnBubble, renderBubbles,
  spawnLeakySprayDrop, renderLeakySpray,
  computeFlowGoodDirs,
} from './visuals/waterParticles';
import { VortexParticle, spawnVortexParticle, renderVortex } from './visuals/sinkVortex';
import {
  PipeRotationAnim, PipeFillAnim,
  computeRotationOverrides, computeActiveFillKeys, computeFillOrder,
  renderFillAnims,
  FILL_ANIM_DURATION, ROTATION_ANIM_DURATION,
} from './visuals/pipeEffects';

/** How often (ms) to spawn a dry-air puff particle from the source on game-over. */
const DRY_PUFF_SPAWN_INTERVAL_MS = 200;
/** How often (ms) to spawn a water-spray drop from the source during normal play. */
const SPRAY_SPAWN_INTERVAL_MS = 150;
/** How often (ms) to spawn a fizzing bubble particle inside connected pipes. */
const BUBBLE_SPAWN_INTERVAL_MS = 90;
/** How often (ms) to spawn a win-flow drop during the won state. */
const WIN_FLOW_SPAWN_INTERVAL_MS = 70;
/** How often (ms) to spawn a vortex particle over a sink tile. */
const VORTEX_SPAWN_INTERVAL_MS = 120;
/** How often (ms) to spawn a leaky spray drop from connected leaky pipe tiles. */
const LEAKY_SPRAY_SPAWN_INTERVAL_MS = 100;
/** How long (ms) error flash messages and tile error highlights are displayed. */
const ERROR_DISPLAY_MS = 2000;
/** Delay (ms) before spawning star sparkles over the win modal star icon. */
const MODAL_SPARKLE_DELAY_MS = 150;

/** Sparkle color palette for metric increases (gold). */
const METRIC_SPARKLE_GOLD: readonly string[] = ['#ffd700', '#ffe866', '#ffec8b', '#ffc200', '#fff0a0', '#f0c040'];
/** Sparkle color palette for metric decreases (light blue). */
const METRIC_SPARKLE_BLUE: readonly string[] = ['#add8e6', '#87ceeb', '#b0e0e6', '#e0f7ff', '#cce8ff', '#aed6f1'];
/** Sparkle color palette for frozen metric decreases (red). */
const METRIC_SPARKLE_RED:  readonly string[] = ['#ff4444', '#ff7777', '#ff9999', '#ff6666', '#ffaaaa', '#cc3333'];

/** CSS style for the toggle button of each hint in the hint box. */
const HINT_TOGGLE_BTN_STYLE =
  'width:100%;padding:10px 16px;font-size:0.9rem;background:#1a1400;color:#f0c040;' +
  'border:none;cursor:pointer;text-align:left;font-family:inherit;';

/** CSS style for the collapsible text area of each hint in the hint box. */
const HINT_TEXT_STYLE =
  'display:none;padding:12px 16px;font-size:0.9rem;color:#eee;background:#16213e;';

/** CSS style for the Ctrl-hover coordinate tooltip element. */
const TOOLTIP_CSS =
  'display:none;position:fixed;background:#16213e;color:#eee;border:1px solid #4a90d9;' +
  'border-radius:4px;padding:4px 8px;font-size:0.8rem;pointer-events:none;z-index:50;white-space:pre-wrap;';

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

/** Estimated height (px) of the <h1> title: margin(20) + 2rem text(32) + margin(16) = 68,
 *  plus ~6 px empirical allowance for line-height and sub-pixel rounding = 74. */
const PLAY_H1_H = 74;
/** Estimated height (px) of the #level-header row: 1rem font (16 px) × ~1.4 line-height ≈ 22. */
const PLAY_LEVEL_HEADER_H = 22;
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

/**
 * Manages the game loop, rendering, and user input for the Pipes puzzle.
 * Handles both the level-selection menu and the active play screen.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  // Screens / overlays (managed by DOM, not canvas)
  private readonly levelSelectEl: HTMLElement;
  private readonly levelListEl: HTMLElement;
  private readonly playScreenEl: HTMLElement;
  private readonly levelHeaderEl: HTMLElement;
  private readonly inventoryBarEl: HTMLElement;
  private readonly waterDisplayEl: HTMLElement;
  private readonly winModalEl: HTMLElement;
  private readonly gameoverModalEl: HTMLElement;
  private readonly gameoverMsgEl: HTMLElement;

  /** Undo button in the play-screen HUD. */
  private readonly undoBtnEl: HTMLButtonElement;

  /** Redo button in the play-screen HUD. */
  private readonly redoBtnEl: HTMLButtonElement;

  /** "← Menu" / "← Edit" exit button in the play-screen HUD. */
  private readonly exitBtnEl: HTMLButtonElement;

  /** "Next Level" button in the win modal — hidden while playtesting in the editor. */
  private readonly winNextBtnEl: HTMLButtonElement;

  /** Challenge level indicator element in the win modal. */
  private readonly winChallengeEl: HTMLElement | null;

  /** Water retained display element in the win modal. */
  private readonly winWaterEl: HTMLElement | null;

  /** Star count display element in the win modal. */
  private readonly winStarsEl: HTMLElement | null;

  /** "Level Select" / "Return to Editor" button in the win modal. */
  private readonly winMenuBtnEl: HTMLButtonElement;

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
   * When no inventory item is selected, the number of accumulated 90°-CW rotation steps
   * being previewed on the hovered tile (0 = no preview active).
   */
  private hoverRotationDelta: number = 0;

  /** Last-used placement rotation per pipe shape, so the same orientation is reused next time. */
  private readonly lastPlacedRotations = new Map<PipeShape, Rotation>();

  /** Most-recent mouse position over the canvas in canvas-pixel coordinates. */
  private mouseCanvasPos: { x: number; y: number } | null = null;

  /** True while the left mouse button is held on the canvas with a shape selected. */
  private _isDragging = false;

  /** Grid position of the tile the drag gesture is currently over. */
  private _dragLastTile: GridPos | null = null;

  /**
   * True when the drag gesture moved to at least one new tile and already handled
   * placement, so the subsequent click event (if it fires) should be suppressed.
   */
  private _suppressNextClick = false;

  /** True while the right mouse button is held on the canvas (drag-erase). */
  private _isRightDragging = false;

  /** Grid position of the tile the right-drag gesture is currently over. */
  private _rightDragLastTile: GridPos | null = null;

  /**
   * True when the right-drag gesture already handled removal, so the subsequent
   * contextmenu event (if it fires) should be suppressed.
   */
  private _suppressNextContextMenu = false;

  /** Whether the Ctrl key is currently held. */
  private ctrlHeld = false;

  /** Whether the Shift key is currently held (used for adjusted ice/snow display). */
  private shiftHeld = false;

  /** Tooltip element for displaying grid coordinates under Ctrl. */
  private readonly tooltipEl: HTMLElement;

  /** Floating error message element shown briefly when an action is blocked. */
  private readonly errorFlashEl: HTMLElement;
  /** Timer ID for auto-hiding the error flash message. */
  private _errorFlashTimer: ReturnType<typeof setTimeout> | null = null;

  /** Set of "row,col" keys for sandstone tiles currently highlighted due to a validation error. */
  private _errorHighlightKeys: Set<string> = new Set();
  /** Timer ID for clearing the sandstone highlight. */
  private _errorHighlightTimer: ReturnType<typeof setTimeout> | null = null;

  /** Modal overlay for confirming a progress reset. */
  private readonly resetConfirmModalEl: HTMLElement;

  /** Modal overlay showing game rules and tile legend. */
  private readonly _rulesModalEl: HTMLElement;

  /** Campaign editor overlay (manages its own DOM). */
  private readonly campaignEditor: CampaignEditor;

  /** Levels that have been successfully completed (persisted in localStorage). */
  private completedLevels: Set<number>;

  /** Active floating animation labels shown over the canvas. */
  private _animations: TileAnimation[] = [];

  /** Active pipe-rotation animations (tile spinning from old to new orientation). */
  private _rotationAnims: PipeRotationAnim[] = [];

  /** Active pipe-fill animations (water filling newly-connected tiles). */
  private _fillAnims: PipeFillAnim[] = [];

  /** Active source-spray water drops rendered over the source tile during play. */
  private _sourceSprayDrops: SourceSprayDrop[] = [];

  /** `performance.now()` of the last source spray drop spawn. */
  private _lastSpraySpawn = 0;

  /** Active dry-air puffs rendered over the source tile when the tank runs dry. */
  private _dryPuffs: DryPuff[] = [];

  /** Active win-flow water drops following connected pipes from source to sink. */
  private _flowDrops: FlowDrop[] = [];

  /**
   * Pre-computed "good" directions at each tile for the win-flow animation –
   * only directions that lead towards the sink without entering dead-end branches.
   * Computed once when the board is solved; cleared when leaving the Won state.
   */
  private _flowGoodDirs: Map<string, Set<Direction>> | null = null;

  /**
   * Maximum number of simultaneously live win-flow drops – set on win to
   * ~5 drops per tile in the solution path.
   */
  private _flowMaxDrops = 25;

  /** `performance.now()` of the last win-flow drop spawn. */
  private _lastFlowSpawn = 0;

  /** Active fizzing bubble particles rendered inside connected pipe tiles. */
  private _bubbles: BubbleParticle[] = [];

  /** `performance.now()` of the last bubble spawn. */
  private _lastBubbleSpawn = 0;

  /** Active leaky spray drops rendered over connected leaky pipe tiles. */
  private _leakySprayDrops: LeakySprayDrop[] = [];

  /** `performance.now()` of the last leaky spray drop spawn. */
  private _lastLeakySpraySpawn = 0;

  /** Active vortex particles rendered over the sink tile. */
  private _vortexParticles: VortexParticle[] = [];

  /** `performance.now()` of the last vortex particle spawn. */
  private _lastVortexSpawn = 0;

  /** Shapes that should receive a sparkle CSS animation on the next inventory render. */
  private _pendingSparkleShapes: Set<PipeShape> = new Set();

  /** Shapes that should receive a red-sparkle CSS animation on the next inventory render (negative-count click). */
  private _pendingRedSparkleShapes: Set<PipeShape> = new Set();

  /** Shapes that should receive a gray-sparkle CSS animation on the next inventory render (zero net change). */
  private _pendingGraySparkleShapes: Set<PipeShape> = new Set();

  /** Chapter ID of the level currently being played (0 if unknown). */
  private currentChapterId = 0;

  /** Element showing the current source temperature (shown for Chapter 2+ levels). */
  private readonly tempDisplayEl: HTMLElement;

  /** Element showing the total water frozen by ice blocks (shown when frozen > 0). */
  private readonly frozenDisplayEl: HTMLElement;

  /** Element showing the current game Pressure (shown when pressure-relevant tiles are present). */
  private readonly pressureDisplayEl: HTMLElement;

  /** Span holding the numeric value in the water stat row. */
  private readonly waterValueEl: HTMLElement;

  /** Span holding the numeric value in the temperature stat row. */
  private readonly tempValueEl: HTMLElement;

  /** Span holding the numeric value in the frozen stat row. */
  private readonly frozenValueEl: HTMLElement;

  /** Span holding the numeric value in the pressure stat row. */
  private readonly pressureValueEl: HTMLElement;

  /** Previous water count for metric sparkle detection (null before first display or after level reset). */
  private _prevWater: number | null = null;
  /** Previous temperature value for metric sparkle detection (null when row is hidden). */
  private _prevTemp: number | null = null;
  /** Previous frozen value for metric sparkle detection (null when row is hidden). */
  private _prevFrozen: number | null = null;
  /** Previous pressure value for metric sparkle detection (null when row is hidden). */
  private _prevPressure: number | null = null;
  /** When true, the next {@link _updateWaterDisplay} call skips all metric sparkles (used after undo/redo baseline reset). */
  private _suppressNextMetricSparkles: boolean = false;

  /** Box shown beneath the grid with level notes (when the level has a note). */
  private readonly noteBoxEl: HTMLElement;

  /** Collapsible box shown beneath the grid with the level hints (when the level has hints). */
  private readonly hintBoxEl: HTMLElement;

  /**
   * The non-official campaign currently activated for play, or null when playing
   * the built-in official campaign.
   */
  private _activeCampaign: CampaignDef | null = null;

  /** Completion progress for the active campaign (level IDs that have been completed). */
  private _activeCampaignProgress: Set<number> = new Set();
  private _activeCampaignCompletedChapters: Set<number> = new Set();

  /**
   * Persists the user's manual expand/collapse state for each chapter on the
   * level select screen.  Keyed by chapter index within the active campaign.
   * Reset whenever the active campaign changes so fresh defaults are applied.
   */
  private _chapterExpandedState: Map<number, boolean> = new Map();

  /**
   * Optional callback invoked instead of `_showLevelSelect()` when exiting play mode.
   * Used when a level was launched for playtesting from the campaign editor.
   */
  private _playtestExitCallback: (() => void) | null = null;

  /**
   * Level ID that is queued to start after the player dismisses an intermediate
   * modal (new-chapter intro or challenge-level warning).
   */
  private _pendingLevelId: number | null = null;

  // ── Chapter map screen state ───────────────────────────────────────────────

  /** Chapter map screen (built lazily on first use). */
  private _chapterMapScreen: ChapterMapScreen | null = null;

  /**
   * When true, the win modal's "Level Select" button should return to the
   * chapter map screen (rather than the regular level select).
   */
  private _winFromChapterMap = false;

  /** Modal overlay shown when the player is about to enter the first level of a new chapter. */
  private readonly _newChapterModalEl: HTMLElement;

  /** Element inside the new-chapter modal that displays the chapter number. */
  private readonly _newChapterNumberEl: HTMLElement;

  /** Element inside the new-chapter modal that displays the chapter name. */
  private readonly _newChapterNameEl: HTMLElement;

  /** Modal overlay shown when the player is about to enter a challenge level. */
  private readonly _challengeModalEl: HTMLElement;

  /** Paragraph inside the challenge modal describing skip behavior (hidden for direct selection). */
  private readonly _challengeMsgEl: HTMLElement;

  /** "Skip Level" button inside the challenge modal (hidden for direct selection). */
  private readonly _challengeSkipBtnEl: HTMLButtonElement;

  /** Modal overlay shown when the player presses Esc to confirm abandoning the level. */
  private readonly _exitConfirmModalEl: HTMLElement;

  /** Modal overlay shown when a level starts in an already-lost state (unplayable). */
  private readonly _unplayableModalEl: HTMLElement;

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

    this.levelSelectEl = levelSelectEl;
    this.levelListEl = levelListEl;
    this.playScreenEl = playScreenEl;
    this.levelHeaderEl = levelHeaderEl;
    this.inventoryBarEl = inventoryBarEl;
    this.waterDisplayEl = waterDisplayEl;
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
    this.winMenuBtnEl = winModalEl.querySelector<HTMLButtonElement>('#win-menu-btn')!;
    this.gameoverMenuBtnEl = gameoverModalEl.querySelector<HTMLButtonElement>('#gameover-menu-btn')!;

    // Load persisted completions
    this.completedLevels = loadCompletedLevels();

    // Create the tooltip element for Ctrl+hover grid coordinates
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText = TOOLTIP_CSS;
    document.body.appendChild(this.tooltipEl);

    // Grab the value span from the water stat row (its second child span)
    this.waterValueEl = this.waterDisplayEl.querySelector('.stat-value') as HTMLElement;

    // Create the frozen stat row (inserted into the stats box after water display)
    ({ rowEl: this.frozenDisplayEl, valueEl: this.frozenValueEl } =
      Game._createStatRow('❄️ Frozen', '#a8d8ea'));
    this.waterDisplayEl.insertAdjacentElement('afterend', this.frozenDisplayEl);

    // Create the temperature stat row (inserted into the stats box after frozen display)
    ({ rowEl: this.tempDisplayEl, valueEl: this.tempValueEl } =
      Game._createStatRow('🌡️ Temp °', '#74b9ff'));
    this.frozenDisplayEl.insertAdjacentElement('afterend', this.tempDisplayEl);

    // Create the pressure stat row (inserted into the stats box after temp display)
    ({ rowEl: this.pressureDisplayEl, valueEl: this.pressureValueEl } =
      Game._createStatRow('🔧 Pressure', '#a8e063'));
    this.tempDisplayEl.insertAdjacentElement('afterend', this.pressureDisplayEl);

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
    this.resetConfirmModalEl = this._buildResetModal();

    // Create the game-rules modal (appends itself to document.body)
    this._rulesModalEl = createGameRulesModal();

    // Create the new-chapter intro modal
    const newChapterModal = this._buildNewChapterModal();
    this._newChapterModalEl = newChapterModal.el;
    this._newChapterNumberEl = newChapterModal.numberEl;
    this._newChapterNameEl = newChapterModal.nameEl;

    // Create the challenge-level warning modal
    const challengeModal = this._buildChallengeModal();
    this._challengeModalEl = challengeModal.el;
    this._challengeMsgEl = challengeModal.msgEl;
    this._challengeSkipBtnEl = challengeModal.skipBtnEl;

    // Create the exit-confirmation modal (shown when the player presses Esc mid-level)
    this._exitConfirmModalEl = this._buildExitConfirmModal();

    // Create the unplayable-level modal (shown when a level starts already lost)
    this._unplayableModalEl = this._buildUnplayableModal();

    // Create the campaign editor (appends its own overlay to document.body)
    this.campaignEditor = new CampaignEditor(
      () => this._showLevelSelect(),         // onClose: return to level select
      (level) => this._playtestLevel(level), // onPlaytest: start the level in play mode
      (campaign) => this._activateCampaign(campaign), // onPlayCampaign: activate campaign for play
    );

    // Restore active campaign from localStorage (needs campaign editor to resolve the ID)
    const savedCampaignId = loadActiveCampaignId();
    if (savedCampaignId) {
      this._restoreActiveCampaign(savedCampaignId);
    } else {
      // No saved campaign – pick one from the available list, preferring official ones.
      this._autoSelectCampaign();
    }

    canvas.addEventListener('mousedown',    (e) => this._handleCanvasMouseDown(e));
    canvas.addEventListener('click',        (e) => this._handleCanvasClick(e));
    canvas.addEventListener('mousemove',    (e) => this._handleCanvasMouseMove(e));
    canvas.addEventListener('mouseleave',   ()  => { this._cancelDrag(); this._cancelRightDrag(); this._hideTooltip(); this.hoverRotationDelta = 0; this.mouseCanvasPos = null; });
    // Capture mouseup and contextmenu on window so a release (or the contextmenu event that
    // follows) outside the canvas still ends the drag and suppresses the browser context menu.
    // This is necessary because a right-click that triggers a fail-state causes the game-over
    // modal to appear before the contextmenu event fires, making the modal the event target
    // rather than the canvas.  Listening on window ensures preventDefault() is always called.
    // Game is a singleton for the lifetime of the page, so these listeners are never removed
    // (same pattern as the document keydown/keyup listeners below).
    window.addEventListener('mouseup',      (e) => this._handleCanvasMouseUp(e));
    window.addEventListener('contextmenu',  (e) => this._handleCanvasRightClick(e));
    canvas.addEventListener('keydown',      (e) => this._handleKey(e));
    canvas.addEventListener('wheel',        (e) => this._handleCanvasWheel(e), { passive: false });
    document.addEventListener('keydown',    (e) => this._handleDocKeyDown(e));
    document.addEventListener('keyup',      (e) => this._handleDocKeyUp(e));

    this._showLevelSelect();
    this._loop();
  }

  // ─── Modal helpers ────────────────────────────────────────────────────────

  /**
   * Create a standard full-screen modal overlay element (hidden by default).
   * @param backgroundAlpha - Opacity of the dark backdrop (default 0.5).
   */
  private static _createModalOverlay(backgroundAlpha = 0.5): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      `display:none;position:fixed;inset:0;background:rgba(0,0,0,${backgroundAlpha});` +
      'justify-content:center;align-items:center;z-index:100;';
    return el;
  }

  /**
   * Create a stats-box row element (hidden by default) with a label and value span.
   * @param labelText - Emoji + text for the label span.
   * @param color     - CSS color applied to the whole row.
   * @returns `{ rowEl, valueEl }` – caller inserts `rowEl` and updates `valueEl`.
   */
  private static _createStatRow(labelText: string, color: string): { rowEl: HTMLDivElement; valueEl: HTMLElement } {
    const rowEl = document.createElement('div');
    rowEl.className = 'stat-row';
    rowEl.style.cssText = `display:none;color:${color};`;
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.textContent = labelText;
    const valueEl = document.createElement('span');
    valueEl.className = 'stat-value';
    rowEl.appendChild(labelEl);
    rowEl.appendChild(valueEl);
    return { rowEl, valueEl };
  }

  /**
   * Show or hide a stats-box row based on whether a value is available.
   * When `value` is not null, updates `valueEl.textContent` and sets `rowEl` to flex;
   * when null, hides `rowEl`.
   */
  private static _showStatRow(rowEl: HTMLElement, valueEl: HTMLElement, value: number | null): void {
    if (value !== null) {
      valueEl.textContent = `${value}`;
      rowEl.style.display = 'flex';
    } else {
      rowEl.style.display = 'none';
    }
  }

  /** Spawn a small burst of sparkle particles centered on a HUD stat value element. */
  private static _spawnMetricSparkles(rowEl: HTMLElement, colors: readonly string[]): void {
    const valueEl = (rowEl.querySelector('.stat-value') as HTMLElement | null) ?? rowEl;
    const rect = valueEl.getBoundingClientRect();
    spawnStarSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2, 16, colors);
  }

  /**
   * Create a standard modal overlay with a centered box, title heading, and an
   * empty actions bar at the bottom.  Appends the overlay to `document.body`.
   * @returns `{ el }` – the overlay, `box` – the inner dialog div,
   *          `actionsEl` – the pre-appended actions container for buttons.
   */
  private static _buildModalShell(
    title: string,
  ): { el: HTMLDivElement; box: HTMLDivElement; actionsEl: HTMLDivElement } {
    const el = Game._createModalOverlay();
    const box = document.createElement('div');
    box.className = 'modal-box';
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    box.appendChild(titleEl);
    const actionsEl = document.createElement('div');
    actionsEl.className = 'modal-actions';
    box.appendChild(actionsEl);
    el.appendChild(box);
    document.body.appendChild(el);
    return { el, box, actionsEl };
  }

  /** Build and attach the reset-progress confirmation modal. */
  private _buildResetModal(): HTMLElement {
    const el = Game._createModalOverlay(0.7);
    const box = document.createElement('div');
    box.style.cssText =
      'background:#16213e;border:3px solid #e74c3c;border-radius:10px;' +
      'padding:32px 40px;text-align:center;display:flex;flex-direction:column;' +
      'gap:16px;min-width:280px;';
    const title = document.createElement('h2');
    title.textContent = '⚠️ Reset Progress?';
    const msg = document.createElement('p');
    msg.style.cssText = 'font-size:0.95rem;color:#aaa;';
    msg.textContent = 'This will remove all level completion data. Are you sure?';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText =
      'padding:10px 24px;font-size:1rem;background:#2a2a4a;color:#aaa;' +
      'border:1px solid #555;border-radius:6px;cursor:pointer;';
    cancelBtn.addEventListener('click', () => { this.resetConfirmModalEl.style.display = 'none'; });
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Reset';
    confirmBtn.style.cssText =
      'padding:10px 24px;font-size:1rem;background:#e74c3c;color:#fff;' +
      'border:none;border-radius:6px;cursor:pointer;';
    confirmBtn.addEventListener('click', () => {
      this._resetProgress();
      this.resetConfirmModalEl.style.display = 'none';
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(actions);
    el.appendChild(box);
    document.body.appendChild(el);
    return el;
  }

  /** Build and attach the new-chapter intro modal; returns the overlay and its mutable sub-elements. */
  private _buildNewChapterModal(): { el: HTMLElement; numberEl: HTMLElement; nameEl: HTMLElement } {
    const { el, box, actionsEl } = Game._buildModalShell('✨ New Chapter');
    const numberEl = document.createElement('p');
    numberEl.style.cssText = 'font-size:1.2rem;font-weight:bold;color:#74b9ff;';
    const nameEl = document.createElement('p');
    nameEl.style.cssText = 'font-size:1.5rem;font-weight:bold;color:#eee;';
    box.insertBefore(numberEl, actionsEl);
    box.insertBefore(nameEl, actionsEl);
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Level';
    startBtn.className = 'modal-btn primary';
    startBtn.type = 'button';
    startBtn.addEventListener('click', () => this.startChapterLevel());
    actionsEl.appendChild(startBtn);
    return { el, numberEl, nameEl };
  }

  /** Build and attach the challenge-level warning modal; returns the overlay and its mutable sub-elements. */
  private _buildChallengeModal(): { el: HTMLElement; msgEl: HTMLElement; skipBtnEl: HTMLButtonElement } {
    const { el, box, actionsEl } = Game._buildModalShell('☠️ Challenge Level ☠️');
    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'font-size:0.95rem;color:#aaa;';
    msgEl.textContent = 'This is an optional challenge level. You may skip it without affecting your progress.';
    box.insertBefore(msgEl, actionsEl);
    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play Level';
    playBtn.className = 'modal-btn primary';
    playBtn.type = 'button';
    playBtn.addEventListener('click', () => this.playChallengeLevel());
    const skipBtnEl = document.createElement('button');
    skipBtnEl.textContent = 'Skip Level';
    skipBtnEl.className = 'modal-btn secondary';
    skipBtnEl.type = 'button';
    skipBtnEl.addEventListener('click', () => this.skipChallengeLevel());
    actionsEl.appendChild(playBtn);
    actionsEl.appendChild(skipBtnEl);
    return { el, msgEl, skipBtnEl };
  }

  /** Build and attach the exit-confirmation modal (shown when the player presses Esc mid-level). */
  private _buildExitConfirmModal(): HTMLElement {
    const { el, box, actionsEl } = Game._buildModalShell('🚪 Abandon Level?');
    const msgEl = document.createElement('p');
    msgEl.textContent = 'Your progress on this level will be lost.';
    box.insertBefore(msgEl, actionsEl);
    const exitBtn = document.createElement('button');
    exitBtn.textContent = 'Exit Level';
    exitBtn.className = 'modal-btn primary';
    exitBtn.type = 'button';
    exitBtn.addEventListener('click', () => {
      this._exitConfirmModalEl.style.display = 'none';
      this.exitToMenu();
    });
    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'Continue';
    continueBtn.className = 'modal-btn secondary';
    continueBtn.type = 'button';
    continueBtn.addEventListener('click', () => {
      this._exitConfirmModalEl.style.display = 'none';
      this.canvas.focus();
    });
    actionsEl.appendChild(exitBtn);
    actionsEl.appendChild(continueBtn);
    return el;
  }

  /** Build and attach the unplayable-level modal (shown when a level starts in a losing state). */
  private _buildUnplayableModal(): HTMLElement {
    const { el, box, actionsEl } = Game._buildModalShell('⚠️ Level Unplayable');
    const msgEl = document.createElement('p');
    msgEl.textContent = 'This level starts in a losing position and cannot be played.';
    box.insertBefore(msgEl, actionsEl);
    const exitBtn = document.createElement('button');
    exitBtn.textContent = 'Exit Level';
    exitBtn.className = 'modal-btn primary';
    exitBtn.type = 'button';
    exitBtn.addEventListener('click', () => {
      this._unplayableModalEl.style.display = 'none';
      this.exitToMenu();
    });
    actionsEl.appendChild(exitBtn);
    return el;
  }

  // ─── Screen transitions ───────────────────────────────────────────────────

  private _showLevelSelect(): void {
    this.screen = GameScreen.LevelSelect;
    this.levelSelectEl.style.display = 'flex';
    this.playScreenEl.style.display = 'none';
    if (this._chapterMapScreen) this._chapterMapScreen.screenEl.style.display = 'none';
    // Explicitly hide all modal overlays so they cannot cover the level-select
    // screen when returning from a completed or failed level.
    this.winModalEl.style.display = 'none';
    this.gameoverModalEl.style.display = 'none';
    this._newChapterModalEl.style.display = 'none';
    this._challengeModalEl.style.display = 'none';
    this._exitConfirmModalEl.style.display = 'none';
    this._unplayableModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    this._clearModalSparkle(this.gameoverModalEl);
    this._clearModalSparkle(this._newChapterModalEl);
    this._clearModalSparkle(this._challengeModalEl);
    this._pendingLevelId = null;
    clearConfetti();
    clearStarSparkles();
    // Clear particle arrays so stale drops don't persist on the level-select screen.
    this._clearAllParticles();
    // Reset modal menu button labels in case they were changed for playtesting.
    this.winMenuBtnEl.textContent = 'Level Select';
    this.gameoverMenuBtnEl.textContent = 'Level Select';
    // Restore the "Next Level" button visibility in case it was hidden for playtesting.
    this.winNextBtnEl.style.display = '';
    // Reset HUD exit button label in case it was changed for playtesting.
    this.exitBtnEl.textContent = '← Menu';
    this._winFromChapterMap = false;
    this._renderLevelList();
    // Scroll the active level's row into view near the center of the viewport.
    if (this.currentLevel) {
      const levelId = this.currentLevel.id;
      const levelRow = this.levelListEl.querySelector<HTMLElement>(`[data-level-id="${levelId}"]`);
      if (levelRow) {
        levelRow.scrollIntoView?.({ behavior: 'instant', block: 'center' });
      }
    }
  }

  // ─── Chapter map screen ──────────────────────────────────────────────────────

  /**
   * Show the chapter map screen for a chapter that has a grid map.
   * The screen shows the chapter's grid; level chambers can be clicked to start levels.
   */
  private _showChapterMap(chapterIdx: number): void {
    const campaign = this._activeCampaign;
    if (!campaign) return;
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter?.grid) return;

    // Build the chapter map screen lazily on first use
    if (!this._chapterMapScreen) {
      this._chapterMapScreen = new ChapterMapScreen({
        getDisplayProgress: () =>
          this._activeCampaign ? this._activeCampaignProgress : this.completedLevels,
        getActiveCampaignId: () => this._activeCampaign?.id ?? null,
        onShowLevelSelect: () => this._showLevelSelect(),
        onLevelSelected: (levelDef) => {
          this._winFromChapterMap = true;
          this.winMenuBtnEl.textContent = 'Chapter Map';
          if (levelDef.challenge) {
            this._pendingLevelId = levelDef.id;
            this.startLevel(levelDef.id);
            this._showChallengeLevelModal(false);
          } else {
            this.startLevel(levelDef.id);
          }
        },
        getActiveCampaign: () => this._activeCampaign,
        getCompletedChapters: () => this._activeCampaignCompletedChapters,
        onChapterSinkClicked: (chapterIdx) => this._onChapterSinkClicked(chapterIdx),
      });
    }

    this._chapterMapScreen.show(campaign, chapterIdx);
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display = 'none';
    this.screen = GameScreen.ChapterMap;
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

    const progress = this._activeCampaign ? this._activeCampaignProgress : this.completedLevels;
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
    menuBtn.addEventListener('click', () => { modal.remove(); this._showLevelSelect(); });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;margin-top:16px;gap:8px;';

    if (nextChapter) {
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next Chapter →';
      nextBtn.style.cssText = btnStyle + 'background:#1a3a10;border-color:#7ed321;color:#7ed321;';
      nextBtn.addEventListener('click', () => {
        modal.remove();
        this._showChapterMap(chapterIdx + 1);
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

    let overhead = PLAY_H1_H + PLAY_LEVEL_HEADER_H + PLAY_GAP + PLAY_HUD_H + PLAY_GAP + PLAY_PADDING_BOTTOM;
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
    this.hoverRotationDelta = 0;

    setTileSize(computeTileSize(level.rows, level.cols, this._computePlayOverhead(level)));
    this.canvas.width  = level.cols * TILE_SIZE;
    this.canvas.height = level.rows * TILE_SIZE;

    this.screen = GameScreen.Play;
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display  = 'flex';
    if (this._chapterMapScreen) this._chapterMapScreen.screenEl.style.display = 'none';
    this.winModalEl.style.display         = 'none';
    this.gameoverModalEl.style.display    = 'none';
    this._newChapterModalEl.style.display = 'none';
    this._challengeModalEl.style.display  = 'none';
    this._exitConfirmModalEl.style.display = 'none';
    this._unplayableModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    this._clearModalSparkle(this.gameoverModalEl);
    clearConfetti();
    clearStarSparkles();
    this._clearAllParticles();
    this._resetMetricBaselines();
  }

  /**
   * Check for an invalid initial board state (e.g. pre-connected tiles with
   * negative water impact) and display an error flash and tile highlight if
   * one is found.  Call this once immediately after a level is loaded.
   */
  private _checkAndShowInitialError(): void {
    if (!this.board) return;
    const initialError = this.board.checkInitialStateErrors();
    if (initialError) {
      this._showErrorFlash(initialError);
      if (this.board.lastErrorTilePositions && this.board.lastErrorTilePositions.length > 0) {
        this._startErrorHighlight(this.board.lastErrorTilePositions);
      }
    }
  }

  /** Start (or restart) the given level. */
  startLevel(levelId: number, existingDecorations?: readonly AmbientDecoration[]): void {
    // Look up the level in the active campaign; no-op if no campaign is active.
    if (!this._activeCampaign) return;
    let level: LevelDef | undefined;
    for (const ch of this._activeCampaign.chapters) {
      level = ch.levels.find((l) => l.id === levelId);
      if (level) break;
    }
    if (!level) return;

    this.currentLevel = level;
    this.board = new Board(level.rows, level.cols, level, existingDecorations);
    this._enterPlayScreenState(level);

    this._updateLevelHeader(levelId);
    this._refreshPlayUI();
    this._updateNoteHintBoxes(level);
    this.canvas.focus();

    this._checkAndShowInitialError();

    // If the level starts already in a losing state, show the unplayable modal.
    if (this.board.getCurrentWater() <= 0) {
      this._showModalWithAnimation(this._unplayableModalEl, 'sparkle-red');
    }
  }

  /** Update the level-header element with the current chapter, level number and name. */
  private _updateLevelHeader(levelId: number): void {
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
        this.levelHeaderEl.textContent =
          `${campaignPrefix}Chapter ${chapterNumber}: ${chapter.name}  ·  Level ${idx + 1}: ${level.name}${challengeSuffix}`;
        return;
      }
    }
    // Fallback if level isn't in any chapter
    this.currentChapterId = 0;
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === levelId);
    const challengeSuffix = level?.challenge ? '  💀' : '';
    this.levelHeaderEl.textContent = level ? `Level ${levelId}: ${level.name}${challengeSuffix}` : '';
  }

  /** Show or hide the note and hint boxes based on the current level's metadata. */
  private _updateNoteHintBoxes(level: LevelDef): void {
    // Note box
    if (level.note) {
      this.noteBoxEl.textContent = level.note;
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

  // ─── Level-select rendering ───────────────────────────────────────────────

  private _renderLevelList(): void {
    const campaignChapters = this._activeCampaign?.chapters ?? [];
    const displayProgress = this._activeCampaign ? this._activeCampaignProgress : this.completedLevels;
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
      this.levelListEl,
      displayProgress,
      (id) => this.requestLevel(id),
      () => { this.resetConfirmModalEl.style.display = 'flex'; },
      () => { this._rulesModalEl.style.display = 'flex'; },
      () => { this._openCampaignEditor(); },
      () => { this._unlockAll(); },
      activeCampaignInfo,
      campaignChapters,
      levelStars,
      levelWater,
      this._chapterExpandedState,
      (ci, expanded) => { this._chapterExpandedState.set(ci, expanded); },
      (ci) => this._showChapterMap(ci),
      this._activeCampaignCompletedChapters,
    );
  }

  // ─── Inventory bar rendering ──────────────────────────────────────────────

  private _renderInventoryBar(): void {
    if (!this.board) return;
    renderInventoryBar(
      this.inventoryBarEl,
      this.board,
      this.selectedShape,
      (shape, count) => this._handleInventoryClick(shape, count),
      () => this._handleInventoryRightClick(),
    );
    if (this._pendingSparkleShapes.size > 0) {
      for (const shape of this._pendingSparkleShapes) {
        const el = this.inventoryBarEl.querySelector(`[data-shape="${shape}"]`) as HTMLElement | null;
        if (el) {
          el.classList.remove('sparkle');
          void el.offsetWidth; // force reflow to restart the CSS animation
          el.classList.add('sparkle');
        }
      }
      this._pendingSparkleShapes.clear();
    }
    if (this._pendingRedSparkleShapes.size > 0) {
      for (const shape of this._pendingRedSparkleShapes) {
        const el = this.inventoryBarEl.querySelector(`[data-shape="${shape}"]`) as HTMLElement | null;
        if (el) {
          el.classList.remove('sparkle-red');
          void el.offsetWidth; // force reflow to restart the CSS animation
          el.classList.add('sparkle-red');
        }
      }
      this._pendingRedSparkleShapes.clear();
    }
    if (this._pendingGraySparkleShapes.size > 0) {
      for (const shape of this._pendingGraySparkleShapes) {
        const el = this.inventoryBarEl.querySelector(`[data-shape="${shape}"]`) as HTMLElement | null;
        if (el) {
          el.classList.remove('sparkle-gray');
          void el.offsetWidth; // force reflow to restart the CSS animation
          el.classList.add('sparkle-gray');
        }
      }
      this._pendingGraySparkleShapes.clear();
    }
  }

  private _handleInventoryClick(shape: PipeShape, count: number): void {
    if (this.gameState !== GameState.Playing) return;
    if (count < 0) {
      // Flash a red sparkle to signal the item is not selectable.
      this._pendingRedSparkleShapes.add(shape);
      this._renderInventoryBar();
      this.canvas.focus();
      return;
    }
    if (count === 0) return;
    if (this.selectedShape === shape) {
      // Clicking the already-selected item deselects it.
      this.selectedShape = null;
      this._renderInventoryBar();
      this.canvas.focus();
      return;
    }
    this.selectedShape = shape;
    this.pendingRotation = this.lastPlacedRotations.get(shape) ?? 0;
    this._renderInventoryBar();
    // Return focus to the canvas so Q/W rotation keys work immediately after
    // selecting an inventory piece without requiring a click on the board.
    this.canvas.focus();
  }

  private _handleInventoryRightClick(): void {
    if (this.gameState !== GameState.Playing) return;
    // Right-clicking any inventory tile deselects the currently selected item.
    if (this.selectedShape !== null) {
      this.selectedShape = null;
      this._renderInventoryBar();
      this.canvas.focus();
    }
  }

  // ─── Water display ────────────────────────────────────────────────────────

  /** Reset metric-sparkle baselines so the next {@link _updateWaterDisplay} call treats all values as initial (no sparkles fired). */
  private _resetMetricBaselines(): void {
    this._prevWater = null;
    this._prevTemp = null;
    this._prevFrozen = null;
    this._prevPressure = null;
    this._suppressNextMetricSparkles = true;
  }

  private _updateWaterDisplay(): void {
    if (!this.board) return;
    const suppressSparkles = this._suppressNextMetricSparkles;
    this._suppressNextMetricSparkles = false;

    const w = this.board.getCurrentWater();
    this.waterValueEl.textContent = `${w}`;
    let waterColor: string;
    if (w <= 0)      waterColor = LOW_WATER_COLOR;
    else if (w <= 5) waterColor = MEDIUM_WATER_COLOR;
    else             waterColor = WATER_COLOR;
    this.waterDisplayEl.style.color = waterColor;
    if (!suppressSparkles && this._prevWater !== null && w > this._prevWater) {
      // Per design: water sparkles only on increase (water can't meaningfully "decrease" as a good event).
      Game._spawnMetricSparkles(this.waterDisplayEl, METRIC_SPARKLE_GOLD);
    }
    this._prevWater = w;

    const tempValue = this.board.hasTempRelevantTiles() ? this.board.getCurrentTemperature() : null;
    Game._showStatRow(this.tempDisplayEl, this.tempValueEl, tempValue);
    if (!suppressSparkles && tempValue !== null && this._prevTemp !== null) {
      if (tempValue > this._prevTemp)      Game._spawnMetricSparkles(this.tempDisplayEl, METRIC_SPARKLE_GOLD);
      else if (tempValue < this._prevTemp) Game._spawnMetricSparkles(this.tempDisplayEl, METRIC_SPARKLE_BLUE);
    }
    this._prevTemp = tempValue;

    const frozenValue = this.board.frozen > 0 ? this.board.frozen : null;
    Game._showStatRow(this.frozenDisplayEl, this.frozenValueEl, frozenValue);
    if (!suppressSparkles) {
      if (frozenValue !== null && this._prevFrozen !== null) {
        if (frozenValue > this._prevFrozen)      Game._spawnMetricSparkles(this.frozenDisplayEl, METRIC_SPARKLE_BLUE);
        else if (frozenValue < this._prevFrozen) Game._spawnMetricSparkles(this.frozenDisplayEl, METRIC_SPARKLE_RED);
      } else if (frozenValue !== null && this._prevFrozen === null) {
        // Row just became visible (frozen increased from 0): show sparkle.
        Game._spawnMetricSparkles(this.frozenDisplayEl, METRIC_SPARKLE_BLUE);
      }
    }
    this._prevFrozen = frozenValue;

    const pressureValue = this.board.hasPressureRelevantTiles() ? this.board.getCurrentPressure() : null;
    Game._showStatRow(this.pressureDisplayEl, this.pressureValueEl, pressureValue);
    if (!suppressSparkles && pressureValue !== null && this._prevPressure !== null) {
      if (pressureValue > this._prevPressure)      Game._spawnMetricSparkles(this.pressureDisplayEl, METRIC_SPARKLE_GOLD);
      else if (pressureValue < this._prevPressure) Game._spawnMetricSparkles(this.pressureDisplayEl, METRIC_SPARKLE_BLUE);
    }
    this._prevPressure = pressureValue;
  }

  /**
   * Refresh the three HUD elements that must stay in sync after every board mutation
   * or undo/redo: the inventory bar, the water/temp/pressure display, and the
   * undo/redo button enabled states.
   *
   * Call this instead of the three individual methods whenever all three need to be
   * updated together (which is the common case).
   */
  private _refreshPlayUI(): void {
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
  }

  // ─── Main render loop ──────────────────────────────────────────────────────

  private _loop(): void {
    if (this.screen === GameScreen.Play) {
      this._renderBoard();
      renderAnimations(this.ctx, this._animations, this.canvas.width);
      this._tickSourceSpray();
      this._tickBubbles();
      this._tickLeakySpray();
      this._tickWinFlow();
      this._tickVortex();
    }
    requestAnimationFrame(() => this._loop());
  }

  /** Spawn and render the source spray drops (runs every frame during play). */
  private _tickSourceSpray(): void {
    if (!this.board) return;
    const now = performance.now();
    const sx = this.board.source.col * TILE_SIZE + TILE_SIZE / 2;
    const sy = this.board.source.row * TILE_SIZE + TILE_SIZE / 2;
    if (this.gameState === GameState.GameOver) {
      // Tank ran dry: show puffs of dry air bursting from the source.
      if (now - this._lastSpraySpawn >= DRY_PUFF_SPAWN_INTERVAL_MS) {
        spawnDryPuff(this._dryPuffs);
        this._lastSpraySpawn = now;
      }
      renderDryPuffs(this.ctx, this._dryPuffs, sx, sy);
    } else {
      // Normal play: show water drops spraying from the source.
      if (now - this._lastSpraySpawn >= SPRAY_SPAWN_INTERVAL_MS) {
        spawnSourceSprayDrop(this._sourceSprayDrops);
        this._lastSpraySpawn = now;
      }
      renderSourceSpray(this.ctx, this._sourceSprayDrops, sx, sy, WATER_COLOR);
    }
  }

  /**
   * Spawn and render fizzing bubble particles inside connected pipe tiles.
   * Runs every frame during play to give a sense of liquid flowing in the pipes.
   */
  private _tickBubbles(): void {
    if (!this.board) return;
    const filledPositions = this.board.getFilledPositions();
    // Only show bubbles when at least one regular pipe tile is in the fill path.
    if (filledPositions.size <= 2) return; // source + sink only → nothing to show
    const now = performance.now();
    // Spawn a new bubble roughly every 90 ms (~11 per second).
    if (now - this._lastBubbleSpawn >= BUBBLE_SPAWN_INTERVAL_MS) {
      spawnBubble(this._bubbles, this.board, filledPositions);
      this._lastBubbleSpawn = now;
    }
    renderBubbles(this.ctx, this._bubbles, WATER_COLOR);
  }

  /**
   * Spawn and render water-droplet spray particles from connected leaky pipe tiles.
   * Only runs during normal play (not game-over or won state) when at least one
   * leaky pipe is connected to the source.
   */
  private _tickLeakySpray(): void {
    if (!this.board || this.gameState !== GameState.Playing) return;
    const filledPositions = this.board.getFilledPositions();
    // Check if any leaky pipe is in the fill path.
    const hasLeakyPipe = [...filledPositions].some((key) => {
      const [r, c] = parseKey(key);
      const tile = this.board?.grid[r]?.[c];
      return tile !== undefined && LEAKY_PIPE_SHAPES.has(tile.shape);
    });
    if (!hasLeakyPipe) {
      this._leakySprayDrops = [];
      return;
    }
    const now = performance.now();
    if (now - this._lastLeakySpraySpawn >= LEAKY_SPRAY_SPAWN_INTERVAL_MS) {
      spawnLeakySprayDrop(this._leakySprayDrops, this.board, filledPositions);
      this._lastLeakySpraySpawn = now;
    }
    renderLeakySpray(this.ctx, this._leakySprayDrops, WATER_COLOR);
  }

  /** Spawn and render the win-flow drops (only active in the Won state). */
  private _tickWinFlow(): void {
    if (this.gameState !== GameState.Won || !this.board || !this._flowGoodDirs) return;
    const now = performance.now();
    // Spawn a new drop roughly every 70 ms to maintain ~5 drops per tile at steady state.
    if (now - this._lastFlowSpawn >= WIN_FLOW_SPAWN_INTERVAL_MS) {
      spawnFlowDrop(this._flowDrops, this.board, this._flowGoodDirs, this._flowMaxDrops);
      this._lastFlowSpawn = now;
    }
    renderFlowDrops(this.ctx, this._flowDrops, this.board, WATER_COLOR, this._flowGoodDirs);
  }

  /**
   * Spawn and render the spinning vortex particle effect over the sink tile.
   * Runs every frame during play to give a visual cue that water flows into
   * the sink.  Uses the sink tile's current color (filled vs unfilled).
   */
  private _tickVortex(): void {
    if (!this.board) return;
    const { sink } = this.board;
    const sinkCx = sink.col * TILE_SIZE + TILE_SIZE / 2;
    const sinkCy = sink.row * TILE_SIZE + TILE_SIZE / 2;
    const isSinkFilled = this.board.isSolved();
    const color = isSinkFilled ? SINK_WATER_COLOR : SINK_COLOR;
    const now = performance.now();
    if (now - this._lastVortexSpawn >= VORTEX_SPAWN_INTERVAL_MS) {
      spawnVortexParticle(this._vortexParticles);
      this._lastVortexSpawn = now;
    }
    renderVortex(this.ctx, this._vortexParticles, sinkCx, sinkCy, color);
  }

  private _renderBoard(): void {
    if (!this.board) return;
    const now = performance.now();
    const currentTemp = this.board.getCurrentTemperature();
    const currentPressure = this.board.getCurrentPressure();

    // Build per-frame animation overrides for the renderer.
    const rotationOverrides = computeRotationOverrides(this._rotationAnims, now);
    const fillExclude = computeActiveFillKeys(this._fillAnims, now);

    renderBoard(
      this.ctx,
      this.canvas,
      this.board,
      this.focusPos,
      this.selectedShape,
      this.pendingRotation,
      this.mouseCanvasPos,
      this.shiftHeld,
      currentTemp,
      currentPressure,
      this._errorHighlightKeys,
      this.hoverRotationDelta,
      rotationOverrides,
      fillExclude,
    );

    // Draw fill-animation overlays on top of the board (tiles rendered as dry above).
    if (this._fillAnims.length > 0) {
      // Build a map of connections for each animating tile.
      const tileConnectionsMap = new Map<string, Set<Direction>>();
      for (const anim of this._fillAnims) {
        const tile = this.board.getTile(anim);
        if (tile) {
          tileConnectionsMap.set(`${anim.row},${anim.col}`, tile.connections);
        }
      }
      renderFillAnims(this.ctx, this._fillAnims, tileConnectionsMap, LINE_WIDTH, now);
      // Draw container (Chamber) tile reveal animations: wipe from the entry edge
      // to the opposite edge, showing the connected state progressively.
      renderContainerFillAnims(
        this.ctx, this.board, this._fillAnims,
        this.board.getCurrentWater(), this.shiftHeld, currentTemp, currentPressure, now,
      );
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

  /** Show the new-chapter intro modal for the given chapter (by 0-based index). */
  private _showNewChapterModal(chapterIdx: number, chapter: ChapterDef): void {
    this._newChapterNumberEl.textContent = `Chapter ${chapterIdx + 1}`;
    this._newChapterNameEl.textContent = chapter.name;
    this._newChapterModalEl.style.display = 'flex';
    this._triggerModalSparkle(this._newChapterModalEl, 'sparkle-blue');
  }

  /** Show the challenge-level warning modal.
   * @param canSkip When true, show the skip button and skip description (sequential flow).
   *                When false, hide them (player directly selected this level).
   */
  private _showChallengeLevelModal(canSkip: boolean): void {
    this._challengeMsgEl.style.display    = canSkip ? '' : 'none';
    this._challengeSkipBtnEl.style.display = canSkip ? '' : 'none';
    this._challengeModalEl.style.display = 'flex';
    this._triggerModalSparkle(this._challengeModalEl, 'sparkle-yellow');
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
    this._showModalWithAnimation(this.gameoverModalEl, 'sparkle-red');
  }

  /** Transition the game to the Won state and show the win modal after confetti. */
  private _showWin(): void {
    if (!this.board || !this.currentLevel) return;
    this.gameState = GameState.Won;
    this._flowGoodDirs = computeFlowGoodDirs(this.board);
    // Scale max drops to ~5 per tile in the solution path (min 10).
    const pathLength = this.board.getFilledPositions().size;
    this._flowMaxDrops = Math.max(10, pathLength * 5);
    const starsCollected = this.board.getStarsCollected();
    const waterRemaining = this.board.getCurrentWater();
    const isChallenge = !!this.currentLevel.challenge;
    this._markLevelCompleted(this.currentLevel.id);
    this._saveStars(this.currentLevel.id, starsCollected);
    // Load previous best before saving so we can detect a new personal record.
    // Skip the comparison during playtesting (data isn't persisted in that mode).
    let previousBest: number | undefined;
    if (!this._playtestExitCallback) {
      previousBest = loadLevelWater(this._activeCampaign?.id)[this.currentLevel.id] as number | undefined;
    }
    this._saveWater(this.currentLevel.id, waterRemaining);
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
    // Spawn confetti first; show win modal only after the confetti effect completes.
    spawnConfetti(() => {
      if (this.gameState !== GameState.Won) return;
      this._showModalWithAnimation(this.winModalEl, 'sparkle-gold');
      // Spawn golden sparkles over the star icon in the win modal when stars were collected
      if (starsCollected > 0 && this.winStarsEl) {
        const winStarsEl = this.winStarsEl;
        // Short delay so the modal finishes rendering and is positioned before
        // getBoundingClientRect() is called.
        setTimeout(() => {
          const rect = winStarsEl.getBoundingClientRect();
          spawnStarSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2, 30);
        }, MODAL_SPARKLE_DELAY_MS);
      }
    });
  }

  // ─── Input handlers ────────────────────────────────────────────────────────

  /**
   * Convert a mouse event's client coordinates into a grid {@link GridPos} using
   * the current canvas bounding rectangle and tile size.
   */
  private _getGridPosFromEvent(e: MouseEvent): GridPos {
    const rect = this.canvas.getBoundingClientRect();
    return {
      row: Math.floor((e.clientY - rect.top)  / TILE_SIZE),
      col: Math.floor((e.clientX - rect.left) / TILE_SIZE),
    };
  }

  /**
   * Convert the current {@link mouseCanvasPos} into a grid {@link GridPos}.
   * Returns `null` when no mouse position is available.
   */
  private _getHoverGridPos(): GridPos | null {
    if (!this.mouseCanvasPos) return null;
    return {
      row: Math.floor(this.mouseCanvasPos.y / TILE_SIZE),
      col: Math.floor(this.mouseCanvasPos.x / TILE_SIZE),
    };
  }

  private _handleCanvasMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      if (this.screen !== GameScreen.Play) return;
      if (this.gameState !== GameState.Playing) return;
      if (!this.board) return;
      const { row, col } = this._getGridPosFromEvent(e);
      this._isRightDragging = true;
      this._rightDragLastTile = { row, col };
      this._suppressNextContextMenu = false;
      return;
    }
    if (e.button !== 0) return;
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (this.selectedShape === null) return; // No shape selected; click/rotation handled separately

    const { row, col } = this._getGridPosFromEvent(e);
    this._isDragging = true;
    this._dragLastTile = { row, col };
    this._suppressNextClick = false;
  }

  private _handleCanvasMouseUp(e: MouseEvent): void {
    if (e.button === 2) {
      if (!this._isRightDragging) return;
      // Remove the tile at the final (current) position and suppress the contextmenu event.
      if (this._rightDragLastTile && this.board &&
          this.gameState === GameState.Playing && this.screen === GameScreen.Play) {
        const tile = this.board.getTile(this._rightDragLastTile);
        if (!tile || tile.shape === PipeShape.Empty || SPIN_PIPE_SHAPES.has(tile.shape)) {
          // Right-clicking an empty tile or a spinner: clear any pending inventory selection.
          if (this.selectedShape !== null) {
            this.selectedShape = null;
            this._renderInventoryBar();
          }
        } else {
          this._reclaimTileAt(this._rightDragLastTile);
        }
      }
      this._suppressNextContextMenu = true;
      this._cancelRightDrag();
      return;
    }
    if (e.button !== 0) return;
    if (!this._isDragging) return;

    // If the drag moved to at least one new tile the final hovered tile is still
    // a "pending preview" – place it now and suppress the click event that follows.
    if (this._dragLastTile && this.selectedShape !== null &&
        this.board && this.gameState === GameState.Playing &&
        this.screen === GameScreen.Play) {
      const pos = this._dragLastTile;
      const tile = this.board.getTile(pos);
      // Spinner tiles cannot be replaced; skip placement so the click event can rotate them.
      if (tile && !SPIN_PIPE_SHAPES.has(tile.shape)) {
        const filledBefore = this.board.getFilledPositions();
        if (this._tryPlaceOrReplaceSelectedAt(pos, tile, filledBefore)) {
          this._suppressNextClick = true;
        }
      }
    }

    this._cancelDrag();
  }

  /** Resets left-drag-paint state. */
  private _cancelDrag(): void {
    this._isDragging = false;
    this._dragLastTile = null;
  }

  /** Resets right-drag-erase state. */
  private _cancelRightDrag(): void {
    this._isRightDragging = false;
    this._rightDragLastTile = null;
  }

  /**
   * Returns the tile currently under the mouse cursor if it is eligible for
   * hover-rotation preview (non-fixed, non-empty, non-spin pipe), otherwise null.
   * Also bumps hoverRotationDelta by `steps` (±1) when a valid tile is found.
   */
  private _tryAdjustHoverRotation(steps: 1 | -1): boolean {
    if (!this.mouseCanvasPos || !this.board) return false;
    const hPos = this._getHoverGridPos()!;
    const hTile = this.board.getTile(hPos);
    if (!hTile || hTile.isFixed || hTile.shape === PipeShape.Empty || SPIN_PIPE_SHAPES.has(hTile.shape)) {
      return false;
    }
    this.hoverRotationDelta = ((this.hoverRotationDelta + steps + 4) % 4);
    return true;
  }

  /**
   * Reset all per-level particle arrays to empty.
   * Call whenever a new level begins or when returning to the level-select
   * screen so stale particles from a previous session don't carry over.
   */
  private _clearAllParticles(): void {
    this._sourceSprayDrops = [];
    this._dryPuffs = [];
    this._flowDrops = [];
    this._bubbles = [];
    this._leakySprayDrops = [];
    this._vortexParticles = [];
    this._flowGoodDirs = null;
    this._rotationAnims = [];
    this._fillAnims = [];
  }

  /**
   * Reclaims (removes) the tile at pos, records the move, and updates UI.
   * Shared by both single right-click and right-drag-erase.
   */
  private _reclaimTileAt(pos: GridPos): void {
    if (!this.board) return;
    const tileBeforeReclaim = this.board.grid[pos.row]?.[pos.col];
    const reclaimedShape = tileBeforeReclaim?.shape;
    const reclaimedRotation = tileBeforeReclaim?.rotation ?? 0;
    const hadNoSelection = this.selectedShape === null;
    const filledBefore = this.board.getFilledPositions();
    if (this.board.reclaimTile(pos)) {
      this._completeAnims();
      this.board.applyTurnDelta();
      this.board.recordMove();
      this._spawnDisconnectionAnimations(filledBefore, tileBeforeReclaim, pos.row, pos.col);
      this._spawnLockedCostChangeAnimations();
      this._spawnCementDecrementAnimation();
      this._deselectIfDepleted();
      if (hadNoSelection && reclaimedShape !== undefined) {
        this.selectedShape = reclaimedShape;
        this.pendingRotation = reclaimedRotation;
      }
      this._refreshPlayUI();
      this._checkWinLoseAfterMove();
    } else if (this.board.lastError) {
      this._handleBoardError();
    }
  }

  /**
   * Immediately complete any in-progress pipe rotation or fill animations,
   * discarding all intermediate state.  Call this before processing a new
   * player action so the board snaps to its final state before new animations
   * are spawned.
   */
  private _completeAnims(): void {
    this._rotationAnims = [];
    this._fillAnims = [];
  }

  /**
   * Spawn pipe-fill animations for all tiles that became newly connected since
   * `filledBefore` was captured.  Tiles are animated in BFS order, each one
   * starting after the previous tile's animation completes.
   *
   * @param startDelay - Extra milliseconds to wait before the first tile begins
   *   filling.  Pass `ROTATION_ANIM_DURATION` when a rotation animation is
   *   playing so the fill starts only after the rotation completes.
   *
   * Not called during undo/redo – those actions snap to the final state
   * without playing visual animations.
   */
  private _spawnFillAnims(filledBefore: Set<string>, startDelay = 0): void {
    if (!this.board) return;
    const order = computeFillOrder(this.board, filledBefore);
    if (order.length === 0) return;
    const now = performance.now();
    const sinkKey = posKey(this.board.sink.row, this.board.sink.col);
    for (let i = 0; i < order.length; i++) {
      const { row, col, entryDir, blockedDir, depth } = order[i];
      const key = posKey(row, col);
      const isSink = key === sinkKey;
      // Resolve the water color that matches how this tile is drawn when filled.
      const tile = this.board.getTile({ row, col });
      // Container tiles (Source, Chamber) are included in the animation so their
      // display is held at the pre-connected appearance (via fillExclude) until the
      // water-flow wave reaches them.  No water overlay is drawn on top of them;
      // they simply switch to their connected appearance once the entry expires.
      const isContainer = tile !== null && !isSink &&
        !PIPE_SHAPES.has(tile.shape) && !GOLD_PIPE_SHAPES.has(tile.shape) &&
        !SPIN_PIPE_SHAPES.has(tile.shape) && !LEAKY_PIPE_SHAPES.has(tile.shape);
      if (isContainer) {
        this._fillAnims.push({
          row, col, entryDir, blockedDir, isContainer: true,
          startTime: now + startDelay + depth * FILL_ANIM_DURATION,
        });
        continue;
      }
      let waterColor: string | undefined;
      if (tile) {
        if (GOLD_PIPE_SHAPES.has(tile.shape)) waterColor = GOLD_PIPE_WATER_COLOR;
        else if (LEAKY_PIPE_SHAPES.has(tile.shape)) waterColor = LEAKY_PIPE_WATER_COLOR;
        else if (SPIN_PIPE_SHAPES.has(tile.shape) || tile.isFixed) waterColor = FIXED_PIPE_WATER_COLOR;
      }
      this._fillAnims.push({
        row, col, entryDir, blockedDir, isSink, waterColor,
        startTime: now + startDelay + depth * FILL_ANIM_DURATION,
      });
    }
  }

  /**
   * Called after successfully rotating any tile (spinner or regular pipe).
   * Records the move, updates animations, and refreshes all dependent UI.
   * Shared by click, wheel, and keyboard rotation paths.
   *
   * @param filledBefore - Filled positions snapshot taken before the rotation.
   * @param rotationInfo - When provided, a pipe-rotation animation is spawned
   *   for the rotated tile from `oldRotation` to the tile's current rotation.
   *   Any subsequent fill animation is delayed until after the rotation completes.
   */
  private _afterTileRotated(
    filledBefore: Set<string>,
    rotationInfo?: { row: number; col: number; oldRotation: number },
  ): void {
    if (!this.board) return;
    this._completeAnims();
    this.board.applyTurnDelta();
    this.board.recordMove();
    let fillDelay = 0;
    if (rotationInfo) {
      const tile = this.board.getTile(rotationInfo);
      if (tile) {
        this._rotationAnims.push({
          row: rotationInfo.row,
          col: rotationInfo.col,
          oldRotation: rotationInfo.oldRotation,
          newRotation: tile.rotation,
          startTime: performance.now(),
        });
        // Fill animations begin only after the rotation animation completes.
        fillDelay = ROTATION_ANIM_DURATION;
      }
    }
    this._spawnConnectionAnimations(filledBefore);
    this._spawnDisconnectionAnimations(filledBefore);
    this._spawnFillAnims(filledBefore, fillDelay);
    this._spawnLockedCostChangeAnimations();
    this._spawnCementDecrementAnimation();
    this._refreshPlayUI();
    this._checkWinLoseAfterMove();
  }


  /**
   * If the mouse is currently hovering a spinner tile, rotate it by `steps`
   * clockwise quarter-turns and update the UI.  Returns true on success.
   */
  private _tryRotateHoverSpinner(steps: number): boolean {
    if (!this.mouseCanvasPos || !this.board) return false;
    const hPos = this._getHoverGridPos()!;
    const hTile = this.board.getTile(hPos);
    if (!hTile || !SPIN_PIPE_SHAPES.has(hTile.shape)) return false;
    const filledBefore = this.board.getFilledPositions();
    const oldRotation = hTile.rotation;
    if (this.board.rotateTileBy(hPos, steps)) {
      this._afterTileRotated(filledBefore, { row: hPos.row, col: hPos.col, oldRotation });
      return true;
    } else if (this.board.lastError) {
      this._handleBoardError();
    }
    return false;
  }

  private _handleCanvasClick(e: MouseEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (!this.board) return;

    // The drag gesture already handled placement; swallow the click event.
    if (this._suppressNextClick) {
      this._suppressNextClick = false;
      return;
    }

    const pos = this._getGridPosFromEvent(e);
    const tile = this.board.getTile(pos);
    if (!tile) return;

    const filledBefore = this.board.getFilledPositions();

    if (SPIN_PIPE_SHAPES.has(tile.shape)) {
      // Spinnable pipes are always rotated on click (cannot be replaced or removed).
      // Shift+click rotates CCW (3 steps); plain click rotates CW (1 step).
      const steps = e.shiftKey ? 3 : 1;
      const oldRotation = tile.rotation;
      if (this.board.rotateTileBy(pos, steps)) {
        // Sync the pending placement rotation so the ghost image stays aligned.
        if (this.selectedShape === tile.shape) {
          this.pendingRotation = tile.rotation as Rotation;
        }
        this._afterTileRotated(filledBefore, { row: pos.row, col: pos.col, oldRotation });
      } else if (this.board.lastError) {
        this._handleBoardError();
      }
    } else if (this.selectedShape !== null &&
               (tile.shape === PipeShape.Empty ||
                tile.shape !== this.selectedShape ||
                tile.rotation !== this.pendingRotation)) {
      // Place on an empty cell or replace a tile with a different shape/rotation.
      // When tile already matches exactly (same shape+rotation), fall through to rotate.
      this._tryPlaceOrReplaceSelectedAt(pos, tile, filledBefore);
    } else if (tile.shape !== PipeShape.Empty) {
      // Rotate existing pipe (no inventory item selected, or same shape+rotation as selected).
      // If the user has previewed multiple rotations via Q/W/wheel, apply all of them
      // as a single game turn; otherwise fall back to a standard single 90° rotation.
      const delta = this.hoverRotationDelta;
      this.hoverRotationDelta = 0;
      const oldRotation = tile.rotation;
      const rotated = delta > 0
        ? this.board.rotateTileBy(pos, delta)
        : e.shiftKey ? this.board.rotateTileBy(pos, 3) : this.board.rotateTile(pos);
      if (rotated) {
        // Sync the pending placement rotation so the ghost image stays aligned.
        if (this.selectedShape === tile.shape) {
          this.pendingRotation = tile.rotation as Rotation;
        }
        this._afterTileRotated(filledBefore, { row: pos.row, col: pos.col, oldRotation });
      } else if (this.board.lastError) {
        this._handleBoardError();
      }
    }
  }

  private _handleCanvasRightClick(e: MouseEvent): void {
    e.preventDefault();
    // Suppress if the right-drag gesture already handled the removal.
    if (this._suppressNextContextMenu) {
      this._suppressNextContextMenu = false;
      return;
    }
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (!this.board) return;

    const pos = this._getGridPosFromEvent(e);

    // Right-clicking outside the grid (including inventory bar and other UI): deselect.
    if (pos.row < 0 || pos.row >= this.board.rows || pos.col < 0 || pos.col >= this.board.cols) {
      if (this.selectedShape !== null) {
        this.selectedShape = null;
        this._renderInventoryBar();
      }
      return;
    }

    const tile = this.board.getTile(pos);

    // Right-clicking an empty tile or a spinner: clear any pending inventory selection.
    if (tile && (tile.shape === PipeShape.Empty || SPIN_PIPE_SHAPES.has(tile.shape))) {
      if (this.selectedShape !== null) {
        this.selectedShape = null;
        this._renderInventoryBar();
      }
      return;
    }

    this._reclaimTileAt(pos);
  }

  private _handleCanvasMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const prevPos = this._getHoverGridPos();
    this.mouseCanvasPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const newPos = this._getHoverGridPos()!;
    if (newPos.row !== prevPos?.row || newPos.col !== prevPos?.col) {
      this.hoverRotationDelta = 0;
    }
    if (this.ctrlHeld && this.gameState === GameState.Playing) {
      this._showTooltip(e.clientX, e.clientY);
    }

    // Drag-paint: place at the OLD tile each time the cursor enters a new grid cell.
    if (this._isDragging && this.selectedShape !== null &&
        this.board && this.screen === GameScreen.Play &&
        this.gameState === GameState.Playing) {
      const { row, col } = newPos;
      const last = this._dragLastTile;
      if (last && (row !== last.row || col !== last.col)) {
        // Moved to a new tile: place at the tile we just left.
        const oldTile = this.board.getTile(last);
        if (oldTile) {
          const filledBefore = this.board.getFilledPositions();
          this._tryPlaceOrReplaceSelectedAt(last, oldTile, filledBefore);
        }
        this._dragLastTile = { row, col };
      }
    }

    // Drag-erase: reclaim the OLD tile each time the cursor enters a new grid cell.
    if (this._isRightDragging && this.board && this.screen === GameScreen.Play &&
        this.gameState === GameState.Playing) {
      const { row, col } = newPos;
      const last = this._rightDragLastTile;
      if (last && (row !== last.row || col !== last.col)) {
        // Moved to a new tile: reclaim the tile we just left.
        this._reclaimTileAt(last);
        this._rightDragLastTile = { row, col };
      }
    }
  }

  /** Rotate `pendingRotation` 90° clockwise (for wheel/keyboard placement rotation). */
  private _rotatePendingCW(): void {
    this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
  }

  /** Rotate `pendingRotation` 90° counter-clockwise (for wheel/keyboard placement rotation). */
  private _rotatePendingCCW(): void {
    this.pendingRotation = ((this.pendingRotation - 90 + 360) % 360) as Rotation;
  }

  private _handleCanvasWheel(e: WheelEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (this.mouseCanvasPos && this.board) {
      const hPos = this._getHoverGridPos()!;
      const hTile = this.board.getTile(hPos);
      if (hTile && SPIN_PIPE_SHAPES.has(hTile.shape)) {
        // Spin pipes always take priority: scroll down → CW (1 step), scroll up → CCW (3 steps = -1 mod 4)
        const steps = e.deltaY > 0 ? 1 : 3;
        const filledBefore = this.board.getFilledPositions();
        const oldRotation = hTile.rotation;
        if (this.board.rotateTileBy(hPos, steps)) {
          e.preventDefault();
          this._afterTileRotated(filledBefore, { row: hPos.row, col: hPos.col, oldRotation });
        } else if (this.board.lastError) {
          this._handleBoardError();
        }
        return;
      }
    }
    if (this.selectedShape !== null) {
      e.preventDefault();
      // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise
      if (e.deltaY > 0) {
        this._rotatePendingCW();
      } else {
        this._rotatePendingCCW();
      }
    } else if (this.mouseCanvasPos && this.board) {
      // No inventory selected and not a spin pipe: preview rotation on hovered tile.
      // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise.
      const changed = this._tryAdjustHoverRotation(e.deltaY > 0 ? 1 : -1);
      if (changed) e.preventDefault();
    }
  }

  private _handleDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this._rulesModalEl.style.display !== 'none') {
      this._rulesModalEl.style.display = 'none';
      this.canvas.focus();
      return;
    }
    if (e.key === 'Control' && !this.ctrlHeld) {
      this.ctrlHeld = true;
      if (this.gameState === GameState.Playing && this.mouseCanvasPos) {
        const rect = this.canvas.getBoundingClientRect();
        this._showTooltip(
          this.mouseCanvasPos.x + rect.left,
          this.mouseCanvasPos.y + rect.top,
        );
      }
    }
    if (e.key === 'Shift' && !this.shiftHeld) {
      this.shiftHeld = true;
      if (this.screen === GameScreen.Play && this.gameState === GameState.Playing) {
        this._selectNextAvailableInventory();
      }
    }
    if (e.ctrlKey && e.key === 'z' && this.screen === GameScreen.Play) {
      e.preventDefault();
      if (this.gameState === GameState.Playing) this.performUndo();
    }
    if (e.ctrlKey && e.key === 'y' && this.screen === GameScreen.Play) {
      e.preventDefault();
      if (this.gameState === GameState.Playing) this.performRedo();
    }
    if (e.key === 'Backspace' && this.screen === GameScreen.Play) {
      e.preventDefault();
      if (this.gameState === GameState.Playing || this.gameState === GameState.GameOver || this.gameState === GameState.Won) this.performUndo();
    }
  }

  private _handleDocKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Control') {
      this.ctrlHeld = false;
      this._hideTooltip();
    }
    if (e.key === 'Shift') {
      this.shiftHeld = false;
    }
  }

  /** Returns the formula text "(deltaTemp° x cost)" for ice tile tooltips. */
  private _iceCostFormula(deltaTemp: number, cost: number): string {
    return `(${deltaTemp}° x ${cost})`;
  }

  /** Returns the formula text "(deltaTemp° x ⌈cost/pressureP⌉=effectiveCost)" for snow tile tooltips. */
  private _snowCostFormula(deltaTemp: number, pressure: number, cost: number): string {
    const effectiveCost = pressure >= 1 ? Math.ceil(cost / pressure) : cost;
    return `(${deltaTemp}° x ⌈${cost}/${pressure}P⌉=${effectiveCost})`;
  }

  /** Returns the formula text "(deltaTemp° x ⌈cost/(pressure-hardness)P⌉=effectiveCost)" for sandstone tile tooltips.
   * Requires (pressure - tile.hardness) >= 1; callers must check this precondition. */
  private _sandstoneCostFormula(deltaTemp: number, pressure: number, tile: Tile): string {
    const deltaDamage = pressure - tile.hardness;
    const effectiveCost = deltaDamage >= 1 ? Math.ceil(tile.cost / deltaDamage) : 0;
    return `(${deltaTemp}° x ⌈${tile.cost}/(${pressure}-${tile.hardness})P⌉=${effectiveCost})`;
  }

  /** Returns the formula text "(tileTemp+envTemp° x cost)" for hot plate tile tooltips. */
  private _hotPlateCostFormula(tileTemp: number, envTemp: number, cost: number): string {
    return `(${tileTemp}+${envTemp}° x ${cost})`;
  }

  /**
   * Append cost-related tooltip text for a chamber tile that is **already connected**
   * (locked-in values are used).
   * @returns The updated tooltip string.
   */
  private _tooltipForConnectedChamber(
    tooltipText: string,
    tile: Tile,
    pos: { row: number; col: number },
    lockedImpact: number,
  ): string {
    if (!this.board) return tooltipText;
    const lockedCost = Math.abs(lockedImpact);
    const content = tile.chamberContent;
    if (content !== null && COLD_CHAMBER_CONTENTS.has(content)) {
      const lockedTemp = this.board.getLockedConnectTemp(pos) ?? 0;
      const lockedPressure = this.board.getLockedConnectPressure(pos) ?? 1;
      const lockedDeltaTemp = computeDeltaTemp(tile.temperature, lockedTemp);
      if (content === 'ice') {
        return tooltipText + `\n${this._iceCostFormula(lockedDeltaTemp, tile.cost)} cost: ${lockedCost}`;
      } else if (content === 'snow') {
        return tooltipText + `\n${this._snowCostFormula(lockedDeltaTemp, lockedPressure, tile.cost)} cost: ${lockedCost}`;
      } else {
        // sandstone
        const shatterActive = tile.shatter > tile.hardness;
        const isShatterTriggered = shatterActive && lockedPressure >= tile.shatter;
        if (isShatterTriggered) {
          return tooltipText + `\n[${lockedPressure}P ≥ ${tile.shatter}S] Cost: 0`;
        }
        const lockedDeltaDamage = lockedPressure - tile.hardness;
        if (lockedDeltaDamage >= 1) {
          return tooltipText + `\n${this._sandstoneCostFormula(lockedDeltaTemp, lockedPressure, tile)} cost: ${lockedCost}`;
        }
        return tooltipText + `\ncost: ${lockedCost}`;
      }
    } else if (content === 'hot_plate') {
      const lockedGain = this.board.getLockedHotPlateGain(pos);
      const lockedTemp = this.board.getLockedConnectTemp(pos) ?? 0;
      if (lockedGain !== null) {
        const loss = Math.max(0, lockedGain - lockedImpact);
        return tooltipText + `\n${this._hotPlateCostFormula(tile.temperature, lockedTemp, tile.cost)} (+${lockedGain} -${loss})`;
      }
    }
    return tooltipText;
  }

  /**
   * Append cost-related tooltip text for a chamber tile that is **not yet connected**
   * (predicted cost using current live stats).
   * @returns The updated tooltip string, with predicted cost appended if non-zero.
   */
  private _tooltipForUnconnectedChamber(tooltipText: string, tile: Tile): string {
    if (!this.board) return tooltipText;
    const content = tile.chamberContent;
    let predictedCost: number | null = null;

    if (content === 'dirt') {
      return tooltipText + ' water';
    } else if (content === 'ice') {
      const currentTemp = this.board.getCurrentTemperature();
      const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
      tooltipText += `\n${this._iceCostFormula(deltaTemp, tile.cost)}`;
      predictedCost = tile.cost * deltaTemp;
    } else if (content === 'snow') {
      const currentTemp = this.board.getCurrentTemperature();
      const currentPressure = this.board.getCurrentPressure();
      const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
      tooltipText += `\n${this._snowCostFormula(deltaTemp, currentPressure, tile.cost)}`;
      predictedCost = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
    } else if (content === 'sandstone') {
      const currentTemp = this.board.getCurrentTemperature();
      const currentPressure = this.board.getCurrentPressure();
      const { shatterOverride, deltaDamage, costPerDeltaTemp } =
        sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
      if (shatterOverride) {
        tooltipText += `\n[${currentPressure}P ≥ ${tile.shatter}S] Cost: 0`;
        predictedCost = 0;
      } else if (deltaDamage <= 0) {
        tooltipText += `\n— Raise pressure above hardness to connect (Pressure: ${currentPressure}P, Hardness: ${tile.hardness})`;
      } else {
        const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
        tooltipText += `\n${this._sandstoneCostFormula(deltaTemp, currentPressure, tile)}`;
        predictedCost = costPerDeltaTemp * deltaTemp;
      }
    } else if (content === 'hot_plate') {
      const currentTemp = this.board.getCurrentTemperature();
      const effectiveCost = tile.cost * (tile.temperature + currentTemp);
      tooltipText += `\n${this._hotPlateCostFormula(tile.temperature, currentTemp, tile.cost)}`;
      predictedCost = effectiveCost;
    } else {
      predictedCost = 0;
    }

    if (predictedCost !== null && predictedCost !== 0) {
      tooltipText += ` cost: ${predictedCost}`;
    }
    return tooltipText;
  }

  private _showTooltip(clientX: number, clientY: number): void {
    if (this.screen !== GameScreen.Play || !this.mouseCanvasPos) return;
    const { row, col } = this._getHoverGridPos()!;
    if (!this.board || row < 0 || row >= this.board.rows || col < 0 || col >= this.board.cols) {
      this._hideTooltip();
      return;
    }
    // Display as (row, col) to match the GridPos convention used throughout the codebase.
    let tooltipText = `(${row}, ${col})`;
    const tile = this.board.grid[row][col];
    // Indicate a gold space regardless of the tile currently on top of it.
    if (this.board.goldSpaces.has(posKey(row, col))) {
      tooltipText += ' Gold Space - needs gold pipe';
    }
    // Indicate one-way cell direction.
    const oneWayDir = this.board.getOneWayDirection({ row, col });
    if (oneWayDir !== null) {
      tooltipText += ` (one-way ${oneWayDir})`;
    }
    // Indicate cement cell status.
    const cementDryingTime = this.board.getCementDryingTime({ row, col });
    if (cementDryingTime !== null) {
      if (cementDryingTime === 0 && tile.shape !== PipeShape.Empty) {
        tooltipText += ' Cement (Hardened)';
      } else {
        tooltipText += ` Cement T=${cementDryingTime}`;
      }
    }
    // Show a human-readable tile name derived from its shape and chamber content.
    const tileName = getTileDisplayName(tile);
    if (tileName) {
      tooltipText += ` ${tileName}`;
    }
    // Pre-placed fixed pipe shapes get a "(fixed)" indicator.
    if (tile.isFixed && PIPE_SHAPES.has(tile.shape) && !SPIN_PIPE_SHAPES.has(tile.shape)) {
      tooltipText += ' (fixed)';
    }
    if (tile.shape === PipeShape.Chamber && tile.cost > 0) {
      // Only show a predicted cost for tiles that are NOT yet in the fill path.
      // Once a tile is connected its cost is already reflected in the water display;
      // for ice/snow/sandstone/hot_plate show the locked-in effective cost value.
      const lockedImpact = this.board.getLockedWaterImpact({ row, col });
      const isConnected = lockedImpact !== null;
      const pos = { row, col };
      if (isConnected) {
        tooltipText = this._tooltipForConnectedChamber(tooltipText, tile, pos, lockedImpact);
      } else {
        tooltipText = this._tooltipForUnconnectedChamber(tooltipText, tile);
      }
    }
    this.tooltipEl.textContent = tooltipText;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${clientX + 12}px`;
    this.tooltipEl.style.top  = `${clientY + 12}px`;
  }

  private _hideTooltip(): void {
    this.tooltipEl.style.display = 'none';
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
   * Show the board's lastError as a flash message and, if lastErrorTilePositions is set,
   * temporarily highlight those tiles.  Call this whenever a board operation fails.
   */
  private _handleBoardError(): void {
    if (!this.board?.lastError) return;
    this._showErrorFlash(this.board.lastError);
    if (this.board.lastErrorTilePositions && this.board.lastErrorTilePositions.length > 0) {
      this._startErrorHighlight(this.board.lastErrorTilePositions);
    }
  }

  /**
   * Compute and push floating animation label(s) for a single tile that has
   * just entered (`dir === 'connect'`) or left (`dir === 'disconnect'`) the fill
   * path.
   *
   * On connect the label shows the water impact of gaining this tile; on
   * disconnect it shows the reversal (the mirror-image effect).  Multi-label
   * tiles (hot-plate with both gain and loss) push their labels directly to
   * `_animations` and leave `text` null so the outer push is skipped.
   * Side effects: may add to `_pendingSparkleShapes` (item connect) or trigger
   * star sparkle particles (star connect).
   */
  private _pushTileAnimLabels(
    tile: Tile,
    r: number,
    c: number,
    dir: 'connect' | 'disconnect',
    currentTemp: number,
    currentPressure: number,
    now: number,
  ): void {
    if (!this.board) return;

    // Lower-right quadrant (avoids drawing over the pipe image)
    const cx = c * TILE_SIZE + TILE_SIZE * 3 / 4;
    const cy = r * TILE_SIZE + TILE_SIZE * 3 / 4;

    let text: string | null = null;
    let color: string = dir === 'connect' ? ANIM_NEGATIVE_COLOR : ANIM_POSITIVE_COLOR;

    if (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) {
      // Each pipe costs 1 water when connected; removal returns it.
      text = dir === 'connect' ? '-1' : '+1';
      color = dir === 'connect' ? ANIM_NEGATIVE_COLOR : ANIM_POSITIVE_COLOR;
    } else if (tile.shape === PipeShape.Chamber) {
      if (tile.chamberContent === 'tank') {
        // Tank adds capacity on connect, removes it on disconnect.
        const val = dir === 'connect' ? tile.capacity : -tile.capacity;
        text = val >= 0 ? `+${val}` : `${val}`;
        color = animColor(val);
      } else if (tile.chamberContent === 'dirt') {
        // Dirt consumes water on connect; removal returns it.
        const val = dir === 'connect' ? -tile.cost : tile.cost;
        const prefix = val > 0 ? '+' : '';
        text = val !== 0 ? `${prefix}${val}` : (dir === 'connect' ? '-0' : '+0');
        color = animColor(val);
      } else if (tile.chamberContent === 'item') {
        if (dir === 'connect' && tile.itemShape !== null) {
          const val = tile.itemCount;
          text = val >= 0 ? `+${val}` : `${val}`;
          if (val > 0) {
            color = ANIM_ITEM_COLOR;
            this._pendingSparkleShapes.add(tile.itemShape);
          } else if (val < 0) {
            color = ANIM_ITEM_NEG_COLOR;
            this._pendingRedSparkleShapes.add(tile.itemShape);
          } else {
            color = ANIM_ZERO_COLOR;
            this._pendingGraySparkleShapes.add(tile.itemShape);
          }
        }
        // disconnect: items already granted; no reversal animation
      } else if (tile.chamberContent === 'heater') {
        // Heater raises temperature on connect, lowers it on disconnect.
        const val = dir === 'connect' ? tile.temperature : -tile.temperature;
        text = val >= 0 ? `+${val}°` : `${val}°`;
        color = animColor(val);
      } else if (tile.chamberContent === 'ice') {
        const raw = tile.cost * computeDeltaTemp(tile.temperature, currentTemp);
        ({ text, color } = this._formatWaterCostLabel(raw, dir));
      } else if (tile.chamberContent === 'pump') {
        // Pump raises pressure on connect, lowers it on disconnect.
        const val = dir === 'connect' ? tile.pressure : -tile.pressure;
        text = val >= 0 ? `+${val}P` : `${val}P`;
        color = animColor(val);
      } else if (tile.chamberContent === 'snow') {
        const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
        const raw = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
        ({ text, color } = this._formatWaterCostLabel(raw, dir));
      } else if (tile.chamberContent === 'sandstone') {
        const { shatterOverride, costPerDeltaTemp } =
          sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
        if (shatterOverride) {
          text = dir === 'connect' ? '-0' : '+0';
          color = ANIM_ZERO_COLOR;
        } else {
          const raw = costPerDeltaTemp * computeDeltaTemp(tile.temperature, currentTemp);
          ({ text, color } = this._formatWaterCostLabel(raw, dir));
        }
      } else if (tile.chamberContent === 'hot_plate') {
        ({ text, color } = this._pushHotPlateAnimLabels(tile, r, c, dir, currentTemp, cx, cy, now));
      } else if (tile.chamberContent === 'star' && dir === 'connect') {
        // Star tile connected – spawn golden sparkle burst from the tile center.
        const starCx = c * TILE_SIZE + TILE_SIZE / 2;
        const starCy = r * TILE_SIZE + TILE_SIZE / 2;
        const canvasRect = this.canvas.getBoundingClientRect();
        spawnStarSparkles(canvasRect.left + starCx, canvasRect.top + starCy);
      }
    }

    if (text !== null) {
      this._animations.push({ x: cx, y: cy, text, color, startTime: now, duration: ANIM_DURATION });
    }
  }

  /**
   * Format the water-cost animation label for tiles (ice/snow/sandstone) whose
   * cost is expressed as a raw positive number.  On connect the label is shown
   * as a negative cost; on disconnect as a positive refund.
   */
  private _formatWaterCostLabel(raw: number, dir: 'connect' | 'disconnect'): { text: string; color: string } {
    if (dir === 'connect') {
      const val = -raw;
      return { text: val < 0 ? `${val}` : '-0', color: val < 0 ? ANIM_NEGATIVE_COLOR : ANIM_ZERO_COLOR };
    } else {
      return { text: raw > 0 ? `+${raw}` : '+0', color: raw > 0 ? ANIM_POSITIVE_COLOR : ANIM_ZERO_COLOR };
    }
  }

  /**
   * Compute and push the animation label(s) for a hot-plate tile.
   * Returns `{ text, color }` for a single-label result, or `{ text: null, color }` if
   * two separate labels were pushed directly to `_animations` (dual gain+loss case).
   */
  private _pushHotPlateAnimLabels(
    tile: Tile,
    r: number,
    c: number,
    dir: 'connect' | 'disconnect',
    currentTemp: number,
    cx: number,
    cy: number,
    now: number,
  ): { text: string | null; color: string } {
    if (!this.board) return { text: null, color: ANIM_ZERO_COLOR };
    if (dir === 'connect') {
      // Use the locked values computed by applyTurnDelta.
      const lockedImpact = this.board.getLockedWaterImpact({ row: r, col: c });
      const lockedGain = this.board.getLockedHotPlateGain({ row: r, col: c });
      if (lockedImpact !== null && lockedGain !== null) {
        const loss = Math.max(0, lockedGain - lockedImpact);
        if (lockedGain > 0 && loss > 0) {
          // Both gain and loss: spawn two separate labels offset above/below.
          this._animations.push({ x: cx, y: cy - TILE_SIZE / 4, text: `+${lockedGain}`, color: ANIM_POSITIVE_COLOR, startTime: now, duration: ANIM_DURATION });
          this._animations.push({ x: cx, y: cy + TILE_SIZE / 4, text: `-${loss}`, color: ANIM_NEGATIVE_COLOR, startTime: now, duration: ANIM_DURATION });
          return { text: null, color: ANIM_ZERO_COLOR }; // outer push skipped
        } else if (lockedGain > 0) {
          return { text: `+${lockedGain}`, color: ANIM_POSITIVE_COLOR };
        } else if (loss > 0) {
          return { text: `-${loss}`, color: ANIM_NEGATIVE_COLOR };
        } else {
          return { text: '+0', color: ANIM_ZERO_COLOR };
        }
      }
      return { text: null, color: ANIM_ZERO_COLOR };
    } else {
      // Disconnecting: reverse the hot plate's effects.
      // gain (from frozen) is lost; water loss is recovered.
      const effectiveCost = tile.cost * (tile.temperature + currentTemp);
      const waterGain = Math.min(this.board.frozen, effectiveCost);
      const waterLoss = Math.max(0, effectiveCost - waterGain);
      if (waterLoss > 0 && waterGain > 0) {
        this._animations.push({ x: cx, y: cy - TILE_SIZE / 4, text: `+${waterLoss}`, color: ANIM_POSITIVE_COLOR, startTime: now, duration: ANIM_DURATION });
        this._animations.push({ x: cx, y: cy + TILE_SIZE / 4, text: `-${waterGain}`, color: ANIM_NEGATIVE_COLOR, startTime: now, duration: ANIM_DURATION });
        return { text: null, color: ANIM_ZERO_COLOR }; // outer push skipped
      } else if (waterLoss > 0) {
        return { text: `+${waterLoss}`, color: ANIM_POSITIVE_COLOR };
      } else if (waterGain > 0) {
        return { text: `-${waterGain}`, color: ANIM_NEGATIVE_COLOR };
      } else {
        return { text: '-0', color: ANIM_ZERO_COLOR };
      }
    }
  }

  /**
   * Spawn floating animation labels for all tiles that became newly connected to
   * the fill path since `filledBefore` was captured.  Called after every player
   * action that may change the fill state (place, replace, rotate, undo, redo).
   */
  private _spawnConnectionAnimations(filledBefore: Set<string>): void {
    if (!this.board) return;
    const filledAfter = this.board.getFilledPositions();
    const now = performance.now();
    const currentTemp = this.board.getCurrentTemperature(filledAfter);
    const currentPressure = this.board.getCurrentPressure(filledAfter);

    for (const key of filledAfter) {
      if (filledBefore.has(key)) continue; // was already filled – skip
      const [r, c] = parseKey(key);
      const tile = this.board.grid[r]?.[c];
      if (!tile) continue;
      this._pushTileAnimLabels(tile, r, c, 'connect', currentTemp, currentPressure, now);
    }
  }

  /**
   * Spawn floating animation labels for tiles that have just **lost** their fill
   * (present in `filledBefore`, absent after the action).  The label shows the
   * reversal of each disconnected tile's water contribution.
   *
   * When called after a tile reclaim, `reclaimedTile` / `reclaimedRow` /
   * `reclaimedCol` must be supplied because the reclaimed grid cell has already
   * been replaced with an Empty tile by the time this method is called.
   * When called after a rotation (where all tiles remain on the grid), these
   * parameters may be omitted.
   */
  private _spawnDisconnectionAnimations(
    filledBefore: Set<string>,
    reclaimedTile?: Tile,
    reclaimedRow?: number,
    reclaimedCol?: number,
  ): void {
    if (!this.board) return;
    const filledAfter = this.board.getFilledPositions();
    const now = performance.now();
    const currentTemp = this.board.getCurrentTemperature(filledAfter);
    const currentPressure = this.board.getCurrentPressure(filledAfter);

    for (const key of filledBefore) {
      if (filledAfter.has(key)) continue; // still filled – skip
      const [r, c] = parseKey(key);

      // When a tile was reclaimed its cell is now Empty in the grid; use the
      // captured tile data instead.  For rotation moves all tiles remain on the
      // grid so we always fall through to the grid lookup.
      const tile = (reclaimedRow !== undefined && reclaimedCol !== undefined &&
                    r === reclaimedRow && c === reclaimedCol)
        ? reclaimedTile
        : this.board.grid[r]?.[c];
      if (!tile) continue;
      this._pushTileAnimLabels(tile, r, c, 'disconnect', currentTemp, currentPressure, now);
    }
  }

  /**
   * Spawn floating animation labels for tiles whose **locked** water impact
   * changed because a beneficial tile (heater or pump) was disconnected and
   * still-connected cost tiles were re-evaluated by {@link Board.applyTurnDelta}.
   *
   * The label shows the signed delta (newImpact − oldImpact): negative means
   * the tile now costs more water (shown in red), positive means it costs less
   * (shown in green).  This matches the appearance of the connection-time cost
   * animations so players can immediately see what changed.
   */
  private _spawnLockedCostChangeAnimations(): void {
    if (!this.board) return;
    const changes = this.board.lastLockedCostChanges;
    if (changes.length === 0) return;
    const now = performance.now();

    for (const { row: r, col: c, delta } of changes) {
      const cx = c * TILE_SIZE + TILE_SIZE * 3 / 4;
      const cy = r * TILE_SIZE + TILE_SIZE * 3 / 4;
      const text = delta > 0 ? `+${delta}` : `${delta}`;
      const color = animColor(delta);
      this._animations.push({ x: cx, y: cy, text, color, startTime: now, duration: ANIM_DURATION });
    }
  }

  /**
   * If the most recent board operation decremented a cement cell's setting time,
   * spawn a floating gray "-1" animation above that cell.
   */
  private _spawnCementDecrementAnimation(): void {
    if (!this.board?.lastCementDecrement) return;
    const { row: r, col: c } = this.board.lastCementDecrement;
    const cx = c * TILE_SIZE + TILE_SIZE / 4;
    const cy = r * TILE_SIZE + TILE_SIZE / 4;
    this._animations.push({
      x: cx, y: cy,
      text: '-1',
      color: ANIM_ZERO_COLOR,
      startTime: performance.now(),
      duration: ANIM_DURATION,
    });
    this.board.lastCementDecrement = null;
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
  private _selectNextAvailableInventory(): void {
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
    this.pendingRotation = this.lastPlacedRotations.get(nextShape) ?? 0;
    this._renderInventoryBar();
    this.canvas.focus();
  }

  /**
   * Post-placement bookkeeping shared by both place and replace actions.
   * Records the move, updates last-used rotation, deselects the shape when
   * inventory is exhausted, and refreshes all affected UI elements.
   */
  private _afterTilePlaced(
    placedShape: PipeShape,
    filledBefore: Set<string>,
    replacedTile?: Tile,
    replacedRow?: number,
    replacedCol?: number,
  ): void {
    if (!this.board) return;
    this._completeAnims();
    this.board.applyTurnDelta();
    this.board.recordMove();
    this._spawnConnectionAnimations(filledBefore);
    this._spawnDisconnectionAnimations(filledBefore, replacedTile, replacedRow, replacedCol);
    this._spawnFillAnims(filledBefore);
    this._spawnLockedCostChangeAnimations();
    this._spawnCementDecrementAnimation();
    this.lastPlacedRotations.set(placedShape, this.pendingRotation);
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
   * On success, calls `_afterTilePlaced` (which includes the cement-decrement
   * animation).  On board error, calls `_handleBoardError`.
   *
   * @returns `true` when a board operation was attempted (whether it succeeded
   *   or failed with an error), `false` when the tile already matched (no-op).
   */
  private _tryPlaceOrReplaceSelectedAt(
    pos: GridPos,
    currentTile: Tile,
    filledBefore: Set<string>,
  ): boolean {
    if (!this.board || this.selectedShape === null) return false;
    let replacedTile: Tile | undefined;
    let placed: boolean;
    if (currentTile.shape === PipeShape.Empty) {
      placed = this.board.placeInventoryTile(pos, this.selectedShape, this.pendingRotation);
    } else if (currentTile.shape !== this.selectedShape || currentTile.rotation !== this.pendingRotation) {
      replacedTile = currentTile;
      placed = this.board.replaceInventoryTile(pos, this.selectedShape, this.pendingRotation);
    } else {
      return false; // tile already has the selected shape+rotation – no action
    }
    if (placed) {
      this._afterTilePlaced(this.selectedShape, filledBefore, replacedTile, pos.row, pos.col);
    } else if (this.board.lastError) {
      this._handleBoardError();
    }
    return true; // a board operation was attempted
  }

  /**
   * Move the keyboard focus position by one step along the given axis.
   * Clamps to the board boundaries and calls `e.preventDefault()` to
   * suppress scroll.
   */
  private _moveFocusPos(e: KeyboardEvent, axis: 'row' | 'col', delta: -1 | 1): void {
    if (!this.board) return;
    e.preventDefault();
    const cur = this.focusPos[axis];
    const max = axis === 'row' ? this.board.rows : this.board.cols;
    const next = cur + delta;
    if (next >= 0 && next < max) {
      this.focusPos = { ...this.focusPos, [axis]: next };
    }
  }

  private _handleKey(e: KeyboardEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (!this.board) return;
    const { focusPos, board } = this;

    switch (e.key) {
      case 'ArrowUp':    this._moveFocusPos(e, 'row', -1); break;
      case 'ArrowDown':  this._moveFocusPos(e, 'row',  1); break;
      case 'ArrowLeft':  this._moveFocusPos(e, 'col', -1); break;
      case 'ArrowRight': this._moveFocusPos(e, 'col',  1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          const tile = board.getTile(focusPos);
          const filledBefore = board.getFilledPositions();
          if (tile) this._tryPlaceOrReplaceSelectedAt(focusPos, tile, filledBefore);
        } else {
          const tile = board.getTile(focusPos);
          const filledBefore = board.getFilledPositions();
          // Capture before calling rotateTile – the rotation mutates tile.rotation in-place.
          const oldRotation = tile?.rotation;
          if (board.rotateTile(focusPos)) {
            this._afterTileRotated(filledBefore, oldRotation !== undefined
              ? { row: focusPos.row, col: focusPos.col, oldRotation }
              : undefined);
          } else if (board.lastError) {
            this._handleBoardError();
          }
        }
        break;
      case 'q':
      case 'Q':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          this._rotatePendingCCW();
        } else if (!this._tryRotateHoverSpinner(3)) {
          // 3 CW steps = 1 CCW step
          this._tryAdjustHoverRotation(-1);
        }
        break;
      case 'w':
      case 'W':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          this._rotatePendingCW();
        } else if (!this._tryRotateHoverSpinner(1)) {
          this._tryAdjustHoverRotation(1);
        }
        break;
      case 'Escape':
        if (this._rulesModalEl.style.display !== 'none') {
          // Close the rules modal first if it is open.
          this._rulesModalEl.style.display = 'none';
          this.canvas.focus();
        } else if (this.screen === GameScreen.Play && this.gameState === GameState.Playing) {
          // If the exit-confirm modal is already showing, dismiss it (toggle).
          if (this._exitConfirmModalEl.style.display !== 'none') {
            this._exitConfirmModalEl.style.display = 'none';
            this.canvas.focus();
          } else {
            this._exitConfirmModalEl.style.display = 'flex';
          }
        } else {
          this.exitToMenu();
        }
        break;
      case 'r':
      case 'R':
        if (this.gameState === GameState.Playing) this.retryLevel();
        break;
    }
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
    const prevBoard = this.board;
    const prevDecorations = prevBoard?.ambientDecorations;
    this.startLevel(this.currentLevel.id, prevDecorations);
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
    if (!this._activeCampaign) { this.exitToMenu(); return; }
    const chapters = this._activeCampaign.chapters;
    // Collect all levels in order
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const idx = allLevels.findIndex((l) => l.id === this.currentLevel!.id);
    if (idx === -1 || idx + 1 >= allLevels.length) {
      // No next level – go back to the level-select menu
      this.exitToMenu();
      return;
    }

    const nextLevelDef = allLevels[idx + 1];
    this._pendingLevelId = nextLevelDef.id;

    // Detect if this transition crosses a chapter boundary into a new chapter's first level
    const currentChapter = chapters.find((ch) => ch.levels.some((l) => l.id === this.currentLevel!.id));
    const nextChapter = chapters.find((ch) => ch.levels.some((l) => l.id === nextLevelDef.id));

    // If we just completed the last level of a grid-map chapter, go back to the chapter map
    if (currentChapter?.grid && nextChapter && currentChapter !== nextChapter) {
      this._pendingLevelId = null;
      this.winModalEl.style.display = 'none';
      this._winFromChapterMap = true;
      this.winMenuBtnEl.textContent = 'Chapter Map';
      this._showChapterMap(chapters.indexOf(currentChapter));
      return;
    }

    if (
      currentChapter !== undefined &&
      nextChapter !== undefined &&
      currentChapter !== nextChapter &&
      nextChapter.levels[0].id === nextLevelDef.id
    ) {
      const chapterIdx = chapters.indexOf(nextChapter);
      // If the next chapter has a grid map, show the map screen instead of starting the level
      if (nextChapter.grid) {
        this._pendingLevelId = null;
        this.winModalEl.style.display = 'none';
        this._winFromChapterMap = true;
        this.winMenuBtnEl.textContent = 'Chapter Map';
        this._showChapterMap(chapterIdx);
        // Show the new chapter modal on the chapter map screen
        this._showNewChapterModal(chapterIdx, nextChapter);
      } else {
        this.startLevel(nextLevelDef.id);
        this._showNewChapterModal(chapterIdx, nextChapter);
      }
    } else if (nextLevelDef.challenge) {
      this.startLevel(nextLevelDef.id);
      this._showChallengeLevelModal(/* canSkip */ true);
    } else {
      this._pendingLevelId = null;
      this.startLevel(nextLevelDef.id);
    }
  }

  /**
   * Request to start a level by ID, potentially showing a challenge-level warning
   * modal first (when the level is marked as a challenge).
   * Use this instead of `startLevel()` when navigating from the level-select screen.
   */
  requestLevel(levelId: number): void {
    if (!this._activeCampaign) return;
    const chapters = this._activeCampaign.chapters;
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === levelId);
    if (level?.challenge) {
      this._pendingLevelId = levelId;
      this.startLevel(levelId);
      this._showChallengeLevelModal(/* canSkip */ false);
    } else {
      this.startLevel(levelId);
    }
  }

  /**
   * Called when the player confirms the new-chapter modal ("Start Level" button).
   * Dismisses the chapter modal and either starts the pending level or shows the
   * challenge-level modal when the pending level is a challenge.
   */
  startChapterLevel(): void {
    this._closeModal(this._newChapterModalEl);
    if (this._pendingLevelId === null) return;

    const chapters = this._activeCampaign?.chapters ?? [];
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === this._pendingLevelId);
    if (level?.challenge) {
      this._showChallengeLevelModal(/* canSkip */ true);
    } else {
      const id = this._pendingLevelId;
      this._pendingLevelId = null;
      this.startLevel(id);
    }
  }

  /**
   * Called when the player chooses to play the challenge level ("Play Level" button).
   * Dismisses the challenge modal and starts the pending level.
   */
  playChallengeLevel(): void {
    this._closeModal(this._challengeModalEl);
    if (this._pendingLevelId === null) return;
    const id = this._pendingLevelId;
    this._pendingLevelId = null;
    this.startLevel(id);
  }

  /**
   * Called when the player chooses to skip the challenge level ("Skip Level" button).
   * Dismisses the challenge modal and advances to the next level after the challenge.
   */
  skipChallengeLevel(): void {
    this._closeModal(this._challengeModalEl);
    if (this._pendingLevelId === null) { this.exitToMenu(); return; }

    const chapters = this._activeCampaign?.chapters ?? [];
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const idx = allLevels.findIndex((l) => l.id === this._pendingLevelId);
    this._pendingLevelId = null;

    if (idx !== -1 && idx + 1 < allLevels.length) {
      this.startLevel(allLevels[idx + 1].id);
    } else {
      this.exitToMenu();
    }
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
    this._flowDrops = [];
    this._bubbles = [];
    this._vortexParticles = [];
    this._flowGoodDirs = null;
    // Clear all fill animations (including the persistent sink entry) before
    // spawning fresh ones for the restored board state.
    this._completeAnims();
    this._spawnConnectionAnimations(filledBefore);
    this._finalizeHistoryJump();
  }

  /**
   * Finalize UI state after an undo, redo, or undo-win action:
   * deselect any exhausted inventory shape, reset metric sparkle baselines,
   * refresh the play HUD, and re-render the board.
   */
  private _finalizeHistoryJump(): void {
    this._deselectIfDepleted();
    this._resetMetricBaselines();
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
    this._completeAnims();
    const filledBefore = this.board.getFilledPositions();
    if (this.gameState === GameState.GameOver) {
      // discardLastMoveFromHistory() was already called when the fail was detected,
      // so _historyIndex already points to the pre-fail snapshot.  Just restore it
      // without decrementing the pointer further (which would skip an extra turn).
      this.board.restoreFromCurrentSnapshot();
    } else {
      this.board.undoMove();
    }
    this.gameState = GameState.Playing;
    this._closeModal(this.gameoverModalEl);
    this._spawnConnectionAnimations(filledBefore);
    this._finalizeHistoryJump();
  }

  /** Redo the last undone player action. */
  performRedo(): void {
    if (!this.board || !this.board.canRedo()) return;
    const filledBefore = this.board.getFilledPositions();
    this.board.redoMove();
    this._spawnConnectionAnimations(filledBefore);
    this._spawnDisconnectionAnimations(filledBefore);
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
    if (this._playtestExitCallback) {
      const cb = this._playtestExitCallback;
      this._playtestExitCallback = null;
      this._showLevelSelect();
      cb(); // re-open the campaign editor
    } else if (this._winFromChapterMap && this._chapterMapScreen?.chapter) {
      this._winFromChapterMap = false;
      this._chapterMapScreen.repopulate(this._activeCampaign!);
      this.levelSelectEl.style.display = 'none';
      this.playScreenEl.style.display = 'none';
      this._chapterMapScreen.screenEl.style.display = 'flex';
      this.winModalEl.style.display = 'none';
      this.screen = GameScreen.ChapterMap;
    } else {
      this._showLevelSelect();
    }
  }

  /** Show the game-rules modal overlay. */
  showRules(): void {
    this._rulesModalEl.style.display = 'flex';
  }

  // ─── Campaign Editor integration ──────────────────────────────────────────

  /** Open the campaign editor overlay (hides the level-select screen first). */
  private _openCampaignEditor(): void {
    this.screen = GameScreen.CampaignEditor;
    this.levelSelectEl.style.display = 'none';
    this.campaignEditor.show();
  }

  /**
   * Start a level in play-mode for playtesting from the campaign editor.
   * When the player exits, the campaign editor is re-opened.
   */
  private _playtestLevel(level: LevelDef): void {
    this.campaignEditor.hide();
    this._playtestExitCallback = () => {
      this.levelSelectEl.style.display = 'none';
      this.campaignEditor.showAndRestore();
    };
    // Update modal menu buttons so they say "Return to Editor" instead of "Level Select".
    this.winMenuBtnEl.textContent = '↩ Return to Editor';
    this.gameoverMenuBtnEl.textContent = '↩ Return to Editor';
    // Hide the "Next Level" button — it makes no sense when playtesting a single level.
    this.winNextBtnEl.style.display = 'none';
    // Update HUD exit button so it says "Edit" instead of "Menu".
    this.exitBtnEl.textContent = '← Edit';
    this.startLevelDef(level);
  }

  /**
   * Start any given LevelDef in play mode.
   * Similar to {@link startLevel} but accepts a LevelDef directly instead of a level ID.
   */
  startLevelDef(level: LevelDef): void {
    this.currentLevel = level;
    this.board = new Board(level.rows, level.cols, level);
    this._enterPlayScreenState(level);
    this.currentChapterId = 0;
    this.levelHeaderEl.textContent = `▶ Playtesting: ${level.name}`;
    this._refreshPlayUI();
    this._updateNoteHintBoxes(level);
    this.canvas.focus();

    this._checkAndShowInitialError();
  }

  // ─── Undo / redo button state ─────────────────────────────────────────────

  /** Enable or disable the undo/redo HUD buttons based on current history state. */
  private _updateUndoRedoButtons(): void {
    const canUndo = !!(this.board?.canUndo());
    const canRedo = !!(this.board?.canRedo());
    this.undoBtnEl.disabled = !canUndo;
    this.redoBtnEl.disabled = !canRedo;
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────

  private _markLevelCompleted(levelId: number): void {
    if (this._playtestExitCallback) return; // don't persist progress during playtesting
    if (this._activeCampaign) {
      markCampaignLevelCompleted(this._activeCampaign.id, levelId, this._activeCampaignProgress);
    } else {
      markLevelCompleted(this.completedLevels, levelId);
    }
  }

  /** Save the number of stars collected for a level (no-op during playtesting). */
  private _saveStars(levelId: number, count: number): void {
    if (this._playtestExitCallback) return; // don't persist progress during playtesting
    saveLevelStar(levelId, count, this._activeCampaign?.id);
  }

  /** Save the water remaining for a level (no-op during playtesting; only records the max). */
  private _saveWater(levelId: number, water: number): void {
    if (this._playtestExitCallback) return; // don't persist progress during playtesting
    saveLevelWater(levelId, water, this._activeCampaign?.id);
  }

  /** Clear all level-completion progress and refresh the level list. */
  private _resetProgress(): void {
    if (this._activeCampaign) {
      clearCampaignProgress(this._activeCampaign.id, this._activeCampaignProgress);
      clearLevelStars(this._activeCampaign.id);
      clearLevelWater(this._activeCampaign.id);
      clearCompletedChapters(this._activeCampaign.id, this._activeCampaignCompletedChapters);
    } else {
      clearCompletedLevels(this.completedLevels);
      clearLevelStars();
      clearLevelWater();
    }
    this._renderLevelList();
  }

  /** Dev cheat: mark all levels completed and refresh the level list. */
  private _unlockAll(): void {
    if (this._activeCampaign) {
      const allIds = this._activeCampaign.chapters.flatMap((ch) => ch.levels.map((l) => l.id));
      for (const id of allIds) {
        markCampaignLevelCompleted(this._activeCampaign.id, id, this._activeCampaignProgress);
      }
    }
    this._renderLevelList();
  }

  // ─── Active campaign management ───────────────────────────────────────────

  /** Activate a campaign for play on the main menu. */
  private _activateCampaign(campaign: CampaignDef): void {
    this._activeCampaign = campaign;
    this._activeCampaignProgress = loadCampaignProgress(campaign.id);
    this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
    this._chapterExpandedState = new Map();
    saveActiveCampaignId(campaign.id);
    this._showLevelSelect();
  }

  /** Deactivate the current campaign and return to the official campaign. */
  private _deactivateCampaign(): void {
    this._activeCampaign = null;
    this._activeCampaignProgress = new Set();
    this._chapterExpandedState = new Map();
    clearActiveCampaignId();
    this._showLevelSelect();
  }

  /**
   * Auto-select a campaign when none is saved.
   * Prefers the first official campaign; falls back to the first available campaign.
   * Called during construction when no active campaign ID is stored.
   */
  private _autoSelectCampaign(): void {
    const allCampaigns = this.campaignEditor.getAllCampaigns();
    if (allCampaigns.length === 0) return;
    const campaign = allCampaigns.find((c) => c.official === true) ?? allCampaigns[0];
    this._activeCampaign = campaign;
    this._activeCampaignProgress = loadCampaignProgress(campaign.id);
    this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
    saveActiveCampaignId(campaign.id);
  }

  /**
   * Restore the active campaign from a persisted campaign ID.
   * Called during construction to reload the previous session's active campaign.
   */
  private _restoreActiveCampaign(campaignId: string): void {
    // The campaign editor manages user campaigns; reload them to find the campaign.
    const allCampaigns = this.campaignEditor.getAllCampaigns();
    const campaign = allCampaigns.find((c) => c.id === campaignId);
    if (campaign) {
      this._activeCampaign = campaign;
      this._activeCampaignProgress = loadCampaignProgress(campaign.id);
      this._activeCampaignCompletedChapters = loadCompletedChapters(campaign.id);
    } else {
      // Campaign no longer exists – clear the persisted ID.
      clearActiveCampaignId();
    }
  }
}

// Re-export for backward compatibility with tests that import InventoryItem via game.ts
export type { InventoryItem, LevelDef };
