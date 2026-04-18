/**
 * MapEditorBase – abstract base class shared by ChapterMapEditorSection and
 * CampaignMapEditorSection.
 *
 * Contains all logic that is identical (or near-identical) between the two
 * map-editor specialisations:
 *  • HistoryManager and undo/redo mechanics
 *  • Grid operations (slide, rotate, reflect, flip, resize)
 *  • Rotation helpers for pipe tiles, source/sink tiles and chamber tiles
 *  • Reachability helper (`computeEditorFilledCells` wrapper)
 *  • Sink error flash helper
 *  • Undo/redo button state sync
 *
 * Each concrete subclass must supply:
 *  • The chamber-content type it works with (`'level'` vs `'chapter'`)
 *  • HTML IDs for the undo/redo buttons
 *  • Implementations for snapshot recording, grid persistence, canvas
 *    rendering, canvas display-size update, and tile-params panel rebuild.
 */

import { TileDef, PipeShape, Direction, Rotation, LevelStyle } from '../types';
import { PIPE_SHAPES } from '../board';
import { sfxManager, SfxId } from '../sfxManager';
import { updateUndoRedoButtonPair, showTimedMessage } from '../uiHelpers';
import { HistoryManager } from './historyManager';
import { MapEditorGridState } from './mapEditorGridState';
import {
  computeEditorFilledCells,
  rotateConnectionsBy90,
  EditorPalette,
  TileParams,
  DEFAULT_PARAMS,
  EditorSnapshot,
} from './types';

export abstract class MapEditorBase {

  // ── Grid state (shared) ──────────────────────────────────────────────────
  protected readonly _gridState: MapEditorGridState;

  // ── Palette / selection (shared) ─────────────────────────────────────────
  protected _palette: EditorPalette = PipeShape.Source;
  protected _params: TileParams = { ...DEFAULT_PARAMS };

  // ── Canvas / render references (shared) ──────────────────────────────────
  protected _canvas: HTMLCanvasElement | null = null;
  protected _ctx: CanvasRenderingContext2D | null = null;
  protected _errorEl: HTMLDivElement | null = null;
  protected _mainLayout: HTMLDivElement = document.createElement('div');

  // ── Undo/redo history (shared) ────────────────────────────────────────────
  protected readonly _hist = new HistoryManager<EditorSnapshot>();

  constructor(defaultRows: number, defaultCols: number) {
    this._gridState = new MapEditorGridState(defaultRows, defaultCols);
  }

  // ── Abstract: subclasses must supply these ────────────────────────────────

  /** The chamber-content type placed by this editor (`'level'` or `'chapter'`). */
  protected abstract get _chamberContentType(): 'level' | 'chapter';

  /** HTML element ID of the undo button (used for enabled/disabled sync). */
  protected abstract get _undoBtnId(): string;

  /** HTML element ID of the redo button (used for enabled/disabled sync). */
  protected abstract get _redoBtnId(): string;

  /**
   * Record a snapshot of the current grid state into the history manager.
   * Subclasses call `_recordSnapshotBase` with the appropriate style value.
   */
  protected abstract _recordSnapshot(markChanged?: boolean): void;

  /** Persist the current grid state to the underlying data object. */
  protected abstract _saveGrid(): void;

  /** Re-render the editor canvas. */
  protected abstract _renderCanvas(): void;

  /** Recompute the canvas CSS display size to fit the available container. */
  protected abstract _updateCanvasDisplaySize(): void;

  /**
   * Rebuild and replace the tile-params panel element in the DOM.
   * Called after a connection-rotation so the panel reflects the new state.
   */
  protected abstract _rebuildTileParamsPanel(): void;

  /**
   * Apply a previously recorded snapshot to the grid (undo/redo target).
   * Subclasses call `_applySnapshotBase` with a callback that applies the
   * style to the relevant data object and rebuilds style-dependent panels.
   */
  protected abstract _applySnapshot(snap: EditorSnapshot): void;

  // ── Shared implementations ─────────────────────────────────────────────────

  /** Sync undo/redo button enabled state with current history availability. */
  protected _updateUndoRedoButtons(): void {
    updateUndoRedoButtonPair(this._undoBtnId, this._redoBtnId, this._hist.canUndo, this._hist.canRedo);
  }

  /** Compute which grid cells are water-reachable from the source tile. */
  protected _computeFilledCells(): Set<string> {
    return computeEditorFilledCells(this._gridState.grid, this._gridState.rows, this._gridState.cols);
  }

  /** Flash the error element below the canvas with the single-sink constraint message. */
  protected _showSinkError(): void {
    const el = this._errorEl;
    if (!el) return;
    showTimedMessage(el, 'Only one sink tile is allowed.');
  }

  /**
   * Record a snapshot using a concrete `EditorSnapshot` value.
   * Subclasses call this from their own `_recordSnapshot()` implementations.
   */
  protected _recordSnapshotBase(style: LevelStyle | undefined, markChanged = true): void {
    const snapshot: EditorSnapshot = {
      grid: this._gridState.grid,
      rows: this._gridState.rows,
      cols: this._gridState.cols,
      inventory: [],
      levelStyle: style,
    };
    this._hist.record(snapshot);
    if (markChanged) this._updateUndoRedoButtons();
  }

