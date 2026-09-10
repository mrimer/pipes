/**
 * GridGestureEngine — shared canvas gesture state machine (paint-drag,
 * right-button erase-drag, tile-drag, contextmenu suppression, mouseleave
 * cancellation, attach/detach wiring) reused by the level editor and the
 * chapter map editor. Each editor supplies its own placement/erase/rotate
 * rules through GestureRules; the engine owns only the state transitions
 * that were previously duplicated between EditorInputHandler and
 * ChapterMapInput.
 */

import type { TileDef } from '../types';

export interface GridPos {
  row: number;
  col: number;
}

export interface DragInFlight {
  startPos: GridPos;
  tile: TileDef;
  currentPos: GridPos;
  moved: boolean;
}

export type LeftMouseDownAction =
  | { type: 'startPaintDrag' }
  | { type: 'startTileDrag'; tile: TileDef }
  | { type: 'immediate' };

export interface GestureRules {
  /** Convert a mouse event to a grid position, or null if outside the grid. */
  canvasPos(e: MouseEvent): GridPos | null;
  /** Decide what a left-button mousedown on `pos` should do. */
  decideLeftMouseDown(pos: GridPos, e: MouseEvent): LeftMouseDownAction;
  /** Paint one cell during an active paint-drag (also called for the initial cell). */
  paintCell(pos: GridPos): void;
  /** Erase one cell during an active erase-drag; return true if it changed anything. */
  eraseCell(pos: GridPos): boolean;
  /** Whether an in-flight tile-drag may move onto `pos`. */
  canDropTileAt(pos: GridPos, drag: DragInFlight): boolean;
  /** Tile-drag ended having moved: commit it. */
  onTileMoved(drag: DragInFlight): void;
  /** Tile-drag ended without moving: treat as a stationary click. */
  onTileClicked(drag: DragInFlight, e: MouseEvent): void;
  /** Rare contextmenu-fallback right-click with no preceding right-mousedown drag. */
  onRightClick(pos: GridPos): void;
  onWheel(e: WheelEvent, hoverPos: GridPos | null): void;
  /** A paint-drag or erase-drag gesture just ended (mouseup or mouseleave). */
  onGestureEnd(kind: 'paintDrag' | 'eraseDrag'): void;
  /** Hover position changed (every mousemove, and null on mouseleave) — sync into external state, tooltips, etc. */
  onHoverChanged(pos: GridPos | null): void;
}

export interface GridGestureCallbacks {
  renderCanvas(): void;
}

export class GridGestureEngine {
  private _canvas: HTMLCanvasElement | null = null;
  private _dragState: DragInFlight | null = null;
  private _hover: GridPos | null = null;
  private _paintDragActive = false;
  private _rightEraseDragActive = false;
  private _rightEraseChanged = false;
  private _suppressNextContextMenu = false;

