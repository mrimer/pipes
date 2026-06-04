/**
 * Unit tests for the move recorder: encode/decode round-trips and replayMoves.
 */

import { encodePlaceMove, encodeRotateMove, encodeDeleteMove, decodeMove, replayMoves } from '../src/moveRecorder';
import { PipeShape, Direction } from '../src/types';
import { makeLevelDef } from './testHelpers';

// ─── Encode / decode round-trips ─────────────────────────────────────────────

describe('encodePlaceMove / decodeMove', () => {
  it('round-trips a place move', () => {
    const encoded = encodePlaceMove(PipeShape.Elbow, 3, 4, 90);
    expect(encoded).toBe(`P:${PipeShape.Elbow}:3:4:90`);
    const decoded = decodeMove(encoded);
    expect(decoded).toEqual({ type: 'place', shape: PipeShape.Elbow, row: 3, col: 4, rotation: 90 });
  });

  it('round-trips a place move with rotation 0', () => {
    const encoded = encodePlaceMove(PipeShape.Straight, 0, 0, 0);
    const decoded = decodeMove(encoded);
    expect(decoded).toEqual({ type: 'place', shape: PipeShape.Straight, row: 0, col: 0, rotation: 0 });
  });

  it('round-trips a place move with rotation 270', () => {
    const encoded = encodePlaceMove(PipeShape.Tee, 1, 2, 270);
    const decoded = decodeMove(encoded);
    expect(decoded).toEqual({ type: 'place', shape: PipeShape.Tee, row: 1, col: 2, rotation: 270 });
  });
});

describe('encodeRotateMove / decodeMove', () => {
  it('round-trips a rotate CW move', () => {
    const encoded = encodeRotateMove(2, 5, 'CW');
    expect(encoded).toBe('R:2:5:CW');
    const decoded = decodeMove(encoded);
    expect(decoded).toEqual({ type: 'rotate', row: 2, col: 5, direction: 'CW' });
  });

  it('round-trips a rotate CCW move', () => {
    const encoded = encodeRotateMove(0, 0, 'CCW');
    const decoded = decodeMove(encoded);
    expect(decoded).toEqual({ type: 'rotate', row: 0, col: 0, direction: 'CCW' });
  });
});

describe('encodeDeleteMove / decodeMove', () => {
  it('round-trips a delete move', () => {
    const encoded = encodeDeleteMove(5, 3);
    expect(encoded).toBe('D:5:3');
    const decoded = decodeMove(encoded);
    expect(decoded).toEqual({ type: 'delete', row: 5, col: 3 });
  });
});

describe('decodeMove – invalid inputs', () => {
  it('returns null for an empty string', () => {
    expect(decodeMove('')).toBeNull();
  });

  it('returns null for an unknown prefix', () => {
    expect(decodeMove('X:1:2')).toBeNull();
  });

  it('returns null for a place move with NaN coordinates', () => {
    expect(decodeMove(`P:${PipeShape.Straight}:abc:0:0`)).toBeNull();
  });

  it('returns null for a place move with invalid rotation', () => {
    expect(decodeMove(`P:${PipeShape.Straight}:1:0:45`)).toBeNull();
  });

  it('returns null for a rotate move with invalid direction', () => {
    expect(decodeMove('R:1:0:UP')).toBeNull();
  });

  it('returns null for a delete move with NaN coordinates', () => {
    expect(decodeMove('D:abc:0')).toBeNull();
  });

  it('returns null for too few parts in a place move', () => {
    expect(decodeMove('P:Straight:1:0')).toBeNull();
  });
});

// ─── replayMoves ─────────────────────────────────────────────────────────────

/** Minimal solvable level: 1×3, source–(slot)–sink. */
const SIMPLE_LEVEL = makeLevelDef({
  id: 9001,
  cols: 3,
  grid: [
    [
      { shape: PipeShape.Source, capacity: 10, connections: [Direction.East] },
      null,
      { shape: PipeShape.Sink, connections: [Direction.West] },
    ],
  ],
  inventory: [{ shape: PipeShape.Straight, count: 2 }],
});

describe('replayMoves', () => {
  it('returns an empty initial board when given no moves', () => {
    const level = SIMPLE_LEVEL;
    const { board, stoppedAt, corrupted } = replayMoves(level, []);
    expect(corrupted).toBe(false);
    expect(stoppedAt).toBe(0);
    expect(board.isSolved()).toBe(false);
  });

  it('correctly replays a place move', () => {
    const level = SIMPLE_LEVEL;
    const moves = [encodePlaceMove(PipeShape.Straight, 0, 1, 90)];
    const { board, stoppedAt, corrupted } = replayMoves(level, moves);
    expect(corrupted).toBe(false);
    expect(stoppedAt).toBe(1);
    expect(board.isSolved()).toBe(true);
  });

  it('correctly replays a delete (reclaim) move', () => {
    const level = SIMPLE_LEVEL;
    const moves = [
      encodePlaceMove(PipeShape.Straight, 0, 1, 90),
      encodeDeleteMove(0, 1),
    ];
    const { board, stoppedAt, corrupted } = replayMoves(level, moves);
    expect(corrupted).toBe(false);
    expect(stoppedAt).toBe(2);
    expect(board.isSolved()).toBe(false);
  });

  it('stops and sets corrupted on a malformed move string', () => {
    const level = SIMPLE_LEVEL;
    const moves = ['NOT_A_VALID_MOVE'];
    const { stoppedAt, corrupted } = replayMoves(level, moves);
    expect(corrupted).toBe(true);
    expect(stoppedAt).toBe(0);
  });

  it('stops and sets corrupted when a move fails on the board', () => {
    const level = SIMPLE_LEVEL;
    // Delete move on an empty cell: will fail because there is no tile to reclaim.
    const moves = [encodeDeleteMove(0, 1)];
    const { stoppedAt, corrupted } = replayMoves(level, moves);
    expect(corrupted).toBe(true);
    expect(stoppedAt).toBe(0);
  });

  it('applies only valid moves before the corrupt one', () => {
    const level = SIMPLE_LEVEL;
    const moves = [
      encodePlaceMove(PipeShape.Straight, 0, 1, 90), // valid
      encodeDeleteMove(0, 0), // row 0 col 0 is the Source – not reclaimable
    ];
    const { board, stoppedAt, corrupted } = replayMoves(level, moves);
    // The first move should have been applied.
    expect(stoppedAt).toBe(1);
    expect(corrupted).toBe(true);
    // Board should reflect the state after the first valid move.
    expect(board.isSolved()).toBe(true);
  });
});
