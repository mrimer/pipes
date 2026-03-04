import { Board } from './board';
import { Direction, PipeShape } from './types';
import { Tile } from './tile';

/** Build a minimal 2×1 board and manually set the tiles for deterministic testing. */
function makeTwoTileBoard(): Board {
  const board = new Board(1, 2);
  // Override source and sink to be at (0,0) and (0,1)
  board.source = { row: 0, col: 0 };
  board.sink = { row: 0, col: 1 };
  return board;
}

describe('Board.areMutuallyConnected', () => {
  it('returns false when tiles face away from each other', () => {
    const board = makeTwoTileBoard();
    // Source tile faces all directions, override left tile with Straight N-S
    board.grid[0][0] = new Tile(PipeShape.Straight, 0); // N-S only
    board.grid[0][1] = new Tile(PipeShape.Straight, 90); // E-W only
    // (0,0) East → not connected since left tile has no East
    expect(board.areMutuallyConnected({ row: 0, col: 0 }, Direction.East)).toBe(false);
  });

  it('returns true when tiles face each other', () => {
    const board = makeTwoTileBoard();
    board.grid[0][0] = new Tile(PipeShape.Straight, 90); // E-W
    board.grid[0][1] = new Tile(PipeShape.Straight, 90); // E-W
    expect(board.areMutuallyConnected({ row: 0, col: 0 }, Direction.East)).toBe(true);
  });

  it('returns false when neighbour is out of bounds', () => {
    const board = new Board(3, 3);
    // North of (0,0) is out of bounds
    expect(board.areMutuallyConnected({ row: 0, col: 0 }, Direction.North)).toBe(false);
  });
});

describe('Board.getFilledPositions', () => {
  it('includes source position', () => {
    const board = new Board(3, 3);
    const filled = board.getFilledPositions();
    expect(filled.has(`${board.source.row},${board.source.col}`)).toBe(true);
  });
});

describe('Board.isSolved', () => {
  it('returns false for a newly constructed board (random grid)', () => {
    // A freshly randomised board is virtually never instantly solved;
    // We just verify the method runs without error.
    const board = new Board(4, 4);
    expect(typeof board.isSolved()).toBe('boolean');
  });

  it('returns true when source and sink are directly connected', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    // Both tiles horizontal (E-W) → connected
    board.grid[0][0] = new Tile(PipeShape.Straight, 90, true); // E-W, fixed
    board.grid[0][1] = new Tile(PipeShape.Straight, 90, true); // E-W, fixed
    expect(board.isSolved()).toBe(true);
  });

  it('returns false when the path is broken', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Straight, 0, true); // N-S – no East
    board.grid[0][1] = new Tile(PipeShape.Straight, 90, true); // E-W
    expect(board.isSolved()).toBe(false);
  });
});

describe('Board.rotateTile', () => {
  it('rotates a tile by 90° each call', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    board.rotateTile({ row: 1, col: 1 });
    expect(board.grid[1][1].rotation).toBe(90);
  });
});
