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
 * Water budget:  start 20 + tank 8 = 28 total; path costs 8 regular pipes → 20 units remain on win.
 * The Tank at (1,3) is interior (row 1, col 3) so edge-validation passes.
 */

const LEVEL_1: LevelDef = {
  id: 1,
  name: 'Tutorial',
  rows: 6,
  cols: 6,
  sourceCapacity: 20,
  grid: [
    // Row 0
    [
      { shape: PipeShape.Source, rotation: 0, isFixed: true, capacity: 20 },
      null, null, null, null, null,
    ],
    // Row 1
    [
      { shape: PipeShape.Elbow,    rotation: 0,   isFixed: true },           // (1,0) N-E
      { shape: PipeShape.Straight, rotation: 90,  isFixed: true },           // (1,1) E-W
      { shape: PipeShape.Straight, rotation: 90,  isFixed: true },           // (1,2) E-W
      { shape: PipeShape.Tank,     rotation: 0,   isFixed: true, capacity: 8 }, // (1,3)
      null,                                                                   // (1,4) player fills
      { shape: PipeShape.Elbow,    rotation: 180, isFixed: true },           // (1,5) S-W
    ],
    // Row 2 – (2,5) left empty for player
    [null, null, null, null, null, null],
    // Row 3
    [
      null, null, null, null, null,
      { shape: PipeShape.Straight, rotation: 0, isFixed: true },             // (3,5) N-S
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
  sourceCapacity: 15,
  grid: [],
  inventory: [],
};

/** Placeholder stub – locked until level 2 is completed. */
const LEVEL_3: LevelDef = {
  id: 3,
  name: 'Mountain Stream',
  rows: 6,
  cols: 6,
  sourceCapacity: 10,
  grid: [],
  inventory: [],
};

export const LEVELS: LevelDef[] = [LEVEL_1, LEVEL_2, LEVEL_3];
