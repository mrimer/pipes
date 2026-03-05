import { Tile, oppositeDirection } from './tile';
import { Direction, GridPos, InventoryItem, LevelDef, PipeShape, Rotation } from './types';

/** Neighbour offsets keyed by direction. */
const NEIGHBOUR_DELTA: Record<Direction, GridPos> = {
  [Direction.North]: { row: -1, col:  0 },
  [Direction.East]:  { row:  0, col:  1 },
  [Direction.South]: { row:  1, col:  0 },
  [Direction.West]:  { row:  0, col: -1 },
};

/** Shapes that consume one water unit when filled (not source/sink/tank). */
export const PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.Straight,
  PipeShape.Elbow,
  PipeShape.Tee,
  PipeShape.Cross,
  PipeShape.GoldStraight,
  PipeShape.GoldElbow,
  PipeShape.GoldTee,
  PipeShape.GoldCross,
]);

/** Gold pipe shapes – may only be placed on gold spaces. */
export const GOLD_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.GoldStraight,
  PipeShape.GoldElbow,
  PipeShape.GoldTee,
  PipeShape.GoldCross,
]);

/** Snapshot of the board state (grid + inventory) used for undo/redo. */
type Snapshot = { grid: Tile[][]; inventory: InventoryItem[] };

/**
 * The game board – a 2-D grid of {@link Tile} objects.
 * Contains all game logic for path-finding, water tracking and win detection.
 */
export class Board {
  readonly rows: number;
  readonly cols: number;
  readonly grid: Tile[][];
  source: GridPos;
  sink: GridPos;

  /** Initial water capacity of the source tile. */
  sourceCapacity: number;

  /** Mutable inventory of pipe pieces the player can place. */
  inventory: InventoryItem[];

  /**
   * Set of "row,col" keys that are gold space cells.
   * Populated from the level definition; never changes during play.
   */
  goldSpaces: Set<string>;

  /**
   * Set to a human-readable reason after any failed reclaim attempt, so callers
   * can display an appropriate error message.  Cleared on each new attempt.
   */
  lastError: string | null = null;

  /** Full move history for undo/redo support. history[0] is the initial state. */
  private _history: Snapshot[] = [];
  /** Index of the current state in _history (-1 if history is uninitialised). */
  private _historyIndex: number = -1;

  /**
   * @param rows - Number of rows.
   * @param cols - Number of columns.
   * @param level - Optional level definition.  If omitted a random grid is built.
   */
  constructor(rows: number, cols: number, level?: LevelDef) {
    this.rows = rows;
    this.cols = cols;
    this.source = { row: 0, col: 0 };
    this.sink = { row: rows - 1, col: cols - 1 };
    this.sourceCapacity = 0;
    this.inventory = [];
    this.goldSpaces = new Set();

    if (level) {
      this.grid = this._emptyGrid();
      this._initFromLevel(level);
    } else {
      this.grid = this._buildGrid();
    }
  }

  // ─── Level initialisation ──────────────────────────────────────────────────

  /** Initialise the board from a level definition. */
  private _initFromLevel(level: LevelDef): void {
    this.sourceCapacity = level.sourceCapacity;
    this.inventory = level.inventory.map((item) => ({ ...item }));

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const def = level.grid[r]?.[c] ?? null;
        if (def === null) {
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else if (def.shape === PipeShape.GoldSpace) {
          // Gold spaces are tracked separately; the cell behaves like Empty
          this.goldSpaces.add(`${r},${c}`);
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else {
          const rot = (def.rotation ?? 0) as Rotation;
          const itemShape = def.itemShape ?? null;
          const itemCount = def.itemCount ?? 1;
          const customConnections = def.connections ? new Set(def.connections) : null;
          const chamberContent = def.chamberContent ?? null;
          this.grid[r][c] = new Tile(def.shape, rot, def.isFixed ?? false, def.capacity ?? 0, def.dirtCost ?? 0, itemShape, itemCount, customConnections, chamberContent);
          if (def.shape === PipeShape.Source) {
            this.source = { row: r, col: c };
          } else if (def.shape === PipeShape.Sink) {
            this.sink = { row: r, col: c };
          }
        }
      }
    }
  }

  // ─── Undo / redo support ───────────────────────────────────────────────────

  /**
   * Initialise the move history with the current board state as the starting point.
   * Must be called once after a level is fully set up (e.g. at the start of play).
   * Calling this resets any existing history.
   */
  initHistory(): void {
    this._history = [this._captureSnapshot()];
    this._historyIndex = 0;
  }

