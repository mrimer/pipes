import { Board } from './board';
import { LEVELS } from './levels';
import { GameScreen, GameState, GridPos, InventoryItem, LevelDef, PipeShape, Rotation } from './types';
import { WATER_COLOR, LOW_WATER_COLOR } from './colors';
import { TILE_SIZE, renderBoard } from './renderer';
import { renderInventoryBar } from './inventoryRenderer';
import { renderLevelList } from './levelSelect';
import { loadCompletedLevels, markLevelCompleted, clearCompletedLevels } from './persistence';

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
  private readonly inventoryBarEl: HTMLElement;
  private readonly waterDisplayEl: HTMLElement;
  private readonly winModalEl: HTMLElement;
  private readonly gameoverModalEl: HTMLElement;
  private readonly gameoverMsgEl: HTMLElement;

  /** Undo button in the play-screen HUD. */
  private readonly undoBtnEl: HTMLButtonElement;

  /** Redo button in the play-screen HUD. */
  private readonly redoBtnEl: HTMLButtonElement;

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

  /** Levels that have been successfully completed (persisted in localStorage). */
  private completedLevels: Set<number>;

  constructor(
    canvas: HTMLCanvasElement,
    levelSelectEl: HTMLElement,
    levelListEl: HTMLElement,
    playScreenEl: HTMLElement,
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
    this.inventoryBarEl = inventoryBarEl;
    this.waterDisplayEl = waterDisplayEl;
    this.winModalEl = winModalEl;
    this.gameoverModalEl = gameoverModalEl;
    this.gameoverMsgEl = gameoverMsgEl;
    this.undoBtnEl = undoBtnEl;
    this.redoBtnEl = redoBtnEl;

    // Load persisted completions
    this.completedLevels = loadCompletedLevels();

    // Create the tooltip element for Ctrl+hover grid coordinates
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText =
      'display:none;position:fixed;background:#16213e;color:#eee;border:1px solid #4a90d9;' +
      'border-radius:4px;padding:4px 8px;font-size:0.8rem;pointer-events:none;z-index:50;';
    document.body.appendChild(this.tooltipEl);

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
    this._renderLevelList();
  }

  /** Start (or restart) the given level. */
  startLevel(levelId: number): void {
    const level = LEVELS.find((l) => l.id === levelId);
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

    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this.canvas.focus();
  }

  // ─── Level-select rendering ───────────────────────────────────────────────

  private _renderLevelList(): void {
    renderLevelList(
      this.levelListEl,
      this.completedLevels,
      (id) => this.startLevel(id),
      () => { this.resetConfirmModalEl.style.display = 'flex'; },
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
  }

  // ─── Main render loop ──────────────────────────────────────────────────────

  private _loop(): void {
    if (this.screen === GameScreen.Play) this._renderBoard();
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

    if (this.board.isSolved()) {
      this.gameState = GameState.Won;
      this._markLevelCompleted(this.currentLevel!.id);
      this.winModalEl.style.display = 'flex';
      return;
    }

    if (this.board.getCurrentWater() <= 0) {
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

    if (this.selectedShape !== null && tile.shape === PipeShape.Empty) {
      // Place pipe from inventory
      if (this.board.placeInventoryTile(pos, this.selectedShape, this.pendingRotation)) {
        this.board.recordMove();
        // Remember the rotation used so the next placement defaults to it
        const placedShape = this.selectedShape;
        this.lastPlacedRotations.set(placedShape, this.pendingRotation);
        // Keep selected shape if there is still stock remaining
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
    } else if (tile.shape !== PipeShape.Empty) {
      // Rotate existing pipe
      this.board.rotateTile(pos);
      this.board.recordMove();
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
    this.tooltipEl.textContent = `(${row}, ${col})`;
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
          if (tile?.shape === PipeShape.Empty) {
            if (board.placeInventoryTile(focusPos, this.selectedShape, this.pendingRotation)) {
              board.recordMove();
              // Remember the rotation used so the next placement defaults to it
              const placedShape = this.selectedShape;
              this.lastPlacedRotations.set(placedShape, this.pendingRotation);
              // Keep selected shape if there is still stock remaining
              const inv = board.inventory.find((it) => it.shape === placedShape);
              const bonuses = board.getContainerBonuses();
              const effectiveCount = (inv?.count ?? 0) + (bonuses.get(placedShape) ?? 0);
              if (effectiveCount <= 0) {
                this.selectedShape = null;
              }
              this._renderInventoryBar();
              this._updateWaterDisplay();
              this._updateUndoRedoButtons();
              this._checkWinLose();
            }
          }
        } else {
          board.rotateTile(focusPos);
          board.recordMove();
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
   * Undo the last player action.
   * When called from the game-over modal, also dismisses the modal and resumes play.
   */
  performUndo(): void {
    if (!this.board || !this.board.canUndo()) return;
    this.board.undoMove();
    this.gameState = GameState.Playing;
    this.gameoverModalEl.style.display = 'none';
    this._renderInventoryBar();
    this._updateWaterDisplay();
    this._updateUndoRedoButtons();
    this._renderBoard();
  }

  /** Redo the last undone player action. */
  performRedo(): void {
    if (!this.board || !this.board.canRedo()) return;
    this.board.redoMove();
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
    this._showLevelSelect();
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
    markLevelCompleted(this.completedLevels, levelId);
  }

  /** Clear all level-completion progress and refresh the level list. */
  private _resetProgress(): void {
    clearCompletedLevels(this.completedLevels);
    this._renderLevelList();
  }
}

// Re-export for backward compatibility with tests that import InventoryItem via game.ts
export type { InventoryItem, LevelDef };
