import { Board, PIPE_SHAPES, GOLD_PIPE_SHAPES } from './board';
import { LEVELS, CHAPTERS } from './levels';
import { GameScreen, GameState, GridPos, InventoryItem, LevelDef, PipeShape, CampaignDef, Rotation } from './types';
import { WATER_COLOR, LOW_WATER_COLOR } from './colors';
import { TILE_SIZE, renderBoard, getTileDisplayName } from './renderer';
import { renderInventoryBar } from './inventoryRenderer';
import { renderLevelList } from './levelSelect';
import {
  loadCompletedLevels, markLevelCompleted, clearCompletedLevels, markAllLevelsCompleted,
  loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress,
  loadActiveCampaignId, saveActiveCampaignId, clearActiveCampaignId,
  computeCampaignCompletionPct,
} from './persistence';
import { createGameRulesModal } from './rulesModal';
import { TileAnimation, renderAnimations, animColor, ANIM_DURATION, ANIM_NEGATIVE_COLOR } from './tileAnimation';
import { CampaignEditor, OFFICIAL_CAMPAIGN } from './campaignEditor';

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

  /** Last-used placement rotation per pipe shape, so the same orientation is reused next time. */
  private readonly lastPlacedRotations = new Map<PipeShape, Rotation>();

  /** Most-recent mouse position over the canvas in canvas-pixel coordinates. */
  private mouseCanvasPos: { x: number; y: number } | null = null;

  /** Whether the Ctrl key is currently held. */
  private ctrlHeld = false;

  /** Tooltip element for displaying grid coordinates under Ctrl. */
  private readonly tooltipEl: HTMLElement;

  /** Floating error message element shown briefly when an action is blocked. */
  private readonly errorFlashEl: HTMLElement;
  /** Timer ID for auto-hiding the error flash message. */
  private _errorFlashTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Chapter ID of the level currently being played (0 if unknown). */
  private currentChapterId = 0;

  /** Element showing the current source temperature (shown for Chapter 2+ levels). */
  private readonly tempDisplayEl: HTMLElement;

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

    // Create the temperature display element (inserted into the HUD next to water display)
    this.tempDisplayEl = document.createElement('span');
    this.tempDisplayEl.style.cssText =
      'display:none;font-size:1.1rem;font-weight:bold;color:#74b9ff;';
    this.waterDisplayEl.insertAdjacentElement('afterend', this.tempDisplayEl);

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
    }

    canvas.addEventListener('click',        (e) => this._handleCanvasClick(e));
    canvas.addEventListener('contextmenu',  (e) => this._handleCanvasRightClick(e));
    canvas.addEventListener('mousemove',    (e) => this._handleCanvasMouseMove(e));
    canvas.addEventListener('mouseleave',   ()  => this._hideTooltip());
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
    // Explicitly hide both modal overlays so they cannot cover the level-select
    // screen when returning from a completed or failed level.
    this.winModalEl.style.display = 'none';
    this.gameoverModalEl.style.display = 'none';
    // Reset modal menu button labels in case they were changed for playtesting.
    this.winMenuBtnEl.textContent = 'Level Select';
    this.gameoverMenuBtnEl.textContent = 'Level Select';
    this._renderLevelList();
  }

  /** Start (or restart) the given level. */
  startLevel(levelId: number): void {
    // Look up the level in either the active campaign or the official levels
    let level: LevelDef | undefined;
    if (this._activeCampaign) {
      for (const ch of this._activeCampaign.chapters) {
        level = ch.levels.find((l) => l.id === levelId);
        if (level) break;
      }
    }
    if (!level) {
      level = LEVELS.find((l) => l.id === levelId);
    }
    if (!level) return;

    this.currentLevel = level;
    this.board = new Board(level.rows, level.cols, level);
    this.board.initHistory();
    this.gameState = GameState.Playing;
    this.focusPos = { row: 0, col: 0 };
    this.selectedShape = null;
    this.pendingRotation = 0;

    this.canvas.width  = level.cols * TILE_SIZE;
    this.canvas.height = level.rows * TILE_SIZE;

    this.screen = GameScreen.Play;
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display  = 'flex';
    this.winModalEl.style.display      = 'none';
    this.gameoverModalEl.style.display = 'none';

    this._updateLevelHeader(levelId);
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this.canvas.focus();
  }

  /** Update the level-header element with the current chapter, level number and name. */
  private _updateLevelHeader(levelId: number): void {
    // Search active campaign chapters first, then fall back to official chapters
    const chapters = this._activeCampaign ? this._activeCampaign.chapters : CHAPTERS;
    for (const chapter of chapters) {
      const idx = chapter.levels.findIndex((l) => l.id === levelId);
      if (idx !== -1) {
        this.currentChapterId = chapter.id;
        const level = chapter.levels[idx];
        const campaignPrefix = this._activeCampaign
          ? `${this._activeCampaign.name}  ·  `
          : '';
        this.levelHeaderEl.textContent =
          `${campaignPrefix}Chapter ${chapter.id}: ${chapter.name}  ·  Level ${idx + 1}: ${level.name}`;
        return;
      }
    }
    // Fallback if level isn't in any chapter
    this.currentChapterId = 0;
    const level = LEVELS.find((l) => l.id === levelId);
    this.levelHeaderEl.textContent = level ? `Level ${levelId}: ${level.name}` : '';
  }

  // ─── Level-select rendering ───────────────────────────────────────────────

  private _renderLevelList(): void {
    const displayCampaign = this._activeCampaign ?? OFFICIAL_CAMPAIGN;
    const displayProgress = this._activeCampaign ? this._activeCampaignProgress : this.completedLevels;
    const pct = computeCampaignCompletionPct(displayCampaign, displayProgress);
    const activeCampaignInfo = {
      name: displayCampaign.name,
      author: displayCampaign.author,
      completionPct: pct,
    };
    const campaignChapters = this._activeCampaign?.chapters;
    renderLevelList(
      this.levelListEl,
      displayProgress,
      (id) => this.startLevel(id),
      () => { this.resetConfirmModalEl.style.display = 'flex'; },
      () => { this.rulesModalEl.style.display = 'flex'; },
      () => { this._openCampaignEditor(); },
      () => { this._unlockAll(); },
      activeCampaignInfo,
      campaignChapters,
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
  }

  private _handleInventoryClick(shape: PipeShape, count: number): void {
    if (this.gameState !== GameState.Playing) return;
    if (count === 0) return;
    this.selectedShape = this.selectedShape === shape ? null : shape;
    if (this.selectedShape !== null) {
      this.pendingRotation = this.lastPlacedRotations.get(shape) ?? 0;
    }
    this._renderInventoryBar();
  }

  // ─── Water display ────────────────────────────────────────────────────────

  private _updateWaterDisplay(): void {
    if (!this.board) return;
    const w = this.board.getCurrentWater();
    this.waterDisplayEl.textContent = `💧 Water: ${w}`;
    this.waterDisplayEl.style.color = w <= 5 ? LOW_WATER_COLOR : WATER_COLOR;

    if (this.board.hasTempRelevantTiles()) {
      const t = this.board.getCurrentTemperature();
      this.tempDisplayEl.textContent = `🌡️ Temp: ${t}°`;
      this.tempDisplayEl.style.display = 'inline';
    } else {
      this.tempDisplayEl.style.display = 'none';
    }
  }

  // ─── Main render loop ──────────────────────────────────────────────────────

  private _loop(): void {
    if (this.screen === GameScreen.Play) {
      this._renderBoard();
      renderAnimations(this.ctx, this._animations);
    }
    requestAnimationFrame(() => this._loop());
  }

  private _renderBoard(): void {
    if (!this.board) return;
    renderBoard(
      this.ctx,
      this.canvas,
      this.board,
      this.focusPos,
      this.selectedShape,
      this.pendingRotation,
      this.mouseCanvasPos,
    );
  }

  // ─── Win / game-over handling ─────────────────────────────────────────────

  private _checkWinLose(): void {
    if (!this.board || this.gameState !== GameState.Playing) return;

    // Fail condition takes precedence: negative water is always a loss, even if the sink was reached.
    if (this.board.getCurrentWater() < 0) {
      this.gameState = GameState.GameOver;
      this.gameoverMsgEl.textContent = 'The tank ran dry! Undo the last move, reset the level, or return to the menu.';
      this.gameoverModalEl.style.display = 'flex';
      return;
    }

    if (this.board.isSolved()) {
      this.gameState = GameState.Won;
      this._markLevelCompleted(this.currentLevel!.id);
      this.winModalEl.style.display = 'flex';
      return;
    }

    if (this.board.getCurrentWater() === 0) {
      this.gameState = GameState.GameOver;
      this.gameoverMsgEl.textContent = 'The tank ran dry! Undo the last move, reset the level, or return to the menu.';
      this.gameoverModalEl.style.display = 'flex';
    }
  }

  // ─── Input handlers ────────────────────────────────────────────────────────

  private _handleCanvasClick(e: MouseEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (!this.board) return;

    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left)  / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)   / TILE_SIZE);
    const pos: GridPos = { row, col };
    const tile = this.board.getTile(pos);
    if (!tile) return;

    const filledBefore = this.board.getFilledPositions();

    if (this.selectedShape !== null && tile.shape === PipeShape.Empty) {
      // Place pipe from inventory onto an empty cell
      if (this.board.placeInventoryTile(pos, this.selectedShape, this.pendingRotation)) {
        this._afterTilePlaced(this.selectedShape, filledBefore);
      }
    } else if (this.selectedShape !== null && tile.shape !== PipeShape.Empty && tile.shape !== this.selectedShape) {
      // Replace the existing tile with the selected inventory shape (single atomic action).
      // Same-shape tiles fall through to the rotate branch below for consistency.
      if (this.board.replaceInventoryTile(pos, this.selectedShape, this.pendingRotation)) {
        this._afterTilePlaced(this.selectedShape, filledBefore);
      } else if (this.board.lastError) {
        this._showErrorFlash(this.board.lastError);
      }
    } else if (tile.shape !== PipeShape.Empty) {
      // Rotate existing pipe (no inventory item selected, or same shape as selected)
      this.board.rotateTile(pos);
      this.board.applyTurnDelta();
      this.board.recordMove();
      this._spawnConnectionAnimations(filledBefore);
      this._renderInventoryBar();
      this._updateWaterDisplay();
      this._updateUndoRedoButtons();
      this._checkWinLose();
    }
  }

  private _handleCanvasRightClick(e: MouseEvent): void {
    e.preventDefault();
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (!this.board) return;

    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)  / TILE_SIZE);

    if (this.board.reclaimTile({ row, col })) {
      this.board.applyTurnDelta();
      this._renderInventoryBar();
      this._updateWaterDisplay();
    } else if (this.board.lastError) {
      this._showErrorFlash(this.board.lastError);
    }
  }

  private _handleCanvasMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseCanvasPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (this.ctrlHeld) {
      this._showTooltip(e.clientX, e.clientY);
    }
  }

  private _handleCanvasWheel(e: WheelEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (this.selectedShape === null) return;
    e.preventDefault();
    // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise
    if (e.deltaY > 0) {
      this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
    } else {
      this.pendingRotation = ((this.pendingRotation + 270) % 360) as Rotation;
    }
  }

  private _handleDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Control' && !this.ctrlHeld) {
      this.ctrlHeld = true;
      if (this.mouseCanvasPos) {
        const rect = this.canvas.getBoundingClientRect();
        this._showTooltip(
          this.mouseCanvasPos.x + rect.left,
          this.mouseCanvasPos.y + rect.top,
        );
      }
    }
  }

  private _handleDocKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Control') {
      this.ctrlHeld = false;
      this._hideTooltip();
    }
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
    // Show a human-readable tile name derived from its shape and chamber content.
    const tileName = getTileDisplayName(tile);
    if (tileName) {
      tooltipText += ` ${tileName}`;
    }
    if (tile.shape === PipeShape.Chamber && tile.cost > 0) {
      // Only show a predicted cost for tiles that are NOT yet in the fill path.
      // Once a tile is connected its cost is already reflected in the water display;
      // re-showing it in the tooltip would be misleading.
      const isConnected = this.board.getLockedWaterImpact({ row, col }) !== null;
      if (!isConnected) {
        let predictedCost: number;
        if (tile.chamberContent === 'dirt') {
          predictedCost = tile.cost;
        } else if (tile.chamberContent === 'ice') {
          // Predicted cost uses the current live temperature so the estimate updates
          // as connections (e.g. heaters on other branches) change the temperature.
          const currentTemp = this.board.getCurrentTemperature();
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          predictedCost = tile.cost * deltaTemp;
        } else {
          predictedCost = 0;
        }
        tooltipText += ` cost: ${predictedCost}`;
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
   * Spawn floating animation labels for all tiles that became newly connected to
   * the fill path since `filledBefore` was captured.  Called after every player
   * action that may change the fill state (place, replace, rotate, undo, redo).
   *
   * - Regular pipe tiles (Straight, Elbow, Tee, Cross and gold variants): "-1" (red)
   * - Chamber-tank tiles: "+capacity" (green / gray / red)
   * - Chamber-dirt tiles: "+cost" (red) when cost > 0, "-0" when cost = 0
   * - Chamber-item tiles: "+itemCount" (green / gray / red)
   * - Chamber-heater tiles: "+temperature°" (green)
   * - Chamber-ice tiles: "-(cost × deltaTemp)" or "-0" when free (always red)
   */
  private _spawnConnectionAnimations(filledBefore: Set<string>): void {
    if (!this.board) return;
    const filledAfter = this.board.getFilledPositions();
    const now = performance.now();
    const currentTemp = this.board.getCurrentTemperature(filledAfter);

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
          color = val > 0 ? animColor(val) : ANIM_NEGATIVE_COLOR;
        } else if (tile.chamberContent === 'item' && tile.itemShape !== null) {
          const val = tile.itemCount;
          text = val >= 0 ? `+${val}` : `${val}`;
          color = animColor(val);
        } else if (tile.chamberContent === 'heater') {
          text = `+${tile.temperature}°`;
          color = animColor(tile.temperature);
        } else if (tile.chamberContent === 'ice') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          const val = -(tile.cost * deltaTemp);
          text = val < 0 ? `${val}` : '-0';
          color = ANIM_NEGATIVE_COLOR;
        }
      }

      if (text !== null) {
        this._animations.push({ x: cx, y: cy, text, color, startTime: now, duration: ANIM_DURATION });
      }
    }
  }

  /**
   * Post-placement bookkeeping shared by both place and replace actions.
   * Records the move, updates last-used rotation, deselects the shape when
   * inventory is exhausted, and refreshes all affected UI elements.
   */
  private _afterTilePlaced(placedShape: PipeShape, filledBefore: Set<string>): void {
    if (!this.board) return;
    this.board.applyTurnDelta();
    this.board.recordMove();
    this._spawnConnectionAnimations(filledBefore);
    this.lastPlacedRotations.set(placedShape, this.pendingRotation);
    const inv = this.board.inventory.find((it) => it.shape === placedShape);
    const bonuses = this.board.getContainerBonuses();
    const effectiveCount = (inv?.count ?? 0) + (bonuses.get(placedShape) ?? 0);
    if (effectiveCount <= 0) {
      this.selectedShape = null;
    }
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
          } else if (tile && tile.shape !== this.selectedShape) {
            // Replace the existing tile with the selected inventory shape.
            // Same-shape tiles fall through to the rotate branch below for consistency.
            if (board.replaceInventoryTile(focusPos, this.selectedShape, this.pendingRotation)) {
              this._afterTilePlaced(this.selectedShape, filledBefore);
            } else if (board.lastError) {
              this._showErrorFlash(board.lastError);
            }
          }
        } else {
          const filledBefore = board.getFilledPositions();
          board.rotateTile(focusPos);
          board.applyTurnDelta();
          board.recordMove();
          this._spawnConnectionAnimations(filledBefore);
          this._renderInventoryBar();
          this._updateWaterDisplay();
          this._updateUndoRedoButtons();
          this._checkWinLose();
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
        }
        break;
      case 'Escape':
        this.selectedShape = null;
        this._renderInventoryBar();
        break;
    }
  }

  // ─── Public API called by main.ts button handlers ─────────────────────────

  /** Retry the current level from scratch. */
  retryLevel(): void {
    if (this.currentLevel) this.startLevel(this.currentLevel.id);
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
    this._spawnConnectionAnimations(filledBefore);
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
    this._spawnConnectionAnimations(filledBefore);
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
    this.focusPos = { row: 0, col: 0 };
    this.selectedShape = null;
    this.pendingRotation = 0;

    this.canvas.width  = level.cols * TILE_SIZE;
    this.canvas.height = level.rows * TILE_SIZE;

    this.screen = GameScreen.Play;
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display  = 'flex';
    this.winModalEl.style.display      = 'none';
    this.gameoverModalEl.style.display = 'none';

    // Show level name in the header (no chapter context for ad-hoc levels)
    this.currentChapterId = 0;
    this.levelHeaderEl.textContent = `▶ Playtesting: ${level.name}`;
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this.canvas.focus();
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
    if (this._activeCampaign) {
      markCampaignLevelCompleted(this._activeCampaign.id, levelId, this._activeCampaignProgress);
    } else {
      markLevelCompleted(this.completedLevels, levelId);
    }
  }

  /** Clear all level-completion progress and refresh the level list. */
  private _resetProgress(): void {
    if (this._activeCampaign) {
      clearCampaignProgress(this._activeCampaign.id, this._activeCampaignProgress);
    } else {
      clearCompletedLevels(this.completedLevels);
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
    } else {
      markAllLevelsCompleted(this.completedLevels, LEVELS.map((l) => l.id));
    }
    this._renderLevelList();
  }

  // ─── Active campaign management ───────────────────────────────────────────

  /** Activate a campaign for play on the main menu.
   * Passing the official campaign (id === 'official') deactivates any active non-official campaign
   * and returns to the built-in level set. */
  private _activateCampaign(campaign: CampaignDef): void {
    if (campaign.id === 'official') {
      this._deactivateCampaign();
      return;
    }
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
   * Restore the active campaign from a persisted campaign ID.
   * Called during construction to reload the previous session's active campaign.
   */
  private _restoreActiveCampaign(campaignId: string): void {
    // The campaign editor manages user campaigns; reload them to find the campaign.
    const allCampaigns = this.campaignEditor.getAllCampaigns();
    const campaign = allCampaigns.find((c) => c.id === campaignId);
    if (campaign && campaign.id !== 'official') {
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
