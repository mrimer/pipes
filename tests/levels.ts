import { Direction, LevelDef, ChapterDef, PipeShape } from '../src/types';

/**
 * All game levels.
 *
 * Level 1 – Tutorial
 * ==================
 * 6 × 6 grid
 *
 */

const LEVEL_1: LevelDef = {
  id: 1,
  name: 'Tutorial',
  rows: 6,
  cols: 6,
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source, rotation: 0, capacity: 6, connections: [Direction.East, Direction.South] },
      null, null, null, null, null,
    ],
    // Row 1
    [
      null,                                                                  // (1,0) player fills
      { shape: PipeShape.Straight, rotation: 90 },           // (1,1) E-W
      null,                                                                  // (1,2) player fills
      { shape: PipeShape.Straight, rotation: 90 },           // (1,3) E-W
      null,                                                                  // (1,4) player fills
      { shape: PipeShape.Elbow,    rotation: 180 },           // (1,5) S-W
    ],
    // Row 2 – (2,5) left empty for player
    [
      null,
      null,
      { shape: PipeShape.Granite },                              // (2,2) granite obstacle
      { shape: PipeShape.Granite },                              // (2,3) granite obstacle
      null,
      null,
    ],
    // Row 3
    [
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 5, connections: [Direction.North] }, // (3,0)
      null,
      { shape: PipeShape.Granite },                              // (3,2) granite obstacle
      { shape: PipeShape.Granite },                              // (3,3) granite obstacle
      null,
      { shape: PipeShape.Straight, rotation: 0 },               // (3,5) N-S
    ],
    // Row 4 – (4,5) left empty for player
    [null, null, null, null, null, null],
    // Row 5
    [
      null, null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North, Direction.West] },                 // (5,5)
    ],
  ],
  inventory: [
    { shape: PipeShape.Straight, count: 4 },
    { shape: PipeShape.Elbow,    count: 1 },
    { shape: PipeShape.Tee,      count: 1 },
    { shape: PipeShape.Cross,    count: 1 },
  ],
};

/** Placeholder stub – locked until level 1 is completed. */
const LEVEL_2: LevelDef = {
  id: 2,
  name: 'Through the Woods',
  rows: 6,
  cols: 6,
  /**
   * Solution path:
   *   Source(0,0) → [player: Straight E-W at (0,1)] → DirtBlock(cost=2, 0,2)
   *     → [player: Straight E-W at (0,3)] → Elbow(W-S, 0,4) → [player: Straight N-S at (1,4)]
   *     → Straight(N-S, 2,4) → DirtBlock(cost=3, 3,4) → [player: Straight N-S at (4,4)]
   *     → Sink(5,4)
   *
   * Water budget: 12 (source)
   *   − 1 (Straight 0,1) − 2 (DirtBlock 0,2) − 1 (Straight 0,3) − 1 (Elbow 0,4)
   *   − 1 (Straight 1,4) − 1 (Straight 2,4) − 3 (DirtBlock 3,4) − 1 (Straight 4,4)
   *   = 1 remaining on win.
   * Player places 4 Straight tiles.
   */
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source,    rotation: 0,   capacity: 12, connections: [Direction.East, Direction.South] }, // (0,0)
      null,                                                                         // (0,1) player fills: Straight E-W
      { shape: PipeShape.Chamber, chamberContent: 'dirt', rotation: 0, cost: 2, connections: [Direction.East, Direction.West] },  // (0,2)
      null,                                                                         // (0,3) player fills: Straight E-W
      { shape: PipeShape.Elbow,     rotation: 180 },                // (0,4) W-S
      null,
    ],
    // Row 1
    [
      null, null,
      { shape: PipeShape.Granite },                              // (1,2) granite obstacle
      null,
      null,                                                                         // (1,4) player fills: Straight N-S
      null,
    ],
    // Row 2
    [
      null, null,
      { shape: PipeShape.Granite },                              // (2,2) granite obstacle
      null,
      { shape: PipeShape.Straight, rotation: 0 },                  // (2,4) N-S
      null,
    ],
    // Row 3
    [
      null, null,
      { shape: PipeShape.Granite },                              // (3,2) granite obstacle
      null,
      { shape: PipeShape.Chamber, chamberContent: 'dirt', rotation: 0, cost: 3, connections: [Direction.North, Direction.East, Direction.South, Direction.West] },   // (3,4)
      null,
    ],
    // Row 4
    [
      null, null, null, null,
      null,                                                                         // (4,4) player fills: Straight N-S
      null,
    ],
    // Row 5
    [
      null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North, Direction.East] },      // (5,4)
      null,
    ],
  ],
  inventory: [
    { shape: PipeShape.Straight, count: 4 },
    { shape: PipeShape.Elbow,    count: 2 },
    { shape: PipeShape.Tee,      count: 1 },
  ],
};

