import { Tile, oppositeDirection } from './tile';
import { AmbientDecoration, AmbientDecorationType, Direction, GridPos, InventoryItem, LevelDef, PipeShape, Rotation, COLD_CHAMBER_CONTENTS, TEMP_CHAMBER_CONTENTS, TEMP_RELEVANT_CONTENTS, PRESSURE_RELEVANT_CONTENTS, ENV_MODIFIER_CONTENTS } from './types';

/**
 * Encode a grid row/col pair into the canonical string key used by all internal
 * board maps (e.g. `_lockedWaterImpact`, `goldSpaces`, `cementData`).
 */
export function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Decode a string key produced by {@link posKey} back into [row, col] integers.
 */
export function parseKey(key: string): [number, number] {
  const comma = key.indexOf(',');
  return [parseInt(key, 10), parseInt(key.slice(comma + 1), 10)];
}

/** Neighbour offsets keyed by direction. */
export const NEIGHBOUR_DELTA: Record<Direction, GridPos> = {
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
  PipeShape.SpinStraight,
  PipeShape.SpinElbow,
  PipeShape.SpinTee,
]);

/** Gold pipe shapes – may only be placed on gold spaces. */
export const GOLD_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.GoldStraight,
  PipeShape.GoldElbow,
  PipeShape.GoldTee,
  PipeShape.GoldCross,
]);

/** Spinnable pipe shapes – pre-placed by the editor; player can rotate but not remove them. */
export const SPIN_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.SpinStraight,
  PipeShape.SpinElbow,
  PipeShape.SpinTee,
]);

/**
 * Returns true for impassable obstacle tiles (Granite, Tree).
 * Obstacle tiles have no connections, cannot be moved, and water cannot flow through them.
 */
export function isObstacleTile(shape: PipeShape): boolean {
  return shape === PipeShape.Granite || shape === PipeShape.Tree;
}

// ── Ice / snow / sandstone cost-calculation helpers ──────────────────────────
// These formulas appear in getCurrentWater(), _lockNewTiles(), and
// _reEvaluateConnectedTiles() in board.ts, and in _pushTileAnimLabels() in
// game.ts.  Centralising them here avoids copy-paste bugs and makes the
// cost model easier to understand.

/**
 * Compute how much colder a tile is than the current environment temperature.
 * Returns 0 if the tile is warmer than (or at) the current temperature.
 * Used as the per-deltaTemp multiplier for ice/snow/sandstone/hot_plate costs.
 */
export function computeDeltaTemp(tileTemperature: number, currentTemp: number): number {
  return Math.max(0, tileTemperature - currentTemp);
}

/**
 * Compute the pressure-adjusted cost per deltaTemp unit for a snow tile.
 * When pressure ≥ 1 the cost is divided by pressure (rounded up); otherwise
 * the full cost applies.
 */
export function snowCostPerDeltaTemp(tileCost: number, pressure: number): number {
  return pressure >= 1 ? Math.ceil(tileCost / pressure) : tileCost;
}

/**
 * Determine the sandstone cost factors based on the current pressure.
 *
 * - `shatterOverride`: pressure meets or exceeds the shatter threshold, so the
 *   tile is shattered and costs **zero** water regardless of temperature.
 * - `deltaDamage`: `pressure − hardness`.  Values < 1 indicate an invalid play
 *   state (caller must apply a failure penalty; see {@link Board.sourceCapacity}).
 * - `costPerDeltaTemp`: water cost per deltaTemp unit when `deltaDamage ≥ 1`.
 *   Falls back to `tileCost` for the failure case so callers can still display
 *   a readable label (e.g. in animation tooltips).
 */
export function sandstoneCostFactors(
  tileCost: number,
  hardness: number,
  shatter: number,
  pressure: number,
): { shatterOverride: boolean; deltaDamage: number; costPerDeltaTemp: number } {
  const shatterOverride = shatter > hardness && pressure >= shatter;
  const deltaDamage = pressure - hardness;
  const costPerDeltaTemp = deltaDamage >= 1 ? Math.ceil(tileCost / deltaDamage) : tileCost;
  return { shatterOverride, deltaDamage, costPerDeltaTemp };
}

// ── Error message constants ────────────────────────────────────────────────
// Centralised here so changes propagate automatically and tests can reference
// the same strings without hard-coding them again.

/** Error shown when a non-gold pipe is placed on a gold space. */
export const ERR_GOLD_SPACE = 'Only gold pipes may be placed on a gold space.';

/** Error shown when removing a tile would leave placed tiles without covering container grants. */
const ERR_CONTAINER_REMOVE =
  'Cannot remove: you have used items granted by a connected container. ' +
  'Reconfigure the path first.';

/** Error shown when a replacement would disconnect the container that grants the new shape. */
const ERR_CONTAINER_DISCONNECT =
  'Cannot replace: placing this pipe would disconnect a container that grants it. ' +
  'Reconfigure the path first.';

/** Error shown when replacing a tile would leave placed tiles without covering container grants. */
const ERR_CONTAINER_REPLACE =
  'Cannot replace: you have used items granted by a connected container. ' +
  'Reconfigure the path first.';

