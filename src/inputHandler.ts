import { Board, MoveResult, SPIN_PIPE_SHAPES, isEmptyFloor } from './board';
import { Tile } from './tile';
import { GameScreen, GameState, GridPos, PipeShape, Rotation } from './types';
import { TILE_SIZE } from './renderer';
import { sfxManager, SfxId } from './sfxManager';

/**
 * Callback interface that {@link InputHandler} calls into Game for all board
 * mutations and UI effects.  Game implements this interface directly — no
 * adapter layer is required.
 */
export interface InputCallbacks {
  // ── Board access ────────────────────────────────────────────────────────────
  getBoard(): Board | null;
  getGameState(): GameState;
  getScreen(): GameScreen;
  getSelectedShape(): PipeShape | null;
  setSelectedShape(shape: PipeShape | null): void;
  getPendingRotation(): Rotation;
  setPendingRotation(r: Rotation): void;
  getFocusPos(): GridPos;
  setFocusPos(pos: GridPos): void;

  // ── Actions ─────────────────────────────────────────────────────────────────
  /** Place or replace the currently selected shape at pos. Returns true when a board op was attempted. */
  tryPlaceOrReplace(pos: GridPos, tile: Tile, filledBefore: Set<string>): boolean;
  /** Remove the tile at pos, return it to inventory, and refresh UI. */
  reclaimTileAt(pos: GridPos): void;
  /** Cycle the inventory selection to the next available shape. */
  selectNextAvailableInventory(): void;
  performUndo(): void;
  performRedo(): void;
  retryLevel(): void;

  // ── Post-action hooks ───────────────────────────────────────────────────────
  /**
   * Called after a successful tile placement.  Handles animations, records the
   * move, updates lastPlacedRotations, deselects if depleted, and refreshes UI.
   */
  afterTilePlaced(
    shape: PipeShape,
    result: MoveResult,
    filledBefore: Set<string>,
    replacedTile?: Tile,
    row?: number,
    col?: number,
  ): void;
  /**
   * Called after a successful tile rotation.  Handles animations and records
   * the move.  Does **not** call refreshUI/checkWinLose — the caller is
   * responsible for invoking those separately.
   */
  afterTileRotated(
    filledBefore: Set<string>,
    result: MoveResult,
    rotationInfo?: { row: number; col: number; oldRotation: number },
  ): void;
  /** Show an error flash and optional tile highlights for a failed board operation. */
  handleBoardError(result: MoveResult): void;
  /** Re-render the inventory bar, water display, and undo/redo button states. */
  refreshUI(): void;
  /** Check for win/loss conditions and trigger the appropriate modal if needed. */
  checkWinLose(): void;

  // ── Tooltip ─────────────────────────────────────────────────────────────────
  showTooltip(clientX: number, clientY: number): void;
  hideTooltip(): void;

  // ── Additional UI callbacks ─────────────────────────────────────────────────
  /** Re-render the inventory bar (selection + sparkle effects). */
  renderInventoryBar(): void;
  /**
   * Handle the Escape key: close the rules modal if open, toggle the exit-
   * confirm modal during play, or exit to the menu otherwise.
   */
  handleEscapeKey(): void;
  /** Flash a red "unavailable" sparkle on the given inventory item. */
  flashInventoryItemError(shape: PipeShape): void;
}

/**
 * Owns all input state and event-handling logic.
 * Calls back into Game via {@link InputCallbacks} for board mutations and UI effects.
 */
export class InputHandler {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _cb: InputCallbacks;

  // ── Drag state ─────────────────────────────────────────────────────────────

  /** True while the left mouse button is held on the canvas with a shape selected. */
  private _isDragging = false;

  /** Grid position of the tile the drag gesture is currently over. */
  private _dragLastTile: GridPos | null = null;

  /**
   * True when the drag gesture moved to at least one new tile and already
   * handled placement, so the subsequent click event (if it fires) should
   * be suppressed.
   */
  private _suppressNextClick = false;

  /** True while the right mouse button is held on the canvas (drag-erase). */
  private _isRightDragging = false;

  /** Grid position of the tile the right-drag gesture is currently over. */
  private _rightDragLastTile: GridPos | null = null;

  /**
   * True when the right-drag gesture already handled removal, so the
   * subsequent contextmenu event (if it fires) should be suppressed.
   */
  private _suppressNextContextMenu = false;

  // ── Mouse position ─────────────────────────────────────────────────────────

  /** Most-recent mouse position over the canvas in canvas-pixel coordinates. */
  mouseCanvasPos: { x: number; y: number } | null = null;

  // ── Keyboard modifiers ─────────────────────────────────────────────────────

  /** Whether the Ctrl key is currently held. */
  ctrlHeld = false;

  /** Whether the Shift key is currently held (used for adjusted ice/snow display). */
  shiftHeld = false;

  // ── Rotation memory ────────────────────────────────────────────────────────

  /** Last-used placement rotation per pipe shape, so the same orientation is reused next time. */
  lastPlacedRotations = new Map<PipeShape, Rotation>();

  // ── Hover preview rotation ─────────────────────────────────────────────────

  /**
   * When no inventory item is selected, the number of accumulated 90°-CW
   * rotation steps being previewed on the hovered tile (0 = no preview
   * active).
   */
  hoverRotationDelta = 0;