/** Placeholder stub – locked until level 2 is completed. */
const LEVEL_3: LevelDef = {
  id: 3,
  name: 'Mountain Stream',
  rows: 6,
  cols: 6,
  /**
   * Solution path:
   *   Source(0,0) → [player: Straight E-W at (0,1)] → ItemContainer(0,2, grants 1 GoldStraight)
   *     → Elbow(S-W, 0,3) → [player: GoldStraight N-S at (1,3) on GoldSpace, uses container grant]
   *     → Elbow(W-N, 2,3) → Straight(2,2 E-W) → Straight(2,1 E-W)
   *     → Elbow(E-S, 2,0) → Straight(3,0 N-S) → Straight(4,0 N-S) → Sink(5,0)
   *
   * Water budget: 10 (source)
   *   − 1 (Straight 0,1) − 1 (Elbow 0,3) − 1 (GoldStraight 1,3) − 1 (Elbow 2,3)
   *   − 1 (Straight 2,2) − 1 (Straight 2,1) − 1 (Elbow 2,0) − 1 (Straight 3,0)
   *   − 1 (Straight 4,0) = 1 remaining on win.
   *
   * Player places 2 tiles:
   *   • (0,1) Straight E-W from base inventory
   *   • (1,3) GoldStraight N-S on the GoldSpace, using the grant from ItemContainer at (0,2)
   */
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source,        rotation: 0,   capacity: 6, connections: [Direction.East, Direction.South] }, // (0,0)
      null,                                                                             // (0,1) player fills: Straight E-W
      { shape: PipeShape.Chamber, chamberContent: 'item', rotation: 0, itemShape: PipeShape.GoldStraight, itemCount: 1, connections: [Direction.East, Direction.West] }, // (0,2)
      { shape: PipeShape.Elbow,         rotation: 180 },                // (0,3) S-W
      null, null,
    ],
    // Row 1
    [
      null, null, null,
      { shape: PipeShape.GoldSpace },                                                  // (1,3) gold space – player places GoldStraight here
      null, null,
    ],
    // Row 2
    [
      { shape: PipeShape.Elbow,    rotation: 90 },                    // (2,0) E-S
      { shape: PipeShape.Straight, rotation: 90 },                    // (2,1) E-W
      { shape: PipeShape.Straight, rotation: 90 },                    // (2,2) E-W
      null,
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 5, connections: [Direction.West] }, // (2,4)
      null,
    ],
    // Row 3
    [
      { shape: PipeShape.Straight, rotation: 0 },                      // (3,0) N-S
      null, null, null, null, null,
    ],
    // Row 4
    [
      { shape: PipeShape.Straight, rotation: 0 },                      // (4,0) N-S
      null, null, null, null, null,
    ],
    // Row 5
    [
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North] },                          // (5,0)
      null, null, null, null, null,
    ],
  ],
  inventory: [
    { shape: PipeShape.Straight,     count: 2 },
    { shape: PipeShape.Elbow,        count: 1 },
    { shape: PipeShape.Tee,          count: 1 },
    { shape: PipeShape.GoldStraight, count: 0 },
  ],
};

