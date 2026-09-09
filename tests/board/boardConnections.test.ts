import { Board, CROSS_PIPE_SHAPES, posKey } from '../../src/board';
import { Direction, PipeShape } from '../../src/types';
import { Tile } from '../../src/tile';
import { makeLevelDef } from '../testHelpers';
/** Build a minimal 2×1 board and manually set the tiles for deterministic testing. */
function makeTwoTileBoard(): Board {
  const board = new Board(1, 2);
  // Override source and sink to be at (0,0) and (0,1)
  board.source = { row: 0, col: 0 };
  board.sink = { row: 0, col: 1 };
  return board;
}

// Helper mirroring the effectiveFilled logic in renderBoard
function buildEffectiveFilled(
  filled: Set<string>,
  fillExclude: Set<string> | undefined,
): Set<string> {
  if (!fillExclude || fillExclude.size === 0) return filled;
  const result = new Set<string>(filled);
  for (const k of fillExclude) result.delete(k);
  return result;
}
describe('buildEffectiveFilled', () => {
  it('returns filled unchanged when fillExclude is empty', () => {
    const filled = new Set(['0,0', '0,1', '1,0']);
    const result = buildEffectiveFilled(filled, undefined);
    expect(result).toBe(filled); // same reference — no copy made
  });

  it('excludes keys present in fillExclude', () => {
    const filled = new Set(['0,0', '0,1', '1,0', '1,1']);
    const exclude = new Set(['0,1', '1,0']);
    const result = buildEffectiveFilled(filled, exclude);
    expect(result.has('0,0')).toBe(true);
    expect(result.has('0,1')).toBe(false);
    expect(result.has('1,0')).toBe(false);
    expect(result.has('1,1')).toBe(true);
  });

  it('does not mutate the original filled set', () => {
    const filled = new Set(['0,0', '0,1']);
    const exclude = new Set(['0,1']);
    const result = buildEffectiveFilled(filled, exclude);
    expect(result).not.toBe(filled);
    expect(filled.has('0,1')).toBe(true); // original unchanged
  });
});

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

  it('returns false when neighbor is out of bounds', () => {
    const board = new Board(3, 3);
    // North of (0,0) is out of bounds
    expect(board.areMutuallyConnected({ row: 0, col: 0 }, Direction.North)).toBe(false);
  });
});

describe('Board.areMutuallyConnected – one-way tiles', () => {
  function makeBoardWithOneWay(dir: Direction): Board {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    // Place two E-W Straight pipes on both cells
    board.grid[0][0] = new Tile(PipeShape.Straight, 90); // E-W
    board.grid[0][1] = new Tile(PipeShape.Straight, 90); // E-W
    // Mark cell (0,0) as a one-way tile pointing `dir`
    board.oneWayData.set('0,0', dir);
    return board;
  }

  it('allows flow in the one-way direction (East tile, flowing East)', () => {
    const board = makeBoardWithOneWay(Direction.East);
    // Flowing East from (0,0) is allowed (arrow points East, blocked = West)
    expect(board.areMutuallyConnected({ row: 0, col: 0 }, Direction.East)).toBe(true);
  });

  it('blocks flow opposite to the one-way direction (East tile, flowing West)', () => {
    // Put the two pipes on a 1×3 board so (0,1) can flow West into (0,0)
    const board2 = new Board(1, 3);
    board2.source = { row: 0, col: 0 };
    board2.sink   = { row: 0, col: 2 };
    board2.grid[0][0] = new Tile(PipeShape.Straight, 90); // E-W
    board2.grid[0][1] = new Tile(PipeShape.Straight, 90); // E-W
    board2.grid[0][2] = new Tile(PipeShape.Straight, 90); // E-W
    board2.oneWayData.set('0,1', Direction.East); // one-way at (0,1) pointing East
    // From (0,1), flowing West is blocked (blocked exit = West = opposite of East)
    expect(board2.areMutuallyConnected({ row: 0, col: 1 }, Direction.West)).toBe(false);
  });

  it('blocks entry from the direction opposite the arrow', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Straight, 90); // E-W
    board.grid[0][1] = new Tile(PipeShape.Straight, 90); // E-W
    board.grid[0][2] = new Tile(PipeShape.Straight, 90); // E-W
    board.oneWayData.set('0,1', Direction.East); // one-way at (0,1) pointing East
    // Trying to flow East FROM (0,0) INTO (0,1): (0,0) has no restriction,
    // but (0,1) blocks entry in direction opposite its arrow (West arrival from the East)
    // Direction.East means traveling from (0,0) to (0,1), entering (0,1) traveling East.
    // (0,1) points East, blocked entry = opposite = West. Entry direction IS East ≠ West → NOT blocked.
    expect(board.areMutuallyConnected({ row: 0, col: 0 }, Direction.East)).toBe(true);
    // Trying to flow West FROM (0,2) INTO (0,1): (0,2) has no restriction,
    // (0,1) points East, blocked entry = West. Entry direction IS West = West → BLOCKED.
    expect(board.areMutuallyConnected({ row: 0, col: 2 }, Direction.West)).toBe(false);
  });

  it('allows perpendicular flow (sideways through one-way tile)', () => {
    const board = new Board(2, 1);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 1, col: 0 };
    board.grid[0][0] = new Tile(PipeShape.Straight, 0); // N-S
    board.grid[1][0] = new Tile(PipeShape.Straight, 0); // N-S
    board.oneWayData.set('0,0', Direction.East); // one-way pointing East; blocked = West
    // Flowing South from (0,0) is perpendicular to the one-way (East/West blocked), so allowed
    expect(board.areMutuallyConnected({ row: 0, col: 0 }, Direction.South)).toBe(true);
  });

  it('getOneWayDirection returns correct direction', () => {
    const board = new Board(2, 2);
    board.oneWayData.set('0,0', Direction.North);
    board.oneWayData.set('1,1', Direction.West);
    expect(board.getOneWayDirection({ row: 0, col: 0 })).toBe(Direction.North);
    expect(board.getOneWayDirection({ row: 1, col: 1 })).toBe(Direction.West);
    expect(board.getOneWayDirection({ row: 0, col: 1 })).toBeNull();
  });

  it('_initFromLevel populates oneWayData from level def', () => {
    // The Source connections field is left out (defaults to all-4) to keep the fixture minimal.
    const level = makeLevelDef({
      rows: 2,
      cols: 2,
      grid: [
        [{ shape: PipeShape.Source, capacity: 5 }, { shape: PipeShape.OneWay, rotation: 90 }],
        [null, { shape: PipeShape.Sink }],
      ],
    });
    const board = new Board(2, 2, level);
    // OneWay at (0,1) with rotation 90 → Direction.East
    expect(board.oneWayData.size).toBe(1);
    expect(board.getOneWayDirection({ row: 0, col: 1 })).toBe(Direction.East);
    // The grid cell should be Empty (the pipe layer)
    expect(board.grid[0][1].shape).toBe(PipeShape.Empty);
  });
});



