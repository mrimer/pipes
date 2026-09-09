import { Board } from '../../src/board';
import { PipeShape } from '../../src/types';
import { Tile } from '../../src/tile';
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

// ─── New: discardLastMoveFromHistory ─────────────────────────────────────────

describe('Board.discardLastMoveFromHistory', () => {
  it('removes the most recently recorded snapshot so canUndo reflects the pre-move state', () => {
    const board = new Board(2, 2);
    board.initHistory();                     // snap0
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();                      // snap1
    expect(board.canUndo()).toBe(true);

    board.discardLastMoveFromHistory();      // remove snap1

    expect(board.canUndo()).toBe(false);     // back to initial snapshot only
    expect(board.canRedo()).toBe(false);     // no future states
  });

  it('does nothing when called on the initial snapshot (index 0)', () => {
    const board = new Board(2, 2);
    board.initHistory();                     // snap0 only

    board.discardLastMoveFromHistory();      // should be a no-op

    expect(board.canUndo()).toBe(false);
    expect(board.canRedo()).toBe(false);
  });

  it('after discard a new recordMove() can still extend the history normally', () => {
    const board = new Board(2, 2);
    board.initHistory();                     // snap0
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();                      // snap1
    board.discardLastMoveFromHistory();      // remove snap1 → back to snap0
    board.rotateTile({ row: 0, col: 0 });
    board.recordMove();                      // new snap1

    expect(board.canUndo()).toBe(true);
    expect(board.canRedo()).toBe(false);
  });
});

// ─── New: restoreFromCurrentSnapshot ─────────────────────────────────────────