/** Locked until level 3 is completed. */
const LEVEL_4: LevelDef = {
  id: 4,
  name: 'The Workshop',
  rows: 6,
  cols: 6,
  /**
   * Solution path:
   *   Source(0,0) → [player: Straight E-W at (0,1)] → ItemContainer(0,2, grants 1 GoldStraight)
   *     → [player: GoldStraight E-W at (0,3) on GoldSpace, uses container grant]
   *     → Elbow(S-W, 0,4) → Straight(1,4 N-S) → Tank(2,4 cap=4)
   *     → Straight(3,4 N-S) → DirtBlock(4,4 cost=2) → Sink(5,4)
   *
   * Water budget: 12 (source)
   *   − 1 (Straight 0,1) − 1 (GoldStraight 0,3) − 1 (Elbow 0,4)
   *   − 1 (Straight 1,4) + 4 (Tank 2,4) − 1 (Straight 3,4) − 2 (DirtBlock 4,4)
   *   = 9 remaining on win.
   *
   * Player places 2 tiles:
   *   • (0,1) Straight E-W from base inventory
   *   • (0,3) GoldStraight E-W on the GoldSpace, using the grant from ItemContainer at (0,2)
   */
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source,        rotation: 0,   capacity: 8, connections: [Direction.East, Direction.South] }, // (0,0)
      null,                                                                             // (0,1) player fills: Straight E-W
      { shape: PipeShape.Chamber, chamberContent: 'item', rotation: 0, itemShape: PipeShape.GoldStraight, itemCount: 1, connections: [Direction.East, Direction.South, Direction.West] }, // (0,2)
      { shape: PipeShape.GoldSpace },                                                  // (0,3) gold space – player places GoldStraight here
      { shape: PipeShape.Elbow,         rotation: 180 },                // (0,4) S-W
      null,
    ],
    // Row 1
    [
      null, null, null, null,
      { shape: PipeShape.Straight, rotation: 0 },                    // (1,4) N-S
      null,
    ],
    // Row 2
    [
      null, null,
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 5, connections: [Direction.North] },
      null,
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 4 },       // (2,4)
      null,
    ],
    // Row 3
    [
      null, null, null, null, null, null,
    ],
    // Row 4
    [
      null, null, null, null,
      { shape: PipeShape.Chamber, chamberContent: 'dirt', rotation: 0, cost: 2, connections: [Direction.North, Direction.East, Direction.South, Direction.West] },       // (4,4)
      null,
    ],
    // Row 5
    [
      null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North] },          // (5,4)
      null,
    ],
  ],
  inventory: [
    { shape: PipeShape.Straight,     count: 3 },
    { shape: PipeShape.Elbow,        count: 1 },
    { shape: PipeShape.Tee,          count: 1 },
    { shape: PipeShape.GoldStraight, count: 0 },
  ],
};

