/**
 * @jest-environment jsdom
 */

import { PipeShape, GameState } from '../../src/types';
import { Board } from '../../src/board';
import { Tile } from '../../src/tile';
import { renderInventoryBar } from '../../src/inventoryRenderer';
import {
  makeGame,
  gameHooks,
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
describe('Game – _checkWinLose: fail takes precedence', () => {
  it('results in GameOver (not Won) when water is negative even if sink is reached', () => {
    const { game, winModalEl, gameoverModalEl } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Stub board so sink is reached (isSolved = true) but water is negative
    jest.spyOn(boardAccess.board, 'isSolved').mockReturnValue(true);
    jest.spyOn(boardAccess.board, 'getCurrentWater').mockReturnValue(-1);

    (game as unknown as { _checkWinLose(): void })._checkWinLose();

    expect(boardAccess.gameState).toBe(GameState.GameOver);
    expect(gameoverModalEl.style.display).toBe('flex');
    expect(winModalEl.style.display).toBe('none');
  });

  it('results in GameOver (not Won) when water is zero and sink is reached', () => {
    const { game, winModalEl, gameoverModalEl } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Water exactly 0 and sink reached → still a loss; water must be > 0 to win
    jest.spyOn(boardAccess.board, 'isSolved').mockReturnValue(true);
    jest.spyOn(boardAccess.board, 'getCurrentWater').mockReturnValue(0);

    (game as unknown as { _checkWinLose(): void })._checkWinLose();

    expect(boardAccess.gameState).toBe(GameState.GameOver);
    expect(gameoverModalEl.style.display).toBe('flex');
    expect(winModalEl.style.display).toBe('none');
  });

  it('results in Won when water is positive and sink is reached', () => {
    const { game, winModalEl, gameoverModalEl } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Water > 0 and sink reached → win
    jest.spyOn(boardAccess.board, 'isSolved').mockReturnValue(true);
    jest.spyOn(boardAccess.board, 'getCurrentWater').mockReturnValue(1);

    (game as unknown as { _checkWinLose(): void })._checkWinLose();

    expect(boardAccess.gameState).toBe(GameState.Won);
    expect(winModalEl.style.display).toBe('flex');
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('results in GameOver when water is zero and sink is not reached', () => {
    const { game, gameoverModalEl } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    jest.spyOn(boardAccess.board, 'isSolved').mockReturnValue(false);
    jest.spyOn(boardAccess.board, 'getCurrentWater').mockReturnValue(0);

    (game as unknown as { _checkWinLose(): void })._checkWinLose();

    expect(boardAccess.gameState).toBe(GameState.GameOver);
    expect(gameoverModalEl.style.display).toBe('flex');
  });
});

// ─── Tests: fail move does not add undo snapshot ─────────────────────────────

describe('Game – fail move does not add undo snapshot', () => {
  /**
   * Stub board so that the next call to getCurrentWater() returns `waterValue`.
   * Also stubs applyTurnDelta() and isSolved() to avoid side effects.
   */
  function stubBoardForWater(board: Board, waterValue: number): void {
    jest.spyOn(board, 'getCurrentWater').mockReturnValue(waterValue);
    jest.spyOn(board, 'applyTurnDelta').mockImplementation(() => []);
    jest.spyOn(board, 'isSolved').mockReturnValue(false);
  }

  it('does not record an undo snapshot when placing a tile causes a fail state', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };
    const board = boardAccess.board;

    // Stub so that the move will result in GameOver (water = 0)
    stubBoardForWater(board, 0);

    // Perform a tile placement via keyboard (triggers _afterTilePlaced internally)
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // The move triggered GameOver, so no snapshot should have been added
    expect(boardAccess.gameState).toBe(GameState.GameOver);
    expect(board.canUndo()).toBe(false);
  });

  it('still records an undo snapshot when placing a tile does not cause a fail state', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };
    const board = boardAccess.board;

    // Water is positive → no fail
    jest.spyOn(board, 'getCurrentWater').mockReturnValue(5);
    jest.spyOn(board, 'applyTurnDelta').mockImplementation(() => []);
    jest.spyOn(board, 'isSolved').mockReturnValue(false);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    expect(boardAccess.gameState).toBe(GameState.Playing);
    expect(board.canUndo()).toBe(true);
  });
});

// ─── Tests: retryLevel skips history graft in fail state ─────────────────────

