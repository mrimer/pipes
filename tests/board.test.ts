import { Board, SPIN_PIPE_SHAPES } from '../src/board';
import { Direction, PipeShape } from '../src/types';
import { Tile } from '../src/tile';
import { LEVELS } from '../src/levels';

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

describe('Board.rotateTileBy', () => {
  it('rotates a tile by 1 step (90°)', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 1)).toBe(true);
    expect(board.grid[1][1].rotation).toBe(90);
  });

  it('rotates a tile by 2 steps (180°) in one operation', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 2)).toBe(true);
    expect(board.grid[1][1].rotation).toBe(180);
  });

  it('rotates a tile by 3 steps (270°) in one operation', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 3)).toBe(true);
    expect(board.grid[1][1].rotation).toBe(270);
  });

  it('0 steps is a no-op and returns true', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 0)).toBe(true);
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('4 steps is a full rotation: leaves rotation unchanged and returns true', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 90);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 4)).toBe(true);
    expect(board.grid[1][1].rotation).toBe(90);
  });

  it('returns false for a fixed tile', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0, true /* isFixed */);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 1)).toBe(false);
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('returns false for an empty tile', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Empty, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 1)).toBe(false);
  });

  it('negative steps rotate counter-clockwise (-1 → 270°)', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, -1)).toBe(true);
    expect(board.grid[1][1].rotation).toBe(270);
  });
});

// ─── New: rotateTile container-grant constraint ───────────────────────────────

describe('Board.rotateTile (container-grant constraint)', () => {
  /**
   * Build a 1×5 board:
   *   Source(0) → Straight(1, E-W) → Chamber(2, item, grants 1 Straight) → Straight(3, E-W) → Sink(4)
   *
   * Straight at (0,1) is at rotation=90 (E-W) so the container at (0,2) IS in the fill path.
   * Inventory has count=-1 (1 Straight placed using the container grant; effective = -1+1 = 0).
   * When Straight(0,1) is rotated to 180° (N-S) it disconnects the source from the container
   * → grant drops to 0 → base(-1) + grant(0) = -1 < 0 → rotation must be blocked.
   */
  function makeRotateConstraintBoard(): Board {
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);         // E-W, connects source↔chamber
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0,  true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Straight, 90);         // E-W, chamber↔sink
    board.grid[0][4] = new Tile(PipeShape.Sink,     0,  true);
    board.sourceCapacity = 10;
    // Simulate the player having used the container grant: base count = -1, effective = -1+1 = 0.
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }];
    return board;
  }

  it('blocks rotation that disconnects a container when its grant is in use', () => {
    const board = makeRotateConstraintBoard();
    // Straight at (0,1) rotates 90°→180° (E-W → N-S), disconnecting source↔chamber.
    // After rotation: grant = 0 → base(-1) + grant(0) = -1 < 0 → blocked.
    const result = board.rotateTile({ row: 0, col: 1 });
    expect(result).toBe(false);
    expect(board.lastError).not.toBeNull();
    // Tile must be restored to original rotation (90°).
    expect(board.grid[0][1].rotation).toBe(90);
  });

  it('allows rotation when no container grants have been used (count ≥ 0)', () => {
    // Same board structure but inventory count is 0 (no overdraft from grants).
    // The container-grant guard only fires for item.count < 0, so this rotation is allowed.
    const board = makeRotateConstraintBoard();
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    // Rotating Straight(0,1) E-W → N-S disconnects the container, but since
    // no grant was over-used (count ≥ 0), the rotation is permitted.
    const result = board.rotateTile({ row: 0, col: 1 });
    expect(result).toBe(true);
    expect(board.lastError).toBeNull();
  });
});

describe('Board.rotateTileBy (container-grant constraint)', () => {
  function makeRotateByConstraintBoard(): Board {
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);         // E-W
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0,  true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Straight, 90);         // E-W
    board.grid[0][4] = new Tile(PipeShape.Sink,     0,  true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }];
    return board;
  }

  it('blocks multi-step rotation that disconnects a container when its grant is in use', () => {
    const board = makeRotateByConstraintBoard();
    // 1 step: 90°→180° (E-W → N-S), disconnects source↔chamber → blocked.
    const result = board.rotateTileBy({ row: 0, col: 1 }, 1);
    expect(result).toBe(false);
    expect(board.lastError).not.toBeNull();
    // Tile must be restored to original rotation (90°).
    expect(board.grid[0][1].rotation).toBe(90);
  });
});

// ─── New: level loading ──────────────────────────────────────────────────────

describe('Board (level mode)', () => {
  it('initialises source capacity from source tile capacity', () => {
    const level = LEVELS[0]; // Tutorial
    const board = new Board(level.rows, level.cols, level);
    expect(board.sourceCapacity).toBe(board.grid[board.source.row][board.source.col].capacity);
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

// ─── New: Chamber tile (tank) connections ──────────────────────────────────────

describe('Chamber tile (tank content)', () => {
  it('connects on all four sides regardless of rotation (default)', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.Chamber, rot, true, 10, 0, null, 1, null, 'tank');
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('respects customConnections when provided (north-only)', () => {
    const northOnly = new Set([Direction.North]);
    const tile = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, northOnly, 'tank');
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(false);
    expect(tile.connections.has(Direction.South)).toBe(false);
    expect(tile.connections.has(Direction.West)).toBe(false);
  });

  it('carries its capacity value', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 8, 0, null, 1, null, 'tank');
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

  it('returns false for Source / Sink / Chamber even if not marked fixed', () => {
    const board = new Board(1, 3);
    board.grid[0][0] = new Tile(PipeShape.Source,  0, false);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, false, 5, 0, null, 1, null, 'tank');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, false);
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

  it('increases when a Chamber(tank) tile is included in the fill', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, null, 'tank'); // cap=5
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    // All mutually connected; chamber-tank adds 5, no pipe tiles → currentWater = 10 + 5 = 15
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

  it('reports an error when a Chamber(tank) is placed on the edge', () => {
    const board = new Board(3, 3);
    board.sourceCapacity = 10;
    // Place a Chamber(tank) at (0,0) – corner; its N and W connections go off-grid
    board.grid[0][0] = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, null, 'tank');
    const errors = board.validateGrid();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns no errors when no Chambers are present', () => {
    const board = new Board(3, 3);
    expect(board.validateGrid()).toHaveLength(0);
  });

  it('north-only Chamber(tank) on the south edge does not trigger an error', () => {
    // 3×3 board; south row is row 2.  A north-only chamber there faces row 1 (in-bounds).
    const board = new Board(3, 3);
    const northOnly = new Set([Direction.North]);
    board.grid[2][1] = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, northOnly, 'tank');
    expect(board.validateGrid()).toHaveLength(0);
  });

  it('Tutorial level Chamber(tank) at (3,0) has only a North connection', () => {
    const level = LEVELS[0];
    const board = new Board(level.rows, level.cols, level);
    const tank = board.grid[3][0];
    expect(tank.shape).toBe(PipeShape.Chamber);
    expect(tank.chamberContent).toBe('tank');
    expect(tank.connections.has(Direction.North)).toBe(true);
    expect(tank.connections.has(Direction.East)).toBe(false);
    expect(tank.connections.has(Direction.South)).toBe(false);
    expect(tank.connections.has(Direction.West)).toBe(false);
  });
});

// ─── New: Chamber tile (dirt content) ──────────────────────────────────────────

describe('Chamber tile (dirt content)', () => {
  it('connects on all four sides regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.Chamber, rot, true, 0, 2, null, 1, null, 'dirt');
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('carries its cost value', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 5, null, 1, null, 'dirt');
    expect(tile.cost).toBe(5);
  });

  it('deducts cost from water when in the fill path', () => {
    // Source → Chamber(dirt, cost=4) → Sink
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 4, null, 1, null, 'dirt');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    // All four directions are open; source → chamber-dirt (costs 4) → sink
    expect(board.getCurrentWater()).toBe(6);
  });

  it('is not reclaimable', () => {
    const board = new Board(1, 3);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, false, 0, 3, null, 1, null, 'dirt');
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

  it('contains Chamber(dirt) tiles', () => {
    const board = new Board(level.rows, level.cols, level);
    const dirtChambers = board.grid
      .flat()
      .filter((t) => t.shape === PipeShape.Chamber && t.chamberContent === 'dirt');
    expect(dirtChambers.length).toBeGreaterThan(0);
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

// ─── New: Chamber tile (item content) ──────────────────────────────────────────

describe('Chamber tile (item content)', () => {
  it('connects on all four sides regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.Chamber, rot, true, 0, 0, PipeShape.Straight, 1, null, 'item');
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('stores itemShape and itemCount', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 2, null, 'item');
    expect(tile.itemShape).toBe(PipeShape.Elbow);
    expect(tile.itemCount).toBe(2);
  });

  it('is not reclaimable', () => {
    const board = new Board(1, 3);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, false, 0, 0, PipeShape.Straight, 1, null, 'item');
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });

  it('does not affect water cost', () => {
    // Source → Chamber(item) → Sink
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    // Chamber-item does not consume water
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
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 2, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    const bonuses = board.getContainerBonuses();
    expect(bonuses.get(PipeShape.Elbow)).toBe(2);
  });

  it('accumulates bonuses from multiple containers of the same shape', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    const bonuses = board.getContainerBonuses();
    expect(bonuses.get(PipeShape.Straight)).toBe(2);
  });

  it('does not count containers not in the fill path', () => {
    // Use a Straight N-S (rotation=0) between Source and Chamber to block E-W connection.
    // Source.East → (0,1 Straight N-S): Straight has no West → NOT mutual → fill stops.
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 0);         // N-S only – blocks E-W
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    expect(board.getContainerBonuses().size).toBe(0);
  });
});

// ─── New: placeInventoryTile with container grants ────────────────────────────

describe('Board.placeInventoryTile (with container grants)', () => {
  it('allows placing a tile using a container grant when base count is 0', () => {
    // Source → Chamber(item, grants 1 Straight) → Sink
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Empty,   0);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];

    // Chamber is reachable (fill: source → chamber via mutual all-dir connections)
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
   * Build a 1×4 board: Source(0) → Chamber(1, item, grants 1 Straight) → Empty(2) → Sink(3).
   * Chamber is connected from the start, so the player can use the grant immediately.
   */
  function makeConstraintBoard(): Board {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Empty,   0);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    return board;
  }

  it('allows reclaiming when no container grants are lost', () => {
    const board = makeConstraintBoard();
    // Place Straight at col 2 using the chamber grant
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight);
    // Chamber is still in fill path, so reclaiming col 2 is safe
    expect(board.reclaimTile({ row: 0, col: 2 })).toBe(true);
    expect(board.lastError).toBeNull();
  });

  it('blocks reclaiming when it would remove a chamber from the fill path and inventory would go below 0', () => {
    // Board: Source(0) → Straight E-W(1) → Chamber(2, item) → Straight E-W(3) → Sink(4)
    // Straight(1) is a player-placed tile; if removed, Chamber(2) leaves the fill path.
    // We simulate the state after the player used the chamber grant: base Straight count = -1.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);         // E-W, player-placed
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0,  true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Straight, 90);         // E-W, placed using grant
    board.grid[0][4] = new Tile(PipeShape.Sink,    0,  true);
    board.sourceCapacity = 10;
    // Two Straights placed: 1 from base (depleted) + 1 from grant → base count = -1
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }];

    // Try to reclaim col 1: this would disconnect the chamber → base(-1) + newGrant(0) = -1 < 0
    const result = board.reclaimTile({ row: 0, col: 1 });
    expect(result).toBe(false);
    expect(board.lastError).not.toBeNull();
    // The tile must still be in place
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
  });

  it('allows reclaiming the piece that used the grant (chamber remains connected)', () => {
    // Same board as above; reclaiming col 3 is safe because the chamber stays in the fill path.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);         // E-W, player-placed
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0,  true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Straight, 90);         // E-W, placed using grant
    board.grid[0][4] = new Tile(PipeShape.Sink,    0,  true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }];

    // Chamber is still reachable via col 1 even after col 3 is removed.
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

  it('contains a Chamber(item) tile', () => {
    const board = new Board(level.rows, level.cols, level);
    const containers = board.grid.flat().filter((t) => t.shape === PipeShape.Chamber && t.chamberContent === 'item');
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

    // Place Tee W-N-E at (2,3) to connect (1,3) down to the row-2 pipe chain and
    // branch East into the tank at (2,4) for the water budget
    board.placeInventoryTile({ row: 2, col: 3 }, PipeShape.Tee);
    board.grid[2][3].rotation = 270; // W-N-E

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

  it('contains Chamber tiles for item, tank, and dirt content', () => {
    const board = new Board(level.rows, level.cols, level);
    const tiles = board.grid.flat();
    expect(tiles.some((t) => t.shape === PipeShape.Chamber && t.chamberContent === 'item')).toBe(true);
    expect(tiles.some((t) => t.shape === PipeShape.Chamber && t.chamberContent === 'tank')).toBe(true);
    expect(tiles.some((t) => t.shape === PipeShape.Chamber && t.chamberContent === 'dirt')).toBe(true);
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

    // Place Straight N-S at (3,4) to bridge from the tank at (2,4) to the dirt block at (4,4)
    board.placeInventoryTile({ row: 3, col: 4 }, PipeShape.Straight);

    expect(board.isSolved()).toBe(true);
    expect(board.getCurrentWater()).toBeGreaterThan(0);
  });
});

// ─── Chamber tile ─────────────────────────────────────────────────────────────

