/**
 * @jest-environment jsdom
 */

import { PipeShape } from '../../src/types';
import { SfxId } from '../../src/audio/sfxManager';
import { Tile } from '../../src/tile';
import {
  makeGame,
  makeChamberConnectionBoard,
  collectConnectionSfx,
  gameTestBeforeEach,
  gameTestAfterEach,
} from '../gameTestHelpers';

// Make spawnConfetti synchronous in tests by immediately invoking the onComplete callback.
jest.mock('../../src/visuals/confetti', () => ({
  spawnConfetti: (onComplete?: () => void) => { if (onComplete) onComplete(); },
  clearConfetti: jest.fn(),
}));
beforeEach(gameTestBeforeEach);
afterEach(gameTestAfterEach);
describe('Game._collectConnectionSfx', () => {
  it('plays Tank for a newly-connected tank chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Tank]);
  });

  it('plays NegativeCount for a newly-connected item chamber with itemCount <= 0', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 0, null, 'item'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.NegativeCount]);
  });

  it('plays nothing for a newly-connected item chamber with a positive itemCount', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 2, null, 'item'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([]);
  });

  it('plays Cooler for a newly-connected heater chamber with negative temperature', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', -1),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Cooler]);
  });

  it('plays Heater for a newly-connected heater chamber with non-negative temperature', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 3),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Heater]);
  });

  it('plays Vacuum for a newly-connected pump chamber with negative pressure', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, -1),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Vacuum]);
  });

  it('plays Pump for a newly-connected pump chamber with non-negative pressure', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, 2),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Pump]);
  });

  it('plays Star for a newly-connected star chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'star'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Star]);
  });

  it('plays Gel for a newly-connected gel chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'gel'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Gel]);
  });

  it('plays Siphon for a newly-connected siphon chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Siphon]);
  });

  it('plays Sizzle for a newly-connected hot_plate chamber with no locked frozen gain', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'hot_plate'),
    ]);
    // Fresh board: getLockedHotPlateGain returns null (never evaluated) → frozenGain 0 → Sizzle.
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sizzle]);
  });

  it('plays Ice0 for a connected ice chamber at zero raw cost', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 0),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice0]);
  });

  it('plays Ice1 for a connected ice chamber below the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 3),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice1]);
  });

  it('plays Ice2 for a connected ice chamber at exactly the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice2]);
  });

  it('plays Ice3 for a connected ice chamber at exactly the high threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, null, 'ice', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice3]);
  });

  it('plays Snow0 for a connected snow chamber at zero raw cost', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'snow', 0),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow0]);
  });

  it('plays Snow1 for a connected snow chamber below the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'snow', 3),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow1]);
  });

  it('plays Snow2 for a connected snow chamber at exactly the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'snow', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow2]);
  });

  it('plays Snow3 for a connected snow chamber at exactly the high threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, null, 'snow', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow3]);
  });

  it('plays Dirt1 for a connected dirt chamber below the mid cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'dirt'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Dirt1]);
  });

  it('plays Dirt2 for a connected dirt chamber between the mid and high cost thresholds', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 7, null, 1, null, 'dirt'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Dirt2]);
  });

  it('plays Dirt3 for a connected dirt chamber at or above the high cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 12, null, 1, null, 'dirt'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Dirt3]);
  });

  it('plays Sandstone1 for a connected non-shattering sandstone chamber below the mid cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'sandstone', 0, 0, 5, 10),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sandstone1]);
  });

  it('plays Sandstone2 for a connected non-shattering sandstone chamber between the mid and high cost thresholds', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 7, null, 1, null, 'sandstone', 0, 0, 5, 10),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sandstone2]);
  });

  it('plays Sandstone3 for a connected non-shattering sandstone chamber at or above the high cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 12, null, 1, null, 'sandstone', 0, 0, 5, 10),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sandstone3]);
  });

  it('plays SandstoneShatter for a connected sandstone chamber whose pressure meets its shatter threshold', () => {
    const { game } = makeGame();
    // Source pressure=5 (set via board.grid[0][0] below, overriding makeChamberConnectionBoard's
    // default pressure=1) so the environment pressure (5) meets this tile's shatter threshold (3).
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'sandstone', 0, 0, 2, 3),
    ]);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, null, null, 0, 5);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.SandstoneShatter]);
  });

  it('plays only the sfx for the highest-cost of two simultaneously-connected ice chambers', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 2),  // raw = 2 → would be Ice1 alone
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 6),  // raw = 6 → Ice2, and the higher of the two
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice2]);
  });

  it('plays an immediate sfx before accumulator-category sfx, combining sfx from different categories connected the same turn', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank'),
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 3),   // raw 3 → Ice1
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'dirt'),     // cost 3 → Dirt1
    ]);
    // Immediate-type sfx (tank) is pushed while scanning tiles; accumulator-type sfx
    // (ice, dirt) is only pushed once after the scan completes, in a fixed
    // hot_plate → ice → snow → dirt → sandstone order — so Tank is always first here
    // regardless of the tiles' left-to-right board order.
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Tank, SfxId.Ice1, SfxId.Dirt1]);
  });
});