describe('Board.isSolved', () => {
  it('returns false for a newly constructed board', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Straight, 0, true); // N-S
    board.grid[0][1] = new Tile(PipeShape.Straight, 90, true); // E-W
    expect(board.isSolved()).toBe(false);
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
    expect(board.rotateTileBy({ row: 1, col: 1 }, 1).success).toBe(true);
    expect(board.grid[1][1].rotation).toBe(90);
  });

  it('rotates a tile by 2 steps (180°) in one operation', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 2).success).toBe(true);
    expect(board.grid[1][1].rotation).toBe(180);
  });

  it('rotates a tile by 3 steps (270°) in one operation', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 3).success).toBe(true);
    expect(board.grid[1][1].rotation).toBe(270);
  });

  it('0 steps is a no-op and returns true', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 0).success).toBe(true);
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('4 steps is a full rotation: leaves rotation unchanged and returns true', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 90);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 4).success).toBe(true);
    expect(board.grid[1][1].rotation).toBe(90);
  });

  it('returns false for a fixed tile', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0, true /* isFixed */);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 1).success).toBe(false);
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('returns false for an empty tile', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Empty, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, 1).success).toBe(false);
  });

  it('negative steps rotate counter-clockwise (-1 → 270°)', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Elbow, 0);
    expect(board.rotateTileBy({ row: 1, col: 1 }, -1).success).toBe(true);
    expect(board.grid[1][1].rotation).toBe(270);
  });
});

// ─── Cross pipe rotation ──────────────────────────────────────────────────────

describe('CROSS_PIPE_SHAPES', () => {
  it('contains Cross, GoldCross and LeakyCross', () => {
    expect(CROSS_PIPE_SHAPES.has(PipeShape.Cross)).toBe(true);
    expect(CROSS_PIPE_SHAPES.has(PipeShape.GoldCross)).toBe(true);
    expect(CROSS_PIPE_SHAPES.has(PipeShape.LeakyCross)).toBe(true);
  });

  it('does not contain non-cross shapes', () => {
    expect(CROSS_PIPE_SHAPES.has(PipeShape.Straight)).toBe(false);
    expect(CROSS_PIPE_SHAPES.has(PipeShape.Elbow)).toBe(false);
    expect(CROSS_PIPE_SHAPES.has(PipeShape.Tee)).toBe(false);
  });
});

