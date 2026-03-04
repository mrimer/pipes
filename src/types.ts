/** Shared TypeScript types and enums for the Pipes puzzle game. */

/** The four cardinal directions used for pipe connections. */
export enum Direction {
  North = 'N',
  East = 'E',
  South = 'S',
  West = 'W',
}

/**
 * Pipe shapes defined by which directions they connect.
 * Key: shape name, Value: array of connected directions before rotation.
 */
export enum PipeShape {
  Empty = 'EMPTY',
  /** Straight pipe: North–South */
  Straight = 'STRAIGHT',
  /** Elbow pipe: North–East */
  Elbow = 'ELBOW',
  /** T-junction: North–East–South */
  Tee = 'TEE',
  /** Cross junction: all four directions */
  Cross = 'CROSS',
  /** Source of water */
  Source = 'SOURCE',
  /** Sink / destination */
  Sink = 'SINK',
}

/** Valid rotation values (clockwise, in degrees). */
export type Rotation = 0 | 90 | 180 | 270;

/** A grid coordinate. */
export interface GridPos {
  row: number;
  col: number;
}

/** The set of open connection directions for a given tile state. */
export type ConnectionSet = Set<Direction>;
