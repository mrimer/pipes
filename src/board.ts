import { Tile, oppositeDirection } from './tile';
import { AmbientDecoration, AmbientDecorationType, Direction, GridPos, InventoryItem, LevelDef, PipeShape, Rotation } from './types';

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
type Snapshot = {
  grid: Tile[][];
  inventory: InventoryItem[];
  lockedWaterImpact: Map<string, number>;
  frozen: number;
  /** The turn number at the moment this snapshot was captured. */
  turnNumber: number;
  /**
   * The turn number on which each tile was first connected, keyed by "row,col".
   * Used to re-evaluate ice/weak-ice costs when beneficial tiles (heaters, pumps) disconnect.
   */
  connectionTurn: Map<string, number>;
};

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
   * Ambient background decorations (pebbles, flowers, grass tufts) generated
   * once each time a level is activated.  Rendered under all tile elements so
   * they are visible only on empty (unoccupied) cells.
   */
  readonly ambientDecorations: readonly AmbientDecoration[];

  /**
   * Pre-built O(1) lookup map for {@link ambientDecorations}, keyed by "row,col".
   * Cached here so the renderer does not reconstruct it on every frame.
   */
  readonly ambientDecorationMap: ReadonlyMap<string, AmbientDecoration>;

  /**
   * Set to a human-readable reason after any failed reclaim attempt, so callers
   * can display an appropriate error message.  Cleared on each new attempt.
   */
  lastError: string | null = null;

  /**
   * Grid positions of tiles that caused the last validation error, if any.
   * Populated alongside {@link lastError} so the UI can highlight the offending tiles.
   * Cleared when lastError is cleared.
   */
  lastErrorTilePositions: GridPos[] | null = null;

  /**
   * Per-tile locked water impact, keyed by "row,col".
   * A negative value represents a water cost; a positive value represents a gain.
   * Populated by {@link applyTurnDelta} after each player action and by
   * {@link initHistory} for the initial board state.
   * When this map is empty (before {@link initHistory} is called), {@link getCurrentWater}
   * falls back to dynamic computation so that tests that bypass the turn
   * mechanism continue to work unchanged.
   */
  private _lockedWaterImpact: Map<string, number> = new Map();

  /**
   * The turn number of the most recent {@link applyTurnDelta} call.
   * Starts at 0 and is incremented to 1 by the first {@link applyTurnDelta} call
   * inside {@link initHistory}.
   */
  private _turnNumber: number = 0;

  /**
   * The turn number on which each tile was first added to the fill path,
   * keyed by "row,col".  Used when a beneficial tile (heater, pump) disconnects:
   * ice/weak-ice tiles still connected are re-evaluated using only the
   * heaters/pumps that were connected on or before each ice tile's own connection turn.
   */
  private _connectionTurn: Map<string, number> = new Map();

  /**
   * Total water units that have been frozen by ice blocks during play.
   * Incremented by {@link applyTurnDelta} each time a newly-connected ice tile
   * subtracts water units.  Restored by undo/redo via the snapshot mechanism.
   * Not used in game logic; intended for display purposes.
   */
  frozen: number = 0;

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
      this.ambientDecorations = this._generateAmbientDecorations();
    } else {
      this.grid = this._buildGrid();
      this.ambientDecorations = [];
    }
    this.ambientDecorationMap = new Map(
      this.ambientDecorations.map((dec) => [`${dec.row},${dec.col}`, dec]),
    );
  }

  // ─── Level initialisation ──────────────────────────────────────────────────

  /** Initialise the board from a level definition. */
  private _initFromLevel(level: LevelDef): void {
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
          this.grid[r][c] = new Tile(def.shape, rot, true, def.capacity ?? 0, def.cost ?? 0, itemShape, itemCount, customConnections, chamberContent, def.temperature ?? 0, def.pressure ?? 0, def.hardness ?? 0);
          if (def.shape === PipeShape.Source) {
            this.source = { row: r, col: c };
          } else if (def.shape === PipeShape.Sink) {
            this.sink = { row: r, col: c };
          }
        }
      }
    }

    this.sourceCapacity = this.grid[this.source.row][this.source.col].capacity;
  }

  /**
   * Generate a set of ambient background decorations spread across the grid.
   * Called once after the grid is fully initialised.  Each cell has an
   * independent ~30 % chance of receiving one decoration.
   */
  private _generateAmbientDecorations(): AmbientDecoration[] {
    const DECORATION_DENSITY = 0.30;
    const TYPES: AmbientDecorationType[] = ['pebbles', 'flower', 'grass'];
    const decorations: AmbientDecoration[] = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (Math.random() >= DECORATION_DENSITY) continue;
        decorations.push({
          row: r,
          col: c,
          type: TYPES[Math.floor(Math.random() * TYPES.length)],
          // Keep decorations away from cell edges for a natural look
          offsetX: 0.15 + Math.random() * 0.70,
          offsetY: 0.15 + Math.random() * 0.70,
          rotation: Math.random() * 360,
          variant: Math.floor(Math.random() * 3),
        });
      }
    }
    return decorations;
  }

  // ─── Undo / redo support ───────────────────────────────────────────────────

  /**
   * Initialise the move history with the current board state as the starting point.
   * Must be called once after a level is fully set up (e.g. at the start of play).
   * Calling this resets any existing history and locks the initial water impact
   * for all tiles that are already connected at game start.
   */
  initHistory(): void {
    this._lockedWaterImpact = new Map();
    this.frozen = 0;
    this._turnNumber = 0;
    this._connectionTurn = new Map();
    this.applyTurnDelta();
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
              tile.cost,
              tile.itemShape,
              tile.itemCount,
              tile.customConnections !== null ? new Set(tile.customConnections) : null,
              tile.chamberContent,
              tile.temperature,
              tile.pressure,
              tile.hardness,
            ),
        ),
      ),
      inventory: this.inventory.map((item) => ({ ...item })),
      lockedWaterImpact: new Map(this._lockedWaterImpact),
      frozen: this.frozen,
      turnNumber: this._turnNumber,
      connectionTurn: new Map(this._connectionTurn),
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
    this._lockedWaterImpact = new Map(snap.lockedWaterImpact);
    this.frozen = snap.frozen;
    this._turnNumber = snap.turnNumber;
    this._connectionTurn = new Map(snap.connectionTurn);
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
    this.lastErrorTilePositions = null;
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

    // ── Sandstone constraint check ───────────────────────────────────────────
    // Simulate tile removal and verify no connected sandstone tile would have deltaDamage ≤ 0.
    // (This can happen when removing a pipe that carried the only path to a pump chamber.)
    {
      this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
      const filledAfter = this.getFilledPositions();
      const sandstoneError = this._checkSandstoneConstraints(filledAfter);
      this.grid[pos.row][pos.col] = savedTile; // restore regardless
      if (sandstoneError) {
        this.lastError = sandstoneError;
        return false;
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
   * Gold spaces only accept gold pipes; gold pipes may be placed on any empty cell.
   * @param rotation - Initial rotation to apply to the placed tile (default 0).
   * @returns true if the placement succeeded.
   */
  placeInventoryTile(pos: GridPos, shape: PipeShape, rotation: Rotation = 0): boolean {
    this.lastError = null;
    this.lastErrorTilePositions = null;
    const tile = this.getTile(pos);
    if (!tile || tile.shape !== PipeShape.Empty) return false;

    const isGoldSpace = this.goldSpaces.has(`${pos.row},${pos.col}`);
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(shape);

    // Gold spaces only accept gold pipes; regular pipes may not go on gold spaces
    if (isGoldSpace && !isGoldPipe) {
      this.lastError = 'Only gold pipes may be placed on a gold space.';
      return false;
    }

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

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0.
    const filled = this.getFilledPositions();
    const sandstoneError = this._checkSandstoneConstraints(filled);
    if (sandstoneError) {
      // Roll back placement.
      this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
      if (idx !== -1) {
        this.inventory[idx].count++;
      } else {
        const pushIdx = this.inventory.findIndex((it) => it.shape === shape && it.count < 0);
        if (pushIdx !== -1) this.inventory.splice(pushIdx, 1);
      }
      this.lastError = sandstoneError;
      return false;
    }

    return true;
  }

  /**
   * Atomically replace the tile at the given position with a new pipe from the
   * inventory.  The existing tile is reclaimed (returned to inventory) and the
   * new tile is placed in a single operation – without the intermediate
   * container-grant constraint check that {@link reclaimTile} applies.
   * The constraint is validated once against the fully-replaced board state; if
   * it fails the entire operation is rolled back.
   *
   * Prerequisites:
   *  - The tile at `pos` must satisfy the same "replaceable" rules as reclaimTile
   *    (non-fixed, not Empty, not Source / Sink / Chamber / Granite).
   *  - The new shape must have a positive effective inventory count after the old
   *    tile has been returned.
   *  - Gold spaces only accept gold pipes (same constraint as fresh placement);
   *    gold pipes may replace regular pipes on non-gold spaces and vice versa.
   *
   * @returns true on success; false on failure (lastError is set when relevant).
   */
  replaceInventoryTile(pos: GridPos, newShape: PipeShape, rotation: Rotation = 0): boolean {
    this.lastError = null;
    this.lastErrorTilePositions = null;
    const tile = this.getTile(pos);

    // Must be a replaceable tile (same guard as reclaimTile)
    if (!tile || tile.isFixed || tile.shape === PipeShape.Empty) return false;
    if (
      tile.shape === PipeShape.Source  ||
      tile.shape === PipeShape.Sink    ||
      tile.shape === PipeShape.Chamber ||
      tile.shape === PipeShape.Granite
    ) return false;

    // Gold-space / gold-pipe constraint for the incoming shape
    const isGoldSpace = this.goldSpaces.has(`${pos.row},${pos.col}`);
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(newShape);
    if (isGoldSpace && !isGoldPipe) {
      this.lastError = 'Only gold pipes may be placed on a gold space.';
      return false;
    }

    // Save inventory snapshot so we can roll back cleanly on failure
    const savedInventory = this.inventory.map((item) => ({ ...item }));
    const oldShape = tile.shape;

    // ── Step 1: Reclaim old tile into inventory (no constraint check yet) ──────
    const oldIdx = this.inventory.findIndex((it) => it.shape === oldShape);
    if (oldIdx !== -1) {
      this.inventory[oldIdx].count++;
    } else {
      this.inventory.push({ shape: oldShape, count: 1 });
    }

    // ── Step 2: Place new tile from inventory ──────────────────────────────────
    // Evaluate container bonuses with the new tile already in place so that a
    // container bridged by this position remains connected in the affordability
    // check.  (Computing bonuses with an Empty cell here would temporarily
    // disconnect such a container and produce a false "not available" result.)
    const newIdx = this.inventory.findIndex((it) => it.shape === newShape);
    const baseCount = newIdx !== -1 ? this.inventory[newIdx].count : 0;
    this.grid[pos.row][pos.col] = new Tile(newShape, rotation);
    const bonuses = this.getContainerBonuses();
    const effectiveCount = baseCount + (bonuses.get(newShape) ?? 0);

    if (effectiveCount <= 0) {
      // New shape not available – roll back step 1 and the provisional placement
      this.inventory = savedInventory;
      this.grid[pos.row][pos.col] = tile;
      return false;
    }

    if (newIdx !== -1) {
      this.inventory[newIdx].count--;
    } else {
      this.inventory.push({ shape: newShape, count: -1 });
    }
    // grid[pos.row][pos.col] is already set to new Tile(newShape, rotation) above

    // ── Step 3: Post-replacement state validation ──────────────────────────────
    // Check that no inventory item's effective count has gone below zero as a
    // result of reduced container-grant bonuses after the replacement.
    const finalBonuses = this.getContainerBonuses();
    for (const item of this.inventory) {
      const bonus = finalBonuses.get(item.shape) ?? 0;
      if (item.count + bonus < 0) {
        this.lastError =
          'Cannot replace: you have used items granted by a connected container. ' +
          'Reconfigure the path first.';
        this.inventory = savedInventory;
        this.grid[pos.row][pos.col] = tile;
        return false;
      }
    }

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0.
    const filledAfterReplace = this.getFilledPositions();
    const sandstoneError = this._checkSandstoneConstraints(filledAfterReplace);
    if (sandstoneError) {
      this.lastError = sandstoneError;
      this.inventory = savedInventory;
      this.grid[pos.row][pos.col] = tile;
      return false;
    }

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
   * Returns true when the level has any temperature-relevant tiles: a heater
   * chamber, an ice chamber, a weak-ice chamber, or a source with a non-zero base temperature.
   * Used to decide whether to display the Temp stat in the UI.
   */
  hasTempRelevantTiles(): boolean {
    const sourceTile = this.grid[this.source.row][this.source.col];
    if (sourceTile.temperature !== 0) return true;
    for (const row of this.grid) {
      for (const tile of row) {
        if (
          tile.shape === PipeShape.Chamber &&
          (tile.chamberContent === 'heater' || tile.chamberContent === 'ice' || tile.chamberContent === 'weak_ice' || tile.chamberContent === 'sandstone')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true when the level has any pressure-relevant tiles: a source tile
   * with non-zero base pressure, a pump chamber, a weak-ice chamber, or a
   * sandstone chamber.  Used to decide whether to display the Pressure stat in the UI.
   */
  hasPressureRelevantTiles(): boolean {
    const sourceTile = this.grid[this.source.row][this.source.col];
    if (sourceTile.pressure > 0) {
      return true;
    }
    for (const row of this.grid) {
      for (const tile of row) {
        if (
          tile.shape === PipeShape.Chamber &&
          (tile.chamberContent === 'pump' || tile.chamberContent === 'weak_ice' || tile.chamberContent === 'sandstone')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Compute the effective source temperature based on the live fill state.
   * This is the source tile's base temperature plus any connected Heater bonuses.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   */
  getCurrentTemperature(filled?: Set<string>): number {
    const filledSet = filled ?? this.getFilledPositions();
    return this._computeTemperatureFromFilled(filledSet);
  }

  /** Internal helper: compute temperature from a pre-computed fill set. */
  private _computeTemperatureFromFilled(filled: Set<string>): number {
    const sourceTile = this.grid[this.source.row][this.source.col];
    let temp = sourceTile.temperature;
    for (const key of filled) {
      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'heater') {
        temp += tile.temperature;
      }
    }
    return temp;
  }

  /**
   * Compute the effective game Pressure based on the live fill state.
   * The base value is the source tile's pressure; each connected Pump chamber adds its bonus.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   */
  getCurrentPressure(filled?: Set<string>): number {
    const filledSet = filled ?? this.getFilledPositions();
    return this._computePressureFromFilled(filledSet);
  }

  /** Internal helper: compute pressure from a pre-computed fill set. */
  private _computePressureFromFilled(filled: Set<string>): number {
    const sourceTile = this.grid[this.source.row][this.source.col];
    let pressure = sourceTile.pressure;
    for (const key of filled) {
      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'pump') {
        pressure += tile.pressure;
      }
    }
    return pressure;
  }

  /**
   * Compute the effective source temperature for a specific ice tile, counting
   * only heaters whose connection turn is ≤ {@link iceConnectedTurn}.
   *
   * This is used during re-evaluation when a heater disconnects: the ice tile
   * must not receive benefit from heaters that connected after it did.
   */
  private _computeTemperatureForIce(filled: Set<string>, iceConnectedTurn: number): number {
    const sourceTile = this.grid[this.source.row][this.source.col];
    let temp = sourceTile.temperature;
    for (const key of filled) {
      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'heater') {
        const heaterTurn = this._connectionTurn.get(key) ?? Infinity;
        if (heaterTurn <= iceConnectedTurn) {
          temp += tile.temperature;
        }
      }
    }
    return temp;
  }

  /**
   * Compute the effective pressure for a specific ice tile, counting only pumps
   * (and the source) whose connection turn is ≤ {@link iceConnectedTurn}.
   *
   * Used symmetrically with {@link _computeTemperatureForIce} during re-evaluation.
   */
  private _computePressureForIce(filled: Set<string>, iceConnectedTurn: number): number {
    const sourceTile = this.grid[this.source.row][this.source.col];
    // The source is always connected first, so its pressure always counts for any ice tile.
    let pressure = sourceTile.pressure;
    for (const key of filled) {
      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'pump') {
        const pumpTurn = this._connectionTurn.get(key) ?? Infinity;
        if (pumpTurn <= iceConnectedTurn) {
          pressure += tile.pressure;
        }
      }
    }
    return pressure;
  }

  /**
   * Compute current water remaining in the source tank based on the live fill state.
   *
   * When incremental turn tracking is active (i.e. {@link applyTurnDelta} has been
   * called at least once, typically via {@link initHistory}), each tile's water
   * impact is read from the locked-impact map so that ice-tile costs are frozen at
   * the temperature that was in effect when the tile was first connected.
   *
   * When no turn tracking has been applied yet (e.g. in unit tests that build a
   * board directly without going through the game loop), a fully dynamic
   * computation is performed using the current temperature — identical to the
   * pre-incremental behaviour — so that existing tests remain valid.
   */
  getCurrentWater(): number {
    const filled = this.getFilledPositions();

    // ── Incremental path (normal gameplay) ──────────────────────────────────
    // _lockedWaterImpact is non-empty once applyTurnDelta() has been called
    // (at minimum the source tile is always present).
    if (this._lockedWaterImpact.size > 0) {
      let total = this.sourceCapacity;
      for (const key of filled) {
        total += this._lockedWaterImpact.get(key) ?? 0;
      }
      return total;
    }

    // ── Dynamic fallback (test/legacy path) ─────────────────────────────────
    const currentTemp = this._computeTemperatureFromFilled(filled);
    const currentPressure = this._computePressureFromFilled(filled);
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
        else if (tile.chamberContent === 'dirt') pipeCost += tile.cost;
        else if (tile.chamberContent === 'ice') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          pipeCost += tile.cost * deltaTemp;
        } else if (tile.chamberContent === 'weak_ice') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          pipeCost += (currentPressure >= 1 ? Math.ceil(tile.cost / currentPressure) : tile.cost) * deltaTemp;
        } else if (tile.chamberContent === 'sandstone') {
          const deltaDamage = currentPressure - tile.hardness;
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          // deltaDamage <= 0 is an invalid play state: drain all water to force immediate failure.
          pipeCost += deltaDamage >= 1
            ? Math.ceil(tile.cost / deltaDamage) * deltaTemp
            : this.sourceCapacity + 1;
        }
      }
    }
    return this.sourceCapacity - pipeCost + tankGain;
  }

  /**
   * Evaluate and lock the water impact of each newly-connected tile based on
   * the current board state.  Must be called after every player action that may
   * change the fill path (place, rotate, reclaim).
   *
   * - Previously-evaluated tiles keep their locked impact unchanged, so an ice
   *   tile's cost is never retroactively altered by a heater connected later.
   * - When a beneficial tile (heater or pump) is removed from the fill path,
   *   any still-connected ice/weak-ice tiles are re-evaluated.  Re-evaluation
   *   only considers heaters/pumps whose own connection turn is ≤ the ice tile's
   *   original connection turn, so no ice tile ever gains a retroactive benefit
   *   from a heater that connected after it.
   * - Tiles removed from the fill path lose their lock; if they reconnect on a
   *   future move they are re-evaluated at the temperature current at that time.
   *
   * Ice-tile costs are computed from the current source temperature (source base
   * plus all heaters that are already in the fill set when this method runs),
   * which is the "state of the board" at the moment the turn is applied.
   */
  applyTurnDelta(): void {
    const filled = this.getFilledPositions();

    // ── Detect whether any heater or pump has been disconnected this turn ────
    let beneficialDisconnected = false;
    for (const key of this._lockedWaterImpact.keys()) {
      if (!filled.has(key)) {
        const [r, c] = key.split(',').map(Number);
        const tile = this.grid[r]?.[c];
        if (
          tile?.shape === PipeShape.Chamber &&
          (tile.chamberContent === 'heater' || tile.chamberContent === 'pump')
        ) {
          beneficialDisconnected = true;
          break;
        }
      }
    }

    // Remove locked impacts for tiles that are no longer connected.
    // For ice/weak-ice tiles that are being disconnected, subtract their contribution
    // from the frozen counter since they are no longer in the fill path.
    for (const key of this._lockedWaterImpact.keys()) {
      if (!filled.has(key)) {
        const impact = this._lockedWaterImpact.get(key)!;
        const [r, c] = key.split(',').map(Number);
        const tile = this.grid[r]?.[c];
        if (
          tile?.shape === PipeShape.Chamber &&
          (tile.chamberContent === 'ice' || tile.chamberContent === 'weak_ice' || tile.chamberContent === 'sandstone') &&
          impact < 0
        ) {
          // impact is negative (a cost); subtract it back out of frozen.
          this.frozen += impact;
        }
        this._lockedWaterImpact.delete(key);
        this._connectionTurn.delete(key);
      }
    }

    // Advance the turn counter.
    this._turnNumber++;

    // ── Re-evaluate still-connected ice/weak-ice when a beneficial tile left ─
    // When a heater or pump disconnects, any ice/weak-ice tile whose locked cost
    // was partially or fully neutralised by that tile may now be under-charged.
    // Re-compute using only heaters/pumps that were connected on or before each
    // ice tile's own original connection turn.
    if (beneficialDisconnected) {
      for (const key of filled) {
        if (!this._lockedWaterImpact.has(key)) continue; // Newly connecting – handled below.

        const [r, c] = key.split(',').map(Number);
        const tile = this.grid[r]?.[c];
        if (!tile || tile.shape !== PipeShape.Chamber) continue;
        if (tile.chamberContent !== 'ice' && tile.chamberContent !== 'weak_ice' && tile.chamberContent !== 'sandstone') continue;

        const iceConnectedTurn = this._connectionTurn.get(key) ?? this._turnNumber;
        const effectiveTemp = this._computeTemperatureForIce(filled, iceConnectedTurn);
        const effectivePressure = this._computePressureForIce(filled, iceConnectedTurn);

        const oldImpact = this._lockedWaterImpact.get(key)!;
        let newImpact: number;

        if (tile.chamberContent === 'ice') {
          const deltaTemp = Math.max(0, tile.temperature - effectiveTemp);
          newImpact = -(tile.cost * deltaTemp);
        } else if (tile.chamberContent === 'sandstone') {
          const deltaDamage = effectivePressure - tile.hardness;
          const deltaTemp = Math.max(0, tile.temperature - effectiveTemp);
          if (deltaDamage >= 1) {
            newImpact = -(Math.ceil(tile.cost / deltaDamage) * deltaTemp);
          } else {
            // deltaDamage <= 0 is an invalid play state: drain all water to force immediate failure.
            // Skip the frozen counter – this impact has no ice-accounting meaning.
            const failureImpact = -(this.sourceCapacity + 1);
            if (failureImpact !== oldImpact) {
              this._lockedWaterImpact.set(key, failureImpact);
            }
            continue;
          }
        } else {
          const deltaTemp = Math.max(0, tile.temperature - effectiveTemp);
          const effectiveCost = effectivePressure >= 1 ? Math.ceil(tile.cost / effectivePressure) : tile.cost;
          newImpact = -(effectiveCost * deltaTemp);
        }

        if (newImpact !== oldImpact) {
          // Adjust the frozen-water display counter by the change in cost.
          this.frozen += oldImpact - newImpact;
          this._lockedWaterImpact.set(key, newImpact);
        }
      }
    }

    // ── Lock the impact of each newly-connected tile ─────────────────────────
    const currentTemp = this._computeTemperatureFromFilled(filled);
    const currentPressure = this._computePressureFromFilled(filled);

    for (const key of filled) {
      if (this._lockedWaterImpact.has(key)) continue; // Already evaluated.

      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;

      let impact = 0;
      if (PIPE_SHAPES.has(tile.shape)) {
        impact = -1;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') {
          impact = tile.capacity;
        } else if (tile.chamberContent === 'dirt') {
          impact = -tile.cost;
        } else if (tile.chamberContent === 'ice') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          impact = -(tile.cost * deltaTemp);
          this.frozen += tile.cost * deltaTemp;
        } else if (tile.chamberContent === 'weak_ice') {
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          const effectiveCost = currentPressure >= 1 ? Math.ceil(tile.cost / currentPressure) : tile.cost;
          impact = -(effectiveCost * deltaTemp);
          this.frozen += effectiveCost * deltaTemp;
        } else if (tile.chamberContent === 'sandstone') {
          const deltaDamage = currentPressure - tile.hardness;
          const deltaTemp = Math.max(0, tile.temperature - currentTemp);
          // deltaDamage <= 0 is an invalid play state: drain all water to force immediate failure.
          if (deltaDamage >= 1) {
            const effectiveCost = Math.ceil(tile.cost / deltaDamage);
            impact = -(effectiveCost * deltaTemp);
            this.frozen += effectiveCost * deltaTemp;
          } else {
            impact = -(this.sourceCapacity + 1);
          }
        }
        // 'heater', 'pump', and 'item': no direct water impact (impact stays 0).
      }
      // Source, Sink, Empty, Granite: no water impact (impact stays 0).

      this._lockedWaterImpact.set(key, impact);
      this._connectionTurn.set(key, this._turnNumber);
    }
  }

  /**
   * Return the locked water impact for the tile at the given position, or
   * `null` if that tile has not yet been evaluated by {@link applyTurnDelta}.
   * A negative return value represents a water cost; positive represents a gain.
   * Used by the UI to display the actual locked cost of an ice tile in the tooltip.
   */
  getLockedWaterImpact(pos: GridPos): number | null {
    const key = `${pos.row},${pos.col}`;
    const val = this._lockedWaterImpact.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Check whether any sandstone tile currently in the fill path has deltaDamage ≤ 0.
   * Checks both newly-connected tiles (not yet in the locked map) and already-connected
   * tiles (in case pressure dropped after a pump was disconnected).
   * Sets {@link lastErrorTilePositions} to the offending tile(s) when a violation is found.
   * @param filled - Current fill set (after the board mutation).
   * @returns An error message string if a violation is found, or `null` if valid.
   */
  private _checkSandstoneConstraints(filled: Set<string>): string | null {
    const currentPressure = this._computePressureFromFilled(filled);
    const violating: GridPos[] = [];
    for (const key of filled) {
      const [r, c] = key.split(',').map(Number);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'sandstone') {
        const deltaDamage = currentPressure - tile.hardness;
        if (deltaDamage <= 0) {
          violating.push({ row: r, col: c });
        }
      }
    }
    if (violating.length > 0) {
      const tile = this.grid[violating[0].row]?.[violating[0].col];
      const currentPressureForMsg = currentPressure;
      const hardnessForMsg = tile?.hardness ?? 0;
      this.lastErrorTilePositions = violating;
      const isNewlyConnected = !this._lockedWaterImpact.has(`${violating[0].row},${violating[0].col}`);
      return isNewlyConnected
        ? `Pressure must exceed Sandstone hardness to connect. (Pressure: ${currentPressureForMsg}, Hardness: ${hardnessForMsg})`
        : `Cannot disconnect: Pressure would drop below Sandstone hardness. (Pressure: ${currentPressureForMsg}, Hardness: ${hardnessForMsg})`;
    }
    return null;
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
   * Returns false (and sets {@link lastError} / {@link lastErrorTilePositions}) if the
   * rotation would result in any connected sandstone tile having deltaDamage ≤ 0 (either
   * by newly connecting a sandstone tile, or by disconnecting a pump and dropping pressure).
   * The rotation is reversed in that case.
   * @param pos - Grid coordinate.
   * @returns true if the rotation succeeded; false if it was blocked by a sandstone constraint.
   */
  rotateTile(pos: GridPos): boolean {
    this.lastError = null;
    this.lastErrorTilePositions = null;
    const tile = this.getTile(pos);
    if (!tile) return false;
    tile.rotate();

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0.
    const filled = this.getFilledPositions();
    const sandstoneError = this._checkSandstoneConstraints(filled);
    if (sandstoneError) {
      // Reverse the rotation (3 clockwise = 1 counter-clockwise).
      tile.rotate(); tile.rotate(); tile.rotate();
      this.lastError = sandstoneError;
      return false;
    }

    return true;
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