  /**
   * Apply a snapshot to the grid state, then save, resize canvas, sync
   * buttons, and re-render.
   *
   * @param snap         The snapshot to restore.
   * @param applyStyle   Callback that writes `snap.levelStyle` back to the
   *                     data object and rebuilds any style-dependent panels.
   */
  protected _applySnapshotBase(snap: EditorSnapshot, applyStyle: (style: LevelStyle | undefined) => void): void {
    this._gridState.grid = snap.grid as (TileDef | null)[][];
    this._gridState.rows = snap.rows;
    this._gridState.cols = snap.cols;
    applyStyle(snap.levelStyle);
    this._updateCanvasDisplaySize();
    this._saveGrid();
    this._updateUndoRedoButtons();
    this._renderCanvas();
  }

  /** Undo the last edit. */
  protected _doUndo(): void {
    const snap = this._hist.undo();
    if (!snap) return;
    sfxManager.play(SfxId.Undo);
    this._applySnapshot(snap);
  }

  /** Redo the last undone edit. */
  protected _doRedo(): void {
    const snap = this._hist.redo();
    if (!snap) return;
    sfxManager.play(SfxId.Redo);
    this._applySnapshot(snap);
  }

  // ── Shared rotation helpers ───────────────────────────────────────────────

  /** Rotate the pipe tile at `pos` clockwise or counterclockwise. */
  protected _rotateTileAt(pos: { row: number; col: number }, clockwise: boolean): void {
    const tile = this._gridState.grid[pos.row]?.[pos.col];
    if (!tile || !PIPE_SHAPES.has(tile.shape)) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
    const cur = (tile.rotation ?? 0) as Rotation;
    tile.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    if (this._palette === tile.shape) this._params.rotation = tile.rotation;
    this._recordSnapshot();
    this._saveGrid();
    this._renderCanvas();
  }

  /** Rotate the current palette shape clockwise or counterclockwise. */
  protected _rotatePalette(clockwise: boolean): void {
    if (!PIPE_SHAPES.has(this._palette as PipeShape)) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);
    const cur = this._params.rotation ?? 0;
    this._params.rotation = ((cur + (clockwise ? 90 : 270)) % 360) as Rotation;
    this._renderCanvas();
  }

  /**
   * Rotate the connections of a Source, Sink, or chamber tile at `pos`.
   * Only tiles of this editor's `_chamberContentType` qualify as chamber targets.
   */
  protected _rotateSourceSinkAt(pos: { row: number; col: number }, clockwise: boolean): void {
    const tile = this._gridState.grid[pos.row]?.[pos.col];
    if (!tile) return;
    const isConnectable =
      tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === this._chamberContentType);
    if (!isConnectable) return;
    sfxManager.play(clockwise ? SfxId.RotateCW : SfxId.RotateCCW);

    const newConns = rotateConnectionsBy90(tile.connections, clockwise);
    tile.connections = newConns;

    if (this._palette === tile.shape) {
      this._params.connections = {
        N: newConns.includes(Direction.North),
        E: newConns.includes(Direction.East),
        S: newConns.includes(Direction.South),
        W: newConns.includes(Direction.West),
      };
    }

    this._gridState.focusedTilePos = pos;
    this._rebuildTileParamsPanel();
    this._recordSnapshot();
    this._saveGrid();
    this._renderCanvas();
  }

  // ── Shared grid operations ────────────────────────────────────────────────

  protected _slideGrid(dir: 'N' | 'E' | 'S' | 'W'): void {
    this._gridState.slide(dir);
    this._recordSnapshot();
    sfxManager.play(SfxId.BoardSlide);
    this._renderCanvas();
  }

  protected _rotateGrid(clockwise: boolean): void {
    this._gridState.rotate(clockwise);
    this._recordSnapshot();
    sfxManager.play(SfxId.BoardSlide);
    this._updateCanvasDisplaySize();
    this._renderCanvas();
  }

  protected _reflectGrid(): void {
    this._gridState.reflect();
    this._recordSnapshot();
    sfxManager.play(SfxId.BoardSlide);
    this._updateCanvasDisplaySize();
    this._renderCanvas();
  }

  protected _flipGridHorizontal(): void {
    this._gridState.flipHorizontal();
    this._recordSnapshot();
    sfxManager.play(SfxId.BoardSlide);
    this._renderCanvas();
  }

  protected _flipGridVertical(): void {
    this._gridState.flipVertical();
    this._recordSnapshot();
    sfxManager.play(SfxId.BoardSlide);
    this._renderCanvas();
  }

  protected _resizeGrid(newRows: number, newCols: number): void {
    this._gridState.resize(newRows, newCols);
    this._recordSnapshot();
    this._updateCanvasDisplaySize();
    this._saveGrid();
    this._renderCanvas();
  }
}
