import { Direction, PipeShape, Rotation, ConnectionSet, ChamberContent, TileDef } from './types';
import { bfs } from './bfs';

/** Base connections for each pipe shape (at 0° rotation). */
const BASE_CONNECTIONS: Record<PipeShape, Direction[]> = {
  [PipeShape.Empty]:     [],
  [PipeShape.EmptyFall]: [],
  [PipeShape.EmptyDark]: [],
  [PipeShape.EmptyWinter]: [],
  [PipeShape.Straight]:  [Direction.North, Direction.South],
  [PipeShape.Elbow]:     [Direction.North, Direction.East],
  [PipeShape.Tee]:       [Direction.North, Direction.East, Direction.South],
  [PipeShape.Cross]:     [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Source]:    [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Sink]:      [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Chamber]:       [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Granite]: [],
  [PipeShape.Tree]:    [],
  [PipeShape.Sea]:     [],
  [PipeShape.OneWay]:    [],
  [PipeShape.Cement]:  [],
  [PipeShape.GoldSpace]:    [],
  [PipeShape.GoldStraight]: [Direction.North, Direction.South],
  [PipeShape.GoldElbow]:    [Direction.North, Direction.East],
  [PipeShape.GoldTee]:      [Direction.North, Direction.East, Direction.South],
  [PipeShape.GoldCross]:    [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.SpinStraight]: [Direction.North, Direction.South],
  [PipeShape.SpinElbow]:    [Direction.North, Direction.East],
  [PipeShape.SpinTee]:      [Direction.North, Direction.East, Direction.South],
  [PipeShape.SpinStraightCement]: [Direction.North, Direction.South],
  [PipeShape.SpinElbowCement]:    [Direction.North, Direction.East],
  [PipeShape.SpinTeeCement]:      [Direction.North, Direction.East, Direction.South],
  [PipeShape.LeakyStraight]: [Direction.North, Direction.South],
  [PipeShape.LeakyElbow]:    [Direction.North, Direction.East],
  [PipeShape.LeakyTee]:      [Direction.North, Direction.East, Direction.South],
  [PipeShape.LeakyCross]:    [Direction.North, Direction.East, Direction.South, Direction.West],
};

/**
 * Rotate a single direction clockwise by 90°.
 * @param dir - The direction to rotate.
 * @returns The rotated direction.
 */
export function rotateDirection(dir: Direction): Direction {
  switch (dir) {
    case Direction.North: return Direction.East;
    case Direction.East:  return Direction.South;
    case Direction.South: return Direction.West;
    case Direction.West:  return Direction.North;
  }
}

/**
 * Compute the open connection directions for a tile given its shape and rotation.
 * @param shape - The pipe shape.
 * @param rotation - The current rotation in degrees (0, 90, 180 or 270).
 * @returns The set of directions this tile connects to.
 */
export function getConnections(shape: PipeShape, rotation: Rotation): ConnectionSet {
  const steps = rotation / 90;
  const dirs = BASE_CONNECTIONS[shape].map((dir) => {
    let d = dir;
    for (let i = 0; i < steps; i++) d = rotateDirection(d);
    return d;
  });
  return new Set(dirs);
}

/**
 * Return the direction directly opposite to the given one.
 * @param dir - A cardinal direction.
 * @returns The opposite direction.
 */
export function oppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case Direction.North: return Direction.South;
    case Direction.East:  return Direction.West;
    case Direction.South: return Direction.North;
    case Direction.West:  return Direction.East;
  }
}

/** Represents a single tile on the game board. */
export class Tile {
  shape: PipeShape;
  rotation: Rotation;
  readonly isFixed: boolean;
  /** Water capacity for Source and Chamber-tank tiles. */
  capacity: number;
  /** Water cost for Chamber cost tiles (dirt, ice, snow, sandstone, hot_plate) – deducted from the source when water flows through. */
  cost: number;
  /** Inventory item shape granted when a Chamber-item tile is in the fill path. */
  itemShape: PipeShape | null;
  /** Number of inventory items granted by this Chamber-item tile. */
  itemCount: number;
  /**
   * Content type for Chamber tiles – determines the chamber's behavior.
   * 'tank' adds water capacity, 'dirt' wastes water, 'item' grants inventory items,
   * 'heater' raises the source temperature, 'ice' reduces capacity by cost×deltaTemp,
   * 'pump' increases the game Pressure variable, 'snow' reduces capacity like ice
   * but divides cost by Pressure (rounded up) before multiplying by tempDelta,
   * 'sandstone' reduces capacity like snow but uses deltaDamage (Pressure−Hardness)
   * as the divisor; connecting is blocked when deltaDamage ≤ 0.
   * 'hot_plate' has a unique application: effectiveCost = mass×(temp+playerTemp);
   * first, the amount is taken from the frozen variable (adding back to water capacity),
   * then any remaining cost is subtracted from water capacity.
   */
  chamberContent: ChamberContent | null;
  /**
   * Optional explicit connection set that overrides the rotation-based computation.
   * Used for Source, Sink, and Chamber tiles whose open sides are defined per-tile in the level.
   */
  customConnections: ConnectionSet | null;
  /**
   * Temperature value. For Source tiles: base temperature of the water supply.
   * For Chamber-heater tiles: temperature bonus added to the source when connected.
   * For Chamber-ice/snow/sandstone/hot plate tiles: the temperature (impacts water cost when connected).
   * Defaults to 0.
   */
  temperature: number;