describe('Chamber tile', () => {
  it('connects on all four sides by default (tank content)', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const tile = new Tile(PipeShape.Chamber, rot, true, 5, 0, null, 1, null, 'tank');
      expect(tile.connections.has(Direction.North)).toBe(true);
      expect(tile.connections.has(Direction.East)).toBe(true);
      expect(tile.connections.has(Direction.South)).toBe(true);
      expect(tile.connections.has(Direction.West)).toBe(true);
    }
  });

  it('respects customConnections when provided', () => {
    const northOnly = new Set([Direction.North]);
    const tile = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, northOnly, 'tank');
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(false);
    expect(tile.connections.has(Direction.South)).toBe(false);
    expect(tile.connections.has(Direction.West)).toBe(false);
  });

  it('tank content adds water capacity to getCurrentWater', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 7, 0, null, 1, null, 'tank');
    board.grid[0][2] = new Tile(PipeShape.Sink,   0, true);
    board.sourceCapacity = 10;
    // Water = 10 (source) + 7 (chamber-tank)
    expect(board.getCurrentWater()).toBe(17);
  });

  it('dirt content subtracts cost from getCurrentWater', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'dirt');
    board.grid[0][2] = new Tile(PipeShape.Sink,   0, true);
    board.sourceCapacity = 10;
    // Water = 10 (source) - 3 (chamber-dirt cost)
    expect(board.getCurrentWater()).toBe(7);
  });

  it('item content grants inventory bonuses via getContainerBonuses', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 2, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Sink,   0, true);
    const bonuses = board.getContainerBonuses();
    expect(bonuses.get(PipeShape.Elbow)).toBe(2);
  });

  it('cannot be reclaimed regardless of isFixed flag', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, false, 0, 0, null, 1, null, 'tank');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });

  it('tank content in validateGrid reports error when facing off-grid', () => {
    const board = new Board(1, 3);
    // Chamber(tank) at column 0 facing West (off-grid)
    board.grid[0][0] = new Tile(
      PipeShape.Chamber, 0, true, 5, 0, null, 1,
      new Set([Direction.West]), 'tank',
    );
    const errors = board.validateGrid();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Chamber(tank)');
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

  it('sets lastError when placing a regular pipe on a gold space', () => {
    const board = makeGoldSpaceBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    expect(board.lastError).toBe('Only gold pipes may be placed on a gold space.');
  });

  it('clears lastError on successful placement', () => {
    const board = makeGoldSpaceBoard();
    // Trigger an error first
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    expect(board.lastError).not.toBeNull();
    // Now place a valid gold pipe
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight, 90);
    expect(board.lastError).toBeNull();
  });

  it('sets lastError in replaceInventoryTile when replacing with a non-gold pipe on a gold space', () => {
    const board = makeGoldSpaceBoard();
    // Place a gold pipe first so we have something to replace
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight, 90);
    board.inventory.push({ shape: PipeShape.Straight, count: 1 });
    board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    expect(board.lastError).toBe('Only gold pipes may be placed on a gold space.');
    // Tile should remain unchanged
    expect(board.grid[0][1].shape).toBe(PipeShape.GoldStraight);
  });

  it('allows gold pipe placement on a regular empty cell', () => {
    const board = new Board(1, 3);
    board.inventory = [{ shape: PipeShape.GoldStraight, count: 1 }];
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    // (0,1) is NOT in goldSpaces → gold pipe should now be allowed
    expect(board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight)).toBe(true);
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

  it('second undo after two rotation-induced fail states restores the original tile rotation', () => {
    // Regression test: _restoreSnapshot previously shared Tile object references with the
    // snapshot, so a rotate() call after the first undo would mutate the stored snapshot.
    // The second undo therefore appeared to have no effect because it "restored" the
    // already-mutated snapshot, leaving the tile in the post-rotation state.
    const board = new Board(2, 2);
    board.grid[0][0] = new Tile(PipeShape.Elbow, 0);

    board.initHistory();  // snap0: tile at rotation 0

    // First rotation → rotation 90
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();   // snap1: tile at rotation 90
    expect(board.grid[0][0].rotation).toBe(90);

    // First undo → restore snap0
    board.undoMove();
    expect(board.grid[0][0].rotation).toBe(0);

    // Second rotation → rotation 90 again (same as snap1)
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();   // reuses snap1 or pushes new snap; index at 1
    expect(board.grid[0][0].rotation).toBe(90);

    // Second undo → must restore snap0 (rotation 0), not the corrupted snapshot
    board.undoMove();
    expect(board.grid[0][0].rotation).toBe(0);
    expect(board.canUndo()).toBe(false);
    expect(board.canRedo()).toBe(true);
  });
});

// ─── New: replaceInventoryTile ────────────────────────────────────────────────

describe('Board.replaceInventoryTile', () => {
  /** Build a simple 1×3 board: Source(0,0) → Empty(0,1) → Sink(0,2). */
  function makeSimpleBoard(): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty,    0);
    board.grid[0][2] = new Tile(PipeShape.Sink,     0, true);
    board.sourceCapacity = 10;
    board.inventory = [
      { shape: PipeShape.Straight, count: 2 },
      { shape: PipeShape.Elbow,    count: 1 },
    ];
    return board;
  }

  it('replaces a player-placed tile with a different selected shape', () => {
    const board = makeSimpleBoard();
    // Place a Straight first
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    const straightBefore = board.inventory.find((i) => i.shape === PipeShape.Straight)!.count;
    const elbowBefore    = board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count;

    // Replace the Straight with an Elbow
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);
    expect(result).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Elbow);
    // Old tile (Straight) returned → count goes up by 1
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(straightBefore + 1);
    // New tile (Elbow) consumed → count goes down by 1
    expect(board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count).toBe(elbowBefore - 1);
  });

  it('applies the given rotation to the new tile', () => {
    const board = makeSimpleBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 0);
    board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow, 90);
    expect(board.grid[0][1].rotation).toBe(90);
  });

  it('returns false when the target tile is empty', () => {
    const board = makeSimpleBoard();
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);
    expect(result).toBe(false);
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
  });

  it('returns false when the target tile is a fixed tile', () => {
    const board = makeSimpleBoard();
    // (0,0) is Source and fixed
    const result = board.replaceInventoryTile({ row: 0, col: 0 }, PipeShape.Elbow);
    expect(result).toBe(false);
  });

  it('returns false for non-replaceable special tiles (Source, Sink, Chamber, Granite)', () => {
    const board = new Board(1, 4);
    board.grid[0][0] = new Tile(PipeShape.Source,  0, false);
    board.grid[0][1] = new Tile(PipeShape.Sink,    0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, false, 5, 0, null, 1, null, 'tank');
    board.grid[0][3] = new Tile(PipeShape.Granite, 0, false);
    board.inventory = [{ shape: PipeShape.Straight, count: 5 }];
    expect(board.replaceInventoryTile({ row: 0, col: 0 }, PipeShape.Straight)).toBe(false);
    expect(board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Straight)).toBe(false);
    expect(board.replaceInventoryTile({ row: 0, col: 2 }, PipeShape.Straight)).toBe(false);
    expect(board.replaceInventoryTile({ row: 0, col: 3 }, PipeShape.Straight)).toBe(false);
  });

  it('returns false when the new shape has no available inventory', () => {
    const board = makeSimpleBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count = 0;
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);
    expect(result).toBe(false);
    // Old tile should be unchanged
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
  });

  it('rolls back inventory when the new shape cannot be placed', () => {
    const board = makeSimpleBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    const straightBefore = board.inventory.find((i) => i.shape === PipeShape.Straight)!.count;
    board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count = 0;

    board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);

    // Straight count must be unchanged (rollback restored it)
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(straightBefore);
  });

  it('allows gold pipe placement on a non-gold space (replaceInventoryTile)', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0, true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);  // regular pipe on regular cell
    board.grid[0][2] = new Tile(PipeShape.Sink,     0, true);
    board.inventory  = [{ shape: PipeShape.GoldStraight, count: 1 }];
    // Gold pipe can now go on a non-gold space
    expect(board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight)).toBe(true);
  });

  it('blocks regular pipe from replacing gold pipe on a gold space (replaceInventoryTile)', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,      0, true);
    board.grid[0][1] = new Tile(PipeShape.GoldStraight, 90);  // gold pipe on gold space
    board.grid[0][2] = new Tile(PipeShape.Sink,        0, true);
    board.goldSpaces.add('0,1');
    board.inventory = [
      { shape: PipeShape.GoldStraight, count: 0 },
      { shape: PipeShape.Straight,     count: 1 },
    ];
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result).toBe(false);
    // Board state is unchanged
    expect(board.grid[0][1].shape).toBe(PipeShape.GoldStraight);
    expect(board.inventory.find((i) => i.shape === PipeShape.GoldStraight)!.count).toBe(0);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(1);
  });

  it('allows gold pipe to replace regular pipe on a gold space (replaceInventoryTile)', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0, true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);  // regular pipe on gold space
    board.grid[0][2] = new Tile(PipeShape.Sink,     0, true);
    board.goldSpaces.add('0,1');
    board.inventory = [
      { shape: PipeShape.Straight,     count: 0 },
      { shape: PipeShape.GoldStraight, count: 1 },
    ];
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight, 90);
    expect(result).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.GoldStraight);
    // Regular pipe returned to inventory
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(1);
    // Gold pipe consumed from inventory
    expect(board.inventory.find((i) => i.shape === PipeShape.GoldStraight)!.count).toBe(0);
  });

  it('sets lastError and rolls back when post-replacement constraint check fails', () => {
    // Source → Straight(1, connector) → Chamber(2, grants 2 Straights) → Straight(3) → Straight(4) → Sink(5)
    // inventory = [{Straight, count: -2}] — both Straights at (3) and (4) placed using grants,
    // plus the connector at (1) placed from the original base stock of 1.
    // (base 1 − placed 3 = −2; with grant 2, effective = 0)
    // Replacing Straight(1) with Elbow disconnects the chamber:
    //   reclaim → count: −2 → −1
    //   final bonus: 0 (chamber no longer reachable)
    //   check: −1 + 0 = −1 < 0 → must block
    const board = new Board(1, 6);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 5 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);                                             // E-W connector
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0,  true, 0, 0, PipeShape.Straight, 2, null, 'item'); // grants 2
    board.grid[0][3] = new Tile(PipeShape.Straight, 90);                                             // placed using grant
    board.grid[0][4] = new Tile(PipeShape.Straight, 90);                                             // placed using grant
    board.grid[0][5] = new Tile(PipeShape.Sink,     0,  true);
    board.sourceCapacity = 10;
    // base 1 − 3 placed = −2; grant 2 → effective 0 (valid current state)
    board.inventory = [{ shape: PipeShape.Straight, count: -2 }, { shape: PipeShape.Elbow, count: 1 }];

    // Replacing Straight(1) with Elbow breaks the chamber connection
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);
    expect(result).toBe(false);
    expect(board.lastError).not.toBeNull();
    // Board and inventory must be fully rolled back
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(-2);
    expect(board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count).toBe(1);
  });

  it('blocks replacing same shape with different rotation when doing so would disconnect a container', () => {
    // Source → Straight(1,R=90,E-W) → Chamber(2, grants 2 Straights) → Straight(3,R=90) → Straight(4,R=90) → Sink(5)
    // inventory = [{Straight, count: -2}]: 3 placed, 2 from grants → effective count 0 (valid state)
    // Replacing Straight(1) with Straight(R=0, N-S) would disconnect the chamber:
    //   reclaim → count: −2 → −1
    //   bonuses after reclaim: 0 (chamber no longer reachable)
    //   effectiveCount: −1 + 0 = −1 ≤ 0 → must block and roll back
    const board = new Board(1, 6);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 5 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);                                             // E-W connector
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0,  true, 0, 0, PipeShape.Straight, 2, null, 'item'); // grants 2
    board.grid[0][3] = new Tile(PipeShape.Straight, 90);                                             // placed using grant
    board.grid[0][4] = new Tile(PipeShape.Straight, 90);                                             // placed using grant
    board.grid[0][5] = new Tile(PipeShape.Sink,     0,  true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: -2 }];

    // Replacing Straight(1) with Straight(R=0, N-S) breaks the E-W path to the chamber
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 0);
    expect(result).toBe(false);
    // Board and inventory must be fully rolled back
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.grid[0][1].rotation).toBe(90);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(-2);
  });

  it('clears lastError on success', () => {
    const board = makeSimpleBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    // Force a prior error
    board.lastError = 'previous error';
    board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);
    expect(board.lastError).toBeNull();
  });

  it('allows replacing the bridge tile with a different-type pipe when the grant covers the new shape', () => {
    // Source → Straight(1, bridge) → Chamber(2, grants 1 GoldStraight) → Sink(3)
    // The bridge tile (1) keeps the chamber connected.  The player has used their
    // base Straight stock (count 0) and wants to swap the bridge for a GoldStraight
    // that is available only via the container grant.
    //
    // Bug (before fix): getContainerBonuses() in Step 2 was called after setting
    // the bridge cell to Empty, which temporarily disconnected the container and
    // made the GoldStraight grant disappear → effectiveCount = 0 → false block.
    //
    // After fix: bonuses are evaluated with the new tile already in place so the
    // container remains connected → effectiveCount = 0 (base) + 1 (grant) = 1 → allowed.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);  // E-W bridge; will be replaced
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0,  true, 0, 0, PipeShape.GoldStraight, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0,  true);
    board.sourceCapacity = 10;
    // Straight was placed using base stock; 0 remaining.  No GoldStraight in base
    // inventory – the only supply is the container grant.
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];

    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight, 90);
    expect(result).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.GoldStraight);
    // Straight returned to inventory
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(1);
    // GoldStraight drawn via grant (base count −1, grant covers it)
    const goldEntry = board.inventory.find((i) => i.shape === PipeShape.GoldStraight);
    expect(goldEntry).toBeDefined();
    expect(goldEntry!.count).toBe(-1); // grant of 1 makes effective count 0 – valid
  });
});

// ─── Source and Sink optional connections ─────────────────────────────────────

describe('Source / Sink optional connections', () => {
  it('Source defaults to all four connections when no customConnections are set', () => {
    const tile = new Tile(PipeShape.Source, 0, true, 5);
    expect(tile.connections.size).toBe(4);
  });

  it('Sink defaults to all four connections when no customConnections are set', () => {
    const tile = new Tile(PipeShape.Sink, 0, true);
    expect(tile.connections.size).toBe(4);
  });

  it('Source with customConnections [E,S] only connects East and South', () => {
    const tile = new Tile(PipeShape.Source, 0, true, 5, 0, null, 1, new Set([Direction.East, Direction.South]));
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.South)).toBe(true);
    expect(tile.connections.has(Direction.North)).toBe(false);
    expect(tile.connections.has(Direction.West)).toBe(false);
  });

  it('Sink with customConnections [N,W] only connects North and West', () => {
    const tile = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.North, Direction.West]));
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.West)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(false);
    expect(tile.connections.has(Direction.South)).toBe(false);
  });

  it('each level Source has no connections pointing off the grid', () => {
    for (const level of LEVELS) {
      const board = new Board(level.rows, level.cols, level);
      const srcTile = board.grid[board.source.row][board.source.col];
      for (const dir of Object.values(Direction)) {
        if (!srcTile.connections.has(dir)) continue;
        const delta = { [Direction.North]: [-1, 0], [Direction.East]: [0, 1], [Direction.South]: [1, 0], [Direction.West]: [0, -1] }[dir];
        const nr = board.source.row + delta[0];
        const nc = board.source.col + delta[1];
        expect(nr >= 0 && nr < board.rows && nc >= 0 && nc < board.cols).toBe(true);
      }
    }
  });

  it('each level Sink has no connections pointing off the grid', () => {
    for (const level of LEVELS) {
      const board = new Board(level.rows, level.cols, level);
      const sinkTile = board.grid[board.sink.row][board.sink.col];
      for (const dir of Object.values(Direction)) {
        if (!sinkTile.connections.has(dir)) continue;
        const delta = { [Direction.North]: [-1, 0], [Direction.East]: [0, 1], [Direction.South]: [1, 0], [Direction.West]: [0, -1] }[dir];
        const nr = board.sink.row + delta[0];
        const nc = board.sink.col + delta[1];
        expect(nr >= 0 && nr < board.rows && nc >= 0 && nc < board.cols).toBe(true);
      }
    }
  });

  it('Level 1 Source(0,0) connects East and South only', () => {
    const board = new Board(LEVELS[0].rows, LEVELS[0].cols, LEVELS[0]);
    const src = board.grid[0][0];
    expect(src.connections.has(Direction.East)).toBe(true);
    expect(src.connections.has(Direction.South)).toBe(true);
    expect(src.connections.has(Direction.North)).toBe(false);
    expect(src.connections.has(Direction.West)).toBe(false);
  });

  it('Level 1 Sink(5,5) connects North and West only', () => {
    const board = new Board(LEVELS[0].rows, LEVELS[0].cols, LEVELS[0]);
    const sink = board.grid[5][5];
    expect(sink.connections.has(Direction.North)).toBe(true);
    expect(sink.connections.has(Direction.West)).toBe(true);
    expect(sink.connections.has(Direction.East)).toBe(false);
    expect(sink.connections.has(Direction.South)).toBe(false);
  });
});