/** Error shown when rotating a tile would leave placed tiles without covering container grants. */
const ERR_CONTAINER_ROTATE =
  'Cannot rotate: you have used items granted by a connected container. ' +
  'Reconfigure the path first.';

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
   * Used to re-evaluate ice/snow costs when beneficial tiles (heaters, pumps) disconnect.
   */
  connectionTurn: Map<string, number>;
  /**
   * Per hot_plate tile: the amount of frozen water consumed (waterGain) when that tile connected.
   * Keyed by "row,col". Used to restore the frozen counter when a hot_plate tile disconnects.
   */
  hotPlateWaterGain: Map<string, number>;
  /**
   * The board temperature at the time each tile first connected, keyed by "row,col".
   * Used to reconstruct the calculation text in the tile tooltip for connected tiles.
   */
  lockedConnectTemp: Map<string, number>;
  /**
   * The board pressure at the time each tile first connected, keyed by "row,col".
   * Used to reconstruct the calculation text in the tile tooltip for connected tiles.
   */
  lockedConnectPressure: Map<string, number>;
  /**
   * Cement setting-time values keyed by "row,col".
   * Included in snapshots so undo/redo restores the correct setting time.
   */
  cementData: Map<string, number>;
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
   * Cement setting-time values keyed by "row,col".
   * Populated from the level definition (where Cement tiles appear).
   * Values are decremented when a player removes or rotates a pipe placed on that cell.
   * When the value is 0 the cell is "hardened" and placed pipes may not be adjusted.
   */
  cementData: Map<string, number>;

  /**
   * Set to the position of the cement cell whose setting time was just decremented
   * by a successful {@link reclaimTile}, {@link rotateTile}, or {@link replaceInventoryTile}
   * call.  Cleared to null at the start of each such call.
   * Used by the UI to spawn a floating "-1" animation.
   */
  lastCementDecrement: GridPos | null = null;

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
   * Tiles whose locked water impact changed during the most recent
   * {@link applyTurnDelta} call because a beneficial tile (heater/pump) was
   * disconnected and the remaining costs were re-evaluated.
   * Each entry records the grid position and the numeric delta
   * (newImpact − oldImpact); negative means the tile now costs more water,
   * positive means it costs less.  Cleared at the start of each
   * {@link applyTurnDelta} call.
   */
  lastLockedCostChanges: Array<{ row: number; col: number; delta: number }> = [];

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
   * ice/snow tiles still connected are re-evaluated using only the
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

  /**
   * Per hot_plate tile: the amount of frozen water consumed (waterGain) when that tile connected.
   * Keyed by "row,col". Used to restore the frozen counter when a hot_plate tile disconnects.
   */
  private _hotPlateWaterGain: Map<string, number> = new Map();

  /**
   * The board temperature recorded when each tile first connected, keyed by "row,col".
   * Used to reconstruct the locked calculation text shown in tile tooltips.
   */
  private _lockedConnectTemp: Map<string, number> = new Map();

  /**
   * The board pressure recorded when each tile first connected, keyed by "row,col".
   * Used to reconstruct the locked calculation text shown in tile tooltips.
   */
  private _lockedConnectPressure: Map<string, number> = new Map();

  /** Full move history for undo/redo support. history[0] is the initial state. */
  private _history: Snapshot[] = [];
  /** Index of the current state in _history (-1 if history is uninitialised). */
  private _historyIndex: number = -1;

  /**
   * @param rows - Number of rows.
   * @param cols - Number of columns.
   * @param level - Optional level definition.  If omitted a random grid is built.
   * @param existingDecorations - Optional pre-built decorations to reuse instead of
   *   generating new ones.  Pass the previous board's {@link ambientDecorations} when
   *   restarting a level to keep the same decor visible.
   */
  constructor(rows: number, cols: number, level?: LevelDef, existingDecorations?: readonly AmbientDecoration[]) {
    this.rows = rows;
    this.cols = cols;
    this.source = { row: 0, col: 0 };
    this.sink = { row: rows - 1, col: cols - 1 };
    this.sourceCapacity = 0;
    this.inventory = [];
    this.goldSpaces = new Set();
    this.cementData = new Map();

    if (level) {
      this.grid = this._emptyGrid();
      this._initFromLevel(level);
      this.ambientDecorations = existingDecorations ?? this._generateAmbientDecorations();
    } else {
      this.grid = this._buildGrid();
      this.ambientDecorations = [];
    }
    this.ambientDecorationMap = new Map(
      this.ambientDecorations.map((dec) => [posKey(dec.row, dec.col), dec]),
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
          this.goldSpaces.add(posKey(r, c));
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else if (def.shape === PipeShape.Cement) {
          // Cement tiles are tracked separately; the cell behaves like Empty
          this.cementData.set(posKey(r, c), def.dryingTime ?? 0);
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else {
          const rot = (def.rotation ?? 0) as Rotation;
          const itemShape = def.itemShape ?? null;
          const itemCount = def.itemCount ?? 1;
          const customConnections = def.connections ? new Set(def.connections) : null;
          const chamberContent = def.chamberContent ?? null;
          // Spinnable pipes are not fixed so the player can rotate them, but they
          // cannot be removed (that is enforced by reclaimTile / replaceInventoryTile).
          const isFixed = !SPIN_PIPE_SHAPES.has(def.shape);
          this.grid[r][c] = new Tile(def.shape, rot, isFixed, def.capacity ?? 0, def.cost ?? 0, itemShape, itemCount, customConnections, chamberContent, def.temperature ?? 0, def.pressure ?? 0, def.hardness ?? 0, def.shatter ?? 0);
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
    this._hotPlateWaterGain = new Map();
    this._lockedConnectTemp = new Map();
    this._lockedConnectPressure = new Map();
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
   * Import the pre-restart history from a previous board instance so that
   * pressing Undo after a restart can recover the state the player was in
   * before the restart.
   *
   * Prepends the played portion of `prevBoard`'s history (snapshots 0 through
   * `prevBoard._historyIndex`) before this board's own initial snapshot and
   * advances `_historyIndex` accordingly.  Does nothing when `prevBoard` has
   * no undo-able states (i.e. `prevBoard.canUndo()` is false).
   *
   * @param prevBoard - The board that was active before the restart.
   */
  graftPreRestartHistory(prevBoard: Board): void {
    if (!prevBoard.canUndo()) return;
    const prevSlice = prevBoard._history.slice(0, prevBoard._historyIndex + 1);
    this._history = [...prevSlice, ...this._history];
    this._historyIndex += prevSlice.length;
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
      grid: this.grid.map((row) => row.map((tile) => tile.clone())),
      inventory: this.inventory.map((item) => ({ ...item })),
      lockedWaterImpact: new Map(this._lockedWaterImpact),
      frozen: this.frozen,
      turnNumber: this._turnNumber,
      connectionTurn: new Map(this._connectionTurn),
      hotPlateWaterGain: new Map(this._hotPlateWaterGain),
      lockedConnectTemp: new Map(this._lockedConnectTemp),
      lockedConnectPressure: new Map(this._lockedConnectPressure),
      cementData: new Map(this.cementData),
    };
  }

  /** Restore the board grid and inventory from a snapshot. */
  private _restoreSnapshot(snap: Snapshot): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // Deep-copy each Tile so that subsequent in-place mutations (e.g. rotate())
        // on the live grid cannot corrupt the stored snapshot.
        this.grid[r][c] = snap.grid[r][c].clone();
      }
    }
    // InventoryItem only contains primitive fields (shape + count), so spread is a full copy –
    // consistent with the spread used in _captureSnapshot.
    this.inventory = snap.inventory.map((item) => ({ ...item }));
    this._lockedWaterImpact = new Map(snap.lockedWaterImpact);
    this.frozen = snap.frozen;
    this._turnNumber = snap.turnNumber;
    this._connectionTurn = new Map(snap.connectionTurn);
    this._hotPlateWaterGain = new Map(snap.hotPlateWaterGain);
    this._lockedConnectTemp = new Map(snap.lockedConnectTemp);
    this._lockedConnectPressure = new Map(snap.lockedConnectPressure);
    this.cementData = new Map(snap.cementData);
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
   * Clear all error/action state fields at the start of each mutating operation.
   * Called by {@link reclaimTile}, {@link placeInventoryTile},
   * {@link replaceInventoryTile}, {@link rotateTile}, and {@link rotateTileBy}
   * before performing any validation.
   */
  private _clearLastError(): void {
    this.lastError = null;
    this.lastErrorTilePositions = null;
    this.lastCementDecrement = null;
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
    this._clearLastError();
    const tile = this.getTile(pos);
    if (!this._isReplaceableTile(tile)) return false;

    // ── Cement constraint check ───────────────────────────────────────────────
    if (this._isCementHardened(pos)) return false;

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
          this.lastError = ERR_CONTAINER_REMOVE;
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
      const constraintError = this._validateConstraints(filledAfter);
      this.grid[pos.row][pos.col] = savedTile; // restore regardless
      if (constraintError) {
        this.lastError = constraintError;
        return false;
      }
    }

    this._reclaimInventory(tile.shape);
    this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
    return true;
  }

  /**
   * Place a pipe from the inventory onto an empty cell.
   * The effective inventory count (base + ItemContainer grants) must be positive.
   * Gold spaces only accept gold pipes; gold pipes may be placed on any empty cell.
   * @param rotation - Initial rotation to apply to the placed tile (default 0).
   * @returns true if the placement succeeded.
   */
  placeInventoryTile(pos: GridPos, shape: PipeShape, rotation: Rotation = 0): boolean {
    this._clearLastError();
    const tile = this.getTile(pos);
    if (!tile || tile.shape !== PipeShape.Empty) return false;

    const isGoldSpace = this.goldSpaces.has(posKey(pos.row, pos.col));
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(shape);

    // Gold spaces only accept gold pipes; regular pipes may not go on gold spaces
    if (isGoldSpace && !isGoldPipe) {
      this.lastError = ERR_GOLD_SPACE;
      return false;
    }

    const existing = this.inventory.find((it) => it.shape === shape);
    const baseCount = existing?.count ?? 0;

    const bonuses = this.getContainerBonuses();
    const effectiveCount = baseCount + (bonuses.get(shape) ?? 0);
    if (effectiveCount <= 0) return false;

    this._spendInventory(shape);
    this.grid[pos.row][pos.col] = new Tile(shape, rotation);

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0,
    // and that temperature/pressure don't go below 0.
    const filled = this.getFilledPositions();
    const constraintError = this._validateConstraints(filled);
    if (constraintError) {
      // Roll back placement.
      this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
      this._unspendInventory(shape);
      this.lastError = constraintError;
      return false;
    }

    // Decrement cement setting time after successful placement
    this._applyCementDecrement(pos);

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
    this._clearLastError();
    const tile = this.getTile(pos);

    // Must be a replaceable tile (same guard as reclaimTile)
    if (!this._isReplaceableTile(tile)) return false;

    // ── Cement constraint check ───────────────────────────────────────────────
    if (this._isCementHardened(pos)) return false;

    // Gold-space / gold-pipe constraint for the incoming shape
    const isGoldSpace = this.goldSpaces.has(posKey(pos.row, pos.col));
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(newShape);
    if (isGoldSpace && !isGoldPipe) {
      this.lastError = ERR_GOLD_SPACE;
      return false;
    }

    // Save inventory snapshot so we can roll back cleanly on failure
    const savedInventory = this.inventory.map((item) => ({ ...item }));
    const oldShape = tile.shape;

    // ── Step 1: Reclaim old tile into inventory (no constraint check yet) ──────
    this._reclaimInventory(oldShape);

    // ── Step 2: Place new tile from inventory ──────────────────────────────────
    // Evaluate container bonuses with the new tile already in place so that a
    // container bridged by this position remains connected in the affordability
    // check.  (Computing bonuses with an Empty cell here would temporarily
    // disconnect such a container and produce a false "not available" result.)
    const newExisting = this.inventory.find((it) => it.shape === newShape);
    const baseCount = newExisting?.count ?? 0;
    this.grid[pos.row][pos.col] = new Tile(newShape, rotation);
    const bonuses = this.getContainerBonuses();
    const effectiveCount = baseCount + (bonuses.get(newShape) ?? 0);

    if (effectiveCount <= 0) {
      // Check whether the new shape was available before the replacement (with the old tile
      // in place).  If it was, the replacement itself is disconnecting the container that
      // grants the new shape – report that as a user-visible error.
      this.grid[pos.row][pos.col] = tile; // temporarily restore old tile for bonus check
      const originalBonuses = this.getContainerBonuses();
      const originalEffective = baseCount + (originalBonuses.get(newShape) ?? 0);
      if (originalEffective > 0) {
        this.lastError = ERR_CONTAINER_DISCONNECT;
      }
      this.inventory = savedInventory;
      // grid[pos.row][pos.col] is already restored to the old tile above
      return false;
    }

    this._spendInventory(newShape);
    // grid[pos.row][pos.col] is already set to new Tile(newShape, rotation) above

    // ── Step 3: Post-replacement state validation ──────────────────────────────
    // Check that no inventory item's effective count has gone below zero as a
    // result of reduced container-grant bonuses after the replacement.
    const finalBonuses = this.getContainerBonuses();
    for (const item of this.inventory) {
      const bonus = finalBonuses.get(item.shape) ?? 0;
      if (item.count + bonus < 0) {
        this.lastError = ERR_CONTAINER_REPLACE;
        this.inventory = savedInventory;
        this.grid[pos.row][pos.col] = tile;
        return false;
      }
    }

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0,
    // and that temperature/pressure don't go below 0.
    const filledAfterReplace = this.getFilledPositions();
    const constraintError = this._validateConstraints(filledAfterReplace);
    if (constraintError) {
      this.lastError = constraintError;
      this.inventory = savedInventory;
      this.grid[pos.row][pos.col] = tile;
      return false;
    }

    // Decrement cement setting time after successful replace
    this._applyCementDecrement(pos);

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
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'item' && tile.itemShape !== null) {
        bonuses.set(tile.itemShape, (bonuses.get(tile.itemShape) ?? 0) + tile.itemCount);
      }
    }
    return bonuses;
  }

  /**
   * Count how many star chamber tiles are currently in the water fill path.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   * @returns The number of connected star chambers.
   */
  getStarsCollected(filled?: Set<string>): number {
    const filledSet = filled ?? this.getFilledPositions();
    let count = 0;
    for (const key of filledSet) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'star') {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns true when any tile in the grid is a Chamber whose content belongs
   * to the given set.  Used by {@link hasTempRelevantTiles} and
   * {@link hasPressureRelevantTiles} to avoid duplicating the grid scan.
   * @param contents - The set of chamber content types to search for.
   */
  private _hasAnyTileWithContents(contents: ReadonlySet<string>): boolean {
    for (const row of this.grid) {
      for (const tile of row) {
        if (tile.shape === PipeShape.Chamber && contents.has(tile.chamberContent!)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true when the level has any temperature-relevant tiles: a heater
   * chamber, an ice chamber, a snow chamber, a sandstone chamber, a hot-plate
   * chamber, or a source with a non-zero base temperature.
   * Used to decide whether to display the Temp stat in the UI.
   */
  hasTempRelevantTiles(): boolean {
    const sourceTile = this.grid[this.source.row][this.source.col];
    return sourceTile.temperature !== 0 || this._hasAnyTileWithContents(TEMP_RELEVANT_CONTENTS);
  }

  /**
   * Returns true when the level has any pressure-relevant tiles: a source tile
   * with non-zero base pressure, a pump chamber, a snow chamber, or a
   * sandstone chamber.  Used to decide whether to display the Pressure stat in the UI.
   */
  hasPressureRelevantTiles(): boolean {
    const sourceTile = this.grid[this.source.row][this.source.col];
    return sourceTile.pressure > 0 || this._hasAnyTileWithContents(PRESSURE_RELEVANT_CONTENTS);
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

  /**
   * Generic helper: sum an environment stat (temperature or pressure) over a fill set.
   *
   * Starting from the source tile's base value, it adds the bonus from every
   * connected Chamber whose `chamberContent` matches `content` ('heater' for
   * temperature, 'pump' for pressure).
   *
   * When `maxTurn` is provided, only modifier tiles whose connection turn is ≤
   * `maxTurn` contribute.  This enforces the historical-lock rule used during
   * re-evaluation: a cost tile must not receive a retroactive benefit from a
   * heater or pump that connected *after* it did.
   */
  private _aggregateEnvStat(
    filled: Set<string>,
    content: 'heater' | 'pump',
    maxTurn?: number,
  ): number {
    const sourceTile = this.grid[this.source.row][this.source.col];
    const isTemp = content === 'heater';
    let total = isTemp ? sourceTile.temperature : sourceTile.pressure;
    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === content) {
        if (maxTurn === undefined || (this._connectionTurn.get(key) ?? Infinity) <= maxTurn) {
          total += isTemp ? tile.temperature : tile.pressure;
        }
      }
    }
    return total;
  }

  /** Internal helper: compute temperature from a pre-computed fill set. */
  private _computeTemperatureFromFilled(filled: Set<string>): number {
    return this._aggregateEnvStat(filled, 'heater');
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
    return this._aggregateEnvStat(filled, 'pump');
  }

  /**
   * Compute the effective source temperature for a specific ice tile, counting
   * only heaters whose connection turn is ≤ {@link iceConnectedTurn}.
   *
   * This is used during re-evaluation when a heater disconnects: the ice tile
   * must not receive benefit from heaters that connected after it did.
   */
  private _computeTemperatureForIce(filled: Set<string>, iceConnectedTurn: number): number {
    return this._aggregateEnvStat(filled, 'heater', iceConnectedTurn);
  }

  /**
   * Compute the effective pressure for a specific ice tile, counting only pumps
   * (and the source) whose connection turn is ≤ {@link iceConnectedTurn}.
   *
   * Used symmetrically with {@link _computeTemperatureForIce} during re-evaluation.
   */
  private _computePressureForIce(filled: Set<string>, iceConnectedTurn: number): number {
    // The source is always connected first, so its pressure always counts for any ice tile.
    return this._aggregateEnvStat(filled, 'pump', iceConnectedTurn);
  }

  /**
   * A water impact large enough to drain the entire source and force an immediate
   * game-over.  Used as the penalty for sandstone tiles that become unpowered
   * (deltaDamage ≤ 0) after their initial connection — an illegal board state
   * that must be resolved immediately.
   */
  private get _drainAllImpact(): number {
    return -(this.sourceCapacity + 1);
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
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;
      if (PIPE_SHAPES.has(tile.shape)) {
        pipeCost++;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') {
          tankGain += tile.capacity;
        } else if (tile.chamberContent === 'dirt') {
          pipeCost += tile.cost;
        } else if (tile.chamberContent === 'ice') {
          const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
          pipeCost += tile.cost * deltaTemp;
        } else if (tile.chamberContent === 'snow') {
          const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
          pipeCost += snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
        } else if (tile.chamberContent === 'sandstone') {
          const { shatterOverride, deltaDamage, costPerDeltaTemp } =
            sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
          if (!shatterOverride) {
            const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
            // deltaDamage <= 0 is an invalid play state: drain all water to force immediate failure.
            pipeCost += deltaDamage >= 1
              ? costPerDeltaTemp * deltaTemp
              : this.sourceCapacity + 1;
          }
        } else if (tile.chamberContent === 'hot_plate') {
          const effectiveCost = tile.cost * (tile.temperature + currentTemp);
          const waterGain = Math.min(this.frozen, effectiveCost);
          const waterLoss = Math.max(0, effectiveCost - waterGain);
          // Net effect: gain from frozen minus direct water loss
          pipeCost += waterLoss - waterGain;
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
   *   any still-connected ice/snow tiles are re-evaluated.  Re-evaluation
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
    this.lastLockedCostChanges = [];
    const filled = this.getFilledPositions();
    const beneficialDisconnected = this._detectBeneficialDisconnect(filled);
    this._cleanupDisconnectedTiles(filled);
    this._turnNumber++;
    if (beneficialDisconnected) {
      this._reEvaluateConnectedTiles(filled);
    }
    this._lockNewTiles(filled);
  }

  /**
   * Returns true when any heater or pump that was previously connected is no
   * longer in the current fill set.  When true, still-connected cost tiles
   * must be re-evaluated to reflect the loss of the beneficial tile.
   */
  private _detectBeneficialDisconnect(filled: Set<string>): boolean {
    for (const key of this._lockedWaterImpact.keys()) {
      if (!filled.has(key)) {
        const [r, c] = parseKey(key);
        const tile = this.grid[r]?.[c];
        if (
          tile?.shape === PipeShape.Chamber &&
          ENV_MODIFIER_CONTENTS.has(tile.chamberContent!)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Remove locked impacts for tiles that are no longer in the fill path.
   * Adjusts the frozen counter for ice/snow/sandstone and hot_plate tiles
   * so the resource accounting stays correct after disconnection.
   */
  private _cleanupDisconnectedTiles(filled: Set<string>): void {
    for (const key of this._lockedWaterImpact.keys()) {
      if (!filled.has(key)) {
        const impact = this._lockedWaterImpact.get(key)!;
        const [r, c] = parseKey(key);
        const tile = this.grid[r]?.[c];
        if (tile?.shape === PipeShape.Chamber) {
          if (
            tile.chamberContent !== null && COLD_CHAMBER_CONTENTS.has(tile.chamberContent) &&
            impact < 0
          ) {
            // impact is negative (a cost); subtract it back out of frozen.
            this.frozen += impact;
          } else if (tile.chamberContent === 'hot_plate') {
            // Restore the frozen water that was consumed when this hot_plate connected.
            const waterGain = this._hotPlateWaterGain.get(key) ?? 0;
            this.frozen += waterGain;
            this._hotPlateWaterGain.delete(key);
          }
        }
        this._lockedWaterImpact.delete(key);
        this._connectionTurn.delete(key);
        this._lockedConnectTemp.delete(key);
        this._lockedConnectPressure.delete(key);
      }
    }
  }

  /**
   * Re-evaluate the locked water impact of still-connected cost tiles
   * (ice, snow, sandstone, hot_plate) after a beneficial tile (heater or
   * pump) was disconnected this turn.
   *
   * Re-computation uses historically-limited temperature and pressure so
   * no tile ever gains a retroactive benefit from a heater or pump that
   * connected after it did.
   */
  private _reEvaluateConnectedTiles(filled: Set<string>): void {
    for (const key of filled) {
      if (!this._lockedWaterImpact.has(key)) continue; // Newly connecting – handled below.

      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile || tile.shape !== PipeShape.Chamber) continue;
      if (tile.chamberContent === null || !TEMP_CHAMBER_CONTENTS.has(tile.chamberContent)) continue;

      const tileConnectedTurn = this._connectionTurn.get(key) ?? this._turnNumber;
      const effectiveTemp = this._computeTemperatureForIce(filled, tileConnectedTurn);
      const effectivePressure = this._computePressureForIce(filled, tileConnectedTurn);

      const oldImpact = this._lockedWaterImpact.get(key)!;
      let newImpact: number;

      if (tile.chamberContent === 'ice') {
        const deltaTemp = computeDeltaTemp(tile.temperature, effectiveTemp);
        newImpact = -(tile.cost * deltaTemp);
      } else if (tile.chamberContent === 'sandstone') {
        // Use historically-limited pressure so no tile benefits retroactively from
        // a pump that connected after it – consistent with ice and snow.
        const { shatterOverride, deltaDamage, costPerDeltaTemp } =
          sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, effectivePressure);
        const deltaTemp = computeDeltaTemp(tile.temperature, effectiveTemp);
        if (shatterOverride) {
          newImpact = 0;
        } else if (deltaDamage >= 1) {
          newImpact = -(costPerDeltaTemp * deltaTemp);
        } else {
          // Historical deltaDamage ≤ 0: the pump(s) that made sandstone viable at
          // connection time are now gone.  Force immediate failure.
          // Skip the frozen counter – this impact has no ice-accounting meaning.
          const failureImpact = this._drainAllImpact;
          if (failureImpact !== oldImpact) {
            this._lockedWaterImpact.set(key, failureImpact);
            this.lastLockedCostChanges.push({ row: r, col: c, delta: failureImpact - oldImpact });
          }
          continue;
        }
      } else if (tile.chamberContent === 'hot_plate') {
        // Re-evaluate using historically-limited temperature at connection time.
        const newEffectiveCost = tile.cost * (tile.temperature + effectiveTemp);
        const oldWaterGain = this._hotPlateWaterGain.get(key) ?? 0;
        // Restore the frozen water consumed at lock time, then re-apply with the
        // new effective cost so the frozen counter stays accurate.
        const restoredFrozen = this.frozen + oldWaterGain;
        const newWaterGain = Math.min(restoredFrozen, newEffectiveCost);
        newImpact = newWaterGain - Math.max(0, newEffectiveCost - newWaterGain);
        if (newImpact !== oldImpact) {
          this.frozen = restoredFrozen - newWaterGain;
          this._hotPlateWaterGain.set(key, newWaterGain);
          this._lockedWaterImpact.set(key, newImpact);
          this.lastLockedCostChanges.push({ row: r, col: c, delta: newImpact - oldImpact });
        }
        // Always update the locked stats so the tooltip formula stays consistent with the cost.
        this._lockedConnectTemp.set(key, effectiveTemp);
        this._lockedConnectPressure.set(key, effectivePressure);
        continue; // Frozen and impact already updated above.
      } else {
        // snow: pressure-adjusted cost per deltaTemp unit
        const deltaTemp = computeDeltaTemp(tile.temperature, effectiveTemp);
        newImpact = -(snowCostPerDeltaTemp(tile.cost, effectivePressure) * deltaTemp);
      }

      if (newImpact !== oldImpact) {
        // Adjust the frozen-water display counter by the change in cost.
        this.frozen += oldImpact - newImpact;
        this._lockedWaterImpact.set(key, newImpact);
        this.lastLockedCostChanges.push({ row: r, col: c, delta: newImpact - oldImpact });
      }
      // Always update the locked stats so the tooltip formula stays consistent with the cost.
      this._lockedConnectTemp.set(key, effectiveTemp);
      this._lockedConnectPressure.set(key, effectivePressure);
    }
  }

  /**
   * Lock the water impact for each tile that is newly connected this turn.
   * Uses the current temperature and pressure at the moment this method runs.
   *
   * Two-pass approach: ice/snow/sandstone tiles are processed before hot_plate
   * tiles so that any water frozen this turn is visible to hot_plate tiles
   * connected on the same turn, regardless of BFS discovery order.
   */
  private _lockNewTiles(filled: Set<string>): void {
    const currentTemp = this._computeTemperatureFromFilled(filled);
    const currentPressure = this._computePressureFromFilled(filled);

    // First pass: all newly-connected tiles except hot_plate.
    const newHotPlateKeys: string[] = [];
    for (const key of filled) {
      if (this._lockedWaterImpact.has(key)) continue; // Already evaluated.

      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;

      // Defer hot_plate tiles to the second pass.
      if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'hot_plate') {
        newHotPlateKeys.push(key);
        continue;
      }

      let impact = 0;
      if (PIPE_SHAPES.has(tile.shape)) {
        impact = -1;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') {
          impact = tile.capacity;
        } else if (tile.chamberContent === 'dirt') {
          impact = -tile.cost;
        } else if (tile.chamberContent === 'ice') {
          const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
          impact = -(tile.cost * deltaTemp);
          this.frozen += tile.cost * deltaTemp;
        } else if (tile.chamberContent === 'snow') {
          const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
          const effectiveCost = snowCostPerDeltaTemp(tile.cost, currentPressure);
          impact = -(effectiveCost * deltaTemp);
          this.frozen += effectiveCost * deltaTemp;
        } else if (tile.chamberContent === 'sandstone') {
          const { shatterOverride, deltaDamage, costPerDeltaTemp } =
            sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
          const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
          if (shatterOverride) {
            impact = 0;
            // No frozen water consumed when shatter overrides to zero cost.
          } else if (deltaDamage >= 1) {
            // deltaDamage <= 0 is an invalid play state: drain all water to force immediate failure.
            impact = -(costPerDeltaTemp * deltaTemp);
            this.frozen += costPerDeltaTemp * deltaTemp;
          } else {
            impact = this._drainAllImpact;
          }
        }
        // 'heater', 'pump', and 'item': no direct water impact (impact stays 0).
      }
      // Source, Sink, Empty, Granite, Tree: no water impact (impact stays 0).

      this._recordLockedTileState(key, impact, currentTemp, currentPressure);
    }

    // Second pass: lock hot_plate tiles after all ice/snow/sandstone have updated frozen,
    // so newly-frozen water this turn counts toward what the hot_plate can re-melt.
    for (const key of newHotPlateKeys) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;
      // effectiveCost = mass × (temp + playerTemp)
      const effectiveCost = tile.cost * (tile.temperature + currentTemp);
      // First consume from frozen, then from water
      const waterGain = Math.min(this.frozen, effectiveCost);
      const waterLoss = Math.max(0, effectiveCost - waterGain);
      this.frozen -= waterGain;
      const impact = waterGain - waterLoss;
      this._hotPlateWaterGain.set(key, waterGain);

      this._recordLockedTileState(key, impact, currentTemp, currentPressure);
    }
  }

  /**
   * Record the locked water impact and connection stats for a newly-connected tile.
   * Called once per tile from {@link _lockNewTiles} when the impact has been computed.
   * The temperature and pressure are stored so that the tooltip can reconstruct the
   * formula used at connection time, even if conditions change later.
   */
  private _recordLockedTileState(key: string, impact: number, temp: number, pressure: number): void {
    this._lockedWaterImpact.set(key, impact);
    this._connectionTurn.set(key, this._turnNumber);
    this._lockedConnectTemp.set(key, temp);
    this._lockedConnectPressure.set(key, pressure);
  }

  /**
   * Return the locked water impact for the tile at the given position, or
   * `null` if that tile has not yet been evaluated by {@link applyTurnDelta}.
   * A negative return value represents a water cost; positive represents a gain.
   * Used by the UI to display the actual locked cost of an ice tile in the tooltip.
   */
  getLockedWaterImpact(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._lockedWaterImpact.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return the locked frozen water consumed (waterGain) for a hot_plate tile at the given
   * position, or `null` if that tile is not a connected hot_plate.
   * Used by the UI to display the gain/loss breakdown for hot_plate tiles.
   */
  getLockedHotPlateGain(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._hotPlateWaterGain.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return the board temperature that was recorded when the tile at the given position
   * first connected, or `null` if that tile has not yet been evaluated.
   * Used by the UI to reconstruct the locked calculation text in tile tooltips.
   */
  getLockedConnectTemp(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._lockedConnectTemp.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return the board pressure that was recorded when the tile at the given position
   * first connected, or `null` if that tile has not yet been evaluated.
   * Used by the UI to reconstruct the locked calculation text in tile tooltips.
   */
  getLockedConnectPressure(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._lockedConnectPressure.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return the cement setting time for the given position, or `null` if the position
   * is not a cement cell.  Used by the UI to display the cement status in tooltips
   * and to render the appropriate background / shadow effect.
   */
  getCementDryingTime(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this.cementData.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Check whether the cement at `pos` prevents an adjustment operation (T = 0).
   * When `tile` is provided the check only applies to player-placed pipe tiles
   * (regular or gold); omit or pass `null` to apply the check unconditionally.
   * Sets {@link lastError} / {@link lastErrorTilePositions} when blocked.
   * @returns `true` if the operation is blocked by hardened cement, `false` otherwise.
   */
  private _isCementHardened(pos: GridPos, tile?: Tile | null): boolean {
    const key = posKey(pos.row, pos.col);
    if (!this.cementData.has(key)) return false;
    if (tile != null && !PIPE_SHAPES.has(tile.shape) && !GOLD_PIPE_SHAPES.has(tile.shape)) return false;
    if (this.cementData.get(key)! === 0) {
      this.lastError = 'Items placed in hardened cement may not be adjusted.';
      this.lastErrorTilePositions = [pos];
      return true;
    }
    return false;
  }

  /**
   * Decrement the setting time of a cement cell at `pos` after a successful
   * adjustment operation (reclaim, replace, or rotate).
   * When `tile` is provided the decrement only applies to player-placed pipe tiles
   * (regular or gold); omit or pass `null` to apply unconditionally.
   * Sets {@link lastCementDecrement} to `pos` when a decrement occurs.
   */
  private _applyCementDecrement(pos: GridPos, tile?: Tile | null): void {
    const key = posKey(pos.row, pos.col);
    if (!this.cementData.has(key)) return;
    if (tile != null && !PIPE_SHAPES.has(tile.shape) && !GOLD_PIPE_SHAPES.has(tile.shape)) return;
    const dryingTime = this.cementData.get(key)!;
    if (dryingTime > 0) {
      this.cementData.set(key, dryingTime - 1);
      this.lastCementDecrement = { row: pos.row, col: pos.col };
    }
  }

  /**
   * Run all three constraint checks (sandstone → heater → pump) in order,
   * stopping at the first failure.  Convenience wrapper used by
   * {@link placeInventoryTile}, {@link replaceInventoryTile},
   * {@link reclaimTile}, {@link rotateTile}, and {@link rotateTileBy}
   * to avoid duplicating the short-circuit chain.
   * @param filled - Current fill set (after the board mutation).
   * @returns The first error message found, or `null` if all constraints pass.
   */
  private _validateConstraints(filled: Set<string>): string | null {
    const sandstoneError = this._checkSandstoneConstraints(filled);
    const heaterError = sandstoneError ? null : this._checkHeaterConstraints(filled);
    const pumpError = (sandstoneError || heaterError) ? null : this._checkPumpConstraints(filled);
    return sandstoneError ?? heaterError ?? pumpError;
  }

  /**
   * Returns `true` when the tile at the given position can be reclaimed or
   * replaced by the player.  A tile passes this check when it is non-fixed,
   * non-empty, and is not a Source, Sink, Chamber, obstacle, or spinner pipe.
   * Setting `lastError` / `lastErrorTilePositions` is the caller's responsibility.
   */
  private _isReplaceableTile(tile: Tile | null | undefined): tile is Tile {
    if (!tile || tile.isFixed || tile.shape === PipeShape.Empty) return false;
    return (
      tile.shape !== PipeShape.Source &&
      tile.shape !== PipeShape.Sink &&
      tile.shape !== PipeShape.Chamber &&
      !isObstacleTile(tile.shape) &&
      !SPIN_PIPE_SHAPES.has(tile.shape)
    );
  }

  /**
   * Adjust the inventory count for `shape` by `delta`.
   * Adds a new entry if the shape is not already present.
   * Used by {@link _reclaimInventory} and {@link _spendInventory}.
   */
  private _adjustInventory(shape: PipeShape, delta: number): void {
    const idx = this.inventory.findIndex((it) => it.shape === shape);
    if (idx !== -1) {
      this.inventory[idx].count += delta;
    } else {
      this.inventory.push({ shape, count: delta });
    }
  }

  /**
   * Increment the inventory count for `shape` by 1 (reclaim one tile from the board).
   * Adds a new entry with count=1 if the shape is not already present.
   */
  private _reclaimInventory(shape: PipeShape): void {
    this._adjustInventory(shape, +1);
  }

  /**
   * Decrement the inventory count for `shape` by 1 (spend one tile from the inventory).
   * When the shape has no base count (comes purely from container bonuses), pushes a
   * new entry with count=-1 to track the over-draw.
   */
  private _spendInventory(shape: PipeShape): void {
    this._adjustInventory(shape, -1);
  }

  /**
   * Undo a previous {@link _spendInventory} call for `shape`.
   * If the shape has an existing inventory entry, increments its count.
   * Otherwise, removes the sentinel over-draw entry (count === -1) that was
   * pushed by `_spendInventory` when the shape had no base inventory entry.
   */
  private _unspendInventory(shape: PipeShape): void {
    const idx = this.inventory.findIndex((it) => it.shape === shape);
    if (idx !== -1) {
      this.inventory[idx].count++;
    } else {
      const pushIdx = this.inventory.findIndex((it) => it.shape === shape && it.count < 0);
      if (pushIdx !== -1) this.inventory.splice(pushIdx, 1);
    }
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
    const violatingHistoricalLock: GridPos[] = [];
    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'sandstone') {
        if (this._lockedWaterImpact.has(key)) {
          // For already-connected sandstone, check the historically-limited pressure to
          // prevent disconnecting a pump that was required to make this tile viable at
          // connection time (i.e. a pump connected before the sandstone tile itself).
          const sandstoneConnectedTurn = this._connectionTurn.get(key) ?? this._turnNumber;
          const historicalPressure = this._computePressureForIce(filled, sandstoneConnectedTurn);
          if (historicalPressure - tile.hardness <= 0) {
            violatingHistoricalLock.push({ row: r, col: c });
          }
        } else {
          // For a newly-connecting tile, use the current pressure.
          const deltaDamage = currentPressure - tile.hardness;
          if (deltaDamage <= 0) {
            violating.push({ row: r, col: c });
          }
        }
      }
    }
    if (violatingHistoricalLock.length > 0) {
      this.lastErrorTilePositions = violatingHistoricalLock;
      return 'Cannot disconnect pressure tiles that were necessary in connecting these sandstone blocks.';
    }
    if (violating.length > 0) {
      const tile = this.grid[violating[0].row]?.[violating[0].col];
      const hardnessForMsg = tile?.hardness ?? 0;
      this.lastErrorTilePositions = violating;
      return `Pressure must exceed Sandstone hardness to connect. (Pressure: ${currentPressure}, Hardness: ${hardnessForMsg})`;
    }
    return null;
  }

  /**
   * Shared helper for {@link _checkHeaterConstraints} and {@link _checkPumpConstraints}.
   *
   * Checks whether the given environment stat value (temperature or pressure) has
   * gone negative after a board mutation.  When it has, collects all connected
   * Chamber tiles of type `content` whose contributing stat field is negative
   * (i.e. the tiles actually responsible for the negative value) and records them
   * in {@link lastErrorTilePositions}.
   *
   * @param filled       - Current fill set (after the board mutation).
   * @param content      - Chamber content type to blame: `'heater'` or `'pump'`.
   * @param currentValue - Pre-computed current value of the stat (temp or pressure).
   * @param constraintName - Human-readable name of the negative variant (e.g. `'Cooler'`).
   * @param statLabel    - Human-readable stat label for the error message (e.g. `'Temperature'`).
   * @returns An error message string if the stat is negative, or `null` if valid.
   */
  private _checkEnvStatConstraint(
    filled: Set<string>,
    content: 'heater' | 'pump',
    currentValue: number,
    constraintName: string,
    statLabel: string,
  ): string | null {
    if (currentValue >= 0) return null;
    const isTemp = content === 'heater';
    const violating: GridPos[] = [];
    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === content) {
        const stat = isTemp ? tile.temperature : tile.pressure;
        if (stat < 0) violating.push({ row: r, col: c });
      }
    }
    if (violating.length > 0) {
      this.lastErrorTilePositions = violating;
    }
    return `Connecting this ${constraintName} would reduce ${statLabel.toLowerCase()} below 0. (${statLabel}: ${currentValue})`;
  }

  /**
   * Check whether the current temperature (based on the fill set) is below 0.
   * A negative-temperature Heater (Cooler) that would bring the temperature below 0
   * must not be connected.  Similarly, disconnecting a positive Heater when the
   * resulting temperature would be negative is also invalid.
   * Sets {@link lastErrorTilePositions} to the offending Cooler tile(s).
   * @param filled - Current fill set (after the board mutation).
   * @returns An error message string if a violation is found, or `null` if valid.
   */
  private _checkHeaterConstraints(filled: Set<string>): string | null {
    return this._checkEnvStatConstraint(
      filled, 'heater', this._computeTemperatureFromFilled(filled), 'Cooler', 'Temperature',
    );
  }

  /**
   * Check whether the current pressure (based on the fill set) is below 0.
   * A negative-pressure Pump (Vacuum) that would bring the pressure below 0
   * must not be connected.  Similarly, disconnecting a positive Pump when the
   * resulting pressure would be negative is also invalid.
   * Sets {@link lastErrorTilePositions} to the offending Vacuum tile(s).
   * @param filled - Current fill set (after the board mutation).
   * @returns An error message string if a violation is found, or `null` if valid.
   */
  private _checkPumpConstraints(filled: Set<string>): string | null {
    return this._checkEnvStatConstraint(
      filled, 'pump', this._computePressureFromFilled(filled), 'Vacuum', 'Pressure',
    );
  }

  /**
   * Check for invalid temperature or pressure state caused by pre-connected
   * Heater/Pump tiles with negative values at level start.
   * Call this after {@link initHistory} to detect design-time errors.
   * @returns An error message string if a violation exists, or `null` if valid.
   */
  checkInitialStateErrors(): string | null {
    const filled = this.getFilledPositions();
    const heaterError = this._checkHeaterConstraints(filled);
    if (heaterError) return heaterError;
    return this._checkPumpConstraints(filled);
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
   * by newly connecting a sandstone tile, or by disconnecting a pump and dropping pressure),
   * or if temperature/pressure would drop below 0.
   * The rotation is reversed in that case.
   * @param pos - Grid coordinate.
   * @returns true if the rotation succeeded; false if it was blocked by a constraint.
   */
  rotateTile(pos: GridPos): boolean {
    this._clearLastError();
    const tile = this.getTile(pos);
    if (!tile) return false;

    // ── Cement constraint check (for player-placed pipe tiles only) ───────────
    if (this._isCementHardened(pos, tile)) return false;

    tile.rotate();

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0,
    // and that temperature/pressure don't go below 0.
    const filled = this.getFilledPositions();
    const constraintError = this._validateConstraints(filled);
    if (constraintError) {
      // Reverse the rotation (3 clockwise = 1 counter-clockwise).
      tile.rotate(); tile.rotate(); tile.rotate();
      this.lastError = constraintError;
      return false;
    }

    // Validate container-grant constraints: rotation may disconnect a container from
    // the fill path, which could leave placed tiles with no covering grant (inventory < 0).
    const newBonuses = this.getContainerBonuses(filled);
    for (const item of this.inventory) {
      if (item.count < 0) {
        const bonus = newBonuses.get(item.shape) ?? 0;
        if (item.count + bonus < 0) {
          tile.rotate(); tile.rotate(); tile.rotate();
          this.lastError = ERR_CONTAINER_ROTATE;
          return false;
        }
      }
    }

    // Decrement cement setting time after successful rotation
    this._applyCementDecrement(pos, tile);

    return true;
  }

  /**
   * Rotates the tile at `pos` clockwise by `steps × 90°` as a single game operation.
   * The sandstone constraint is validated only against the final rotation, so the
   * entire multi-step rotation either succeeds or is fully reverted.
   * Returns false if the tile is fixed/empty or if the final state violates constraints.
   */
  rotateTileBy(pos: GridPos, steps: number): boolean {
    this._clearLastError();
    const tile = this.getTile(pos);
    // Spinner pipes are pre-placed fixed tiles that the player is allowed to rotate.
    if (!tile || (tile.isFixed && !SPIN_PIPE_SHAPES.has(tile.shape)) || tile.shape === PipeShape.Empty) return false;

    // ── Cement constraint check (for player-placed pipe tiles only) ───────────
    if (this._isCementHardened(pos, tile)) return false;

    // Normalise to 0–3, handling both positive and negative values (e.g. -1 → 3).
    const normalizedSteps = ((steps % 4) + 4) % 4;
    if (normalizedSteps === 0) return true;
    for (let i = 0; i < normalizedSteps; i++) {
      tile.rotate();
    }
    // Validate the final state.
    const filled = this.getFilledPositions();
    const constraintError = this._validateConstraints(filled);
    if (constraintError) {
      // Revert by rotating the remaining steps to complete a full 360°.
      for (let i = 0; i < 4 - normalizedSteps; i++) {
        tile.rotate();
      }
      this.lastError = constraintError;
      return false;
    }

    // Validate container-grant constraints: rotation may disconnect a container from
    // the fill path, which could leave placed tiles with no covering grant (inventory < 0).
    const newBonuses = this.getContainerBonuses(filled);
    for (const item of this.inventory) {
      if (item.count < 0) {
        const bonus = newBonuses.get(item.shape) ?? 0;
        if (item.count + bonus < 0) {
          for (let i = 0; i < 4 - normalizedSteps; i++) {
            tile.rotate();
          }
          this.lastError = ERR_CONTAINER_ROTATE;
          return false;
        }
      }
    }

    // Decrement cement setting time after successful rotation
    this._applyCementDecrement(pos, tile);

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
    visited.add(posKey(this.source.row, this.source.col));

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dir of Object.values(Direction)) {
        if (!this.areMutuallyConnected(current, dir)) continue;
        const delta = NEIGHBOUR_DELTA[dir];
        const next: GridPos = { row: current.row + delta.row, col: current.col + delta.col };
        const key = posKey(next.row, next.col);
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
    return filled.has(posKey(this.sink.row, this.sink.col));
  }
}
