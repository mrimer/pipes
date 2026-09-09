import { Board, ERR_REGULATOR_CHECK } from '../../src/board';
import { Direction, PipeShape } from '../../src/types';
import { Tile } from '../../src/tile';
import { makeLevelDef } from '../testHelpers';
describe('Gel and Siphon chambers — getCurrentWater (incremental path via applyTurnDelta)', () => {
  /** Build a fully-connected 1×3 board with given chamber and call initHistory(). */
  function makeConnectedChamberBoard(chamberContent: 'gel' | 'siphon', sourceCapacity = 10): Board {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, sourceCapacity, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, chamberContent);
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = sourceCapacity;
    board.inventory = [];
    board.initHistory();
    return board;
  }

  it('Gel halves the water total (floor) — incremental path', () => {
    const board = makeConnectedChamberBoard('gel', 10);
    expect(board.getCurrentWater()).toBe(5);
  });

  it('Siphon doubles the water total — incremental path', () => {
    const board = makeConnectedChamberBoard('siphon', 10);
    expect(board.getCurrentWater()).toBe(20);
  });

  it('Gel floors correctly on odd source capacity — incremental path', () => {
    const board = makeConnectedChamberBoard('gel', 11);
    expect(board.getCurrentWater()).toBe(5);
  });

  it('Siphon applied before Gel when both present — incremental path', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'gel');
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [];
    board.initHistory();
    // Siphon first: 10 × 2 = 20, Gel: floor(20/2) = 10
    expect(board.getCurrentWater()).toBe(10);
  });

  it('Gel + Siphon effectively cancel with even water (no rounding artifact)', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 4, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'gel');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 4;
    board.inventory = [];
    board.initHistory();
    // Siphon: 4 × 2 = 8; Gel: floor(8/2) = 4
    expect(board.getCurrentWater()).toBe(4);
  });

  it('Gel animation delta (locked impact) is the water lost at connection time', () => {
    const board = makeConnectedChamberBoard('gel', 10);
    // Base = 10 (no other tiles affect water before gel), Gel halves to 5, so delta = -5
    const delta = board.getLockedWaterImpact({ row: 0, col: 1 });
    expect(delta).toBe(-5);
  });

  it('Siphon animation delta (locked impact) is the water gained at connection time', () => {
    const board = makeConnectedChamberBoard('siphon', 10);
    // Base = 10, Siphon doubles to 20, delta = +10
    const delta = board.getLockedWaterImpact({ row: 0, col: 1 });
    expect(delta).toBe(10);
  });

  it('Siphon connects incrementally — water doubles when newly connected', () => {
    // Board: Source(0,0) → [Empty(0,1)] → Siphon(0,2) → Sink(0,3)
    // Siphon at (0,2) is only connected after player places pipe at (0,1).
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 8, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 8;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    // Siphon not yet connected; water = 8
    expect(board.getCurrentWater()).toBe(8);

    // Connect the path by placing a pipe at (0,1)
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Now Siphon is connected: 8 (source) - 1 (pipe) = 7 base, × 2 = 14
    expect(board.getCurrentWater()).toBe(14);

    // Animation delta stored for Siphon should equal the base at connection time (7)
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(7);
  });

  it('Gel connects incrementally — water halves when newly connected', () => {
    // Board: Source(0,0) → [Empty(0,1)] → Gel(0,2) → Sink(0,3)
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 8, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'gel');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 8;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    expect(board.getCurrentWater()).toBe(8);

    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Base = 8 - 1 = 7; Gel halves → floor(7/2) = 3
    expect(board.getCurrentWater()).toBe(3);

    // Animation delta: floor(7/2) - 7 = 3 - 7 = -4
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-4);
  });

  it('Gel costs 0 when water is exactly 0 at connection time', () => {
    // Source capacity = 0, so running total is 0 before gel connects.
    const board = makeConnectedChamberBoard('gel', 0);
    expect(board.getCurrentWater()).toBe(0);
    // The gel's locked impact should be 0 (no water to halve).
    expect(board.getLockedWaterImpact({ row: 0, col: 1 })).toBe(0);
  });

  it('Gel costs 0 when water is negative at connection time', () => {
    // Build a board where a cost chamber has driven water negative before gel connects.
    // Source=2, one dirt chamber (flat cost=5 → impact=-5), then gel.
    // Running total before gel = 2 + (-5) = -3; clamped to 0, so gel adds 0 delta.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 2, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 5, null, 1, null, 'dirt');
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'gel');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 2;
    board.inventory = [];
    board.initHistory();

    // Running total = 2 + (-5) = -3 before gel; clamped to 0, so gel adds 0 delta.
    // Final water = 2 + (-5) + 0 = -3 (water can go negative via cost; gel doesn't worsen it).
    expect(board.getCurrentWater()).toBe(-3);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(0);
  });

  it('Siphon is a one-time effect — pipes and tanks added later are not doubled', () => {
    // Connect Siphon on turn 1 (one-time doubling), then add a Pipe + Tank on turn 2.
    // The Siphon impact is locked at connection time and does not re-apply.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][2] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][3] = new Tile(PipeShape.Chamber, 0, true, 6, 0, null, 1, null, 'tank');
    board.grid[0][4] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    // Turn 1: Siphon connected. base = 10, one-time +10 → water = 20
    expect(board.getCurrentWater()).toBe(20);

    // Turn 2: place pipe at (0,2) to connect the Tank too
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();

    // Siphon locked impact (+10) + pipe (-1) + tank (+6) = 10 + 10 - 1 + 6 = 25
    // (Siphon does NOT double the tank/pipe added this turn)
    expect(board.getCurrentWater()).toBe(25);
  });

  it('Gel and Siphon undo/redo correctly restores water', () => {
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    expect(board.getCurrentWater()).toBe(10);

    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    // base = 10 - 1 = 9; × 2 = 18
    expect(board.getCurrentWater()).toBe(18);

    board.undoMove();
    expect(board.getCurrentWater()).toBe(10);

    board.redoMove();
    expect(board.getCurrentWater()).toBe(18);
  });

  it('Siphon reconnect applies frozen flat gain — no re-doubling', () => {
    // Board: Source(0,0) → [Empty(0,1)] → Siphon(0,2) → Sink(0,3)
    // Source = 10; pipe costs 1; first connect: base=9 → ×2=18, frozenGain=9
    // Reclaim pipe → siphon disconnects
    // Re-place pipe → siphon reconnects with flat +9, not re-doubling
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: place pipe, connect siphon
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(18); // 10 - 1 = 9, ×2 = 18, lockedImpact=9

    // Frozen gain should equal 9 after first connect
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(9);

    // Turn 2: reclaim the pipe — siphon disconnects
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(10); // back to source only

    // Frozen gain persists through disconnect
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(9);

    // Turn 3: re-place pipe — siphon reconnects with flat gain (not re-double)
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    // base = 10 - 1 (pipe) = 9; siphon applies flat +9 → 18
    // If it re-doubled it would be 9×2=18 too in this case, but the lockedImpact stays 9
    expect(board.getCurrentWater()).toBe(18);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(9); // same frozen gain, not re-doubled
  });

  it('Siphon reconnect applies original frozen gain when base total has changed', () => {
    // Board: Source → [Gap] → Siphon → Sink
    // First connect with source=10 → frozenGain=9.
    // Increase source capacity to 14 while siphon is disconnected, then reconnect.
    // With flat add: locked=9, water=14-1+9=22.
    // With re-double: locked=13, water=14-1+13=26.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: connect siphon. base=10-1=9 → frozenGain=9, water=18
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(18);
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(9);

    // Turn 2: disconnect siphon
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(10);

    // Increase source capacity so base at reconnect (14-1=13) ≠ frozenGain (9)
    board.sourceCapacity = 14;

    // Turn 3: reconnect siphon — flat add frozenGain=9, NOT re-double of 13
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(9);  // frozen, not 13
    expect(board.getCurrentWater()).toBe(22); // 14 - 1 + 9 = 22; re-double would give 26
  });

  it('Siphon frozen gain survives undo/redo of disconnect', () => {
    // Board: Source → [Empty] → Siphon → Sink
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: connect siphon
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(18);
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(9);

    // Turn 2: disconnect siphon
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(10);
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(9);

    // Undo disconnect — siphon reconnects; frozen gain remains 9
    board.undoMove();
    expect(board.getCurrentWater()).toBe(18);
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(9);

    // Undo first connect — frozen gain removed (snapshot before first connect has null)
    board.undoMove();
    expect(board.getCurrentWater()).toBe(10);
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBeNull();
  });

  it('getSiphonLockedGain returns null before first connect and the frozen gain after', () => {
    // Board: Source → [Empty] → Siphon → Sink
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 6, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 6;
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Before connect: null
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBeNull();

    // After first connect: 6 - 1 = 5 → frozen = 5
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(5);

    // After disconnect: still 5
    board.reclaimTile({ row: 0, col: 1 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getSiphonLockedGain({ row: 0, col: 2 })).toBe(5);
  });

  it('three siphons cannot be pumped by detach/reattach rotation', () => {
    // Linear chain — Source(0,0) → c(0,1) → S1(0,2) → c(0,3) → S2(0,4) → c(0,5) → S3(0,6) → Sink(0,7)
    // The c() cells are player-placed connector pipes; reclaiming one disconnects the
    // siphons downstream of it. Connecting all three in sequence reaches base·2^3.
    // The frozen-gain rule must make every detach/reattach exactly reversible, so no
    // rotation can ever raise water above the all-connected maximum (the money pump).
    const board = new Board(1, 8);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 7 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 8, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][3] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][4] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][5] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][6] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon');
    board.grid[0][7] = new Tile(PipeShape.Sink,    0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 8;
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    board.initHistory();

    const connectors = [1, 3, 5]; // S1, S2, S3 connector columns
    const place = (col: number) => {
      board.placeInventoryTile({ row: 0, col }, PipeShape.Straight, 90);
      board.applyTurnDelta();
      board.recordMove();
    };
    const detach = (col: number) => {
      board.reclaimTile({ row: 0, col });
      board.applyTurnDelta();
      board.recordMove();
    };

    // Connect all three in sequence: each siphon first-attaches at a rising total.
    for (const col of connectors) place(col);
    const maxWater = board.getCurrentWater();
    // Sanity: doublings actually happened (well above the bare source capacity).
    expect(maxWater).toBeGreaterThan(board.sourceCapacity);

    // Frozen gains are now fixed constants on each siphon.
    const frozen = [2, 4, 6].map((c) => board.getSiphonLockedGain({ row: 0, col: c }));
    expect(frozen.every((g) => g !== null)).toBe(true);

    // Rotate detach/reattach in sequence, every order, many times. Water must never
    // exceed the all-connected maximum, and must return to it exactly when whole.
    let observedMax = maxWater;
    const cycle = (order: number[]) => {
      for (const col of order) {
        detach(col);
        observedMax = Math.max(observedMax, board.getCurrentWater());
      }
      // Reattach in the reverse order (innermost-first), restoring full connection.
      for (const col of [...order].reverse()) {
        place(col);
        observedMax = Math.max(observedMax, board.getCurrentWater());
      }
      expect(board.getCurrentWater()).toBe(maxWater);
    };

    // Tail-first, head-first, and middle-out rotations — the classic pump attempts.
    cycle([5, 3, 1]);
    cycle([1, 3, 5]);
    cycle([3, 5, 1]);
    cycle([5, 1, 3]);

    // No rotation ever banked extra water beyond the honest maximum.
    expect(observedMax).toBe(maxWater);

    // Frozen gains are unchanged by all the rotation (never re-doubled or re-frozen).
    expect([2, 4, 6].map((c) => board.getSiphonLockedGain({ row: 0, col: c }))).toEqual(frozen);
  });
});

