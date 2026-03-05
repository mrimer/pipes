import { Direction, PipeShape, Rotation, ConnectionSet } from './types';

/** Base connections for each pipe shape (at 0° rotation). */
const BASE_CONNECTIONS: Record<PipeShape, Direction[]> = {
  [PipeShape.Empty]:     [],
  [PipeShape.Straight]:  [Direction.North, Direction.South],
  [PipeShape.Elbow]:     [Direction.North, Direction.East],
  [PipeShape.Tee]:       [Direction.North, Direction.East, Direction.South],
  [PipeShape.Cross]:     [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Source]:    [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Sink]:      [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.Tank]:      [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.DirtBlock]: [Direction.North, Direction.East, Direction.South, Direction.West],
  [PipeShape.ItemContainer]: [Direction.North, Direction.East, Direction.South, Direction.West],
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
  /** Water capacity for Source and Tank tiles. */
  capacity: number;
  /** Water cost for DirtBlock tiles – deducted from the source when water flows through. */
  dirtCost: number;
  /** Inventory item shape granted when an ItemContainer tile is in the fill path. */
  itemShape: PipeShape | null;
  /** Number of inventory items granted by this ItemContainer tile. */
  itemCount: number;

  /**
   * @param shape - The pipe shape of this tile.
   * @param rotation - Initial rotation in degrees.
   * @param isFixed - If true the tile cannot be rotated by the player.
   * @param capacity - Water capacity (Source / Tank tiles only).
   * @param dirtCost - Water cost (DirtBlock tiles only).
   * @param itemShape - Inventory item shape (ItemContainer tiles only).
   * @param itemCount - Number of items granted (ItemContainer tiles only, defaults to 1).
   */
  constructor(shape: PipeShape, rotation: Rotation = 0, isFixed = false, capacity = 0, dirtCost = 0, itemShape: PipeShape | null = null, itemCount = 1) {
    this.shape = shape;
    this.rotation = rotation;
    this.isFixed = isFixed;
    this.capacity = capacity;
    this.dirtCost = dirtCost;
    this.itemShape = itemShape;
    this.itemCount = itemCount;
  }

  /** Rotate the tile 90° clockwise. */
  rotate(): void {
    if (this.isFixed) return;
    this.rotation = ((this.rotation + 90) % 360) as Rotation;
  }

  /** Returns the active connection set for this tile's current state. */
  get connections(): ConnectionSet {
    return getConnections(this.shape, this.rotation);
  }
}
