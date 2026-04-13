/**
 * LevelEditorState – encapsulates all mutable level-editor data.
 *
 * Owns the grid, inventory, metadata, undo/redo history, linked-tile
 * tracking, and palette/param state.  CampaignEditor becomes an
 * orchestrator that wires UI events to state mutations and triggers
 * re-renders.
 */

import { TileDef, InventoryItem, PipeShape, Direction, Rotation, LevelDef, LevelStyle } from '../types';
import { SPIN_CEMENT_SHAPES, isEmptyFloor, EMPTY_FLOOR_SHAPES } from '../board';
import {
  EditorPalette,
  EditorSnapshot,
  TileParams,
  DEFAULT_PARAMS,
  ChamberPalette,
  isChamberPalette,
  chamberPaletteContent,
  rotateGridBy90,
  rotatePositionBy90,
  reflectGridAboutDiagonal,
  reflectPositionAboutDiagonal,
  flipGridHorizontal,
  flipGridVertical,
  flipPositionHorizontal,
  flipPositionVertical,
} from './types';
import { resizeGrid, slideGrid, hasShapeElsewhere } from './gridUtils';
import { HistoryManager } from './historyManager';

export class LevelEditorState {
  // ── Grid & inventory ───────────────────────────────────────────────────────
  rows: number = 6;
  cols: number = 6;
  grid: (TileDef | null)[][] = [];
  inventory: InventoryItem[] = [];

  // ── Level metadata ─────────────────────────────────────────────────────────
  levelName: string = 'New Level';
  levelNote: string = '';
  levelHints: string[] = [''];
  levelChallenge: boolean = false;
  /** Visual style for this level, controlling the default empty floor tile type. */
  levelStyle: LevelStyle | undefined = undefined;

  // ── Palette & params ───────────────────────────────────────────────────────
  palette: EditorPalette = PipeShape.Source;
  params: TileParams = { ...DEFAULT_PARAMS };

  // ── Hover ──────────────────────────────────────────────────────────────────
  hover: { row: number; col: number } | null = null;

  // ── History ────────────────────────────────────────────────────────────────
  private readonly _hist = new HistoryManager<EditorSnapshot>();

  // ── Linked tile ────────────────────────────────────────────────────────────
  private _linkedTilePos: { row: number; col: number } | null = null;
  private _linkedTileDirty: boolean = false;

  // ── Computed accessors ─────────────────────────────────────────────────────

  get canUndo(): boolean { return this._hist.canUndo; }
  get canRedo(): boolean { return this._hist.canRedo; }
  get hasUnsavedChanges(): boolean { return this._hist.hasUnsavedChanges; }
  get linkedTilePos(): { row: number; col: number } | null { return this._linkedTilePos; }
  get linkedTileDirty(): boolean { return this._linkedTileDirty; }

  // ── History inspection (used by tests and UI) ───────────────────────────────

  /** Total number of recorded history entries. */
  get historyLength(): number { return this._hist.snapshots.length; }
  /** Current position within the history stack. */
  get historyIndex(): number { return this._hist.currentIndex; }
  /** Return the history entry at the given absolute index. */
  historyEntryAt(index: number): EditorSnapshot { return this._hist.snapshots[index]; }

  // ── Initialisation ─────────────────────────────────────────────────────────

  /** Reset all state from a LevelDef and record the initial snapshot. */
  initFromLevel(level: LevelDef): void {
    this.levelName = level.name;
    this.levelNote = level.note ?? '';
    this.levelHints = level.hints?.length ? [...level.hints] : [''];
    this.levelChallenge = level.challenge ?? false;
    this.levelStyle = level.style;
    this.rows = level.rows;
    this.cols = level.cols;
    this.grid = JSON.parse(JSON.stringify(level.grid)) as (TileDef | null)[][];
    this.inventory = JSON.parse(JSON.stringify(level.inventory)) as InventoryItem[];
    this.palette = PipeShape.Source;
    this.params = { ...DEFAULT_PARAMS };
    this._hist.clear();
    this.hover = null;
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
    this.recordSnapshot();
  }

  // ── History ────────────────────────────────────────────────────────────────