// ─── Regulator chambers ───────────────────────────────────────────────────────

describe('Regulator chambers — stat check at connection time', () => {
  /**
   * Build a board where the regulator tile is not yet connected so that a
   * single player placement completes the path and triggers the check:
   *
   *   Source(0,0, cap) → Straight(0,1, fixed) → [Empty](0,2) → Regulator(0,3) → Sink(0,4)
   *
   * Pre-placement water = cap − 1 (one fixed straight-pipe cost).
   */
  function makeRegulatorBoard(
    cap: number,
    stat: 'water' | 'frozen' | 'temperature' | 'pressure',
    op: '<' | '>' | '=',
    threshold: number,
  ): Board {
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, cap, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Straight, 90, true); // E-W, fixed — costs 1 water when connected
    board.grid[0][2] = new Tile(PipeShape.Empty, 0, false);
    board.grid[0][3] = new Tile(
      PipeShape.Chamber, 0, true, 0, threshold, null, 1, null, 'regulator',
      0, 0, 0, 0, null, stat, op,
    );
    board.grid[0][4] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = cap;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();
    return board;
  }

  // ── water stat ──

  it('passes when water > threshold (water stat, > operator)', () => {
    const board = makeRegulatorBoard(10, 'water', '>', 5);
    // Pre-placement water = 10 − 1 = 9; 9 > 5 → passes
    const result = board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
  });

  it('fails when water <= threshold (water stat, > operator)', () => {
    const board = makeRegulatorBoard(3, 'water', '>', 5);
    // Pre-placement water = 3 − 1 = 2; 2 > 5 → fails
    const result = board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_REGULATOR_CHECK);
    expect(result.errorParams).toEqual({ stat: 'Water', op: '>', threshold: 5 });
    expect(result.errorTilePositions).toEqual([{ row: 0, col: 3 }]);
  });

  it('passes when water < threshold (< operator)', () => {
    const board = makeRegulatorBoard(3, 'water', '<', 5);
    // Pre-placement water = 2; 2 < 5 → passes
    const result = board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
  });

  it('fails when water >= threshold (< operator)', () => {
    const board = makeRegulatorBoard(10, 'water', '<', 5);
    // Pre-placement water = 9; 9 < 5 → fails
    const result = board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_REGULATOR_CHECK);
    expect(result.errorParams).toEqual({ stat: 'Water', op: '<', threshold: 5 });
  });

  it('passes when temperature = threshold (= operator — stat unaffected by pipe cost)', () => {
    // Temperature does not change when a pipe is placed, so pre-check and post-check
    // both see the same value and can pass the = operator test.
    // Board: Source(temp=5) → Heater(temp=0) → Straight(fixed) → [Empty] → Regulator(temp=5) → Sink
    const board = makeTemperatureRegulatorBoard(5, 0, '=', 5);
    const result = board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
  });

  it('fails when water != threshold (= operator)', () => {
    const board = makeRegulatorBoard(10, 'water', '=', 5);
    // Pre-placement water = 9; 9 ≠ 5 → fails
    const result = board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_REGULATOR_CHECK);
    expect(result.errorParams).toEqual({ stat: 'Water', op: '=', threshold: 5 });
  });

  // ── rollback on failure ──

  it('failed placement rolls back board state and restores inventory', () => {
    const board = makeRegulatorBoard(3, 'water', '>', 5);
    // 2 > 5 → fails; grid[0][2] must stay Empty and inventory count must be unchanged
    const invBefore = board.inventory.find(i => i.shape === PipeShape.Straight)!.count;
    board.placeInventoryTile({ row: 0, col: 2 }, PipeShape.Straight, 90);
    expect(board.grid[0][2].shape).toBe(PipeShape.Empty);
    expect(board.inventory.find(i => i.shape === PipeShape.Straight)!.count).toBe(invBefore);
  });

  // ── pre-move vs. post-turn stats ──

  it('post-turn check rejects a placement whose pipe cost drops water to the threshold (pre-check passes, post-check fails)', () => {
    // Board: Source(cap=4) → [Empty](0,1) → Regulator(water > 3)(0,2) → Sink(0,3)
    // After initHistory: fill = {Source}, water = 4.
    // Player places Straight at (0,1):
    //   Pre-check:  pre-water = 4 > 3 → passes.
    //   Post-check: connecting the pipe costs 1 → post-water = 3; 3 > 3 is false → rejected.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 4, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(
      PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'regulator',
      0, 0, 0, 0, null, 'water', '>',
    );
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 4;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_REGULATOR_CHECK);
    expect(result.errorParams).toEqual({ stat: 'Water', op: '>', threshold: 3 });
  });

  it('pre-check rejects when a heater connecting in the same turn would satisfy the threshold but pre-stats do not', () => {
    // Board: Source(temp=0) → [Empty](0,1) → Heater(temp=10, fixed)(0,2) → Regulator(temp > 5)(0,3) → Sink(0,4)
    // After initHistory: fill = {Source}, temperature = 0.
    // Player places Straight at (0,1) — this would connect both the Heater and the Regulator.
    //   Pre-check:  pre-temperature = 0 (heater not yet connected); 0 > 5 → rejected.
    //   Post-check: would be post-temperature = 10 > 5, but the pre-check fires first.
    const board = new Board(1, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Empty,   0, false);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 10);
    board.grid[0][3] = new Tile(
      PipeShape.Chamber, 0, true, 0, 5, null, 1, null, 'regulator',
      0, 0, 0, 0, null, 'temperature', '>',
    );
    board.grid[0][4] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();

    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_REGULATOR_CHECK);
    expect(result.errorParams).toEqual({ stat: 'Temperature', op: '>', threshold: 5 });
  });

  // ── temperature stat ──

  /**
   * Build a board where a heater is already connected before the regulator,
   * so the temperature check can be exercised:
   *
   *   Source(0,0, temp=sourceTemp) → Heater(0,1, temp=heaterTemp) → Straight(0,2, fixed)
   *     → [Empty](0,3) → Regulator(0,4, temperature OP threshold) → Sink(0,5)
   *
   * Pre-placement temperature = sourceTemp + heaterTemp.
   */
  function makeTemperatureRegulatorBoard(
    sourceTemp: number,
    heaterTemp: number,
    op: '<' | '>' | '=',
    threshold: number,
  ): Board {
    const board = new Board(1, 6);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 5 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]), null, sourceTemp);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', heaterTemp);
    board.grid[0][2] = new Tile(PipeShape.Straight, 90, true); // E-W, fixed
    board.grid[0][3] = new Tile(PipeShape.Empty, 0, false);
    board.grid[0][4] = new Tile(
      PipeShape.Chamber, 0, true, 0, threshold, null, 1, null, 'regulator',
      0, 0, 0, 0, null, 'temperature', op,
    );
    board.grid[0][5] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();
    return board;
  }

  it('passes when temperature > threshold (temperature stat)', () => {
    // sourceTemp=8, heaterTemp=5 → pre-move temperature=13; 13 > 10 → passes
    const board = makeTemperatureRegulatorBoard(8, 5, '>', 10);
    const result = board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
  });

  it('fails when temperature <= threshold (temperature stat)', () => {
    // sourceTemp=8, heaterTemp=5 → pre-move temperature=13; 13 > 15 → fails
    const board = makeTemperatureRegulatorBoard(8, 5, '>', 15);
    const result = board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_REGULATOR_CHECK);
    expect(result.errorParams).toEqual({ stat: 'Temperature', op: '>', threshold: 15 });
  });

  // ── pressure stat ──

  /**
   * Build a board where a pump is already connected before the regulator,
   * so the pressure check can be exercised:
   *
   *   Source(0,0, pressure=sourcePressure) → Pump(0,1, pressure=pumpPressure)
   *     → Straight(0,2, fixed) → [Empty](0,3) → Regulator(0,4, pressure OP threshold) → Sink(0,5)
   *
   * Pre-placement pressure = sourcePressure + pumpPressure.
   */
  function makePressureRegulatorBoard(
    sourcePressure: number,
    pumpPressure: number,
    op: '<' | '>' | '=',
    threshold: number,
  ): Board {
    const board = new Board(1, 6);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 5 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true, 10, 0, null, 1, new Set([Direction.East]), null, 0, sourcePressure);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, pumpPressure);
    board.grid[0][2] = new Tile(PipeShape.Straight, 90, true); // E-W, fixed
    board.grid[0][3] = new Tile(PipeShape.Empty, 0, false);
    board.grid[0][4] = new Tile(
      PipeShape.Chamber, 0, true, 0, threshold, null, 1, null, 'regulator',
      0, 0, 0, 0, null, 'pressure', op,
    );
    board.grid[0][5] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }];
    board.initHistory();
    return board;
  }

  it('passes when pressure > threshold (pressure stat)', () => {
    // sourcePressure=2, pumpPressure=3 → pre-move pressure=5; 5 > 4 → passes
    const board = makePressureRegulatorBoard(2, 3, '>', 4);
    const result = board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
  });

  it('fails when pressure <= threshold (pressure stat)', () => {
    // sourcePressure=2, pumpPressure=3 → pre-move pressure=5; 5 > 6 → fails
    const board = makePressureRegulatorBoard(2, 3, '>', 6);
    const result = board.placeInventoryTile({ row: 0, col: 3 }, PipeShape.Straight, 90);
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_REGULATOR_CHECK);
    expect(result.errorParams).toEqual({ stat: 'Pressure', op: '>', threshold: 6 });
  });
});

