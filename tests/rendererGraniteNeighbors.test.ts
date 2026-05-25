import { Board } from '../src/board';
import { computeGraniteNeighbors } from '../src/renderer';
import { Tile } from '../src/tile';
import { PipeShape } from '../src/types';

describe('computeGraniteNeighbors', () => {
  it('treats off-grid neighbors as granite at level borders', () => {
    const board = new Board(2, 2);
    board.grid[0][0] = new Tile(PipeShape.Granite);

    const neighbors = computeGraniteNeighbors(board, 0, 0);

    expect(neighbors.north).toBe(true);
    expect(neighbors.west).toBe(true);
    expect(neighbors.nw).toBe(true);
    expect(neighbors.ne).toBe(true);
    expect(neighbors.sw).toBe(true);
    expect(neighbors.east).toBe(false);
    expect(neighbors.south).toBe(false);
    expect(neighbors.se).toBe(false);
  });

  it('still reports in-bounds granite adjacency normally', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Granite);
    board.grid[1][0] = new Tile(PipeShape.Granite);
    board.grid[2][1] = new Tile(PipeShape.Granite);
    board.grid[0][2] = new Tile(PipeShape.Granite);

    const neighbors = computeGraniteNeighbors(board, 1, 1);

    expect(neighbors.west).toBe(true);
    expect(neighbors.south).toBe(true);
    expect(neighbors.ne).toBe(true);
    expect(neighbors.north).toBe(false);
    expect(neighbors.east).toBe(false);
    expect(neighbors.nw).toBe(false);
    expect(neighbors.sw).toBe(false);
    expect(neighbors.se).toBe(false);
  });
});
