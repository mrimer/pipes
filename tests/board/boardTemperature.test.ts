import { Board } from '../../src/board';
import { Direction, PipeShape } from '../../src/types';
import { Tile } from '../../src/tile';
import { LEVELS } from '../levels';
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
    expect(board.reclaimTile({ row: 0, col: 1 }).success).toBe(false);
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
    expect(board.reclaimTile({ row: 0, col: 1 }).success).toBe(false);
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

  it('disconnecting a cooler does not re-evaluate locked ice cost', () => {
    const board = makeBoard();
    // Treat a negative heater as a cooler.
    board.grid[0][0].temperature = 25;
    board.grid[2][0].temperature = -20;

    // Turn 1: connect Cooler(2,0) – temp drops from 25 to 5.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect Ice(0,2) – deltaTemp=max(0,10-5)=5, cost=10.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(88); // 100 − 1 − 1 − 10

    // Turn 3: disconnect Cooler. Locked ice cost should remain 10.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(89); // 100 − 1 − 10
    expect(board.frozen).toBe(10);
  });

  it('disconnecting a heater with effect < 1 does not re-evaluate locked ice cost', () => {
    const board = makeBoard();
    board.grid[2][0].temperature = 0.5;

    // Turn 1: connect weak heater (+0.5 temp).
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect Ice(0,2) – deltaTemp=max(0,10-0.5)=9.5, cost=19.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(79); // 100 − 1 − 1 − 19

    // Turn 3: disconnect weak heater. Locked ice cost should remain 19.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(80); // 100 − 1 − 19
    expect(board.frozen).toBeCloseTo(19, 10);
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

  it('disconnecting a vacuum chamber does not re-evaluate locked snow cost', () => {
    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 100;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, new Set([Direction.East, Direction.South]), null, 0, 2);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 4, null, 1, new Set([Direction.East, Direction.West]), 'snow', 5);
    board.grid[0][3] = new Tile(PipeShape.Sink,   0, true, 0, 0, null, 1, new Set([Direction.West]));
    // Treat a negative pump as a vacuum chamber.
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, -1);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    board.initHistory();

    // Turn 1: connect vacuum – pressure drops from 2 to 1.
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect snow – ceil(4/1)=4, deltaTemp=5, cost=20.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(78); // 100 − 1 − 1 − 20

    // Turn 3: disconnect vacuum. Locked snow cost should remain 20.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(79); // 100 − 1 − 20
    expect(board.frozen).toBe(20);
  });

  it('disconnecting a pump with effect < 1 does not re-evaluate locked snow cost', () => {
    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 100;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) board.grid[r][c] = new Tile(PipeShape.Empty, 0);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, new Set([Direction.East, Direction.South]), null, 0, 1);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 4, null, 1, new Set([Direction.East, Direction.West]), 'snow', 5);
    board.grid[0][3] = new Tile(PipeShape.Sink,   0, true, 0, 0, null, 1, new Set([Direction.West]));
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, new Set([Direction.North]), 'pump', 0, 0.5);
    board.inventory = [{ shape: PipeShape.Straight, count: 3 }];
    board.initHistory();

    // Turn 1: connect weak pump (+0.5 pressure).
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta();
    board.recordMove();

    // Turn 2: connect snow – pressure=1.5, ceil(4/1.5)=3, deltaTemp=5, cost=15.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(83); // 100 − 1 − 1 − 15

    // Turn 3: disconnect weak pump. Locked snow cost should remain 15.
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta();
    board.recordMove();
    expect(board.getCurrentWater()).toBe(84); // 100 − 1 − 15
    expect(board.frozen).toBe(15);
  });
});
