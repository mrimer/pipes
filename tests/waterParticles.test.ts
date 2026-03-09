/** Tests for waterParticles utilities. */

import { Board } from '../src/board';
import { Direction, PipeShape } from '../src/types';
import { Tile } from '../src/tile';
import { computeFlowGoodDirs } from '../src/waterParticles';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a 2×4 board:
 *   Source(0,0) ─ (0,1)[Tee] ─ (0,2) ─ Sink(0,3)
 *                     │
 *                   (1,1)  [dead-end branch]
 *
 * Tile shapes & rotations chosen so the grid is fully deterministic:
 *   Source(0,0): customConnections = {East}
 *   (0,1) Tee at 90°: E, S, W
 *   (0,2) Straight at 90°: E, W
 *   Sink(0,3): customConnections = {West}
 *   (1,1) Elbow at 270°: W, N  (West leads to empty cell → only North is mutually connected)
 */
function makeLinearBoardWithDeadEnd(): Board {
  const board = new Board(2, 4);
  board.source = { row: 0, col: 0 };
  board.sink   = { row: 0, col: 3 };

  // customConnections is the 8th constructor parameter
  board.grid[0][0] = new Tile(PipeShape.Source, 0, false, 0, 0, null, 1, new Set([Direction.East]));
  board.grid[0][1] = new Tile(PipeShape.Tee, 90);          // E, S, W
  board.grid[0][2] = new Tile(PipeShape.Straight, 90);      // E, W
  board.grid[0][3] = new Tile(PipeShape.Sink, 0, false, 0, 0, null, 1, new Set([Direction.West]));
  board.grid[1][1] = new Tile(PipeShape.Elbow, 270);        // W, N (West leads to empty)

  return board;
}

// ─── computeFlowGoodDirs ─────────────────────────────────────────────────────

describe('computeFlowGoodDirs', () => {
  it('marks East as the only good direction at (0,1) – not South toward the dead end', () => {
    const board = makeLinearBoardWithDeadEnd();
    const goodDirs = computeFlowGoodDirs(board);

    const dirs01 = goodDirs.get('0,1') ?? new Set();
    // East leads towards the sink; South leads to a dead end.
    expect(dirs01.has(Direction.East)).toBe(true);
    expect(dirs01.has(Direction.South)).toBe(false);
  });

  it('marks East as a good direction at Source (0,0)', () => {
    const board = makeLinearBoardWithDeadEnd();
    const goodDirs = computeFlowGoodDirs(board);

    const dirsSource = goodDirs.get('0,0') ?? new Set();
    expect(dirsSource.has(Direction.East)).toBe(true);
  });

  it('marks East as a good direction at (0,2) – towards the sink', () => {
    const board = makeLinearBoardWithDeadEnd();
    const goodDirs = computeFlowGoodDirs(board);

    const dirs02 = goodDirs.get('0,2') ?? new Set();
    expect(dirs02.has(Direction.East)).toBe(true);
  });

  it('excludes South from goodDirs at (0,1) so drops cannot enter the dead-end branch', () => {
    const board = makeLinearBoardWithDeadEnd();
    const goodDirs = computeFlowGoodDirs(board);

    const dirs01 = goodDirs.get('0,1') ?? new Set();
    expect(dirs01.has(Direction.South)).toBe(false);
  });

  it('returns an empty map when the board has no connection to the sink', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    // Completely disconnect both tiles using customConnections = empty set
    board.grid[0][0] = new Tile(PipeShape.Source, 0, false, 0, 0, null, 1, new Set());
    board.grid[0][1] = new Tile(PipeShape.Sink, 0, false, 0, 0, null, 1, new Set());

    const goodDirs = computeFlowGoodDirs(board);
    expect(goodDirs.size).toBe(0);
  });

  it('handles a simple linear solved board (source–straight–sink)', () => {
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };

    board.grid[0][0] = new Tile(PipeShape.Source, 0, false, 0, 0, null, 1, new Set([Direction.East]));
    board.grid[0][1] = new Tile(PipeShape.Straight, 90);    // E, W
    board.grid[0][2] = new Tile(PipeShape.Sink, 0, false, 0, 0, null, 1, new Set([Direction.West]));

    const goodDirs = computeFlowGoodDirs(board);

    expect(goodDirs.get('0,0')?.has(Direction.East)).toBe(true);
    expect(goodDirs.get('0,1')?.has(Direction.East)).toBe(true);
    expect(goodDirs.get('0,1')?.has(Direction.West)).toBe(false);
  });
});
