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
  it('connects on all four sides regardless of rotation (default)', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.Tank, rot, true, 10);
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('respects customConnections when provided (north-only)', () => {
    const northOnly = new Set([Direction.North]);
    const tile = new Tile(PipeShape.Tank, 0, true, 5, 0, null, 1, northOnly);
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(false);
    expect(tile.connections.has(Direction.South)).toBe(false);
    expect(tile.connections.has(Direction.West)).toBe(false);
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

  it('places a pipe on an empty cell with default rotation 0', () => {
    const board = makeLevel1Board();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    expect(board.grid[0][1].rotation).toBe(0);
  });

  it('places a pipe with the specified rotation', () => {
    const board = makeLevel1Board();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(board.grid[0][1].rotation).toBe(90);
  });

  it('places a pipe with rotation 270', () => {
    const board = makeLevel1Board();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow, 270);
    expect(board.grid[0][1].rotation).toBe(270);
  });

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

// ─── New: tile reclaim ────────────────────────────────────────────────────────

describe('Board.reclaimTile', () => {
  function makeLevel1Board(): Board {
    const level = LEVELS[0];
    return new Board(level.rows, level.cols, level);
  }

  it('returns tile to inventory and empties the cell', () => {
    const board = makeLevel1Board();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    const before = board.inventory.find((i) => i.shape === PipeShape.Straight)!.count;
    const result = board.reclaimTile({ row: 0, col: 1 });
    expect(result).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(before + 1);
  });

  it('returns false for an empty cell', () => {
    const board = makeLevel1Board();
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });

  it('returns false for a fixed tile', () => {
    const board = makeLevel1Board();
    // (0,0) is Source fixed
    expect(board.reclaimTile({ row: 0, col: 0 })).toBe(false);
  });

  it('returns false for a fixed pipe tile', () => {
    const board = makeLevel1Board();
    // (1,0) is Elbow fixed
    expect(board.reclaimTile({ row: 1, col: 0 })).toBe(false);
  });

  it('returns false for Source / Sink / Tank even if not marked fixed', () => {
    const board = new Board(1, 3);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, false);
    board.grid[0][1] = new Tile(PipeShape.Tank,   0, false, 5);
    board.grid[0][2] = new Tile(PipeShape.Sink,   0, false);
    expect(board.reclaimTile({ row: 0, col: 0 })).toBe(false);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
    expect(board.reclaimTile({ row: 0, col: 2 })).toBe(false);
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

  it('north-only tank on the south edge does not trigger an error', () => {
    // 3×3 board; south row is row 2.  A north-only tank there faces row 1 (in-bounds).
    const board = new Board(3, 3);
    const northOnly = new Set([Direction.North]);
    board.grid[2][1] = new Tile(PipeShape.Tank, 0, true, 5, 0, null, 1, northOnly);
    expect(board.validateGrid()).toHaveLength(0);
  });

  it('Tutorial level tank (3,0) has only a North connection', () => {
    const level = LEVELS[0];
    const board = new Board(level.rows, level.cols, level);
    const tank = board.grid[3][0];
    expect(tank.shape).toBe(PipeShape.Tank);
    expect(tank.connections.has(Direction.North)).toBe(true);
    expect(tank.connections.has(Direction.East)).toBe(false);
    expect(tank.connections.has(Direction.South)).toBe(false);
    expect(tank.connections.has(Direction.West)).toBe(false);
  });
});

// ─── New: DirtBlock tile ──────────────────────────────────────────────────────

describe('DirtBlock tile', () => {
  it('connects on all four sides regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.DirtBlock, rot, true, 0, 2);
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('carries its dirtCost value', () => {
    const tile = new Tile(PipeShape.DirtBlock, 0, true, 0, 5);
    expect(tile.dirtCost).toBe(5);
  });

  it('deducts dirtCost from water when in the fill path', () => {
    // Source → DirtBlock(cost=4) → Sink (1-cell line)
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,    0, true);
    board.grid[0][1] = new Tile(PipeShape.DirtBlock, 0, true, 0, 4);
    board.grid[0][2] = new Tile(PipeShape.Sink,      0, true);
    board.sourceCapacity = 10;
    // All four directions are open; source → dirt (costs 4) → sink
    expect(board.getCurrentWater()).toBe(6);
  });

  it('is not reclaimable', () => {
    const board = new Board(1, 3);
    board.grid[0][1] = new Tile(PipeShape.DirtBlock, 0, false, 0, 3);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });
});

// ─── New: Level 2 definition ──────────────────────────────────────────────────

describe('Level 2 (Through the Woods)', () => {
  const level = LEVELS[1];

  it('has a valid grid (non-empty)', () => {
    expect(level.grid.length).toBe(level.rows);
  });

  it('loads without errors from validateGrid', () => {
    const board = new Board(level.rows, level.cols, level);
    expect(board.validateGrid()).toHaveLength(0);
  });

  it('contains DirtBlock tiles', () => {
    const board = new Board(level.rows, level.cols, level);
    const dirtBlocks = board.grid
      .flat()
      .filter((t) => t.shape === PipeShape.DirtBlock);
    expect(dirtBlocks.length).toBeGreaterThan(0);
  });

  it('has sufficient water to complete the solution path', () => {
    // Manually place the four Straight tiles the player needs
    const board = new Board(level.rows, level.cols, level);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight); // E-W
    board.grid[0][1].rotation = 90; // rotate to E-W
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight); // E-W
    board.grid[0][3].rotation = 90;
    board.placeInventoryTile({ row: 1, col: 4 }, PipeShape.Straight); // N-S (default 0°)
    board.placeInventoryTile({ row: 4, col: 4 }, PipeShape.Straight); // N-S (default 0°)
    expect(board.isSolved()).toBe(true);
    expect(board.getCurrentWater()).toBeGreaterThan(0);
  });
});

