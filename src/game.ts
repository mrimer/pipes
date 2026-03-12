import { Board, PIPE_SHAPES, GOLD_PIPE_SHAPES, SPIN_PIPE_SHAPES } from './board';
import { Tile } from './tile';
import { GameScreen, GameState, GridPos, InventoryItem, LevelDef, PipeShape, CampaignDef, ChapterDef, Direction, Rotation } from './types';
import { WATER_COLOR, LOW_WATER_COLOR, MEDIUM_WATER_COLOR } from './colors';
import { TILE_SIZE, renderBoard, getTileDisplayName, setTileSize, computeTileSize } from './renderer';
import { renderInventoryBar } from './inventoryRenderer';
import { renderLevelList } from './levelSelect';
import {
  loadCompletedLevels, markLevelCompleted, clearCompletedLevels,
  loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress,
  loadActiveCampaignId, saveActiveCampaignId, clearActiveCampaignId,
  computeCampaignCompletionPct,
  loadLevelStars, saveLevelStar, clearLevelStars,
} from './persistence';
import { createGameRulesModal } from './rulesModal';
import { TileAnimation, renderAnimations, animColor, ANIM_DURATION, ANIM_NEGATIVE_COLOR, ANIM_POSITIVE_COLOR, ANIM_ZERO_COLOR, ANIM_ITEM_COLOR } from './tileAnimation';
import { CampaignEditor } from './campaignEditor';
import { spawnConfetti, clearConfetti } from './confetti';
import { spawnStarSparkles, clearStarSparkles } from './starSparkle';
import {
  SourceSprayDrop, FlowDrop,
  spawnSourceSprayDrop, renderSourceSpray,
  spawnFlowDrop, renderFlowDrops,
  computeFlowGoodDirs,
} from './waterParticles';

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
  private readonly rulesModalEl: HTMLElement;

  /** Campaign editor overlay (manages its own DOM). */
  private readonly campaignEditor: CampaignEditor;

  /** Levels that have been successfully completed (persisted in localStorage). */
  private completedLevels: Set<number>;

  /** Active floating animation labels shown over the canvas. */
  private _animations: TileAnimation[] = [];

  /** Active source-spray water drops rendered over the source tile during play. */
  private _sourceSprayDrops: SourceSprayDrop[] = [];

  /** `performance.now()` of the last source spray drop spawn. */
  private _lastSpraySpawn = 0;

  /** Active win-flow water drops following connected pipes from source to sink. */
  private _flowDrops: FlowDrop[] = [];

  /**
   * Pre-computed "good" directions at each tile for the win-flow animation –
   * only directions that lead towards the sink without entering dead-end branches.
   * Computed once when the board is solved; cleared when leaving the Won state.
   */
  private _flowGoodDirs: Map<string, Set<Direction>> | null = null;

  /** `performance.now()` of the last win-flow drop spawn. */
  private _lastFlowSpawn = 0;

  /** Shapes that should receive a sparkle CSS animation on the next inventory render. */
  private _pendingSparkleShapes: Set<PipeShape> = new Set();

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

  /** Modal overlay shown when the player is about to enter the first level of a new chapter. */
  private readonly _newChapterModalEl: HTMLElement;

  /** Element inside the new-chapter modal that displays the chapter number. */
  private readonly _newChapterNumberEl: HTMLElement;

  /** Element inside the new-chapter modal that displays the chapter name. */
  private readonly _newChapterNameEl: HTMLElement;

  /** Modal overlay shown when the player is about to enter a challenge level. */
  private readonly _challengeModalEl: HTMLElement;

  /** Paragraph inside the challenge modal describing skip behaviour (hidden for direct selection). */
  private readonly _challengeMsgEl: HTMLElement;

  /** "Skip Level" button inside the challenge modal (hidden for direct selection). */
  private readonly _challengeSkipBtnEl: HTMLButtonElement;

  /** Modal overlay shown when the player presses Esc to confirm abandoning the level. */
  private readonly _exitConfirmModalEl: HTMLElement;

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
    this.winStarsEl = winModalEl.querySelector<HTMLElement>('#win-stars');
    this.winMenuBtnEl = winModalEl.querySelector<HTMLButtonElement>('#win-menu-btn')!;
    this.gameoverMenuBtnEl = gameoverModalEl.querySelector<HTMLButtonElement>('#gameover-menu-btn')!;

    // Load persisted completions
    this.completedLevels = loadCompletedLevels();

    // Create the tooltip element for Ctrl+hover grid coordinates
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText =
      'display:none;position:fixed;background:#16213e;color:#eee;border:1px solid #4a90d9;' +
      'border-radius:4px;padding:4px 8px;font-size:0.8rem;pointer-events:none;z-index:50;';
    document.body.appendChild(this.tooltipEl);

    // Grab the value span from the water stat row (its second child span)
    this.waterValueEl = this.waterDisplayEl.querySelector('.stat-value') as HTMLElement;

    // Create the frozen stat row (inserted into the stats box after water display)
    this.frozenDisplayEl = document.createElement('div');
    this.frozenDisplayEl.className = 'stat-row';
    this.frozenDisplayEl.style.cssText = 'display:none;color:#a8d8ea;';
    const frozenLabelEl = document.createElement('span');
    frozenLabelEl.className = 'stat-label';
    frozenLabelEl.textContent = '❄️ Frozen';
    this.frozenValueEl = document.createElement('span');
    this.frozenValueEl.className = 'stat-value';
    this.frozenDisplayEl.appendChild(frozenLabelEl);
    this.frozenDisplayEl.appendChild(this.frozenValueEl);
    this.waterDisplayEl.insertAdjacentElement('afterend', this.frozenDisplayEl);

    // Create the temperature stat row (inserted into the stats box after frozen display)
    this.tempDisplayEl = document.createElement('div');
    this.tempDisplayEl.className = 'stat-row';
    this.tempDisplayEl.style.cssText = 'display:none;color:#74b9ff;';
    const tempLabelEl = document.createElement('span');
    tempLabelEl.className = 'stat-label';
    tempLabelEl.textContent = '🌡️ Temp °';
    this.tempValueEl = document.createElement('span');
    this.tempValueEl.className = 'stat-value';
    this.tempDisplayEl.appendChild(tempLabelEl);
    this.tempDisplayEl.appendChild(this.tempValueEl);
    this.frozenDisplayEl.insertAdjacentElement('afterend', this.tempDisplayEl);

    // Create the pressure stat row (inserted into the stats box after temp display)
    this.pressureDisplayEl = document.createElement('div');
    this.pressureDisplayEl.className = 'stat-row';
    this.pressureDisplayEl.style.cssText = 'display:none;color:#a8e063;';
    const pressureLabelEl = document.createElement('span');
    pressureLabelEl.className = 'stat-label';
    pressureLabelEl.textContent = '🔧 Pressure';
    this.pressureValueEl = document.createElement('span');
    this.pressureValueEl.className = 'stat-value';
    this.pressureDisplayEl.appendChild(pressureLabelEl);
    this.pressureDisplayEl.appendChild(this.pressureValueEl);
    this.tempDisplayEl.insertAdjacentElement('afterend', this.pressureDisplayEl);

    // Create the note box (appended to the play screen, shown beneath the grid)
    this.noteBoxEl = document.createElement('div');
    this.noteBoxEl.style.cssText =
      'display:none;background:#16213e;border:1px solid #4a90d9;border-radius:6px;' +
      'padding:12px 16px;font-size:0.9rem;color:#eee;max-width:600px;width:100%;box-sizing:border-box;';
    playScreenEl.appendChild(this.noteBoxEl);

    // Create the hint box (appended to the play screen after the note box, collapsible)
    this.hintBoxEl = document.createElement('div');
    this.hintBoxEl.style.cssText =
      'display:none;border:1px solid #f0c040;border-radius:6px;' +
      'max-width:600px;width:100%;box-sizing:border-box;overflow:hidden;';
    playScreenEl.appendChild(this.hintBoxEl);

    // Create the error-flash element for brief action-blocked messages
    this.errorFlashEl = document.createElement('div');
    this.errorFlashEl.style.cssText =
      'display:none;position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
      'background:#c0392b;color:#fff;border:2px solid #e74c3c;' +
      'border-radius:6px;padding:8px 18px;font-size:0.95rem;pointer-events:none;z-index:60;' +
      'text-align:center;max-width:360px;';
    document.body.appendChild(this.errorFlashEl);

    // Create the reset-progress confirmation modal
    this.resetConfirmModalEl = document.createElement('div');
    this.resetConfirmModalEl.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);' +
      'justify-content:center;align-items:center;z-index:100;';
    const resetModalBox = document.createElement('div');
    resetModalBox.style.cssText =
      'background:#16213e;border:3px solid #e74c3c;border-radius:10px;' +
      'padding:32px 40px;text-align:center;display:flex;flex-direction:column;' +
      'gap:16px;min-width:280px;';
    const resetTitle = document.createElement('h2');
    resetTitle.textContent = '⚠️ Reset Progress?';
    const resetMsg = document.createElement('p');
    resetMsg.style.cssText = 'font-size:0.95rem;color:#aaa;';
    resetMsg.textContent = 'This will remove all level completion data. Are you sure?';
    const resetActions = document.createElement('div');
    resetActions.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const resetCancelBtn = document.createElement('button');
    resetCancelBtn.textContent = 'Cancel';
    resetCancelBtn.style.cssText =
      'padding:10px 24px;font-size:1rem;background:#2a2a4a;color:#aaa;' +
      'border:1px solid #555;border-radius:6px;cursor:pointer;';
    resetCancelBtn.addEventListener('click', () => {
      this.resetConfirmModalEl.style.display = 'none';
    });
    const resetConfirmBtn = document.createElement('button');
    resetConfirmBtn.textContent = 'Reset';
    resetConfirmBtn.style.cssText =
      'padding:10px 24px;font-size:1rem;background:#e74c3c;color:#fff;' +
      'border:none;border-radius:6px;cursor:pointer;';
    resetConfirmBtn.addEventListener('click', () => {
      this._resetProgress();
      this.resetConfirmModalEl.style.display = 'none';
    });
    resetActions.appendChild(resetCancelBtn);
    resetActions.appendChild(resetConfirmBtn);
    resetModalBox.appendChild(resetTitle);
    resetModalBox.appendChild(resetMsg);
    resetModalBox.appendChild(resetActions);
    this.resetConfirmModalEl.appendChild(resetModalBox);
    document.body.appendChild(this.resetConfirmModalEl);

    // Create the game-rules modal (appends itself to document.body)
    this.rulesModalEl = createGameRulesModal();

    // Create the new-chapter intro modal
    this._newChapterModalEl = document.createElement('div');
    this._newChapterModalEl.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
      'justify-content:center;align-items:center;z-index:100;';
    const newChapterBox = document.createElement('div');
    newChapterBox.className = 'modal-box';
    const newChapterTitle = document.createElement('h2');
    newChapterTitle.textContent = '✨ New Chapter';
    this._newChapterNumberEl = document.createElement('p');
    this._newChapterNumberEl.style.cssText = 'font-size:1.2rem;font-weight:bold;color:#74b9ff;';
    this._newChapterNameEl = document.createElement('p');
    this._newChapterNameEl.style.cssText = 'font-size:1.5rem;font-weight:bold;color:#eee;';
    const newChapterActions = document.createElement('div');
    newChapterActions.className = 'modal-actions';
    const newChapterStartBtn = document.createElement('button');
    newChapterStartBtn.textContent = 'Start Level';
    newChapterStartBtn.className = 'modal-btn primary';
    newChapterStartBtn.type = 'button';
    newChapterStartBtn.addEventListener('click', () => this.startChapterLevel());
    newChapterActions.appendChild(newChapterStartBtn);
    newChapterBox.appendChild(newChapterTitle);
    newChapterBox.appendChild(this._newChapterNumberEl);
    newChapterBox.appendChild(this._newChapterNameEl);
    newChapterBox.appendChild(newChapterActions);
    this._newChapterModalEl.appendChild(newChapterBox);
    document.body.appendChild(this._newChapterModalEl);

    // Create the challenge-level warning modal
    this._challengeModalEl = document.createElement('div');
    this._challengeModalEl.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
      'justify-content:center;align-items:center;z-index:100;';
    const challengeBox = document.createElement('div');
    challengeBox.className = 'modal-box';
    const challengeTitle = document.createElement('h2');
    challengeTitle.textContent = '☠️ Challenge Level ☠️';
    const challengeMsg = document.createElement('p');
    challengeMsg.style.cssText = 'font-size:0.95rem;color:#aaa;';
    challengeMsg.textContent = 'This is an optional challenge level. You may skip it without affecting your progress.';
    this._challengeMsgEl = challengeMsg;
    const challengeActions = document.createElement('div');
    challengeActions.className = 'modal-actions';
    const challengePlayBtn = document.createElement('button');
    challengePlayBtn.textContent = 'Play Level';
    challengePlayBtn.className = 'modal-btn primary';
    challengePlayBtn.type = 'button';
    challengePlayBtn.addEventListener('click', () => this.playChallengeLevel());
    const challengeSkipBtn = document.createElement('button');
    challengeSkipBtn.textContent = 'Skip Level';
    challengeSkipBtn.className = 'modal-btn secondary';
    challengeSkipBtn.type = 'button';
    challengeSkipBtn.addEventListener('click', () => this.skipChallengeLevel());
    this._challengeSkipBtnEl = challengeSkipBtn;
    challengeActions.appendChild(challengePlayBtn);
    challengeActions.appendChild(challengeSkipBtn);
    challengeBox.appendChild(challengeTitle);
    challengeBox.appendChild(challengeMsg);
    challengeBox.appendChild(challengeActions);
    this._challengeModalEl.appendChild(challengeBox);
    document.body.appendChild(this._challengeModalEl);

    // Create the exit-confirmation modal (shown when the player presses Esc mid-level)
    this._exitConfirmModalEl = document.createElement('div');
    this._exitConfirmModalEl.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
      'justify-content:center;align-items:center;z-index:100;';
    const exitConfirmBox = document.createElement('div');
    exitConfirmBox.className = 'modal-box';
    const exitConfirmTitle = document.createElement('h2');
    exitConfirmTitle.textContent = '🚪 Abandon Level?';
    const exitConfirmMsg = document.createElement('p');
    exitConfirmMsg.textContent = 'Your progress on this level will be lost.';
    const exitConfirmActions = document.createElement('div');
    exitConfirmActions.className = 'modal-actions';
    const exitConfirmExitBtn = document.createElement('button');
    exitConfirmExitBtn.textContent = 'Exit Level';
    exitConfirmExitBtn.className = 'modal-btn primary';
    exitConfirmExitBtn.type = 'button';
    exitConfirmExitBtn.addEventListener('click', () => {
      this._exitConfirmModalEl.style.display = 'none';
      this.exitToMenu();
    });
    const exitConfirmContinueBtn = document.createElement('button');
    exitConfirmContinueBtn.textContent = 'Continue';
    exitConfirmContinueBtn.className = 'modal-btn secondary';
    exitConfirmContinueBtn.type = 'button';
    exitConfirmContinueBtn.addEventListener('click', () => {
      this._exitConfirmModalEl.style.display = 'none';
      this.canvas.focus();
    });
    exitConfirmActions.appendChild(exitConfirmExitBtn);
    exitConfirmActions.appendChild(exitConfirmContinueBtn);
    exitConfirmBox.appendChild(exitConfirmTitle);
    exitConfirmBox.appendChild(exitConfirmMsg);
    exitConfirmBox.appendChild(exitConfirmActions);
    this._exitConfirmModalEl.appendChild(exitConfirmBox);
    document.body.appendChild(this._exitConfirmModalEl);

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

  // ─── Screen transitions ───────────────────────────────────────────────────

  private _showLevelSelect(): void {
    this.screen = GameScreen.LevelSelect;
    this.levelSelectEl.style.display = 'flex';
    this.playScreenEl.style.display = 'none';
    // Explicitly hide all modal overlays so they cannot cover the level-select
    // screen when returning from a completed or failed level.
    this.winModalEl.style.display = 'none';
    this.gameoverModalEl.style.display = 'none';
    this._newChapterModalEl.style.display = 'none';
    this._challengeModalEl.style.display = 'none';
    this._exitConfirmModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    this._clearModalSparkle(this.gameoverModalEl);
    this._clearModalSparkle(this._newChapterModalEl);
    this._clearModalSparkle(this._challengeModalEl);
    this._pendingLevelId = null;
    clearConfetti();
    clearStarSparkles();
    // Clear particle arrays so stale drops don't persist on the level-select screen.
    this._sourceSprayDrops = [];
    this._flowDrops = [];
    this._flowGoodDirs = null;
    // Reset modal menu button labels in case they were changed for playtesting.
    this.winMenuBtnEl.textContent = 'Level Select';
    this.gameoverMenuBtnEl.textContent = 'Level Select';
    // Restore the "Next Level" button visibility in case it was hidden for playtesting.
    this.winNextBtnEl.style.display = '';
    // Reset HUD exit button label in case it was changed for playtesting.
    this.exitBtnEl.textContent = '← Menu';
    this._renderLevelList();
  }

  /**
   * Estimate the total vertical pixels consumed by UI elements that appear
   * alongside the grid while playing (page title, level header, HUD buttons,
   * play-screen gaps / padding, and any visible collapsed panels below the
   * grid).  The result is passed to {@link computeTileSize} so the grid fits
   * on screen together with all of these elements.
   */
  private _computePlayOverhead(level: LevelDef): number {
    // CSS-based height estimates for elements outside/alongside the canvas.
    const H1_H           = 74; // <h1>: margin(20) + 2rem text(38) + margin(16)
    const LEVEL_HEADER_H = 22; // #level-header: 1rem line
    const HUD_H          = 32; // #hud: buttons with 6 px vertical padding
    const GAP            = 10; // gap between flex children in #play-screen
    const PADDING_BOTTOM = 24; // padding-bottom of #play-screen
    const NOTE_PANEL_H   = 42; // note panel: 12 px padding × 2 + text line
    const HINT_PANEL_H   = 37; // hint panel collapsed: toggle-button 10 px padding × 2 + font

    const hasNote  = !!level.note;
    const hasHints = !!(level.hints?.length || level.hint);

    let overhead = H1_H + LEVEL_HEADER_H + GAP + HUD_H + GAP + PADDING_BOTTOM;
    if (hasNote)  overhead += NOTE_PANEL_H  + GAP;
    if (hasHints) overhead += HINT_PANEL_H + GAP;
    return overhead;
  }

  /** Start (or restart) the given level. */
  startLevel(levelId: number): void {
    // Look up the level in the active campaign; no-op if no campaign is active.
    if (!this._activeCampaign) return;
    let level: LevelDef | undefined;
    for (const ch of this._activeCampaign.chapters) {
      level = ch.levels.find((l) => l.id === levelId);
      if (level) break;
    }
    if (!level) return;

    this.currentLevel = level;
    this.board = new Board(level.rows, level.cols, level);
    this.board.initHistory();
    this.gameState = GameState.Playing;
    this.focusPos = { ...this.board.source };
    this.selectedShape = null;
    this.pendingRotation = 0;
    this.hoverRotationDelta = 0;

    setTileSize(computeTileSize(level.rows, level.cols, this._computePlayOverhead(level)));
    this.canvas.width  = level.cols * TILE_SIZE;
    this.canvas.height = level.rows * TILE_SIZE;

    this.screen = GameScreen.Play;
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display  = 'flex';
    this.winModalEl.style.display         = 'none';
    this.gameoverModalEl.style.display    = 'none';
    this._newChapterModalEl.style.display = 'none';
    this._challengeModalEl.style.display  = 'none';
    this._exitConfirmModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    this._clearModalSparkle(this.gameoverModalEl);
    clearConfetti();
    clearStarSparkles();
    // Reset particle arrays so stale drops from a previous level don't carry over.
    this._sourceSprayDrops = [];
    this._flowDrops = [];
    this._flowGoodDirs = null;

    this._updateLevelHeader(levelId);
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this._updateNoteHintBoxes(level);
    this.canvas.focus();

    // Check for invalid initial state (e.g. pre-connected negative heaters/pumps)
    const initialError = this.board.checkInitialStateErrors();
    if (initialError) {
      this._showErrorFlash(initialError);
      if (this.board.lastErrorTilePositions && this.board.lastErrorTilePositions.length > 0) {
        this._startErrorHighlight(this.board.lastErrorTilePositions);
      }
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
        this.levelHeaderEl.textContent =
          `${campaignPrefix}Chapter ${chapterNumber}: ${chapter.name}  ·  Level ${idx + 1}: ${level.name}`;
        return;
      }
    }
    // Fallback if level isn't in any chapter
    this.currentChapterId = 0;
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const level = allLevels.find((l) => l.id === levelId);
    this.levelHeaderEl.textContent = level ? `Level ${levelId}: ${level.name}` : '';
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
    const hints = level.hints?.length
      ? level.hints
      : (level.hint ? [level.hint] : []);

    this.hintBoxEl.innerHTML = '';
    if (hints.length === 0) {
      this.hintBoxEl.style.display = 'none';
      return;
    }

    this.hintBoxEl.style.display = 'block';

    // Build nested hint elements. Each hint has a toggle button and a content div.
    // Hints after the first are nested inside the previous hint's content div.
    const btnStyle =
      'width:100%;padding:10px 16px;font-size:0.9rem;background:#1a1400;color:#f0c040;' +
      'border:none;cursor:pointer;text-align:left;font-family:inherit;';
    const textStyle =
      'display:none;padding:12px 16px;font-size:0.9rem;color:#eee;background:#16213e;';

    let containerEl: HTMLElement = this.hintBoxEl;

    hints.forEach((hint, idx) => {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.textContent = idx === 0 ? '💡 Show Hint' : '💡 Show Next Hint';
      toggleBtn.style.cssText = btnStyle;

      const textEl = document.createElement('div');
      textEl.style.cssText = textStyle;
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
      () => { this.rulesModalEl.style.display = 'flex'; },
      () => { this._openCampaignEditor(); },
      () => { this._unlockAll(); },
      activeCampaignInfo,
      campaignChapters,
      levelStars,
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
  }

  private _handleInventoryClick(shape: PipeShape, count: number): void {
    if (this.gameState !== GameState.Playing) return;
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

  // ─── Water display ────────────────────────────────────────────────────────

  private _updateWaterDisplay(): void {
    if (!this.board) return;
    const w = this.board.getCurrentWater();
    this.waterValueEl.textContent = `${w}`;
    let waterColor: string;
    if (w <= 0)      waterColor = LOW_WATER_COLOR;
    else if (w <= 5) waterColor = MEDIUM_WATER_COLOR;
    else             waterColor = WATER_COLOR;
    this.waterDisplayEl.style.color = waterColor;

    if (this.board.hasTempRelevantTiles()) {
      const t = this.board.getCurrentTemperature();
      this.tempValueEl.textContent = `${t}`;
      this.tempDisplayEl.style.display = 'flex';
    } else {
      this.tempDisplayEl.style.display = 'none';
    }

    const f = this.board.frozen;
    if (f > 0) {
      this.frozenValueEl.textContent = `${f}`;
      this.frozenDisplayEl.style.display = 'flex';
    } else {
      this.frozenDisplayEl.style.display = 'none';
    }

    if (this.board.hasPressureRelevantTiles()) {
      const p = this.board.getCurrentPressure();
      this.pressureValueEl.textContent = `${p}`;
      this.pressureDisplayEl.style.display = 'flex';
    } else {
      this.pressureDisplayEl.style.display = 'none';
    }
  }

  // ─── Main render loop ──────────────────────────────────────────────────────

  private _loop(): void {
    if (this.screen === GameScreen.Play) {
      this._renderBoard();
      renderAnimations(this.ctx, this._animations, this.canvas.width);
      this._tickSourceSpray();
      this._tickWinFlow();
    }
    requestAnimationFrame(() => this._loop());
  }

  /** Spawn and render the source spray drops (runs every frame during play). */
  private _tickSourceSpray(): void {
    if (!this.board) return;
    const now = performance.now();
    // Spawn a new drop roughly every 150 ms (~6–7 per second).
    if (now - this._lastSpraySpawn >= 150) {
      spawnSourceSprayDrop(this._sourceSprayDrops);
      this._lastSpraySpawn = now;
    }
    const sx = this.board.source.col * TILE_SIZE + TILE_SIZE / 2;
    const sy = this.board.source.row * TILE_SIZE + TILE_SIZE / 2;
    renderSourceSpray(this.ctx, this._sourceSprayDrops, sx, sy, WATER_COLOR);
  }

  /** Spawn and render the win-flow drops (only active in the Won state). */
  private _tickWinFlow(): void {
    if (this.gameState !== GameState.Won || !this.board || !this._flowGoodDirs) return;
    const now = performance.now();
    // Spawn a new drop roughly every 120 ms.
    if (now - this._lastFlowSpawn >= 120) {
      spawnFlowDrop(this._flowDrops, this.board, this._flowGoodDirs);
      this._lastFlowSpawn = now;
    }
    renderFlowDrops(this.ctx, this._flowDrops, this.board, WATER_COLOR, this._flowGoodDirs);
  }

  private _renderBoard(): void {
    if (!this.board) return;
    const currentTemp = this.board.getCurrentTemperature();
    const currentPressure = this.board.getCurrentPressure();
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
    );
  }

  // ─── Win / game-over handling ─────────────────────────────────────────────

  /**
   * Position a modal overlay so its inner box appears just below the game
   * canvas when there is enough vertical space on screen.  Falls back to the
   * default centred layout when the canvas sits too low in the viewport.
   * Must be called *after* `display` has been set to `'flex'`.
   */
  private _positionModalBelowCanvas(modalEl: HTMLElement): void {
    // Reset any styles left over from a previous showing.
    modalEl.style.alignItems = '';
    modalEl.style.paddingTop = '';

    const canvasRect = this.canvas.getBoundingClientRect();
    const viewportH  = window.innerHeight;
    const spaceBelow = viewportH - canvasRect.bottom;

    // Conservative upper-bound on the modal-box height.
    // Approximate breakdown: h2 (~40 px) + p (~60 px) + button row (~50 px) + padding/gaps (~70 px).
    const MODAL_APPROX_HEIGHT = 220;
    const MARGIN = 16;

    if (spaceBelow >= MODAL_APPROX_HEIGHT + MARGIN) {
      modalEl.style.alignItems = 'flex-start';
      modalEl.style.paddingTop = `${canvasRect.bottom + MARGIN}px`;
    }
  }

  /** Add a sparkle CSS animation to the .modal-box inside the given modal overlay. */
  private _triggerModalSparkle(modalEl: HTMLElement, colorClass: 'sparkle-gold' | 'sparkle-red' | 'sparkle-blue'): void {
    const box = modalEl.querySelector<HTMLElement>('.modal-box');
    if (!box) return;
    box.classList.remove('sparkle-gold', 'sparkle-red', 'sparkle-blue');
    void box.offsetWidth; // force reflow so removing+re-adding restarts the animation
    box.classList.add(colorClass);
  }

  /** Remove sparkle CSS animation classes from the .modal-box inside the given modal overlay. */
  private _clearModalSparkle(modalEl: HTMLElement): void {
    const box = modalEl.querySelector<HTMLElement>('.modal-box');
    if (box) box.classList.remove('sparkle-gold', 'sparkle-red', 'sparkle-blue');
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
    this._triggerModalSparkle(this._challengeModalEl, 'sparkle-red');
  }

  private _checkWinLose(): void {
    if (!this.board || this.gameState !== GameState.Playing) return;

    // Fail condition takes precedence: zero or negative water is always a loss, even if the sink was reached.
    if (this.board.getCurrentWater() <= 0) {
      this.gameState = GameState.GameOver;
      this.gameoverMsgEl.textContent = 'The tank ran dry! Undo the last move, reset the level, or return to the menu.';
      this.gameoverModalEl.style.display = 'flex';
      this._positionModalBelowCanvas(this.gameoverModalEl);
      this._triggerModalSparkle(this.gameoverModalEl, 'sparkle-red');
      return;
    }

    if (this.board.isSolved()) {
      this.gameState = GameState.Won;
      this._flowGoodDirs = computeFlowGoodDirs(this.board);
      const starsCollected = this.board.getStarsCollected();
      this._markLevelCompleted(this.currentLevel!.id);
      this._saveStars(this.currentLevel!.id, starsCollected);
      // Show star count on win modal when at least one star was connected
      if (this.winStarsEl) {
        if (starsCollected > 0) {
          this.winStarsEl.textContent = `⭐ × ${starsCollected}`;
          this.winStarsEl.style.display = 'block';
        } else {
          this.winStarsEl.style.display = 'none';
        }
      }
      this.winModalEl.style.display = 'flex';
      this._positionModalBelowCanvas(this.winModalEl);
      this._triggerModalSparkle(this.winModalEl, 'sparkle-gold');
      spawnConfetti();
      // Spawn golden sparkles over the star icon in the win modal when stars were collected
      if (starsCollected > 0 && this.winStarsEl) {
        const winStarsEl = this.winStarsEl;
        // Short delay so the modal finishes rendering and is positioned before
        // getBoundingClientRect() is called.
        const MODAL_SPARKLE_DELAY_MS = 150;
        setTimeout(() => {
          const rect = winStarsEl.getBoundingClientRect();
          spawnStarSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2, 30);
        }, MODAL_SPARKLE_DELAY_MS);
      }
      return;
    }
  }

  // ─── Input handlers ────────────────────────────────────────────────────────

  private _handleCanvasMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      if (this.screen !== GameScreen.Play) return;
      if (this.gameState !== GameState.Playing) return;
      if (!this.board) return;
      const rect = this.canvas.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
      const row = Math.floor((e.clientY - rect.top)  / TILE_SIZE);
      this._isRightDragging = true;
      this._rightDragLastTile = { row, col };
      this._suppressNextContextMenu = false;
      return;
    }
    if (e.button !== 0) return;
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (this.selectedShape === null) return; // No shape selected; click/rotation handled separately

    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)  / TILE_SIZE);
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
        if (tile && tile.shape === PipeShape.Empty) {
          // Right-clicking an empty tile: clear any pending inventory selection.
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
      if (tile) {
        const filledBefore = this.board.getFilledPositions();
        let placed = false;
        let replacedTile: Tile | undefined;
        if (tile.shape === PipeShape.Empty) {
          placed = this.board.placeInventoryTile(pos, this.selectedShape, this.pendingRotation);
        } else if (tile.shape !== this.selectedShape || tile.rotation !== this.pendingRotation) {
          replacedTile = tile;
          placed = this.board.replaceInventoryTile(pos, this.selectedShape, this.pendingRotation);
        }
        if (placed) {
          this._afterTilePlaced(this.selectedShape, filledBefore, replacedTile, pos.row, pos.col);
          this._suppressNextClick = true;
        } else if (this.board.lastError) {
          this._handleBoardError();
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
    const hCol = Math.floor(this.mouseCanvasPos.x / TILE_SIZE);
    const hRow = Math.floor(this.mouseCanvasPos.y / TILE_SIZE);
    const hTile = this.board.getTile({ row: hRow, col: hCol });
    if (!hTile || hTile.isFixed || hTile.shape === PipeShape.Empty || SPIN_PIPE_SHAPES.has(hTile.shape)) {
      return false;
    }
    this.hoverRotationDelta = ((this.hoverRotationDelta + steps + 4) % 4);
    return true;
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
      this.board.applyTurnDelta();
      this.board.recordMove();
      this._spawnDisconnectionAnimations(filledBefore, tileBeforeReclaim, pos.row, pos.col);
      this._spawnLockedCostChangeAnimations();
      this._deselectIfDepleted();
      if (hadNoSelection && reclaimedShape !== undefined) {
        this.selectedShape = reclaimedShape;
        this.pendingRotation = reclaimedRotation;
      }
      this._renderInventoryBar();
      this._updateWaterDisplay();
      this._updateUndoRedoButtons();
      this._checkWinLose();
    } else if (this.board.lastError) {
      this._handleBoardError();
    }
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

    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left)  / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)   / TILE_SIZE);
    const pos: GridPos = { row, col };
    const tile = this.board.getTile(pos);
    if (!tile) return;

    const filledBefore = this.board.getFilledPositions();

    if (SPIN_PIPE_SHAPES.has(tile.shape)) {
      // Spinnable pipes are always rotated on click (cannot be replaced or removed).
      if (this.board.rotateTile(pos)) {
        // Sync the pending placement rotation so the ghost image stays aligned.
        if (this.selectedShape === tile.shape) {
          this.pendingRotation = tile.rotation as Rotation;
        }
        this.board.applyTurnDelta();
        this.board.recordMove();
        this._spawnConnectionAnimations(filledBefore);
        this._spawnDisconnectionAnimations(filledBefore);
        this._spawnLockedCostChangeAnimations();
        this._renderInventoryBar();
        this._updateWaterDisplay();
        this._updateUndoRedoButtons();
        this._checkWinLose();
      } else if (this.board.lastError) {
        this._handleBoardError();
      }
    } else if (this.selectedShape !== null && tile.shape === PipeShape.Empty) {
      // Place pipe from inventory onto an empty cell
      if (this.board.placeInventoryTile(pos, this.selectedShape, this.pendingRotation)) {
        this._afterTilePlaced(this.selectedShape, filledBefore);
      } else if (this.board.lastError) {
        this._handleBoardError();
      }
    } else if (this.selectedShape !== null && tile.shape !== PipeShape.Empty &&
               (tile.shape !== this.selectedShape || tile.rotation !== this.pendingRotation)) {
      // Replace the existing tile with the selected inventory shape (single atomic action).
      // Also covers the same shape with a different orientation, which can disconnect a
      // granting container and must go through the container-grant constraint check.
      if (this.board.replaceInventoryTile(pos, this.selectedShape, this.pendingRotation)) {
        this._afterTilePlaced(this.selectedShape, filledBefore, tile, pos.row, pos.col);
      } else if (this.board.lastError) {
        this._handleBoardError();
      }
    } else if (tile.shape !== PipeShape.Empty) {
      // Rotate existing pipe (no inventory item selected, or same shape as selected).
      // If the user has previewed multiple rotations via Q/W/wheel, apply all of them
      // as a single game turn; otherwise fall back to a standard single 90° rotation.
      const delta = this.hoverRotationDelta;
      this.hoverRotationDelta = 0;
      const rotated = delta > 0
        ? this.board.rotateTileBy(pos, delta)
        : this.board.rotateTile(pos);
      if (rotated) {
        // Sync the pending placement rotation so the ghost image stays aligned.
        if (this.selectedShape === tile.shape) {
          this.pendingRotation = tile.rotation as Rotation;
        }
        this.board.applyTurnDelta();
        this.board.recordMove();
        this._spawnConnectionAnimations(filledBefore);
        this._spawnDisconnectionAnimations(filledBefore);
        this._spawnLockedCostChangeAnimations();
        this._renderInventoryBar();
        this._updateWaterDisplay();
        this._updateUndoRedoButtons();
        this._checkWinLose();
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

    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)  / TILE_SIZE);
    const pos: GridPos = { row, col };
    const tile = this.board.getTile(pos);

    // Right-clicking an empty tile: clear any pending inventory selection.
    if (tile && tile.shape === PipeShape.Empty) {
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
    const prevCol = this.mouseCanvasPos ? Math.floor(this.mouseCanvasPos.x / TILE_SIZE) : -1;
    const prevRow = this.mouseCanvasPos ? Math.floor(this.mouseCanvasPos.y / TILE_SIZE) : -1;
    this.mouseCanvasPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const newCol = Math.floor(this.mouseCanvasPos.x / TILE_SIZE);
    const newRow = Math.floor(this.mouseCanvasPos.y / TILE_SIZE);
    if (newRow !== prevRow || newCol !== prevCol) {
      this.hoverRotationDelta = 0;
    }
    if (this.ctrlHeld && this.gameState === GameState.Playing) {
      this._showTooltip(e.clientX, e.clientY);
    }

    // Drag-paint: place at the OLD tile each time the cursor enters a new grid cell.
    if (this._isDragging && this.selectedShape !== null &&
        this.board && this.screen === GameScreen.Play &&
        this.gameState === GameState.Playing) {
      const col = Math.floor(this.mouseCanvasPos.x / TILE_SIZE);
      const row = Math.floor(this.mouseCanvasPos.y / TILE_SIZE);
      const last = this._dragLastTile;
      if (last && (row !== last.row || col !== last.col)) {
        // Moved to a new tile: place at the tile we just left.
        const oldTile = this.board.getTile(last);
        if (oldTile) {
          const filledBefore = this.board.getFilledPositions();
          let placed = false;
          let replacedOldTile: Tile | undefined;
          if (oldTile.shape === PipeShape.Empty) {
            placed = this.board.placeInventoryTile(last, this.selectedShape, this.pendingRotation);
          } else if (oldTile.shape !== this.selectedShape || oldTile.rotation !== this.pendingRotation) {
            replacedOldTile = oldTile;
            placed = this.board.replaceInventoryTile(last, this.selectedShape, this.pendingRotation);
          }
          if (placed) {
            this._afterTilePlaced(this.selectedShape, filledBefore, replacedOldTile, last.row, last.col);
          } else if (this.board.lastError) {
            this._handleBoardError();
          }
        }
        this._dragLastTile = { row, col };
      }
    }

    // Drag-erase: reclaim the OLD tile each time the cursor enters a new grid cell.
    if (this._isRightDragging && this.board && this.screen === GameScreen.Play &&
        this.gameState === GameState.Playing) {
      const col = Math.floor(this.mouseCanvasPos.x / TILE_SIZE);
      const row = Math.floor(this.mouseCanvasPos.y / TILE_SIZE);
      const last = this._rightDragLastTile;
      if (last && (row !== last.row || col !== last.col)) {
        // Moved to a new tile: reclaim the tile we just left.
        this._reclaimTileAt(last);
        this._rightDragLastTile = { row, col };
      }
    }
  }

  private _handleCanvasWheel(e: WheelEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (this.selectedShape !== null) {
      e.preventDefault();
      // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise
      if (e.deltaY > 0) {
        this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
      } else {
        this.pendingRotation = ((this.pendingRotation + 270) % 360) as Rotation;
      }
    } else {
      // No inventory selected: preview rotation on hovered tile.
      // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise.
      const changed = this._tryAdjustHoverRotation(e.deltaY > 0 ? 1 : -1);
      if (changed) e.preventDefault();
    }
  }

  private _handleDocKeyDown(e: KeyboardEvent): void {
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

  private _showTooltip(clientX: number, clientY: number): void {
    if (this.screen !== GameScreen.Play || !this.mouseCanvasPos) return;
    const col = Math.floor(this.mouseCanvasPos.x / TILE_SIZE);
    const row = Math.floor(this.mouseCanvasPos.y / TILE_SIZE);
    if (!this.board || row < 0 || row >= this.board.rows || col < 0 || col >= this.board.cols) {
      this._hideTooltip();
      return;
    }
    // Display as (row, col) to match the GridPos convention used throughout the codebase.
    let tooltipText = `(${row}, ${col})`;
    const tile = this.board.grid[row][col];
    // Indicate a gold space regardless of the tile currently on top of it.
    if (this.board.goldSpaces.has(`${row},${col}`)) {
      tooltipText += ' (gold space)';
    }
    // Show a human-readable tile name derived from its shape and chamber content.
    const tileName = getTileDisplayName(tile);
    if (tileName) {
      tooltipText += ` ${tileName}`;
    }
    if (tile.shape === PipeShape.Chamber && tile.cost > 0) {
      // Only show a predicted cost for tiles that are NOT yet in the fill path.
      // Once a tile is connected its cost is already reflected in the water display;
      // for ice/snow/sandstone/hot_plate show the locked-in effective cost value.
      const lockedImpact = this.board.getLockedWaterImpact({ row, col });
      const isConnected = lockedImpact !== null;
      if (isConnected &&
          (tile.chamberContent === 'ice' || tile.chamberContent === 'snow' || tile.chamberContent === 'sandstone')) {
        // Show the locked calculation text using the stats at the time this tile connected.
        const lockedTemp = this.board.getLockedConnectTemp({ row, col }) ?? 0;
        const lockedPressure = this.board.getLockedConnectPressure({ row, col }) ?? 1;
        const lockedCost = Math.abs(lockedImpact);
        if (tile.chamberContent === 'ice') {
          const lockedDeltaTemp = Math.max(0, tile.temperature - lockedTemp);
          tooltipText += ` ${this._iceCostFormula(lockedDeltaTemp, tile.cost)} cost: ${lockedCost}`;
        } else if (tile.chamberContent === 'snow') {
          const lockedDeltaTemp = Math.max(0, tile.temperature - lockedTemp);
          tooltipText += ` ${this._snowCostFormula(lockedDeltaTemp, lockedPressure, tile.cost)} cost: ${lockedCost}`;
        } else {
          // sandstone
          const shatterActive = tile.shatter > tile.hardness;
          const isShatterTriggered = shatterActive && lockedPressure >= tile.shatter;
          if (isShatterTriggered) {
            tooltipText += ` [${lockedPressure}P ≥ ${tile.shatter}S] Cost: 0`;
          } else {
            const lockedDeltaDamage = lockedPressure - tile.hardness;
            if (lockedDeltaDamage >= 1) {
              const lockedDeltaTemp = Math.max(0, tile.temperature - lockedTemp);
              tooltipText += ` ${this._sandstoneCostFormula(lockedDeltaTemp, lockedPressure, tile)} cost: ${lockedCost}`;
            } else {
              tooltipText += ` cost: ${lockedCost}`;
            }
          }
        }
      } else if (isConnected && tile.chamberContent === 'hot_plate') {
        const lockedGain = this.board.getLockedHotPlateGain({ row, col });
        const lockedTemp = this.board.getLockedConnectTemp({ row, col }) ?? 0;
        if (lockedGain !== null) {
          const loss = Math.max(0, lockedGain - lockedImpact);
          tooltipText += ` ${this._hotPlateCostFormula(tile.temperature, lockedTemp, tile.cost)} (+${lockedGain} -${loss})`;
        }
      } else if (!isConnected) {
        let predictedCost: number | null = null;
        if (tile.chamberContent === 'dirt') {
          predictedCost = tile.cost;
        } else if (tile.chamberContent === 'ice') {
          // Predicted cost uses the current live temperature so the estimate updates
          // as connections (e.g. heaters on other branches) change the temperature.
          const currentTemp = this.board.getCurrentTemperature();
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          tooltipText += ` ${this._iceCostFormula(deltaTemp, tile.cost)}`;
          predictedCost = tile.cost * deltaTemp;
        } else if (tile.chamberContent === 'snow') {
          const currentTemp = this.board.getCurrentTemperature();
          const currentPressure = this.board.getCurrentPressure();
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          const effectiveCost = currentPressure >= 1 ? Math.ceil(tile.cost / currentPressure) : tile.cost;
          tooltipText += ` ${this._snowCostFormula(deltaTemp, currentPressure, tile.cost)}`;
          predictedCost = effectiveCost * deltaTemp;
        } else if (tile.chamberContent === 'sandstone') {
          const currentTemp = this.board.getCurrentTemperature();
          const currentPressure = this.board.getCurrentPressure();
          const shatterActive = tile.shatter > tile.hardness;
          const isShatterTriggered = shatterActive && currentPressure >= tile.shatter;
          if (isShatterTriggered) {
            tooltipText += ` [${currentPressure}P ≥ ${tile.shatter}S] Cost: 0`;
            predictedCost = 0;
          } else {
            const deltaDamage = currentPressure - tile.hardness;
            if (deltaDamage <= 0) {
              tooltipText += ` — Raise pressure above hardness to connect (Pressure: ${currentPressure}P, Hardness: ${tile.hardness})`;
            } else {
              const deltaTemp = Math.max(0, tile.temperature - currentTemp);
              const effectiveCost = Math.ceil(tile.cost / deltaDamage);
              tooltipText += ` ${this._sandstoneCostFormula(deltaTemp, currentPressure, tile)}`;
              predictedCost = effectiveCost * deltaTemp;
            }
          }
        } else if (tile.chamberContent === 'hot_plate') {
          const currentTemp = this.board.getCurrentTemperature();
          const effectiveCost = tile.cost * (tile.temperature + currentTemp);
          tooltipText += ` ${this._hotPlateCostFormula(tile.temperature, currentTemp, tile.cost)}`;
          predictedCost = effectiveCost;
        } else {
          predictedCost = 0;
        }
        if (predictedCost !== null && predictedCost !== 0) {
          tooltipText += ` cost: ${predictedCost}`;
        }
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
    }, 2000);
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
    }, 2000);
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
   * Spawn floating animation labels for all tiles that became newly connected to
   * the fill path since `filledBefore` was captured.  Called after every player
   * action that may change the fill state (place, replace, rotate, undo, redo).
   *
   * - Regular pipe tiles (Straight, Elbow, Tee, Cross and gold variants): "-1" (red)
   * - Chamber-tank tiles: "+capacity" (green / gray / red)
   * - Chamber-dirt tiles: "+cost" (red) when cost > 0, "-0" when cost = 0
   * - Chamber-item tiles: "+itemCount" (green / gray / red)
   * - Chamber-heater tiles: "+temperature°" (green) or "temperature°" (red) for negative
   * - Chamber-ice tiles: "-(cost × deltaTemp)" or "-0" when free (always red)
   * - Chamber-pump tiles: "+pressureP" (green) or "pressureP" (red) for negative
   * - Chamber-snow tiles: "-(⌈cost/pressure⌉ × deltaTemp)" or "-0" (always red)
   * - Chamber-sandstone tiles: "-(⌈cost/deltaDamage⌉ × deltaTemp)" or "-0" (always red)
   */
  private _spawnConnectionAnimations(filledBefore: Set<string>): void {
    if (!this.board) return;
    const filledAfter = this.board.getFilledPositions();
    const now = performance.now();
    const currentTemp = this.board.getCurrentTemperature(filledAfter);
    const currentPressure = this.board.getCurrentPressure(filledAfter);

    for (const key of filledAfter) {
      if (filledBefore.has(key)) continue; // was already filled – skip
      const [r, c] = key.split(',').map(Number);
      const tile = this.board.grid[r]?.[c];
      if (!tile) continue;

      // Lower-right quadrant of this tile (avoids drawing over the pipe image)
      const cx = c * TILE_SIZE + TILE_SIZE * 3 / 4;
      const cy = r * TILE_SIZE + TILE_SIZE * 3 / 4;

      let text: string | null = null;
      let color: string = ANIM_NEGATIVE_COLOR;

      if (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) {
        text = '-1';
        color = ANIM_NEGATIVE_COLOR;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') {
          const val = tile.capacity;
          text = val >= 0 ? `+${val}` : `${val}`;
          color = animColor(val);
        } else if (tile.chamberContent === 'dirt') {
          const val = -tile.cost;
          text = val > 0 ? `+${val}` : val < 0 ? `${val}` : '-0';
          color = animColor(val);
        } else if (tile.chamberContent === 'item' && tile.itemShape !== null) {
          const val = tile.itemCount;
          text = val >= 0 ? `+${val}` : `${val}`;
          color = ANIM_ITEM_COLOR;
          this._pendingSparkleShapes.add(tile.itemShape);
        } else if (tile.chamberContent === 'heater') {
          const tempVal = tile.temperature;
          text = tempVal >= 0 ? `+${tempVal}°` : `${tempVal}°`;
          color = animColor(tempVal);
        } else if (tile.chamberContent === 'ice') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          const val = -(tile.cost * deltaTemp);
          text = val < 0 ? `${val}` : '-0';
          color = val < 0 ? ANIM_NEGATIVE_COLOR : ANIM_ZERO_COLOR;
        } else if (tile.chamberContent === 'pump') {
          const pressVal = tile.pressure;
          text = pressVal >= 0 ? `+${pressVal}P` : `${pressVal}P`;
          color = animColor(pressVal);
        } else if (tile.chamberContent === 'snow') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          const val = -((currentPressure >= 1 ? Math.ceil(tile.cost / currentPressure) : tile.cost) * deltaTemp);
          text = val < 0 ? `${val}` : '-0';
          color = val < 0 ? ANIM_NEGATIVE_COLOR : ANIM_ZERO_COLOR;
        } else if (tile.chamberContent === 'sandstone') {
          const shatterActive = tile.shatter > tile.hardness;
          const shatterOverride = shatterActive && currentPressure >= tile.shatter;
          if (shatterOverride) {
            text = '-0';
            color = ANIM_ZERO_COLOR;
          } else {
            const deltaDamage = currentPressure - tile.hardness;
            const deltaTemp = Math.max(0, tile.temperature - currentTemp);
            const val = -((deltaDamage >= 1 ? Math.ceil(tile.cost / deltaDamage) : tile.cost) * deltaTemp);
            text = val < 0 ? `${val}` : '-0';
            color = val < 0 ? ANIM_NEGATIVE_COLOR : ANIM_ZERO_COLOR;
          }
        } else if (tile.chamberContent === 'hot_plate') {
          // Use the locked values computed by applyTurnDelta
          const lockedImpact = this.board.getLockedWaterImpact({ row: r, col: c });
          const lockedGain = this.board.getLockedHotPlateGain({ row: r, col: c });
          if (lockedImpact !== null && lockedGain !== null) {
            const loss = Math.max(0, lockedGain - lockedImpact);
            const parts: string[] = [];
            if (lockedGain > 0) parts.push(`+${lockedGain}`);
            if (loss > 0) parts.push(`-${loss}`);
            text = parts.length > 0 ? parts.join(' ') : '+0';
            color = lockedImpact >= 0 ? ANIM_POSITIVE_COLOR : ANIM_NEGATIVE_COLOR;
          }
        } else if (tile.chamberContent === 'star') {
          // Star tile connected – spawn golden sparkle burst from the tile centre
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
      const [r, c] = key.split(',').map(Number);

      // When a tile was reclaimed its cell is now Empty in the grid; use the
      // captured tile data instead.  For rotation moves all tiles remain on the
      // grid so we always fall through to the grid lookup.
      const tile = (reclaimedRow !== undefined && reclaimedCol !== undefined &&
                    r === reclaimedRow && c === reclaimedCol)
        ? reclaimedTile
        : this.board.grid[r]?.[c];
      if (!tile) continue;

      // Lower-right quadrant of this tile (matches connection animation position)
      const cx = c * TILE_SIZE + TILE_SIZE * 3 / 4;
      const cy = r * TILE_SIZE + TILE_SIZE * 3 / 4;

      let text: string | null = null;
      let color: string = ANIM_POSITIVE_COLOR;

      if (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) {
        // Each pipe costs 1 water when connected; removal returns it.
        text = '+1';
        color = ANIM_POSITIVE_COLOR;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') {
          // Tank added capacity; losing it costs capacity (val is always ≤ 0).
          const val = -tile.capacity;
          text = `${val}`;
          color = animColor(val);
        } else if (tile.chamberContent === 'dirt') {
          // Dirt cost water; removal returns that water.
          const val = tile.cost;
          text = val > 0 ? `+${val}` : val < 0 ? `${val}` : '+0';
          color = animColor(val);
        } else if (tile.chamberContent === 'ice') {
          // Ice froze water (negative impact); removal unfreezes it.
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          const val = tile.cost * deltaTemp;
          text = val > 0 ? `+${val}` : `+0`;
          color = val > 0 ? ANIM_POSITIVE_COLOR : ANIM_ZERO_COLOR;
        } else if (tile.chamberContent === 'snow') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          const val = (currentPressure >= 1 ? Math.ceil(tile.cost / currentPressure) : tile.cost) * deltaTemp;
          text = val > 0 ? `+${val}` : `+0`;
          color = val > 0 ? ANIM_POSITIVE_COLOR : ANIM_ZERO_COLOR;
        } else if (tile.chamberContent === 'sandstone') {
          const shatterActive = tile.shatter > tile.hardness;
          const shatterOverride = shatterActive && currentPressure >= tile.shatter;
          if (shatterOverride) {
            text = '+0';
            color = ANIM_ZERO_COLOR;
          } else {
            const deltaDamage = currentPressure - tile.hardness;
            const deltaTemp = Math.max(0, tile.temperature - currentTemp);
            const val = (deltaDamage >= 1 ? Math.ceil(tile.cost / deltaDamage) : tile.cost) * deltaTemp;
            text = val > 0 ? `+${val}` : `+0`;
            color = val > 0 ? ANIM_POSITIVE_COLOR : ANIM_ZERO_COLOR;
          }
        } else if (tile.chamberContent === 'hot_plate') {
          // When disconnecting, the hot plate's effects are reversed:
          // gain (from frozen) is lost; water loss is recovered
          const effectiveCost = tile.cost * (tile.temperature + currentTemp);
          const waterGain = Math.min(this.board.frozen, effectiveCost);
          const waterLoss = Math.max(0, effectiveCost - waterGain);
          // Reverse: loss recovered (+waterLoss), gain forfeited (-waterGain)
          const parts: string[] = [];
          if (waterLoss > 0) parts.push(`+${waterLoss}`);
          if (waterGain > 0) parts.push(`-${waterGain}`);
          text = parts.length > 0 ? parts.join(' ') : '-0';
          color = parts.length === 0 ? ANIM_ZERO_COLOR : waterLoss > waterGain ? ANIM_POSITIVE_COLOR : ANIM_NEGATIVE_COLOR;
        }
        // heater, pump, item: no direct water impact – no animation label
      }

      if (text !== null) {
        this._animations.push({ x: cx, y: cy, text, color, startTime: now, duration: ANIM_DURATION });
      }
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
   * Mirrors the ordering used by renderInventoryBar(): base inventory first,
   * then bonus-only shapes from connected Chamber-item tiles.
   * Wraps around; if no items are available the selection is unchanged.
   */
  private _selectNextAvailableInventory(): void {
    if (!this.board) return;

    const bonuses = this.board.getContainerBonuses();

    // Build the ordered list of selectable shapes, exactly as rendered by the
    // inventory bar, so the visual order and the cycling order agree.
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
    this.board.applyTurnDelta();
    this.board.recordMove();
    this._spawnConnectionAnimations(filledBefore);
    this._spawnDisconnectionAnimations(filledBefore, replacedTile, replacedRow, replacedCol);
    this._spawnLockedCostChangeAnimations();
    this.lastPlacedRotations.set(placedShape, this.pendingRotation);
    this._deselectIfDepleted();
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this._checkWinLose();
  }

  private _handleKey(e: KeyboardEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (!this.board) return;
    const { focusPos, board } = this;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (focusPos.row > 0) this.focusPos = { ...focusPos, row: focusPos.row - 1 };
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (focusPos.row < board.rows - 1) this.focusPos = { ...focusPos, row: focusPos.row + 1 };
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (focusPos.col > 0) this.focusPos = { ...focusPos, col: focusPos.col - 1 };
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (focusPos.col < board.cols - 1) this.focusPos = { ...focusPos, col: focusPos.col + 1 };
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          const tile = board.getTile(focusPos);
          const filledBefore = board.getFilledPositions();
          if (tile?.shape === PipeShape.Empty) {
            if (board.placeInventoryTile(focusPos, this.selectedShape, this.pendingRotation)) {
              this._afterTilePlaced(this.selectedShape, filledBefore);
            }
          } else if (tile && (tile.shape !== this.selectedShape || tile.rotation !== this.pendingRotation)) {
            // Replace the existing tile with the selected inventory shape.
            // Also covers the same shape with a different orientation, which can disconnect a
            // granting container and must go through the container-grant constraint check.
            if (board.replaceInventoryTile(focusPos, this.selectedShape, this.pendingRotation)) {
              this._afterTilePlaced(this.selectedShape, filledBefore, tile, focusPos.row, focusPos.col);
            } else if (board.lastError) {
              this._handleBoardError();
            }
          }
        } else {
          const filledBefore = board.getFilledPositions();
          if (board.rotateTile(focusPos)) {
            board.applyTurnDelta();
            board.recordMove();
            this._spawnConnectionAnimations(filledBefore);
            this._spawnDisconnectionAnimations(filledBefore);
            this._spawnLockedCostChangeAnimations();
            this._renderInventoryBar();
            this._updateWaterDisplay();
            this._updateUndoRedoButtons();
            this._checkWinLose();
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
          this.pendingRotation = (((this.pendingRotation - 90) + 360) % 360) as Rotation;
        } else {
          this._tryAdjustHoverRotation(-1);
        }
        break;
      case 'w':
      case 'W':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
        } else {
          this._tryAdjustHoverRotation(1);
        }
        break;
      case 'Escape':
        if (this.rulesModalEl.style.display !== 'none') {
          // Close the rules modal first if it is open.
          this.rulesModalEl.style.display = 'none';
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
   */
  retryLevel(): void {
    if (!this.currentLevel) return;
    const prevBoard = this.board;
    this.startLevel(this.currentLevel.id);
    // Graft the pre-restart history onto the new board so Undo can revert to
    // the state the player was in before restarting.
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

    if (
      currentChapter !== undefined &&
      nextChapter !== undefined &&
      currentChapter !== nextChapter &&
      nextChapter.levels[0].id === nextLevelDef.id
    ) {
      const chapterIdx = chapters.indexOf(nextChapter);
      this.startLevel(nextLevelDef.id);
      this._showNewChapterModal(chapterIdx, nextChapter);
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
    this._newChapterModalEl.style.display = 'none';
    this._clearModalSparkle(this._newChapterModalEl);
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
    this._challengeModalEl.style.display = 'none';
    this._clearModalSparkle(this._challengeModalEl);
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
    this._challengeModalEl.style.display = 'none';
    this._clearModalSparkle(this._challengeModalEl);
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
    this.winModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    clearConfetti();
    clearStarSparkles();
    // Clear win-flow drops since we're no longer in a won state.
    this._flowDrops = [];
    this._flowGoodDirs = null;
    this._spawnConnectionAnimations(filledBefore);
    this._deselectIfDepleted();
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this._renderBoard();
  }

  /**
   * Undo the last player action.
   * When called from the game-over modal, also dismisses the modal and resumes play.
   */
  performUndo(): void {
    if (!this.board || !this.board.canUndo()) return;
    const filledBefore = this.board.getFilledPositions();
    this.board.undoMove();
    this.gameState = GameState.Playing;
    this.gameoverModalEl.style.display = 'none';
    this._clearModalSparkle(this.gameoverModalEl);
    this._spawnConnectionAnimations(filledBefore);
    this._deselectIfDepleted();
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this._renderBoard();
  }

  /** Redo the last undone player action. */
  performRedo(): void {
    if (!this.board || !this.board.canRedo()) return;
    const filledBefore = this.board.getFilledPositions();
    this.board.redoMove();
    this._spawnConnectionAnimations(filledBefore);
    this._spawnDisconnectionAnimations(filledBefore);
    this._deselectIfDepleted();
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this._renderBoard();
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
    } else {
      this._showLevelSelect();
    }
  }

  /** Show the game-rules modal overlay. */
  showRules(): void {
    this.rulesModalEl.style.display = 'flex';
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
    this.board.initHistory();
    this.gameState = GameState.Playing;
    this.focusPos = { ...this.board.source };
    this.selectedShape = null;
    this.pendingRotation = 0;
    this.hoverRotationDelta = 0;

    setTileSize(computeTileSize(level.rows, level.cols, this._computePlayOverhead(level)));
    this.canvas.width  = level.cols * TILE_SIZE;
    this.canvas.height = level.rows * TILE_SIZE;

    this.screen = GameScreen.Play;
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display  = 'flex';
    this.winModalEl.style.display         = 'none';
    this.gameoverModalEl.style.display    = 'none';
    this._newChapterModalEl.style.display = 'none';
    this._challengeModalEl.style.display  = 'none';
    this._exitConfirmModalEl.style.display = 'none';
    this._clearModalSparkle(this.winModalEl);
    this._clearModalSparkle(this.gameoverModalEl);
    clearConfetti();
    clearStarSparkles();
    // Reset particle arrays for the playtested level.
    this._sourceSprayDrops = [];
    this._flowDrops = [];
    this._flowGoodDirs = null;
    this.currentChapterId = 0;
    this.levelHeaderEl.textContent = `▶ Playtesting: ${level.name}`;
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateNoteHintBoxes(level);
    this._updateUndoRedoButtons();
    this.canvas.focus();

    // Check for invalid initial state (e.g. pre-connected negative heaters/pumps)
    const initialError = this.board.checkInitialStateErrors();
    if (initialError) {
      this._showErrorFlash(initialError);
      if (this.board.lastErrorTilePositions && this.board.lastErrorTilePositions.length > 0) {
        this._startErrorHighlight(this.board.lastErrorTilePositions);
      }
    }
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

  /** Clear all level-completion progress and refresh the level list. */
  private _resetProgress(): void {
    if (this._activeCampaign) {
      clearCampaignProgress(this._activeCampaign.id, this._activeCampaignProgress);
      clearLevelStars(this._activeCampaign.id);
    } else {
      clearCompletedLevels(this.completedLevels);
      clearLevelStars();
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
    saveActiveCampaignId(campaign.id);
    this._showLevelSelect();
  }

  /** Deactivate the current campaign and return to the official campaign. */
  private _deactivateCampaign(): void {
    this._activeCampaign = null;
    this._activeCampaignProgress = new Set();
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
    } else {
      // Campaign no longer exists – clear the persisted ID.
      clearActiveCampaignId();
    }
  }
}

// Re-export for backward compatibility with tests that import InventoryItem via game.ts
export type { InventoryItem, LevelDef };
