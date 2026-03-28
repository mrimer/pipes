import { Board } from '../src/board';
import { Tile } from '../src/tile';
import { PipeShape } from '../src/types';

describe('User specific scenario - proper board setup', () => {
  function makeBoard() {
    // Row 0: Source(0,0) → [pos(0,1)] → Container(-2,Str)(0,2) → Sink(0,3)
    // Row 1: Empty(1,0)  → Container(-1,Str)(1,1) → Empty(1,2) → Empty(1,3)
    // All cells explicitly set to avoid random tiles
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -2, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true);
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -1, null, 'item');
    board.grid[1][2] = new Tile(PipeShape.Empty, 0);
    board.grid[1][3] = new Tile(PipeShape.Empty, 0);
    board.sourceCapacity = 10;
    return board;
  }

  it('case A: straight connects Container(-2), tee maintains + adds Container(-1) → ALLOW (net stays same)', () => {
    const board = makeBoard();
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }, { shape: PipeShape.Tee, count: 1 }];

    // Place Straight(R=90,EW) at (0,1): connects Source→Container(-2)→Sink, NOT Container(-1)
    const placed = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(placed).toBe(true);
    expect([...board.getContainerBonuses()]).toEqual([[PipeShape.Straight, -2]]);
    
    // Replace with Tee(R=90,ESW): maintains Container(-2), connects Container(-1)
    // finalEffective = 1 (reclaimed) + (-3) = -2, originalEffective = 0 + (-2) = -2 → same → ALLOW
    const replaced = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90);
    console.log('A: replaced=', replaced, 'lastError=', board.lastError);
    expect(replaced).toBe(true);
  });

  it('case B: straight connects Container(-2), tee maintains + adds Container(-2) → currently BLOCKS (net decreases)', () => {
    // Row 0: Source → [pos] → Container(-2,Str) → Sink
    // Row 1:         → Container(-2,Str) [new negative container]
    const board = new Board(2, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 3 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 5);
    board.grid[0][1] = new Tile(PipeShape.Empty, 0);
    board.grid[0][2] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -2, null, 'item');
    board.grid[0][3] = new Tile(PipeShape.Sink, 0, true);
    board.grid[1][0] = new Tile(PipeShape.Empty, 0);
    board.grid[1][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, -2, null, 'item');
    board.grid[1][2] = new Tile(PipeShape.Empty, 0);
    board.grid[1][3] = new Tile(PipeShape.Empty, 0);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }, { shape: PipeShape.Tee, count: 1 }];

    const placed = board.placeInventoryTile({ row: 0, col: 1 }, PipeShape.Straight, 90);
    expect(placed).toBe(true);
    expect([...board.getContainerBonuses()]).toEqual([[PipeShape.Straight, -2]]);
    
    // Replace with Tee(R=90,ESW): maintains Container(-2) at (0,2), adds Container(-2) at (1,1)
    // finalEffective = 1 (reclaimed) + (-4) = -3, originalEffective = 0 + (-2) = -2 → net DECREASES
    // PR #272: -2 < 0 AND -3 >= -2? NO → CURRENTLY BLOCKED
    const replaced = board.replaceInventoryTile({ row: 0, col: 1 }, PipeShape.Tee, 90);
    console.log('B: replaced=', replaced, 'lastError=', board.lastError);
    // This is BLOCKED by current code. The new requirement should ALLOW it.
    expect(replaced).toBe(false); // Currently blocked - will change to true with fix
  });
});