describe('getFilledPositions cache', () => {
  /**
   * Build a simple connected 1×3 board: Source(0,0)→Straight(0,1)→Sink(0,2).
   * The board is loaded from a LevelDef so the grid is deterministic.
   */
  function makeConnectedBoard(): Board {
    const level = makeLevelDef({
      rows: 1,
      cols: 3,
      grid: [[
        { shape: PipeShape.Source, capacity: 5, connections: [Direction.East] },
        { shape: PipeShape.Straight, connections: [Direction.East, Direction.West] },
        { shape: PipeShape.Sink, connections: [Direction.West] },
      ]],
      inventory: [{ shape: PipeShape.Straight, count: 1 }],
    });
    return new Board(1, 3, level);
  }

  it('returns the same Set object on two consecutive calls without mutation', () => {
    const board = makeConnectedBoard();
    const first = board.getFilledPositions();
    const second = board.getFilledPositions();
    expect(second).toBe(first); // same reference — cache hit
  });

  it('returns a new Set after a successful tile placement', () => {
    const level = makeLevelDef({
      rows: 1,
      cols: 3,
      grid: [[
        { shape: PipeShape.Source, capacity: 5, connections: [Direction.East] },
        { shape: PipeShape.Empty },
        { shape: PipeShape.Sink, connections: [Direction.West] },
      ]],
      inventory: [{ shape: PipeShape.Straight, count: 1 }],
    });
    const board = new Board(1, 3, level);
    board.initHistory();

    const before = board.getFilledPositions();
    // Placing a Straight pipe connects source to sink — fill set must change.
    const result = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(result.success).toBe(true);
    const after = board.getFilledPositions();

    expect(after).not.toBe(before); // new Set object — cache was invalidated
    expect(before.size).toBe(1);    // only source before placement
    expect(after.size).toBe(3);     // source + straight + sink after placement
  });

  it('returns a new Set after undoMove', () => {
    const level = makeLevelDef({
      rows: 1,
      cols: 3,
      grid: [[
        { shape: PipeShape.Source, capacity: 5, connections: [Direction.East] },
        { shape: PipeShape.Empty },
        { shape: PipeShape.Sink, connections: [Direction.West] },
      ]],
      inventory: [{ shape: PipeShape.Straight, count: 1 }],
    });
    const board = new Board(1, 3, level);
    board.initHistory();
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.recordMove();

    const afterPlace = board.getFilledPositions();
    expect(afterPlace.size).toBe(3);

    board.undoMove();
    const afterUndo = board.getFilledPositions();

    expect(afterUndo).not.toBe(afterPlace); // new Set — cache invalidated by undo
    expect(afterUndo.size).toBe(1);         // back to source-only
  });
});
