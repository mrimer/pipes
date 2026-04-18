/**
 * EditorInputHandler – owns all canvas gesture state and event handlers for
 * the level editor canvas.  Follows the same attach/detach pattern as the
 * game's InputHandler.
 *
 * CampaignEditor wires callbacks via EditorInputCallbacks and calls
 * attach() / detach() as the editor screen is entered / exited.
 */

import { TileDef, PipeShape, Rotation } from '../types';
import { PIPE_SHAPES, LEAKY_PIPE_SHAPES, GOLD_PIPE_SHAPES, SPIN_CEMENT_SHAPES, isEmptyFloor } from '../board';
import { DragState } from './renderer';
import { REPEATABLE_EDITOR_TILES, isPipePlacementPalette } from './types';
import { LevelEditorState } from './levelEditorState';
import { sfxManager, SfxId } from '../sfxManager';
import { isTileConnectedToSource } from '../tile';
import { canvasPos as computeCanvasPos } from './canvasUtils';

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
  private _suppressNextContextMenu = false;
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;

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
    this._canvas.addEventListener('mousedown',   (e) => this.onMouseDown(e));
    this._canvas.addEventListener('mousemove',   (e) => this.onMouseMove(e));
    this._canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this._suppressNextContextMenu) {
        this._suppressNextContextMenu = false;
        return;
      }
      this.onRightClick(e);
    });
    this._canvas.addEventListener('mouseleave',  () => this.onMouseLeave());
    this._canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Listen on window so mouseup is captured even when released outside the canvas.
    // Remove any previous handler first to avoid duplicates.
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
    }
    this._windowMouseUpHandler = (e: MouseEvent) => this.onMouseUp(e);
    window.addEventListener('mouseup', this._windowMouseUpHandler);
  }

  /** Remove the window mouseup listener. Call when leaving the level editor. */
  detach(): void {
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
      this._windowMouseUpHandler = null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private _paintCell(pos: { row: number; col: number }): void {
    const state = this._cb.getState();
    // Empty-Grass palette: clear to null (grass)
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
    const state = this._cb.getState();
    if (e.button === 2) {
      const pos = this.canvasPos(e);
      if (!pos) return;
      // Start a right-button erase-drag: erase the first cell immediately.
      this._rightEraseDragActive = true;
      this._suppressNextContextMenu = false;
      if (state.grid[pos.row][pos.col] !== null) {
        state.grid[pos.row][pos.col] = state.eraseFloorTileDefAt(pos.row, pos.col);
        state.clearLinkAt(pos);
        sfxManager.play(SfxId.Delete);
        this._cb.renderCanvas();
      }
      return;
    }
    if (e.button !== 0) return; // left button only
    const pos = this.canvasPos(e);
    if (!pos) return;

    const existingTile = state.grid[pos.row][pos.col];
    const existingIsEmpty = existingTile === null || (existingTile !== null && isEmptyFloor(existingTile.shape));

    // Repeatable tile on an empty cell: start a paint-drag session.
    if (existingIsEmpty && REPEATABLE_EDITOR_TILES.has(state.palette)) {
      this._paintDragActive = true;
      this._paintCell(pos);
      this._playPlacementSfx(pos);
      this._cb.renderCanvas();
      return;
    }

    if (existingTile !== null && !existingIsEmpty && state.palette !== 'erase') {
      // Start a drag: track the tile but don't modify the grid yet
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._cb.renderCanvas();
    } else {
      // Guard: only one Source tile is allowed per level.
      if (state.palette === PipeShape.Source && state.hasSourceElsewhere()) {
        this._cb.showSourceError();
        return;
      }
      // Guard: only one Sink tile is allowed per level.
      if (state.palette === PipeShape.Sink && state.hasSinkElsewhere()) {
        this._cb.showSinkError();
        return;
      }
      // Paint / erase immediately; snapshot recorded after the change so that
      // the placed/erased tile is captured in the new history entry.
      if (state.palette === 'erase') {
        if (state.grid[pos.row][pos.col] !== null) sfxManager.play(SfxId.Delete);
        state.grid[pos.row][pos.col] = state.eraseFloorTileDefAt(pos.row, pos.col);
        // Clear the link if the erased tile was linked
        state.clearLinkAt(pos);
      } else if (state.palette === PipeShape.Empty) {
        // Empty-Grass palette: clear to floor-type-aware null
        if (state.grid[pos.row][pos.col] !== null) sfxManager.play(SfxId.Delete);
        state.grid[pos.row][pos.col] = null;
        state.clearLinkAt(pos);
      } else {
        state.grid[pos.row][pos.col] = state.buildTileDef();
        this._playPlacementSfx(pos);
        // Only link the newly placed tile for live param editing if it has
        // parameters beyond rotation (Source, Sink, Chamber).
        if (state.paletteHasNonRotationParams()) {
          state.linkTile(pos);
        }
      }
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
      this._cb.renderCanvas();
    }
  }

  onMouseUp(e: MouseEvent): void {
    const state = this._cb.getState();
    if (e.button === 2) {
      if (!this._rightEraseDragActive) return;
      // End right-erase-drag: record the undo snapshot now (PR #101 pattern).
      this._rightEraseDragActive = false;
      this._suppressNextContextMenu = true;
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
      this._cb.renderCanvas();
      return;
    }
    if (e.button !== 0) return; // left button only

    // End paint-drag session.
    if (this._paintDragActive) {
      this._paintDragActive = false;
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
      this._cb.renderCanvas();
      return;
    }

    if (!this._dragState) return;

    const { startPos, tile, currentPos, moved } = this._dragState;
    this._dragState = null;

    if (moved) {
      // Commit the drag: move tile from startPos to currentPos; snapshot after.
      state.grid[startPos.row][startPos.col] = null;
      state.grid[currentPos.row][currentPos.col] = tile;
      // Only link the moved tile if it has parameters beyond rotation.
      if (tile.shape === PipeShape.Source || tile.shape === PipeShape.Sink || tile.shape === PipeShape.Chamber) {
        state.linkTile(currentPos);
      }
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
    } else {
      // It was a click on a non-empty tile (no movement occurred)
      if (!e.ctrlKey && PIPE_SHAPES.has(tile.shape)) {
        // Click on a placed pipe tile: rotate it (shift = counter-clockwise)
        const clockwise = !e.shiftKey;
        sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
        const cur = (tile.rotation ?? 0) as Rotation;
        tile.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
        // Keep palette ghost in sync when the palette matches the rotated tile's shape.
        if (state.palette === tile.shape) {
          state.params.rotation = tile.rotation;
        }
        state.recordSnapshot();
        this._cb.updateUndoRedoButtons();
      } else if (e.ctrlKey) {
        // Guard: only one Source tile is allowed per level.
        if (state.palette === PipeShape.Source && state.hasSourceElsewhere(startPos)) {
          this._cb.showSourceError();
          return;
        }
        // Guard: only one Sink tile is allowed per level.
        if (state.palette === PipeShape.Sink && state.hasSinkElsewhere(startPos)) {
          this._cb.showSinkError();
          return;
        }
        // Ctrl+click: force-overwrite; snapshot recorded after the change.
        if (state.palette === 'erase') {
          sfxManager.play(SfxId.Delete);
          state.grid[startPos.row][startPos.col] = state.eraseFloorTileDefAt(startPos.row, startPos.col);
          // Clear the link if the erased tile was linked
          state.clearLinkAt(startPos);
        } else {
          state.grid[startPos.row][startPos.col] = state.buildTileDef();
          this._playPlacementSfx(startPos);
          // Only link the overwritten tile if it has parameters beyond rotation.
          if (state.paletteHasNonRotationParams()) {
            state.linkTile(startPos);
          }
        }
        state.recordSnapshot();
        this._cb.updateUndoRedoButtons();
      } else if (
        state.palette !== 'erase' &&
        (
          (PIPE_SHAPES.has(state.palette as PipeShape) && PIPE_SHAPES.has(tile.shape)) ||
          (state.palette === PipeShape.OneWay && tile.shape === PipeShape.OneWay)
        )
      ) {
        // Both palette and tile are pipe shapes: auto-replace; snapshot after.
        state.grid[startPos.row][startPos.col] = state.buildTileDef();
        this._playPlacementSfx(startPos);
        // Only link if the new tile has parameters beyond rotation.
        if (state.paletteHasNonRotationParams()) {
          state.linkTile(startPos);
        }
        state.recordSnapshot();
        this._cb.updateUndoRedoButtons();
      } else {
        // Select the clicked tile in the palette and populate Tile Params
        state.selectTileFromDef(tile, startPos);
        this._cb.refreshPaletteUI();
      }
    }
    this._cb.renderCanvas();
  }

  onRightClick(e: MouseEvent): void {
    const state = this._cb.getState();
    const pos = this.canvasPos(e);
    if (!pos) return;
    if (state.grid[pos.row][pos.col] !== null) sfxManager.play(SfxId.Delete);
    state.grid[pos.row][pos.col] = state.eraseFloorTileDefAt(pos.row, pos.col);
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
      // Paint each empty (or empty-floor-typed) cell the cursor enters during a paint-drag.
      const cur = state.grid[pos.row][pos.col];
      if (cur === null || (cur !== null && isEmptyFloor(cur.shape))) {
        this._paintCell(pos);
      }
    } else if (this._rightEraseDragActive && pos) {
      // Erase each non-empty cell the cursor enters during a right-erase-drag.
      if (state.grid[pos.row][pos.col] !== null) {
        state.grid[pos.row][pos.col] = state.eraseFloorTileDefAt(pos.row, pos.col);
        state.clearLinkAt(pos);
      }
    } else if (this._dragState && pos) {
      const { startPos, currentPos } = this._dragState;
      const atCurrent = pos.row === currentPos.row && pos.col === currentPos.col;
      if (!atCurrent) {
        if (pos.row === startPos.row && pos.col === startPos.col) {
          // Moved back to start: cancel the move
          this._dragState.currentPos = pos;
          this._dragState.moved = false;
        } else if (state.grid[pos.row][pos.col] === null) {
          // Empty cell: move tile here
          this._dragState.currentPos = pos;
          this._dragState.moved = true;
        }
        // Non-empty cell (other than start): tile stays at currentPos
      }
    }

    this._cb.renderCanvas();
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
    const hover = state.hover;
    const linked = state.linkedTilePos;
    if (linked && hover && hover.row === linked.row && hover.col === linked.col) {
      state.applyParamsToLinkedTile();
      this._cb.updateUndoRedoButtons();
    }
    this._cb.refreshPaletteUI();
    this._cb.renderCanvas();
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
      state.recordSnapshot();
      this._cb.updateUndoRedoButtons();
    }
    this._cb.renderCanvas();
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
    const state = this._cb.getState();
    const palette = state.palette;
    if (LEAKY_PIPE_SHAPES.has(palette as PipeShape)) {
      sfxManager.play(SfxId.Leak);
    } else if (palette === PipeShape.Cement || SPIN_CEMENT_SHAPES.has(palette as PipeShape)) {
      sfxManager.play(SfxId.Cement);
    } else if (palette === 'chamber:pump') {
      sfxManager.play(SfxId.Pump);
    } else if (palette === 'chamber:star') {
      sfxManager.play(SfxId.Star);
    } else if (palette === 'chamber:heater') {
      sfxManager.play(SfxId.Heater);
    } else if (palette === 'chamber:hot_plate') {
      sfxManager.play(SfxId.Sizzle);
    } else if (palette === 'chamber:ice') {
      sfxManager.play(SfxId.Ice1);
    } else if (palette === 'chamber:snow') {
      sfxManager.play(SfxId.Snow1);
    } else if (palette === 'chamber:tank') {
      sfxManager.play(SfxId.Tank);
    } else if (palette === 'chamber:dirt') {
      const cost = state.params.cost;
      if (cost < 5) sfxManager.play(SfxId.Dirt1);
      else if (cost < 10) sfxManager.play(SfxId.Dirt2);
      else sfxManager.play(SfxId.Dirt3);
    } else if (palette === 'chamber:sandstone') {
      const cost = state.params.cost;
      if (cost < 5) sfxManager.play(SfxId.Sandstone1);
      else if (cost < 10) sfxManager.play(SfxId.Sandstone2);
      else sfxManager.play(SfxId.Sandstone3);
    } else if (palette === 'chamber:item' && state.params.itemShape !== null && state.params.itemShape !== undefined && GOLD_PIPE_SHAPES.has(state.params.itemShape)) {
      sfxManager.play(SfxId.Gold);
    } else if (palette === 'chamber:item' && state.params.itemShape !== null && state.params.itemShape !== undefined && state.params.itemCount > 0) {
      sfxManager.play(SfxId.Pickup);
    } else if (isPipePlacementPalette(palette)) {
      const isConnected = isTileConnectedToSource(state.grid, pos);
      sfxManager.play(isConnected ? SfxId.PipeConnected : SfxId.PipePlacement);
    }
  }
}