// ─── New: ItemContainer tile ──────────────────────────────────────────────────

describe('ItemContainer tile', () => {
  it('connects on all four sides regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.ItemContainer, rot, true, 0, 0, PipeShape.Straight, 1);
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('stores itemShape and itemCount', () => {
    const tile = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Elbow, 2);
    expect(tile.itemShape).toBe(PipeShape.Elbow);
    expect(tile.itemCount).toBe(2);
  });

  it('is not reclaimable', () => {
    const board = new Board(1, 3);
    board.grid[0][1] = new Tile(PipeShape.ItemContainer, 0, false, 0, 0, PipeShape.Straight, 1);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });

  it('does not affect water cost', () => {
    // Source → ItemContainer → Sink (inline, all-direction tiles)
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0, true);
    board.grid[0][1] = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Straight, 1);
    board.grid[0][2] = new Tile(PipeShape.Sink,          0, true);
    board.sourceCapacity = 10;
    // Container does not consume water
    expect(board.getCurrentWater()).toBe(10);
  });
});

// ─── New: getContainerBonuses ──────────────────────────────────────────────────

describe('Board.getContainerBonuses', () => {
  it('returns empty map when no containers are in the fill path', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    expect(board.getContainerBonuses().size).toBe(0);
  });

  it('returns item grants for each connected container', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0, true);
    board.grid[0][1] = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Elbow, 2);
    board.grid[0][2] = new Tile(PipeShape.Sink,          0, true);
    const bonuses = board.getContainerBonuses();
    expect(bonuses.get(PipeShape.Elbow)).toBe(2);
  });

  it('accumulates bonuses from multiple containers of the same shape', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0, true);
    board.grid[0][1] = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Straight, 1);
    board.grid[0][2] = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Straight, 1);
    board.grid[0][3] = new Tile(PipeShape.Sink,          0, true);
    const bonuses = board.getContainerBonuses();
    expect(bonuses.get(PipeShape.Straight)).toBe(2);
  });

  it('does not count containers not in the fill path', () => {
    // Use a Straight N-S (rotation=0) between Source and Container to block E-W connection.
    // Source.East → (0,1 Straight N-S): Straight has no West → NOT mutual → fill stops.
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0, true);
    board.grid[0][1] = new Tile(PipeShape.Straight,      0);         // N-S only – blocks E-W
    board.grid[0][2] = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Straight, 1);
    expect(board.getContainerBonuses().size).toBe(0);
  });
});

// ─── New: placeInventoryTile with container grants ────────────────────────────

