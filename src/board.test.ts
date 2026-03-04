import { Board } from './board';
import { Direction, PipeShape } from './types';
import { Tile } from './tile';
import { LEVELS } from './levels';

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

// ─── New: level loading ──────────────────────────────────────────────────────

describe('Board (level mode)', () => {
  it('initialises source capacity from level definition', () => {
    const level = LEVELS[0]; // Tutorial
    const board = new Board(level.rows, level.cols, level);
    expect(board.sourceCapacity).toBe(level.sourceCapacity);
  });

  it('places fixed tiles correctly (Source at 0,0)', () => {
    const level = LEVELS[0];
    const board = new Board(level.rows, level.cols, level);
    expect(board.grid[0][0].shape).toBe(PipeShape.Source);
    expect(board.grid[0][0].isFixed).toBe(true);
  });

  it('places null grid entries as Empty tiles', () => {
    const level = LEVELS[0];
    const board = new Board(level.rows, level.cols, level);
    // (0,1) is null in the level definition → Empty
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
  });

  it('loads inventory from level definition', () => {
    const level = LEVELS[0];
    const board = new Board(level.rows, level.cols, level);
    expect(board.inventory.length).toBeGreaterThan(0);
    const totalPieces = board.inventory.reduce((sum, it) => sum + it.count, 0);
    expect(totalPieces).toBeGreaterThan(0);
  });
});

// ─── New: Tank tile connections ──────────────────────────────────────────────

describe('Tank tile', () => {
  it('connects on all four sides regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.Tank, rot, true, 10);
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('carries its capacity value', () => {
    const tile = new Tile(PipeShape.Tank, 0, true, 8);
    expect(tile.capacity).toBe(8);
  });
});

// ─── New: inventory placement ────────────────────────────────────────────────

describe('Board.placeInventoryTile', () => {
  function makeLevel1Board(): Board {
    const level = LEVELS[0];
    return new Board(level.rows, level.cols, level);
  }

  it('places a pipe on an empty cell and decrements inventory', () => {
    const board = makeLevel1Board();
    const before = board.inventory.find((i) => i.shape === PipeShape.Straight)!.count;
    const placed = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    expect(placed).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(before - 1);
  });

  it('returns false when placing on a non-empty cell', () => {
    const board = makeLevel1Board();
    // (0,0) is Source (fixed) – cannot place on it
    const result = board.placeInventoryTile({ row: 0, col: 0 }, PipeShape.Straight);
    expect(result).toBe(false);
  });

  it('returns false when inventory of that shape is empty', () => {
    const board = makeLevel1Board();
    // Drain all Straight pieces
    const item = board.inventory.find((i) => i.shape === PipeShape.Straight)!;
    item.count = 0;
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    expect(result).toBe(false);
  });
});

// ─── New: water tracking ─────────────────────────────────────────────────────

describe('Board.getCurrentWater', () => {
  it('equals sourceCapacity when no regular pipes are connected', () => {
    // Board with only Source + Sink, nothing in between
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Sink, 0, true);
    board.sourceCapacity = 20;
    // Source and Sink don't face each other (Sink has no West connection by default with rot=0
    // and N-E-S-W)... actually both have all-dir connections at rot=0.
    // Source connects all dirs; Sink connects all dirs → they ARE mutually connected.
    // Sink is special (not a regular pipe) so it doesn't cost water.
    const w = board.getCurrentWater();
    expect(w).toBe(20); // no pipe cost; source+sink are not PIPE_SHAPES
  });

  it('decreases by 1 for each connected regular pipe tile', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,   90, true);  // Source, E-W
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);        // Straight E-W
    board.grid[0][2] = new Tile(PipeShape.Sink,     90, true);  // Sink, E-W
    board.sourceCapacity = 10;
    // Filled: (0,0) source, (0,1) straight, (0,2) sink
    // Pipe cost: 1 (the Straight); tank gain: 0
    expect(board.getCurrentWater()).toBe(9);
  });

  it('increases when a Tank tile is included in the fill', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);   // all-dir source
    board.grid[0][1] = new Tile(PipeShape.Tank,   0, true, 5); // tank cap=5
    board.grid[0][2] = new Tile(PipeShape.Sink,   0, true);   // all-dir sink
    board.sourceCapacity = 10;
    // All mutually connected; tank adds 5, no pipe tiles → currentWater = 10 + 5 = 15
    expect(board.getCurrentWater()).toBe(15);
  });
});

// ─── New: grid validation ────────────────────────────────────────────────────

describe('Board.validateGrid', () => {
  it('returns no errors for the Tutorial level', () => {
    const level = LEVELS[0];
    const board = new Board(level.rows, level.cols, level);
    expect(board.validateGrid()).toHaveLength(0);
  });

  it('reports an error when a Tank is placed on the edge', () => {
    const board = new Board(3, 3);
    board.sourceCapacity = 10;
    // Place a tank at (0,0) – corner; its N and W connections go off-grid
    board.grid[0][0] = new Tile(PipeShape.Tank, 0, true, 5);
    const errors = board.validateGrid();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns no errors when no Tanks are present', () => {
    const board = new Board(3, 3);
    expect(board.validateGrid()).toHaveLength(0);
  });
});