describe('Board.restoreFromCurrentSnapshot', () => {
  it('restores the board to the snapshot at _historyIndex without decrementing', () => {
    const board = new Board(2, 2);
    board.grid[0][0] = new Tile(PipeShape.Elbow, 0);  // rotation starts at 0
    board.initHistory();                     // snap0 (rotation=0)
    board.rotateTile({ row: 0, col: 0 });   // rotation → 90
    board.recordMove();                      // snap1 (rotation=90)
    board.rotateTile({ row: 0, col: 0 });   // rotation → 180 (live board differs from snap1)

    // Simulate a failing second move: recordMove() saves snap2, then
    // discardLastMoveFromHistory() removes it (as the game does on a fail).
    board.recordMove();                      // snap2 (rotation=180)
    board.discardLastMoveFromHistory();      // remove snap2 → _historyIndex back to 1 (snap1)

    expect(board.canUndo()).toBe(true);  // pointer still at snap1

    // Live board is still at rotation=180; snap1 has rotation=90.
    // restoreFromCurrentSnapshot() must apply snap1 without moving the pointer.
    board.restoreFromCurrentSnapshot();

    expect(board.grid[0][0].rotation).toBe(90);   // restored to snap1
    expect(board.canUndo()).toBe(true);            // pointer unchanged (still at 1)
    expect(board.canRedo()).toBe(false);           // no future states
  });

  it('is a no-op on a fresh board (index 0, no prior undo history)', () => {
    const board = new Board(2, 2);
    board.initHistory();                     // snap0 only

    expect(() => board.restoreFromCurrentSnapshot()).not.toThrow();
    expect(board.canUndo()).toBe(false);
    expect(board.canRedo()).toBe(false);
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
    expect(result.success).toBe(true);
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
    expect(result.success).toBe(false);
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
  });

  it('returns false when the target tile is a fixed tile', () => {
    const board = makeSimpleBoard();
    // (0,0) is Source and fixed
    const result = board.replaceInventoryTile({ row: 0, col: 0 }, PipeShape.Elbow);
    expect(result.success).toBe(false);
  });

  it('returns false for non-replaceable special tiles (Source, Sink, Chamber, Granite)', () => {
    const board = new Board(1, 4);
    board.grid[0][0] = new Tile(PipeShape.Source,  0, false);
    board.grid[0][1] = new Tile(PipeShape.Sink,    0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, false, 5, 0, null, 1, null, 'tank');
    board.grid[0][3] = new Tile(PipeShape.Granite, 0, false);
    board.inventory = [{ shape: PipeShape.Straight, count: 5 }];
    expect(board.replaceInventoryTile({ row: 0, col: 0 }, PipeShape.Straight).success).toBe(false);
    expect(board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Straight).success).toBe(false);
    expect(board.replaceInventoryTile({ row: 0, col: 2 }, PipeShape.Straight).success).toBe(false);
    expect(board.replaceInventoryTile({ row: 0, col: 3 }, PipeShape.Straight).success).toBe(false);
  });

  it('returns false when the new shape has no available inventory', () => {
    const board = makeSimpleBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count = 0;
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);
    expect(result.success).toBe(false);
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
    expect(board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.GoldStraight).success).toBe(true);
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
    expect(result.success).toBe(false);
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
    expect(result.success).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.GoldStraight);
    // Regular pipe returned to inventory
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(1);
    // Gold pipe consumed from inventory
    expect(board.inventory.find((i) => i.shape === PipeShape.GoldStraight)!.count).toBe(0);
  });

  it('sets error and rolls back when post-replacement constraint check fails', () => {
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
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
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
    expect(result.success).toBe(false);
    // A user-visible error must be set (grant invalidation)
    expect(result.error).toBeDefined();
    // Board and inventory must be fully rolled back
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.grid[0][1].rotation).toBe(90);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(-2);
  });

  it('sets error when replacing would disconnect the container that grants the new shape', () => {
    // Source → Straight(1,R=90,E-W) → Chamber(2, grants 1 Elbow) → Sink(3)
    // inventory = [{Straight:0, Elbow:-1+grant1=0}]: player has used the granted Elbow somewhere else
    // ... simpler: player has 0 base Elbows, 1 granted via connected container.
    // They try to replace Straight(1) with Elbow: placing Elbow at (0,1) disconnects the chamber
    // → Elbow grant drops to 0 → effectiveCount = 0 ≤ 0 → error.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,   0,  true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);  // E-W connector; will be replaced
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0,  true, 0, 0, PipeShape.Elbow, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Sink,     0,  true);
    board.sourceCapacity = 10;
    // 0 Elbows in base inventory; 1 granted by container → effectiveCount = 1 (valid to select)
    // 1 Straight placed (base 0 - 1 placed = count might need adjustment);
    // For simplicity, Straight was placed using a grant or base of 1:
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }, { shape: PipeShape.Elbow, count: 0 }];

    // Try to replace the E-W Straight with an Elbow (R=0, N-S connects N-S, not E-W)
    // An Elbow at R=0 connects North and East, not West-East, so it breaks the E-W chain.
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow, 0);
    expect(result.success).toBe(false);
    // Must set a user-visible error (inventory grant invalidation)
    expect(result.error).toBeDefined();
    // Board must be rolled back
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(0);
    expect(board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count).toBe(0);
  });

  it('does not report an error on success', () => {
    const board = makeSimpleBoard();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight);
    // Force a prior error

    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows replacement that connects a new negative container, making effective count more negative', () => {
    // Source(0,0) → Straight(0,1,R=90,E-W) → Chamber(0,2, -2 Straights) → Sink(0,3)
    //                       ↑
    //              Chamber(1,1, -2 Straights) [south of (0,1), not connected via Straight]
    //
    // Straight at (0,1) bridges Source→Chamber(-2)→Sink.  Container(-2) at (0,2) is
    // connected, so effectiveCount(Straight) = 0 + (-2) = -2.
    //
    // Replace Straight(0,1) with Tee(R=90, E-S-W) which:
    //   • keeps the east connection → Chamber(-2)(0,2) remains connected
    //   • adds a south connection   → Chamber(-2)(1,1) newly connected
    //
    // Net: effectiveCount(Straight) goes from -2 (original) to -3 (final), i.e. DECREASES.
    // PR #272 alone would block this (finalEffective < originalEffective).
    // The new allowance: no positive containers were disconnected → ALLOW.
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 5);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);                                           // E-W bridge; will be replaced
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0, true, 0, 0, PipeShape.Straight, -2, null, 'item'); // -2 penalty
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.grid[1][0] = new Tile(PipeShape.Empty,   0);
    board.grid[1][1] = new Tile(PipeShape.Chamber,  0, true, 0, 0, PipeShape.Straight, -2, null, 'item'); // -2 penalty, south of bridge
    board.grid[1][2] = new Tile(PipeShape.Empty,   0);
    board.grid[1][3] = new Tile(PipeShape.Empty,   0);
    board.sourceCapacity = 10;
    // base 1 Straight placed → count = 0; Chamber(-2) connected → effectiveCount = -2
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }, { shape: PipeShape.Tee, count: 1 }];

    // Replace Straight(0,1) with Tee(R=90, connects E-S-W).
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90);
    expect(result.success).toBe(true);
    expect(board.grid[0][1].shape).toBe(PipeShape.Tee);
    // Straight returned to inventory; Tee consumed
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(1);
    expect(board.inventory.find((i) => i.shape === PipeShape.Tee)!.count).toBe(0);
    // Both negative containers now connected: effectiveCount = 1 (base) + (-4) = -3
    const bonuses = board.getContainerBonuses();
    expect(bonuses.get(PipeShape.Straight)).toBe(-4);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count + (bonuses.get(PipeShape.Straight) ?? 0)).toBe(-3);
  });

  it('allows replacement when only a newly-connected negative container changes effective count', () => {
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5);
    board.grid[0][1] = new Tile(PipeShape.Elbow, 90); // W-S
    board.grid[0][2] = new Tile(PipeShape.Empty, 0);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true);
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Straight, 90); // Unconnected from source (E-W only).
    board.grid[1][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -1, null, 'item');
    board.grid[1][3] = new Tile(PipeShape.Empty, 0);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }, { shape: PipeShape.Elbow, count: 1 }];

    // Replacing (1,1) with Elbow(0: N-E) newly connects the negative chamber at (1,2),
    // but does not disconnect any positive chambers.
    const result = board.replaceInventoryTile({ row: 1, col: 1 }, PipeShape.Elbow, 0);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(board.grid[1][1].shape).toBe(PipeShape.Elbow);
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('allows replacement when disconnected bonuses stay non-negative before a new negative chamber connects', () => {
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true);
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -1, null, 'item');
    board.grid[1][2] = new Tile(PipeShape.Empty, 0);
    board.grid[1][3] = new Tile(PipeShape.Empty, 0);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: -1 }, { shape: PipeShape.Elbow, count: 1 }];

    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow, 180);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(board.grid[0][1].shape).toBe(PipeShape.Elbow);
    expect(board.grid[0][1].rotation).toBe(180);
  });

  it('allows replacement when new-shape affordability drops to zero only from a newly connected negative chamber', () => {
    const board = new Board(2, 4);
    board.source = { row: 1, col: 0 };
    board.sink = { row: 1, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 2, null, 'item');
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Empty, 0);
    board.grid[0][3] = new Tile(PipeShape.Empty, 0);
    board.grid[1][0] = new Tile(PipeShape.Source, 0, true, 5);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0); // unconnected from source (no west connection)
    board.grid[1][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -2, null, 'item');
    board.grid[1][3] = new Tile(PipeShape.Sink, 0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }, { shape: PipeShape.Elbow, count: 0 }];

    const result = board.replaceInventoryTile({ row: 1, col: 1 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(board.grid[1][1].shape).toBe(PipeShape.Straight);
    expect(board.grid[1][1].rotation).toBe(90);
  });

  it('still blocks replacement that disconnects a positive container even when a new negative one is connected', () => {
    // Source(0,0) → Straight(0,1,R=90,E-W) → Chamber(0,2, +3 Straights) → Sink(0,3)
    //                        ↑
    //               Chamber(1,1, -1 Straight) [south of (0,1), newly connected by Elbow]
    //
    // Replacing Straight(0,1) with Elbow(R=90, S-W) disconnects Chamber(+3) at (0,2)
    // AND connects Chamber(-1) at (1,1).  The positive grant is lost → block.
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 5);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);
    board.grid[0][2] = new Tile(PipeShape.Chamber,  0, true, 0, 0, PipeShape.Straight, 3, null, 'item'); // +3 grant
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true);
    board.grid[1][0] = new Tile(PipeShape.Empty,   0);
    board.grid[1][1] = new Tile(PipeShape.Chamber,  0, true, 0, 0, PipeShape.Straight, -1, null, 'item'); // -1 penalty
    board.grid[1][2] = new Tile(PipeShape.Empty,   0);
    board.grid[1][3] = new Tile(PipeShape.Empty,   0);
    board.sourceCapacity = 10;
    // 3 Straights placed using grants → count = -3; grant 3 → effectiveCount = 0 (valid)
    board.inventory = [{ shape: PipeShape.Straight, count: -3 }, { shape: PipeShape.Elbow, count: 1 }];

    // Elbow at R=90 connects South and West: (0,0)Source←W(0,1)Elbow S→(1,1)Chamber(-1)
    // Chamber(+3) at (0,2) is no longer reachable → positive grant lost → BLOCK
    const result = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Elbow, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Board must be rolled back
    expect(board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(board.inventory.find((i) => i.shape === PipeShape.Straight)!.count).toBe(-3);
    expect(board.inventory.find((i) => i.shape === PipeShape.Elbow)!.count).toBe(1);
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
    expect(result.success).toBe(true);
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