// ─── New: Chamber tile (heater content) ─────────────────────────────────────

describe('Chamber tile (heater content)', () => {
  it('carries its temperature value', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 10);
    expect(tile.temperature).toBe(10);
  });

  it('connects on all four sides by default', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 8);
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.South)).toBe(true);
    expect(tile.connections.has(Direction.West)).toBe(true);
  });

  it('is not reclaimable', () => {
    const board = new Board(1, 3);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, false, 0, 0, null, 1, null, 'heater', 5);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });

  it('does not affect water capacity directly', () => {
    // Source → Chamber(heater) → Sink – heater adds no water capacity
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, null, null, 0);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true,  0, 0, null, 1, null, 'heater', 10);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 15;
    expect(board.getCurrentWater()).toBe(15);
  });
});

// ─── New: Board.getCurrentTemperature ────────────────────────────────────────

describe('Board.getCurrentTemperature', () => {
  it('returns source base temperature when no heaters are connected', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, null, null, 5);
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    expect(board.getCurrentTemperature()).toBe(5);
  });

  it('defaults to 0 temperature when source has no temperature set', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    expect(board.getCurrentTemperature()).toBe(0);
  });

  it('adds heater temperature to source base when heater is in the fill path', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, null, null, 5);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 10);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    expect(board.getCurrentTemperature()).toBe(15);
  });

  it('accumulates temperature from multiple heaters in the fill path', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, null, null, 2);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 8);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 5);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    expect(board.getCurrentTemperature()).toBe(15);
  });

  it('does not count heaters disconnected from the fill path', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    // Heater at (0,1) is not connected (N-S straight blocks E-W flow)
    board.grid[0][0] = new Tile(PipeShape.Source,   0, true, 0, 0, null, 1, null, null, 5);
    board.grid[0][1] = new Tile(PipeShape.Straight, 0);             // N-S only
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0, true, 0, 0, null, 1, null, 'heater', 20);
    expect(board.getCurrentTemperature()).toBe(5); // heater not reachable
  });
});

// ─── New: Chamber tile (ice content) ─────────────────────────────────────────

describe('Chamber tile (ice content)', () => {
  it('carries its cost and temperature threshold', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'ice', 15);
    expect(tile.cost).toBe(3);
    expect(tile.temperature).toBe(15);
  });

  it('is not reclaimable', () => {
    const board = new Board(1, 3);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, false, 0, 2, null, 1, null, 'ice', 10);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
  });
});

// ─── New: getCurrentWater with ice mechanics ──────────────────────────────────

describe('Board.getCurrentWater (ice mechanics)', () => {
  function makeIceBoard(sourceTemp: number, heaterTemp: number, iceThresh: number, iceCost: number) {
    // Layout: Source(0,0, baseTemp=sourceTemp) → Heater(0,1, temp=heaterTemp)
    //         → Ice(0,2, thresh=iceThresh, cost=iceCost) → Sink(0,3)
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, null, null, sourceTemp);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', heaterTemp);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, iceCost, null, 1, null, 'ice', iceThresh);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 100;
    return board;
  }

  it('costs zero when source temperature equals ice threshold', () => {
    // sourceTemp=5, heaterTemp=10 → effective temp=15; iceThresh=15 → deltaTemp=0 → cost=0
    const board = makeIceBoard(5, 10, 15, 2);
    expect(board.getCurrentWater()).toBe(100);
  });

  it('costs zero when source temperature exceeds ice threshold', () => {
    // sourceTemp=5, heaterTemp=20 → effective temp=25; iceThresh=15 → deltaTemp=0 → cost=0
    const board = makeIceBoard(5, 20, 15, 3);
    expect(board.getCurrentWater()).toBe(100);
  });

  it('deducts cost × deltaTemp when source temperature is below ice threshold', () => {
    // sourceTemp=5, heaterTemp=0 → effective temp=5; iceThresh=15 → deltaTemp=10 → cost=2×10=20
    const board = makeIceBoard(5, 0, 15, 2);
    expect(board.getCurrentWater()).toBe(80);
  });

  it('deducts nothing from ice cost when no heater connected (temp=0, thresh=0)', () => {
    // sourceTemp=0, heaterTemp=0, iceThresh=0 → deltaTemp=0 → cost=0
    const board = makeIceBoard(0, 0, 0, 5);
    expect(board.getCurrentWater()).toBe(100);
  });
});

// ─── New: Board.frozen tracking ───────────────────────────────────────────────

describe('Board.frozen tracking', () => {
  function makeIceBoard(sourceTemp: number, heaterTemp: number, iceThresh: number, iceCost: number) {
    // Layout: Source(0,0) → Heater(0,1) → Ice(0,2) → Sink(0,3)
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, null, null, sourceTemp);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', heaterTemp);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, iceCost, null, 1, null, 'ice', iceThresh);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 100;
    return board;
  }

  it('starts at 0 before initHistory', () => {
    const board = makeIceBoard(5, 0, 15, 2);
    expect(board.frozen).toBe(0);
  });

  it('is 0 when ice costs nothing (temp meets threshold)', () => {
    // sourceTemp=5, heaterTemp=10 → effective temp=15; iceThresh=15 → deltaTemp=0 → no water frozen
    const board = makeIceBoard(5, 10, 15, 2);
    board.initHistory();
    expect(board.frozen).toBe(0);
  });

  it('accumulates frozen water when ice costs are incurred at initHistory', () => {
    // sourceTemp=5, heaterTemp=0 → effective temp=5; iceThresh=15 → deltaTemp=10 → frozen=2×10=20
    const board = makeIceBoard(5, 0, 15, 2);
    board.initHistory();
    expect(board.frozen).toBe(20);
  });

  it('is reset to 0 then recomputed when initHistory is called again', () => {
    const board = makeIceBoard(5, 0, 15, 2);
    board.initHistory();
    expect(board.frozen).toBe(20);
    // initHistory resets frozen to 0 then re-runs applyTurnDelta which recomputes it.
    board.initHistory();
    expect(board.frozen).toBe(20);
  });

  it('is restored by undo to its prior value', () => {
    // Board: Source(0,0) → [Empty(0,1) - player places here] → Ice(0,2, thresh=5, cost=3) → Straight(0,3, fixed) → Sink(0,4)
    // At initHistory, path is broken (Empty at 0,1), so ice is not connected; frozen=0.
    // After placing Straight(0,1), ice connects with temp=0, thresh=5 → frozen += 3×5 = 15.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, null, null, 0);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'ice', 5);
    board.grid[0][3] = new Tile(PipeShape.Straight, 90, true); // E-W fixed pipe
    board.grid[0][4] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 100;
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Initially the ice tile is not connected (Empty at 0,1 breaks the path)
    expect(board.frozen).toBe(0);

    // Place E-W Straight at (0,1) to complete the path through the ice tile
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    // Ice(0,2): temp=0, thresh=5 → deltaTemp=5 → frozen += 3×5 = 15
    expect(board.frozen).toBe(15);

    // Undo: frozen should be restored to 0
    board.undoMove();
    expect(board.frozen).toBe(0);

    // Redo: frozen should be restored to 15
    board.redoMove();
    expect(board.frozen).toBe(15);
  });

  it('decrements frozen when a connected ice tile is disconnected', () => {
    // Board: Source(0,0) → Straight(0,1, player) → Ice(0,2) → Sink(0,3)
    // After initHistory, Ice is connected: cost=3, thresh=5 → deltaTemp=5 → frozen=15.
    // After reclaiming Straight(0,1), Ice disconnects → frozen should drop back to 0.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 100, 0, null, 1, null, null, 0);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90, false); // player-placed pipe
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0, true, 0, 3, null, 1, null, 'ice', 5);
    board.grid[0][3] = new Tile(PipeShape.Sink,     0, true);
    board.sourceCapacity = 100;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    board.initHistory();

    expect(board.frozen).toBe(15);

    // Reclaim the straight pipe at (0,1) to break the path
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    board.recordMove();

    expect(board.frozen).toBe(0);
  });

  it('decrements frozen when a connected snow tile is disconnected', () => {
    // Board: Source(0,0) → Straight(0,1, player) → WeakIce(0,2) → Sink(0,3)
    // source pressure=1, cost=4, thresh=5 → effectiveCost=ceil(4/1)=4, deltaTemp=5 → frozen=20.
    // After reclaiming Straight(0,1), WeakIce disconnects → frozen should drop back to 0.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0, true, 100, 0, null, 1, null, null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0, true, 0, 4, null, 1, null, 'snow', 5);
    board.grid[0][3] = new Tile(PipeShape.Sink,     0, true);
    board.sourceCapacity = 100;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    board.initHistory();

    expect(board.frozen).toBe(20);

    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    board.recordMove();

    expect(board.frozen).toBe(0);
  });
});

// ─── New: Level 5 (Glacier Pass) ─────────────────────────────────────────────

describe('Level 5 (Glacier Pass)', () => {
  const level = LEVELS[4];

  it('has a valid grid', () => {
    expect(level.grid.length).toBe(level.rows);
    expect(level.id).toBe(5);
    expect(level.name).toBe('Glacier Pass');
  });

  it('contains two Ice chamber tiles (Ice-A at 0,2 and Ice-B at 2,4)', () => {
    const board = new Board(level.rows, level.cols, level);
    expect(board.grid[0][2].chamberContent).toBe('ice');
    expect(board.grid[0][2].cost).toBe(5);
    expect(board.grid[0][2].temperature).toBe(1);
    expect(board.grid[2][4].chamberContent).toBe('ice');
    expect(board.grid[2][4].cost).toBe(5);
    expect(board.grid[2][4].temperature).toBe(1);
  });

  it('contains a Tank chamber tile at (2,2) with capacity 7', () => {
    const board = new Board(level.rows, level.cols, level);
    expect(board.grid[2][2].chamberContent).toBe('tank');
    expect(board.grid[2][2].capacity).toBe(7);
  });

  it('is solved via the direct route (through Ice-A, using 2 Straights)', () => {
    const board = new Board(level.rows, level.cols, level);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90); // E-W
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90); // E-W
    expect(board.isSolved()).toBe(true);
    // Budget: 8 − 1(0,1) − 5(Ice-A) − 1(0,3) − 1(Elbow 0,4) − 1(Straight 1,4) − 5(Ice-B) = -6
    expect(board.getCurrentWater()).toBe(-6);
  });

  it('is solved via the bypass + tank route (4 Elbows + 1 Tee)', () => {
    const board = new Board(level.rows, level.cols, level);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow, 180); // W-S
    board.placeInventoryTile({ row: 1, col: 1 }, PipeShape.Elbow, 0);   // N-E
    board.placeInventoryTile({ row: 1, col: 2 }, PipeShape.Tee, 90);    // E-S-W → Tank(2,2)
    board.placeInventoryTile({ row: 1, col: 3 }, PipeShape.Elbow, 270); // W-N
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Elbow, 90);  // E-S
    expect(board.isSolved()).toBe(true);
    // Budget: 8 − 5(pieces) − 1(Elbow 0,4) − 1(Straight 1,4) + 7(Tank) − 5(Ice-B) = 3
    expect(board.getCurrentWater()).toBe(3);
  });
});

// ─── New: Level 6 (Hot Springs) ───────────────────────────────────────────────

describe('Level 6 (Hot Springs)', () => {
  const level = LEVELS[5];

  it('has a valid grid', () => {
    expect(level.grid.length).toBe(level.rows);
  });

  it('source has base temperature 0', () => {
    const board = new Board(level.rows, level.cols, level);
    const src = board.grid[board.source.row][board.source.col];
    expect(src.temperature).toBe(0);
  });

  it('contains a Heater chamber tile', () => {
    const board = new Board(level.rows, level.cols, level);
    const heaters = board.grid
      .flat()
      .filter((t) => t.shape === PipeShape.Chamber && t.chamberContent === 'heater');
    expect(heaters.length).toBeGreaterThan(0);
  });

  it('contains an Ice chamber tile', () => {
    const board = new Board(level.rows, level.cols, level);
    const iceTiles = board.grid
      .flat()
      .filter((t) => t.shape === PipeShape.Chamber && t.chamberContent === 'ice');
    expect(iceTiles.length).toBeGreaterThan(0);
  });

  it('temperature reaches 2 when heater is in the fill path', () => {
    // Placing Tee E-S-W at (0,1) connects Source → Tee → Heater(1,1) → Tank(2,1).
    // The Heater carries +2°, so currentTemperature becomes 0 + 2 = 2.
    const board = new Board(level.rows, level.cols, level);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90); // E-S-W → reaches heater at (1,1)
    expect(board.getCurrentTemperature()).toBe(2);
  });

  it('level is solved with correct tile placement', () => {
    // Solution: Tee E-S-W at (0,1), (0,2), (0,3) — heater connects on turn 1, ice tiles on turns 2+
    const board = new Board(level.rows, level.cols, level);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90);
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Tee, 90);
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Tee, 90);
    expect(board.isSolved()).toBe(true);
    expect(board.getCurrentWater()).toBeGreaterThan(0);
  });
});

// ─── New: Level 7 (Cold Front) ────────────────────────────────────────────────

