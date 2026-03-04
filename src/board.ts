import { Tile, oppositeDirection } from './tile';
import { Direction, GridPos, PipeShape, Rotation } from './types';

/** Neighbour offsets keyed by direction. */
const NEIGHBOUR_DELTA: Record<Direction, GridPos> = {
  [Direction.North]: { row: -1, col:  0 },
  [Direction.East]:  { row:  0, col:  1 },
  [Direction.South]: { row:  1, col:  0 },
  [Direction.West]:  { row:  0, col: -1 },
};

/**
 * The game board – a 2-D grid of {@link Tile} objects.
 * Contains all game logic for path-finding and win detection.
 */
export class Board {
  readonly rows: number;
  readonly cols: number;
  readonly grid: Tile[][];
  source: GridPos;
  sink: GridPos;

  /**
   * @param rows - Number of rows.
   * @param cols - Number of columns.
   */
  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.source = { row: 0, col: 0 };
    this.sink = { row: rows - 1, col: cols - 1 };
    this.grid = this._buildGrid();
  }

  /** Build a randomised grid for a new puzzle. */
  private _buildGrid(): Tile[][] {
    const grid: Tile[][] = [];
    const shapes: PipeShape[] = [
      PipeShape.Straight,
      PipeShape.Elbow,
      PipeShape.Tee,
      PipeShape.Cross,
    ];

    for (let r = 0; r < this.rows; r++) {
      grid[r] = [];
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
