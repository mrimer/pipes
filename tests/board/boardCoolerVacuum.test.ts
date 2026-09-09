import { Board } from '../../src/board';
import { Direction, PipeShape } from '../../src/types';
import { Tile } from '../../src/tile';
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
    expect(result.success).toBe(false);
    expect(result.error).toBe('error.constraint.statBelowZero');
    expect(result.errorParams).toEqual({ constraint: 'Cooler', stat: 'Temperature', value: -5 });
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
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
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
    expect(result.success).toBe(false);
    expect(result.error).toBe('error.constraint.statBelowZero');
    expect(result.errorParams).toEqual({ constraint: 'Cooler', stat: 'Temperature', value: -5 });
  });

  it('checkInitialStateErrors returns an error when pre-connected cooler causes temp < 0', () => {
    const board = makeCoolerBoard(5, -10); // temp = 5 + (-10) = -5
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error.error).not.toBeNull();
    expect(error.error).toBe('error.constraint.statBelowZero');
    expect(error.params).toEqual({ constraint: 'Cooler', stat: 'Temperature', value: -5 });
  });

  it('checkInitialStateErrors returns null when initial temperature is valid', () => {
    const board = makeCoolerBoard(15, -5); // temp = 15 + (-5) = 10 >= 0
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error.error).toBeNull();
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
    expect(error.error).toBeNull();
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
    expect(result.success).toBe(false);
    expect(result.error).toBe('error.constraint.statBelowZero');
    expect(result.errorParams).toEqual({ constraint: 'Vacuum', stat: 'Pressure', value: -5 });
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
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
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
    expect(result.success).toBe(false);
    expect(result.error).toBe('error.constraint.statBelowZero');
    expect(result.errorParams).toEqual({ constraint: 'Vacuum', stat: 'Pressure', value: -5 });
  });

  it('checkInitialStateErrors returns an error when pre-connected vacuum causes pressure < 0', () => {
    const board = makeVacuumBoard(5, -10); // pressure = 5 + (-10) = -5
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error.error).not.toBeNull();
    expect(error.error).toBe('error.constraint.statBelowZero');
    expect(error.params).toEqual({ constraint: 'Vacuum', stat: 'Pressure', value: -5 });
  });

  it('checkInitialStateErrors returns null when initial pressure is valid', () => {
    const board = makeVacuumBoard(15, -5); // pressure = 15 + (-5) = 10 >= 0
    board.initHistory();
    const error = board.checkInitialStateErrors();
    expect(error.error).toBeNull();
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
    expect(error.error).toBeNull();
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
    (board as any)._turnState.frozen = frozenAmt;
    return board;
  }

  /**
   * Build a board: Source → Ice → HotPlate → Sink with initHistory.
   * Ice fills frozen first; hot_plate then consumes from that frozen.
   */
  function makeIcePlusHotPlateBoard(opts: {
    cap: number; iceCost: number; iceTemp: number;
    mass: number; hpTemp: number; sourceTemp?: number;
  }): Board {
    const { cap, iceCost, iceTemp, mass, hpTemp, sourceTemp = 0 } = opts;
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

  it('getLockedConnectTemp records the board temperature at hot_plate connection time', () => {
    // sourceTemp=2, mass=2, temp=3: effectiveCost=2*(3+2)=10
    const board = makeDynamicBoard(20, 2, 3, 2, 0);
    board.initHistory();
    expect(board.getLockedConnectTemp({ row: 0, col: 1 })).toBe(2);
  });

  it('applyTurnDelta locks hot_plate impact when ice seeds frozen first', () => {
    // Ice: cost=2, iceTemp=5, sourceTemp=0 → effectiveCost=2*5=10, impact=-10, frozen=10
    // HotPlate: mass=1, hpTemp=3 → effectiveCost=1*(3+0)=3, waterGain=min(10,3)=3, waterLoss=0 → impact=+3, frozen=7
    // water = 20 - 10 + 3 = 13
    const board = makeIcePlusHotPlateBoard({ cap: 20, iceCost: 2, iceTemp: 5, mass: 1, hpTemp: 3, sourceTemp: 0 });
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

  it('hot_plate connected on same turn as ice sees newly-frozen water even when BFS discovers hot_plate first', () => {
    // Layout: Source(0,0)[all] → player Tee(0,1) → HotPlate(0,2)[W,E] → Sink(0,3)
    //                                         ↓
    //                                      Ice(1,1)[N,S]  (dead-end going south into empty space)
    //
    // BFS order when Tee(0,1) is placed: Source → Tee → HotPlate(0,2) [East queued first]
    //                                                  → Ice(1,1)     [South queued second]
    // Without the fix, hot_plate is locked before ice, seeing frozen=0 → waterGain=0 → impact=-4.
    // With the fix, ice is locked first (frozen=15), then hot_plate (waterGain=min(15,4)=4 → impact=+4).
    //
    // Ice(1,1): cost=3, thresh=5, sourceTemp=0 → deltaTemp=5 → frozen += 15
    // HotPlate(0,2): mass=1, hpTemp=4 → effectiveCost=4, waterGain=min(15,4)=4 → impact=+4, frozen=11
    // Water = 50 - 1(Tee) + 4(HotPlate) - 15(Ice) = 38
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 50;

    // Set all cells explicitly to prevent random tile interference.
    // Row 0
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 50, 0, null, 1, null, null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0); // player slot – will place Tee here
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 1,
      null, 1, new Set([Direction.West, Direction.East]), 'hot_plate', 4);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true);
    // Row 1 – only Ice at (1,1); rest are Granite (no connections) to block accidents
    board.grid[1][0] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 3,
      null, 1, new Set([Direction.North, Direction.South]), 'ice', 5);
    board.grid[1][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][3] = new Tile(PipeShape.Granite, 0, true);

    board.inventory = [{ shape: PipeShape.Tee, count: 1 }];
    board.initHistory();

    // Before placing, nothing is connected past the source
    expect(board.frozen).toBe(0);

    // Place Tee at rotation=90 (connects West, East, South) so both HotPlate(0,2)
    // and Ice(1,1) connect on the same turn.
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90);
    board.applyTurnDelta();

    // Ice must be resolved before hot_plate regardless of BFS order.
    expect(board.frozen).toBe(11);
    expect(board.getLockedWaterImpact({ row: 1, col: 1 })).toBe(-15); // ice: cost=3, deltaTemp=5
    expect(board.getLockedHotPlateGain({ row: 0, col: 2 })).toBe(4);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(4);  // waterGain=4, waterLoss=0
    expect(board.getCurrentWater()).toBe(38); // 50 - 1(Tee) + 4(HotPlate) - 15(Ice) = 38
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
    expect(result.success).toBe(true);

    board.applyTurnDelta();
    board.recordMove();
    // Re-evaluation: historicalTemp = source only = 0 (Heater gone from filled).
    // newEffectiveCost = 2*(3+0) = 6, frozen=0 → newWaterGain=0, newImpact=-6.
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-6);
    // getCurrentWater = 50 + 0(src) + (-1)(0,1) + (-6)(hot_plate) + 0(sink) = 43
    expect(board.getCurrentWater()).toBe(43);
    expect(board.frozen).toBe(0);
  });

  // ── Re-evaluation on cold-chamber disconnect ──────────────────────────────

  it('hot_plate cost re-evaluated when ice disconnects (scenario 1: basic)', () => {
    // Board (3×4):
    //   Row0: Source(0,0)[E,S] – slot A(0,1)[player E-W] – HotPlate(0,2)[W,E] – Sink(0,3)[W]
    //   Row1: slot B(1,0)[player N-S] – Granite×3
    //   Row2: Ice(2,0)[N, cost=3, thresh=5] – Granite×3
    //
    // Turn 1: connect Ice via slot B (frozen=15).
    // Turn 2: connect HotPlate via slot A
    //         effectiveCost=1*(2+0)=2, waterGain=min(15,2)=2, frozen=13, impact=+2.
    // Turn 3: reclaim slot B → Ice disconnects; hot_plate re-evaluated.
    //         Budget restored = 13 + 2 = 15, then ice removed = 15-15=0.
    //         HotPlate: waterGain=min(0,2)=0, impact=-2. delta=-4.

    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 50;
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 50, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1,
      new Set([Direction.West, Direction.East]), 'hot_plate', 2);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][3] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1,
      new Set([Direction.North]), 'ice', 5);
    board.grid[2][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][3] = new Tile(PipeShape.Granite, 0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: connect Ice (frozen=15)
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta(); board.recordMove();
    expect(board.frozen).toBe(15);

    // Turn 2: connect HotPlate (effectiveCost=2, waterGain=2, impact=+2, frozen=13)
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    expect(board.frozen).toBe(13);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(2);
    expect(board.getLockedHotPlateGain({ row: 0, col: 2 })).toBe(2);

    // Turn 3: disconnect Ice by reclaiming slot B
    board.reclaimTile({ row: 1, col: 0 });
    const animChanges = board.applyTurnDelta(); board.recordMove();

    expect(board.frozen).toBe(0);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-2);
    expect(board.getLockedHotPlateGain({ row: 0, col: 2 })).toBe(0);
    const hotPlateAnim = animChanges.find(ch => ch.row === 0 && ch.col === 2);
    expect(hotPlateAnim).toBeDefined();
    expect(hotPlateAnim!.delta).toBe(-4); // -2 - (+2) = -4
    expect(board.getCurrentWater()).toBe(47); // 50 - 1(Straight) - 2(HotPlate) = 47
  });

  it('both hot_plates re-evaluated in turn order when ice disconnects (scenario 2)', () => {
    // Board (3×5):
    //   Row0: Source(0,0)[E,S] – slot A(0,1) – HotPlateA(0,2)[W,E] – HotPlateB(0,3)[W,E] – Sink(0,4)[W]
    //   Row1: slot B(1,0) – Granite×4
    //   Row2: Ice(2,0)[N, cost=3, thresh=5] – Granite×4
    //
    // Turn 1: connect Ice (frozen=15).
    // Turn 2: connect HotPlateA + HotPlateB via slot A (same turn):
    //   HotPlateA(0,2): cost=2, waterGain=min(15,2)=2, frozen=13, impact=+2.
    //   HotPlateB(0,3): cost=3, waterGain=min(13,3)=3, frozen=10, impact=+3.
    // Turn 3: reclaim slot B → Ice disconnects. Budget=(10-15)+(2+3)=0.
    //   Both hot_plates: waterGain=0, impact=-2 and -3.

    const board = new Board(3, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 4 };
    board.sourceCapacity = 50;
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 50, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1,
      new Set([Direction.West, Direction.East]), 'hot_plate', 2); // effectiveCost=2
    board.grid[0][3] = new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1,
      new Set([Direction.West, Direction.East]), 'hot_plate', 3); // effectiveCost=3
    board.grid[0][4] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][3] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][4] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1,
      new Set([Direction.North]), 'ice', 5); // cost=3, deltaTemp=5 → frozen=15
    board.grid[2][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][3] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][4] = new Tile(PipeShape.Granite, 0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: connect Ice (frozen=15)
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta(); board.recordMove();
    expect(board.frozen).toBe(15);

    // Turn 2: connect both HotPlates via slot A
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    expect(board.frozen).toBe(10);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(2);
    expect(board.getLockedWaterImpact({ row: 0, col: 3 })).toBe(3);

    // Turn 3: disconnect Ice
    board.reclaimTile({ row: 1, col: 0 });
    board.applyTurnDelta(); board.recordMove();

    // Budget = (10-15) + (2+3) = 0 → both hot_plates get waterGain=0
    expect(board.frozen).toBe(0);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-2);
    expect(board.getLockedWaterImpact({ row: 0, col: 3 })).toBe(-3);
    expect(board.getLockedHotPlateGain({ row: 0, col: 2 })).toBe(0);
    expect(board.getLockedHotPlateGain({ row: 0, col: 3 })).toBe(0);
    expect(board.getCurrentWater()).toBe(44); // 50 - 1(Straight) - 2(HPA) - 3(HPB) = 44
  });

  it('hot_plate re-evaluation is correct when heater and ice disconnect in same turn (scenario 3)', () => {
    // Board (3×5):
    //   Row0: Source(0,0)[E,S] – slot A(0,1) – HotPlate(0,2)[W,E] – Sink(0,3)
    //   Row1: slot B(1,0)[Tee N,S,E] – Heater(1,1)[W, temp=4] – Granite×3
    //   Row2: Ice(2,0)[N, cost=5, thresh=15] – Granite×4
    //
    // Turn 1: place Tee at (1,0) → Heater and Ice connect (turn=2).
    //   currentTemp=4. Ice: deltaTemp=max(0,15-4)=11. frozen += 5*11=55.
    // Turn 2: place E-W Straight at (0,1) → HotPlate connects (turn=3).
    //   effectiveCost=1*(3+4)=7. waterGain=min(55,7)=7. frozen=48. impact=+7.
    // Turn 3: reclaim Tee → Heater AND Ice disconnect.
    //   Step 4a (heater left): re-eval HotPlate with historicalTemp=0, effectiveCost=3.
    //     restoredFrozen=48-55=-7 → +7(oldGain)=-7+7=0. waterGain=0. impact=-3. frozen=0.
    //   Step 4b (ice left, minTurnX=2): candidates = HotPlate(turn=3>=2).
    //     Pass1: frozen += 0(updated oldGain) = 0. Pass2: effectiveCost=3, waterGain=0, impact=-3 (same).
    //     No double-animation.
    //   final: impact=-3, frozen=0, delta emitted once from step 4a.

    const board = new Board(3, 5);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 50;
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 50, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);   // player E-W Straight slot
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1,
      new Set([Direction.West, Direction.East]), 'hot_plate', 3); // mass=1, hpTemp=3
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    board.grid[0][4] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);   // player Tee slot [N,S,E]
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1,
      new Set([Direction.West]), 'heater', 4);          // temp bonus=4
    board.grid[1][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][3] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][4] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 5, null, 1,
      new Set([Direction.North]), 'ice', 15);           // cost=5, thresh=15
    board.grid[2][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][3] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][4] = new Tile(PipeShape.Granite, 0, true);
    board.inventory = [
      { shape: PipeShape.Tee, count: 1 },
      { shape: PipeShape.Straight, count: 1 },
    ];
    board.initHistory();

    // Turn 1: place Tee at (1,0) with rotation=0 (base connections [N,E,S]):
    //   [N]→Source(0,0)[S], [E]→Heater(1,1)[W], [S]→Ice(2,0)[N].
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Tee, 0);
    board.applyTurnDelta(); board.recordMove();
    // Tee rotation=0: verify Heater and Ice are in fill by checking temp and frozen.
    expect(board.getCurrentTemperature()).toBe(4); // heater connected
    // Ice: deltaTemp=max(0,15-4)=11. frozen += 5*11=55.
    expect(board.frozen).toBe(55);

    // Turn 2: place E-W Straight at (0,1) → HotPlate connects
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    // effectiveCost=1*(3+4)=7. waterGain=min(55,7)=7. frozen=48. impact=+7.
    expect(board.frozen).toBe(48);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(7);
    expect(board.getLockedHotPlateGain({ row: 0, col: 2 })).toBe(7);

    // Turn 3: reclaim Tee → Heater AND Ice disconnect simultaneously
    board.reclaimTile({ row: 1, col: 0 });
    const animChanges = board.applyTurnDelta(); board.recordMove();

    // Step 4a re-evals HotPlate (heater loss): effectiveCost=3, restoredFrozen=-7+7=0, impact=-3.
    // Step 4b: candidates = HotPlate(turn=3>=2); budget=0+0=0; same result, no second delta.
    expect(board.frozen).toBe(0);
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-3);
    expect(board.getLockedHotPlateGain({ row: 0, col: 2 })).toBe(0);
    // Only one animation change for HotPlate (from step 4a; step 4b emits nothing extra).
    const hotPlateChanges = animChanges.filter(ch => ch.row === 0 && ch.col === 2);
    expect(hotPlateChanges).toHaveLength(1);
    expect(hotPlateChanges[0].delta).toBe(-10); // -3 - (+7) = -10
    expect(board.getCurrentWater()).toBe(46); // 50 - 1(Straight) - 3(HotPlate) = 46
  });

  it('sandstone shatter (zero impact) disconnecting does not trigger hot_plate re-eval (scenario 4)', () => {
    // Board (3×4):
    //   Row0: Source(0,0)[E,S], slot A(0,1), HotPlate(0,2)[W,E], Sink(0,3)[W]
    //   Row1: slot B(1,0), Granite×3
    //   Row2: Sandstone(2,0)[N, cost=2, hardness=1, shatter=2] – Granite×3
    //         Source pressure=3 >= shatter=2, shatter>hardness → shatterOverride → impact=0.
    //
    // Turn 1: connect Sandstone (shatter override → impact=0). frozen=0.
    // Turn 2: connect HotPlate (effectiveCost=2, frozen=0 → waterGain=0, impact=-2).
    // Turn 3: disconnect Sandstone.
    //   _detectColdDisconnect: sandstone impact=0 (not negative) → returns null → step 4b NOT triggered.

    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 50;
    // Source with pressure=3 for shatter override.
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 50, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0, 3);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1,
      new Set([Direction.West, Direction.East]), 'hot_plate', 2);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][3] = new Tile(PipeShape.Granite, 0, true);
    // Sandstone: hardness=1, shatter=2; board pressure=3 >= 2 → shatterOverride → impact=0.
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1,
      new Set([Direction.North]), 'sandstone', 0, 0, 1, 2);
    board.grid[2][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][3] = new Tile(PipeShape.Granite, 0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: connect Sandstone (impact=0 due to shatter)
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta(); board.recordMove();
    expect(board.getLockedWaterImpact({ row: 2, col: 0 })).toBe(0);
    expect(board.frozen).toBe(0);

    // Turn 2: connect HotPlate
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-2);

    // Turn 3: disconnect Sandstone — should NOT trigger hot_plate re-evaluation
    board.reclaimTile({ row: 1, col: 0 });
    const animChanges = board.applyTurnDelta(); board.recordMove();
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-2); // unchanged
    expect(board.frozen).toBe(0);
    expect(animChanges.find(ch => ch.row === 0 && ch.col === 2)).toBeUndefined();
  });

  it('hot_plate connected BEFORE ice is not re-evaluated when ice disconnects (scenario 5)', () => {
    // Board (3×4): same topology as scenario 1 but connection order is reversed.
    //
    // Turn 1: connect HotPlate via slot A (turn=2). effectiveCost=2, frozen=0, impact=-2.
    // Turn 2: connect Ice via slot B (turn=3). frozen=15. HotPlate already locked.
    // Turn 3: disconnect Ice.
    //   minTurnX = Ice.connectionTurn = 3. HotPlate.connectionTurn = 2 < 3 → NOT re-evaluated.

    const board = new Board(3, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.sourceCapacity = 50;
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 50, 0, null, 1,
      new Set([Direction.East, Direction.South]), null, 0, 1);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1,
      new Set([Direction.West, Direction.East]), 'hot_plate', 2);
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1,
      new Set([Direction.West]));
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[1][3] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][0] = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1,
      new Set([Direction.North]), 'ice', 5);
    board.grid[2][1] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][2] = new Tile(PipeShape.Granite, 0, true);
    board.grid[2][3] = new Tile(PipeShape.Granite, 0, true);
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];
    board.initHistory();

    // Turn 1: connect HotPlate first (before Ice)
    board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    board.applyTurnDelta(); board.recordMove();
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-2);
    expect(board.frozen).toBe(0);

    // Turn 2: connect Ice
    board.placeInventoryTile({ row: 1, col: 0 }, PipeShape.Straight, 0);
    board.applyTurnDelta(); board.recordMove();
    expect(board.frozen).toBe(15);

    // Turn 3: disconnect Ice — HotPlate connected before ice, so NOT re-evaluated
    board.reclaimTile({ row: 1, col: 0 });
    const animChanges = board.applyTurnDelta(); board.recordMove();
    expect(board.getLockedWaterImpact({ row: 0, col: 2 })).toBe(-2); // unchanged
    expect(board.frozen).toBe(0);
    expect(animChanges.find(ch => ch.row === 0 && ch.col === 2)).toBeUndefined();
    expect(board.getCurrentWater()).toBe(47); // 50 - 1(Straight) - 2(HotPlate) = 47
  });
});

// ─── Cement tile constraints ──────────────────────────────────────────────────

