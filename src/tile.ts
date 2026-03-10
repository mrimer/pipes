import { Direction, PipeShape, Rotation, ConnectionSet, ChamberContent } from './types';

/** Base connections for each pipe shape (at 0° rotation). */
const BASE_CONNECTIONS: Record<PipeShape, Direction[]> = {
  [PipeShape.Empty]:     [],
  [PipeShape.Straight]:  [Direction.North, Direction.South],
  [PipeShape.Elbow]:     [Direction.North, Direction.East],
  [PipeShape.Tee]:       [Direction.North, Direction.East, Direction.South],
  [PipeShape.Cross]:     [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Source]:    [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Sink]:      [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Chamber]:       [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Granite]: [],
  [PipeShape.GoldSpace]:    [],
  [PipeShape.GoldStraight]: [Direction.North, Direction.South],
  [PipeShape.GoldElbow]:    [Direction.North, Direction.East],
  [PipeShape.GoldTee]:      [Direction.North, Direction.East, Direction.South],
  [PipeShape.GoldCross]:    [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.SpinStraight]: [Direction.North, Direction.South],
  [PipeShape.SpinElbow]:    [Direction.North, Direction.East],
  [PipeShape.SpinTee]:      [Direction.North, Direction.East, Direction.South],
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
  /** Water cost for Chamber-damage tiles – deducted from the source when water flows through. */
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
   * @param shape - The pipe shape of this tile.
   * @param rotation - Initial rotation in degrees.
   * @param isFixed - If true the tile cannot be rotated by the player.
   * @param capacity - Water capacity (Source / Chamber-tank tiles only).
   * @param cost - Water cost (Chamber-dirt/ice/snow/sandstone/hot plate tiles).
   * @param itemShape - Inventory item shape (Chamber-item tiles only).
   * @param itemCount - Number of items granted (Chamber-item tiles only, defaults to 1).
   * @param customConnections - Explicit connection set (Source, Sink, or Chamber tiles; overrides rotation-based default).
   * @param chamberContent - Content type for Chamber tiles ('tank', 'dirt', 'item', 'heater', 'ice', 'pump', 'snow', 'sandstone', or 'hot plate').
   * @param temperature - Temperature value for Source (base temp), Heater (additive bonus), Ice/Snow/Sandstone/Hot Plate (cost factor).
   * @param pressure - Pressure value: base pressure for Source tiles; additive bonus for Pump tiles. Defaults to 0.
   * @param hardness - Hardness value for Sandstone tiles (subtracted from Pressure to get deltaDamage). Defaults to 0.
   */
  constructor(shape: PipeShape, rotation: Rotation = 0, isFixed = false, capacity = 0, cost = 0, itemShape: PipeShape | null = null, itemCount = 1, customConnections: ConnectionSet | null = null, chamberContent: ChamberContent | null = null, temperature = 0, pressure = 0, hardness = 0) {
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