  // ── Bound handlers (stored for removeEventListener in destroy()) ────────────

  private readonly _onCanvasMouseDown  = (e: MouseEvent)   => this._handleCanvasMouseDown(e);
  private readonly _onCanvasClick      = (e: MouseEvent)   => this._handleCanvasClick(e);
  private readonly _onCanvasMouseMove  = (e: MouseEvent)   => this._handleCanvasMouseMove(e);
  private readonly _onCanvasMouseLeave = ()                => this._onMouseLeave();
  private readonly _onWindowMouseUp    = (e: MouseEvent)   => this._handleCanvasMouseUp(e);
  private readonly _onWindowContextMenu= (e: MouseEvent)   => this._handleCanvasRightClick(e);
  private readonly _onCanvasKeyDown    = (e: KeyboardEvent)=> this._handleKey(e);
  private readonly _onCanvasWheel      = (e: WheelEvent)   => this._handleCanvasWheel(e);
  private readonly _onDocKeyDown       = (e: KeyboardEvent)=> this._handleDocKeyDown(e);
  private readonly _onDocKeyUp         = (e: KeyboardEvent)=> this._handleDocKeyUp(e);

  // ── Touch event handlers ─────────────────────────────────────────────────
  private readonly _onCanvasTouchStart = (e: TouchEvent) => this._handleCanvasTouchStart(e);
  private readonly _onCanvasTouchMove  = (e: TouchEvent) => this._handleCanvasTouchMove(e);
  private readonly _onCanvasTouchEnd   = (e: TouchEvent) => this._handleCanvasTouchEnd(e);

  // ── Touch state ──────────────────────────────────────────────────────────

  /** Client-x position where the current touch started (for tap/swipe detection). */
  private _touchStartX = 0;
  /** Client-y position where the current touch started (for tap/swipe detection). */
  private _touchStartY = 0;
  /** Timestamp (ms) when the current touch started (for tap/long-press detection). */
  private _touchStartTime = 0;
  /** Whether the touch has moved beyond the tap threshold. */
  private _touchMoved = false;
  /** Timer ID for the long-press reclaim gesture. */
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the long-press action was already triggered for the current touch. */
  private _longPressTriggered = false;
  /** Whether a horizontal swipe rotation was already fired for the current touch. */
  private _swipeRotated = false;
  /** Grid position recorded at the start of a touch drag-paint gesture. */
  private _touchDragLastTile: GridPos | null = null;

  constructor(canvas: HTMLCanvasElement, cb: InputCallbacks) {
    this._canvas = canvas;
    this._cb = cb;

    canvas.addEventListener('mousedown',   this._onCanvasMouseDown);
    canvas.addEventListener('click',       this._onCanvasClick);
    canvas.addEventListener('mousemove',   this._onCanvasMouseMove);
    canvas.addEventListener('mouseleave',  this._onCanvasMouseLeave);
    // Capture mouseup and contextmenu on window so a release (or the contextmenu
    // event that follows) outside the canvas still ends the drag and suppresses
    // the browser context menu.  Game is a singleton for the lifetime of the page
    // so these listeners are never removed (same pattern as the document listeners).
    window.addEventListener('mouseup',     this._onWindowMouseUp);
    window.addEventListener('contextmenu', this._onWindowContextMenu);
    canvas.addEventListener('keydown',     this._onCanvasKeyDown);
    canvas.addEventListener('wheel',       this._onCanvasWheel, { passive: false });
    document.addEventListener('keydown',   this._onDocKeyDown);
    document.addEventListener('keyup',     this._onDocKeyUp);

    // Touch event listeners (passive:false so preventDefault() works on touchmove).
    canvas.addEventListener('touchstart', this._onCanvasTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this._onCanvasTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this._onCanvasTouchEnd,   { passive: false });
  }

  /** Remove all event listeners registered by this handler. */
  destroy(): void {
    this._canvas.removeEventListener('mousedown',   this._onCanvasMouseDown);
    this._canvas.removeEventListener('click',       this._onCanvasClick);
    this._canvas.removeEventListener('mousemove',   this._onCanvasMouseMove);
    this._canvas.removeEventListener('mouseleave',  this._onCanvasMouseLeave);
    window.removeEventListener('mouseup',           this._onWindowMouseUp);
    window.removeEventListener('contextmenu',       this._onWindowContextMenu);
    this._canvas.removeEventListener('keydown',     this._onCanvasKeyDown);
    this._canvas.removeEventListener('wheel',       this._onCanvasWheel);
    document.removeEventListener('keydown',         this._onDocKeyDown);
    document.removeEventListener('keyup',           this._onDocKeyUp);
    this._canvas.removeEventListener('touchstart',  this._onCanvasTouchStart);
    this._canvas.removeEventListener('touchmove',   this._onCanvasTouchMove);
    this._canvas.removeEventListener('touchend',    this._onCanvasTouchEnd);
    this._clearLongPressTimer();
  }

  // ── Inventory handlers (called by renderInventoryBar wiring in Game) ────────

