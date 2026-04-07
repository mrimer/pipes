/** Tests for the win-level cascading tile-glow effect. */

import { Board } from '../src/board';
import { Direction, PipeShape } from '../src/types';
import { Tile } from '../src/tile';
import {
  computeWinTileGlows,
  WIN_TILE_LAYER_DELAY_MS,
  WIN_TILE_GLOW_DURATION,
} from '../src/visuals/winTileEffect';

// ─── Board helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal 1×3 linear board:
 *   Source(0,0) ─ Straight(0,1) ─ Sink(0,2)
 */
function makeLinearBoard(): Board {
  const board = new Board(1, 3);
  board.source = { row: 0, col: 0 };
  board.sink   = { row: 0, col: 2 };
  board.grid[0][0] = new Tile(PipeShape.Source, 0, false, 0, 0, null, 1, new Set([Direction.East]));
  board.grid[0][1] = new Tile(PipeShape.Straight, 90);          // E, W
  board.grid[0][2] = new Tile(PipeShape.Sink, 0, false, 0, 0, null, 1, new Set([Direction.West]));
  return board;
}

/**
 * Build a 2×3 board with a branch:
 *   Source(0,0) ─ Tee(0,1) ─ Sink(0,2)
 *                    │
 *                 Straight(1,1)  [connected South from Tee]
 *
 * The Tee at (0,1) rotated 90° exposes East, South, West.
 * Straight at (1,1) rotated 0° exposes North, South – but South leads to empty,
 * so only North is mutually connected.
 */
function makeBranchedBoard(): Board {
  const board = new Board(2, 3);
  board.source = { row: 0, col: 0 };
  board.sink   = { row: 0, col: 2 };
  board.grid[0][0] = new Tile(PipeShape.Source, 0, false, 0, 0, null, 1, new Set([Direction.East]));
  board.grid[0][1] = new Tile(PipeShape.Tee, 90);              // E, S, W
  board.grid[0][2] = new Tile(PipeShape.Sink, 0, false, 0, 0, null, 1, new Set([Direction.West]));
  board.grid[1][1] = new Tile(PipeShape.Straight, 0);           // N, S
  return board;
}

// ─── computeWinTileGlows ─────────────────────────────────────────────────────

describe('computeWinTileGlows', () => {
  it('produces one glow entry per filled tile', () => {
    const board = makeLinearBoard();
    const glows = computeWinTileGlows(board, 0);
    // Source, Straight, Sink = 3 tiles
    expect(glows).toHaveLength(3);
  });

  it('source tile (depth 0) starts at baseTime', () => {
    const base = 1000;
    const board = makeLinearBoard();
    const glows = computeWinTileGlows(board, base);
    const sourceGlow = glows.find(g => g.row === 0 && g.col === 0);
    expect(sourceGlow).toBeDefined();
    expect(sourceGlow!.startTime).toBe(base);
  });

  it('tile at depth 1 (immediate neighbour of source) starts at baseTime – same delay as source (depth 0)', () => {
    const base = 1000;
    const board = makeLinearBoard();
    const glows = computeWinTileGlows(board, base);
    // Straight at (0,1) is BFS depth 1
    const midGlow = glows.find(g => g.row === 0 && g.col === 1);
    expect(midGlow).toBeDefined();
    expect(midGlow!.startTime).toBe(base);
  });

  it('source (depth 0) and its immediate neighbour (depth 1) fire simultaneously at baseTime', () => {
    const base = 500;
    const board = makeLinearBoard();
    const glows = computeWinTileGlows(board, base);
    const sourceGlow = glows.find(g => g.row === 0 && g.col === 0);
    const midGlow    = glows.find(g => g.row === 0 && g.col === 1);
    expect(sourceGlow!.startTime).toBe(base);
    expect(midGlow!.startTime).toBe(base);
    expect(sourceGlow!.startTime).toBe(midGlow!.startTime);
  });

  it('tile at depth 2 starts at baseTime + WIN_TILE_LAYER_DELAY_MS', () => {
    const base = 1000;
    const board = makeLinearBoard();
    const glows = computeWinTileGlows(board, base);
    // Sink at (0,2) is BFS depth 2
    const sinkGlow = glows.find(g => g.row === 0 && g.col === 2);
    expect(sinkGlow).toBeDefined();
    expect(sinkGlow!.startTime).toBe(base + WIN_TILE_LAYER_DELAY_MS);
  });

  it('branch tiles get a start time matching their BFS depth', () => {
    const base = 0;
    const board = makeBranchedBoard();
    const glows = computeWinTileGlows(board, base);

    // (0,1) Tee is depth 1 → fires at base
    const teeGlow = glows.find(g => g.row === 0 && g.col === 1);
    expect(teeGlow!.startTime).toBe(base);

    // (0,2) Sink and (1,1) Straight are both depth 2 → fire together at base + delay
    const sinkGlow    = glows.find(g => g.row === 0 && g.col === 2);
    const branchGlow  = glows.find(g => g.row === 1 && g.col === 1);
    expect(sinkGlow!.startTime).toBe(base + WIN_TILE_LAYER_DELAY_MS);
    expect(branchGlow!.startTime).toBe(base + WIN_TILE_LAYER_DELAY_MS);
  });

  it('returns an empty array when no tiles are filled (disconnected board)', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, false, 0, 0, null, 1, new Set());
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, false, 0, 0, null, 1, new Set());
    // Only source is in getFilledPositions (no mutual connections)
    const glows = computeWinTileGlows(board, 0);
    // At minimum the source tile is always in getFilledPositions
    const keys = new Set(glows.map(g => `${g.row},${g.col}`));
    expect(keys.has('0,0')).toBe(true);
    // The disconnected sink should not appear
    expect(keys.has('0,1')).toBe(false);
  });

  it('WIN_TILE_GLOW_DURATION is a positive number', () => {
    expect(WIN_TILE_GLOW_DURATION).toBeGreaterThan(0);
  });

  it('WIN_TILE_LAYER_DELAY_MS equals 100', () => {
    expect(WIN_TILE_LAYER_DELAY_MS).toBe(100);
  });
});
