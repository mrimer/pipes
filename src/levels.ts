import { LevelDef, PipeShape } from './types';

/**
 * All game levels.
 *
 * Level 1 – Tutorial
 * ==================
 * 6 × 6 grid.  The solution path runs:
 *
 *   Source(0,0)
 *     → S to (1,0) Elbow(N-E, fixed)
 *     → E to (1,1) Straight(E-W, fixed)
 *     → E to (1,2) Straight(E-W, fixed)
 *     → E to (1,3) TANK(cap=8, fixed)
 *     → E to (1,4) [EMPTY – player places Straight E-W]
 *     → E to (1,5) Elbow(S-W, fixed)
 *     → S to (2,5) [EMPTY – player places Straight N-S]
 *     → S to (3,5) Straight(N-S, fixed)
 *     → S to (4,5) [EMPTY – player places Straight N-S]
 *     → S to (5,5) Sink (WIN!)
 *
 * Water budget:  start 5 + tank 5 = 10 total; path costs 8 regular pipes → 2 units remain on win.
 * The Tank at (1,3) is interior (row 1, col 3) so edge-validation passes.
 */

const LEVEL_1: LevelDef = {
  id: 1,
  name: 'Tutorial',
  rows: 6,
  cols: 6,
  sourceCapacity: 5,
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source, rotation: 0, isFixed: true, capacity: 5 },
      null, null, null, null, null,
    ],
    // Row 1
    [
      null,                                                                  // (1,0) player fills
      { shape: PipeShape.Straight, rotation: 90,  isFixed: true },           // (1,1) E-W
      null,                                                                  // (1,2) player fills
      { shape: PipeShape.Straight, rotation: 90,  isFixed: true },           // (1,3) E-W
      null,                                                                  // (1,4) player fills
      { shape: PipeShape.Elbow,    rotation: 180, isFixed: true },           // (1,5) S-W
    ],
    // Row 2 – (2,5) left empty for player
    [
      null,
      null,
      { shape: PipeShape.Granite, isFixed: true },                              // (2,2) granite obstacle
      { shape: PipeShape.Granite, isFixed: true },                              // (2,3) granite obstacle
      null,
      null,
    ],
    // Row 3
    [
      { shape: PipeShape.Tank,     rotation: 0,   isFixed: true, capacity: 5 }, // (3,1)
      null,
      { shape: PipeShape.Granite, isFixed: true },                              // (3,2) granite obstacle
      { shape: PipeShape.Granite, isFixed: true },                              // (3,3) granite obstacle
      null,
      { shape: PipeShape.Straight, rotation: 0, isFixed: true },               // (3,5) N-S
    ],
    // Row 4 – (4,5) left empty for player
    [null, null, null, null, null, null],
    // Row 5
    [
      null, null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, isFixed: true },                 // (5,5)
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
  sourceCapacity: 12,
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
      { shape: PipeShape.Source,    rotation: 0,   isFixed: true, capacity: 12 }, // (0,0)
      null,                                                                         // (0,1) player fills: Straight E-W
      { shape: PipeShape.DirtBlock, rotation: 0,   isFixed: true, dirtCost: 2 },  // (0,2)
      null,                                                                         // (0,3) player fills: Straight E-W
      { shape: PipeShape.Elbow,     rotation: 180, isFixed: true },                // (0,4) W-S
      null,
    ],
    // Row 1
    [
      null, null,
      { shape: PipeShape.Granite, isFixed: true },                              // (1,2) granite obstacle
      null,
      null,                                                                         // (1,4) player fills: Straight N-S
      null,
    ],
    // Row 2
    [
      null, null,
      { shape: PipeShape.Granite, isFixed: true },                              // (2,2) granite obstacle
      null,
      { shape: PipeShape.Straight, rotation: 0, isFixed: true },                  // (2,4) N-S
      null,
    ],
    // Row 3
    [
      null, null,
      { shape: PipeShape.Granite, isFixed: true },                              // (3,2) granite obstacle
      null,
      { shape: PipeShape.DirtBlock, rotation: 0, isFixed: true, dirtCost: 3 },   // (3,4)
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
      { shape: PipeShape.Sink, rotation: 0, isFixed: true },                      // (5,4)
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
  sourceCapacity: 10,
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
      { shape: PipeShape.Source,        rotation: 0,   isFixed: true, capacity: 10 }, // (0,0)
      null,                                                                             // (0,1) player fills: Straight E-W
      { shape: PipeShape.ItemContainer, rotation: 0,   isFixed: true, itemShape: PipeShape.GoldStraight, itemCount: 1 }, // (0,2)
      { shape: PipeShape.Elbow,         rotation: 180, isFixed: true },                // (0,3) S-W
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
      { shape: PipeShape.Elbow,    rotation: 90,  isFixed: true },                    // (2,0) E-S
      { shape: PipeShape.Straight, rotation: 90,  isFixed: true },                    // (2,1) E-W
      { shape: PipeShape.Straight, rotation: 90,  isFixed: true },                    // (2,2) E-W
      { shape: PipeShape.Elbow,    rotation: 270, isFixed: true },                    // (2,3) W-N
      null, null,
    ],
    // Row 3
    [
      { shape: PipeShape.Straight, rotation: 0, isFixed: true },                      // (3,0) N-S
      null, null, null, null, null,
    ],
    // Row 4
    [
      { shape: PipeShape.Straight, rotation: 0, isFixed: true },                      // (4,0) N-S
      null, null, null, null, null,
    ],
    // Row 5
    [
      { shape: PipeShape.Sink, rotation: 0, isFixed: true },                          // (5,0)
      null, null, null, null, null,
    ],
  ],
  inventory: [
    { shape: PipeShape.Straight,     count: 1 },
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
  sourceCapacity: 12,
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
      { shape: PipeShape.Source,        rotation: 0,   isFixed: true, capacity: 12 }, // (0,0)
      null,                                                                             // (0,1) player fills: Straight E-W
      { shape: PipeShape.ItemContainer, rotation: 0,   isFixed: true, itemShape: PipeShape.GoldStraight, itemCount: 1 }, // (0,2)
      { shape: PipeShape.GoldSpace },                                                  // (0,3) gold space – player places GoldStraight here
      { shape: PipeShape.Elbow,         rotation: 180, isFixed: true },                // (0,4) S-W
      null,
    ],
    // Row 1
    [
      null, null, null, null,
      { shape: PipeShape.Straight, rotation: 0,   isFixed: true },                    // (1,4) N-S
      null,
    ],
    // Row 2
    [
      null, null, null, null,
      { shape: PipeShape.Tank,     rotation: 0,   isFixed: true, capacity: 4 },       // (2,4)
      null,
    ],
    // Row 3
    [
      null, null, null, null,
      { shape: PipeShape.Straight, rotation: 0,   isFixed: true },                    // (3,4) N-S
      null,
    ],
    // Row 4
    [
      null, null, null, null,
      { shape: PipeShape.DirtBlock, rotation: 0,  isFixed: true, dirtCost: 2 },       // (4,4)
      null,
    ],
    // Row 5
    [
      null, null, null, null,
      { shape: PipeShape.Sink, rotation: 0, isFixed: true },                          // (5,4)
      null,
    ],
  ],
  inventory: [
    { shape: PipeShape.Straight,     count: 1 },
    { shape: PipeShape.Elbow,        count: 1 },
    { shape: PipeShape.Tee,          count: 1 },
    { shape: PipeShape.GoldStraight, count: 0 },
  ],
};

export const LEVELS: LevelDef[] = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4];
