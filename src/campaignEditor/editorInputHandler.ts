/**
 * EditorInputHandler – owns all canvas gesture state and event handlers for
 * the level editor canvas.  Follows the same attach/detach pattern as the
 * game's InputHandler.
 *
 * CampaignEditor wires callbacks via EditorInputCallbacks and calls
 * attach() / detach() as the editor screen is entered / exited.
 */

import { TileDef, PipeShape } from '../types';
import { PIPE_SHAPES } from '../board';
import { DragState } from './renderer';
import { REPEATABLE_EDITOR_TILES } from './types';
import { LevelEditorState } from './levelEditorState';

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
    this._canvas.addEventListener('mousedown',   (e) => this._onMouseDown(e));
    this._canvas.addEventListener('mousemove',   (e) => this._onMouseMove(e));
    this._canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this._suppressNextContextMenu) {
        this._suppressNextContextMenu = false;
        return;
      }
      this._onRightClick(e);
    });
    this._canvas.addEventListener('mouseleave',  () => this._onMouseLeave());
    this._canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    // Listen on window so mouseup is captured even when released outside the canvas.
    // Remove any previous handler first to avoid duplicates.
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
    }
    this._windowMouseUpHandler = (e: MouseEvent) => this._onMouseUp(e);
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
    state.grid[pos.row][pos.col] = state.buildTileDef();
    if (state.paletteHasNonRotationParams()) {
      state.linkTile(pos);
    }
  }

  _canvasPos(e: MouseEvent): { row: number; col: number } | null {
    const rect = this._canvas.getBoundingClientRect();
    const state = this._cb.getState();
    const col = Math.floor((e.clientX - rect.left) * state.cols / rect.width);
    const row = Math.floor((e.clientY - rect.top)  * state.rows / rect.height);
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return null;
    return { row, col };
  }

  // ─── Event handlers ───────────────────────────────────────────────────────────

  _onMouseDown(e: MouseEvent): void {
    const state = this._cb.getState();
    if (e.button === 2) {
      const pos = this._canvasPos(e);
      if (!pos) return;
      // Start a right-button erase-drag: erase the first cell immediately.
      this._rightEraseDragActive = true;
      this._suppressNextContextMenu = false;
      if (state.grid[pos.row][pos.col] !== null) {
        state.grid[pos.row][pos.col] = null;
        state.clearLinkAt(pos);
        this._cb.renderCanvas();
      }
      return;
    }
    if (e.button !== 0) return; // left button only
    const pos = this._canvasPos(e);
    if (!pos) return;

    const existingTile = state.grid[pos.row][pos.col];

    // Repeatable tile on an empty cell: start a paint-drag session.
    if (existingTile === null && REPEATABLE_EDITOR_TILES.has(state.palette)) {
      this._paintDragActive = true;
      this._paintCell(pos);
      this._cb.renderCanvas();
      return;
    }

    if (existingTile !== null && state.palette !== 'erase') {
      // Start a drag: track the tile but don't modify the grid yet
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._cb.renderCanvas();
    } else {
      // Guard: only one Source tile is allowed per level.
      if (state.palette === PipeShape.Source && state.hasSourceElsewhere()) {
        this._cb.showSourceError();
        return;
      }
      // Paint / erase immediately; snapshot recorded after the change so that
      // the placed/erased tile is captured in the new history entry.
      if (state.palette === 'erase') {
        state.grid[pos.row][pos.col] = null;
        // Clear the link if the erased tile was linked
        state.clearLinkAt(pos);
      } else {
        state.grid[pos.row][pos.col] = state.buildTileDef();
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

  _onMouseUp(e: MouseEvent): void {
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
      if (e.ctrlKey) {
        // Guard: only one Source tile is allowed per level.
        if (state.palette === PipeShape.Source && state.hasSourceElsewhere(startPos)) {
          this._cb.showSourceError();
          return;
        }
        // Ctrl+click: force-overwrite; snapshot recorded after the change.
        if (state.palette === 'erase') {
          state.grid[startPos.row][startPos.col] = null;
          // Clear the link if the erased tile was linked
          state.clearLinkAt(startPos);
        } else {
          state.grid[startPos.row][startPos.col] = state.buildTileDef();
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

  _onRightClick(e: MouseEvent): void {
    const state = this._cb.getState();
    const pos = this._canvasPos(e);
    if (!pos) return;
    state.recordSnapshot();
    this._cb.updateUndoRedoButtons();
    state.grid[pos.row][pos.col] = null;
    // Clear the link if the erased tile was linked
    state.clearLinkAt(pos);
    this._cb.renderCanvas();
  }

  _onMouseMove(e: MouseEvent): void {
    const state = this._cb.getState();
    const pos = this._canvasPos(e);
    state.hover = pos;

    if (this._paintDragActive && pos) {
      // Paint each new empty cell the cursor enters during a paint-drag.
      if (state.grid[pos.row][pos.col] === null) {
        this._paintCell(pos);
      }
    } else if (this._rightEraseDragActive && pos) {
      // Erase each non-empty cell the cursor enters during a right-erase-drag.
      if (state.grid[pos.row][pos.col] !== null) {
        state.grid[pos.row][pos.col] = null;
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

  _onWheel(e: WheelEvent): void {
    e.preventDefault();
    const state = this._cb.getState();
    const clockwise = e.deltaY > 0;
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

  _onMouseLeave(): void {
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
}
