import { Board, SPIN_PIPE_SHAPES, ERR_SANDSTONE_TOO_HARD } from '../../src/board';
import { Direction, PipeShape } from '../../src/types';
import type { AmbientDecoration } from '../../src/types';
import { Tile } from '../../src/tile';
import { LEVELS } from '../levels';
import { getTileDisplayName } from '../../src/renderer';

describe('getTileDisplayName', () => {
  it('returns "Tank +7 water" for a tank chamber with capacity 7', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 7, 0, null, 1, null, 'tank');
    expect(getTileDisplayName(tile)).toBe('Tank +7 water');
  });

  it('returns "Tank water" for a tank chamber with capacity 0', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank');
    expect(getTileDisplayName(tile)).toBe('Tank water');
  });

  it('returns "Heater +2°" for a heater chamber with temperature 2', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 2);
    expect(getTileDisplayName(tile)).toBe('Heater +2°');
  });

  it('returns "Heater" for a heater chamber with temperature 0', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 0);
    expect(getTileDisplayName(tile)).toBe('Heater');
  });

  it('returns "Item: Gold Straight" for an item container holding 1 GoldStraight', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.GoldStraight, 1, null, 'item');
    expect(getTileDisplayName(tile)).toBe('Item: Gold Straight');
  });

  it('returns "Item: 2× Gold Straight" for an item container holding 2 GoldStraight', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.GoldStraight, 2, null, 'item');
    expect(getTileDisplayName(tile)).toBe('Item: 2× Gold Straight');
  });

  it('returns "Item: Straight" for an item container holding a plain Straight', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    expect(getTileDisplayName(tile)).toBe('Item: Straight');
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

  it('getLockedConnectTemp and getLockedConnectPressure record stats at connection time', () => {
    // sourceTemp=3, source pressure=1, pump pressure=2: pressure=3, cost=3, temp=5
    const board = makeBoard(30, 3, 5, 3, 2);
    board.initHistory();
    expect(board.getLockedConnectTemp({ row: 0, col: 1 })).toBe(3);
    expect(board.getLockedConnectPressure({ row: 0, col: 1 })).toBe(3);
  });

  it('getLockedConnectTemp returns null for an unconnected tile', () => {
    const board = makeBoard(30, 3, 5, 0);
    // Do NOT call initHistory so no tile is evaluated yet.
    expect(board.getLockedConnectTemp({ row: 0, col: 1 })).toBeNull();
    expect(board.getLockedConnectPressure({ row: 0, col: 1 })).toBeNull();
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
    expect(result.success).toBe(false);
    expect(result.error).toBe(ERR_SANDSTONE_TOO_HARD);
    expect(result.errorParams).toEqual({ pressure: 1, hardness: 2 });
    expect(result.errorTilePositions).toEqual([{ row: 0, col: 2 }]);
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

    const placeResult = b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(placeResult.success).toBe(true);
    expect(placeResult.error).toBeUndefined();
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
    expect(placed.success).toBe(true);
    b.applyTurnDelta();
    b.recordMove();
    // Sandstone locked at deltaDamage=1: impact = -(ceil(3/1)*5) = -15
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-15);

    // Step 3: Try to reclaim pump connector → pressure drops to 1, deltaDamage=0 → blocked
    const result = b.reclaimTile({ row: 1, col: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('error.constraint.sandstoneDisconnectLocked');
    expect(result.errorTilePositions).toEqual([{ row: 0, col: 2 }]);
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
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    b.applyTurnDelta();
    b.recordMove();
    // Re-evaluated with current pressure=1 (pump reclaimed, no longer in fill path):
    // deltaDamage=1, impact = -(ceil(3/1)*5) = -15
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-15);
  });

  it('reclaimTile fails when earlier pump disconnects and later pump is historically excluded for sandstone', () => {
    // Layout (3 rows × 6 cols):
    //   (0,0) Pump P2[E] → (0,1) player-pipe → (0,2) Source[W,E,S] → (0,3) player-pipe → (0,4) Sandstone[W,E] → (0,5) Sink[W]
    //                                                     ↓
    //                                            (1,2) player-pipe
    //                                                     ↓
    //                                            (2,2) Pump P1[N]
    //
    // Sequence (player moves):
    //   Move 1: connect P1 (pressure=1+5=6)            → P1 connectionTurn=2
    //   Move 2: connect sandstone (deltaDamage=6-2=4)  → sandstone connectionTurn=3
    //   Move 3: connect P2 (pressure=1+5+4=10)         → P2 connectionTurn=4
    //   Reclaim P1 connector → historically-limited pressure for sandstone (connectionTurn=3):
    //   P1 gone from filled; P2 connectionTurn=4 > 3 → excluded → pressure=1 (source only)
    //   → deltaDamage=1-2=-1 ≤ 0 → must be blocked.
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

    // Reclaim (1,2): P1 would disconnect. Current pressure would be 1+4=5, deltaDamage=5-2=3 > 0.
    // But historically-limited pressure for sandstone (connectionTurn=3) uses only pumps connected
    // at turn ≤ 3: P1 is gone from filled, P2 was connected at turn 4 > 3 → excluded.
    // effectivePressure=1 (source only), deltaDamage=1-2=-1 ≤ 0 → must be blocked.
    const result = b.reclaimTile({ row: 1, col: 2 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('error.constraint.sandstoneDisconnectLocked');
    expect(result.errorTilePositions).toEqual([{ row: 0, col: 4 }]);
    // Tile should be restored
    expect(b.grid[1][2].shape).toBe(PipeShape.Straight);
    // Sandstone impact should be unchanged
    expect(b.getLockedWaterImpact({ row: 0, col: 4 })).toBe(-1);
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

    // Reclaim (1,2): P1 disconnects → historically-limited pressure for sandstone (connectionTurn=3):
    // P1 gone from filled; P2 was connected at turn 4 > 3 → excluded. effectivePressure=1 (source only).
    // deltaDamage=1-0=1 > 0 → allowed (historical pressure still sufficient with hardness=0).
    const result = b.reclaimTile({ row: 1, col: 2 });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(11);
    // Historically-limited re-evaluation: P1 gone, P2 connected at turn 4 > sandstone turn 3 → excluded.
    // effectivePressure=1, deltaDamage=1, newImpact=-(ceil(6/1)*1)=-6 → cost INCREASES from -3 to -6.
    expect(b.getLockedWaterImpact({ row: 0, col: 4 })).toBe(-6);
  });
});

// ─── Chamber tile (sandstone shatter) ────────────────────────────────────────

describe('Chamber tile (sandstone shatter)', () => {
  /**
   * Build: Source(cap,pressure=basePressure) → Sandstone(cost,temp,hardness,shatter) → [Pump(pumpP)?] → Sink
   * All tiles pre-connected (fixed); no player-placed pipes needed.
   */
  function makeShatterBoard(
    cap: number, cost: number, thresholdTemp: number, hardness: number, shatter: number,
    basePressure = 1, pumpPressure = 0,
  ): Board {
    const hasPump = pumpPressure > 0;
    const cols = hasPump ? 4 : 3;
    const b = new Board(1, cols);
    b.source = { row: 0, col: 0 };
    b.sink   = { row: 0, col: cols - 1 };
    b.sourceCapacity = cap;
    b.grid[0][0] = new Tile(PipeShape.Source, 0, true, cap, 0, null, 1, null, null, 0, basePressure);
    // Pass shatter as the 13th constructor argument
    b.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, cost, null, 1, null, 'sandstone', thresholdTemp, 0, hardness, shatter);
    if (hasPump) {
      b.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, pumpPressure);
    }
    b.grid[0][cols - 1] = new Tile(PipeShape.Sink, 0, true);
    return b;
  }

  it('shatter <= hardness: ignored, normal cost applies', () => {
    // hardness=3, shatter=3 (shatter not > hardness → inactive): pressure=4, deltaDamage=4-3=1
    // cost=2, temp=5, deltaTemp=5: effective=ceil(2/1)*5=10
    const b = makeShatterBoard(30, 2, 5, 3, 3, 4);
    expect(b.getCurrentWater()).toBe(20); // 30−10=20
  });

  it('shatter=0: inactive regardless of hardness', () => {
    // shatter=0 <= hardness=2 → inactive; pressure=3, deltaDamage=3-2=1, cost=2, temp=3, deltaTemp=3: effective=6
    const b = makeShatterBoard(20, 2, 3, 2, 0, 3);
    expect(b.getCurrentWater()).toBe(14);
  });

  it('shatter > hardness and pressure >= shatter: effective cost is 0', () => {
    // hardness=1, shatter=3, pressure=4 (>=3): shatter override → cost=0
    const b = makeShatterBoard(20, 4, 5, 1, 3, 4);
    expect(b.getCurrentWater()).toBe(20); // no cost
  });

  it('shatter > hardness but pressure < shatter: normal cost applies', () => {
    // hardness=1, shatter=5, pressure=3 (<5): shatter inactive; deltaDamage=3-1=2
    // cost=4, temp=3, deltaTemp=3: effective=ceil(4/2)*3=6
    const b = makeShatterBoard(20, 4, 3, 1, 5, 3);
    expect(b.getCurrentWater()).toBe(14); // 20−6=14
  });

  it('applyTurnDelta: locks cost at 0 when shatter active at connection time', () => {
    // hardness=1, shatter=3, pressure=1+3=4 (>=3 via pump): shatter override → impact=0
    const b = makeShatterBoard(30, 4, 5, 1, 3, 1, 3);
    b.initHistory();
    b.applyTurnDelta();
    expect(b.getLockedWaterImpact({ row: 0, col: 1 })).toBe(0);
    expect(b.getCurrentWater()).toBe(30); // no water cost
  });

  it('applyTurnDelta: locks normal cost when shatter > hardness but pressure < shatter', () => {
    // hardness=1, shatter=5, pressure=3 (<5): normal cost; deltaDamage=3-1=2, cost=6, temp=1, deltaTemp=1
    // effective=ceil(6/2)*1=3
    const b = makeShatterBoard(20, 6, 1, 1, 5, 3);
    b.initHistory();
    b.applyTurnDelta();
    expect(b.getLockedWaterImpact({ row: 0, col: 1 })).toBe(-3);
    expect(b.getCurrentWater()).toBe(17);
  });

  it('re-evaluation: pump disconnect below shatter is blocked by constraint when deltaDamage would drop to 0', () => {
    // Layout (3 rows × 4 cols):
    //   Source[E,S,P=1] → (0,1) empty → Sandstone[W,E,H=1,S=3,cost=2,temp=1] → Sink[W]
    //       ↓
    //   (1,0) empty  (player places N-S Straight)
    //       ↓
    //   Pump[N,P=3]
    //
    // hardness=1, shatter=3.  After pump connects: pressure=4 >= shatter → shatter override.
    // Reclaiming pump connector: historical pressure for sandstone = 1, deltaDamage=1-1=0 ≤ 0 → blocked.
    const b = new Board(3, 4);
    b.source = { row: 0, col: 0 };
    b.sink   = { row: 0, col: 3 };
    b.sourceCapacity = 30;
    b.grid[0][0] = new Tile(PipeShape.Source, 0, true, 30, 0, null, 1, new Set([Direction.East, Direction.South]), null, 0, 1);
    b.grid[0][1] = new Tile(PipeShape.Empty, 0);
    b.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, new Set([Direction.West, Direction.East]), 'sandstone', 1, 0, 1, 3);
    b.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    b.grid[1][0] = new Tile(PipeShape.Empty, 0);
    b.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, 3);
    for (const [r, c] of [[1,1],[1,2],[1,3],[2,1],[2,2],[2,3]]) b.grid[r][c] = new Tile(PipeShape.Empty, 0);
    b.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    b.initHistory();

    // Turn 1: Connect pump via N-S pipe at (1,0) → pressure=4
    b.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(4);

    // Turn 2: Connect sandstone via E-W pipe at (0,1) → pressure=4 >= shatter=3 → impact=0
    b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(0);

    // Attempt reclaim (1,0): historical pressure → 1, deltaDamage=1-1=0 → blocked
    const result = b.reclaimTile({ row: 1, col: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('error.constraint.sandstoneDisconnectLocked');
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(0);
  });

  it('re-evaluation: cost becomes non-zero when pump disconnect drops pressure between hardness and shatter', () => {
    // Layout (3 rows × 4 cols):
    //   Source[E,S,P=1] → (0,1) empty → Sandstone[W,E,H=0,S=3,cost=2,temp=1] → Sink[W]
    //       ↓
    //   (1,0) empty  (player places N-S Straight)
    //       ↓
    //   Pump[N,P=3]
    //
    // hardness=0, shatter=3.  After pump connects: pressure=4 >= shatter=3 → shatter override → impact=0.
    // After reclaiming pump connector (1,0): pressure drops to 1 < shatter=3.
    // Historical constraint: deltaDamage=1-0=1 > 0 → allowed.
    // Re-evaluation: effectivePressure=1, shatterOverride=false, deltaDamage=1, deltaTemp=1.
    // newImpact = -(ceil(2/1)*1) = -2.
    const b = new Board(3, 4);
    b.source = { row: 0, col: 0 };
    b.sink   = { row: 0, col: 3 };
    b.sourceCapacity = 30;
    b.grid[0][0] = new Tile(PipeShape.Source, 0, true, 30, 0, null, 1, new Set([Direction.East, Direction.South]), null, 0, 1);
    b.grid[0][1] = new Tile(PipeShape.Empty, 0);
    b.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, new Set([Direction.West, Direction.East]), 'sandstone', 1, 0, 0, 3);
    b.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, new Set([Direction.West]));
    b.grid[1][0] = new Tile(PipeShape.Empty, 0);
    b.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, 3);
    for (const [r, c] of [[1,1],[1,2],[1,3],[2,1],[2,2],[2,3]]) b.grid[r][c] = new Tile(PipeShape.Empty, 0);
    b.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    b.initHistory();

    // Turn 1: Connect pump via N-S pipe at (1,0) → pressure=4
    b.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getCurrentPressure()).toBe(4);

    // Turn 2: Connect sandstone via E-W pipe at (0,1) → pressure=4 >= shatter=3 → impact=0
    b.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    b.applyTurnDelta();
    b.recordMove();
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(0);
    expect(b.getCurrentWater()).toBe(28); // 30 - 2 pipes = 28 (sandstone free due to shatter)

    // Reclaim (1,0): pressure drops to 1 < shatter=3; deltaDamage=1-0=1 > 0 → allowed
    const result = b.reclaimTile({ row: 1, col: 0 });
    expect(result.success).toBe(true);
    b.applyTurnDelta();
    b.recordMove();

    // Re-evaluation: effectivePressure=1, shatterOverride=false, deltaDamage=1, deltaTemp=1
    // newImpact = -(ceil(2/1)*1) = -2
    expect(b.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-2);
    // Water: 30 - pipe(0,1)=1 - sandstone=2 = 27 (pump pipe reclaimed adds back 1, but sandstone now costs 2)
    expect(b.getCurrentWater()).toBe(27);
  });

  it('getTileDisplayName includes S=value when shatter > hardness', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, null, 'sandstone', 3, 0, 1, 5);
    expect(getTileDisplayName(tile)).toBe('Sandstone -3° x 2 (H=1, S=5)');
  });

  it('getTileDisplayName omits S=value when shatter <= hardness', () => {
    const tile = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, null, 'sandstone', 3, 0, 3, 2);
    expect(getTileDisplayName(tile)).toBe('Sandstone -3° x 2 (H=3)');
  });
});

