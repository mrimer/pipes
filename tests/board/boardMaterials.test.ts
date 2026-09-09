import { Board, ERR_VALVE, PIPE_SHAPES, LEAKY_PIPE_SHAPES, posKey } from '../../src/board';
import { Direction, PipeShape } from '../../src/types';
import { Tile } from '../../src/tile';
describe('Cement tile constraints', () => {
  /** Build a 3×1 board with a cement cell at (0,1) and pipes placed on (0,0) and (0,2). */
  function makeCementBoard(dryingTime: number): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.cementData.set('0,1', dryingTime);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    board.grid[0][1] = new Tile(PipeShape.Empty, 0); // cement cell is initially empty
    board.initHistory();
    return board;
  }

  it('allows placing a pipe on a cement cell and decrements Drying Time when T > 0', () => {
    const board = makeCementBoard(3);
    const placed = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(placed.success).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.cementData.get('0,1')).toBe(2);
    expect(placed.cementDecrement).toEqual({ row: 0, col: 1 });
  });

  it('allows placing a pipe on a cement cell when T = 0 (no decrement)', () => {
    const board = makeCementBoard(0);
    const placed = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(placed.success).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.cementData.get('0,1')).toBe(0);
    expect(placed.cementDecrement).toBeUndefined();
  });

  it('blocks removal when Drying Time = 0 (hardened)', () => {
    const board = makeCementBoard(0);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    const removed = board.reclaimTile({ row: 0, col: 1 });
    expect(removed.success).toBe(false);
    expect(removed.error).toBe('error.board.cementHardened');
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
  });

  it('blocks rotation when Drying Time = 0 (hardened)', () => {
    const board = makeCementBoard(0);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    const rotated = board.rotateTile({ row: 0, col: 1 });
    expect(rotated.success).toBe(false);
    expect(rotated.error).toBe('error.board.cementHardened');
  });

  it('allows removal when T > 0 without decrementing', () => {
    const board = makeCementBoard(3);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    // Drying time decremented on place: 3 → 2
    expect(board.cementData.get('0,1')).toBe(2);
    const removed = board.reclaimTile({ row: 0, col: 1 });
    expect(removed.success).toBe(true);
    // No decrement on removal
    expect(board.cementData.get('0,1')).toBe(2);
    expect(removed.cementDecrement).toBeUndefined();
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
  });

  it('allows rotation and decrements Drying Time when T > 0', () => {
    const board = makeCementBoard(2);
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    // Drying time decremented on place: 2 → 1
    expect(board.cementData.get('0,1')).toBe(1);
    const rotated = board.rotateTile({ row: 0, col: 1 });
    expect(rotated.success).toBe(true);
    // Drying time decremented on rotate: 1 → 0
    expect(board.cementData.get('0,1')).toBe(0);
    expect(rotated.cementDecrement).toEqual({ row: 0, col: 1 });
  });

  it('getCementDryingTime returns null for non-cement cell', () => {
    const board = makeCementBoard(0);
    expect(board.getCementDryingTime({ row: 0, col: 0 })).toBeNull();
  });

  it('getCementDryingTime returns correct value', () => {
    const board = makeCementBoard(5);
    expect(board.getCementDryingTime({ row: 0, col: 1 })).toBe(5);
  });

  it('undo/redo restores cement drying time', () => {
    const board = makeCementBoard(2);
    // Place pipe: T decrements 2 → 1
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    expect(board.cementData.get('0,1')).toBe(1);
    board.undoMove();
    expect(board.cementData.get('0,1')).toBe(2);
    board.redoMove();
    expect(board.cementData.get('0,1')).toBe(1);
  });
});


// ─── Leaky pipes ─────────────────────────────────────────────────────────────