describe('Game – retryLevel grafts history excluding the losing move', () => {
  it('grafts pre-restart history even when retrying from a fail state (losing move already discarded)', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Simulate: player made a move before the fail, so canUndo() is true
    boardAccess.board.recordMove();
    expect(boardAccess.board.canUndo()).toBe(true);

    // The failing move snapshot has already been discarded by discardLastMoveFromHistory()
    // before gameState is set to GameOver; simulate that by leaving canUndo() true.
    boardAccess.gameState = GameState.GameOver;

    game.retryLevel();

    // History is grafted; player can undo back to the pre-fail state
    expect(boardAccess.board.canUndo()).toBe(true);
  });

  it('grafts pre-restart history when retrying from a normal (Playing) state', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Simulate: player made a move, so canUndo() is true
    boardAccess.board.recordMove();
    expect(boardAccess.board.canUndo()).toBe(true);

    // Game is still Playing (not GameOver)
    expect(boardAccess.gameState).toBe(GameState.Playing);

    game.retryLevel();

    // After restarting normally, undo history should be grafted
    expect(boardAccess.board.canUndo()).toBe(true);
  });
});

describe('renderInventoryBar – bonus shapes not in inventory', () => {
  it('displays a bonus shape from a connected Chamber-item tile even when absent from board.inventory', () => {
    // Board: Source(0) → Chamber(item: grants 2 Elbows)(1) → Sink(2)
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 2, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    board.inventory = []; // no pre-declared inventory items

    const container = document.createElement('div');
    renderInventoryBar(container, board, null, () => {});

    const items = container.querySelectorAll<HTMLElement>('.inv-item');
    expect(items.length).toBe(1);
    expect(items[0].dataset['shape']).toBe(PipeShape.Elbow);
    expect(items[0].querySelector('svg')).not.toBeNull();
    expect(items[0].querySelector('.inv-count')?.textContent).toBe('×2');
  });

  it('does not duplicate a shape that is already listed in board.inventory', () => {
    // Board: Source(0) → Chamber(item: grants 1 Straight)(1) → Sink(2)
    const board = new Board(1, 3);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 2 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 1, null, 'item');
    board.grid[0][2] = new Tile(PipeShape.Sink,    0, true);
    board.sourceCapacity = 10;
    board.inventory = [{ shape: PipeShape.Straight, count: 1 }]; // already declared

    const container = document.createElement('div');
    renderInventoryBar(container, board, null, () => {});

    // Only one Straight row – bonus merged into the existing entry (1 base + 1 bonus = ×2)
    const straightItems = container.querySelectorAll<HTMLElement>('[data-shape="STRAIGHT"]');
    expect(straightItems.length).toBe(1);
    expect(straightItems[0].querySelector('svg')).not.toBeNull();
    expect(straightItems[0].querySelector('.inv-count')?.textContent).toBe('×2');
  });

  it('shows no extra entry when the Chamber-item tile is not in the fill path', () => {
    // Board: Source(0) → Sink(1) → Empty(2) → Chamber(3)
    // The Empty tile has no connections, so Chamber is unreachable.
    const board = new Board(1, 4);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source,  0, true);
    board.grid[0][1] = new Tile(PipeShape.Sink,    0, true);
    board.grid[0][2] = new Tile(PipeShape.Empty,   0);
    board.grid[0][3] = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 2, null, 'item');
    board.sourceCapacity = 10;
    board.inventory = [];

    const container = document.createElement('div');
    renderInventoryBar(container, board, null, () => {});

    // Chamber is disconnected → no bonus → nothing shown
    expect(container.querySelectorAll('.inv-item').length).toBe(0);
  });
});

// ─── Tests: renderInventoryBar – canvas preservation ─────────────────────────

describe('renderInventoryBar – canvas preservation', () => {
  it('preserves canvas child elements across re-renders so wave animations are not interrupted', () => {
    const board = new Board(1, 2);
    board.source = { row: 0, col: 0 };
    board.sink   = { row: 0, col: 1 };
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true);
    board.grid[0][1] = new Tile(PipeShape.Sink,   0, true);
    board.sourceCapacity = 5;
    board.inventory = [{ shape: PipeShape.Straight, count: 2 }];

    const container = document.createElement('div');
    // Simulate a wave animation canvas appended by attachInventoryWaveAnimation.
    const waveCanvas = document.createElement('canvas');
    waveCanvas.style.cssText = 'position:absolute;inset:0;z-index:-1;opacity:0.2;';
    container.appendChild(waveCanvas);

    renderInventoryBar(container, board, null, () => {});

    // The canvas should still be present in the container after re-render.
    expect(container.querySelector('canvas')).toBe(waveCanvas);
  });
});

// ─── Tests: _positionModalBelowCanvas ────────────────────────────────────────

