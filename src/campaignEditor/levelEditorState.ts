/**
 * LevelEditorState – encapsulates all mutable level-editor data.
 *
 * Owns the grid, inventory, metadata, undo/redo history, linked-tile
 * tracking, and palette/param state.  CampaignEditor becomes an
 * orchestrator that wires UI events to state mutations and triggers
 * re-renders.
 */

import type { TileDef, InventoryItem, Rotation, LevelDef, LevelStyle, LocalizedText, ChamberContent } from '../types';
import { PipeShape, Direction } from '../types';
import { SPIN_CEMENT_SHAPES, isEmptyFloor, EMPTY_FLOOR_SHAPES } from '../board';
import type {
  EditorPalette,
  EditorSnapshot,
  TileParams} from './types';
import {
  createDefaultParams,
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

/**
 * Per-chamberContent field assignments for {@link LevelEditorState.buildTileDef}.
 * Each setter reads only from `p` and writes only the fields relevant to that content type.
 */
const CHAMBER_CONTENT_FIELD_SETTERS: Partial<Record<ChamberContent, (def: TileDef, p: TileParams) => void>> = {
  tank: (def, p) => { def.capacity = p.capacity; },
  dirt: (def, p) => { def.cost = p.cost; },
  heater: (def, p) => { def.temperature = p.temperature; },
  ice: (def, p) => { def.cost = p.cost; def.temperature = p.temperature; },
  pump: (def, p) => { def.pressure = p.pressure; },
  snow: (def, p) => { def.cost = p.cost; def.temperature = p.temperature; },
  sandstone: (def, p) => {
    def.cost = p.cost;
    def.temperature = p.temperature;
    if (p.hardness !== 0) def.hardness = p.hardness;
    if (p.shatter !== 0) def.shatter = p.shatter;
  },
  hot_plate: (def, p) => { def.cost = p.cost; def.temperature = p.temperature; },
  item: (def, p) => {
    // Item chambers always persist itemShape/itemCount (including defaults)
    // so placed rewards are explicit in exported JSON.
    def.itemShape = p.itemShape;
    def.itemCount = p.itemCount;
  },
  regulator: (def, p) => {
    def.cost = p.cost;
    def.regulatorStat = p.regulatorStat;
    def.regulatorOperator = p.regulatorOperator;
  },
};

export class LevelEditorState {
  // ── Grid & inventory ───────────────────────────────────────────────────────
  rows: number = 6;
  cols: number = 6;
  grid: (TileDef | null)[][] = [];
  inventory: InventoryItem[] = [];

  // ── Level metadata ─────────────────────────────────────────────────────────
  levelName: string | LocalizedText = 'New Level';
  levelNote: string | LocalizedText = '';
  levelHints: (string | LocalizedText)[] = [''];
  levelChallenge: boolean = false;
  /** Visual style for this level, controlling the default empty floor tile type. */
  levelStyle: LevelStyle | undefined = undefined;

  // ── Palette & params ───────────────────────────────────────────────────────
  palette: EditorPalette = PipeShape.Source;
  params: TileParams = createDefaultParams();

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
    this.grid = structuredClone(level.grid);
    this.inventory = structuredClone(level.inventory);
    this.palette = PipeShape.Source;
    this.params = createDefaultParams();
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
   * via structuredClone() so the stored copy is independent.
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
    if (this._linkedTilePos) {
      const { row, col } = this._linkedTilePos;
      if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) this.clearLink();
    }
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
    const simple = this._buildSimplePaletteTileDef(palette);
    if (simple) return simple;

    const isChm = isChamberPalette(palette);
    const effectiveShape = isChm ? PipeShape.Chamber : (palette as PipeShape);
    const p = this.params;

    if (effectiveShape === PipeShape.Cement) return this._buildCementTileDef(p);
    if (SPIN_CEMENT_SHAPES.has(effectiveShape)) return this._buildSpinCementTileDef(effectiveShape, p);

    const def = this._buildBaseTileDefForShape(effectiveShape, p);

    this._applyConnectionsToTileDef(def, effectiveShape, p);
    // firstConnections: only for Chamber tiles
    if (effectiveShape === PipeShape.Chamber) {
      this._applyFirstConnectionsToTileDef(def, p);
    }

    if (effectiveShape === PipeShape.Source) {
      this._applySourceFieldsToTileDef(def, p);
    } else if (isChm) {
      this._applyChamberContentFieldsToTileDef(def, chamberPaletteContent(palette), p);
    }

    return def;
  }

  /** Palette entries that map directly to a fixed shape with no other params, or null otherwise. */
  private _buildSimplePaletteTileDef(palette: EditorPalette): TileDef | null {
    if (palette === 'erase') return { shape: PipeShape.Empty };
    if (palette === PipeShape.EmptyFall) return { shape: PipeShape.EmptyFall };
    if (palette === PipeShape.EmptyDark) return { shape: PipeShape.EmptyDark };
    if (palette === PipeShape.EmptyWinter) return { shape: PipeShape.EmptyWinter };
    if (palette === PipeShape.EmptySpring) return { shape: PipeShape.EmptySpring };
    if (palette === PipeShape.Empty) return { shape: PipeShape.Empty };
    return null;
  }

  /** Cement: only dryingTime param; no rotation or connections. */
  private _buildCementTileDef(p: TileParams): TileDef {
    const def: TileDef = { shape: PipeShape.Cement };
    if (p.dryingTime !== 0) def.dryingTime = p.dryingTime;
    return def;
  }

  /** Spin-cement tiles: rotation + dryingTime; no connections. */
  private _buildSpinCementTileDef(effectiveShape: PipeShape, p: TileParams): TileDef {
    const def: TileDef = { shape: effectiveShape, rotation: p.rotation };
    if (p.dryingTime !== 0) def.dryingTime = p.dryingTime;
    return def;
  }

  /**
   * Build the shape/rotation base of a TileDef for shapes with no special-cased
   * params. Source, Sink, and Chamber are rotationally symmetric – omit rotation
   * from their defs. GoldSpace, Granite, Tree, and Sea are connectionless
   * background/block tiles with no rotation either. OneWay uses rotation to
   * encode direction, so it is NOT in the noRotation set.
   */
  private _buildBaseTileDefForShape(effectiveShape: PipeShape, p: TileParams): TileDef {
    const noRotation = new Set([
      PipeShape.Source, PipeShape.Sink, PipeShape.Chamber,
      PipeShape.GoldSpace, PipeShape.Granite,
      PipeShape.Tree, PipeShape.Tree2, PipeShape.Tree3, PipeShape.Tree4,
      PipeShape.Sea,
    ]).has(effectiveShape);
    return noRotation ? { shape: effectiveShape } : { shape: effectiveShape, rotation: p.rotation };
  }

  /** Convert a `{N,E,S,W}` boolean flag set into the `Direction[]` it represents. */
  private _directionsFromFlags(flags: { N: boolean; E: boolean; S: boolean; W: boolean }): Direction[] {
    const dirs: Direction[] = [];
    if (flags.N) dirs.push(Direction.North);
    if (flags.E) dirs.push(Direction.East);
    if (flags.S) dirs.push(Direction.South);
    if (flags.W) dirs.push(Direction.West);
    return dirs;
  }

  private _applyConnectionsToTileDef(def: TileDef, effectiveShape: PipeShape, p: TileParams): void {
    const connDirs = this._directionsFromFlags(p.connections);
    // Only set explicit connections for Source/Sink/Chamber (not all-4-default)
    const needsConn = (effectiveShape === PipeShape.Source || effectiveShape === PipeShape.Sink || effectiveShape === PipeShape.Chamber);
    if (needsConn && connDirs.length < 4) {
      def.connections = connDirs;
    }
  }

  private _applyFirstConnectionsToTileDef(def: TileDef, p: TileParams): void {
    const firstDirs = this._directionsFromFlags(p.firstConnections);
    if (firstDirs.length > 0) def.firstConnections = firstDirs;
  }

  private _applySourceFieldsToTileDef(def: TileDef, p: TileParams): void {
    def.capacity = p.capacity;
    if (p.temperature !== 0) def.temperature = p.temperature;
    if (p.pressure !== 0) def.pressure = p.pressure;
  }

  private _applyChamberContentFieldsToTileDef(def: TileDef, cc: ChamberContent, p: TileParams): void {
    def.chamberContent = cc;
    const setter = CHAMBER_CONTENT_FIELD_SETTERS[cc];
    if (setter) setter(def, p);
  }

  /** Populate palette and params from an existing TileDef. */
  selectTileFromDef(def: TileDef, pos?: { row: number; col: number }): void {
    if (isEmptyFloor(def.shape)) {
      this.palette = def.shape; // PipeShape.Empty, EmptyFall, EmptyDark, EmptyWinter, or EmptySpring
    } else if (def.shape === PipeShape.Chamber) {
      const cc = def.chamberContent ?? 'tank';
      this.palette = `chamber:${cc}`;
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
    this.params = createDefaultParams();
    this._copyBasicParamsFromDef(def);
    this._copyExtendedParamsFromDef(def);
    this._copyConnectionFlagsFromDef(def);
    this._copyFirstConnectionFlagsFromDef(def);
  }

  private _copyBasicParamsFromDef(def: TileDef): void {
    if (def.rotation !== undefined) this.params.rotation = def.rotation;
    if (def.capacity !== undefined) this.params.capacity = def.capacity;
    if (def.cost !== undefined) this.params.cost = def.cost;
    if (def.temperature !== undefined) this.params.temperature = def.temperature;
    if (def.pressure !== undefined) this.params.pressure = def.pressure;
    if (def.hardness !== undefined) this.params.hardness = def.hardness;
  }

  private _copyExtendedParamsFromDef(def: TileDef): void {
    if (def.shatter !== undefined) this.params.shatter = def.shatter;
    if (def.dryingTime !== undefined) this.params.dryingTime = def.dryingTime;
    if (def.chamberContent !== undefined) this.params.chamberContent = def.chamberContent;
    if (def.itemShape !== undefined) this.params.itemShape = def.itemShape;
    if (def.itemCount !== undefined) this.params.itemCount = def.itemCount;
    if (def.regulatorStat !== undefined) this.params.regulatorStat = def.regulatorStat;
    if (def.regulatorOperator !== undefined) this.params.regulatorOperator = def.regulatorOperator;
  }

  private _copyConnectionFlagsFromDef(def: TileDef): void {
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

  private _copyFirstConnectionFlagsFromDef(def: TileDef): void {
    if (def.firstConnections && def.firstConnections.length > 0) {
      this.params.firstConnections = {
        N: def.firstConnections.includes(Direction.North),
        E: def.firstConnections.includes(Direction.East),
        S: def.firstConnections.includes(Direction.South),
        W: def.firstConnections.includes(Direction.West),
      };
    } else {
      this.params.firstConnections = { N: false, E: false, S: false, W: false };
    }
  }

  /**
   * Rotate the currently selected palette item clockwise or counter-clockwise.
   * For Source/Sink/Chamber, rotates the connection set; for other tiles,
   * rotates the shape rotation param.
   */
  rotatePalette(clockwise: boolean): void {
    const p = this.palette;
    if (this._isNonRotatablePalette(p)) return;

    if (p === PipeShape.Source || p === PipeShape.Sink || isChamberPalette(p)) {
      this.params.connections = this._rotateConnectionFlags(this.params.connections, clockwise);
      if (isChamberPalette(p)) {
        this.params.firstConnections = this._rotateConnectionFlags(this.params.firstConnections, clockwise);
      }
    } else {
      this.params.rotation = this._rotateShapeRotation(this.params.rotation, clockwise);
    }
  }

  private _isNonRotatablePalette(p: EditorPalette): boolean {
    const nonRotatable = new Set<EditorPalette>([
      'erase', PipeShape.GoldSpace, PipeShape.Granite,
      PipeShape.Tree, PipeShape.Tree2, PipeShape.Tree3, PipeShape.Tree4,
      PipeShape.Sea,
      PipeShape.Empty, PipeShape.EmptyFall, PipeShape.EmptyDark, PipeShape.EmptyWinter, PipeShape.EmptySpring,
    ]);
    return nonRotatable.has(p);
  }

  /** Rotate a `{N,E,S,W}` connection-flag set by 90° in the given direction. */
  private _rotateConnectionFlags(
    flags: { N: boolean; E: boolean; S: boolean; W: boolean },
    clockwise: boolean,
  ): { N: boolean; E: boolean; S: boolean; W: boolean } {
    return clockwise
      ? { N: flags.W, E: flags.N, S: flags.E, W: flags.S }
      : { N: flags.E, E: flags.S, S: flags.W, W: flags.N };
  }

  private _rotateShapeRotation(current: Rotation, clockwise: boolean): Rotation {
    return (clockwise ? (current + 90) % 360 : (current + 270) % 360) as Rotation;
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
   * Returns null for grass (PipeShape.Empty), or a TileDef for Fall/Dark/Winter/Spring.
   */
  eraseFloorTileDefAt(row: number, col: number): TileDef | null {
    const counts = this._countNeighborFloorTypes(row, col);
    const best = this._bestFloorTypeByCounts(counts);
    return best === PipeShape.Empty ? null : { shape: best };
  }

  /** Count how many of the 4 cardinal neighbors of (row, col) have each empty-floor type. */
  private _countNeighborFloorTypes(row: number, col: number): Map<PipeShape, number> {
    const counts = new Map<PipeShape, number>([[PipeShape.Empty, 0], [PipeShape.EmptyFall, 0], [PipeShape.EmptyDark, 0], [PipeShape.EmptyWinter, 0], [PipeShape.EmptySpring, 0]]);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = row + dr, nc = col + dc;
      if (!this._isInBounds(nr, nc)) continue;
      const ft = this._floorTypeAt(nr, nc);
      if (ft !== null) counts.set(ft, (counts.get(ft) ?? 0) + 1);
    }
    return counts;
  }

  private _isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  /** The empty-floor type at (row, col), or null when occupied by a non-floor tile. */
  private _floorTypeAt(row: number, col: number): PipeShape | null {
    const def = this.grid[row]?.[col] ?? null;
    return def === null ? PipeShape.Empty : (isEmptyFloor(def.shape) ? def.shape : null);
  }

  /** The EMPTY_FLOOR_SHAPES entry with the highest count, tie-broken by EMPTY_FLOOR_SHAPES order. */
  private _bestFloorTypeByCounts(counts: Map<PipeShape, number>): PipeShape {
    let best: PipeShape = PipeShape.Empty;
    let bestCount = -1;
    for (const shape of EMPTY_FLOOR_SHAPES) {
      const cnt = counts.get(shape) ?? 0;
      if (cnt > bestCount) { bestCount = cnt; best = shape; }
    }
    return best;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Restore grid/inventory/dimensions from a history snapshot returned by undo/redo.
   * Direct assignment is intentional: HistoryManager.undo()/redo() return deep clones
   * so the snapshot is independent of the stored history entries.
   */
  private _restoreFromSnapshot(snapshot: EditorSnapshot): void {
    this.grid = snapshot.grid;
    this.rows = snapshot.rows;
    this.cols = snapshot.cols;
    this.inventory = snapshot.inventory;
    this.levelStyle = snapshot.levelStyle;
    this._linkedTilePos = null;
    this._linkedTileDirty = false;
  }
}