describe('Leaky pipes', () => {
  /**
   * Build a minimal 1×3 board: Source – Empty – Sink.
   * The player has 3 LeakyStraight pipes in inventory to place.
   */
  function makeLeakyBoard(): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Empty,   0);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.LeakyStraight, count: 3 }];
    board.initHistory();
    return board;
  }

  it('leaky pipe is in LEAKY_PIPE_SHAPES and PIPE_SHAPES', () => {
    expect(LEAKY_PIPE_SHAPES.has(PipeShape.LeakyStraight)).toBe(true);
    expect(LEAKY_PIPE_SHAPES.has(PipeShape.LeakyElbow)).toBe(true);
    expect(LEAKY_PIPE_SHAPES.has(PipeShape.LeakyTee)).toBe(true);
    expect(LEAKY_PIPE_SHAPES.has(PipeShape.LeakyCross)).toBe(true);
    expect(PIPE_SHAPES.has(PipeShape.LeakyStraight)).toBe(true);
    expect(PIPE_SHAPES.has(PipeShape.LeakyElbow)).toBe(true);
    expect(PIPE_SHAPES.has(PipeShape.LeakyTee)).toBe(true);
    expect(PIPE_SHAPES.has(PipeShape.LeakyCross)).toBe(true);
  });

  it('leaky pipe connection costs 1 water on first connect (same as regular pipe)', () => {
    const board = makeLeakyBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.LeakyStraight, 90);
    board.applyTurnDelta(); board.recordMove();
    // Initial connect: -1 water (same as regular pipe via PIPE_SHAPES)
    expect(board.getCurrentWater()).toBe(9);
    expect(board.leakyPermanentLoss).toBe(0); // no per-turn penalty yet
  });

  it('leaky pipe is solvable: isSolved() returns true when connected', () => {
    const board = makeLeakyBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.LeakyStraight, 90);
    board.applyTurnDelta();
    expect(board.isSolved()).toBe(true);
  });

  it('leaky pipe can be placed and reclaimed like a regular pipe', () => {
    const board = makeLeakyBoard();
    expect(board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.LeakyStraight, 90).success).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.LeakyStraight);
    board.applyTurnDelta(); board.recordMove();

    expect(board.reclaimTile({ row: 0, col: 1 }).success).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
    const inv = board.inventory.find((it) => it.shape === PipeShape.LeakyStraight);
    expect(inv?.count).toBe(3); // returned to inventory
  });

  it('newly placed leaky pipe only gets per-turn penalty on SUBSEQUENT turns, not the first', () => {
    const board = makeLeakyBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.LeakyStraight, 90);
    const changes = board.applyTurnDelta(); board.recordMove();

    // Immediately after placement: no per-turn penalty, just the initial -1
    expect(board.leakyPermanentLoss).toBe(0);
    expect(board.getCurrentWater()).toBe(9); // 10 - 1 (initial)
    // lastLockedCostChanges should be empty (no per-turn change on first connect)
    expect(changes).toHaveLength(0);
  });

  it('leaky pipe costs 1 additional water per subsequent turn it remains connected', () => {
    const board = makeLeakyBoard();
    // Turn A: place leaky pipe (locks at this turn, no penalty)
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.LeakyStraight, 90);
    board.applyTurnDelta(); board.recordMove();
    expect(board.leakyPermanentLoss).toBe(0);
    expect(board.getCurrentWater()).toBe(9); // 10 - 1

    // Turn B: any subsequent action causes the leaky penalty
    board.rotateTile({ row: 0, col: 1 }); // rotate leaky pipe (disconnects, so no penalty this turn)
    board.applyTurnDelta(); board.recordMove();
    // After rotation the leaky pipe is no longer connected (different rotation)
    // so no penalty; water refunded
    expect(board.leakyPermanentLoss).toBe(0);

    // Re-connect by rotating back
    board.rotateTile({ row: 0, col: 1 });
    board.applyTurnDelta(); board.recordMove();
    // leaky reconnected at this turn → no penalty yet
    expect(board.leakyPermanentLoss).toBe(0);

    // Next turn: leaky now costs again
    board.placeInventoryTile({ row: 0, col: 0 }, PipeShape.LeakyStraight, 90); // dummy action
    board.applyTurnDelta(); board.recordMove();
    // (0,1) was connected last turn → +1 permanent penalty
    expect(board.leakyPermanentLoss).toBe(1);
  });

  it('leakyPermanentLoss accumulates over multiple consecutive turns', () => {
    // Use a pre-placed leaky pipe so we can count exact turns from initHistory.
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,         0, true);
    board.grid[0][1] = new Tile(PipeShape.LeakyStraight, 90); // pre-placed
    board.grid[0][2] = new Tile(PipeShape.Sink,           0, true);
    board.sourceCapacity = 10;
    board.inventory = [];
    board.initHistory(); // turn 1: locks leaky at (0,1), connTurn=1, loss=0

    // Turn 2: first per-turn penalty
    board.rotateTile({ row: 0, col: 0 });
    board.applyTurnDelta(); board.recordMove();
    expect(board.leakyPermanentLoss).toBe(1);
    expect(board.getCurrentWater()).toBe(8); // 10 - 1 (locked) - 1 (permanent)

    // Turn 3: second per-turn penalty
    board.rotateTile({ row: 0, col: 0 });
    board.applyTurnDelta(); board.recordMove();
    expect(board.leakyPermanentLoss).toBe(2);
    expect(board.getCurrentWater()).toBe(7); // 10 - 1 (locked) - 2 (permanent)
  });

  it('leakyPermanentLoss is permanent: disconnecting does NOT recover per-turn water', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,         0, true);
    board.grid[0][1] = new Tile(PipeShape.LeakyStraight, 90); // pre-placed, fixed
    board.grid[0][2] = new Tile(PipeShape.Sink,           0, true);
    board.sourceCapacity = 20;
    board.inventory = [{ shape: PipeShape.LeakyStraight, count: 1 }];
    board.initHistory(); // turn 1: locks leaky

    // Turn 2: accrues permanent loss
    board.rotateTile({ row: 0, col: 0 });
    board.applyTurnDelta(); board.recordMove();
    expect(board.leakyPermanentLoss).toBe(1);

    // Remove the leaky pipe
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta(); board.recordMove();
    // leakyPermanentLoss stays at 1 (not recovered)
    expect(board.leakyPermanentLoss).toBe(1);
    // Locked impact is gone (+1 refund), but permanent loss stays (-1).
    // Water: 20 - 0 (locked impact removed) - 1 (permanent) = 19
    expect(board.getCurrentWater()).toBe(19);
  });

  it('leakyPermanentLoss is restored by undo/redo', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,         0, true);
    board.grid[0][1] = new Tile(PipeShape.LeakyStraight, 90); // pre-placed
    board.grid[0][2] = new Tile(PipeShape.Sink,           0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.LeakyStraight, count: 1 }];
    board.initHistory(); // turn 1: locked, loss=0 still

    // Turn 2: per-turn penalty → loss=1
    board.rotateTile({ row: 0, col: 0 });
    board.applyTurnDelta(); board.recordMove();
    expect(board.leakyPermanentLoss).toBe(1);

    // Undo: restores to end of turn 1 (loss=0)
    board.undoMove();
    expect(board.leakyPermanentLoss).toBe(0);

    // Redo: restores turn-2 state (loss=1)
    board.redoMove();
    expect(board.leakyPermanentLoss).toBe(1);
  });

  it('leaky pipe triggers lastLockedCostChanges on subsequent turns for animation', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,         0, true);
    board.grid[0][1] = new Tile(PipeShape.LeakyStraight, 90); // pre-placed
    board.grid[0][2] = new Tile(PipeShape.Sink,           0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.LeakyStraight, count: 1 }];
    board.initHistory(); // turn 1: locked, no animation

    // Turn 2: per-turn penalty → animation entry pushed
    board.rotateTile({ row: 0, col: 0 });
    const animChanges = board.applyTurnDelta(); board.recordMove();
    expect(animChanges).toHaveLength(1);
    expect(animChanges[0]).toEqual({ row: 0, col: 1, delta: -1 });
  });

  it('two leaky pipes each accrue their own per-turn penalty', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,         0, true);
    board.grid[0][1] = new Tile(PipeShape.LeakyStraight, 90); // pre-placed
    board.grid[0][2] = new Tile(PipeShape.LeakyStraight, 90); // pre-placed
    board.grid[0][3] = new Tile(PipeShape.Sink,           0, true);
    board.sourceCapacity = 20;
    board.inventory = [];
    board.initHistory(); // turn 1: both locked, loss=0

    // Turn 2: both pipes penalised
    board.rotateTile({ row: 0, col: 0 });
    board.applyTurnDelta(); board.recordMove();
    expect(board.leakyPermanentLoss).toBe(2); // 2 leaky pipes × 1 penalty each
    expect(board.getCurrentWater()).toBe(16); // 20 - 2 (locked) - 2 (permanent)
  });
});