  /**
   * Record the current board state as the next move in the history.
   * Call this AFTER each successful player action (place, rotate).
   *
   * If the player is currently at a position earlier than the end of the history
   * (i.e. some moves were undone), the behaviour is:
   * - If the new state matches the next state in the existing history, advance
   *   the index without modifying the history (the redo chain is preserved).
   * - Otherwise, truncate all future states and append the new state.
   */
  recordMove(): void {
    if (this._historyIndex < this._history.length - 1) {
      // There are "future" (undone) states.
      // Compare the live board to the next entry WITHOUT allocating a new snapshot first.
      if (this._liveBoardMatchesSnapshot(this._history[this._historyIndex + 1])) {
        // Exact same result as the next history state – advance the pointer, preserve the redo chain.
        this._historyIndex++;
        return;
      }
      // Different – discard the future branch before appending the new state.
      this._history = this._history.slice(0, this._historyIndex + 1);
    }

    this._history.push(this._captureSnapshot());
    this._historyIndex++;
  }

  /** Returns true if there is a previous state to undo to. */
  canUndo(): boolean {
    return this._historyIndex > 0;
  }

  /**
   * Restore the board to the previous state in the history.
   * @returns true if the undo was applied; false if there was no previous state.
   */
  undoMove(): boolean {
    if (!this.canUndo()) return false;
    this._historyIndex--;
    this._restoreSnapshot(this._history[this._historyIndex]);
    return true;
  }

  /** Returns true if there is a future state to redo to. */
  canRedo(): boolean {
    return this._historyIndex >= 0 && this._historyIndex < this._history.length - 1;
  }

  /**
   * Re-apply the next state in the history (i.e. redo the last undone move).
   * @returns true if redo was applied; false if there was no future state.
   */
  redoMove(): boolean {
    if (!this.canRedo()) return false;
    this._historyIndex++;
    this._restoreSnapshot(this._history[this._historyIndex]);
    return true;
  }

  // ─── Snapshot helpers ──────────────────────────────────────────────────────

  /** Capture a deep copy of the current grid and inventory. */
  private _captureSnapshot(): Snapshot {
    return {
      grid: this.grid.map((row) =>
        row.map(
          (tile) =>
            new Tile(
              tile.shape,
              tile.rotation,
              tile.isFixed,
              tile.capacity,
              tile.dirtCost,
              tile.itemShape,
              tile.itemCount,
              tile.customConnections !== null ? new Set(tile.customConnections) : null,
              tile.chamberContent,
            ),
        ),
      ),
      inventory: this.inventory.map((item) => ({ ...item })),
    };
  }