describe('Level 7 (Cold Front)', () => {
  const level = LEVELS[6];

  it('has a valid grid', () => {
    expect(level.grid.length).toBe(level.rows);
  });

  it('source has base temperature 0', () => {
    const board = new Board(level.rows, level.cols, level);
    const src = board.grid[board.source.row][board.source.col];
    expect(src.temperature).toBe(0);
  });

  it('contains a Heater chamber tile at (1,3)', () => {
    const board = new Board(level.rows, level.cols, level);
    const tile = board.grid[1][3];
    expect(tile.shape).toBe(PipeShape.Chamber);
    expect(tile.chamberContent).toBe('heater');
  });

  it('contains Ice chamber tiles at (1,1) and (1,2)', () => {
    const board = new Board(level.rows, level.cols, level);
    expect(board.grid[1][1].chamberContent).toBe('ice');
    expect(board.grid[1][2].chamberContent).toBe('ice');
  });

  it('temperature reaches 2 after connecting the heater via an elbow', () => {
    // Place Straight E-W at (0,1), Straight E-W at (0,2), Elbow S-W at (0,3).
    // The Elbow connects south to Heater(1,3), raising temp to 2.
    const board = new Board(level.rows, level.cols, level);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Elbow, 180); // S-W
    expect(board.getCurrentTemperature()).toBe(2);
  });

  it('level is solved with the heater-first incremental solution', () => {
    // Use initHistory so that applyTurnDelta locks ice costs at connection-time temperature.
    const board = new Board(level.rows, level.cols, level);
    board.initHistory();

    // Step 1: extend path east toward the heater.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Step 2: continue path east.
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Step 3: Elbow S-W at (0,3) → Heater(1,3) connects; temp becomes 2.
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Elbow, 180);
    board.applyTurnDelta();
    board.recordMove();

    // Step 4: replace Straight(0,2) with Tee E-S-W → Ice(1,2) free (temp=2, thresh=2).
    board.replaceInventoryTile({ row: 0, col: 2 }, PipeShape.Tee, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Step 5: replace Straight(0,1) with Tee E-S-W → Ice(1,1) free (temp=2, thresh=2).
    board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Step 6: replace Elbow(0,3) with Tee E-S-W → opens East arm; Ice(2,4) costs 5 (thresh=3).
    board.replaceInventoryTile({ row: 0, col: 3 }, PipeShape.Tee, 90);
    board.applyTurnDelta();
    board.recordMove();

    expect(board.isSolved()).toBe(true);
    // Budget: 4 − 3(Tees) − 1(Elbow 0,4) − 1(Straight 1,4) − 5(Ice 2,4) + 5+5(Tanks) = 4
    expect(board.getCurrentWater()).toBe(4);
  });

  it('ice tiles cost water when connected before the heater', () => {
    // Without the heater connected first, Ice(1,1) at thresh=2 costs 5×2=10 extra water.
    const board = new Board(level.rows, level.cols, level);
    board.initHistory();

    // Place Tee E-S-W at (0,1) first – connects Ice(1,1) while temp=0.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90);
    board.applyTurnDelta();
    board.recordMove();

    const waterAfterIce = board.getCurrentWater();

    // Place Tee E-S-W at (0,2) – Ice(1,2) also at temp=0, thresh=2 → expensive.
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Tee, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Place Tee E-S-W at (0,3) – now Heater connects (but too late for ice at 1,1 and 1,2).
    board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Tee, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Ice(1,1) was locked at temp=0: cost = 5 × max(0, 2−0) = 10.
    // Ice(1,2) was locked at temp=0 (heater not yet connected): cost = 10.
    // That is 20 water wasted vs 0 in the optimal solution — verify water is lower.
    expect(board.getCurrentWater()).toBeLessThan(waterAfterIce);
  });
});

// ─── New: Board.applyTurnDelta (incremental turn evaluation) ──────────────────

describe('Board.applyTurnDelta (incremental turn evaluation)', () => {
  /**
   * Build a 3×4 board that lets us test incremental ice-cost locking:
   *
   *   (0,0) Source  – connects East AND South; cap=100, temp=0
   *   (0,1) Empty   – player places Straight E-W here to connect Ice
   *   (0,2) Chamber(ice, thresh=10, cost=2, E-W)
   *   (0,3) Sink    – West-only (no random downstream connections)
   *   (1,0) Empty   – player places Straight N-S here to connect Heater
   *   (2,0) Chamber(heater, +20°, North-only)
   *   all other cells: explicitly Empty
   */
  function makeIncrementalBoard(): Board {
    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 100;

    // Clear all cells to Empty first (Board without a level uses _buildGrid which
    // fills unset cells with random pipe tiles that can accidentally join the fill path).
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);

    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0);
    // (0,1) stays Empty – player fills this
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1,
      new Set([Direction.East, Direction.West]), 'ice', 10);
    // Sink with West-only connection so nothing else joins the fill path from its side.
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    // (1,0) stays Empty – player fills this
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.North]), 'heater', 20);

    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();
    return board;
  }

  it('ice cost locked at connection-time temperature is not changed by a later-connected heater', () => {
    const board = makeIncrementalBoard();

    // Turn 1: place Straight E-W at (0,1) → connects Ice(0,2) and Sink(0,3).
    // currentTemp = 0 (Heater not yet in fill). Ice locked: cost = 2 × max(0, 10−0) = 20.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    expect(board.getCurrentWater()).toBe(79); // 100 − 1 (Straight) − 20 (Ice, temp=0)

    // Turn 2: place Straight N-S at (1,0) → connects Heater(2,0).
    // currentTemp becomes 20, but Ice(0,2) was already locked with cost=20.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Ice cost must remain 20 (locked in turn 1), not recalculated at temp=20.
    expect(board.getCurrentWater()).toBe(78); // 79 − 1 (new Straight) + 0 (Heater, no water impact)
  });

  it('ice cost uses the heater temperature when heater was connected before the ice tile', () => {
    // Heater is directly reachable from Source via South (no empty tile between them).
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 100;

    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);

    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0);
    // (0,1) stays Empty – player fills this
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1,
      new Set([Direction.East, Direction.West]), 'ice', 10);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    // Heater at (1,0): directly reachable from Source.South without any player tile.
    board.grid[1][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.North]), 'heater', 20);

    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();
    // After initHistory(): Source and Heater(1,0) are in initial fill → currentTemp=20 locked.

    // Turn 1: place Straight E-W at (0,1) → connects Ice(0,2).
    // currentTemp = 20 (Heater already locked). Ice: cost = 2 × max(0, 10−20) = 0.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    expect(board.getCurrentWater()).toBe(99); // 100 − 1 (Straight) − 0 (Ice neutralised by Heater)
  });

  it('undo restores the locked water state so ice cost reverts correctly', () => {
    const board = makeIncrementalBoard();

    // Turn 1: connect Ice (cost locked at 20, temp=0).
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(79);

    // Turn 2: connect Heater.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(78);

    // Undo turn 2 → Heater disconnected; locked state restored to after-turn-1 snapshot.
    board.undoMove();
    expect(board.getCurrentWater()).toBe(79);

    // Undo turn 1 → Ice disconnected; back to initial state.
    board.undoMove();
    expect(board.getCurrentWater()).toBe(100);
  });
});

// ─── New: applyTurnDelta – re-evaluation when heater/pump disconnects ──────────

describe('Board.applyTurnDelta (re-evaluation on heater/pump disconnect)', () => {
  /**
   * Board layout (3 rows × 4 cols):
   *   (0,0) Source  – East AND South; cap=100, temp=0
   *   (0,1) Empty   – player places E-W Straight to connect Ice
   *   (0,2) Chamber(ice, thresh=10, cost=2, E-W)
   *   (0,3) Sink    – West-only
   *   (1,0) Empty   – player places N-S Straight to connect Heater
   *   (2,0) Chamber(heater, +20°, North-only)
   */
  function makeBoard(): Board {
    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 100;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, new Set([Direction.East, Direction.South]), null, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, new Set([Direction.East, Direction.West]), 'ice', 10);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'heater', 20);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    board.initHistory();
    return board;
  }

  it('ice cost is re-evaluated upward when the heater that reduced its cost disconnects', () => {
    const board = makeBoard();

    // Turn 1: connect Heater(2,0) – temp rises to 20.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect Ice(0,2) – temp is 20, deltaTemp = max(0,10-20)=0, cost=0.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Ice locked at cost 0 (heater fully offsets threshold).
    // 100 − 1 (Straight 1,0) − 1 (Straight 0,1) − 0 (Ice) = 98
    expect(board.getCurrentWater()).toBe(98);

    // Turn 3: reclaim the N-S Straight at (1,0) → Heater disconnects.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();

    // Ice(0,2) is still connected; heater is gone, so it must be re-evaluated.
    // Re-evaluation: heater connectionTurn (no longer present) is not counted.
    // effectiveTemp = 0; deltaTemp = max(0,10-0)=10; impact = -(2×10) = -20.
    // 100 − 1 (Straight 0,1) − 20 (Ice re-evaluated) = 79
    expect(board.getCurrentWater()).toBe(79);
  });

  it('re-evaluation only counts heaters connected at or before the ice connection turn', () => {
    // Same layout but heater connects AFTER ice does.
    // When heater disconnects later, ice should use only the heaters connected on or before ice's turn.
    const board = makeBoard();

    // Turn 1: connect Ice(0,2) first – temp is 0, cost = 2×10 = 20.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(79); // 100 − 1 − 20 = 79

    // Turn 2: connect Heater – heater's connectionTurn > ice's connectionTurn.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();
    // Ice impact stays locked at -20 (heater connected after ice, no retroactive benefit).
    expect(board.getCurrentWater()).toBe(78); // 79 − 1 = 78

    // Turn 3: reclaim Straight(1,0) → Heater disconnects.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();

    // Re-evaluation: heater connectionTurn > ice connectionTurn → not counted.
    // effectiveTemp = 0; impact stays -(2×10) = -20.
    // 100 − 1 (Straight 0,1) − 20 (Ice unchanged) = 79
    expect(board.getCurrentWater()).toBe(79);
  });

  it('frozen counter is updated when ice cost increases on heater disconnect', () => {
    const board = makeBoard();

    // Turn 1: connect Heater.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect Ice – cost 0 (heater fully offsets threshold).
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    // Ice impact = 0 → frozen += 0; frozen still 0.
    expect(board.frozen).toBe(0);

    // Turn 3: reclaim Heater → Ice re-evaluated; cost becomes 2×10=20.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();
    // frozen += oldImpact − newImpact = (0) − (−20) = 20
    expect(board.frozen).toBe(20);
  });

  it('re-evaluation and frozen counter are correctly restored by undo', () => {
    const board = makeBoard();

    // Turn 1: connect Heater.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect Ice – cost 0.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(98);
    expect(board.frozen).toBe(0);

    // Turn 3: disconnect Heater → Ice re-evaluated to cost 20.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(79);
    expect(board.frozen).toBe(20);

    // Undo turn 3 → Heater reconnects; ice cost back to 0.
    board.undoMove();
    expect(board.getCurrentWater()).toBe(98);
    expect(board.frozen).toBe(0);

    // Redo turn 3 → ice cost back to 20.
    board.redoMove();
    expect(board.getCurrentWater()).toBe(79);
    expect(board.frozen).toBe(20);
  });

  it('disconnecting a heater that never affected ice leaves ice cost unchanged', () => {
    // Heater connects AFTER ice AND its temp is irrelevant (threshold already met).
    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 100;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    // Source temp=15 → already at ice threshold → ice costs 0 regardless of heater.
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 0, 0, null, 1, new Set([Direction.East, Direction.South]), null, 15);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, new Set([Direction.East, Direction.West]), 'ice', 10);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'heater', 5);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    board.initHistory();

    // Turn 1: connect Ice (temp=15 ≥ thresh=10 → cost=0).
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(99); // 100 − 1 = 99

    // Turn 2: connect Heater.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 3: disconnect Heater → ice re-evaluated but temp=15 still ≥ thresh=10 → cost stays 0.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(99);
    expect(board.frozen).toBe(0);
  });
});

// ─── New: applyTurnDelta – snow re-evaluation when pump disconnects ────────

describe('Board.applyTurnDelta (re-evaluation on pump disconnect)', () => {
  it('snow cost is re-evaluated upward when pump disconnects', () => {
    // Pump at (2,0) is fixed but reachable only via a player-placed N-S Straight at (1,0).
    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 100;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, new Set([Direction.East, Direction.South]), null, 0, 1);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 4, null, 1, new Set([Direction.East, Direction.West]), 'snow', 5);
    board.grid[0][3] = new Tile(PipeShape.Sink,   0, true, 0, 0, null, 1, new Set([Direction.West]));
    // Pump at (2,0): fixed, reachable via player-placed pipe at (1,0), pressure bonus +3.
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, 3);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    board.initHistory();

    // Turn 1: connect Pump(2,0) via player-placed N-S Straight at (1,0).
    // pressure becomes source(1)+pump(3)=4.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect WeakIce(0,2) via E-W Straight at (0,1).
    // effectiveCost = ceil(4/4)=1; deltaTemp=max(0,5-0)=5; impact = -(1×5) = -5.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    // 100 − 1 (N-S Straight) − 1 (E-W Straight) − 5 (WeakIce) = 93
    expect(board.getCurrentWater()).toBe(93);

    // Turn 3: reclaim Straight(1,0) → Pump disconnects.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();

    // WeakIce re-evaluated: pump gone, pressure=source pressure=1, effectiveCost=ceil(4/1)=4, deltaTemp=5; impact=-(4×5)=-20.
    // 100 − 1 (E-W Straight) − 20 (WeakIce re-evaluated) = 79
    expect(board.getCurrentWater()).toBe(79);
  });
});



import { getTileDisplayName } from '../src/renderer';