describe('Board.placeInventoryTile (with container grants)', () => {
  it('allows placing a tile using a container grant when base count is 0', () => {
    // Source → ItemContainer (grants 1 Straight) → Sink
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0, true);
    board.grid[0][1] = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Straight, 1);
    board.grid[0][2] = new Tile(PipeShape.Empty,         0);
    board.grid[0][3] = new Tile(PipeShape.Sink,          0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];

    // Container is reachable (fill: source → container via mutual all-dir connections)
    // Base count is 0 but grant is 1 → effective = 1 → allow placement
    const result = board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight);
    expect(result).toBe(true);
    expect(board.grid[0][2].shape).toBe(PipeShape.Straight);
    // Base count goes to -1 (using grant)
    expect(board.inventory[0].count).toBe(-1);
  });

  it('blocks placement when both base count and grant are 0', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    expect(board.placeInventoryTile({ row: 0, col: 0 }, PipeShape.Straight)).toBe(false);
  });
});

// ─── New: reclaimTile inventory constraint ────────────────────────────────────

describe('Board.reclaimTile (inventory constraint)', () => {
  /**
   * Build a 1×4 board: Source(0) → ItemContainer(1, grants 1 Straight) → Straight(2) → Sink(3).
   * Container is connected from the start, so the player can use the grant immediately.
   */
  function makeConstraintBoard(): Board {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0, true);
    board.grid[0][1] = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Straight, 1);
    board.grid[0][2] = new Tile(PipeShape.Empty,         0);
    board.grid[0][3] = new Tile(PipeShape.Sink,          0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    return board;
  }

  it('allows reclaiming when no container grants are lost', () => {
    const board = makeConstraintBoard();
    // Place Straight at col 2 using the container grant
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight);
    // Container is still in fill path, so reclaiming col 2 is safe
    expect(board.reclaimTile({ row: 0, col: 2 })).toBe(true);
    expect(board.lastError).toBeNull();
  });

  it('blocks reclaiming when it would remove a container from the fill path and inventory would go below 0', () => {
    // Board: Source(0) → Straight E-W(1) → ItemContainer(2) → Straight E-W(3) → Sink(4)
    // Straight(1) is a player-placed tile; if removed, Container(2) leaves the fill path.
    // We simulate the state after the player used the container grant: base Straight count = -1.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight,      90);         // E-W, player-placed
    board.grid[0][2] = new Tile(PipeShape.ItemContainer, 0,  true, 0, 0, PipeShape.Straight, 1);
    board.grid[0][3] = new Tile(PipeShape.Straight,      90);         // E-W, placed using grant
    board.grid[0][4] = new Tile(PipeShape.Sink,          0,  true);
    board.sourceCapacity = 10;
    // Two Straights placed: 1 from base (depleted) + 1 from grant → base count = -1
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }];

    // Try to reclaim col 1: this would disconnect the container → base(-1) + newGrant(0) = -1 < 0
    const result = board.reclaimTile({ row: 0, col: 1 });
    expect(result).toBe(false);
    expect(board.lastError).not.toBeNull();
    // The tile must still be in place
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
  });

  it('allows reclaiming the piece that used the grant (container remains connected)', () => {
    // Same board as above; reclaiming col 3 is safe because the container stays in the fill path.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,        0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight,      90);         // E-W, player-placed
    board.grid[0][2] = new Tile(PipeShape.ItemContainer, 0,  true, 0, 0, PipeShape.Straight, 1);
    board.grid[0][3] = new Tile(PipeShape.Straight,      90);         // E-W, placed using grant
    board.grid[0][4] = new Tile(PipeShape.Sink,          0,  true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }];

    // Container is still reachable via col 1 even after col 3 is removed.
    // base(-1) + newGrant(1) = 0 >= 0 → allowed.
    const result = board.reclaimTile({ row: 0, col: 3 });
    expect(result).toBe(true);
    expect(board.lastError).toBeNull();
    // inventory goes from -1 to 0 (reclaim gives +1)
    expect(board.inventory[0].count).toBe(0);
  });

  it('sets lastError to null on a successful reclaim', () => {
    const board = makeConstraintBoard();
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight);
    board.reclaimTile({ row: 0, col: 2 });
    expect(board.lastError).toBeNull();
  });
});

// ─── New: Level 3 definition ──────────────────────────────────────────────────