/** Locked until level 4 is completed. */
const LEVEL_5: LevelDef = {
  id: 5,
  name: 'Glacier Pass',
  rows: 4,
  cols: 5,
  /**
   * Grid layout (rows×cols = 4×5):
   *   Row 0: Source(0,0,cap=8,East) | null(0,1) | Ice-A(0,2,E-W,cost=5,thresh=1) | null(0,3) | Elbow(0,4,S-W)
   *   Row 1: null | null | null | null | Straight(1,4,N-S)
   *   Row 2: null | null | Tank(2,2,+7,North) | null | Ice-B(2,4,N-S,cost=5,thresh=1)
   *   Row 3: null | null | null | null | Sink(3,4,North)
   *
   * Ice-A(0,2) lies on the direct east-west path from Source to Elbow(0,4).
   * The player must bypass it by looping
   * south through row 1, picking up Tank(2,2) via a Tee branch along the way (direct route is not viable).
   *
   * Ice-B(2,4) sits on the only path to Sink(3,4) and must be connected.
   *
   * Bypass + Tank route (around Ice-A, 4 Elbows + 1 Tee):
   *   (0,1) Elbow(W-S) → (1,1) Elbow(N-E) → (1,2) Tee(E-S-W)→Tank(2,2)
   *   → (1,3) Elbow(W-N) → (0,3) Elbow(E-S) → Elbow(0,4) → Straight(1,4) → Ice-B(2,4) → Sink(3,4)
   *
   * Water budget – direct route (through Ice-A, 2 Straights):
   *   8 − 1(0,1) − 5(Ice-A) − 1(0,3) − 1(Elbow 0,4) − 1(Straight 1,4) − 5(Ice-B) = -6 (not viable).
   *
   * Water budget – bypass + tank route (5 pieces):
   *   8 − 5(pieces) − 1(Elbow 0,4) − 1(Straight 1,4) + 7(Tank) − 5(Ice-B) = 3 remaining.
   */
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source, rotation: 0, capacity: 8, connections: [Direction.East] },                                      // (0,0)
      null,                                                                                                                         // (0,1) player fills
      { shape: PipeShape.Chamber, chamberContent: 'ice', rotation: 0, cost: 5, temperature: 1, connections: [Direction.East, Direction.West] }, // (0,2) Ice-A
      null,                                                                                                                         // (0,3) player fills
      { shape: PipeShape.Elbow, rotation: 180 },                                                                                   // (0,4) S-W
    ],
    // Row 1
    [
      null, null, null, null,
      { shape: PipeShape.Straight, rotation: 0 },                                                                                  // (1,4) N-S
    ],
    // Row 2
    [
      null,
      null,
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 7, connections: [Direction.North] },             // (2,2) Tank
      null,
      { shape: PipeShape.Chamber, chamberContent: 'ice', rotation: 0, cost: 5, temperature: 1, connections: [Direction.North, Direction.South] }, // (2,4) Ice-B
    ],
    // Row 3
    [
      null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North] },                                                      // (3,4)
    ],
  ],
  inventory: [
    { shape: PipeShape.Straight, count: 2 },
    { shape: PipeShape.Elbow,    count: 4 },
    { shape: PipeShape.Tee,      count: 1 },
  ],
};