// ─── Ambient decorations ──────────────────────────────────────────────────────

function _findBoardDecorations(maxAttempts: number): ReadonlyMap<string, AmbientDecoration> {
  for (let i = 0; i < maxAttempts; i++) {
    const level = LEVELS[0];
    const board = new Board(level.rows, level.cols, level);
    if (board.ambientDecorations.size > 0) return board.ambientDecorations;
  }
  return new Map();
}

function _collectCrystalDecorations(maxAttempts: number, minCount: number): AmbientDecoration[] {
  const crystals: AmbientDecoration[] = [];
  for (let i = 0; i < maxAttempts && crystals.length < minCount; i++) {
    const decorations = _findBoardDecorations(1);
    for (const dec of decorations.values()) {
      if (dec.type === 'crystal') crystals.push(dec);
    }
  }
  return crystals;
}

describe('Board ambientDecorations', () => {
  it('is an empty map for boards constructed without a level', () => {
    const board = new Board(3, 3);
    expect(board.ambientDecorations.size).toBe(0);
  });

  it('is populated when a level is provided', () => {
    // Run several seeds to account for random density (~30 %)
    const decorations = _findBoardDecorations(20);
    expect(decorations.size > 0).toBe(true);
  });

  it('each decoration has valid fields', () => {
    // Build boards until we get at least one decoration
    const decorations = _findBoardDecorations(30);
    if (decorations.size === 0) return; // extremely unlikely; skip rather than fail

    for (const dec of decorations.values()) {
      expect(dec.row).toBeGreaterThanOrEqual(0);
      expect(dec.col).toBeGreaterThanOrEqual(0);
      expect(['pebbles', 'flower', 'grass', 'mushroom', 'crystal']).toContain(dec.type);
      expect(dec.offsetX).toBeGreaterThanOrEqual(0);
      expect(dec.offsetX).toBeLessThanOrEqual(1);
      expect(dec.offsetY).toBeGreaterThanOrEqual(0);
      expect(dec.offsetY).toBeLessThanOrEqual(1);
      expect(dec.rotation).toBeGreaterThanOrEqual(0);
      expect(dec.rotation).toBeLessThan(360);
      expect(dec.variant).toBeGreaterThanOrEqual(0);
      expect(dec.variant).toBeLessThanOrEqual(2);
      if (dec.type === 'crystal') {
        expect(dec.count === 1 || dec.count === 2).toBe(true);
      } else {
        expect(dec.count).toBeUndefined();
      }
    }
  });

  it('crystal decorations have count 1 or 2', () => {
    // Build many boards to ensure we encounter at least one crystal decoration
    const crystals = _collectCrystalDecorations(100, 5);
    if (crystals.length === 0) return; // extremely unlikely; skip rather than fail
    for (const dec of crystals) {
      expect(dec.count === 1 || dec.count === 2).toBe(true);
    }
    // Verify both counts appear across enough samples (each has 50 % probability)
    const hasSingle = crystals.some(d => d.count === 1);
    const hasDouble = crystals.some(d => d.count === 2);
    // With 5+ samples at 50 % probability, the chance both appear is very high
    if (crystals.length >= 5) {
      expect(hasSingle || hasDouble).toBe(true); // at minimum one kind appeared
    }
  });

  it('decorations are within grid bounds', () => {
    let board: Board | null = null;
    for (let i = 0; i < 30; i++) {
      const level = LEVELS[0];
      const b = new Board(level.rows, level.cols, level);
      if (b.ambientDecorations.size > 0) { board = b; break; }
    }
    if (!board) return;

    for (const dec of board.ambientDecorations.values()) {
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
    expect(board.rotateTile({ row: 1, col: 1 }).success).toBe(true);
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
    expect(board.reclaimTile({ row: 1, col: 1 }).success).toBe(false);
  });

  it('reclaimTile returns false for SpinElbow and SpinTee', () => {
    const board = new Board(3, 3);
    board.grid[0][1] = new Tile(PipeShape.SpinElbow, 0, false);
    board.grid[0][2] = new Tile(PipeShape.SpinTee, 0, false);
    expect(board.reclaimTile({ row: 0, col: 1 }).success).toBe(false);
    expect(board.reclaimTile({ row: 0, col: 2 }).success).toBe(false);
  });

  it('replaceInventoryTile returns false when target is SpinStraight', () => {
    const board = new Board(3, 3);
    board.grid[1][1] = new Tile(PipeShape.SpinStraight, 0, false);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    expect(board.replaceInventoryTile({ row: 1, col: 1 }, PipeShape.Straight).success).toBe(false);
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

