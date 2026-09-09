/**
 * @jest-environment jsdom
 */

import { PipeShape, GameState } from '../../src/types';
import type { Board } from '../../src/board';
import { ANIM_NEGATIVE_COLOR, ANIM_POSITIVE_COLOR, ANIM_ZERO_COLOR } from '../../src/visuals/tileAnimation';
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
describe('Game – level-select chapter numbering', () => {
  it('numbers chapters by their array position (1-based), not by chapter.id', () => {
    makeGame();
    const levelListEl = document.getElementById('level-list')!;
    // Collect all chapter header text (the <span> inside each chapter header button)
    const chapterSpans = Array.from(
      levelListEl.querySelectorAll('.chapter-header span:first-child'),
    );
    chapterSpans.forEach((span, index) => {
      expect(span.textContent).toMatch(new RegExp(`^Chapter ${index + 1}:`));
    });
  });
});

// ─── Tests: pendingRotation and placement orientation ─────────────────────────

describe('Game – pending rotation', () => {
  it('initializes pendingRotation to 0 when starting a level', () => {
    const { game } = makeGame();
    game.startLevel(1);
    expect(gameHooks(game).pendingRotation).toBe(0);
  });

  it('W key advances pendingRotation clockwise by 90° when a shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(90);

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(180);

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(270);

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('Q key advances pendingRotation counter-clockwise by 90° when a shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(270);

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(180);

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(90);

    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('W key does nothing when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = null;
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('Q key does nothing when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = null;
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('W key rotates the hovered pipe clockwise when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    expect(boardAccess.board.grid[0][1].rotation).toBe(0);

    hooks.selectedShape = null;
    hooks._input.mouseCanvasPos = { x: 96, y: 32 };
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'w' }));

    expect(boardAccess.board.grid[0][1].rotation).toBe(90);
    expect(hooks.pendingRotation).toBe(0);
  });

  it('Q key rotates the hovered pipe counter-clockwise when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    expect(boardAccess.board.grid[0][1].rotation).toBe(0);

    hooks.selectedShape = null;
    hooks._input.mouseCanvasPos = { x: 96, y: 32 };
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'q' }));

    expect(boardAccess.board.grid[0][1].rotation).toBe(270);
    expect(hooks.pendingRotation).toBe(0);
  });

  it('wheel scroll down advances pendingRotation clockwise', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Elbow;

    hooks._input._handleCanvasWheel(new WheelEvent('wheel', { deltaY: 1 }));
    expect(hooks.pendingRotation).toBe(90);
  });

  it('wheel scroll up advances pendingRotation counter-clockwise', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Elbow;

    hooks._input._handleCanvasWheel(new WheelEvent('wheel', { deltaY: -1 }));
    expect(hooks.pendingRotation).toBe(270);
  });

  it('wheel scroll does nothing when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = null;

    hooks._input._handleCanvasWheel(new WheelEvent('wheel', { deltaY: 1 }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('places tile at pendingRotation and records it in lastPlacedRotations', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;

    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Placed tile should have rotation 90
    const placedGame = game as unknown as { board: { grid: { rotation: number }[][] } };
    expect(placedGame.board.grid[0][1].rotation).toBe(90);

    // lastPlacedRotations should record 90 for Straight
    expect(hooks._input.lastPlacedRotations.get(PipeShape.Straight)).toBe(90);
  });

  it('restores lastPlacedRotations when re-selecting a shape', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Manually set a remembered rotation
    hooks._input.lastPlacedRotations.set(PipeShape.Elbow, 180);

    // Select Elbow from inventory (simulate what _handleInventoryClick does)
    hooks.selectedShape = null;
    // Use the inventory bar click mechanism by directly calling the method via hooks
    (game as unknown as { _input: { handleInventoryClick(s: PipeShape, n: number): void } })
      ._input.handleInventoryClick(PipeShape.Elbow, 2);

    expect(hooks.selectedShape).toBe(PipeShape.Elbow);
    expect(hooks.pendingRotation).toBe(180);
  });
});

// ─── Tests: board.placeInventoryTile with rotation ───────────────────────────


// ─── Tests: undoLastMove ──────────────────────────────────────────────────────

describe('Game – undoLastMove', () => {
  it('undoLastMove() hides the gameover modal and resumes playing when a snapshot exists', () => {
    const { game, gameoverModalEl } = makeGame();
    game.startLevel(1);

    // Access board and record a move so that canUndo() returns true
    const boardAccess = game as unknown as { board: Board; gameState: GameState };
    boardAccess.board.recordMove();

    // Simulate game-over state (as _checkWinLose would set)
    boardAccess.gameState = GameState.GameOver;
    gameoverModalEl.style.display = 'flex';

    game.undoLastMove();

    expect(boardAccess.gameState).toBe(GameState.Playing);
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('undoLastMove() does nothing when there is no snapshot', () => {
    const { game, gameoverModalEl } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };
    boardAccess.gameState = GameState.GameOver;
    gameoverModalEl.style.display = 'flex';

    // No recordMove() called after startLevel → canUndo() is false
    game.undoLastMove();

    // State should be unchanged
    expect(boardAccess.gameState).toBe(GameState.GameOver);
    expect(gameoverModalEl.style.display).toBe('flex');
  });

  it('undoLastMove() from the game-over modal restores to the last valid state, not one step further back', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Place a tile at (0,1) – this is move S1 (successful, still playing)
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Verify tile was placed (board is now in state S1)
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);

    // Simulate a second (failing) move: recordMove() saves S2, then
    // discardLastMoveFromHistory() immediately removes it (as _afterTilePlaced does
    // when a move causes game-over).  _historyIndex now points at S1.
    boardAccess.board.recordMove();
    boardAccess.board.discardLastMoveFromHistory();
    boardAccess.gameState = GameState.GameOver;

    expect(boardAccess.board.canUndo()).toBe(true);

    game.undoLastMove();

    // Should be restored to S1 (tile at 0,1 still present), NOT to S0 (empty board).
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);
    expect(boardAccess.gameState).toBe(GameState.Playing);
  });
});