describe('Cross pipes are not rotatable', () => {
  it('rotateTile returns false for Cross and does not report error', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Cross, 0);
    const result = board.rotateTile({ row: 1, col: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBeUndefined();
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('rotateTileBy returns false for Cross and does not report error', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.Cross, 0);
    const result = board.rotateTileBy({ row: 1, col: 1 }, 2);
    expect(result.success).toBe(false);
    expect(result.error).toBeUndefined();
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('rotateTile returns false for GoldCross and does not report error', () => {
    const board = new Board(3, 3);
    board.goldSpaces.add(posKey(1, 1));
    board.grid[1][1] = new Tile(PipeShape.GoldCross, 0);
    const result = board.rotateTile({ row: 1, col: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBeUndefined();
    expect(board.grid[1][1].rotation).toBe(0);
  });

  it('rotateTile returns false for LeakyCross and does not report error', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.LeakyCross, 0);
    const result = board.rotateTile({ row: 1, col: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBeUndefined();
    expect(board.grid[1][1].rotation).toBe(0);
  });
});


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

  function makeMixedGrantRotateBoard(baseCount: number): Board {
    const board = new Board(2, 3);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 1, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Tee, 90); // W-E-S; CW rotation disconnects only the east chamber.
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 2, null, 'item');
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -1, null, 'item');
    board.grid[1][2] = new Tile(PipeShape.Empty, 0);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: baseCount }];
    return board;
  }

  it('allows rotation when the rotated pipe type inventory is negative and no required grant is disconnected', () => {
    const board = makeRotateConstraintBoard();
    // Straight at (0,3) rotates 90°→180° (E-W → N-S). This disconnects sink-side flow
    // but keeps source↔chamber connected, so the required Straight grant remains covered.
    const result = board.rotateTile({ row: 0, col: 3 });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(board.grid[0][3].rotation).toBe(180);
  });

  it('allows rotation when no container grants have been used (count ≥ 0)', () => {
    // Same board structure but inventory count is 0 (no overdraft from grants).
    // Disconnecting the chamber still leaves the effective count non-negative, so the rotation is allowed.
    const board = makeRotateConstraintBoard();
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];
    // Rotating Straight(0,1) E-W → N-S disconnects the container, but since
    // no grant was over-used (count ≥ 0), the rotation is permitted.
    const result = board.rotateTile({ row: 0, col: 1 });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('blocks rotation that disconnects a container when its grant is in use', () => {
    const board = makeRotateConstraintBoard();
    // Straight at (0,1) rotates 90°→180° (E-W → N-S), disconnecting source↔chamber.
    // After rotation: grant = 0 → base(-1) + grant(0) = -1 < 0 → blocked.
    const result = board.rotateTile({ row: 0, col: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Tile must be restored to original rotation (90°).
    expect(board.grid[0][1].rotation).toBe(90);
  });

  it('blocks rotation when disconnecting a positive grant makes a previously non-negative count go negative', () => {
    const board = makeMixedGrantRotateBoard(0);

    const result = board.rotateTile({ row: 0, col: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorTilePositions).toEqual([{ row: 0, col: 2 }]);
    expect(board.grid[0][1].rotation).toBe(90);
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

  it('allows multi-step rotation when the rotated pipe type inventory is negative and no required grant is disconnected', () => {
    const board = makeRotateByConstraintBoard();
    // 1 step at (0,3): 90°→180° (E-W → N-S). Chamber grant remains connected.
    const result = board.rotateTileBy({ row: 0, col: 3 }, 1);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(board.grid[0][3].rotation).toBe(180);
  });

  it('blocks multi-step rotation that disconnects a container when its grant is in use', () => {
    const board = makeRotateByConstraintBoard();
    // 1 step: 90°→180° (E-W → N-S), disconnects source↔chamber → blocked.
    const result = board.rotateTileBy({ row: 0, col: 1 }, 1);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Tile must be restored to original rotation (90°).
    expect(board.grid[0][1].rotation).toBe(90);
  });

  it('allows rotation that disconnects mixed positive/negative item grants when net grant does not decrease', () => {
    const board = new Board(1, 6);
    board.source = { row: 0, col: 0 };
    board.sink = { row: 0, col: 5 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Straight, 90); // E-W; rotating disconnects the chamber chain.
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 2, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -3, null, 'item');
    board.grid[0][4] = new Tile(PipeShape.Straight, 90);
    board.grid[0][5] = new Tile(PipeShape.Sink, 0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: -2 }];

    const result = board.rotateTileBy({ row: 0, col: 1 }, 1);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(board.grid[0][1].rotation).toBe(180);
  });

  it('allows rotation when disconnected bonuses stay non-negative before a new negative chamber connects', () => {
    const board = new Board(3, 3);
    board.source = { row: 1, col: 0 };
    board.sink = { row: 2, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Empty, 0);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -1, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Empty, 0);
    board.grid[1][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[1][1] = new Tile(PipeShape.Tee, 90); // W-E-S; CW rotation disconnects east and connects north.
    board.grid[1][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[2][0] = new Tile(PipeShape.Empty, 0);
    board.grid[2][1] = new Tile(PipeShape.Sink, 0, true);
    board.grid[2][2] = new Tile(PipeShape.Empty, 0);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 0 }];

    const result = board.rotateTile({ row: 1, col: 1 });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(board.grid[1][1].rotation).toBe(180);
  });
});

// ─── New: level loading ──────────────────────────────────────────────────────

