/**
 * EditorInputHandler – owns all canvas gesture state and event handlers for
 * the level editor canvas.  Follows the same attach/detach pattern as the
 * game's InputHandler.
 *
 * CampaignEditor wires callbacks via EditorInputCallbacks and calls
 * attach() / detach() as the editor screen is entered / exited.
 */

import type { TileDef, Rotation } from '../types';
import { PipeShape } from '../types';
import { PIPE_SHAPES, LEAKY_PIPE_SHAPES, GOLD_PIPE_SHAPES, SPIN_CEMENT_SHAPES, isEmptyFloor } from '../board';
import type { DragState } from './editorRenderer';
import type { EditorPalette } from './types';
import { REPEATABLE_EDITOR_TILES, isPipePlacementPalette } from './types';
import type { LevelEditorState } from './levelEditorState';
import { sfxManager, SfxId } from '../audio/sfxManager';
import { isTileConnectedToSource } from '../tile';
import { canvasPos as computeCanvasPos } from './canvasUtils';

/** All tree tile shapes — any tree variant may overwrite any other. */
const TREE_SHAPES = new Set<PipeShape>([
  PipeShape.Tree, PipeShape.Tree2, PipeShape.Tree3, PipeShape.Tree4,
]);

// ─── Callback interface ────────────────────────────────────────────────────────

export interface EditorInputCallbacks {
  /** Returns the current mutable editor state. */
  getState(): LevelEditorState;
  /** Re-render the editor canvas. */
  renderCanvas(): void;
  /** Rebuild and replace the palette and param panels in the DOM. */
  refreshPaletteUI(): void;
  /** Update the enabled/disabled state of the undo and redo buttons. */
  updateUndoRedoButtons(): void;
  /** Flash the "only one source tile" error message. */
  showSourceError(): void;
  /** Flash the "only one sink tile" error message. */
  showSinkError(): void;
}

// ─── Internal gesture state ────────────────────────────────────────────────────

interface InternalDragState {
  startPos: { row: number; col: number };
  tile: TileDef;
  currentPos: { row: number; col: number };
  moved: boolean;
}

// ─── EditorInputHandler ────────────────────────────────────────────────────────

export class EditorInputHandler {
  // Gesture state
  private _dragState: InternalDragState | null = null;
  private _paintDragActive = false;
  private _rightEraseDragActive = false;
  private _rightEraseChanged = false;
  private _suppressNextContextMenu = false;
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private readonly _mouseDownHandler = (e: MouseEvent) => this.onMouseDown(e);
  private readonly _mouseMoveHandler = (e: MouseEvent) => this.onMouseMove(e);
  private readonly _contextMenuHandler = (e: MouseEvent) => {
    e.preventDefault();
    if (this._suppressNextContextMenu) {
      this._suppressNextContextMenu = false;
      return;
    }
    this.onRightClick(e);
  };
  private readonly _mouseLeaveHandler = () => this.onMouseLeave();
  private readonly _wheelHandler = (e: WheelEvent) => this.onWheel(e);

  constructor(
    private readonly _canvas: HTMLCanvasElement,
    private readonly _cb: EditorInputCallbacks,
  ) {}

  /**
   * Read-only view of drag state for the renderer (option a from the plan).
   * Returns null when no drag is active.
   */
  get dragState(): DragState | null {
    if (!this._dragState) return null;
    return {
      fromPos: this._dragState.startPos,
      toPos: this._dragState.currentPos,
      tile: this._dragState.tile,
    };
  }

  /** True while a paint-drag is active (read-only for external observers). */
  get paintDragActive(): boolean { return this._paintDragActive; }

  /** True while a right-button erase-drag is active (read-only for external observers). */
  get rightEraseDragActive(): boolean { return this._rightEraseDragActive; }

  /** True when the next contextmenu event should be suppressed (read-only for external observers). */
  get suppressNextContextMenu(): boolean { return this._suppressNextContextMenu; }