  /**
   * Capture the current grid/inventory into the undo history.
   * Passing live references is intentional: HistoryManager.record() deep-clones
   * via JSON.parse(JSON.stringify()) so the stored copy is independent.
   */
  recordSnapshot(): void {
    const snapshot: EditorSnapshot = {
      grid: this.grid,
      rows: this.rows,
      cols: this.cols,
      inventory: this.inventory,
      levelStyle: this.levelStyle,
    };
    this._hist.record(snapshot);
  }

  /**
   * Undo the last action.  If a linked tile has unsaved edits, those are
   * committed first.  Returns true when a snapshot was restored, false when
   * already at the start of history.
   */
  undo(): boolean {
    if (this._linkedTileDirty) {
      this.recordSnapshot();
      this._linkedTileDirty = false;
    }
    const snapshot = this._hist.undo();
    if (!snapshot) return false;
    this._restoreFromSnapshot(snapshot);
    return true;
  }

  /**
   * Redo the previously undone action.  Returns true when a snapshot was
   * restored, false when already at the end of history.
   */
  redo(): boolean {
    const snapshot = this._hist.redo();
    if (!snapshot) return false;
    this._restoreFromSnapshot(snapshot);
    return true;
  }

  /** Mark the current history position as the last-saved point. */
  markSaved(): void {
    this._hist.markSaved();
  }

  // ── Linked tile ────────────────────────────────────────────────────────────

  /** Set the linked tile position and clear the dirty flag. */
  linkTile(pos: { row: number; col: number }): void {
    this._linkedTilePos = pos;
    this._linkedTileDirty = false;
  }

  /** Clear the linked tile (position and dirty flag). */
  clearLink(): void {
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
  }

  /** Clear the linked tile only if it is currently at `pos`. */
  clearLinkAt(pos: { row: number; col: number }): void {
    if (
      this._linkedTilePos &&
      this._linkedTilePos.row === pos.row &&
      this._linkedTilePos.col === pos.col
    ) {
      this._linkedTilePos = null;
      this._linkedTileDirty = false;
    }
  }