  /**
   * Handle a left-click on an inventory item.
   * Selects the shape (or deselects it if already selected), updates the
   * pending rotation from the last-used rotation for that shape, and
   * re-renders the inventory bar.
   */
  handleInventoryClick(shape: PipeShape, count: number): void {
    if (this._cb.getGameState() !== GameState.Playing) return;
    if (count < 0) {
      // Flash a red sparkle to signal the item is locked/not selectable.
      this._cb.flashInventoryItemError(shape);
      this._canvas.focus();
      return;
    }
    if (count === 0) return;
    if (this._cb.getSelectedShape() === shape) {
      // Clicking the already-selected item deselects it.
      this._cb.setSelectedShape(null);
      this._cb.renderInventoryBar();
      sfxManager.play(SfxId.InventoryUnselect);
      this._canvas.focus();
      return;
    }
    this._cb.setSelectedShape(shape);
    this._cb.setPendingRotation(this.lastPlacedRotations.get(shape) ?? 0);
    this._cb.renderInventoryBar();
    sfxManager.play(SfxId.InventorySelect);
    // Return focus to the canvas so Q/W rotation keys work immediately after
    // selecting an inventory piece without requiring a click on the board.
    this._canvas.focus();
  }

  /** Handle a right-click on any inventory item: deselect the current shape. */
  handleInventoryRightClick(): void {
    if (this._cb.getGameState() !== GameState.Playing) return;
    if (this._cb.getSelectedShape() !== null) {
      this._cb.setSelectedShape(null);
      this._cb.renderInventoryBar();
      sfxManager.play(SfxId.InventoryUnselect);
      this._canvas.focus();
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Compute the grid position of a mouse event using the current canvas
   * bounding rectangle and tile size.
   */
  private _getGridPosFromEvent(e: MouseEvent): GridPos {
    const rect = this._canvas.getBoundingClientRect();
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

  /** Called when the mouse leaves the canvas element. */
  private _onMouseLeave(): void {
    this._cancelDrag();
    this._cancelRightDrag();
    this._cb.hideTooltip();
    this.hoverRotationDelta = 0;
    this.mouseCanvasPos = null;
  }

  /** Rotate `pendingRotation` 90° clockwise (for wheel/keyboard placement rotation). */
  private _rotatePendingCW(): void {
    this._cb.setPendingRotation(((this._cb.getPendingRotation() + 90) % 360) as Rotation);
    sfxManager.play(SfxId.PendingCW);
  }

  /** Rotate `pendingRotation` 90° counter-clockwise (for wheel/keyboard placement rotation). */
  private _rotatePendingCCW(): void {
    this._cb.setPendingRotation(((this._cb.getPendingRotation() - 90 + 360) % 360) as Rotation);
    sfxManager.play(SfxId.PendingCCW);
  }

  /**
   * Returns true if the tile under the mouse cursor is eligible for
   * hover-rotation preview (non-fixed, non-empty, non-spin pipe).
   * Also bumps {@link hoverRotationDelta} by `steps` (±1) when a valid tile
   * is found.
   */
  private _tryAdjustHoverRotation(steps: 1 | -1): boolean {
    const board = this._cb.getBoard();
    if (!this.mouseCanvasPos || !board) return false;
    const hPos = this._getHoverGridPos()!;
    const hTile = board.getTile(hPos);
    if (!hTile || hTile.isFixed || isEmptyFloor(hTile.shape) || SPIN_PIPE_SHAPES.has(hTile.shape)) {
      return false;
    }
    this.hoverRotationDelta = ((this.hoverRotationDelta + steps + 4) % 4);
    return true;
  }

  /**
   * If the mouse is currently hovering a spinner tile, rotate it by `steps`
   * clockwise quarter-turns and update the UI.  Returns true on success.
   */
  private _tryRotateHoverSpinner(steps: number): boolean {
    const board = this._cb.getBoard();
    if (!this.mouseCanvasPos || !board) return false;
    const hPos = this._getHoverGridPos()!;
    const hTile = board.getTile(hPos);
    if (!hTile || !SPIN_PIPE_SHAPES.has(hTile.shape)) return false;
    const filledBefore = board.getFilledPositions();
    const oldRotation = hTile.rotation;
    const result = board.rotateTileBy(hPos, steps);
    if (result.success) {
      this._cb.afterTileRotated(filledBefore, result, { row: hPos.row, col: hPos.col, oldRotation });
      this._cb.refreshUI();
      this._cb.checkWinLose();
      return true;
    } else if (result.error) {
      this._cb.handleBoardError(result);
    }
    return false;
  }

  /**
   * Move the keyboard focus position by one step along the given axis.
   * Clamps to the board boundaries and calls `e.preventDefault()` to
   * suppress scroll.
   */
  private _moveFocusPos(e: KeyboardEvent, axis: 'row' | 'col', delta: -1 | 1): void {
    const board = this._cb.getBoard();
    if (!board) return;
    e.preventDefault();
    const pos = this._cb.getFocusPos();
    const max = axis === 'row' ? board.rows : board.cols;
    const next = pos[axis] + delta;
    if (next >= 0 && next < max) {
      this._cb.setFocusPos({ ...pos, [axis]: next });
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  private _handleCanvasMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      if (this._cb.getScreen() !== GameScreen.Play) return;
      if (this._cb.getGameState() !== GameState.Playing) return;
      if (!this._cb.getBoard()) return;
      const { row, col } = this._getGridPosFromEvent(e);
      this._isRightDragging = true;
      this._rightDragLastTile = { row, col };
      this._suppressNextContextMenu = false;
      return;
    }
    if (e.button !== 0) return;
    if (this._cb.getScreen() !== GameScreen.Play) return;
    if (this._cb.getGameState() !== GameState.Playing) return;
    if (this._cb.getSelectedShape() === null) return; // No shape selected; click/rotation handled separately

    const { row, col } = this._getGridPosFromEvent(e);
    this._isDragging = true;
    this._dragLastTile = { row, col };
    this._suppressNextClick = false;
  }

  private _handleCanvasMouseUp(e: MouseEvent): void {
    if (e.button === 2) {
      if (!this._isRightDragging) return;
      // Remove the tile at the final (current) position and suppress the contextmenu event.
      const board = this._cb.getBoard();
      if (this._rightDragLastTile && board &&
          this._cb.getGameState() === GameState.Playing &&
          this._cb.getScreen() === GameScreen.Play) {
        const tile = board.getTile(this._rightDragLastTile);
        if (!tile || isEmptyFloor(tile.shape) || SPIN_PIPE_SHAPES.has(tile.shape)) {
          // Right-clicking an empty tile or a spinner: clear any pending inventory selection.
          if (this._cb.getSelectedShape() !== null) {
            this._cb.setSelectedShape(null);
            this._cb.renderInventoryBar();
            sfxManager.play(SfxId.InventoryUnselect);
          }
        } else {
          this._cb.reclaimTileAt(this._rightDragLastTile);
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
    const board = this._cb.getBoard();
    if (this._dragLastTile && this._cb.getSelectedShape() !== null &&
        board && this._cb.getGameState() === GameState.Playing &&
        this._cb.getScreen() === GameScreen.Play) {
      const pos = this._dragLastTile;
      const tile = board.getTile(pos);
      // Spinner tiles cannot be replaced; skip placement so the click event can rotate them.
      if (tile && !SPIN_PIPE_SHAPES.has(tile.shape)) {
        const filledBefore = board.getFilledPositions();
        if (this._cb.tryPlaceOrReplace(pos, tile, filledBefore)) {
          this._suppressNextClick = true;
        }
      }
    }

    this._cancelDrag();
  }

  private _handleCanvasClick(e: MouseEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play) return;
    if (this._cb.getGameState() !== GameState.Playing) return;
    const board = this._cb.getBoard();
    if (!board) return;

    // The drag gesture already handled placement; swallow the click event.
    if (this._suppressNextClick) {
      this._suppressNextClick = false;
      return;
    }

    const pos = this._getGridPosFromEvent(e);
    const tile = board.getTile(pos);
    if (!tile) return;

    const filledBefore = board.getFilledPositions();

    if (SPIN_PIPE_SHAPES.has(tile.shape)) {
      // Spinnable pipes are always rotated on click (cannot be replaced or removed).
      // Shift+click rotates CCW (3 steps); plain click rotates CW (1 step).
      const steps = e.shiftKey ? 3 : 1;
      const oldRotation = tile.rotation;
      const spinResult = board.rotateTileBy(pos, steps);
      if (spinResult.success) {
        // Sync the pending placement rotation so the ghost image stays aligned.
        if (this._cb.getSelectedShape() === tile.shape) {
          this._cb.setPendingRotation(tile.rotation as Rotation);
        }
        this._cb.afterTileRotated(filledBefore, spinResult, { row: pos.row, col: pos.col, oldRotation });
        this._cb.refreshUI();
        this._cb.checkWinLose();
      } else if (spinResult.error) {
        this._cb.handleBoardError(spinResult);
      }
    } else if (this._cb.getSelectedShape() !== null &&
               (isEmptyFloor(tile.shape) ||
                tile.shape !== this._cb.getSelectedShape() ||
                tile.rotation !== this._cb.getPendingRotation())) {
      // Place on an empty cell or replace a tile with a different shape/rotation.
      // When tile already matches exactly (same shape+rotation), fall through to rotate.
      this._cb.tryPlaceOrReplace(pos, tile, filledBefore);
    } else if (!isEmptyFloor(tile.shape)) {
      // Rotate existing pipe (no inventory item selected, or same shape+rotation as selected).
      // If the user has previewed multiple rotations via Q/W/wheel, apply all of them
      // as a single game turn; otherwise fall back to a standard single 90° rotation.
      const delta = this.hoverRotationDelta;
      this.hoverRotationDelta = 0;
      const oldRotation = tile.rotation;
      const rotResult = delta > 0
        ? board.rotateTileBy(pos, delta)
        : e.shiftKey ? board.rotateTileBy(pos, 3) : board.rotateTile(pos);
      if (rotResult.success) {
        // Sync the pending placement rotation so the ghost image stays aligned.
        if (this._cb.getSelectedShape() === tile.shape) {
          this._cb.setPendingRotation(tile.rotation as Rotation);
        }
        this._cb.afterTileRotated(filledBefore, rotResult, { row: pos.row, col: pos.col, oldRotation });
        this._cb.refreshUI();
        this._cb.checkWinLose();
      } else if (rotResult.error) {
        this._cb.handleBoardError(rotResult);
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
    if (this._cb.getScreen() !== GameScreen.Play) return;
    if (this._cb.getGameState() !== GameState.Playing) return;
    const board = this._cb.getBoard();
    if (!board) return;

    const pos = this._getGridPosFromEvent(e);

    // Right-clicking outside the grid (including inventory bar and other UI): deselect.
    if (pos.row < 0 || pos.row >= board.rows || pos.col < 0 || pos.col >= board.cols) {
      if (this._cb.getSelectedShape() !== null) {
        this._cb.setSelectedShape(null);
        this._cb.renderInventoryBar();
        sfxManager.play(SfxId.InventoryUnselect);
      }
      return;
    }

    const tile = board.getTile(pos);

    // Right-clicking an empty tile or a spinner: clear any pending inventory selection.
    if (tile && (isEmptyFloor(tile.shape) || SPIN_PIPE_SHAPES.has(tile.shape))) {
      if (this._cb.getSelectedShape() !== null) {
        this._cb.setSelectedShape(null);
        this._cb.renderInventoryBar();
        sfxManager.play(SfxId.InventoryUnselect);
      }
      return;
    }

    this._cb.reclaimTileAt(pos);
  }

  private _handleCanvasMouseMove(e: MouseEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    const prevPos = this._getHoverGridPos();
    this.mouseCanvasPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const newPos = this._getHoverGridPos()!;
    if (newPos.row !== prevPos?.row || newPos.col !== prevPos?.col) {
      this.hoverRotationDelta = 0;
    }
    if (this.ctrlHeld && this._cb.getGameState() === GameState.Playing) {
      this._cb.showTooltip(e.clientX, e.clientY);
    }

    const board = this._cb.getBoard();
    // Drag-paint: place at the OLD tile each time the cursor enters a new grid cell.
    if (this._isDragging && this._cb.getSelectedShape() !== null &&
        board && this._cb.getScreen() === GameScreen.Play &&
        this._cb.getGameState() === GameState.Playing) {
      const { row, col } = newPos;
      const last = this._dragLastTile;
      if (last && (row !== last.row || col !== last.col)) {
        // Moved to a new tile: place at the tile we just left.
        const oldTile = board.getTile(last);
        if (oldTile) {
          const filledBefore = board.getFilledPositions();
          this._cb.tryPlaceOrReplace(last, oldTile, filledBefore);
        }
        this._dragLastTile = { row, col };
      }
    }

    // Drag-erase: reclaim the OLD tile each time the cursor enters a new grid cell.
    if (this._isRightDragging && board && this._cb.getScreen() === GameScreen.Play &&
        this._cb.getGameState() === GameState.Playing) {
      const { row, col } = newPos;
      const last = this._rightDragLastTile;
      if (last && (row !== last.row || col !== last.col)) {
        // Moved to a new tile: reclaim the tile we just left.
        this._cb.reclaimTileAt(last);
        this._rightDragLastTile = { row, col };
      }
    }
  }

  private _handleCanvasWheel(e: WheelEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play) return;
    if (this._cb.getGameState() !== GameState.Playing) return;
    const board = this._cb.getBoard();
    if (this.mouseCanvasPos && board) {
      const hPos = this._getHoverGridPos()!;
      const hTile = board.getTile(hPos);
      if (hTile && SPIN_PIPE_SHAPES.has(hTile.shape)) {
        // Spin pipes always take priority: scroll down → CW (1 step), scroll up → CCW (3 steps = -1 mod 4)
        const steps = e.deltaY > 0 ? 1 : 3;
        const filledBefore = board.getFilledPositions();
        const oldRotation = hTile.rotation;
        const wheelResult = board.rotateTileBy(hPos, steps);
        if (wheelResult.success) {
          e.preventDefault();
          this._cb.afterTileRotated(filledBefore, wheelResult, { row: hPos.row, col: hPos.col, oldRotation });
          this._cb.refreshUI();
          this._cb.checkWinLose();
        } else if (wheelResult.error) {
          this._cb.handleBoardError(wheelResult);
        }
        return;
      }
    }
    if (this._cb.getSelectedShape() !== null) {
      e.preventDefault();
      // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise
      if (e.deltaY > 0) {
        this._rotatePendingCW();
      } else {
        this._rotatePendingCCW();
      }
    } else if (this.mouseCanvasPos && board) {
      // No inventory selected and not a spin pipe: preview rotation on hovered tile.
      // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise.
      const changed = this._tryAdjustHoverRotation(e.deltaY > 0 ? 1 : -1);
      if (changed) e.preventDefault();
    }
  }

  private _handleDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this._cb.handleEscapeKey();
      return;
    }
    if (e.key === 'Control' && !this.ctrlHeld) {
      this.ctrlHeld = true;
      if (this._cb.getGameState() === GameState.Playing && this.mouseCanvasPos) {
        const rect = this._canvas.getBoundingClientRect();
        this._cb.showTooltip(
          this.mouseCanvasPos.x + rect.left,
          this.mouseCanvasPos.y + rect.top,
        );
      }
    }
    if (e.key === 'Shift' && !this.shiftHeld) {
      this.shiftHeld = true;
      if (this._cb.getScreen() === GameScreen.Play && this._cb.getGameState() === GameState.Playing) {
        this._cb.selectNextAvailableInventory();
      }
    }
    if (e.ctrlKey && e.key === 'z' && this._cb.getScreen() === GameScreen.Play) {
      e.preventDefault();
      if (this._cb.getGameState() === GameState.Playing) this._cb.performUndo();
    }
    if (e.ctrlKey && e.key === 'y' && this._cb.getScreen() === GameScreen.Play) {
      e.preventDefault();
      if (this._cb.getGameState() === GameState.Playing) this._cb.performRedo();
    }
    if (e.key === 'Backspace' && this._cb.getScreen() === GameScreen.Play) {
      e.preventDefault();
      if (this._cb.getGameState() === GameState.Playing ||
          this._cb.getGameState() === GameState.GameOver ||
          this._cb.getGameState() === GameState.Won) {
        this._cb.performUndo();
      }
    }
  }

  private _handleDocKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Control') {
      this.ctrlHeld = false;
      this._cb.hideTooltip();
    }
    if (e.key === 'Shift') {
      this.shiftHeld = false;
    }
  }

  private _handleKey(e: KeyboardEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play) return;
    const board = this._cb.getBoard();
    if (!board) return;
    const focusPos = this._cb.getFocusPos();

    switch (e.key) {
      case 'ArrowUp':    this._moveFocusPos(e, 'row', -1); break;
      case 'ArrowDown':  this._moveFocusPos(e, 'row',  1); break;
      case 'ArrowLeft':  this._moveFocusPos(e, 'col', -1); break;
      case 'ArrowRight': this._moveFocusPos(e, 'col',  1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this._cb.getGameState() !== GameState.Playing) break;
        if (this._cb.getSelectedShape() !== null) {
          const tile = board.getTile(focusPos);
          const filledBefore = board.getFilledPositions();
          if (tile) this._cb.tryPlaceOrReplace(focusPos, tile, filledBefore);
        } else {
          const tile = board.getTile(focusPos);
          const filledBefore = board.getFilledPositions();
          // Capture before calling rotateTile – the rotation mutates tile.rotation in-place.
          const oldRotation = tile?.rotation;
          const rotResult = board.rotateTile(focusPos);
          if (rotResult.success) {
            this._cb.afterTileRotated(filledBefore, rotResult, oldRotation !== undefined
              ? { row: focusPos.row, col: focusPos.col, oldRotation }
              : undefined);
            this._cb.refreshUI();
            this._cb.checkWinLose();
          } else if (rotResult.error) {
            this._cb.handleBoardError(rotResult);
          }
        }
        break;
      case 'q':
      case 'Q':
        e.preventDefault();
        if (this._cb.getGameState() !== GameState.Playing) break;
        if (this._cb.getSelectedShape() !== null) {
          this._rotatePendingCCW();
        } else if (!this._tryRotateHoverSpinner(3)) {
          // 3 CW steps = 1 CCW step
          this._tryAdjustHoverRotation(-1);
        }
        break;
      case 'w':
      case 'W':
        e.preventDefault();
        if (this._cb.getGameState() !== GameState.Playing) break;
        if (this._cb.getSelectedShape() !== null) {
          this._rotatePendingCW();
        } else if (!this._tryRotateHoverSpinner(1)) {
          this._tryAdjustHoverRotation(1);
        }
        break;
      case 'Escape':
        this._cb.handleEscapeKey();
        break;
      case 'r':
      case 'R':
        if (this._cb.getGameState() === GameState.Playing) this._cb.retryLevel();
        break;
    }
  }

  /**
   * Attach touch event handlers to an inventory item element.
   * Called by Game's renderInventoryBar wiring for each `.inv-item`.
   *
   * Gestures:
   *   - Tap: select/deselect the shape (mirrors handleInventoryClick).
   *   - Drag to canvas: show a ghost element and place on touchend.
   */
  attachInventoryItemTouchHandlers(
    el: HTMLElement,
    shape: PipeShape,
    effectiveCount: number,
  ): void {
    let ghostEl: HTMLElement | null = null;
    let dragActive = false;

    const onTouchStart = (e: TouchEvent) => {
      if (this._cb.getGameState() !== GameState.Playing) return;
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];

      // Create a floating ghost that follows the finger.
      ghostEl = document.createElement('div');
      ghostEl.style.cssText =
        'position:fixed;pointer-events:none;z-index:200;' +
        'background:#16213e;border:2px solid #4a90d9;border-radius:6px;' +
        'padding:6px 8px;opacity:0.85;font-size:1rem;color:#eee;white-space:nowrap;' +
        `left:${touch.clientX + 12}px;top:${touch.clientY + 12}px;`;
      ghostEl.innerHTML = el.innerHTML;
      document.body.appendChild(ghostEl);
      dragActive = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragActive || !ghostEl || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      ghostEl.style.left = `${touch.clientX + 12}px`;
      ghostEl.style.top  = `${touch.clientY + 12}px`;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!dragActive) return;
      e.preventDefault();
      dragActive = false;

      // Remove the ghost element.
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }

      // Determine if the finger was released over the game canvas.
      const changedTouch = e.changedTouches[0];
      if (!changedTouch) {
        // No valid endpoint — treat as a tap to select.
        this.handleInventoryClick(shape, effectiveCount);
        return;
      }

      const canvasRect = this._canvas.getBoundingClientRect();
      const cx = changedTouch.clientX;
      const cy = changedTouch.clientY;

      if (
        cx >= canvasRect.left && cx <= canvasRect.right &&
        cy >= canvasRect.top  && cy <= canvasRect.bottom
      ) {
        // Dropped onto the canvas — select this shape and place it at the cell.
        const board = this._cb.getBoard();
        if (board && this._cb.getGameState() === GameState.Playing) {
          // Select the shape with its last-used rotation.
          this._cb.setSelectedShape(shape);
          this._cb.setPendingRotation(this.lastPlacedRotations.get(shape) ?? 0);
          this._cb.renderInventoryBar();
          // Compute grid position from the drop coordinates.
          const col = Math.floor((cx - canvasRect.left) * board.cols / canvasRect.width);
          const row = Math.floor((cy - canvasRect.top)  * board.rows / canvasRect.height);
          const pos = { row, col };
          const tile = board.getTile(pos);
          if (tile) {
            const filledBefore = board.getFilledPositions();
            if (this._cb.tryPlaceOrReplace(pos, tile, filledBefore)) {
              // Placement was handled; afterTilePlaced called by tryPlaceOrReplace chain.
              sfxManager.play(SfxId.PipePlacement);
            }
          }
        }
      } else {
        // Released outside the canvas — treat as a tap to select/deselect.
        this.handleInventoryClick(shape, effectiveCount);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: false });
  }

  // ── Touch helpers ─────────────────────────────────────────────────────────

  /** Cancel any pending long-press timer. */
  private _clearLongPressTimer(): void {
    if (this._longPressTimer !== null) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
  }

  /**
   * Compute a grid position from client coordinates, using the canvas bounding
   * rect scaled to board dimensions (works even when CSS scales the canvas).
   */
  private _getGridPosFromClientXY(clientX: number, clientY: number): GridPos {
    const rect = this._canvas.getBoundingClientRect();
    const board = this._cb.getBoard();
    if (!board) {
      return {
        row: Math.floor((clientY - rect.top)  / TILE_SIZE),
        col: Math.floor((clientX - rect.left) / TILE_SIZE),
      };
    }
    return {
      row: Math.floor((clientY - rect.top)  * board.rows / rect.height),
      col: Math.floor((clientX - rect.left) * board.cols / rect.width),
    };
  }

  // ── Touch event handlers ─────────────────────────────────────────────────

  private _handleCanvasTouchStart(e: TouchEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play) return;
    if (this._cb.getGameState() !== GameState.Playing) return;

    // Two-finger tap → deselect the current shape.
    if (e.touches.length === 2) {
      e.preventDefault();
      if (this._cb.getSelectedShape() !== null) {
        this._cb.setSelectedShape(null);
        this._cb.renderInventoryBar();
        sfxManager.play(SfxId.InventoryUnselect);
      }
      return;
    }

    if (e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this._touchStartTime = Date.now();
    this._touchMoved = false;
    this._longPressTriggered = false;
    this._swipeRotated = false;

    const pos = this._getGridPosFromClientXY(touch.clientX, touch.clientY);
    this._touchDragLastTile = pos;

    // Update mouseCanvasPos so hover-dependent render logic works during touch.
    const rect = this._canvas.getBoundingClientRect();
    this.mouseCanvasPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };

    // Start long-press timer for reclaim gesture (500 ms).
    this._clearLongPressTimer();
    this._longPressTimer = setTimeout(() => {
      this._longPressTimer = null;
      if (!this._touchMoved && this._cb.getScreen() === GameScreen.Play &&
          this._cb.getGameState() === GameState.Playing) {
        const board = this._cb.getBoard();
        if (!board) return;
        const lp = this._getGridPosFromClientXY(this._touchStartX, this._touchStartY);
        const tile = board.getTile(lp);
        if (tile && !isEmptyFloor(tile.shape) && !SPIN_PIPE_SHAPES.has(tile.shape)) {
          this._longPressTriggered = true;
          // Optional haptic feedback.
          if (typeof navigator.vibrate === 'function') navigator.vibrate(50);
          this._cb.reclaimTileAt(lp);
        } else if (this._cb.getSelectedShape() !== null) {
          // Long-press on empty/spinner with a shape selected → deselect.
          this._longPressTriggered = true;
          this._cb.setSelectedShape(null);
          this._cb.renderInventoryBar();
          sfxManager.play(SfxId.InventoryUnselect);
        }
      }
    }, 500);
  }

  private _handleCanvasTouchMove(e: TouchEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 8) {
      this._touchMoved = true;
      this._clearLongPressTimer();
    }

    // Update the canvas-space mouse position for hover rendering.
    const rect = this._canvas.getBoundingClientRect();
    this.mouseCanvasPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };

    const board = this._cb.getBoard();
    if (!board || this._cb.getGameState() !== GameState.Playing) return;

    // ── Horizontal-swipe rotation (only before placing / drag-painting starts) ──
    // Swipe: horizontal movement > 40 px AND vertical movement < 30 px.
    if (!this._swipeRotated && !this._longPressTriggered &&
        Math.abs(dx) > 40 && Math.abs(dy) < 30) {
      this._swipeRotated = true;
      this._clearLongPressTimer();
      if (this._cb.getSelectedShape() !== null) {
        // Rotate the pending placement piece.
        if (dx > 0) {
          this._rotatePendingCW();
        } else {
          this._rotatePendingCCW();
        }
      } else {
        // Rotate a placed non-fixed tile at the touch-start position.
        const startPos = this._getGridPosFromClientXY(this._touchStartX, this._touchStartY);
        const startTile = board.getTile(startPos);
        if (startTile && !isEmptyFloor(startTile.shape) &&
            !startTile.isFixed && !SPIN_PIPE_SHAPES.has(startTile.shape)) {
          const filledBefore = board.getFilledPositions();
          const oldRotation = startTile.rotation;
          const rotResult = dx > 0
            ? board.rotateTileBy(startPos, 1)
            : board.rotateTileBy(startPos, 3);
          if (rotResult.success) {
            this._cb.afterTileRotated(filledBefore, rotResult, {
              row: startPos.row, col: startPos.col, oldRotation,
            });
            this._cb.refreshUI();
            this._cb.checkWinLose();
          } else if (rotResult.error) {
            this._cb.handleBoardError(rotResult);
          }
        }
      }
      return;
    }

    // ── Drag-paint (only when a shape is selected and finger has clearly moved) ──
    if (this._touchMoved && this._cb.getSelectedShape() !== null && !this._swipeRotated) {
      const newPos = this._getGridPosFromClientXY(touch.clientX, touch.clientY);
      const last = this._touchDragLastTile;
      if (last && (newPos.row !== last.row || newPos.col !== last.col)) {
        // Paint the cell we just left.
        const oldTile = board.getTile(last);
        if (oldTile) {
          const filledBefore = board.getFilledPositions();
          this._cb.tryPlaceOrReplace(last, oldTile, filledBefore);
        }
        this._touchDragLastTile = newPos;
      }
    }
  }

  private _handleCanvasTouchEnd(e: TouchEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play) return;
    e.preventDefault();
    this._clearLongPressTimer();
    this.mouseCanvasPos = null;

    if (this._longPressTriggered) {
      this._touchDragLastTile = null;
      return;
    }

    if (this._swipeRotated) {
      this._touchDragLastTile = null;
      return;
    }

    const board = this._cb.getBoard();
    if (!board || this._cb.getGameState() !== GameState.Playing) {
      this._touchDragLastTile = null;
      return;
    }

    const changedTouch = e.changedTouches[0];
    if (!changedTouch) {
      this._touchDragLastTile = null;
      return;
    }

    if (this._touchMoved) {
      // End of a drag-paint: place on the final tile.
      const last = this._touchDragLastTile;
      if (last && this._cb.getSelectedShape() !== null) {
        const tile = board.getTile(last);
        if (tile && !SPIN_PIPE_SHAPES.has(tile.shape)) {
          const filledBefore = board.getFilledPositions();
          this._cb.tryPlaceOrReplace(last, tile, filledBefore);
        }
      }
    } else {
      // Short tap: handle as a click.
      const pos = this._getGridPosFromClientXY(changedTouch.clientX, changedTouch.clientY);
      const tile = board.getTile(pos);
      if (!tile) {
        this._touchDragLastTile = null;
        return;
      }
      const filledBefore = board.getFilledPositions();

      if (SPIN_PIPE_SHAPES.has(tile.shape)) {
        // Tap on a spin pipe: rotate CW by one step.
        const oldRotation = tile.rotation;
        const spinResult = board.rotateTileBy(pos, 1);
        if (spinResult.success) {
          if (this._cb.getSelectedShape() === tile.shape) {
            this._cb.setPendingRotation(tile.rotation as Rotation);
          }
          this._cb.afterTileRotated(filledBefore, spinResult, { row: pos.row, col: pos.col, oldRotation });
          this._cb.refreshUI();
          this._cb.checkWinLose();
        } else if (spinResult.error) {
          this._cb.handleBoardError(spinResult);
        }
      } else if (this._cb.getSelectedShape() !== null &&
                 (isEmptyFloor(tile.shape) ||
                  tile.shape !== this._cb.getSelectedShape() ||
                  tile.rotation !== this._cb.getPendingRotation())) {
        // Place or replace.
        this._cb.tryPlaceOrReplace(pos, tile, filledBefore);
      } else if (!isEmptyFloor(tile.shape)) {
        // Tap on a placed non-selected tile: rotate CW.
        const oldRotation = tile.rotation;
        const rotResult = board.rotateTile(pos);
        if (rotResult.success) {
          if (this._cb.getSelectedShape() === tile.shape) {
            this._cb.setPendingRotation(tile.rotation as Rotation);
          }
          this._cb.afterTileRotated(filledBefore, rotResult, { row: pos.row, col: pos.col, oldRotation });
          this._cb.refreshUI();
          this._cb.checkWinLose();
        } else if (rotResult.error) {
          this._cb.handleBoardError(rotResult);
        }
      }
    }

    this._touchDragLastTile = null;
  }
}
