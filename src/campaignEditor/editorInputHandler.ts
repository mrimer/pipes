/**
 * EditorInputHandler – level-editor canvas placement/erase/rotate rules.
 * The gesture state machine itself (paint-drag, right-erase-drag, tile-drag,
 * contextmenu suppression, mouseleave cancellation, attach/detach wiring) is
 * owned by GridGestureEngine — shared with the chapter map editor's
 * ChapterMapInput. This class supplies the level-editor-specific decisions:
 * what a click/drag/wheel should do to the grid. Its own public methods
 * (onMouseDown/onMouseMove/onMouseUp/onWheel/onRightClick/canvasPos) match
 * the pre-engine API exactly, since tests exercise gestures by calling them
 * directly rather than dispatching real DOM events.
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
import type { GestureRules, LeftMouseDownAction, DragInFlight, GridPos } from './gridGestureEngine';
import { GridGestureEngine } from './gridGestureEngine';

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

// ─── EditorInputHandler ────────────────────────────────────────────────────────

export class EditorInputHandler {
  private readonly _engine: GridGestureEngine;
  /** True for exactly the first paintCell() call after a paint-drag starts — only that placement plays sfx. */
  private _isFirstPaintOfDrag = false;

  constructor(
    private readonly _canvas: HTMLCanvasElement,
    private readonly _cb: EditorInputCallbacks,
  ) {
    const rules: GestureRules = {
      canvasPos: (e) => this.canvasPos(e),
      decideLeftMouseDown: (pos, e) => this._decideLeftMouseDown(pos, e),
      paintCell: (pos) => this._paintCellRule(pos),
      eraseCell: (pos) => this._eraseCellRule(pos),
      canDropTileAt: (pos) => this._canDropTileAt(pos),
      onTileMoved: (drag) => this._commitTileMove(drag),
      onTileClicked: (drag, e) => this._handleStationaryTileClick(drag.startPos, drag.tile, e),
      onRightClick: (pos) => this._eraseAtRightClick(pos),
      onWheel: (e) => this._applyWheel(e),
      onGestureEnd: (kind) => this._onGestureEnd(kind),
      onHoverChanged: (pos) => { this._cb.getState().hover = pos; },
    };
    this._engine = new GridGestureEngine(rules, { renderCanvas: () => this._cb.renderCanvas() });
  }

  /** Read-only view of drag state for the renderer. Returns null when no drag is active. */
  get dragState(): DragState | null {
    const drag = this._engine.dragState;
    if (!drag) return null;
    return { fromPos: drag.startPos, toPos: drag.currentPos, tile: drag.tile };
  }

  /** True while a paint-drag is active (read-only for external observers). */
  get paintDragActive(): boolean { return this._engine.paintDragActive; }

  /** True while a right-button erase-drag is active (read-only for external observers). */
  get rightEraseDragActive(): boolean { return this._engine.rightEraseDragActive; }

  /** True when the next contextmenu event should be suppressed (read-only for external observers). */
  get suppressNextContextMenu(): boolean { return this._engine.suppressNextContextMenu; }

  /** Register all canvas and window event listeners. */
  attach(): void { this._engine.attach(this._canvas); }

  /** Remove all listeners. Call when leaving the level editor. */
  detach(): void { this._engine.detach(); }

  canvasPos(e: MouseEvent): GridPos | null {
    const state = this._cb.getState();
    return computeCanvasPos(e, this._canvas, state.rows, state.cols);
  }

  onMouseDown(e: MouseEvent): void { this._engine.onMouseDown(e); }
  onMouseMove(e: MouseEvent): void { this._engine.onMouseMove(e); }
  onMouseUp(e: MouseEvent): void { this._engine.onMouseUp(e); }

  /** Rare contextmenu-fallback path — no suppression check, matches the pre-engine public API tests call directly. */
  onRightClick(e: MouseEvent): void {
    const pos = this.canvasPos(e);
    if (!pos) return;
    this._eraseAtRightClick(pos);
  }

  onWheel(e: WheelEvent): void { this._applyWheel(e); }

  // ─── GestureRules implementation (private — engine-facing only) ───────────────

  private _decideLeftMouseDown(pos: GridPos, e: MouseEvent): LeftMouseDownAction {
    const state = this._cb.getState();
    const existingTile = state.grid[pos.row][pos.col];
    const existingIsEmpty = existingTile === null || isEmptyFloor(existingTile.shape);
    const paletteIsTree = TREE_SHAPES.has(state.palette as PipeShape);
    const existingIsTree = existingTile !== null && TREE_SHAPES.has(existingTile.shape);

    if (this._shouldStartPaintDragOnClick(state.palette, existingIsEmpty, paletteIsTree, existingIsTree)) {
      this._isFirstPaintOfDrag = true;
      return { type: 'startPaintDrag' };
    }

    if (this._shouldStartTileDrag(existingTile, existingIsEmpty, state.palette)) {
      this._startTileDrag(pos, existingTile, e.ctrlKey);
      return { type: 'startTileDrag', tile: existingTile };
    }

    this._placeOrClearTileOnClick(pos);
    return { type: 'immediate' };
  }

  /** Tree palette on a tree cell, or a repeatable tile on an empty cell: both start a paint-drag session. */
  private _shouldStartPaintDragOnClick(palette: EditorPalette, existingIsEmpty: boolean, paletteIsTree: boolean, existingIsTree: boolean): boolean {
    return REPEATABLE_EDITOR_TILES.has(palette) && (existingIsEmpty || (paletteIsTree && existingIsTree));
  }

  private _shouldStartTileDrag(existingTile: TileDef | null, existingIsEmpty: boolean, palette: EditorPalette): existingTile is TileDef {
    return existingTile !== null && !existingIsEmpty && palette !== 'erase';
  }

  /** Start a drag: track the tile but don't modify the grid yet. */
  private _startTileDrag(pos: GridPos, existingTile: TileDef, ctrlKey: boolean): void {
    // Bind Tile Params to the grabbed tile (full select + live-edit link where applicable).
    // Skip when ctrl is held so ctrl+click overwrite behavior remains unchanged.
    if (!ctrlKey) {
      const state = this._cb.getState();
      state.selectTileFromDef(existingTile, pos);
      this._cb.refreshPaletteUI();
    }
  }

  private _canPaintOverCell(curIsEmpty: boolean, paletteIsTree: boolean, curIsTree: boolean): boolean {
    return curIsEmpty || (paletteIsTree && curIsTree);
  }

  private _paintCellRule(pos: GridPos): void {
    const isFirst = this._isFirstPaintOfDrag;
    this._isFirstPaintOfDrag = false;
    const state = this._cb.getState();
    const cur = state.grid[pos.row][pos.col];
    const curIsEmpty = cur === null || isEmptyFloor(cur.shape);
    const paletteIsTree = TREE_SHAPES.has(state.palette as PipeShape);
    const curIsTree = cur !== null && TREE_SHAPES.has(cur.shape);
    if (!this._canPaintOverCell(curIsEmpty, paletteIsTree, curIsTree)) return;

    this._paintCell(pos);
    if (isFirst) this._playPlacementSfx(pos);
  }

  private _paintCell(pos: GridPos): void {
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

  private _eraseCellRule(pos: GridPos): boolean {
    const state = this._cb.getState();
    const current = state.grid[pos.row][pos.col];
    const erased = state.eraseFloorTileDefAt(pos.row, pos.col);
    if (this._sameFloorDef(current, erased)) return false;
    state.grid[pos.row][pos.col] = erased;
    state.clearLinkAt(pos);
    sfxManager.play(SfxId.Delete);
    return true;
  }

  private _canDropTileAt(pos: GridPos): boolean {
    return this._cb.getState().grid[pos.row][pos.col] === null;
  }

  private _commitTileMove(drag: DragInFlight): void {
    const state = this._cb.getState();
    state.grid[drag.startPos.row][drag.startPos.col] = null;
    state.grid[drag.currentPos.row][drag.currentPos.col] = drag.tile;
    // Only link the moved tile if it has parameters beyond rotation.
    if (this._hasNonRotationLinkableShape(drag.tile.shape)) {
      state.linkTile(drag.currentPos);
    }
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
    this._cb.refreshPaletteUI();
  }

  private _hasNonRotationLinkableShape(shape: PipeShape): boolean {
    return shape === PipeShape.Source || shape === PipeShape.Sink || shape === PipeShape.Chamber;
  }

  private _handleStationaryTileClick(startPos: GridPos, tile: TileDef, e: MouseEvent): void {
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

  /** Only one Source/Sink tile is allowed per level; shows the matching error and returns true if palette is blocked. */
  private _isBlockedBySourceSinkLimit(excludePos?: GridPos): boolean {
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

  private _playDeleteSfxIfOccupied(pos: GridPos): void {
    if (this._cb.getState().grid[pos.row][pos.col] !== null) sfxManager.play(SfxId.Delete);
  }

  /** Link the just-placed tile for live param editing only if it has parameters beyond rotation (Source, Sink, Chamber). */
  private _linkTileIfHasParams(pos: GridPos): void {
    const state = this._cb.getState();
    if (state.paletteHasNonRotationParams()) {
      state.linkTile(pos);
    }
  }

  /**
   * Paint / erase immediately; snapshot recorded after the change so that
   * the placed/erased tile is captured in the new history entry.
   */
  private _placeOrClearTileOnClick(pos: GridPos): void {
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
  }

  /** Ctrl+click: force-overwrite; snapshot recorded after the change. */
  private _forceOverwriteOnCtrlClick(startPos: GridPos): void {
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
  private _autoReplaceOneWayTile(startPos: GridPos): void {
    const state = this._cb.getState();
    state.grid[startPos.row][startPos.col] = state.buildTileDef();
    this._playPlacementSfx(startPos);
    this._linkTileIfHasParams(startPos);
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
  }

  private _eraseAtRightClick(pos: GridPos): void {
    const state = this._cb.getState();
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

  /** Reads state.hover directly (not the engine's own hover tracking) — matches the pre-engine
   *  contract where onWheel() can be called standalone without a prior mousemove. */
  private _applyWheel(e: WheelEvent): void {
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

  private _isHoveringLinkedTile(hover: GridPos | null, linked: GridPos | null): boolean {
    return linked !== null && hover !== null && hover.row === linked.row && hover.col === linked.col;
  }

  private _onGestureEnd(_kind: 'paintDrag' | 'eraseDrag'): void {
    // 'eraseDrag' only reaches here when something was actually erased (GridGestureEngine
    // tracks that); 'paintDrag' always does, since starting one always paints the first cell.
    const state = this._cb.getState();
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
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
  private _playPlacementSfx(pos: GridPos): void {
    const sfx = this._resolvePlacementSfxId(pos);
    if (sfx !== null) sfxManager.play(sfx);
  }

  private _resolvePlacementSfxId(pos: GridPos): SfxId | null {
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
