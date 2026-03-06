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
  /** Water cost for Chamber-dirt and Chamber-ice tiles – deducted from the source when water flows through. */
  dirtCost: number;
  /** Inventory item shape granted when a Chamber-item tile is in the fill path. */
  itemShape: PipeShape | null;
  /** Number of inventory items granted by this Chamber-item tile. */
  itemCount: number;
  /**
   * Content type for Chamber tiles – determines the chamber's behavior.
   * 'tank' adds water capacity, 'dirt' wastes water, 'item' grants inventory items,
   * 'heater' raises the source temperature, 'ice' reduces capacity by cost×deltaTemp.
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
   * For Chamber-ice tiles: the threshold temperature (water costs dirtCost × max(0, temperature − currentTemp) when connected).
   * Defaults to 0.
   */
  temperature: number;

  /**
   * @param shape - The pipe shape of this tile.
   * @param rotation - Initial rotation in degrees.
   * @param isFixed - If true the tile cannot be rotated by the player.
   * @param capacity - Water capacity (Source / Chamber-tank tiles only).
   * @param dirtCost - Water cost (Chamber-dirt and Chamber-ice tiles).
   * @param itemShape - Inventory item shape (Chamber-item tiles only).
   * @param itemCount - Number of items granted (Chamber-item tiles only, defaults to 1).
   * @param customConnections - Explicit connection set (Source, Sink, or Chamber tiles; overrides rotation-based default).
   * @param chamberContent - Content type for Chamber tiles ('tank', 'dirt', 'item', 'heater', or 'ice').
   * @param temperature - Temperature value for Source (base temp), Heater (additive bonus), or Ice (threshold).
   */
  constructor(shape: PipeShape, rotation: Rotation = 0, isFixed = false, capacity = 0, dirtCost = 0, itemShape: PipeShape | null = null, itemCount = 1, customConnections: ConnectionSet | null = null, chamberContent: ChamberContent | null = null, temperature = 0) {
    this.shape = shape;
    this.rotation = rotation;
    this.isFixed = isFixed;
    this.capacity = capacity;
    this.dirtCost = dirtCost;
    this.itemShape = itemShape;
    this.itemCount = itemCount;
    this.customConnections = customConnections;
    this.chamberContent = chamberContent;
    this.temperature = temperature;
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