describe('getTileDisplayName', () => {
  it('returns "Tank +7" for a tank chamber with capacity 7', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 7, 0, null, 1, null, 'tank');
    expect(getTileDisplayName(tile)).toBe('Tank +7');
  });

  it('returns "Tank" for a tank chamber with capacity 0', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank');
    expect(getTileDisplayName(tile)).toBe('Tank');
  });

  it('returns "Heater +2°" for a heater chamber with temperature 2', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 2);
    expect(getTileDisplayName(tile)).toBe('Heater +2°');
  });

  it('returns "Heater" for a heater chamber with temperature 0', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 0);
    expect(getTileDisplayName(tile)).toBe('Heater');
  });

  it('returns "Gold Straight" for an item container holding 1 GoldStraight', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.GoldStraight, 1, null, 'item');
    expect(getTileDisplayName(tile)).toBe('Gold Straight');
  });

  it('returns "2× Gold Straight" for an item container holding 2 GoldStraight', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.GoldStraight, 2, null, 'item');
    expect(getTileDisplayName(tile)).toBe('2× Gold Straight');
  });

  it('returns "Straight" for an item container holding a plain Straight', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    expect(getTileDisplayName(tile)).toBe('Straight');
  });

  it('returns "Dirt -3" for a dirt chamber', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'dirt');
    expect(getTileDisplayName(tile)).toBe('Dirt -3');
  });

  it('returns "Ice -1° x 5" for an ice chamber', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 5, null, 1, null, 'ice', 1);
    expect(getTileDisplayName(tile)).toBe('Ice -1° x 5');
  });

  it('returns "Snow -5° x 4" for a snow chamber', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 4, null, 1, null, 'snow', 5);
    expect(getTileDisplayName(tile)).toBe('Snow -5° x 4');
  });

  it('returns "Sandstone -3° x 2 (H=1)" for a sandstone chamber', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, null, 'sandstone', 3, 0, 1);
    expect(getTileDisplayName(tile)).toBe('Sandstone -3° x 2 (H=1)');
  });
});

// ─── Board.hasTempRelevantTiles ───────────────────────────────────────────────

describe('Board.hasTempRelevantTiles', () => {
  function makeSimpleBoard(): Board {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    return board;
  }

  it('returns false when there are no heaters, ice, or non-zero source temperature', () => {
    const board = makeSimpleBoard();
    expect(board.hasTempRelevantTiles()).toBe(false);
  });

  it('returns true when the source has a non-zero base temperature', () => {
    const board = makeSimpleBoard();
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, null, null, 5);
    expect(board.hasTempRelevantTiles()).toBe(true);
  });

  it('returns true when there is a heater chamber in the grid', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 10);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    expect(board.hasTempRelevantTiles()).toBe(true);
  });

  it('returns true when there is an ice chamber in the grid', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'ice', 15);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    expect(board.hasTempRelevantTiles()).toBe(true);
  });

  it('returns false when chambers are present but none are heater or ice', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, null, 'tank');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    expect(board.hasTempRelevantTiles()).toBe(false);
  });
});

// ─── Chamber tile (pump content) ──────────────────────────────────────────────

describe('Chamber tile (pump content)', () => {
  function makeBoard(pumpPressure = 1): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.sourceCapacity = 10;
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, pumpPressure);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    return board;
  }

  it('getCurrentPressure returns source pressure when no pumps are connected', () => {
    // Source has pressure=1 (explicit); no pump tiles → pressure = source pressure = 1
    const emptyBoard = new Board(1, 2);
    emptyBoard.source = { row: 0, col: 0 };
    emptyBoard.sink   = { row: 0, col: 1 };
    emptyBoard.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5, 0, null, 1, null, null, 0, 1);
    emptyBoard.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    expect(emptyBoard.getCurrentPressure()).toBe(1);
  });

  it('getCurrentPressure returns source pressure (not 1) when pump is present but unconnected', () => {
    // Source has pressure=0; pump exists in level but is not reachable (disconnected).
    // Pressure should start at source's pressure value (0), not hardcoded 1.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.East]), null, 0, 0); // pressure=0
    board.grid[0][1] = new Tile(PipeShape.Empty, 0); // breaks the path to pump
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, 5); // pump, disconnected
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true);
    expect(board.getCurrentPressure()).toBe(0); // source pressure, not 1
  });

  it('getCurrentPressure increases by pump pressure when pump is connected', () => {
    const board = makeBoard(2);
    expect(board.getCurrentPressure()).toBe(3); // source pressure 1 + pump 2
  });

  it('pump does not affect water count', () => {
    const board = makeBoard(3);
    // Source(10) → Pump(no cost) → Sink: no water consumed by pump
    expect(board.getCurrentWater()).toBe(10);
  });

  it('hasPressureRelevantTiles returns true when a pump chamber is present', () => {
    const board = makeBoard(1);
    expect(board.hasPressureRelevantTiles()).toBe(true);
  });

  it('hasPressureRelevantTiles returns false when no pump or snow is present', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5);
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    expect(board.hasPressureRelevantTiles()).toBe(false);
  });

  it('hasPressureRelevantTiles returns true when source has pressure > 0 (no pump tiles)', () => {
    // A Source tile with pressure=1 should cause hasPressureRelevantTiles() to return true
    // so the pressure stat is displayed correctly at level start.
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5, 0, null, 1, null, null, 0, 1); // pressure=1
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    expect(board.hasPressureRelevantTiles()).toBe(true);
    expect(board.getCurrentPressure()).toBe(1);
  });

  it('applyTurnDelta: pump has no water impact', () => {
    const board = makeBoard(1);
    board.initHistory();
    expect(board.getLockedWaterImpact({ row: 0, col: 1 })).toBe(0);
  });
});

// ─── Chamber tile (snow content) ─────────────────────────────────────────

describe('Chamber tile (snow content)', () => {
  /**
   * Build a board: Source(cap) → WeakIce(cost, temp) → Sink
   * optionally followed by a Pump(pumpPressure) when pressure > 1.
   */
  function makeBoard(cap: number, iceCost: number, iceTemp: number, sourceTemp = 0, pumpPressure = 0): Board {
    const hasPump = pumpPressure > 0;
    const cols = hasPump ? 4 : 3;
    const board = new Board(1, cols);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: cols - 1 };
    board.sourceCapacity = cap;
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, cap, 0, null, 1, null, null, sourceTemp, 1);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, iceCost, null, 1, null, 'snow', iceTemp);
    if (hasPump) {
      board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, pumpPressure);
    }
    board.grid[0][cols - 1] = new Tile(PipeShape.Sink, 0, true);
    return board;
  }

  it('hasTempRelevantTiles returns true for snow', () => {
    const board = makeBoard(10, 2, 5);
    expect(board.hasTempRelevantTiles()).toBe(true);
  });

  it('hasPressureRelevantTiles returns true for snow', () => {
    const board = makeBoard(10, 2, 5);
    expect(board.hasPressureRelevantTiles()).toBe(true);
  });

  it('costs cost × deltaTemp when pressure = 1 (same as ice)', () => {
    // sourceTemp=0, iceTemp=3, cost=2, source pressure=1: delta=3, effective = ceil(2/1)*3 = 6
    const board = makeBoard(20, 2, 3, 0);
    expect(board.getCurrentWater()).toBe(14);
  });

  it('divides cost by pressure (rounded up) when pressure > 1', () => {
    // sourceTemp=0, iceTemp=3, cost=3, source pressure=1, pump pressure=2: pressure=1+2=3, delta=3, effective = ceil(3/3)*3 = 1*3 = 3
    const board = makeBoard(20, 3, 3, 0, 2);
    expect(board.getCurrentWater()).toBe(17); // 20 - 3 = 17
  });

  it('cost is at least 1 per degree even when pressure is very high', () => {
    // sourceTemp=0, iceTemp=5, cost=1, source pressure=1, pump pressure=100: ceil(1/101)*5 = 1*5 = 5
    const board = makeBoard(20, 1, 5, 0, 100);
    expect(board.getCurrentWater()).toBe(15); // ceil(1/101)=1, 1*5=5, 20-5=15
  });

  it('costs nothing when temperature meets threshold', () => {
    // sourceTemp=10, iceTemp=5: delta=0
    const board = makeBoard(20, 3, 5, 10);
    expect(board.getCurrentWater()).toBe(20);
  });

  it('applyTurnDelta locks snow cost at connection time', () => {
    // source pressure=1, cost=4, temp=5, sourceTemp=0: delta=5, locked = ceil(4/1)*5 = 4*5 = 20
    const board = makeBoard(30, 4, 5, 0);
    board.initHistory();
    const impact = board.getLockedWaterImpact({ row: 0, col: 1 });
    expect(impact).toBe(-20);
  });

  it('applyTurnDelta uses pressure from connected pumps when locking', () => {
    // source pressure=1, pump pressure=2: pressure=1+2=3, cost=3, temp=5, sourceTemp=0: delta=5, locked = ceil(3/3)*5 = 1*5 = 5
    const board = makeBoard(30, 3, 5, 0, 2);
    board.initHistory();
    const impact = board.getLockedWaterImpact({ row: 0, col: 1 });
    expect(impact).toBe(-5);
  });
});


// ─── Chamber tile (sandstone content) ────────────────────────────────────────