  /** Register all canvas and window event listeners. */
  attach(): void {
    this._canvas.removeEventListener('mousedown', this._mouseDownHandler);
    this._canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    this._canvas.removeEventListener('contextmenu', this._contextMenuHandler);
    this._canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
    this._canvas.removeEventListener('wheel', this._wheelHandler);

    this._canvas.addEventListener('mousedown', this._mouseDownHandler);
    this._canvas.addEventListener('mousemove', this._mouseMoveHandler);
    this._canvas.addEventListener('contextmenu', this._contextMenuHandler);
    this._canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
    this._canvas.addEventListener('wheel', this._wheelHandler, { passive: false });

    // Listen on window so mouseup is captured even when released outside the canvas.
    // Remove any previous handler first to avoid duplicates.
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
    }
    this._windowMouseUpHandler = (e: MouseEvent) => this.onMouseUp(e);
    window.addEventListener('mouseup', this._windowMouseUpHandler);
  }

  /** Remove all listeners. Call when leaving the level editor. */
  detach(): void {
    this._canvas.removeEventListener('mousedown', this._mouseDownHandler);
    this._canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    this._canvas.removeEventListener('contextmenu', this._contextMenuHandler);
    this._canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
    this._canvas.removeEventListener('wheel', this._wheelHandler);
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
      this._windowMouseUpHandler = null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private _paintCell(pos: { row: number; col: number }): void {
    const state = this._cb.getState();
    // Empty-Summer palette: clear to null (summer)
    if (state.palette === PipeShape.Empty) {
      state.grid[pos.row][pos.col] = null;
      return;
    }
    state.grid[pos.row][pos.col] = state.buildTileDef();
    if (state.paletteHasNonRotationParams()) {
      state.linkTile(pos);
    }
  }

  canvasPos(e: MouseEvent): { row: number; col: number } | null {
    const state = this._cb.getState();
    return computeCanvasPos(e, this._canvas, state.rows, state.cols);
  }

  // ─── Event handlers ───────────────────────────────────────────────────────────

  onMouseDown(e: MouseEvent): void {
    if (e.button === 2) { this._onRightButtonMouseDown(e); return; }
    if (e.button !== 0) return; // left button only
    const pos = this.canvasPos(e);
    if (!pos) return;

    const state = this._cb.getState();
    const existingTile = state.grid[pos.row][pos.col];
    const existingIsEmpty = existingTile === null || isEmptyFloor(existingTile.shape);
    const paletteIsTree = TREE_SHAPES.has(state.palette as PipeShape);
    const existingIsTree = existingTile !== null && TREE_SHAPES.has(existingTile.shape);

    if (this._shouldStartPaintDragOnClick(state.palette, existingIsEmpty, paletteIsTree, existingIsTree)) {
      this._paintDragActive = true;
      this._paintCell(pos);
      this._playPlacementSfx(pos);
      this._cb.renderCanvas();
      return;
    }

    if (this._shouldStartTileDrag(existingTile, existingIsEmpty, state.palette)) {
      this._startTileDrag(pos, existingTile, e.ctrlKey);
      return;
    }

    this._placeOrClearTileOnClick(pos);
  }

  private _onRightButtonMouseDown(e: MouseEvent): void {
    const pos = this.canvasPos(e);
    if (!pos) return;
    const state = this._cb.getState();
    // Start a right-button erase-drag: erase the first cell immediately.
    this._rightEraseDragActive = true;
    this._rightEraseChanged = false;
    this._suppressNextContextMenu = false;
    const current = state.grid[pos.row][pos.col];
    const erased = state.eraseFloorTileDefAt(pos.row, pos.col);
    if (!this._sameFloorDef(current, erased)) {
      state.grid[pos.row][pos.col] = erased;
      state.clearLinkAt(pos);
      this._rightEraseChanged = true;
      sfxManager.play(SfxId.Delete);
      this._cb.renderCanvas();
    }
  }

  /** Tree palette on a tree cell, or a repeatable tile on an empty cell: both start a paint-drag session. */
  private _shouldStartPaintDragOnClick(palette: EditorPalette, existingIsEmpty: boolean, paletteIsTree: boolean, existingIsTree: boolean): boolean {
    return REPEATABLE_EDITOR_TILES.has(palette) && (existingIsEmpty || (paletteIsTree && existingIsTree));
  }

  private _shouldStartTileDrag(existingTile: TileDef | null, existingIsEmpty: boolean, palette: EditorPalette): existingTile is TileDef {
    return existingTile !== null && !existingIsEmpty && palette !== 'erase';
  }

  /** Start a drag: track the tile but don't modify the grid yet. */
  private _startTileDrag(pos: { row: number; col: number }, existingTile: TileDef, ctrlKey: boolean): void {
    this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
    // Bind Tile Params to the grabbed tile (full select + live-edit link where applicable).
    // Skip when ctrl is held so ctrl+click overwrite behavior remains unchanged.
    if (!ctrlKey) {
      const state = this._cb.getState();
      state.selectTileFromDef(existingTile, pos);
      this._cb.refreshPaletteUI();
    }
    this._cb.renderCanvas();
  }

  /** Only one Source/Sink tile is allowed per level; shows the matching error and returns true if palette is blocked. */
  private _isBlockedBySourceSinkLimit(excludePos?: { row: number; col: number }): boolean {
    const state = this._cb.getState();
    if (state.palette === PipeShape.Source && state.hasSourceElsewhere(excludePos)) {
      this._cb.showSourceError();
      return true;
    }
    if (state.palette === PipeShape.Sink && state.hasSinkElsewhere(excludePos)) {
      this._cb.showSinkError();
      return true;
    }
    return false;
  }

  /**
   * Paint / erase immediately; snapshot recorded after the change so that
   * the placed/erased tile is captured in the new history entry.
   */
  private _playDeleteSfxIfOccupied(pos: { row: number; col: number }): void {
    if (this._cb.getState().grid[pos.row][pos.col] !== null) sfxManager.play(SfxId.Delete);
  }

  /** Link the just-placed tile for live param editing only if it has parameters beyond rotation (Source, Sink, Chamber). */
  private _linkTileIfHasParams(pos: { row: number; col: number }): void {
    const state = this._cb.getState();
    if (state.paletteHasNonRotationParams()) {
      state.linkTile(pos);
    }
  }

  private _placeOrClearTileOnClick(pos: { row: number; col: number }): void {
    if (this._isBlockedBySourceSinkLimit()) return;
    const state = this._cb.getState();
    if (state.palette === 'erase') {
      this._playDeleteSfxIfOccupied(pos);
      state.grid[pos.row][pos.col] = state.eraseFloorTileDefAt(pos.row, pos.col);
      // Clear the link if the erased tile was linked
      state.clearLinkAt(pos);
    } else if (state.palette === PipeShape.Empty) {
      // Empty-Summer palette: clear to floor-type-aware null
      this._playDeleteSfxIfOccupied(pos);
      state.grid[pos.row][pos.col] = null;
      state.clearLinkAt(pos);
    } else {
      state.grid[pos.row][pos.col] = state.buildTileDef();
      this._playPlacementSfx(pos);
      this._linkTileIfHasParams(pos);
    }
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
    this._cb.renderCanvas();
  }

  onMouseUp(e: MouseEvent): void {
    if (e.button === 2) { this._onRightButtonMouseUp(); return; }
    if (e.button !== 0) return; // left button only

    // End paint-drag session.
    if (this._paintDragActive) {
      this._paintDragActive = false;
      const state = this._cb.getState();
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
      this._cb.renderCanvas();
      return;
    }

    if (!this._dragState) return;
    this._finishTileDrag(this._dragState, e);
  }

  private _onRightButtonMouseUp(): void {
    if (!this._rightEraseDragActive) return;
    // End right-erase-drag: record the undo snapshot now (PR #101 pattern).
    this._rightEraseDragActive = false;
    this._suppressNextContextMenu = true;
    if (this._rightEraseChanged) {
      const state = this._cb.getState();
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
    }
    this._rightEraseChanged = false;
    this._cb.renderCanvas();
  }

  private _hasNonRotationLinkableShape(shape: PipeShape): boolean {
    return shape === PipeShape.Source || shape === PipeShape.Sink || shape === PipeShape.Chamber;
  }

  private _finishTileDrag(dragState: InternalDragState, e: MouseEvent): void {
    const { startPos, tile, currentPos, moved } = dragState;
    this._dragState = null;

    if (moved) {
      this._commitTileMove(startPos, currentPos, tile);
    } else {
      // It was a click on a non-empty tile (no movement occurred)
      this._handleStationaryTileClick(startPos, tile, e);
    }
    this._cb.renderCanvas();
  }

  /** Commit the drag: move tile from startPos to currentPos; snapshot after. */
  private _commitTileMove(startPos: { row: number; col: number }, currentPos: { row: number; col: number }, tile: TileDef): void {
    const state = this._cb.getState();
    state.grid[startPos.row][startPos.col] = null;
    state.grid[currentPos.row][currentPos.col] = tile;
    // Only link the moved tile if it has parameters beyond rotation.
    if (this._hasNonRotationLinkableShape(tile.shape)) {
      state.linkTile(currentPos);
    }
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
    this._cb.refreshPaletteUI();
  }

  private _handleStationaryTileClick(startPos: { row: number; col: number }, tile: TileDef, e: MouseEvent): void {
    if (!e.ctrlKey && PIPE_SHAPES.has(tile.shape)) {
      // Click on a placed pipe tile: rotate it (shift = counter-clockwise)
      this._rotateClickedPipeTile(tile, e.shiftKey);
      return;
    }
    if (e.ctrlKey) {
      this._forceOverwriteOnCtrlClick(startPos);
      return;
    }
    if (this._cb.getState().palette === PipeShape.OneWay && tile.shape === PipeShape.OneWay) {
      // Only OneWay-on-OneWay reaches an auto-replace here: a non-ctrl click on
      // a PIPE_SHAPES tile is already intercepted above as a rotate, so this
      // branch is only reached when tile.shape not in PIPE_SHAPES.  (Pipe to pipe and
      // cross-type overwrites go through the Ctrl+click force-overwrite path.)
      this._autoReplaceOneWayTile(startPos);
      return;
    }
    // Select the clicked tile in the palette and populate Tile Params
    this._cb.getState().selectTileFromDef(tile, startPos);
    this._cb.refreshPaletteUI();
  }

  private _rotateClickedPipeTile(tile: TileDef, shiftKey: boolean): void {
    const state = this._cb.getState();
    const clockwise = !shiftKey;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
    const cur = (tile.rotation ?? 0);
    tile.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    // Keep palette ghost in sync when the palette matches the rotated tile's shape.
    if (state.palette === tile.shape) {
      state.params.rotation = tile.rotation;
    }
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
  }

  /** Ctrl+click: force-overwrite; snapshot recorded after the change. */
  private _forceOverwriteOnCtrlClick(startPos: { row: number; col: number }): void {
    if (this._isBlockedBySourceSinkLimit(startPos)) return;
    const state = this._cb.getState();
    if (state.palette === 'erase') {
      sfxManager.play(SfxId.Delete);
      state.grid[startPos.row][startPos.col] = state.eraseFloorTileDefAt(startPos.row, startPos.col);
      // Clear the link if the erased tile was linked
      state.clearLinkAt(startPos);
    } else {
      state.grid[startPos.row][startPos.col] = state.buildTileDef();
      this._playPlacementSfx(startPos);
      this._linkTileIfHasParams(startPos);
    }
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
  }

  /** Auto-replace; snapshot after. */
  private _autoReplaceOneWayTile(startPos: { row: number; col: number }): void {
    const state = this._cb.getState();
    state.grid[startPos.row][startPos.col] = state.buildTileDef();
    this._playPlacementSfx(startPos);
    this._linkTileIfHasParams(startPos);
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
  }

  onRightClick(e: MouseEvent): void {
    const state = this._cb.getState();
    const pos = this.canvasPos(e);
    if (!pos) return;
    const current = state.grid[pos.row][pos.col];
    const erased = state.eraseFloorTileDefAt(pos.row, pos.col);
    if (this._sameFloorDef(current, erased)) return;
    sfxManager.play(SfxId.Delete);
    state.grid[pos.row][pos.col] = erased;
    // Clear the link if the erased tile was linked
    state.clearLinkAt(pos);
    // Snapshot after mutation so the erased state is captured and redo restores it correctly.
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
    this._cb.renderCanvas();
  }

  onMouseMove(e: MouseEvent): void {
    const state = this._cb.getState();
    const pos = this.canvasPos(e);
    state.hover = pos;

    if (this._paintDragActive && pos) {
      this._handlePaintDragMove(pos);
    } else if (this._rightEraseDragActive && pos) {
      this._handleRightEraseDragMove(pos);
    } else if (this._dragState && pos) {
      this._handleTileDragMove(this._dragState, pos);
    }

    this._cb.renderCanvas();
  }

  /**
   * Paint each empty (or empty-floor-typed) cell the cursor enters during a paint-drag.
   * Also allow a tree palette to overwrite any other tree tile.
   */
  private _handlePaintDragMove(pos: { row: number; col: number }): void {
    const state = this._cb.getState();
    const cur = state.grid[pos.row][pos.col];
    const curIsEmpty = cur === null || isEmptyFloor(cur.shape);
    const paletteIsTree = TREE_SHAPES.has(state.palette as PipeShape);
    const curIsTree = cur !== null && TREE_SHAPES.has(cur.shape);
    if (this._canPaintOverCell(curIsEmpty, paletteIsTree, curIsTree)) {
      this._paintCell(pos);
    }
  }

  private _canPaintOverCell(curIsEmpty: boolean, paletteIsTree: boolean, curIsTree: boolean): boolean {
    return curIsEmpty || (paletteIsTree && curIsTree);
  }

  /** Erase each non-empty cell the cursor enters during a right-erase-drag. */
  private _handleRightEraseDragMove(pos: { row: number; col: number }): void {
    const state = this._cb.getState();
    const current = state.grid[pos.row][pos.col];
    const erased = state.eraseFloorTileDefAt(pos.row, pos.col);
    if (!this._sameFloorDef(current, erased)) {
      state.grid[pos.row][pos.col] = erased;
      state.clearLinkAt(pos);
      this._rightEraseChanged = true;
    }
  }

  private _handleTileDragMove(dragState: InternalDragState, pos: { row: number; col: number }): void {
    const { startPos, currentPos } = dragState;
    if (pos.row === currentPos.row && pos.col === currentPos.col) return;
    if (pos.row === startPos.row && pos.col === startPos.col) {
      // Moved back to start: cancel the move
      dragState.currentPos = pos;
      dragState.moved = false;
      return;
    }
    if (this._cb.getState().grid[pos.row][pos.col] === null) {
      // Empty cell: move tile here
      dragState.currentPos = pos;
      dragState.moved = true;
    }
    // Non-empty cell (other than start): tile stays at currentPos
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const state = this._cb.getState();
    const clockwise = e.deltaY > 0;
    sfxManager.play(clockwise ? SfxId.PendingCW : SfxId.PendingCCW);
    state.rotatePalette(clockwise);

    // Only write the rotation/connection change back to the linked tile when the
    // cursor is hovering directly over it.  When the cursor is elsewhere the
    // wheel only updates the pending-placement params (the ghost preview).
    if (this._isHoveringLinkedTile(state.hover, state.linkedTilePos)) {
      state.applyParamsToLinkedTile();
      this._cb.updateUndoRedoButtons();
    }
    this._cb.refreshPaletteUI();
    this._cb.renderCanvas();
  }

  private _isHoveringLinkedTile(hover: { row: number; col: number } | null, linked: { row: number; col: number } | null): boolean {
    return linked !== null && hover !== null && hover.row === linked.row && hover.col === linked.col;
  }

  onMouseLeave(): void {
    const state = this._cb.getState();
    state.hover = null;
    // Cancel any active drag when the mouse leaves the canvas.
    if (this._dragState) {
      this._dragState = null;
    }
    if (this._paintDragActive) {
      this._paintDragActive = false;
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
    }
    if (this._rightEraseDragActive) {
      this._rightEraseDragActive = false;
      if (this._rightEraseChanged) {
        state.recordSnapshot();
        this._cb.updateUndoRedoButtons();
      }
      this._rightEraseChanged = false;
    }
    this._cb.renderCanvas();
  }

  private _sameFloorDef(a: TileDef | null, b: TileDef | null): boolean {
    return (a?.shape ?? null) === (b?.shape ?? null);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Play the placement sound appropriate for the currently selected palette.
   * Leaky pipe tiles play the leak sfx (takes precedence over pipe placement).
   * Pump and star chamber tiles play their own sfx; heater and tank chamber
   * tiles play their own sfx; gold item chamber tiles play the gold sfx;
   * non-gold item chamber tiles with >0 count play the pickup sfx;
   * pipe, source, and sink tiles play PipeConnected when the placed tile is
   * connected to the source, or PipePlacement otherwise;
   * all other tiles are silent.
   *
   * @param pos - The grid position where the tile was just placed.  Used to
   *   check source connectivity for pipe/source/sink tiles.
   */
  private _playPlacementSfx(pos: { row: number; col: number }): void {
    const sfx = this._resolvePlacementSfxId(pos);
    if (sfx !== null) sfxManager.play(sfx);
  }

  private _resolvePlacementSfxId(pos: { row: number; col: number }): SfxId | null {
    const state = this._cb.getState();
    const palette = state.palette;
    if (LEAKY_PIPE_SHAPES.has(palette as PipeShape)) return SfxId.Leak;
    if (_isCementPlacementPalette(palette)) return SfxId.Cement;
    const fixedSfx = FIXED_PLACEMENT_SFX_BY_PALETTE[palette];
    if (fixedSfx !== undefined) return fixedSfx;
    const costTiers = COST_TIER_PLACEMENT_SFX_BY_PALETTE[palette];
    if (costTiers !== undefined) return _resolveCostTierSfx(state.params.cost, costTiers);
    if (palette === 'chamber:item') return _resolveItemPlacementSfx(state.params.itemShape, state.params.itemCount);
    if (isPipePlacementPalette(palette)) {
      const isConnected = isTileConnectedToSource(state.grid, pos);
      return isConnected ? SfxId.PipeConnected : SfxId.PipePlacement;
    }
    return null;
  }
}

function _isCementPlacementPalette(palette: EditorPalette): boolean {
  return palette === PipeShape.Cement || SPIN_CEMENT_SHAPES.has(palette as PipeShape);
}

/** Chamber palettes whose placement sfx doesn't depend on the placed tile's params. */
const FIXED_PLACEMENT_SFX_BY_PALETTE: Partial<Record<EditorPalette, SfxId>> = {
  'chamber:pump': SfxId.Pump,
  'chamber:star': SfxId.Star,
  'chamber:gel': SfxId.Gel,
  'chamber:siphon': SfxId.Siphon,
  'chamber:heater': SfxId.Heater,
  'chamber:hot_plate': SfxId.Sizzle,
  'chamber:ice': SfxId.Ice1,
  'chamber:snow': SfxId.Snow1,
  'chamber:tank': SfxId.Tank,
};

/** Cost-tiered sfx ids (<5 / <10 / else), shared by dirt and sandstone which use identical tiers with different sounds. */
const COST_TIER_PLACEMENT_SFX_BY_PALETTE: Partial<Record<EditorPalette, readonly [SfxId, SfxId, SfxId]>> = {
  'chamber:dirt': [SfxId.Dirt1, SfxId.Dirt2, SfxId.Dirt3],
  'chamber:sandstone': [SfxId.Sandstone1, SfxId.Sandstone2, SfxId.Sandstone3],
};

function _resolveCostTierSfx(cost: number, tiers: readonly [SfxId, SfxId, SfxId]): SfxId {
  if (cost < 5) return tiers[0];
  if (cost < 10) return tiers[1];
  return tiers[2];
}

/** Gold item sfx takes precedence over the plain pickup sfx; no sfx once the item slot is empty/unset. */
function _resolveItemPlacementSfx(itemShape: PipeShape | null | undefined, itemCount: number): SfxId | null {
  if (itemShape === null || itemShape === undefined) return null;
  if (GOLD_PIPE_SHAPES.has(itemShape)) return SfxId.Gold;
  if (itemCount > 0) return SfxId.Pickup;
  return null;
}
