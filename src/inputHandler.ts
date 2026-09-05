import type { Board, MoveResult} from './board';
import type { AfterTilePlacedOptions } from './game';
import { PIPE_SHAPES, SPIN_PIPE_SHAPES, isEmptyFloor } from './board';
import type { Tile } from './tile';
import type { GridPos, PipeShape, Rotation } from './types';
import { GameScreen, GameState } from './types';
import { TILE_SIZE } from './renderer';
import { sfxManager, SfxId } from './audio/sfxManager';
import { RADIUS_MD, UI_BG, UI_BORDER } from './uiConstants';
import { commandKeyManager } from './commandKeyManager';

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
  afterTilePlaced(opts: AfterTilePlacedOptions): void;
  /**
   * Called after a successful tile rotation.  Handles animations and records
   * the move.  Does **not** call refreshUI/checkWinLose — the caller is
   * responsible for invoking those separately.
   */
  afterTileRotated(
    filledBefore: Set<string>,
    result: MoveResult,
    rotationInfo: { row: number; col: number; oldRotation: number },
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
  /** Show a Ctrl-hover tooltip for an inventory item with the given shape. */
  showInventoryItemTooltip(shape: PipeShape, clientX: number, clientY: number): void;

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
  /** Spawn a shake animation on the tile at pos. */
  shakeAt(pos: GridPos): void;
  /**
   * Returns true while a resume-replay is replaying saved moves.
   * The input handler ignores player gestures during this window.
   */
  isResuming(): boolean;
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

  // ── Inventory hover state ──────────────────────────────────────────────────

  /** Shape of the inventory item currently under the mouse cursor, or null. */
  private _hoveredInvShape: PipeShape | null = null;
  /** Client X position of the last mousemove over an inventory item. */
  private _hoveredInvClientX = 0;
  /** Client Y position of the last mousemove over an inventory item. */
  private _hoveredInvClientY = 0;

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

  // ── Inventory item touch-drag state ────────────────────────────────────────
  /** Floating ghost element following the finger during an inventory-item touch drag. */
  private _invDragGhostEl: HTMLElement | null = null;
  /** Whether an inventory-item touch drag is currently in progress. */
  private _invDragActive = false;

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
   * Called when the mouse moves over an inventory item element.
   * Tracks the hovered item and immediately shows a Ctrl-hover tooltip when
   * Ctrl is held and the game is in play state.
   */
  setInventoryHover(shape: PipeShape, clientX: number, clientY: number): void {
    this._hoveredInvShape = shape;
    this._hoveredInvClientX = clientX;
    this._hoveredInvClientY = clientY;
    if (this.ctrlHeld && this._cb.getGameState() === GameState.Playing) {
      this._cb.showInventoryItemTooltip(shape, clientX, clientY);
    }
  }

  /** Called when the mouse leaves an inventory item element. Hides any active tooltip. */
  clearInventoryHover(): void {
    this._hoveredInvShape = null;
    this._cb.hideTooltip();
  }

  /**
   * Handle a left-click on an inventory item.
   * Selects the shape (or deselects it if already selected), updates the
   * pending rotation from the last-used rotation for that shape, and
   * re-renders the inventory bar.
   */
  handleInventoryClick(shape: PipeShape, count: number): void {
    if (this._isInputLocked()) return;
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- mouseCanvasPos guard above ensures _getHoverGridPos returns non-null
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- mouseCanvasPos guard above ensures _getHoverGridPos returns non-null
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

  /** True when a hovered tile exists and can be keyboard-rotated as a non-spinner pipe. */
  private _isRotatableHoverPipeTile(tile: Tile | null | undefined): tile is Tile {
    return !!tile && !tile.isFixed && !isEmptyFloor(tile.shape) && !SPIN_PIPE_SHAPES.has(tile.shape);
  }

  /**
   * If the mouse is currently hovering a rotatable non-spinner pipe tile,
   * rotate it by `steps` clockwise quarter-turns and update the UI.
   * Returns true when a rotation attempt was made.
   */
  private _tryRotateHoverPipe(steps: number): boolean {
    const board = this._cb.getBoard();
    if (!this.mouseCanvasPos || !board) return false;
    const hPos = this._getHoverGridPos();
    if (!hPos) return false;
    const hTile = board.getTile(hPos);
    if (!this._isRotatableHoverPipeTile(hTile)) return false;
    const filledBefore = board.getFilledPositions();
    const oldRotation = hTile.rotation;
    const result = board.rotateTileBy(hPos, steps);
    if (result.success) {
      // Clear any wheel-built preview offset now that a real board rotation was committed.
      this.hoverRotationDelta = 0;
      this._cb.afterTileRotated(filledBefore, result, { row: hPos.row, col: hPos.col, oldRotation });
      this._cb.refreshUI();
      this._cb.checkWinLose();
    } else if (result.error) {
      this._cb.handleBoardError(result);
    }
    return true;
  }

  /** Clear the currently selected inventory shape and refresh the inventory UI. */
  private _clearSelectedShape(): boolean {
    if (this._cb.getSelectedShape() === null) return false;
    this._cb.setSelectedShape(null);
    this._cb.renderInventoryBar();
    sfxManager.play(SfxId.InventoryUnselect);
    return true;
  }

  /** True when selected inventory cannot be placed/replaced on this hovered tile. */
  private _isUnavailablePlacementTile(tile: Tile): boolean {
    return tile.isFixed || (
      !isEmptyFloor(tile.shape) &&
      !SPIN_PIPE_SHAPES.has(tile.shape) &&
      !PIPE_SHAPES.has(tile.shape)
    );
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  /** Returns true when player input should be blocked (resume replay in progress). */
  private _isInputLocked(): boolean {
    return this._cb.isResuming();
  }

  private _handleCanvasMouseDown(e: MouseEvent): void {
    if (this._isInputLocked()) return;
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
    if (this._isInputLocked()) { this._cancelDrag(); this._cancelRightDrag(); return; }
    if (e.button === 2) {
      this._handleRightMouseUp();
      return;
    }
    if (e.button !== 0) return;
    this._handleLeftMouseUp();
  }

  /** Right mouse-up: commit (reclaim or clear-selection) the tile at the final drag-erase position. */
  private _handleRightMouseUp(): void {
    if (!this._isRightDragging) return;
    // Remove the tile at the final (current) position and suppress the contextmenu event.
    const pos = this._rightDragLastTile;
    const board = this._cb.getBoard();
    if (pos && board && this._cb.getGameState() === GameState.Playing && this._cb.getScreen() === GameScreen.Play) {
      this._commitRightDragTile(pos, board);
    }
    this._suppressNextContextMenu = true;
    this._cancelRightDrag();
  }

  private _commitRightDragTile(pos: GridPos, board: Board): void {
    const tile = board.getTile(pos);
    const shouldDeselect = !!tile && (
      isEmptyFloor(tile.shape) ||
      SPIN_PIPE_SHAPES.has(tile.shape) ||
      (this._cb.getSelectedShape() !== null && this._isUnavailablePlacementTile(tile))
    );
    if (shouldDeselect) {
      // Right-clicking a tile that cannot accept the selected shape: clear the pending selection.
      this._clearSelectedShape();
    } else {
      this._cb.reclaimTileAt(pos);
    }
  }

  /**
   * Left mouse-up: if the drag moved to at least one new tile the final hovered tile is still
   * a "pending preview" – place it now and suppress the click event that follows.
   */
  private _handleLeftMouseUp(): void {
    if (!this._isDragging) return;
    const pos = this._dragLastTile;
    const board = this._cb.getBoard();
    if (pos && this._cb.getSelectedShape() !== null && board &&
        this._cb.getGameState() === GameState.Playing && this._cb.getScreen() === GameScreen.Play) {
      this._commitLeftDragTile(pos, board);
    }
    this._cancelDrag();
  }

  private _commitLeftDragTile(pos: GridPos, board: Board): void {
    const tile = board.getTile(pos);
    // Spinner tiles cannot be replaced; skip placement so the click event can rotate them.
    if (tile && !SPIN_PIPE_SHAPES.has(tile.shape)) {
      const filledBefore = board.getFilledPositions();
      if (this._cb.tryPlaceOrReplace(pos, tile, filledBefore)) {
        this._suppressNextClick = true;
      }
    }
  }

  private _handleCanvasClick(e: MouseEvent): void {
    const board = this._getActiveClickBoard();
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
      this._spinTileOnClick(pos, tile, board, filledBefore, e);
    } else if (this._shouldPlaceOrReplaceTile(tile)) {
      // Place on an empty cell or replace a tile with a different shape/rotation.
      // When tile already matches exactly (same shape+rotation), fall through to rotate.
      this._cb.tryPlaceOrReplace(pos, tile, filledBefore);
    } else if (!isEmptyFloor(tile.shape)) {
      // Rotate existing pipe (no inventory item selected, or same shape+rotation as selected).
      this._rotateTileOnClick(pos, tile, board, filledBefore, e);
    }
  }

  /** Guards common to canvas click handling; returns the active board, or null if the click should be ignored. */
  private _getActiveClickBoard(): Board | null {
    if (this._isInputLocked()) return null;
    if (this._cb.getScreen() !== GameScreen.Play) return null;
    if (this._cb.getGameState() !== GameState.Playing) return null;
    return this._cb.getBoard();
  }

  /** Shift+click rotates CCW (3 steps); plain click rotates CW (1 step). */
  private _spinTileOnClick(pos: GridPos, tile: Tile, board: Board, filledBefore: Set<string>, e: MouseEvent): void {
    const steps = e.shiftKey ? 3 : 1;
    const oldRotation = tile.rotation;
    const spinResult = board.rotateTileBy(pos, steps);
    if (spinResult.success) {
      // Sync the pending placement rotation so the ghost image stays aligned.
      if (this._cb.getSelectedShape() === tile.shape) {
        this._cb.setPendingRotation(tile.rotation);
      }
      this._cb.afterTileRotated(filledBefore, spinResult, { row: pos.row, col: pos.col, oldRotation });
      this._cb.refreshUI();
      this._cb.checkWinLose();
    } else if (spinResult.error) {
      this._cb.handleBoardError(spinResult);
    }
  }

  /**
   * If the user has previewed multiple rotations via Q/W/wheel, apply all of them as a
   * single game turn; otherwise fall back to a standard single 90° rotation (Shift+click
   * rotates CCW by 3 steps, matching the spin-tile shortcut above).
   */
  private _rotateTileOnClick(pos: GridPos, tile: Tile, board: Board, filledBefore: Set<string>, e: MouseEvent): void {
    const delta = this.hoverRotationDelta;
    this.hoverRotationDelta = 0;
    const oldRotation = tile.rotation;
    const rotResult = this._computeClickRotateResult(pos, board, delta, e.shiftKey);
    if (rotResult.success) {
      // Sync the pending placement rotation so the ghost image stays aligned.
      if (this._cb.getSelectedShape() === tile.shape) {
        this._cb.setPendingRotation(tile.rotation);
      }
      this._cb.afterTileRotated(filledBefore, rotResult, { row: pos.row, col: pos.col, oldRotation });
      this._cb.refreshUI();
      this._cb.checkWinLose();
    } else if (rotResult.error) {
      this._cb.handleBoardError(rotResult);
    } else if (tile.isFixed && !SPIN_PIPE_SHAPES.has(tile.shape)) {
      // Fixed non-spinner: can't be placed on or rotated — shake the tile.
      this._cb.shakeAt(pos);
    }
  }

  private _computeClickRotateResult(pos: GridPos, board: Board, delta: number, shiftKey: boolean): MoveResult {
    if (delta > 0) return board.rotateTileBy(pos, delta);
    if (shiftKey) return board.rotateTileBy(pos, 3);
    return board.rotateTile(pos);
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
      this._clearSelectedShape();
      return;
    }

    const tile = board.getTile(pos);

    // Right-clicking a tile that cannot accept the selected shape: clear any pending inventory selection.
    if (tile && (
      isEmptyFloor(tile.shape) ||
      SPIN_PIPE_SHAPES.has(tile.shape) ||
      (this._cb.getSelectedShape() !== null && this._isUnavailablePlacementTile(tile))
    )) {
      this._clearSelectedShape();
      return;
    }

    this._cb.reclaimTileAt(pos);
  }

  private _handleCanvasMouseMove(e: MouseEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    const prevPos = this._getHoverGridPos();
    this.mouseCanvasPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- mouseCanvasPos is set on the previous line so _getHoverGridPos always returns a value
    const newPos = this._getHoverGridPos()!;
    if (newPos.row !== prevPos?.row || newPos.col !== prevPos?.col) {
      this.hoverRotationDelta = 0;
    }
    if (this.ctrlHeld && this._cb.getGameState() === GameState.Playing) {
      this._cb.showTooltip(e.clientX, e.clientY);
    }

    const board = this._cb.getBoard();
    // Drag-paint: place at the OLD tile each time the cursor enters a new grid cell.
    this._handleDragPaintOnMouseMove(newPos, board);
    // Drag-erase: reclaim the OLD tile each time the cursor enters a new grid cell.
    this._handleDragEraseOnMouseMove(newPos, board);
  }

  private _isDragPaintActive(board: Board | null): board is Board {
    return this._isDragging && this._cb.getSelectedShape() !== null &&
      board !== null && this._cb.getScreen() === GameScreen.Play &&
      this._cb.getGameState() === GameState.Playing;
  }

  private _handleDragPaintOnMouseMove(newPos: GridPos, board: Board | null): void {
    if (!this._isDragPaintActive(board)) return;
    const { row, col } = newPos;
    const last = this._dragLastTile;
    if (!last || (row === last.row && col === last.col)) return;
    // Moved to a new tile: place at the tile we just left.
    this._paintOldDragTile(last, board);
    this._dragLastTile = { row, col };
  }

  private _paintOldDragTile(last: GridPos, board: Board): void {
    const oldTile = board.getTile(last);
    if (oldTile) {
      const filledBefore = board.getFilledPositions();
      this._cb.tryPlaceOrReplace(last, oldTile, filledBefore);
    }
  }

  private _isDragEraseActive(board: Board | null): board is Board {
    return this._isRightDragging && board !== null && this._cb.getScreen() === GameScreen.Play &&
      this._cb.getGameState() === GameState.Playing;
  }

  private _handleDragEraseOnMouseMove(newPos: GridPos, board: Board | null): void {
    if (!this._isDragEraseActive(board)) return;
    const { row, col } = newPos;
    const last = this._rightDragLastTile;
    if (!last || (row === last.row && col === last.col)) return;
    // Moved to a new tile: reclaim the tile we just left.
    this._cb.reclaimTileAt(last);
    this._rightDragLastTile = { row, col };
  }

  private _handleCanvasWheel(e: WheelEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play) return;
    if (this._cb.getGameState() !== GameState.Playing) return;
    const board = this._cb.getBoard();
    if (this._handleSpinPipeWheel(e, board)) return;

    if (this._cb.getSelectedShape() !== null) {
      e.preventDefault();
      // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise
      this._rotatePendingByWheelDirection(e.deltaY);
    } else if (this.mouseCanvasPos && board) {
      // No inventory selected and not a spin pipe: preview rotation on hovered tile.
      this._previewHoverRotationOnWheel(e);
    }
  }

  /** Scroll down → rotate clockwise; scroll up → rotate counter-clockwise. */
  private _previewHoverRotationOnWheel(e: WheelEvent): void {
    const changed = this._tryAdjustHoverRotation(e.deltaY > 0 ? 1 : -1);
    if (changed) e.preventDefault();
  }

  private _rotatePendingByWheelDirection(deltaY: number): void {
    if (deltaY > 0) {
      this._rotatePendingCW();
    } else {
      this._rotatePendingCCW();
    }
  }

  /** Spin pipes always take priority when hovered: wheel rotates them directly. Returns whether handled. */
  private _handleSpinPipeWheel(e: WheelEvent, board: Board | null): boolean {
    if (!this.mouseCanvasPos || !board) return false;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- mouseCanvasPos check above ensures _getHoverGridPos returns non-null
    const hPos = this._getHoverGridPos()!;
    const hTile = board.getTile(hPos);
    if (!hTile || !SPIN_PIPE_SHAPES.has(hTile.shape)) return false;

    // Scroll down → CW (1 step), scroll up → CCW (3 steps = -1 mod 4)
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
    return true;
  }

  private _handleDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this._cb.handleEscapeKey();
      return;
    }
    this._handleCtrlKeyDown(e);
    this._handleShiftKeyDown(e);
    this._handleUndoKeyDown(e);
    this._handleRedoKeyDown(e);
    this._handleBackspaceKeyDown(e);
  }

  /** Ctrl held down: shows a tooltip for whatever's currently hovered (board tile or inventory item). */
  private _handleCtrlKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Control' || this.ctrlHeld) return;
    this.ctrlHeld = true;
    if (this._cb.getGameState() !== GameState.Playing) return;
    if (this.mouseCanvasPos) {
      const rect = this._canvas.getBoundingClientRect();
      this._cb.showTooltip(
        this.mouseCanvasPos.x + rect.left,
        this.mouseCanvasPos.y + rect.top,
      );
    } else if (this._hoveredInvShape !== null) {
      this._cb.showInventoryItemTooltip(this._hoveredInvShape, this._hoveredInvClientX, this._hoveredInvClientY);
    }
  }

  /** Shift held down: cycles to the next available inventory item, unless Shift is bound as a modifier key. */
  private _handleShiftKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Shift' || this.shiftHeld) return;
    this.shiftHeld = true;
    if (this._cb.getScreen() === GameScreen.Play && this._cb.getGameState() === GameState.Playing &&
        !commandKeyManager.isShiftUsedAsModifier()) {
      this._cb.selectNextAvailableInventory();
    }
  }

  private _handleUndoKeyDown(e: KeyboardEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play || !commandKeyManager.matches('undo', e)) return;
    e.preventDefault();
    if (this._cb.getGameState() === GameState.Playing) this._cb.performUndo();
  }

  private _handleRedoKeyDown(e: KeyboardEvent): void {
    if (this._cb.getScreen() !== GameScreen.Play || !commandKeyManager.matches('redo', e)) return;
    e.preventDefault();
    if (this._cb.getGameState() === GameState.Playing) this._cb.performRedo();
  }

  private _handleBackspaceKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Backspace' || this._cb.getScreen() !== GameScreen.Play) return;
    e.preventDefault();
    if (this._cb.getGameState() === GameState.Playing ||
        this._cb.getGameState() === GameState.GameOver ||
        this._cb.getGameState() === GameState.Won) {
      this._cb.performUndo();
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
    if (this._isInputLocked()) return;
    if (this._cb.getScreen() !== GameScreen.Play) return;
    const board = this._cb.getBoard();
    if (!board) return;

    if (commandKeyManager.matches('rotateCCW', e)) {
      e.preventDefault();
      // 3 CW steps = 1 CCW step
      this._handleRotateShortcut(3, true);
      return;
    }
    if (commandKeyManager.matches('rotateCW', e)) {
      e.preventDefault();
      this._handleRotateShortcut(1, false);
      return;
    }
    if (e.key === 'Escape') {
      this._cb.handleEscapeKey();
    }
    this._handleRestartLevelShortcut(e);
  }

  /** Spinner takes priority over pending piece rotation, which takes priority over rotating a placed pipe. */
  private _handleRotateShortcut(steps: number, ccw: boolean): void {
    if (this._cb.getGameState() !== GameState.Playing) return;
    if (this._tryRotateHoverSpinner(steps)) return;
    if (this._cb.getSelectedShape() !== null) {
      if (ccw) {
        this._rotatePendingCCW();
      } else {
        this._rotatePendingCW();
      }
    } else {
      this._tryRotateHoverPipe(steps);
    }
  }

  private _handleRestartLevelShortcut(e: KeyboardEvent): void {
    if (commandKeyManager.matches('restartLevel', e) && this._cb.getGameState() === GameState.Playing) {
      this._cb.retryLevel();
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
    const onTouchStart = (e: TouchEvent) => this._onInventoryItemTouchStart(e, el);
    const onTouchMove = (e: TouchEvent) => this._onInventoryItemTouchMove(e);
    const onTouchEnd = (e: TouchEvent) => this._onInventoryItemTouchEnd(e, shape, effectiveCount);

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: false });
  }

  private _onInventoryItemTouchStart(e: TouchEvent, el: HTMLElement): void {
    if (this._cb.getGameState() !== GameState.Playing) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];

    // Create a floating ghost that follows the finger.
    const ghostEl = document.createElement('div');
    ghostEl.style.cssText =
      'position:fixed;pointer-events:none;z-index:200;' +
      `background:${UI_BG};border:2px solid ${UI_BORDER};border-radius:${RADIUS_MD};` +
      'padding:6px 8px;opacity:0.85;font-size:1rem;color:#eee;white-space:nowrap;' +
      `left:${touch.clientX + 12}px;top:${touch.clientY + 12}px;`;
    ghostEl.replaceChildren(...Array.from(el.childNodes, (n) => n.cloneNode(true)));
    document.body.appendChild(ghostEl);
    this._invDragGhostEl = ghostEl;
    this._invDragActive = true;
  }

  private _onInventoryItemTouchMove(e: TouchEvent): void {
    if (!this._invDragActive || !this._invDragGhostEl || e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    this._invDragGhostEl.style.left = `${touch.clientX + 12}px`;
    this._invDragGhostEl.style.top  = `${touch.clientY + 12}px`;
  }

  private _onInventoryItemTouchEnd(e: TouchEvent, shape: PipeShape, effectiveCount: number): void {
    if (!this._invDragActive) return;
    e.preventDefault();
    this._invDragActive = false;

    // Remove the ghost element.
    if (this._invDragGhostEl) { this._invDragGhostEl.remove(); this._invDragGhostEl = null; }

    // Determine if the finger was released over the game canvas.
    const changedTouch = e.changedTouches[0];
    if (!changedTouch) {
      // No valid endpoint — treat as a tap to select.
      this.handleInventoryClick(shape, effectiveCount);
      return;
    }

    const canvasRect = this._canvas.getBoundingClientRect();
    if (this._isTouchOverRect(changedTouch, canvasRect)) {
      // Dropped onto the canvas — select this shape and place it at the cell.
      this._dropInventoryItemOnCanvas(shape, changedTouch, canvasRect);
    } else {
      // Released outside the canvas — treat as a tap to select/deselect.
      this.handleInventoryClick(shape, effectiveCount);
    }
  }

  private _isTouchOverRect(touch: Touch, rect: DOMRect): boolean {
    return touch.clientX >= rect.left && touch.clientX <= rect.right &&
      touch.clientY >= rect.top && touch.clientY <= rect.bottom;
  }

  private _dropInventoryItemOnCanvas(shape: PipeShape, touch: Touch, canvasRect: DOMRect): void {
    const board = this._cb.getBoard();
    if (!board || this._cb.getGameState() !== GameState.Playing) return;
    // Select the shape with its last-used rotation.
    this._cb.setSelectedShape(shape);
    this._cb.setPendingRotation(this.lastPlacedRotations.get(shape) ?? 0);
    this._cb.renderInventoryBar();
    // Compute grid position from the drop coordinates.
    const col = Math.floor((touch.clientX - canvasRect.left) * board.cols / canvasRect.width);
    const row = Math.floor((touch.clientY - canvasRect.top)  * board.rows / canvasRect.height);
    const pos = { row, col };
    const tile = board.getTile(pos);
    if (!tile) return;
    const filledBefore = board.getFilledPositions();
    if (this._cb.tryPlaceOrReplace(pos, tile, filledBefore)) {
      // Placement was handled; afterTilePlaced called by tryPlaceOrReplace chain.
      sfxManager.play(SfxId.PipePlacement);
    }
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
    if (this._isInputLocked()) return;
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
    this._longPressTimer = setTimeout(() => this._onLongPressTimeout(), 500);
  }

  private _onLongPressTimeout(): void {
    this._longPressTimer = null;
    if (this._touchMoved || this._cb.getScreen() !== GameScreen.Play || this._cb.getGameState() !== GameState.Playing) return;
    const board = this._cb.getBoard();
    if (!board) return;
    const lp = this._getGridPosFromClientXY(this._touchStartX, this._touchStartY);
    const tile = board.getTile(lp);
    if (this._isLongPressReclaimableTile(tile)) {
      this._triggerLongPressReclaim(lp);
    } else if (this._cb.getSelectedShape() !== null) {
      // Long-press on empty/spinner with a shape selected → deselect.
      this._triggerLongPressDeselect();
    }
  }

  private _isLongPressReclaimableTile(tile: Tile | null): tile is Tile {
    return !!tile && !isEmptyFloor(tile.shape) && !SPIN_PIPE_SHAPES.has(tile.shape);
  }

  private _triggerLongPressReclaim(lp: GridPos): void {
    this._longPressTriggered = true;
    // Optional haptic feedback.
    if (typeof navigator.vibrate === 'function') navigator.vibrate(50);
    this._cb.reclaimTileAt(lp);
  }

  private _triggerLongPressDeselect(): void {
    this._longPressTriggered = true;
    this._cb.setSelectedShape(null);
    this._cb.renderInventoryBar();
    sfxManager.play(SfxId.InventoryUnselect);
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
    if (this._handleTouchSwipeRotation(dx, dy, board)) return;

    // ── Drag-paint (only when a shape is selected and finger has clearly moved) ──
    this._handleTouchDragPaint(touch, board);
  }

  /**
   * Swipe: horizontal movement > 40 px AND vertical movement < 30 px. Rotates the pending
   * placement piece, or a placed non-fixed tile at the touch-start position. Returns whether
   * the gesture was recognized (and thus handled) as a swipe-rotation.
   */
  private _handleTouchSwipeRotation(dx: number, dy: number, board: Board): boolean {
    if (!this._isSwipeRotationGesture(dx, dy)) return false;
    this._swipeRotated = true;
    this._clearLongPressTimer();
    if (this._cb.getSelectedShape() !== null) {
      this._rotatePendingByDragDirection(dx);
    } else {
      this._rotatePlacedTileAtTouchStart(dx, board);
    }
    return true;
  }

  private _isSwipeRotationGesture(dx: number, dy: number): boolean {
    return !this._swipeRotated && !this._longPressTriggered && Math.abs(dx) > 40 && Math.abs(dy) < 30;
  }

  private _rotatePendingByDragDirection(dx: number): void {
    if (dx > 0) {
      this._rotatePendingCW();
    } else {
      this._rotatePendingCCW();
    }
  }

  private _rotatePlacedTileAtTouchStart(dx: number, board: Board): void {
    const startPos = this._getGridPosFromClientXY(this._touchStartX, this._touchStartY);
    const startTile = board.getTile(startPos);
    if (!startTile || isEmptyFloor(startTile.shape) || startTile.isFixed || SPIN_PIPE_SHAPES.has(startTile.shape)) {
      return;
    }
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

  /** Drag-paint: only when a shape is selected and the finger has clearly moved without swipe-rotating. */
  private _handleTouchDragPaint(touch: Touch, board: Board): void {
    if (!this._touchMoved || this._cb.getSelectedShape() === null || this._swipeRotated) return;
    const newPos = this._getGridPosFromClientXY(touch.clientX, touch.clientY);
    const last = this._touchDragLastTile;
    if (!last || (newPos.row === last.row && newPos.col === last.col)) return;

    // Paint the cell we just left.
    const oldTile = board.getTile(last);
    if (oldTile) {
      const filledBefore = board.getFilledPositions();
      this._cb.tryPlaceOrReplace(last, oldTile, filledBefore);
    }
    this._touchDragLastTile = newPos;
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
      this._finishTouchDragPaint(board);
    } else {
      this._handleTouchTapAsClick(changedTouch, board);
    }

    this._touchDragLastTile = null;
  }

  /** End of a drag-paint: place on the final dragged-over tile. */
  private _finishTouchDragPaint(board: Board): void {
    const last = this._touchDragLastTile;
    if (!last || this._cb.getSelectedShape() === null) return;
    const tile = board.getTile(last);
    if (!tile || SPIN_PIPE_SHAPES.has(tile.shape)) return;
    const filledBefore = board.getFilledPositions();
    this._cb.tryPlaceOrReplace(last, tile, filledBefore);
  }

  /** Short tap (no drag): handle as a click on the tapped tile. */
  private _handleTouchTapAsClick(changedTouch: Touch, board: Board): void {
    const pos = this._getGridPosFromClientXY(changedTouch.clientX, changedTouch.clientY);
    const tile = board.getTile(pos);
    if (!tile) return;
    const filledBefore = board.getFilledPositions();

    if (SPIN_PIPE_SHAPES.has(tile.shape)) {
      // Tap on a spin pipe: rotate CW by one step.
      this._spinTileOnTouchTap(pos, tile, board, filledBefore);
    } else if (this._shouldPlaceOrReplaceTile(tile)) {
      // Place or replace.
      this._cb.tryPlaceOrReplace(pos, tile, filledBefore);
    } else if (!isEmptyFloor(tile.shape)) {
      // Tap on a placed non-selected tile: rotate CW.
      this._rotateTileOnTouchTap(pos, tile, board, filledBefore);
    }
  }

  private _shouldPlaceOrReplaceTile(tile: Tile): boolean {
    return this._cb.getSelectedShape() !== null &&
      (isEmptyFloor(tile.shape) ||
       tile.shape !== this._cb.getSelectedShape() ||
       tile.rotation !== this._cb.getPendingRotation());
  }

  private _spinTileOnTouchTap(pos: GridPos, tile: Tile, board: Board, filledBefore: Set<string>): void {
    const oldRotation = tile.rotation;
    const spinResult = board.rotateTileBy(pos, 1);
    if (spinResult.success) {
      if (this._cb.getSelectedShape() === tile.shape) {
        this._cb.setPendingRotation(tile.rotation);
      }
      this._cb.afterTileRotated(filledBefore, spinResult, { row: pos.row, col: pos.col, oldRotation });
      this._cb.refreshUI();
      this._cb.checkWinLose();
    } else if (spinResult.error) {
      this._cb.handleBoardError(spinResult);
    }
  }

  private _rotateTileOnTouchTap(pos: GridPos, tile: Tile, board: Board, filledBefore: Set<string>): void {
    const oldRotation = tile.rotation;
    const rotResult = board.rotateTile(pos);
    if (rotResult.success) {
      if (this._cb.getSelectedShape() === tile.shape) {
        this._cb.setPendingRotation(tile.rotation);
      }
      this._cb.afterTileRotated(filledBefore, rotResult, { row: pos.row, col: pos.col, oldRotation });
      this._cb.refreshUI();
      this._cb.checkWinLose();
    } else if (rotResult.error) {
      this._cb.handleBoardError(rotResult);
    }
  }
}