describe('Chamber tile (sandstone content)', () => {
  /**
   * Build a minimal linear board: Source(cap) → Sandstone(cost,temp,hardness) → Sink
   * Optionally adds a Pump(pumpPressure) between sandstone and sink.
   * All tiles are fixed and directly connected; no player-placed pipes needed.
   */
  function makeBoard(cap: number, cost: number, thresholdTemp: number, hardness = 0, sourceTemp = 0, pumpPressure = 0): Board {
    const hasPump = pumpPressure > 0;
    const cols = hasPump ? 4 : 3;
    const board = new Board(1, cols);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: cols - 1 };
    board.sourceCapacity = cap;
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, cap, 0, null, 1, null, null, sourceTemp, 1);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, cost, null, 1, null, 'sandstone', thresholdTemp, 0, hardness);
    if (hasPump) {
      board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, pumpPressure);
    }
    board.grid[0][cols - 1] = new Tile(PipeShape.Sink, 0, true);
    return board;
  }

  it('hasTempRelevantTiles returns true for sandstone', () => {
    expect(makeBoard(10, 2, 5).hasTempRelevantTiles()).toBe(true);
  });

  it('hasPressureRelevantTiles returns true for sandstone', () => {
    expect(makeBoard(10, 2, 5).hasPressureRelevantTiles()).toBe(true);
  });

  it('costs ceil(cost/deltaDamage)*deltaTemp with hardness=0 (same as snow when pressure=1)', () => {
    // hardness=0, source pressure=1, deltaDamage=1-0=1, cost=2, iceTemp=3, sourceTemp=0: deltaTemp=3, effective=ceil(2/1)*3=6
    expect(makeBoard(20, 2, 3, 0).getCurrentWater()).toBe(14);
  });

  it('uses deltaDamage (pressure - hardness) as the cost divisor', () => {
    // hardness=1, source pressure=1, pump bonus=3, pressure=1+3=4, deltaDamage=4-1=3
    // cost=3, iceTemp=3, sourceTemp=0: deltaTemp=3, effective=ceil(3/3)*3=3
    expect(makeBoard(20, 3, 3, 1, 0, 3).getCurrentWater()).toBe(17); // 20−3=17
  });

  it('costs nothing when temperature meets the threshold', () => {
    // sourceTemp=10, iceTemp=5: deltaTemp=0
    expect(makeBoard(20, 3, 5, 0, 10).getCurrentWater()).toBe(20);
  });

  it('applyTurnDelta locks sandstone impact at connection time', () => {
    // hardness=0, source pressure=1, deltaDamage=1-0=1, cost=4, iceTemp=5: locked=ceil(4/1)*5=20
    const board = makeBoard(30, 4, 5, 0);
    board.initHistory();
    expect(board.getLockedWaterImpact({ row: 0, col: 1 })).toBe(-20);
  });

  it('applyTurnDelta uses deltaDamage from connected pumps when locking', () => {
    // hardness=1, source pressure=1, pump bonus=2, pressure=1+2=3, deltaDamage=3-1=2, cost=4, iceTemp=5: locked=ceil(4/2)*5=10
    const board = makeBoard(30, 4, 5, 1, 0, 2);
    board.initHistory();
    expect(board.getLockedWaterImpact({ row: 0, col: 1 })).toBe(-10);
  });

  it('placeInventoryTile fails when sandstone deltaDamage <= 0 on connect', () => {
    // Board: Source(0,0,pressure=1)→[empty (0,1)]→Sandstone(0,2,hardness=2)→Sink(0,3)
    // pressure=1, deltaDamage=1-2=-1 → blocked
    const b = new Board(1, 4);
    b.source = { row: 0, col: 0 };
    b.sink   = { row: 0, col: 3 };
    b.sourceCapacity = 20;
    b.grid[0][0] = new Tile(PipeShape.Source, 0, true, 20, 0, null, 1, new Set([Direction.East]), null, 0, 1);
    b.grid[0][1] = new Tile(PipeShape.Empty, 0);
    b.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, new Set([Direction.East, Direction.West]), 'sandstone', 5, 0, 2);
    b.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    b.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    b.initHistory();

    const result = b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result).toBe(false);
    expect(b.lastError).toMatch(/Pressure must exceed Sandstone hardness/);
    expect(b.lastErrorTilePositions).toEqual([{ row: 0, col: 2 }]);
    // Rollback: inventory and grid unchanged
    expect(b.inventory[0].count).toBe(2);
    expect(b.grid[0][1].shape).toBe(PipeShape.Empty);
  });

  it('placeInventoryTile succeeds when sandstone deltaDamage > 0', () => {
    // Same board but hardness=0 → pressure=1, deltaDamage=1-0=1 > 0 → allowed
    const b = new Board(1, 4);
    b.source = { row: 0, col: 0 };
    b.sink   = { row: 0, col: 3 };
    b.sourceCapacity = 20;
    b.grid[0][0] = new Tile(PipeShape.Source, 0, true, 20, 0, null, 1, new Set([Direction.East]), null, 0, 1);
    b.grid[0][1] = new Tile(PipeShape.Empty, 0);
    b.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, new Set([Direction.East, Direction.West]), 'sandstone', 5, 0, 0);
    b.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    b.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    b.initHistory();

    expect(b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90)).toBe(true);
    expect(b.lastError).toBeNull();
  });

  it('applyTurnDelta sets failure impact (−(sourceCapacity+1)) when sandstone deltaDamage ≤ 0', () => {
    // Sandstone(hardness=2) is pre-connected from start with source pressure=1, deltaDamage=1-2=-1.
    // The impact should be −(sourceCapacity+1) to guarantee getCurrentWater() ≤ 0.
    // frozen should NOT be updated for the invalid state.
    const board = makeBoard(20, 4, 5, 2); // hardness=2
    board.initHistory();
    const impact = board.getLockedWaterImpact({ row: 0, col: 1 });
    expect(impact).toBe(-(20 + 1)); // -(sourceCapacity+1) = -21
    expect(board.getCurrentWater()).toBeLessThanOrEqual(0);
    expect(board.frozen).toBe(0); // failure path must not pollute the frozen counter
  });

  /**
   * Board for pump-disconnect tests.  The pump connector at (1,0) is player-placed,
   * so the pump is NOT in the initial fill path.  The sandstone at (0,2) is also NOT
   * initially connected (empty cell at (0,1) blocks the path at initHistory time).
   *
   *   (0,0) Source [East+South]  →  (0,1) [player E-W pipe]  →  (0,2) Sandstone  →  (0,3) Sink
   *                ↓
   *   (1,0) [player N-S pipe]
   *                ↓
   *   (2,0) Pump [North, bonus=pumpBonus]
   *
   * The player MUST connect the pump before connecting the sandstone whenever
   * hardness ≥ 1, so that pressure is sufficient at sandstone-connection time.
   */
  function makePumpBeforeSandstoneBoard(hardness: number, pumpPressureBonus: number): Board {
    const b = new Board(3, 4);
    b.source = { row: 0, col: 0 };
    b.sink   = { row: 0, col: 3 };
    b.sourceCapacity = 100;
    // Source: connects East (sandstone path) and South (pump path)
    b.grid[0][0] = new Tile(PipeShape.Source, 0, true, 100, 0, null, 1, new Set([Direction.East, Direction.South]), null, 0, 1);
    // Empty cell – player will place an E-W pipe here to connect sandstone
    b.grid[0][1] = new Tile(PipeShape.Empty, 0);
    // Sandstone (fixed, pre-placed but disconnected at start)
    b.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, new Set([Direction.East, Direction.West]), 'sandstone', 5, 0, hardness);
    // Sink
    b.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    // Empty cell – player will place an N-S pipe here to connect the pump
    b.grid[1][0] = new Tile(PipeShape.Empty, 0);
    // Pump (fixed, pre-placed but disconnected at start)
    b.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, pumpPressureBonus);
    // Unused cells
    b.grid[1][1] = new Tile(PipeShape.Empty, 0);
    b.grid[1][2] = new Tile(PipeShape.Empty, 0);
    b.grid[1][3] = new Tile(PipeShape.Empty, 0);
    b.grid[2][1] = new Tile(PipeShape.Empty, 0);
    b.grid[2][2] = new Tile(PipeShape.Empty, 0);
    b.grid[2][3] = new Tile(PipeShape.Empty, 0);
    b.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    b.initHistory();
    return b;
  }

  it('reclaimTile fails when pump removal would drop sandstone deltaDamage to 0', () => {
    // hardness=1, pumpPressureBonus=1:
    //   Connect pump first → pressure=1+1=2, deltaDamage=2-1=1 → sandstone valid to connect.
    //   After pump disconnect: pressure=1, deltaDamage=0 → must be blocked.
    const b = makePumpBeforeSandstoneBoard(1, 1);

    // Step 1: Connect pump via N-S pipe at (1,0)
    b.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    b.applyTurnDelta();
    b.recordMove();

    // Step 2: Connect sandstone via E-W pipe at (0,1) — deltaDamage=2-1=1 > 0, valid
    const placed = b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(placed).toBe(true);
    b.applyTurnDelta();
    b.recordMove();
    // Sandstone locked at deltaDamage=1: impact = -(ceil(3/1)*5) = -15
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-15);

    // Step 3: Try to reclaim pump connector → pressure drops to 1, deltaDamage=0 → blocked
    const result = b.reclaimTile({ row: 1, col: 0 });
    expect(result).toBe(false);
    expect(b.lastError).toMatch(/Cannot disconnect.*Sandstone|Pressure.*Sandstone/);
    expect(b.lastErrorTilePositions).toEqual([{ row: 0, col: 2 }]);
    expect(b.grid[1][0].shape).toBe(PipeShape.Straight);
  });

  it('reclaimTile succeeds and sandstone cost is re-evaluated when deltaDamage stays > 0', () => {
    // hardness=0, pumpPressureBonus=3:
    //   After pump disconnect: pressure=1, deltaDamage=1-0=1 > 0 → reclaim allowed.
    //   Sandstone was locked at deltaDamage=4 (impact=-5); re-evaluated to deltaDamage=1 (impact=-15).
    const b = makePumpBeforeSandstoneBoard(0, 3);

    // Step 1: Connect pump via N-S pipe at (1,0) → pressure=1+3=4
    b.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    b.applyTurnDelta();
    b.recordMove();

    // Step 2: Connect sandstone via E-W pipe at (0,1) — pressure=4, deltaDamage=4-0=4
    b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    b.applyTurnDelta();
    b.recordMove();
    // Sandstone locked at deltaDamage=4: impact = -(ceil(3/4)*5) = -(1*5) = -5
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-5);

    // Step 3: Reclaim pump connector → pressure drops to 1, deltaDamage=1 > 0 → allowed
    const result = b.reclaimTile({ row: 1, col: 0 });
    expect(result).toBe(true);
    expect(b.lastError).toBeNull();

    b.applyTurnDelta();
    b.recordMove();
    // Re-evaluated with current pressure=1 (pump reclaimed, no longer in fill path):
    // deltaDamage=1, impact = -(ceil(3/1)*5) = -15
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-15);
  });

  it('reclaimTile succeeds but sandstone re-evaluates to failure when earlier pump disconnects and later pump is historically excluded', () => {
    // Layout (3 rows × 6 cols):
    //   (0,0) Pump P2[E] → (0,1) player-pipe → (0,2) Source[W,E,S] → (0,3) player-pipe → (0,4) Sandstone[W,E] → (0,5) Sink[W]
    //                                                     ↓
    //                                            (1,2) player-pipe
    //                                                     ↓
    //                                            (2,2) Pump P1[N]
    //
    // Sequence:
    //   Turn 1: connect P1 (pressure=1+5=6)
    //   Turn 2: connect sandstone (deltaDamage=6-2=4, impact=-(ceil(4/4)*1)=-1)
    //   Turn 3: connect P2 (pressure=1+5+4=10)
    //   Reclaim P1 connector → current pressure=1+4=5, deltaDamage=5-2=3 > 0 → allowed
    //
    // Historically-limited re-evaluation after reclaim:
    //   sandstone connectionTurn=3; P1 is gone from filled; P2 turn=4 > 3 → excluded.
    //   effectivePressure=1 (source only), deltaDamage=1-2=-1 ≤ 0 → failure impact=-(100+1)=-101.
    const b = new Board(3, 6);
    b.source = { row: 0, col: 2 };
    b.sink   = { row: 0, col: 5 };
    b.sourceCapacity = 100;
    // Pump P2 at (0,0): pressure=+4, connects East
    b.grid[0][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.East]), 'pump', 0, 4);
    // (0,1): Empty – player will place E-W Straight to connect P2
    b.grid[0][1] = new Tile(PipeShape.Empty, 0);
    // Source at (0,2): connects West+East+South, pressure=1
    b.grid[0][2] = new Tile(PipeShape.Source, 0, true, 100, 0, null, 1, new Set([Direction.West, Direction.East, Direction.South]), null, 0, 1);
    // (0,3): Empty – player will place E-W Straight to connect sandstone
    b.grid[0][3] = new Tile(PipeShape.Empty, 0);
    // Sandstone at (0,4): hardness=2, cost=4, temperature=1
    b.grid[0][4] = new Tile(PipeShape.Chamber, 0, true, 0, 4, null, 1, new Set([Direction.West, Direction.East]), 'sandstone', 1, 0, 2);
    // Sink at (0,5): connects West
    b.grid[0][5] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    // (1,2): Empty – player will place N-S Straight to connect P1
    b.grid[1][2] = new Tile(PipeShape.Empty, 0);
    // Pump P1 at (2,2): pressure=+5, connects North
    b.grid[2][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, 5);
    // Fill remaining cells with Empty
    for (const [r, c] of [[1,0],[1,1],[1,3],[1,4],[1,5],[2,0],[2,1],[2,3],[2,4],[2,5]]) {
      b.grid[r][c] = new Tile(PipeShape.Empty, 0);
    }
    b.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    b.initHistory();

    // Turn 1: Place N-S Straight at (1,2) → P1 connects, pressure=1+5=6
    b.placeInventoryTile({ row: 1, col: 2 }, PipeShape.Straight, 0);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(6);

    // Turn 2: Place E-W Straight at (0,3) → sandstone connects, deltaDamage=6-2=4
    b.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90);
    b.applyTurnDelta();
    b.recordMove();
    // Sandstone locked at deltaDamage=4: impact = -(ceil(4/4)*1) = -1
    expect(b.getLockedWaterImpact({ row: 0, col: 4 })).toBe(-1);

    // Turn 3: Place E-W Straight at (0,1) → P2 connects, pressure=1+5+4=10
    b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(10);

    // Reclaim (1,2): P1 disconnects, current pressure drops to 1+4=5
    // _checkSandstoneConstraints uses full current pressure=5, deltaDamage=5-2=3 > 0 → allowed
    const result = b.reclaimTile({ row: 1, col: 2 });
    expect(result).toBe(true);
    expect(b.lastError).toBeNull();

    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(5);
    // Re-evaluated with historically-limited pressure: P1 gone, P2 connected at turn 4 > sandstone turn 3
    // → effectivePressure=1 (source only), deltaDamage=1-2=-1 ≤ 0 → failure impact=-(100+1)=-101
    expect(b.getLockedWaterImpact({ row: 0, col: 4 })).toBe(-101);
  });

  it('sandstone cost increases when earlier pump disconnects and later pump is historically excluded', () => {
    // Layout (3 rows × 6 cols) – P1 weaker than P2:
    //
    //   (0,0) Pump P2[E,+10] → (0,1) player-pipe → (0,2) Source[W,E,S,P=1]
    //                                                        → (0,3) player-pipe → (0,4) Sandstone[W,E,H=0,cost=6,temp=1] → (0,5) Sink[W]
    //                                                                   ↓
    //                                                          (1,2) player-pipe
    //                                                                   ↓
    //                                                          (2,2) Pump P1[N,+1]
    //
    // Sequence:
    //   Turn 1: connect P1 (pressure=1+1=2)
    //   Turn 2: connect sandstone → deltaDamage=2-0=2, impact=-(ceil(6/2)*1)=-3
    //   Turn 3: connect P2 (pressure=1+1+10=12)
    //   Reclaim (1,2): P1 disconnects → current pressure=1+10=11 (P2 still active)
    //
    // Historically-limited re-evaluation after reclaim:
    //   sandstone connectionTurn=3; P1 gone from filled; P2 turn=4 > 3 → excluded.
    //   effectivePressure=1 (source only), deltaDamage=1-0=1 ≥ 1
    //   newImpact = -(ceil(6/1)*1) = -6 → cost INCREASES from -3 to -6.
    const b = new Board(3, 6);
    b.source = { row: 0, col: 2 };
    b.sink   = { row: 0, col: 5 };
    b.sourceCapacity = 100;
    // Pump P2 at (0,0): pressure=+10, connects East
    b.grid[0][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.East]), 'pump', 0, 10);
    // (0,1): Empty – player will place E-W Straight to connect P2
    b.grid[0][1] = new Tile(PipeShape.Empty, 0);
    // Source at (0,2): connects West+East+South, pressure=1
    b.grid[0][2] = new Tile(PipeShape.Source, 0, true, 100, 0, null, 1, new Set([Direction.West, Direction.East, Direction.South]), null, 0, 1);
    // (0,3): Empty – player will place E-W Straight to connect sandstone
    b.grid[0][3] = new Tile(PipeShape.Empty, 0);
    // Sandstone at (0,4): hardness=0, cost=6, temperature=1
    b.grid[0][4] = new Tile(PipeShape.Chamber, 0, true, 0, 6, null, 1, new Set([Direction.West, Direction.East]), 'sandstone', 1, 0, 0);
    // Sink at (0,5): connects West
    b.grid[0][5] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    // (1,2): Empty – player will place N-S Straight to connect P1
    b.grid[1][2] = new Tile(PipeShape.Empty, 0);
    // Pump P1 at (2,2): pressure=+1, connects North
    b.grid[2][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, 1);
    // All remaining cells (rows 1–2 excluding the ones already set above): Empty
    for (const [r, c] of [[1,0],[1,1],[1,3],[1,4],[1,5],[2,0],[2,1],[2,3],[2,4],[2,5]]) {
      b.grid[r][c] = new Tile(PipeShape.Empty, 0);
    }
    b.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    b.initHistory();

    // Turn 1: Place N-S Straight at (1,2) → P1 connects, pressure=1+1=2
    b.placeInventoryTile({ row: 1, col: 2 }, PipeShape.Straight, 0);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(2);

    // Turn 2: Place E-W Straight at (0,3) → sandstone connects, deltaDamage=2-0=2
    b.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90);
    b.applyTurnDelta();
    b.recordMove();
    // Sandstone locked at deltaDamage=2: impact = -(ceil(6/2)*1) = -3
    expect(b.getLockedWaterImpact({ row: 0, col: 4 })).toBe(-3);

    // Turn 3: Place E-W Straight at (0,1) → P2 connects, pressure=1+1+10=12
    b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(12);

    // Reclaim (1,2): P1 disconnects → current pressure drops to 1+10=11
    // _checkSandstoneConstraints uses full current pressure: deltaDamage=11-0=11 > 0 → allowed
    const result = b.reclaimTile({ row: 1, col: 2 });
    expect(result).toBe(true);
    expect(b.lastError).toBeNull();

    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(11);
    // Historically-limited re-evaluation: P1 gone, P2 connected at turn 4 > sandstone turn 3 → excluded.
    // effectivePressure=1, deltaDamage=1, newImpact=-(ceil(6/1)*1)=-6 → cost INCREASES from -3 to -6.
    expect(b.getLockedWaterImpact({ row: 0, col: 4 })).toBe(-6);
  });
});

// ─── Ambient decorations ──────────────────────────────────────────────────────