/** Locked until level 5 is completed. */
const LEVEL_6: LevelDef = {
  id: 6,
  name: 'Hot Springs',
  rows: 4,
  cols: 5,
  /**
   * Grid layout (rows×cols = 4×5):
   *   Row 0: Source(0,0,cap=4,East) | null(0,1) | null(0,2) | null(0,3) | Elbow(0,4,S-W)
   *   Row 1: null | Heater(1,1,+2°,North) | Ice(1,2,cost=5,thresh=2,N-S) | Ice(1,3,cost=5,thresh=2,N-S) | Straight(1,4,N-S)
   *   Row 2: null | null | Tank(2,2,+5,North) | Tank(2,3,+5,North) | Ice(2,4,cost=5,thresh=3,N-S)
   *   Row 3: null | null | null | null | Sink(3,4,North)
   *
   * Solution path: place Tee E-S-W at (0,1), (0,2), (0,3).
   *   Source(0,0) → Tee(0,1) → Tee(0,2) → Tee(0,3) → Elbow(0,4) → Straight(1,4) → Ice(2,4) → Sink(3,4)
   *   Side branches: Tee(0,1) South → Heater(1,1)
   *                  Tee(0,2) South → Ice(1,2) → Tank(2,2)
   *                  Tee(0,3) South → Ice(1,3) → Tank(2,3)
   *
   * Incremental evaluation (turn order matters):
   *   Turn 1 – Tee(0,1): Heater(1,1) is newly connected.
   *            currentTemp = 0 + 2 = 2.  Heater impact = 0.
   *   Turn 2 – Tee(0,2): Ice(1,2) and Tank(2,2) are newly connected.
   *            currentTemp = 2 (Heater already locked from turn 1).
   *            Ice(1,2) thresh=2: deltaTemp = max(0, 2−2) = 0 → impact = 0 (free).
   *            Tank(2,2) impact = +5.
   *   Turn 3 – Tee(0,3): Ice(1,3), Tank(2,3), Elbow(0,4), Straight(1,4), Ice(2,4), Sink.
   *            currentTemp = 2.
   *            Ice(1,3) thresh=2: free.  Ice(2,4) thresh=3: deltaTemp=1 → cost=5×1=5.
   *
   * Water budget (incremental): 4 (source)
   *   − 3 (Tees) − 1 (Elbow) − 1 (Straight 1,4) − 5 (Ice 2,4)
   *   + 5 (Tank 2,2) + 5 (Tank 2,3)
   *   = 4 remaining.
   */
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source, rotation: 0, capacity: 4, temperature: 0, connections: [Direction.East] }, // (0,0)
      null,                                                                                                   // (0,1) player fills: Tee E-S-W
      null,                                                                                                   // (0,2) player fills: Tee E-S-W
      null,                                                                                                   // (0,3) player fills: Tee E-S-W
      { shape: PipeShape.Elbow, rotation: 180 },                                                             // (0,4) S-W
    ],
    // Row 1
    [
      null,
      { shape: PipeShape.Chamber, chamberContent: 'heater', rotation: 0, temperature: 2, connections: [Direction.North] }, // (1,1)
      { shape: PipeShape.Chamber, chamberContent: 'ice',    rotation: 0, cost: 5, temperature: 2, connections: [Direction.North, Direction.South] }, // (1,2)
      { shape: PipeShape.Chamber, chamberContent: 'ice',    rotation: 0, cost: 5, temperature: 2, connections: [Direction.North, Direction.South] }, // (1,3)
      { shape: PipeShape.Straight, rotation: 0 },                                                            // (1,4) N-S
    ],
    // Row 2
    [
      null,
      null,                                                                                                   // (2,1) empty
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 5, connections: [Direction.North] }, // (2,2)
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 5, connections: [Direction.North] }, // (2,3)
      { shape: PipeShape.Chamber, chamberContent: 'ice',  rotation: 0, cost: 5, temperature: 3, connections: [Direction.North, Direction.South] }, // (2,4)
    ],
    // Row 3
    [
      null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North] },                                // (3,4)
    ],
  ],
  inventory: [
    { shape: PipeShape.Tee, count: 3 },
  ],
};