  /** Restore the board grid and inventory from a snapshot. */
  private _restoreSnapshot(snap: Snapshot): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = snap.grid[r][c];
      }
    }
    // InventoryItem only contains primitive fields (shape + count), so spread is a full copy –
    // consistent with the spread used in _captureSnapshot.
    this.inventory = snap.inventory.map((item) => ({ ...item }));
  }

  /**
   * Compare the LIVE board state against a snapshot without allocating a new Snapshot object.
   * Used by {@link recordMove} to check whether a redo entry can be reused.
   */
  private _liveBoardMatchesSnapshot(snap: Snapshot): boolean {
    if (this.inventory.length !== snap.inventory.length) return false;
    for (let i = 0; i < this.inventory.length; i++) {
      if (this.inventory[i].shape !== snap.inventory[i].shape) return false;
      if (this.inventory[i].count !== snap.inventory[i].count) return false;
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c].shape    !== snap.grid[r][c].shape)    return false;
        if (this.grid[r][c].rotation !== snap.grid[r][c].rotation) return false;
      }
    }
    return true;
  }

  /**
   * Return a player-placed pipe tile back to the inventory.
   * Only non-fixed, non-special tiles (Straight, Elbow, Tee, Cross and their gold
   * variants) can be reclaimed.
   * Returns false (and sets {@link lastError}) if reclaiming would reduce an
   * inventory value below zero due to lost ItemContainer grants.
   * @returns true if the tile was successfully reclaimed.
   */
  reclaimTile(pos: GridPos): boolean {
    this.lastError = null;
    const tile = this.getTile(pos);
    if (!tile || tile.isFixed || tile.shape === PipeShape.Empty) return false;
    if (
      tile.shape === PipeShape.Source        ||
      tile.shape === PipeShape.Sink          ||
      tile.shape === PipeShape.Chamber       ||
      tile.shape === PipeShape.Granite
    ) return false;

    // ── Container-grant constraint check ─────────────────────────────────────
    // Simulate tile removal and verify no inventory count would go below zero.
    const currentBonuses = this.getContainerBonuses();
    const savedTile = this.grid[pos.row][pos.col];
    this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
    const newBonuses = this.getContainerBonuses();
    this.grid[pos.row][pos.col] = savedTile; // restore

    for (const [shape, currentBonus] of currentBonuses) {
      const newBonus = newBonuses.get(shape) ?? 0;
      if (newBonus < currentBonus) {
        // `baseCount` may be negative when the player has used more items than were in the
        // base inventory (drawing on container grants).  After this removal the new effective
        // count would be `baseCount + newBonus`; block if that would go below zero.
        const baseCount = this.inventory.find((it) => it.shape === shape)?.count ?? 0;
        if (baseCount + newBonus < 0) {
          this.lastError =
            'Cannot remove: you have used items granted by a connected container. ' +
            'Reconfigure the path first.';
          return false;
        }
      }
    }

    const idx = this.inventory.findIndex((it) => it.shape === tile.shape);
    if (idx !== -1) {
      this.inventory[idx].count++;
    } else {
      this.inventory.push({ shape: tile.shape, count: 1 });
    }
    this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
    return true;
  }

  // ─── Inventory placement ───────────────────────────────────────────────────

  /**
   * Place a pipe from the inventory onto an empty cell.
   * The effective inventory count (base + ItemContainer grants) must be positive.
   * Gold pipes may only be placed on gold spaces; regular pipes may not be placed on gold spaces.
   * @param rotation - Initial rotation to apply to the placed tile (default 0).
   * @returns true if the placement succeeded.
   */
  placeInventoryTile(pos: GridPos, shape: PipeShape, rotation: Rotation = 0): boolean {
    const tile = this.getTile(pos);
    if (!tile || tile.shape !== PipeShape.Empty) return false;

    const isGoldSpace = this.goldSpaces.has(`${pos.row},${pos.col}`);
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(shape);

    // Gold spaces only accept gold pipes; gold pipes only go on gold spaces
    if (isGoldSpace !== isGoldPipe) return false;

    const idx = this.inventory.findIndex((it) => it.shape === shape);
    const baseCount = idx !== -1 ? this.inventory[idx].count : 0;

    const bonuses = this.getContainerBonuses();
    const effectiveCount = baseCount + (bonuses.get(shape) ?? 0);
    if (effectiveCount <= 0) return false;

    if (idx !== -1) {
      this.inventory[idx].count--;
    } else {
      // Shape comes entirely from container bonuses – track usage with a negative base count
      this.inventory.push({ shape, count: -1 });
    }
    this.grid[pos.row][pos.col] = new Tile(shape, rotation);
    return true;
  }

  // ─── Water tracking ────────────────────────────────────────────────────────

  /**
   * Compute the map of inventory item bonuses granted by Chamber-item tiles
   * that are currently in the water fill path.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   * @returns A map of PipeShape → bonus count from connected chambers.
   */
  getContainerBonuses(filled?: Set<string>): Map<PipeShape, number> {
    const filledSet = filled ?? this.getFilledPositions();
    const bonuses = new Map<PipeShape, number>();
    for (const key of filledSet) {
      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'item' && tile.itemShape !== null) {
        bonuses.set(tile.itemShape, (bonuses.get(tile.itemShape) ?? 0) + tile.itemCount);
      }
    }
    return bonuses;
  }

  /**
   * Compute current water remaining in the source tank based on the live fill state.
   * Water gained from connected Tank tiles offsets the cost of regular pipe tiles.
   */
  getCurrentWater(): number {
    const filled = this.getFilledPositions();
    let pipeCost = 0;
    let tankGain = 0;

    for (const key of filled) {
      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;
      if (PIPE_SHAPES.has(tile.shape)) {
        pipeCost++;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') tankGain += tile.capacity;
        else if (tile.chamberContent === 'dirt') pipeCost += tile.dirtCost;
      }
    }
    return this.sourceCapacity - pipeCost + tankGain;
  }

  // ─── Grid validation ───────────────────────────────────────────────────────

  /**
   * Validate that no tank-like tile (Tank or Chamber with tank content) on the border of
   * the grid has a connection pointing outside the grid, and that adjacent such
   * tiles have symmetric (mutually matching) connections.
   * @returns Array of human-readable error messages (empty = valid).
   */
  validateGrid(): string[] {
    const errors: string[] = [];

    const isTankLike = (t: Tile) =>
      t.shape === PipeShape.Chamber && t.chamberContent === 'tank';

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.grid[r][c];
        if (!isTankLike(tile)) continue;

        const label = 'Chamber(tank)';

        // ── Edge check: no access point may lead off-grid ──────────────
        for (const dir of Object.values(Direction)) {
          if (!tile.connections.has(dir)) continue;
          const delta = NEIGHBOUR_DELTA[dir];
          const nr = r + delta.row;
          const nc = c + delta.col;
          if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) {
            errors.push(
              `${label} at (${r},${c}) has an access point facing ${dir} which leads off the grid.`,
            );
          }
        }

        // ── Adjacent tank-like symmetry check ────────────────────────────────────
        for (const dir of Object.values(Direction)) {
          const delta = NEIGHBOUR_DELTA[dir];
          const neighbourPos: GridPos = { row: r + delta.row, col: c + delta.col };
          const neighbour = this.getTile(neighbourPos);
          if (!neighbour || !isTankLike(neighbour)) continue;

          const thisConnects = tile.connections.has(dir);
          const neighbourConnects = neighbour.connections.has(oppositeDirection(dir));

          if (thisConnects !== neighbourConnects) {
            errors.push(
              `Adjacent tanks at (${r},${c}) and (${neighbourPos.row},${neighbourPos.col}) ` +
              `have mismatched connections on the ${dir} edge.`,
            );
          }
        }
      }
    }
    return errors;
  }

  // ─── Existing helpers ──────────────────────────────────────────────────────

  /** Build a randomised grid for a new puzzle (legacy random mode). */
  private _buildGrid(): Tile[][] {
    const grid = this._emptyGrid();
    const shapes: PipeShape[] = [
      PipeShape.Straight,
      PipeShape.Elbow,
      PipeShape.Tee,
      PipeShape.Cross,
    ];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const pos: GridPos = { row: r, col: c };
        if (this._posEqual(pos, this.source)) {
          grid[r][c] = new Tile(PipeShape.Source, 0, true);
        } else if (this._posEqual(pos, this.sink)) {
          grid[r][c] = new Tile(PipeShape.Sink, 0, true);
        } else {
          const shape = shapes[Math.floor(Math.random() * shapes.length)];
          const rot = ([0, 90, 180, 270] as Rotation[])[Math.floor(Math.random() * 4)];
          grid[r][c] = new Tile(shape, rot);
        }
      }
    }
    return grid;
  }

  private _emptyGrid(): Tile[][] {
    const grid: Tile[][] = [];
    for (let r = 0; r < this.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        grid[r][c] = new Tile(PipeShape.Empty, 0);
      }
    }
    return grid;
  }

  private _posEqual(a: GridPos, b: GridPos): boolean {
    return a.row === b.row && a.col === b.col;
  }

  /**
   * Returns the tile at the given position, or null if out of bounds.
   * @param pos - Grid coordinate.
   */
  getTile(pos: GridPos): Tile | null {
    if (pos.row < 0 || pos.row >= this.rows) return null;
    if (pos.col < 0 || pos.col >= this.cols) return null;
    return this.grid[pos.row][pos.col];
  }

  /**
   * Rotate the tile at the given position 90° clockwise.
   * @param pos - Grid coordinate.
   */
  rotateTile(pos: GridPos): void {
    this.getTile(pos)?.rotate();
  }

  /**
   * Check whether two adjacent tiles are mutually connected along the shared edge.
   * @param fromPos - The position of the first tile.
   * @param dir - The direction from the first tile toward the second.
   */
  areMutuallyConnected(fromPos: GridPos, dir: Direction): boolean {
    const from = this.getTile(fromPos);
    if (!from || !from.connections.has(dir)) return false;

    const delta = NEIGHBOUR_DELTA[dir];
    const toPos: GridPos = { row: fromPos.row + delta.row, col: fromPos.col + delta.col };
    const to = this.getTile(toPos);
    if (!to) return false;

    return to.connections.has(oppositeDirection(dir));
  }

  /**
   * Flood-fill from the source tile and return all reachable positions.
   * @returns Set of stringified "row,col" keys that are water-filled.
   */
  getFilledPositions(): Set<string> {
    const visited = new Set<string>();
    const queue: GridPos[] = [this.source];
    visited.add(`${this.source.row},${this.source.col}`);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dir of Object.values(Direction)) {
        if (!this.areMutuallyConnected(current, dir)) continue;
        const delta = NEIGHBOUR_DELTA[dir];
        const next: GridPos = { row: current.row + delta.row, col: current.col + delta.col };
        const key = `${next.row},${next.col}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(next);
        }
      }
    }
    return visited;
  }

  /**
   * Returns true when the water has reached the sink tile.
   */
  isSolved(): boolean {
    const filled = this.getFilledPositions();
    return filled.has(`${this.sink.row},${this.sink.col}`);
  }
}