// ─── Valve (first connection) rules ──────────────────────────────────────

describe('Valve (first connection) rules', () => {
  /**
   * Build a minimal 3×3 board for valve tests:
   *   (0,1): Source  – connections: S
   *   (1,1): Chamber with N as valve  – connections: N,E,S,W; firstConnections: {N}
   *   (2,1): Sink    – connections: N
   *
   * All other cells are Empty. Source → Chamber is via the valve (North), so the
   * chamber starts as source-connected after board construction.
   */
  function makeValveBoard(): Board {
    const board = new Board(3, 3);
    board.source = { row: 0, col: 1 };
    board.sink   = { row: 2, col: 1 };
    // Clear all cells to Empty first (avoid random tiles from _buildGrid).
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        board.grid[r][c] = new Tile(PipeShape.Empty, 0);
      }
    }
    // Source pointing South
    board.grid[0][1] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.South]));
    board.sourceCapacity = 10;
    // Chamber with North valve (all four connections open by default – no customConnections)
    const firstConns = new Set([Direction.North]);
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank', 0, 0, 0, 0, firstConns);
    // Sink pointing North
    board.grid[2][1] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.North]));
    // Inventory: Straight pipes
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    return board;
  }

  it('chamber connected via valve (North) is reachable', () => {
    // Layout: Source(S) – Straight(NS) – Chamber(N valve) – Straight(NS) – Sink
    // Place a N-S Straight between Source and Chamber
    const board = makeValveBoard();
    // Source is at (0,1) with S; Chamber at (1,1) with N as valve.
    // The Chamber's North face directly faces the Source's South face.
    // In this layout Source → Chamber directly (no pipe in between).
    const filled = board.getFilledPositions();
    // Chamber is connected via its North (= valve direction), so it should be filled.
    expect(filled.has(posKey(1, 1))).toBe(true);
  });

  it('chamber NOT reachable when only entered via non-valve side', () => {
    // Modify the board so the source points East and chamber is only reachable from East.
    // Source at (0,1) pointing E → (0,2); Chamber at (1,2) with N as valve.
    // We approach Chamber from its West side – a non-valve direction – so it must not be filled.
    const board = new Board(3, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 2, col: 2 };
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.sourceCapacity = 10;
    // Chamber at (0,1): connections all-4, firstConnections = { North }
    // Arrived from West (East direction of Source) – non-valve → should NOT be filled
    const firstConns = new Set([Direction.North]);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank', 0, 0, 0, 0, firstConns);
    board.grid[2][2] = new Tile(PipeShape.Sink, 0, true);

    const filled = board.getFilledPositions();
    expect(filled.has(posKey(0, 1))).toBe(false);
  });

  it('placing a pipe connecting non-valve side of unsatisfied valve chamber fails', () => {
    // 3×3 board; Source at (0,0) points East, Chamber at (0,2) has N valve.
    // Place an E-W Straight pipe at (0,1) trying to connect to chamber's West face
    // before the valve (North) side is satisfied.
    const board = new Board(3, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 2, col: 2 };
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    // Source pointing East
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.sourceCapacity = 10;
    // Chamber at (0,2): connections all-4, firstConnections = { North }
    const firstConns = new Set([Direction.North]);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank', 0, 0, 0, 0, firstConns);
    board.grid[2][2] = new Tile(PipeShape.Sink, 0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    // Place an E-W Straight at (0,1) – it connects Source to Chamber's West (non-valve)
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_VALVE);
    expect(result.errorTilePositions).toEqual([{ row: 0, col: 2 }]);
    // Inventory must be restored
    expect(board.inventory[0].count).toBe(1);
  });

  it('replacing a tile that connects non-valve side of unsatisfied chamber fails', () => {
    const board = new Board(3, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 2, col: 2 };
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.sourceCapacity = 10;
    const firstConns = new Set([Direction.North]);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank', 0, 0, 0, 0, firstConns);
    board.grid[2][2] = new Tile(PipeShape.Sink, 0, true);
    // Pre-place a N-S Straight at (0,1) (not connected to anything useful)
    board.grid[0][1] = new Tile(PipeShape.Straight, 0); // N-S: doesn't connect Source(E) or Chamber(W)
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }, { shape: PipeShape.Elbow, count: 1 }];
    // Now replace with an E-W Straight (rotation 90) which connects Source → Chamber West
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_VALVE);
  });

  it('rotating a spin pipe that connects non-valve side of unsatisfied chamber fails', () => {
    const board = new Board(3, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 2, col: 2 };
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.sourceCapacity = 10;
    const firstConns = new Set([Direction.North]);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank', 0, 0, 0, 0, firstConns);
    board.grid[2][2] = new Tile(PipeShape.Sink, 0, true);
    // Pre-place a N-S SpinStraight at (0,1); rotating it CW makes it E-W → bridges Source to Chamber West
    board.grid[0][1] = new Tile(PipeShape.SpinStraight, 0, false); // N-S
    // CW rotation → E-W → connects Source(E) to Chamber(W=non-valve)
    const result = board.rotateTile({ row: 0, col: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_VALVE);
  });

  it('connecting via valve first then non-valve sides succeeds', () => {
    // Source(S) → Chamber (N=valve) → valve satisfied.
    // Then placing an E-W Straight at (1,0) connecting to Chamber's West (non-valve) should succeed.
    const board = makeValveBoard();
    // Verify the valve is satisfied
    expect(board.getFilledPositions().has(posKey(1, 1))).toBe(true);
    // Now place an E-W Straight at (1,0) to connect Chamber's West face.
    // Chamber valve is already satisfied → should be allowed.
    const result = board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
  });

  it('multiple valves on one chamber: satisfying any one allows non-valve connections', () => {
    // Chamber with N and W as valves.  Connect from North → valve satisfied.
    // Then connecting from East (non-valve) should be allowed.
    const board = new Board(3, 3);
    board.source = { row: 0, col: 1 };
    board.sink   = { row: 2, col: 1 };
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][1] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.South]));
    board.sourceCapacity = 10;
    const firstConns = new Set([Direction.North, Direction.West]); // two valves
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank', 0, 0, 0, 0, firstConns);
    board.grid[2][1] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.North]));
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];

    // Source(S) → Chamber(N valve) → should be in filled (satisfied via North).
    expect(board.getFilledPositions().has(posKey(1, 1))).toBe(true);

    // Place a N-S Straight at (1,2) to connect Chamber's East – allowed since North valve is satisfied.
    // Note: Straight at rotation 0 is N-S, which doesn't connect Chamber East.
    // Use E-W Straight (rotation 90) to test the connection from Chamber's East.
    const result = board.placeInventoryTile({ row: 1, col: 2 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
  });

  it('chamber with only non-valve path from source: whole downstream also not filled', () => {
    // Source → (0,1 Straight EW) → Chamber(0,2, N-valve, all conns) → Sink(0,3)
    // Chamber can only be reached from West (non-valve) → chamber not filled → Sink not filled.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    for (let c = 0; c < 4; c++) board.grid[0][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.sourceCapacity = 10;
    board.grid[0][1] = new Tile(PipeShape.Straight, 90, true); // E-W
    const firstConns = new Set([Direction.North]);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank', 0, 0, 0, 0, firstConns);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));

    const filled = board.getFilledPositions();
    expect(filled.has(posKey(0, 2))).toBe(false);
    expect(filled.has(posKey(0, 3))).toBe(false);
  });
});

// ─── Gel and Siphon chambers ──────────────────────────────────────────────────