  /**
   * If a tile is currently linked, update it in the grid with the current
   * palette and params.
   *
   * A single undo snapshot is recorded on the first param change in a linked
   * session; subsequent changes overwrite the tile without additional snapshots.
   * Returns true when the grid was modified, false when out-of-bounds or unlinked.
   */
  applyParamsToLinkedTile(): boolean {
    if (!this._linkedTilePos) return false;
    const { row, col } = this._linkedTilePos;
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      this._linkedTilePos = null;
      this._linkedTileDirty = false;
      return false;
    }
    if (!this._linkedTileDirty) {
      this.recordSnapshot();
      this._linkedTileDirty = true;
    }
    this.grid[row][col] = this.buildTileDef();
    return true;
  }

  // ── Grid operations ────────────────────────────────────────────────────────

  /**
   * Resize the grid, preserving existing tiles where they fit.
   * Records an undo snapshot.
   */
  resize(newRows: number, newCols: number): void {
    this.grid = resizeGrid(this.grid, this.rows, this.cols, newRows, newCols);
    this.rows = newRows;
    this.cols = newCols;
    this.recordSnapshot();
  }

  /**
   * Slide all tiles one cell in the given direction.  Tiles that fall off the
   * edge are discarded.  Records an undo snapshot and clears the linked tile
   * (since positions have shifted).
   */
  slide(dir: 'N' | 'E' | 'S' | 'W'): void {
    this.grid = slideGrid(this.grid, this.rows, this.cols, dir);
    this.clearLink();
    this.recordSnapshot();
  }

  /**
   * Rotate the entire board 90° clockwise or counter-clockwise.
   * Swaps rows/cols dimensions, repositions all tiles, and rotates each
   * tile's connections/rotation to match the new orientation.
   * Updates the linked-tile position so params remain in sync.
   * Records an undo snapshot.
   */
  rotate(clockwise: boolean): void {
    const oldRows = this.rows;
    const oldCols = this.cols;

    const { newGrid, newRows, newCols } = rotateGridBy90(this.grid, oldRows, oldCols, clockwise);

    // Update linked tile position to follow the rotation.
    if (this._linkedTilePos) {
      this._linkedTilePos = rotatePositionBy90(this._linkedTilePos, oldRows, oldCols, clockwise);
    }

    this.rows = newRows;
    this.cols = newCols;
    this.grid = newGrid;

    // Sync params to the rotated linked tile if one is set.
    if (this._linkedTilePos) {
      const t = this.grid[this._linkedTilePos.row]?.[this._linkedTilePos.col];
      if (t) this.populateParamsFromDef(t);
    }

    this.recordSnapshot();
  }

  /**
   * Reflect the entire board about the main diagonal (x=y / transpose).
   * Swaps rows/cols dimensions, repositions all tiles, and reflects each
   * tile's connections/rotation to match the new orientation.
   * Updates the linked-tile position so params remain in sync.
   * Records an undo snapshot.
   */
  reflect(): void {
    const oldRows = this.rows;
    const oldCols = this.cols;

    const { newGrid, newRows, newCols } = reflectGridAboutDiagonal(this.grid, oldRows, oldCols);

    if (this._linkedTilePos) {
      this._linkedTilePos = reflectPositionAboutDiagonal(this._linkedTilePos);
    }

    this.rows = newRows;
    this.cols = newCols;
    this.grid = newGrid;

    if (this._linkedTilePos) {
      const t = this.grid[this._linkedTilePos.row]?.[this._linkedTilePos.col];
      if (t) this.populateParamsFromDef(t);
    }

    this.recordSnapshot();
  }

  /**
   * Flip the entire board horizontally (left–right reflection).
   * Mirrors column positions, updates each tile's connections/rotation
   * to match the new orientation, and updates the linked-tile position.
   * Records an undo snapshot.
   */
  flipHorizontal(): void {
    const { newGrid } = flipGridHorizontal(this.grid, this.rows, this.cols);

    if (this._linkedTilePos) {
      this._linkedTilePos = flipPositionHorizontal(this._linkedTilePos, this.cols);
    }

    this.grid = newGrid;

    if (this._linkedTilePos) {
      const t = this.grid[this._linkedTilePos.row]?.[this._linkedTilePos.col];
      if (t) this.populateParamsFromDef(t);
    }

    this.recordSnapshot();
  }

  /**
   * Flip the entire board vertically (top–bottom reflection).
   * Mirrors row positions, updates each tile's connections/rotation
   * to match the new orientation, and updates the linked-tile position.
   * Records an undo snapshot.
   */
  flipVertical(): void {
    const { newGrid } = flipGridVertical(this.grid, this.rows, this.cols);

    if (this._linkedTilePos) {
      this._linkedTilePos = flipPositionVertical(this._linkedTilePos, this.rows);
    }

    this.grid = newGrid;

    if (this._linkedTilePos) {
      const t = this.grid[this._linkedTilePos.row]?.[this._linkedTilePos.col];
      if (t) this.populateParamsFromDef(t);
    }

    this.recordSnapshot();
  }

  /** Build a TileDef from the current palette and params. */
  buildTileDef(): TileDef {
    const palette = this.palette;
    if (palette === 'erase') return { shape: PipeShape.Empty };
    if (palette === PipeShape.EmptyDirt) return { shape: PipeShape.EmptyDirt };
    if (palette === PipeShape.EmptyDark) return { shape: PipeShape.EmptyDark };
    if (palette === PipeShape.EmptyWinter) return { shape: PipeShape.EmptyWinter };
    if (palette === PipeShape.Empty) return { shape: PipeShape.Empty };

    const isChm = isChamberPalette(palette);
    const effectiveShape = isChm ? PipeShape.Chamber : (palette as PipeShape);
    const p = this.params;

    // Cement: only dryingTime param; no rotation or connections
    if (effectiveShape === PipeShape.Cement) {
      const def: TileDef = { shape: PipeShape.Cement };
      if (p.dryingTime !== 0) def.dryingTime = p.dryingTime;
      return def;
    }

    // Spin-cement tiles: rotation + dryingTime; no connections
    if (SPIN_CEMENT_SHAPES.has(effectiveShape)) {
      const def: TileDef = { shape: effectiveShape, rotation: p.rotation };
      if (p.dryingTime !== 0) def.dryingTime = p.dryingTime;
      return def;
    }

    // Source, Sink, and Chamber are rotationally symmetric – omit rotation from their defs.
    // GoldSpace, Granite, Tree, and Sea are connectionless background/block tiles with no rotation either.
    // OneWay uses rotation to encode direction, so it is NOT in the noRotation set.
    const noRotation = new Set([
      PipeShape.Source, PipeShape.Sink, PipeShape.Chamber,
      PipeShape.GoldSpace, PipeShape.Granite, PipeShape.Tree, PipeShape.Sea,
    ]).has(effectiveShape);
    const def: TileDef = noRotation ? { shape: effectiveShape } : { shape: effectiveShape, rotation: p.rotation };

    // Connections
    const connDirs: Direction[] = [];
    if (p.connections.N) connDirs.push(Direction.North);
    if (p.connections.E) connDirs.push(Direction.East);
    if (p.connections.S) connDirs.push(Direction.South);
    if (p.connections.W) connDirs.push(Direction.West);
    // Only set explicit connections for Source/Sink/Chamber (not all-4-default)
    const needsConn = (effectiveShape === PipeShape.Source || effectiveShape === PipeShape.Sink || effectiveShape === PipeShape.Chamber);
    if (needsConn && connDirs.length < 4) {
      def.connections = connDirs;
    }

    if (effectiveShape === PipeShape.Source) {
      def.capacity = p.capacity;
      if (p.temperature !== 0) def.temperature = p.temperature;
      if (p.pressure !== 0) def.pressure = p.pressure;
    } else if (isChm) {
      const cc = chamberPaletteContent(palette as ChamberPalette);
      def.chamberContent = cc;
      if (cc === 'tank') def.capacity = p.capacity;
      if (cc === 'dirt') def.cost = p.cost;
      if (cc === 'heater') def.temperature = p.temperature;
      if (cc === 'ice') { def.cost = p.cost; def.temperature = p.temperature; }
      if (cc === 'pump') def.pressure = p.pressure;
      if (cc === 'snow') { def.cost = p.cost; def.temperature = p.temperature; }
      if (cc === 'sandstone') { def.cost = p.cost; def.temperature = p.temperature; if (p.hardness !== 0) def.hardness = p.hardness; if (p.shatter !== 0) def.shatter = p.shatter; }
      if (cc === 'hot_plate') { def.cost = p.cost; def.temperature = p.temperature; }
      if (cc === 'item') { def.itemShape = p.itemShape; def.itemCount = p.itemCount; }
    }

    return def;
  }

  /** Populate palette and params from an existing TileDef. */
  selectTileFromDef(def: TileDef, pos?: { row: number; col: number }): void {
    if (isEmptyFloor(def.shape)) {
      this.palette = def.shape; // PipeShape.Empty, EmptyDirt, or EmptyDark
    } else if (def.shape === PipeShape.Chamber) {
      const cc = def.chamberContent ?? 'tank';
      this.palette = `chamber:${cc}` as ChamberPalette;
    } else {
      this.palette = def.shape;
    }
    // Only link the tile for live param editing if it has parameters beyond rotation.
    if (pos !== undefined && this.paletteHasNonRotationParams()) {
      this._linkedTilePos = pos;
    } else {
      this._linkedTilePos = null;
    }
    this._linkedTileDirty = false;
    this.populateParamsFromDef(def);
    // Note: _refreshPaletteUI() is the caller's responsibility (CampaignEditor).
  }

  /** Set params to match all relevant fields from a TileDef. */
  populateParamsFromDef(def: TileDef): void {
    this.params = { ...DEFAULT_PARAMS };
    if (def.rotation !== undefined) this.params.rotation = def.rotation;
    if (def.capacity !== undefined) this.params.capacity = def.capacity;
    if (def.cost !== undefined) this.params.cost = def.cost;
    if (def.temperature !== undefined) this.params.temperature = def.temperature;
    if (def.pressure !== undefined) this.params.pressure = def.pressure;
    if (def.hardness !== undefined) this.params.hardness = def.hardness;
    if (def.shatter !== undefined) this.params.shatter = def.shatter;
    if (def.dryingTime !== undefined) this.params.dryingTime = def.dryingTime;
    if (def.chamberContent !== undefined) this.params.chamberContent = def.chamberContent;
    if (def.itemShape !== undefined) this.params.itemShape = def.itemShape;
    if (def.itemCount !== undefined) this.params.itemCount = def.itemCount;
    if (def.connections) {
      this.params.connections = {
        N: def.connections.includes(Direction.North),
        E: def.connections.includes(Direction.East),
        S: def.connections.includes(Direction.South),
        W: def.connections.includes(Direction.West),
      };
    } else {
      this.params.connections = { N: true, E: true, S: true, W: true };
    }
  }

  /**
   * Rotate the currently selected palette item clockwise or counter-clockwise.
   * For Source/Sink/Chamber, rotates the connection set; for other tiles,
   * rotates the shape rotation param.
   */
  rotatePalette(clockwise: boolean): void {
    const p = this.palette;
    const nonRotatable = new Set<EditorPalette>([
      'erase', PipeShape.GoldSpace, PipeShape.Granite, PipeShape.Tree, PipeShape.Sea,
      PipeShape.Empty, PipeShape.EmptyDirt, PipeShape.EmptyDark, PipeShape.EmptyWinter,
    ]);
    if (nonRotatable.has(p)) return;

    if (p === PipeShape.Source || p === PipeShape.Sink || isChamberPalette(p)) {
      const c = this.params.connections;
      if (clockwise) {
        this.params.connections = { N: c.W, E: c.N, S: c.E, W: c.S };
      } else {
        this.params.connections = { N: c.E, E: c.S, S: c.W, W: c.N };
      }
    } else {
      const cur = this.params.rotation;
      if (clockwise) {
        this.params.rotation = ((cur + 90) % 360) as Rotation;
      } else {
        this.params.rotation = ((cur + 270) % 360) as Rotation;
      }
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Returns true when the given palette entry has editable parameters beyond
   * rotation alone.  Tiles with only rotation should not be auto-linked.
   */
  paletteHasNonRotationParams(): boolean {
    const p = this.palette;
    return p === PipeShape.Source || p === PipeShape.Sink || p === PipeShape.Cement || SPIN_CEMENT_SHAPES.has(p as PipeShape) || isChamberPalette(p);
  }

  /**
   * Returns true if a Source tile already exists anywhere on the grid except
   * at `exceptPos` (if given).  Used to enforce the one-Source constraint.
   */
  hasSourceElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this.grid, this.rows, this.cols, PipeShape.Source, exceptPos);
  }

  /**
   * Returns true if a Sink tile already exists anywhere on the grid except
   * at `exceptPos` (if given).  Used to enforce the one-Sink constraint.
   */
  hasSinkElsewhere(exceptPos?: { row: number; col: number }): boolean {
    return hasShapeElsewhere(this.grid, this.rows, this.cols, PipeShape.Sink, exceptPos);
  }

  /**
   * Compute the TileDef to restore when erasing a tile at (row, col).
   * Uses majority-adjacent algorithm: the most common empty floor type among
   * cardinal neighbors wins; tie-break by EMPTY_FLOOR_SHAPES order.
   * Returns null for grass (PipeShape.Empty), or a TileDef for Dirt/Dark/Winter.
   */
  eraseFloorTileDefAt(row: number, col: number): TileDef | null {
    const counts = new Map<PipeShape, number>([[PipeShape.Empty, 0], [PipeShape.EmptyDirt, 0], [PipeShape.EmptyDark, 0], [PipeShape.EmptyWinter, 0]]);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
      const def = this.grid[nr]?.[nc] ?? null;
      const ft = def === null ? PipeShape.Empty : (isEmptyFloor(def.shape) ? def.shape : null);
      if (ft !== null) counts.set(ft, (counts.get(ft) ?? 0) + 1);
    }
    let best: PipeShape = PipeShape.Empty;
    let bestCount = -1;
    for (const shape of EMPTY_FLOOR_SHAPES) {
      const cnt = counts.get(shape) ?? 0;
      if (cnt > bestCount) { bestCount = cnt; best = shape; }
    }
    return best === PipeShape.Empty ? null : { shape: best };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Restore grid/inventory/dimensions from a history snapshot returned by undo/redo.
   * Direct assignment is intentional: HistoryManager.undo()/redo() return deep clones
   * so the snapshot is independent of the stored history entries.
   */
  private _restoreFromSnapshot(snapshot: EditorSnapshot): void {
    this.grid = snapshot.grid as (TileDef | null)[][];
    this.rows = snapshot.rows;
    this.cols = snapshot.cols;
    this.inventory = snapshot.inventory as InventoryItem[];
    this.levelStyle = snapshot.levelStyle;
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
  }
}