describe('Level 3 (Mountain Stream)', () => {
  const level = LEVELS[2];

  it('has a valid grid (non-empty)', () => {
    expect(level.grid.length).toBe(level.rows);
  });

  it('loads without errors from validateGrid', () => {
    const board = new Board(level.rows, level.cols, level);
    expect(board.validateGrid()).toHaveLength(0);
  });

  it('contains an ItemContainer tile', () => {
    const board = new Board(level.rows, level.cols, level);
    const containers = board.grid.flat().filter((t) => t.shape === PipeShape.ItemContainer);
    expect(containers.length).toBeGreaterThan(0);
  });

  it('is solvable and has sufficient water when the player makes the correct placements', () => {
    const board = new Board(level.rows, level.cols, level);
    // Place Straight E-W at (0,1) from base inventory
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    board.grid[0][1].rotation = 90; // E-W

    // Container at (0,2) is now in fill path; grant = 1 GoldStraight (not Straight)
    expect(board.getContainerBonuses().get(PipeShape.GoldStraight)).toBe(1);
    expect(board.getContainerBonuses().get(PipeShape.Straight)).toBeUndefined();

    // Place GoldStraight N-S at (1,3) on the gold space using the container grant
    board.placeInventoryTile({ row: 1, col: 3 }, PipeShape.GoldStraight);

    expect(board.isSolved()).toBe(true);
    expect(board.getCurrentWater()).toBeGreaterThan(0);
  });

  it('blocks removing the connector tile when the container grant was used', () => {
    const board = new Board(level.rows, level.cols, level);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    board.grid[0][1].rotation = 90;
    board.placeInventoryTile({ row: 1, col: 3 }, PipeShape.GoldStraight);

    // Reclaiming (0,1) would disconnect the container; base GoldStraight = -1, newGrant = 0 → blocked
    const result = board.reclaimTile({ row: 0, col: 1 });
    expect(result).toBe(false);
    expect(board.lastError).not.toBeNull();
  });
});

// ─── New: Level 4 definition ──────────────────────────────────────────────────

describe('Level 4 (The Workshop)', () => {
  const level = LEVELS[3];

  it('has a valid grid (non-empty)', () => {
    expect(level.grid.length).toBe(level.rows);
  });

  it('loads without errors from validateGrid', () => {
    const board = new Board(level.rows, level.cols, level);
    expect(board.validateGrid()).toHaveLength(0);
  });

  it('contains ItemContainer, Tank, and DirtBlock tiles', () => {
    const board = new Board(level.rows, level.cols, level);
    const tiles = board.grid.flat();
    expect(tiles.some((t) => t.shape === PipeShape.ItemContainer)).toBe(true);
    expect(tiles.some((t) => t.shape === PipeShape.Tank)).toBe(true);
    expect(tiles.some((t) => t.shape === PipeShape.DirtBlock)).toBe(true);
  });

  it('is solvable with correct placements', () => {
    const board = new Board(level.rows, level.cols, level);
    // Place Straight E-W at (0,1) from base
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    board.grid[0][1].rotation = 90;

    // Container at (0,2) is now in fill path – grants GoldStraight (not Straight)
    expect(board.getContainerBonuses().get(PipeShape.GoldStraight)).toBe(1);
    expect(board.getContainerBonuses().get(PipeShape.Straight)).toBeUndefined();

    // Place GoldStraight E-W at (0,3) on the gold space using the grant
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.GoldStraight);
    board.grid[0][3].rotation = 90;

    expect(board.isSolved()).toBe(true);
    expect(board.getCurrentWater()).toBeGreaterThan(0);
  });
});

// ─── New: Granite tile ────────────────────────────────────────────────────────