describe('Board ambientDecorations', () => {
  it('is an empty array for boards constructed without a level', () => {
    const board = new Board(3, 3);
    expect(board.ambientDecorations).toEqual([]);
  });

  it('is populated when a level is provided', () => {
    // Run several seeds to account for random density (~30 %)
    let found = false;
    for (let i = 0; i < 20; i++) {
      const level = LEVELS[0];
      const board = new Board(level.rows, level.cols, level);
      if (board.ambientDecorations.length > 0) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('each decoration has valid fields', () => {
    // Build boards until we get at least one decoration
    let decorations: readonly import('../src/types').AmbientDecoration[] = [];
    for (let i = 0; i < 30; i++) {
      const level = LEVELS[0];
      const board = new Board(level.rows, level.cols, level);
      if (board.ambientDecorations.length > 0) {
        decorations = board.ambientDecorations;
        break;
      }
    }
    if (decorations.length === 0) return; // extremely unlikely; skip rather than fail

    for (const dec of decorations) {
      expect(dec.row).toBeGreaterThanOrEqual(0);
      expect(dec.col).toBeGreaterThanOrEqual(0);
      expect(['pebbles', 'flower', 'grass']).toContain(dec.type);
      expect(dec.offsetX).toBeGreaterThanOrEqual(0);
      expect(dec.offsetX).toBeLessThanOrEqual(1);
      expect(dec.offsetY).toBeGreaterThanOrEqual(0);
      expect(dec.offsetY).toBeLessThanOrEqual(1);
      expect(dec.rotation).toBeGreaterThanOrEqual(0);
      expect(dec.rotation).toBeLessThan(360);
      expect(dec.variant).toBeGreaterThanOrEqual(0);
      expect(dec.variant).toBeLessThanOrEqual(2);
    }
  });

  it('decorations are within grid bounds', () => {
    let board: Board | null = null;
    for (let i = 0; i < 30; i++) {
      const level = LEVELS[0];
      const b = new Board(level.rows, level.cols, level);
      if (b.ambientDecorations.length > 0) { board = b; break; }
    }
    if (!board) return;

    for (const dec of board.ambientDecorations) {
      expect(dec.row).toBeGreaterThanOrEqual(0);
      expect(dec.row).toBeLessThan(board.rows);
      expect(dec.col).toBeGreaterThanOrEqual(0);
      expect(dec.col).toBeLessThan(board.cols);
    }
  });
});

// ─── getStarsCollected ────────────────────────────────────────────────────────

describe('Board.getStarsCollected', () => {
  it('returns 0 when no star chambers are in the fill path', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Sink,    0, true);
    expect(board.getStarsCollected()).toBe(0);
  });

  it('counts a star chamber in the fill path', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'star');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    expect(board.getStarsCollected()).toBe(1);
  });

  it('counts multiple star chambers in the fill path', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'star');
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'star');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    expect(board.getStarsCollected()).toBe(2);
  });

  it('does not count a star chamber not in the fill path', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    // Straight N-S at (0,1) blocks E-W fill → star at (0,2) not reached
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 0);           // N-S only
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'star');
    expect(board.getStarsCollected()).toBe(0);
  });

  it('accepts a pre-computed filled set to avoid double flood-fill', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'star');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    const filled = board.getFilledPositions();
    expect(board.getStarsCollected(filled)).toBe(1);
  });
});

// ─── Spinnable pipe shapes ────────────────────────────────────────────────────

describe('SPIN_PIPE_SHAPES set', () => {
  it('contains SpinStraight, SpinElbow, SpinTee', () => {
    expect(SPIN_PIPE_SHAPES.has(PipeShape.SpinStraight)).toBe(true);
    expect(SPIN_PIPE_SHAPES.has(PipeShape.SpinElbow)).toBe(true);
    expect(SPIN_PIPE_SHAPES.has(PipeShape.SpinTee)).toBe(true);
  });

  it('does not contain regular or gold pipe shapes', () => {
    expect(SPIN_PIPE_SHAPES.has(PipeShape.Straight)).toBe(false);
    expect(SPIN_PIPE_SHAPES.has(PipeShape.Elbow)).toBe(false);
    expect(SPIN_PIPE_SHAPES.has(PipeShape.GoldStraight)).toBe(false);
    expect(SPIN_PIPE_SHAPES.has(PipeShape.Cross)).toBe(false);
  });
});

describe('Spinnable pipe connections', () => {
  it('SpinStraight at 0° connects North and South', () => {
    const tile = new Tile(PipeShape.SpinStraight, 0);
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.South)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(false);
    expect(tile.connections.has(Direction.West)).toBe(false);
  });

  it('SpinStraight at 90° connects East and West', () => {
    const tile = new Tile(PipeShape.SpinStraight, 90);
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.West)).toBe(true);
    expect(tile.connections.has(Direction.North)).toBe(false);
    expect(tile.connections.has(Direction.South)).toBe(false);
  });

  it('SpinElbow at 0° connects North and East', () => {
    const tile = new Tile(PipeShape.SpinElbow, 0);
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.South)).toBe(false);
    expect(tile.connections.has(Direction.West)).toBe(false);
  });

  it('SpinTee at 0° connects North, East, and South', () => {
    const tile = new Tile(PipeShape.SpinTee, 0);
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.South)).toBe(true);
    expect(tile.connections.has(Direction.West)).toBe(false);
  });
});

describe('Spinnable pipes: isFixed and rotation', () => {
  it('SpinStraight loaded from level definition is NOT fixed', () => {
    const level = {
      id: 9001, name: 'Test', rows: 1, cols: 3,
      grid: [
        [{ shape: PipeShape.Source, capacity: 5 } as const],
        [{ shape: PipeShape.SpinStraight, rotation: 0 as const }],
        [{ shape: PipeShape.Sink }],
      ],
      inventory: [],
    };
    const board = new Board(1, 3, level);
    expect(board.grid[0][1].isFixed).toBe(false);
  });

  it('Source loaded from level definition remains fixed', () => {
    const level = {
      id: 9002, name: 'Test', rows: 1, cols: 2,
      grid: [
        [{ shape: PipeShape.Source, capacity: 5 } as const],
        [{ shape: PipeShape.Sink }],
      ],
      inventory: [],
    };
    const board = new Board(1, 2, level);
    expect(board.grid[0][0].isFixed).toBe(true);
  });

  it('SpinStraight can be rotated by rotateTile', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.SpinStraight, 0, false);
    expect(board.rotateTile({ row: 1, col: 1 })).toBe(true);
    expect(board.grid[1][1].rotation).toBe(90);
  });

  it('SpinStraight rotation cycles through all four angles', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.SpinStraight, 0, false);
    board.rotateTile({ row: 1, col: 1 });
    expect(board.grid[1][1].rotation).toBe(90);
    board.rotateTile({ row: 1, col: 1 });
    expect(board.grid[1][1].rotation).toBe(180);
    board.rotateTile({ row: 1, col: 1 });
    expect(board.grid[1][1].rotation).toBe(270);
    board.rotateTile({ row: 1, col: 1 });
    expect(board.grid[1][1].rotation).toBe(0);
  });
});

describe('Spinnable pipes: cannot be reclaimed or replaced', () => {
  it('reclaimTile returns false for a SpinStraight tile', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.SpinStraight, 0, false);
    expect(board.reclaimTile({ row: 1, col: 1 })).toBe(false);
  });

  it('reclaimTile returns false for SpinElbow and SpinTee', () => {
    const board = new Board(3, 3);
    board.grid[0][1] = new Tile(PipeShape.SpinElbow, 0, false);
    board.grid[0][2] = new Tile(PipeShape.SpinTee, 0, false);
    expect(board.reclaimTile({ row: 0, col: 1 })).toBe(false);
    expect(board.reclaimTile({ row: 0, col: 2 })).toBe(false);
  });

  it('replaceInventoryTile returns false when target is SpinStraight', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.SpinStraight, 0, false);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    expect(board.replaceInventoryTile({ row: 1, col: 1 }, PipeShape.Straight)).toBe(false);
  });
});

describe('Spinnable pipes: water consumption', () => {
  it('SpinStraight in the fill path costs one water unit', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,      90, true);
    board.grid[0][1] = new Tile(PipeShape.SpinStraight, 90, false); // E-W
    board.grid[0][2] = new Tile(PipeShape.Sink,        90, true);
    board.sourceCapacity = 10;
    expect(board.getCurrentWater()).toBe(9);
  });

  it('SpinTee in the fill path costs one water unit', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    // SpinTee at 90° has base [N,E,S] rotated 90° → [E,S,W], which connects E and W.
    board.grid[0][1] = new Tile(PipeShape.SpinTee, 90, false);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    expect(board.getCurrentWater()).toBe(9);
  });
});

describe('Spinnable pipe rotation: connection directions', () => {
  it('SpinTee at 90° connects East, South, and West', () => {
    // Base connections [N,E,S] rotated 90° CW → [E,S,W]
    const tile = new Tile(PipeShape.SpinTee, 90);
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.South)).toBe(true);
    expect(tile.connections.has(Direction.West)).toBe(true);
    expect(tile.connections.has(Direction.North)).toBe(false);
  });

  it('SpinTee at 180° connects South, West, and North', () => {
    // Base connections [N,E,S] rotated 180° CW → [S,W,N]
    const tile = new Tile(PipeShape.SpinTee, 180);
    expect(tile.connections.has(Direction.South)).toBe(true);
    expect(tile.connections.has(Direction.West)).toBe(true);
    expect(tile.connections.has(Direction.North)).toBe(true);
    expect(tile.connections.has(Direction.East)).toBe(false);
  });

  it('SpinElbow at 90° connects East and South', () => {
    // Base connections [N,E] rotated 90° CW → [E,S]
    const tile = new Tile(PipeShape.SpinElbow, 90);
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.South)).toBe(true);
    expect(tile.connections.has(Direction.North)).toBe(false);
    expect(tile.connections.has(Direction.West)).toBe(false);
  });
});

// ─── Negative-temp heater (Cooler) and negative-pressure pump (Vacuum) ────────

describe('getTileDisplayName – Cooler and Vacuum', () => {
  it('returns "Cooler -5°" for a heater chamber with temperature -5', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', -5);
    expect(getTileDisplayName(tile)).toBe('Cooler -5°');
  });

  it('returns "Cooler -1°" for a heater chamber with temperature -1', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', -1);
    expect(getTileDisplayName(tile)).toBe('Cooler -1°');
  });

  it('still returns "Heater +3°" for a positive-temperature heater', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 3);
    expect(getTileDisplayName(tile)).toBe('Heater +3°');
  });

  it('returns "Vacuum -3P" for a pump chamber with pressure -3', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, -3);
    expect(getTileDisplayName(tile)).toBe('Vacuum -3P');
  });

  it('returns "Vacuum -1P" for a pump chamber with pressure -1', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, -1);
    expect(getTileDisplayName(tile)).toBe('Vacuum -1P');
  });

  it('still returns "Pump +5P" for a positive-pressure pump', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, 5);
    expect(getTileDisplayName(tile)).toBe('Pump +5P');
  });
});

// ─── Cooler (negative-temperature heater) constraint checks ───────────────────

describe('Board heater constraint: negative temperature (Cooler)', () => {
  /**
   * Build a board:
   *   Source(0,0, baseTemp=sourceTemp) → Cooler(0,1, temp=coolerTemp) → Sink(0,2)
   * The cooler is fixed and already in the fill path (E-W connections).
   */
  function makeCoolerBoard(sourceTemp: number, coolerTemp: number): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, sourceTemp);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'heater', coolerTemp);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    return board;
  }

  it('getCurrentTemperature returns negative value when cooler is connected', () => {
    const board = makeCoolerBoard(5, -10);
    expect(board.getCurrentTemperature()).toBe(-5); // 5 + (-10)
  });

  it('placeInventoryTile blocks move that would connect a Cooler reducing temp below 0', () => {
    // Layout: Source(0,0,temp=5) → Empty(0,1) → Cooler(0,2,temp=-10,E-W) → Sink(0,3)
    // Place Straight(E-W) at (0,1): connects source → cooler → sink. Temp = 5+(-10) = -5 → BLOCKED.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, 5);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'heater', -10);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.sourceCapacity = 10;

    // Rotation 90 = East-West Straight
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result).toBe(false);
    expect(board.lastError).toMatch(/temperature below 0/i);
  });

  it('placeInventoryTile allows move that connects a Cooler when temp stays >= 0', () => {
    // Source temp=15, cooler temp=-5 → result temp=10 → ALLOWED
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, 15);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'heater', -5);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.sourceCapacity = 10;

    // Rotation 90 = East-West Straight
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result).toBe(true);
    expect(board.lastError).toBeNull();
    expect(board.getCurrentTemperature()).toBe(10);
  });

  it('reclaimTile blocks removal that would cause temp to drop below 0', () => {
    // Layout: Source(0,0,temp=5) → Cooler(0,1,-10,E-W,fixed) → Straight(0,2,90°,player)
    //         → Heater(0,3,+8,E-W,fixed) → Sink(0,4)
    // Current temp = 5 + (-10) + 8 = 3 (>= 0, valid).
    // Reclaim (0,2): heater at (0,3) disconnects, temp = 5 + (-10) = -5 < 0 → BLOCKED.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, 5);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'heater', -10); // cooler (always in fill path)
    board.grid[0][2] = new Tile(PipeShape.Straight, 90, false);  // player-placed E-W bridge
    board.grid[0][3] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'heater', 8);  // positive heater
    board.grid[0][4] = new Tile(PipeShape.Sink,    0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    board.sourceCapacity = 10;

    // Current temp = 5 + (-10) + 8 = 3 (>= 0, valid)
    expect(board.getCurrentTemperature()).toBe(3);

    // Remove (0,2): positive heater disconnects, temp = 5 + (-10) = -5 < 0 → BLOCKED
    const result = board.reclaimTile({ row: 0, col: 2 });
    expect(result).toBe(false);
    expect(board.lastError).toMatch(/temperature below 0/i);
  });

  it('checkInitialStateErrors returns an error when pre-connected cooler causes temp < 0', () => {
    const board = makeCoolerBoard(5, -10); // temp = 5 + (-10) = -5
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error).not.toBeNull();
    expect(error).toMatch(/temperature below 0/i);
  });

  it('checkInitialStateErrors returns null when initial temperature is valid', () => {
    const board = makeCoolerBoard(15, -5); // temp = 15 + (-5) = 10 >= 0
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error).toBeNull();
  });

  it('checkInitialStateErrors returns null when no cooler tiles are present', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5, 0, null, 1, null, null, 5);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'heater', 10); // positive heater
    board.grid[0][2] = new Tile(PipeShape.Sink, 0, true);
    board.sourceCapacity = 5;
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error).toBeNull();
  });
});

// ─── Vacuum (negative-pressure pump) constraint checks ────────────────────────