// ─── Tests: tile connection animations ───────────────────────────────────────

describe('Game – tile connection animations (_spawnConnectionAnimations)', () => {
  it('spawns a "-1" animation when a regular pipe becomes newly connected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Level 1: Source(0,0) connects East and South.
    // Place a Straight (N-S) at (1,0) → connects North back to Source's South opening.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;       // N-S orientation

    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 96 }));

    const waterAnims = hooks._animMgr.animations.filter((a) => a.text === '-1💧');
    expect(waterAnims.length).toBeGreaterThanOrEqual(1);
    expect(waterAnims[0].color).toBe(ANIM_NEGATIVE_COLOR);
  });

  it('spawns a positive animation when a Chamber-tank becomes newly connected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Level 1: Chamber-tank at (3,0) capacity=5, connects North only.
    // Build the path to connect it:
    //   Place Straight N-S at (1,0), Straight N-S at (2,0)
    // This will connect Source(0,0)→(1,0)→(2,0)→Chamber-tank(3,0).

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 96 }));

    // Clear animations from step 1 so we can inspect only step 2 results
    hooks._animMgr.animations.length = 0;

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 160 }));

    // The Chamber-tank at (3,0) should now be newly connected → +5 animation
    const tankAnims = hooks._animMgr.animations.filter((a) => a.text === '+5💧');
    expect(tankAnims.length).toBeGreaterThanOrEqual(1);
    expect(tankAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
  });

  it('spawns a zero-color animation when a Chamber-tank with capacity 0 becomes connected', () => {
    // Directly exercise _spawnConnectionAnimations via a board with a chamber-tank capacity=0
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Manually set the chamber at (3,0) capacity to 0 to test gray color
    const boardAccess = game as unknown as { board: Board };
    boardAccess.board.grid[3][0].capacity = 0;

    // Connect path: (1,0) and (2,0)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 96 }));

    hooks._animMgr.animations.length = 0;

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 160 }));

    const tankAnims = hooks._animMgr.animations.filter((a) => a.text === '+0💧');
    expect(tankAnims.length).toBeGreaterThanOrEqual(1);
    expect(tankAnims[0].color).toBe(ANIM_ZERO_COLOR);
  });

  it('spawns a "-0" animation when a Chamber-dirt with cost 0 becomes connected', () => {
    // Level 2: Source(0,0) connects East; Dirt at (0,2,E-W,cost=2).
    // Set cost to 0 to verify the "-0" label (not "+0").
    const { game } = makeGame();
    game.startLevel(2);
    const hooks = gameHooks(game);

    const boardAccess = game as unknown as { board: Board };
    boardAccess.board.grid[0][2].cost = 0;

    // Place Straight E-W at (0,1) to connect Source → Dirt(0,2).
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90; // E-W
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    const dirtAnims = hooks._animMgr.animations.filter((a) => a.text === '-0💧');
    expect(dirtAnims.length).toBeGreaterThanOrEqual(1);
    expect(dirtAnims[0].color).toBe(ANIM_ZERO_COLOR);
  });

  it('spawns a "-0" animation when a Chamber-ice becomes connected at zero cost', () => {
    // Level 6 has Ice tiles at (1,2) and (1,3) with threshold=2.
    // After connecting the Heater at (1,1), currentTemp=2.
    // Ice(1,2) with thresh=2: deltaTemp=max(0,2−2)=0 → val=0 → should show "-0".
    const { game } = makeGame();
    game.startLevel(6);
    const hooks = gameHooks(game);

    // Place Tee E-S-W at (0,1) to connect Heater(1,1), raising temp to 2.
    // Tee base connections are N-E-S; at rotation=90 they become E-S-W.
    hooks.selectedShape = PipeShape.Tee;
    hooks.pendingRotation = 90; // E-S-W
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    hooks._animMgr.animations.length = 0;

    // Place Tee E-S-W at (0,2) to connect Ice(1,2) with currentTemp=2 (free).
    hooks.selectedShape = PipeShape.Tee;
    hooks.pendingRotation = 90; // E-S-W
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 160, clientY: 32 }));

    const iceAnims = hooks._animMgr.animations.filter((a) => a.text === '-0💧');
    expect(iceAnims.length).toBeGreaterThanOrEqual(1);
    expect(iceAnims[0].color).toBe(ANIM_ZERO_COLOR);
  });

  it('spawns no animation for a tile that was already in the fill path', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place first pipe at (1,0) to connect it
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 96 }));

    const animCountAfterFirstPlacement = hooks._animMgr.animations.length;

    // Rotating the source tile (it's fixed so rotate is a no-op) changes no fill state.
    // No new tiles become connected, so no new animations should be created.
    hooks.selectedShape = null;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 32 }));

    // The animation list should not have grown (no new tiles entered the fill path)
    expect(hooks._animMgr.animations.length).toBeLessThanOrEqual(animCountAfterFirstPlacement);
  });
});

// ─── Tests: fail condition takes precedence over win ─────────────────────────