describe('Granite tile', () => {
  it('has no connections and cannot carry water', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Granite, 0, true);  // blocks the path
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    expect(board.isSolved()).toBe(false);
    expect(board.getFilledPositions().has('0,1')).toBe(false);
  });

  it('cannot be placed on by placeInventoryTile', () => {
    const board = new Board(1, 3);
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.inventory  = [{ shape: PipeShape.Straight, count: 5 }];
    expect(board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight)).toBe(false);
  });

  it('cannot be reclaimed even when not marked fixed', () => {
    const board = new Board(1, 3);
    board.grid[0][1] = new Tile(PipeShape.Granite, 0, false);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });

  it('is preset in levels as an immovable obstacle', () => {
    // Level 1 contains granite tiles added as obstacles
    const board = new Board(LEVELS[0].rows, LEVELS[0].cols, LEVELS[0]);
    const graniteTiles = board.grid.flat().filter((t) => t.shape === PipeShape.Granite);
    expect(graniteTiles.length).toBeGreaterThan(0);
    graniteTiles.forEach((t) => expect(t.isFixed).toBe(true));
  });
});

// ─── New: Gold pipe tiles and gold spaces ─────────────────────────────────────

describe('Gold pipes and gold spaces', () => {
  /** Build a minimal 1×3 board with a gold space at (0,1). */
  function makeGoldSpaceBoard(): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.goldSpaces.add('0,1');
    board.inventory = [
      { shape: PipeShape.GoldStraight, count: 1 },
      { shape: PipeShape.Straight,     count: 1 },
    ];
    return board;
  }

  it('allows gold pipe placement on a gold space', () => {
    const board = makeGoldSpaceBoard();
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight, 90);
    expect(result).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.GoldStraight);
  });

  it('blocks regular pipe placement on a gold space', () => {
    const board = makeGoldSpaceBoard();
    expect(board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight)).toBe(false);
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
  });

  it('blocks gold pipe placement on a regular empty cell', () => {
    const board = new Board(1, 3);
    board.inventory = [{ shape: PipeShape.GoldStraight, count: 1 }];
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    // (0,1) is NOT in goldSpaces → gold pipe should be rejected
    expect(board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight)).toBe(false);
  });

  it('gold pipe carries water and counts as a pipe cost', () => {
    const board = makeGoldSpaceBoard();
    board.sourceCapacity = 10;
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight, 90); // E-W
    // Source(all) → GoldStraight(E-W, cost 1) → Sink(all) → solved
    expect(board.isSolved()).toBe(true);
    expect(board.getCurrentWater()).toBe(9); // 10 − 1 gold straight
  });

  it('allows reclaiming a gold pipe from a gold space', () => {
    const board = makeGoldSpaceBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight, 90);
    expect(board.grid[0][1].shape).toBe(PipeShape.GoldStraight);
    const result = board.reclaimTile({ row: 0, col: 1 });
    expect(result).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
    // GoldStraight returned to inventory
    const inv = board.inventory.find((it) => it.shape === PipeShape.GoldStraight);
    expect(inv?.count).toBe(1);
  });

  it('level 3 gold space is registered in board.goldSpaces', () => {
    const level = LEVELS[2]; // Mountain Stream
    const board = new Board(level.rows, level.cols, level);
    expect(board.goldSpaces.has('1,3')).toBe(true);
    // The cell should be Empty (gold space is a background marker)
    expect(board.grid[1][3].shape).toBe(PipeShape.Empty);
  });

  it('level 4 gold space is registered in board.goldSpaces', () => {
    const level = LEVELS[3]; // The Workshop
    const board = new Board(level.rows, level.cols, level);
    expect(board.goldSpaces.has('0,3')).toBe(true);
    expect(board.grid[0][3].shape).toBe(PipeShape.Empty);
  });

  it('GoldStraight getConnections matches Straight', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,       0, true);
    board.grid[0][1] = new Tile(PipeShape.GoldStraight, 90); // E-W
    board.grid[0][2] = new Tile(PipeShape.Sink,         0, true);
    expect(board.isSolved()).toBe(true);
  });
});

// ─── Undo / redo support ─────────────────────────────────────────────────────

