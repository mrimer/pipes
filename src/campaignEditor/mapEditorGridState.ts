/**
 * MapEditorGridState – mutable grid state container shared between the
 * campaign map editor and the chapter map editor.
 *
 * Holds the working grid data (rows, cols, grid, focusedTilePos) and provides
 * pure transform operations (slide, rotate, reflect, flip, resize) that both
 * editors delegate to, eliminating duplicated transform logic.
 */

import { TileDef, PipeShape, Direction } from '../types';
import {
  rotateGridBy90,
  rotatePositionBy90,
  reflectGridAboutDiagonal,
  reflectPositionAboutDiagonal,
  flipGridHorizontal,
  flipGridVertical,
  flipPositionHorizontal,
  flipPositionVertical,
} from './types';
import { resizeGrid, slideGrid } from './gridUtils';

export class MapEditorGridState {
  rows: number;
  cols: number;
  grid: (TileDef | null)[][];
  focusedTilePos: { row: number; col: number } | null = null;

  private readonly _defaultRows: number;
  private readonly _defaultCols: number;

  constructor(defaultRows: number, defaultCols: number) {
    this._defaultRows = defaultRows;
    this._defaultCols = defaultCols;
    this.rows = defaultRows;
    this.cols = defaultCols;
    this.grid = [];
  }

  /**
   * Initialise from saved entity data, or create a default grid with a Source
   * at [1, 0] (connection East) and a Sink at [1, last-col] (connection West).
   * Always resets `focusedTilePos` to null.
   */
  init(
    savedRows: number | undefined,
    savedCols: number | undefined,
    savedGrid: (TileDef | null)[][] | undefined,
  ): void {
    if (savedRows && savedCols && savedGrid) {
      this.rows = savedRows;
      this.cols = savedCols;
      this.grid = structuredClone(savedGrid);
    } else {
      this.rows = this._defaultRows;
      this.cols = this._defaultCols;
      this.grid = Array.from(
        { length: this.rows },
        () => Array(this.cols).fill(null) as (TileDef | null)[],
      );
      this.grid[1][0] = { shape: PipeShape.Source, connections: [Direction.East] };
      this.grid[1][this.cols - 1] = { shape: PipeShape.Sink, connections: [Direction.West] };
    }
    this.focusedTilePos = null;
  }

  /** Slide all tiles one cell in `dir`, discarding tiles that fall off the edge. */
  slide(dir: 'N' | 'E' | 'S' | 'W'): void {
    this.grid = slideGrid(this.grid, this.rows, this.cols, dir);
  }

  /** Rotate 90° CW or CCW; swaps rows/cols and updates the focused tile position. */
  rotate(clockwise: boolean): void {
    const oldRows = this.rows;
    const oldCols = this.cols;
    const { newGrid, newRows, newCols } = rotateGridBy90(this.grid, oldRows, oldCols, clockwise);
    this.rows = newRows;
    this.cols = newCols;
    this.grid = newGrid;
    if (this.focusedTilePos) {
      this.focusedTilePos = rotatePositionBy90(this.focusedTilePos, oldRows, oldCols, clockwise);
    }
  }

  /** Reflect about the main diagonal; swaps rows/cols and updates the focused tile position. */
  reflect(): void {
    const oldRows = this.rows;
    const oldCols = this.cols;
    const { newGrid, newRows, newCols } = reflectGridAboutDiagonal(this.grid, oldRows, oldCols);
    this.rows = newRows;
    this.cols = newCols;
    this.grid = newGrid;
    if (this.focusedTilePos) {
      this.focusedTilePos = reflectPositionAboutDiagonal(this.focusedTilePos);
    }
  }

  /** Flip horizontally (mirror column positions); updates the focused tile position. */
  flipHorizontal(): void {
    const { newGrid } = flipGridHorizontal(this.grid, this.rows, this.cols);
    this.grid = newGrid;
    if (this.focusedTilePos) {
      this.focusedTilePos = flipPositionHorizontal(this.focusedTilePos, this.cols);
    }
  }

  /** Flip vertically (mirror row positions); updates the focused tile position. */
  flipVertical(): void {
    const { newGrid } = flipGridVertical(this.grid, this.rows, this.cols);
    this.grid = newGrid;
    if (this.focusedTilePos) {
      this.focusedTilePos = flipPositionVertical(this.focusedTilePos, this.rows);
    }
  }

  /** Resize to new dimensions, preserving overlapping tiles. */
  resize(newRows: number, newCols: number): void {
    this.grid = resizeGrid(this.grid, this.rows, this.cols, newRows, newCols);
    this.rows = newRows;
    this.cols = newCols;
  }

  /** Clear the focused tile position if it matches the given position. */
  clearFocusIfAt(pos: { row: number; col: number }): void {
    if (this.focusedTilePos?.row === pos.row && this.focusedTilePos?.col === pos.col) {
      this.focusedTilePos = null;
    }
  }
}