  /**
   * Pressure value. For Source tiles: the base/starting pressure.
   * For Chamber-pump tiles: the amount added to the game Pressure variable when connected.
   */
  pressure: number;

  /**
   * Hardness value. For Chamber-sandstone tiles: subtracted from Pressure to compute deltaDamage.
   * deltaDamage = Pressure − Hardness. Used as the cost divisor instead of Pressure.
   * Defaults to 0.
   */
  hardness: number;

  /**
   * Shatter value. For Chamber-sandstone tiles: when Shatter > Hardness and
   * Pressure >= Shatter, the tile's effective cost is overridden to 0.
   * Only meaningful when Shatter > Hardness.  Defaults to 0 (inactive).
   */
  shatter: number;

  /**
   * @param shape - The pipe shape of this tile.
   * @param rotation - Initial rotation in degrees.
   * @param isFixed - If true the tile cannot be rotated by the player.
   * @param capacity - Water capacity (Source / Chamber-tank tiles only).
   * @param cost - Water cost (Chamber-dirt/ice/snow/sandstone/hot plate tiles).
   * @param itemShape - Inventory item shape (Chamber-item tiles only).
   * @param itemCount - Number of items granted (Chamber-item tiles only, defaults to 1).
   * @param customConnections - Explicit connection set (Source, Sink, or Chamber tiles; overrides rotation-based default).
   * @param chamberContent - Content type for Chamber tiles ('tank', 'dirt', 'item', 'heater', 'ice', 'pump', 'snow', 'sandstone', 'star', 'hot_plate', or 'level').
   * @param temperature - Temperature value for Source (base temp), Heater (additive bonus), Ice/Snow/Sandstone/Hot Plate (cost factor).
   * @param pressure - Pressure value: base pressure for Source tiles; additive bonus for Pump tiles. Defaults to 0.
   * @param hardness - Hardness value for Sandstone tiles (subtracted from Pressure to get deltaDamage). Defaults to 0.
   * @param shatter - Shatter value for Sandstone tiles. When > Hardness and Pressure >= Shatter, effective cost is 0. Defaults to 0.
   */
  constructor(shape: PipeShape, rotation: Rotation = 0, isFixed = false, capacity = 0, cost = 0, itemShape: PipeShape | null = null, itemCount = 1, customConnections: ConnectionSet | null = null, chamberContent: ChamberContent | null = null, temperature = 0, pressure = 0, hardness = 0, shatter = 0) {
    this.shape = shape;
    this.rotation = rotation;
    this.isFixed = isFixed;
    this.capacity = capacity;
    this.cost = cost;
    this.itemShape = itemShape;
    this.itemCount = itemCount;
    this.customConnections = customConnections;
    this.chamberContent = chamberContent;
    this.temperature = temperature;
    this.pressure = pressure;
    this.hardness = hardness;
    this.shatter = shatter;
  }

  /** Return a deep copy of this tile. */
  clone(): Tile {
    return new Tile(
      this.shape,
      this.rotation,
      this.isFixed,
      this.capacity,
      this.cost,
      this.itemShape,
      this.itemCount,
      this.customConnections !== null ? new Set(this.customConnections) : null,
      this.chamberContent,
      this.temperature,
      this.pressure,
      this.hardness,
      this.shatter,
    );
  }

  /** Rotate the tile 90° clockwise. */
  rotate(): void {
    if (this.isFixed) return;
    this.rotation = ((this.rotation + 90) % 360) as Rotation;
  }

  /** Returns the active connection set for this tile's current state. */
  get connections(): ConnectionSet {
    if (this.customConnections !== null) return this.customConnections;
    return getConnections(this.shape, this.rotation);
  }
}

// ─── Direction deltas ─────────────────────────────────────────────────────────

const DIRECTION_DELTA: Record<Direction, { row: number; col: number }> = {
  [Direction.North]: { row: -1, col:  0 },
  [Direction.East]:  { row:  0, col:  1 },
  [Direction.South]: { row:  1, col:  0 },
  [Direction.West]:  { row:  0, col: -1 },
};

/**
 * Returns true when the tile at `pos` in `grid` is reachable from the
 * Source tile via mutually-connected pipe paths.  Uses a BFS over
 * the TileDef grid, so it can be called in editor contexts where no Board
 * instance is available.
 *
 * Returns false immediately when no Source tile is found in the grid.
 */
export function isTileConnectedToSource(
  grid: (TileDef | null)[][],
  pos: { row: number; col: number },
): boolean {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;

  // Find the source tile.
  let sourcePos: { row: number; col: number } | null = null;
  outer: for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c]?.shape === PipeShape.Source) {
        sourcePos = { row: r, col: c };
        break outer;
      }
    }
  }
  if (!sourcePos) return false;

  const reached = bfs(sourcePos, (current) => {
    const currentTile = grid[current.row]?.[current.col];
    if (!currentTile) return [];
    const currentConns = getConnections(currentTile.shape, (currentTile.rotation ?? 0) as Rotation);
    const neighbors: Array<{ row: number; col: number }> = [];
    for (const dir of currentConns) {
      const delta = DIRECTION_DELTA[dir];
      const next = { row: current.row + delta.row, col: current.col + delta.col };
      const nextTile = grid[next.row]?.[next.col];
      if (!nextTile) continue;
      const nextConns = getConnections(nextTile.shape, (nextTile.rotation ?? 0) as Rotation);
      if (!nextConns.has(oppositeDirection(dir))) continue;
      neighbors.push(next);
    }
    return neighbors;
  });

  return reached.has(`${pos.row},${pos.col}`);
}