  private readonly _mouseDownHandler = (e: MouseEvent) => this.onMouseDown(e);
  private readonly _mouseMoveHandler = (e: MouseEvent) => this.onMouseMove(e);
  private readonly _contextMenuHandler = (e: MouseEvent) => this._onContextMenu(e);
  private readonly _mouseLeaveHandler = () => this.onMouseLeave();
  private readonly _wheelHandler = (e: WheelEvent) => this.onWheel(e);
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    private readonly _rules: GestureRules,
    private readonly _cb: GridGestureCallbacks,
  ) {}

  get dragState(): DragInFlight | null {
    return this._dragState;
  }

  get hover(): GridPos | null {
    return this._hover;
  }

  get paintDragActive(): boolean {
    return this._paintDragActive;
  }

  get rightEraseDragActive(): boolean {
    return this._rightEraseDragActive;
  }

  get suppressNextContextMenu(): boolean {
    return this._suppressNextContextMenu;
  }

  /** Wires listeners onto `canvas`. Safe to call again with a different canvas
   *  (e.g. the DOM was rebuilt) — the previous canvas's listeners are removed first. */
  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this._canvas = canvas;
    canvas.addEventListener('mousedown', this._mouseDownHandler);
    canvas.addEventListener('mousemove', this._mouseMoveHandler);
    canvas.addEventListener('contextmenu', this._contextMenuHandler);
    canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
    canvas.addEventListener('wheel', this._wheelHandler, { passive: false });

    this._windowMouseUpHandler = (e: MouseEvent) => this.onMouseUp(e);
    window.addEventListener('mouseup', this._windowMouseUpHandler);
  }

  detach(): void {
    if (this._canvas) {
      this._canvas.removeEventListener('mousedown', this._mouseDownHandler);
      this._canvas.removeEventListener('mousemove', this._mouseMoveHandler);
      this._canvas.removeEventListener('contextmenu', this._contextMenuHandler);
      this._canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
      this._canvas.removeEventListener('wheel', this._wheelHandler);
      this._canvas = null;
    }
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
      this._windowMouseUpHandler = null;
    }
  }

  onMouseDown(e: MouseEvent): void {
    if (e.button === 2) { this._onRightButtonMouseDown(e); return; }
    if (e.button !== 0) return;
    const pos = this._rules.canvasPos(e);
    if (!pos) return;

    const action = this._rules.decideLeftMouseDown(pos, e);
    if (action.type === 'startPaintDrag') {
      this._paintDragActive = true;
      this._rules.paintCell(pos);
      this._cb.renderCanvas();
    } else if (action.type === 'startTileDrag') {
      this._dragState = { startPos: pos, tile: action.tile, currentPos: pos, moved: false };
      this._cb.renderCanvas();
    } else if (action.type === 'immediate') {
      this._cb.renderCanvas();
    }
  }

  private _onRightButtonMouseDown(e: MouseEvent): void {
    const pos = this._rules.canvasPos(e);
    if (!pos) return;
    this._rightEraseDragActive = true;
    this._rightEraseChanged = false;
    this._suppressNextContextMenu = false;
    if (this._rules.eraseCell(pos)) this._rightEraseChanged = true;
    this._cb.renderCanvas();
  }

  onMouseMove(e: MouseEvent): void {
    const pos = this._rules.canvasPos(e);
    this._hover = pos;
    this._rules.onHoverChanged(pos);

    if (this._paintDragActive && pos) {
      this._rules.paintCell(pos);
    } else if (this._rightEraseDragActive && pos) {
      if (this._rules.eraseCell(pos)) this._rightEraseChanged = true;
    } else if (this._dragState && pos) {
      this._handleTileDragMove(this._dragState, pos);
    }
    this._cb.renderCanvas();
  }

  private _handleTileDragMove(drag: DragInFlight, pos: GridPos): void {
    if (pos.row === drag.currentPos.row && pos.col === drag.currentPos.col) return;
    if (pos.row === drag.startPos.row && pos.col === drag.startPos.col) {
      // Moved back to start: cancel the move.
      drag.currentPos = pos;
      drag.moved = false;
      return;
    }
    if (this._rules.canDropTileAt(pos, drag)) {
      drag.currentPos = pos;
      drag.moved = true;
    }
    // Non-droppable cell (other than start): tile stays at currentPos.
  }

  private _onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (this._suppressNextContextMenu) {
      this._suppressNextContextMenu = false;
      return;
    }
    const pos = this._rules.canvasPos(e);
    if (!pos) return;
    this._rules.onRightClick(pos);
  }

  onMouseLeave(): void {
    this._hover = null;
    this._rules.onHoverChanged(null);
    // Cancel any active drag when the mouse leaves the canvas.
    if (this._dragState) {
      this._dragState = null;
    }
    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._rules.onGestureEnd('paintDrag');
    }
    if (this._rightEraseDragActive) {
      this._rightEraseDragActive = false;
      if (this._rightEraseChanged) {
        this._rules.onGestureEnd('eraseDrag');
      }
      this._rightEraseChanged = false;
    }
    this._cb.renderCanvas();
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    this._rules.onWheel(e, this._hover);
  }

  onMouseUp(e: MouseEvent): void {
    if (e.button === 2) { this._onRightButtonMouseUp(); return; }
    if (e.button !== 0) return;

    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._rules.onGestureEnd('paintDrag');
      this._cb.renderCanvas();
      return;
    }

    if (!this._dragState) return;
    const drag = this._dragState;
    this._dragState = null;
    if (drag.moved) {
      this._rules.onTileMoved(drag);
    } else {
      this._rules.onTileClicked(drag, e);
    }
    this._cb.renderCanvas();
  }

  private _onRightButtonMouseUp(): void {
    if (!this._rightEraseDragActive) return;
    this._rightEraseDragActive = false;
    this._suppressNextContextMenu = true;
    if (this._rightEraseChanged) {
      this._rules.onGestureEnd('eraseDrag');
    }
    this._rightEraseChanged = false;
    this._cb.renderCanvas();
  }
}