/** Locked until level 6 is completed. */
const LEVEL_7: LevelDef = {
  id: 7,
  name: 'Cold Front',
  rows: 4,
  cols: 5,
  /**
   * Grid layout (rows×cols = 4×5):
   *   Row 0: Source(0,0,cap=4,East) | null(0,1) | null(0,2) | null(0,3) | Elbow(0,4,S-W)
   *   Row 1: null | Ice(1,1,cost=5,thresh=2,N-S) | Ice(1,2,cost=5,thresh=2,N-S) | Heater(1,3,+2°,North) | Straight(1,4,N-S)
   *   Row 2: null | Tank(2,1,+5,North) | Tank(2,2,+5,North) | null | Ice(2,4,cost=5,thresh=3,N-S)
   *   Row 3: null | null | null | null | Sink(3,4,North)
   *
   * Like Level 6, but with the Heater swapped to position (1,3) and Ice at (1,1).
   * The ice tiles at (1,1) and (1,2) have threshold=2, so they are free only when the
   * heater has already been connected (raising temp to 2).  The puzzle forces the player
   * to connect the heater first before connecting the ice-blocked branches.
   *
   * Intended solution (incremental – order matters):
   *   Turn 1 – Straight E-W at (0,1): extends source path east.
   *   Turn 2 – Straight E-W at (0,2): continues path east.
   *   Turn 3 – Elbow S-W at (0,3): connects Heater(1,3).
   *            currentTemp = 0 + 2 = 2.
   *   Turn 4 – Replace Straight(0,2) with Tee E-S-W: connects Ice(1,2) and Tank(2,2).
   *            currentTemp = 2 → Ice(1,2) thresh=2: deltaTemp=0 → free.  Tank(2,2) impact = +5.
   *   Turn 5 – Replace Straight(0,1) with Tee E-S-W: connects Ice(1,1) and Tank(2,1).
   *            currentTemp = 2 → Ice(1,1) thresh=2: free.  Tank(2,1) impact = +5.
   *   Turn 6 – Replace Elbow(0,3) with Tee E-S-W: opens East arm to Elbow(0,4).
   *            Elbow(0,4), Straight(1,4), Ice(2,4), Sink newly connected.
   *            currentTemp = 2 → Ice(2,4) thresh=3: deltaTemp=1 → cost=5×1=5.
   *
   * Water budget (incremental): 4 (source)
   *   − 3 (Tees) − 1 (Elbow 0,4) − 1 (Straight 1,4) − 5 (Ice 2,4)
   *   + 5 (Tank 2,1) + 5 (Tank 2,2)
   *   = 4 remaining.
   */
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source, rotation: 0, capacity: 4, temperature: 0, connections: [Direction.East] }, // (0,0)
      null,                                                                                                   // (0,1) player fills
      null,                                                                                                   // (0,2) player fills
      null,                                                                                                   // (0,3) player fills
      { shape: PipeShape.Elbow, rotation: 180 },                                                             // (0,4) S-W
    ],
    // Row 1
    [
      null,
      { shape: PipeShape.Chamber, chamberContent: 'ice',    rotation: 0, cost: 5, temperature: 2, connections: [Direction.North, Direction.South] }, // (1,1)
      { shape: PipeShape.Chamber, chamberContent: 'ice',    rotation: 0, cost: 5, temperature: 2, connections: [Direction.North, Direction.South] }, // (1,2)
      { shape: PipeShape.Chamber, chamberContent: 'heater', rotation: 0, temperature: 2, connections: [Direction.North] },                          // (1,3)
      { shape: PipeShape.Straight, rotation: 0 },                                                            // (1,4) N-S
    ],
    // Row 2
    [
      null,
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 5, connections: [Direction.North] }, // (2,1)
      { shape: PipeShape.Chamber, chamberContent: 'tank', rotation: 0, capacity: 5, connections: [Direction.North] }, // (2,2)
      null,                                                                                                   // (2,3) empty
      { shape: PipeShape.Chamber, chamberContent: 'ice',  rotation: 0, cost: 5, temperature: 3, connections: [Direction.North, Direction.South] }, // (2,4)
    ],
    // Row 3
    [
      null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North] },                                // (3,4)
    ],
  ],
  inventory: [
    { shape: PipeShape.Tee,      count: 3 },
    { shape: PipeShape.Straight, count: 3 },
    { shape: PipeShape.Elbow,    count: 1 },
  ],
};

/**
 * Level 8 – Spinner Test
 * ======================
 * 3 × 3 grid: Source(0,0)→SpinStraight(0,1)→Sink(0,2).
 * Used for testing spinner-tile click/right-click interactions.
 */
const LEVEL_8: LevelDef = {
  id: 8,
  name: 'Spinner Test',
  rows: 3,
  cols: 3,
  grid: [
    [
      { shape: PipeShape.Source, rotation: 0, capacity: 2, connections: [Direction.East] }, // (0,0)
      { shape: PipeShape.SpinStraight, rotation: 90 },                                      // (0,1) E-W spinner
      { shape: PipeShape.Sink, rotation: 0, connections: [Direction.West] },                // (0,2)
    ],
    [null, null, null],
    [null, null, null],
  ],
  inventory: [
    { shape: PipeShape.Straight, count: 2 },
  ],
};

export const LEVELS: LevelDef[] = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, LEVEL_5, LEVEL_6, LEVEL_7, LEVEL_8];

/** All game chapters, each containing an ordered set of levels. */
export const CHAPTERS: ChapterDef[] = [
  { id: 1, name: 'Intro', levels: [LEVEL_1, LEVEL_2] },
  { id: 2, name: 'Golden', levels: [LEVEL_3, LEVEL_4] },
  { id: 3, name: 'Icy', levels: [LEVEL_5, LEVEL_6, LEVEL_7] },
  { id: 4, name: 'Spinner', levels: [LEVEL_8] },
];