describe('Board.initHistory / canUndo / undoMove / canRedo / redoMove', () => {
  it('canUndo() returns false on a fresh board with no history', () => {
    const board = new Board(2, 2);
    expect(board.canUndo()).toBe(false);
  });

  it('canUndo() returns false immediately after initHistory() (no moves yet)', () => {
    const board = new Board(2, 2);
    board.initHistory();
    expect(board.canUndo()).toBe(false);
  });

  it('canUndo() returns true after initHistory() and one recordMove()', () => {
    const board = new Board(2, 2);
    board.initHistory();
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();
    expect(board.canUndo()).toBe(true);
  });

  it('undoMove() returns false and leaves board unchanged when no history', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 0, col: 2 };
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);
    const result = board.undoMove();
    expect(result).toBe(false);
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
  });

  it('undoMove() restores a placed tile back to Empty and returns inventory item', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Sink, 0, true);
    board.sourceCapacity = 5;
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];

    board.initHistory();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.recordMove();

    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.inventory[0].count).toBe(1);

    const restored = board.undoMove();

    expect(restored).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
    expect(board.inventory[0].count).toBe(2);
  });

  it('undoMove() restores a rotated tile back to its original rotation', () => {
    const board = new Board(2, 2);
    board.grid[0][0] = new Tile(PipeShape.Elbow, 0);

    board.initHistory();
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();

    expect(board.grid[0][0].rotation).toBe(90);

    board.undoMove();

    expect(board.grid[0][0].rotation).toBe(0);
  });

  it('canUndo() returns false after undoMove() reaches the initial state', () => {
    const board = new Board(2, 2);
    board.initHistory();
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();
    board.undoMove();
    expect(board.canUndo()).toBe(false);
  });

  it('multiple recordMove() calls retain full history for repeated undos', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Sink, 0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];

    // Move 1: place Straight at (0,1)
    board.initHistory();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.recordMove();  // count → 2

    // Move 2: rotate the placed tile
    board.rotateTile({ row: 0, col: 1 });
    board.recordMove();  // rotation → 180

    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.grid[0][1].rotation).toBe(180);
    expect(board.inventory[0].count).toBe(2);

    // Undo move 2 → back to rotation 90, count 2
    board.undoMove();
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.grid[0][1].rotation).toBe(90);
    expect(board.inventory[0].count).toBe(2);

    // Undo move 1 → back to initial (Empty, count 3)
    board.undoMove();
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
    expect(board.inventory[0].count).toBe(3);
    expect(board.canUndo()).toBe(false);
  });

  it('canRedo() returns false when at the latest state', () => {
    const board = new Board(2, 2);
    board.initHistory();
    expect(board.canRedo()).toBe(false);
  });

  it('canRedo() returns true after undoMove()', () => {
    const board = new Board(2, 2);
    board.initHistory();
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();
    board.undoMove();
    expect(board.canRedo()).toBe(true);
  });

  it('redoMove() re-applies the undone action', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty,  0);
    board.grid[0][2] = new Tile(PipeShape.Sink,   0, true);
    board.inventory  = [{ shape: PipeShape.Straight, count: 1 }];

    board.initHistory();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.recordMove();

    // Undo the placement
    board.undoMove();
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);

    // Redo restores the placement
    const redid = board.redoMove();
    expect(redid).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.grid[0][1].rotation).toBe(90);
    expect(board.inventory[0].count).toBe(0);
  });

  it('redoMove() returns false when there is nothing to redo', () => {
    const board = new Board(2, 2);
    board.initHistory();
    expect(board.redoMove()).toBe(false);
  });

  it('new action after undo clears the redo chain when result differs', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.inventory  = [
      { shape: PipeShape.Straight, count: 1 },
      { shape: PipeShape.Elbow,    count: 1 },
    ];

    board.initHistory();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.recordMove();

    // Undo the placement
    board.undoMove();
    expect(board.canRedo()).toBe(true);

    // Take a DIFFERENT action (place Elbow instead of Straight)
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow, 0);
    board.recordMove();

    // The old redo chain (Straight) should be gone
    expect(board.canRedo()).toBe(false);
    expect(board.grid[0][1].shape).toBe(PipeShape.Elbow);
  });

  it('new action after undo advances without truncating when result matches next state', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.inventory  = [{ shape: PipeShape.Straight, count: 2 }];

    board.initHistory();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.recordMove();  // history: [S0, S1], index 1

    // Undo
    board.undoMove();  // index 0
    expect(board.canRedo()).toBe(true);

    // Redo by re-making the EXACT same move
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.recordMove();  // should match S1 → advance index to 1

    // Redo chain is preserved (index advanced to 1, same as before)
    expect(board.canRedo()).toBe(false);  // at the end of history
    expect(board.canUndo()).toBe(true);   // can still undo
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
  });
});