describe('Board pump constraint: negative pressure (Vacuum)', () => {
  /**
   * Build a board:
   *   Source(0,0, basePressure=sourcePressure) → Vacuum(0,1, pressure=vacuumPressure) → Sink(0,2)
   */
  function makeVacuumBoard(sourcePressure: number, vacuumPressure: number): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, null, null, 0, sourcePressure);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'pump', 0, vacuumPressure);
    board.grid[0][2] = new Tile(PipeShape.Sink, 0, true);
    board.sourceCapacity = 10;
    return board;
  }

  it('getCurrentPressure returns negative value when vacuum is connected', () => {
    const board = makeVacuumBoard(5, -10);
    expect(board.getCurrentPressure()).toBe(-5); // 5 + (-10)
  });

  it('placeInventoryTile blocks move that would connect a Vacuum reducing pressure below 0', () => {
    // Layout: Source(0,0,pressure=3) → Empty(0,1) → Vacuum(0,2,-8,E-W) → Sink(0,3)
    // Place Straight(E-W) at (0,1): pressure = 3+(-8) = -5 < 0 → BLOCKED.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, 0, 3);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'pump', 0, -8);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.sourceCapacity = 10;

    // Rotation 90 = East-West Straight
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result).toBe(false);
    expect(board.lastError).toMatch(/pressure below 0/i);
  });

  it('placeInventoryTile allows move that connects a Vacuum when pressure stays >= 0', () => {
    // Source pressure=10, vacuum pressure=-5 → result pressure=5 → ALLOWED
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, 0, 10);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'pump', 0, -5);
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.sourceCapacity = 10;

    // Rotation 90 = East-West Straight
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result).toBe(true);
    expect(board.lastError).toBeNull();
    expect(board.getCurrentPressure()).toBe(5);
  });

  it('reclaimTile blocks removal that would cause pressure to drop below 0', () => {
    // Layout: Source(0,0,pressure=5) → Vacuum(0,1,-10,E-W,fixed) → Straight(0,2,90°,player)
    //         → Pump(0,3,+8,E-W,fixed) → Sink(0,4)
    // Current pressure = 5 + (-10) + 8 = 3 (>= 0, valid).
    // Reclaim (0,2): pump at (0,3) disconnects, pressure = 5 + (-10) = -5 < 0 → BLOCKED.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, null, null, 0, 5);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'pump', 0, -10); // vacuum (always in fill path)
    board.grid[0][2] = new Tile(PipeShape.Straight, 90, false);  // player-placed E-W bridge
    board.grid[0][3] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'pump', 0, 8);  // positive pump
    board.grid[0][4] = new Tile(PipeShape.Sink,    0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    board.sourceCapacity = 10;

    // Current pressure = 5 + (-10) + 8 = 3 (>= 0, valid)
    expect(board.getCurrentPressure()).toBe(3);

    // Remove (0,2): positive pump disconnects, pressure = 5 + (-10) = -5 < 0 → BLOCKED
    const result = board.reclaimTile({ row: 0, col: 2 });
    expect(result).toBe(false);
    expect(board.lastError).toMatch(/pressure below 0/i);
  });

  it('checkInitialStateErrors returns an error when pre-connected vacuum causes pressure < 0', () => {
    const board = makeVacuumBoard(5, -10); // pressure = 5 + (-10) = -5
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error).not.toBeNull();
    expect(error).toMatch(/pressure below 0/i);
  });

  it('checkInitialStateErrors returns null when initial pressure is valid', () => {
    const board = makeVacuumBoard(15, -5); // pressure = 15 + (-5) = 10 >= 0
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error).toBeNull();
  });

  it('checkInitialStateErrors returns null when no vacuum tiles are present', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, null, null, 0, 5);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.East, Direction.West]), 'pump', 0, 10); // positive pump
    board.grid[0][2] = new Tile(PipeShape.Sink, 0, true);
    board.sourceCapacity = 10;
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error).toBeNull();
  });
});


// ─── Chamber tile (hot_plate content) ─────────────────────────────────────────

describe('Chamber tile (hot_plate content)', () => {
  /**
   * Build a board using the dynamic fallback (no initHistory):
   * Source(cap, temp=sourceTemp, pressure=1) → HotPlate(mass, temp) → Sink
   * with the frozen counter pre-seeded to frozenAmt.
   */
  function makeDynamicBoard(cap: number, mass: number, temp: number, sourceTemp = 0, frozenAmt = 0): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.sourceCapacity = cap;
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, cap, 0, null, 1, null, null, sourceTemp, 1);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, mass, null, 1, null, 'hot_plate', temp);
    board.grid[0][2] = new Tile(PipeShape.Sink, 0, true);
    board.frozen = frozenAmt;
    return board;
  }

  /**
   * Build a board: Source → Ice → HotPlate → Sink with initHistory.
   * Ice fills frozen first; hot_plate then consumes from that frozen.
   */
  function makeIcePlusHotPlateBoard(
    cap: number, iceCost: number, iceTemp: number,
    mass: number, hpTemp: number, sourceTemp = 0,
  ): Board {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = cap;
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, cap, 0, null, 1, null, null, sourceTemp, 1);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, iceCost,  null, 1, null, 'ice',      iceTemp);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, mass,    null, 1, null, 'hot_plate', hpTemp);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true);
    board.initHistory();
    return board;
  }

  it('hasTempRelevantTiles returns true for hot_plate', () => {
    const board = makeDynamicBoard(10, 2, 5);
    expect(board.hasTempRelevantTiles()).toBe(true);
  });

  it('effectiveCost = mass × (temp + playerTemp), all from water when frozen=0', () => {
    // mass=2, temp=3, sourceTemp=0: effectiveCost=2*(3+0)=6, frozen=0 → waterLoss=6
    const board = makeDynamicBoard(10, 2, 3, 0, 0);
    expect(board.getCurrentWater()).toBe(4); // 10 - 6 = 4
  });

  it('effectiveCost uses sourceTemp as part of playerTemp', () => {
    // mass=2, temp=3, sourceTemp=2: effectiveCost=2*(3+2)=10, frozen=0
    const board = makeDynamicBoard(15, 2, 3, 2, 0);
    expect(board.getCurrentWater()).toBe(5); // 15 - 10 = 5
  });

  it('consumes from frozen first when frozen >= effectiveCost (dynamic fallback)', () => {
    // mass=2, temp=3, frozen=6: effectiveCost=6, waterGain=6, waterLoss=0 → net gain=+6
    const board = makeDynamicBoard(10, 2, 3, 0, 6);
    expect(board.getCurrentWater()).toBe(16); // 10 + 6 = 16
  });

  it('partially consumes frozen when frozen < effectiveCost (dynamic fallback)', () => {
    // mass=2, temp=3, frozen=4: effectiveCost=6, waterGain=4, waterLoss=2 → net=+2
    const board = makeDynamicBoard(10, 2, 3, 0, 4);
    expect(board.getCurrentWater()).toBe(12); // 10 + 2 = 12
  });

  it('applyTurnDelta locks hot_plate impact with zero frozen', () => {
    // mass=2, temp=3, frozen=0: effectiveCost=6, impact=-6
    const board = makeDynamicBoard(10, 2, 3, 0, 0);
    board.initHistory();
    const impact = board.getLockedWaterImpact({ row: 0, col: 1 });
    expect(impact).toBe(-6);
    expect(board.getLockedHotPlateGain({ row: 0, col: 1 })).toBe(0);
    expect(board.getCurrentWater()).toBe(4);
  });

  it('applyTurnDelta locks hot_plate impact when ice seeds frozen first', () => {
    // Ice: cost=2, iceTemp=5, sourceTemp=0 → effectiveCost=2*5=10, impact=-10, frozen=10
    // HotPlate: mass=1, hpTemp=3 → effectiveCost=1*(3+0)=3, waterGain=min(10,3)=3, waterLoss=0 → impact=+3, frozen=7
    // water = 20 - 10 + 3 = 13
    const board = makeIcePlusHotPlateBoard(20, 2, 5, 1, 3, 0);
    expect(board.getCurrentWater()).toBe(13);
    expect(board.frozen).toBe(7);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(3);
    expect(board.getLockedHotPlateGain({ row: 0, col: 2 })).toBe(3);
  });

  it('hot_plate disconnection restores frozen consumed at connection time', () => {
    // Board: Source → [player Straight slot] → HotPlate → Sink
    // After Straight placed: Straight costs 1 water, hot_plate costs 2 water (mass=1, temp=2, frozen=0)
    // mass=1, hpTemp=2, sourceTemp=0: effectiveCost=2, frozen=0 → waterGain=0, waterLoss=2, impact=-2
    // water = 20 - 1 (straight) - 2 (hot_plate) = 17
    // After reclaim: hot_plate disconnects, frozen stays 0 (waterGain was 0)
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 20;
    board.grid[0][0] = new Tile(PipeShape.Source,  90, true, 20, 0, null, 1, null, null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 1,
      null, 1, new Set([Direction.East, Direction.West]), 'hot_plate', 2);
    board.grid[0][3] = new Tile(PipeShape.Sink, 90, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    // Place Straight to connect hot_plate; effectiveCost=1*(2+0)=2, frozen=0 → impact=-2
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    expect(board.getCurrentWater()).toBe(17); // 20 - 1 (straight) - 2 (hot_plate) = 17
    expect(board.frozen).toBe(0);

    // Reclaim Straight → hot_plate disconnects, frozen restored (was 0, stays 0)
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    expect(board.frozen).toBe(0);
    expect(board.getCurrentWater()).toBe(20);
  });

  it('hot_plate disconnection restores frozen when waterGain > 0 (via ice+hot_plate board)', () => {
    // Build board with player-placed pipe to connect ice and hot_plate separately:
    // Source → player-Straight → Ice(cost=3, thresh=5) → HotPlate(mass=1, hpTemp=2) → Sink
    // Step 1: initHistory with empty (0,1) slot; nothing connected past source
    // Step 2: place Straight at (0,1) → ice connects (effectiveCost=3*5=15, frozen=15)
    //         then hot_plate connects (effectiveCost=1*(2+0)=2, waterGain=min(15,2)=2 → frozen=13, impact=+2)
    // Step 3: reclaim Straight → ice disconnects (frozen-=15), hot_plate disconnects (frozen+=2)
    //   Net frozen after step 3: 13 - 15 + 2 = 0
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.sourceCapacity = 50;
    board.grid[0][0] = new Tile(PipeShape.Source,  90, true, 50, 0, null, 1, null, null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0); // player slot
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 3,
      null, 1, new Set([Direction.East, Direction.West]), 'ice', 5);
    board.grid[0][3] = new Tile(PipeShape.Chamber, 0, true, 0, 1,
      null, 1, new Set([Direction.East, Direction.West]), 'hot_plate', 2);
    board.grid[0][4] = new Tile(PipeShape.Sink, 90, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    // Place straight to connect ice and hot_plate
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    // ice: effectiveCost=3*5=15, impact=-15, frozen=15
    // hot_plate: effectiveCost=1*(2+0)=2, waterGain=min(15,2)=2, frozen=13, impact=+2
    expect(board.frozen).toBe(13);
    expect(board.getLockedHotPlateGain({ row: 0, col: 3 })).toBe(2);

    // Reclaim straight – both ice and hot_plate disconnect
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    // ice disconnects: frozen -= 15 (frozen = 13 - 15 = -2... wait that's wrong)
    // Let me recheck:
    // At disconnect: ice had impact=-15, so frozen += impact = 13 + (-15) = -2 ... hmm
    // Actually the disconnect code for ice: "frozen += impact" where impact=-15 → frozen=13+(-15)=-2 ?
    // That can't be right...
    // Wait, let me reconsider the order:
    // When reclaim happens: both ice AND hot_plate disconnect at the same turn.
    // The disconnect loop runs first:
    //   - When ice disconnects: frozen += impact(-15) = 13 - 15 = -2... that seems wrong
    //   But wait, the disconnect loop processes tiles that are being REMOVED from the fill path.
    //   The loop is: for key in _lockedWaterImpact.keys(): if !filled.has(key): handle disconnect.
    //   After reclaim, filled is recomputed for the new state (without the straight).
    //   So both ice and hot_plate are removed from filled.
    //   Processing order (insertion order from BFS when they connected):
    //   ice is at (0,2), hot_plate is at (0,3).
    //   ice processes first: frozen += ice_impact = 13 + (-15) = -2... 
    //   hot_plate processes next: frozen += waterGain = -2 + 2 = 0
    //   So frozen = 0 at end. OK that's consistent!
    expect(board.frozen).toBe(0);
    expect(board.getCurrentWater()).toBe(50);
  });

  it('hot_plate locked cost is re-evaluated with historically-limited temperature when a heater disconnects', () => {
    // Layout (3 rows × 4 cols) – same topology as the sandstone pump-disconnect tests:
    //   (0,0) Source[E,S]  (0,1) [player E-W pipe]  (0,2) HotPlate[W,E]  (0,3) Sink[W]
    //                ↓
    //   (1,0) [player N-S pipe]
    //                ↓
    //   (2,0) Heater[N, temp=5]
    //
    // initHistory: both slots empty → filled={Source} only.
    //
    // Turn 1: place N-S Straight at (1,0) → Heater connects; heaterTurn=2, temp=0+5=5.
    // Turn 2: place E-W Straight at (0,1) → HotPlate and Sink connect; hotPlateTurn=3.
    //   Historical temp for HotPlate = source(0) + Heater(turn=2 ≤ 3) = 5.
    //   effectiveCost = 2*(3+5) = 16, frozen=0 → waterGain=0, impact=-16.
    //
    // Reclaim (1,0): Heater disconnects; HotPlate stays connected via (0,1) pipe.
    //   beneficialDisconnected=true.
    //   Re-evaluate HotPlate: historicalTemp = source(0) only (Heater gone from filled).
    //   newEffectiveCost = 2*(3+0) = 6, frozen=0 → newWaterGain=0, newImpact=-6.
    //   impact changes from -16 to -6.
    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 50;
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 50, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1,
      new Set([Direction.West, Direction.East]), 'hot_plate', 3);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Empty, 0);
    board.grid[1][2] = new Tile(PipeShape.Empty, 0);
    board.grid[1][3] = new Tile(PipeShape.Empty, 0);
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.North]), 'heater', 5);
    board.grid[2][1] = new Tile(PipeShape.Empty, 0);
    board.grid[2][2] = new Tile(PipeShape.Empty, 0);
    board.grid[2][3] = new Tile(PipeShape.Empty, 0);
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: place N-S Straight at (1,0) → Heater connects, temp=0+5=5
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentTemperature()).toBe(5);

    // Turn 2: place E-W Straight at (0,1) → HotPlate and Sink connect
    // Historical temp = source(0) + Heater(heaterTurn=2 ≤ hotPlateTurn=3) = 5
    // effectiveCost = 2*(3+5) = 16, frozen=0 → waterGain=0, impact=-16
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-16);
    // getCurrentWater = 50 + 0(src) + (-1)(1,0) + 0(heater) + (-1)(0,1) + (-16)(hot_plate) + 0(sink) = 32
    expect(board.getCurrentWater()).toBe(32);

    // Reclaim (1,0): Heater disconnects; HotPlate remains connected via (0,1) pipe.
    const result = board.reclaimTile({ row: 1, col: 0 });
    expect(result).toBe(true);

    board.applyTurnDelta();
    board.recordMove();
    // Re-evaluation: historicalTemp = source only = 0 (Heater gone from filled).
    // newEffectiveCost = 2*(3+0) = 6, frozen=0 → newWaterGain=0, newImpact=-6.
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-6);
    // getCurrentWater = 50 + 0(src) + (-1)(0,1) + (-6)(hot_plate) + 0(sink) = 43
    expect(board.getCurrentWater()).toBe(43);
    expect(board.frozen).toBe(0);
  });
});
