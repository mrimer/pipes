/**
 * @jest-environment jsdom
 */

import { Game } from './game';
import { PipeShape } from './types';

// ─── Canvas mock ──────────────────────────────────────────────────────────────

const MOCK_CTX = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  lineCap: '',
  font: '',
  textAlign: '',
  textBaseline: '',
  globalAlpha: 1,
  fillRect:   jest.fn(),
  strokeRect: jest.fn(),
  clearRect:  jest.fn(),
  beginPath:  jest.fn(),
  moveTo:     jest.fn(),
  lineTo:     jest.fn(),
  stroke:     jest.fn(),
  fill:       jest.fn(),
  arc:        jest.fn(),
  translate:  jest.fn(),
  rotate:     jest.fn(),
  save:       jest.fn(),
  restore:    jest.fn(),
  fillText:   jest.fn(),
};

// Stub out requestAnimationFrame so _loop() never fires.
beforeAll(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => MOCK_CTX,
    configurable: true,
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal DOM and return a fully wired-up Game instance. */
function makeGame(): {
  game: Game;
  levelSelectEl: HTMLElement;
  playScreenEl: HTMLElement;
  winModalEl: HTMLElement;
  gameoverModalEl: HTMLElement;
} {
  document.body.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="level-select">
      <h2>Select a Level</h2>
      <div id="level-list"></div>
    </div>
    <div id="play-screen">
      <span id="water-display"></span>
      <div id="inventory-bar"></div>
      <button id="undo-btn"></button>
      <button id="redo-btn"></button>
    </div>
    <div id="win-modal"></div>
    <div id="gameover-modal"><p id="gameover-msg"></p></div>
  `;

  const get = (id: string) => document.getElementById(id) as HTMLElement;

  const levelSelectEl  = get('level-select');
  const levelListEl    = get('level-list');
  const playScreenEl   = get('play-screen');
  const inventoryBarEl = get('inventory-bar');
  const waterDisplayEl = get('water-display');
  const winModalEl     = get('win-modal');
  const gameoverModalEl = get('gameover-modal');
  const gameoverMsgEl  = get('gameover-msg');
  const undoBtnEl      = get('undo-btn') as HTMLButtonElement;
  const redoBtnEl      = get('redo-btn') as HTMLButtonElement;

  const canvas = get('game-canvas') as HTMLCanvasElement;

  const game = new Game(
    canvas,
    levelSelectEl,
    levelListEl,
    playScreenEl,
    inventoryBarEl,
    waterDisplayEl,
    winModalEl,
    gameoverModalEl,
    gameoverMsgEl,
    undoBtnEl,
    redoBtnEl,
  );

  return { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Game – screen transitions', () => {
  it('shows the level-select screen and hides all other screens on startup', () => {
    const { levelSelectEl, playScreenEl, winModalEl, gameoverModalEl } = makeGame();

    expect(levelSelectEl.style.display).toBe('flex');
    expect(playScreenEl.style.display).toBe('none');
    expect(winModalEl.style.display).toBe('none');
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('shows the play screen and hides level-select when a level starts', () => {
    const { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl } = makeGame();

    game.startLevel(1);

    expect(playScreenEl.style.display).toBe('flex');
    expect(levelSelectEl.style.display).toBe('none');
    expect(winModalEl.style.display).toBe('none');
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('returns to level-select and hides play screen when exitToMenu is called', () => {
    const { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl } = makeGame();

    game.startLevel(1);
    game.exitToMenu();

    expect(levelSelectEl.style.display).toBe('flex');
    expect(playScreenEl.style.display).toBe('none');
    expect(winModalEl.style.display).toBe('none');
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('hides the win modal and shows the level-select when exitToMenu is called after a win', () => {
    const { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl } = makeGame();

    game.startLevel(1);
    // Simulate win modal appearing (as _checkWinLose would do)
    winModalEl.style.display = 'flex';

    game.exitToMenu();

    expect(levelSelectEl.style.display).toBe('flex');
    expect(playScreenEl.style.display).toBe('none');
    expect(winModalEl.style.display).toBe('none');
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('hides the gameover modal and shows the level-select when exitToMenu is called', () => {
    const { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl } = makeGame();

    game.startLevel(1);
    // Simulate gameover modal appearing
    gameoverModalEl.style.display = 'flex';

    game.exitToMenu();

    expect(levelSelectEl.style.display).toBe('flex');
    expect(playScreenEl.style.display).toBe('none');
    expect(winModalEl.style.display).toBe('none');
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('retryLevel restarts the level from the win modal without showing the level-select', () => {
    const { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl } = makeGame();

    game.startLevel(1);
    winModalEl.style.display = 'flex';

    game.retryLevel();

    expect(playScreenEl.style.display).toBe('flex');
    expect(levelSelectEl.style.display).toBe('none');
    expect(winModalEl.style.display).toBe('none');
    expect(gameoverModalEl.style.display).toBe('none');
  });
});

// ─── Type helper for accessing Game private members in tests ──────────────────

/** Typed view of Game internals needed for testing. */
type GameTestHooks = {
  selectedShape: PipeShape | null;
  pendingRotation: number;
  lastPlacedRotations: Map<PipeShape, number>;
  focusPos: { row: number; col: number };
  completedLevels: Set<number>;
  resetConfirmModalEl: HTMLElement;
  _handleKey(e: KeyboardEvent): void;
  _handleCanvasWheel(e: WheelEvent): void;
  _renderLevelList(): void;
};

function gameHooks(g: Game): GameTestHooks {
  return g as unknown as GameTestHooks;
}

// ─── Tests: inventory selection kept after placement ──────────────────────────

describe('Game – inventory selection kept when stock remains', () => {
  it('keeps selectedShape after placement when effective count is still > 0', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Level 1 has Straight ×4 in inventory – select it and place at empty (0,1)
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // 3 Straight pipes remain → selection should be kept
    expect(hooks.selectedShape).toBe(PipeShape.Straight);
  });

  it('clears selectedShape after placement when effective count drops to 0', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Level 1 has Tee ×1 in inventory – select it and place at empty (0,1)
    hooks.selectedShape = PipeShape.Tee;
    hooks.focusPos = { row: 0, col: 1 };

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // 0 Tee pipes remain → selection should be cleared
    expect(hooks.selectedShape).toBeNull();
  });
});

// ─── Tests: inventory bar updates on tile rotation ────────────────────────────

describe('Game – inventory bar re-renders on tile rotation', () => {
  it('calls _renderInventoryBar when a non-empty tile is rotated via keyboard', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const renderSpy = jest.spyOn(game as unknown as { _renderInventoryBar(): void }, '_renderInventoryBar');

    const hooks = gameHooks(game);
    hooks.selectedShape = null;
    // (1,1) is a fixed Straight tile in level 1
    hooks.focusPos = { row: 1, col: 1 };

    // Enter with no selected shape rotates the focused tile
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(renderSpy).toHaveBeenCalled();
  });
});

// ─── Tests: reset progress ────────────────────────────────────────────────────

describe('Game – reset progress', () => {
  it('renders a reset progress button in the level list', () => {
    makeGame();
    const levelListEl = document.getElementById('level-list')!;
    const buttons = levelListEl.querySelectorAll('button');
    const resetBtn = Array.from(buttons).find((b) => b.textContent?.includes('Reset Progress'));
    expect(resetBtn).toBeTruthy();
  });

  it('shows the reset confirm modal when the reset button is clicked', () => {
    const { game } = makeGame();
    const levelListEl = document.getElementById('level-list')!;
    const resetBtn = Array.from(levelListEl.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Progress'))!;

    resetBtn.click();

    expect(gameHooks(game).resetConfirmModalEl.style.display).toBe('flex');
  });

  it('hides the reset confirm modal when cancel is clicked', () => {
    const { game } = makeGame();
    const levelListEl = document.getElementById('level-list')!;
    const resetBtn = Array.from(levelListEl.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Progress'))!;
    resetBtn.click();

    const modal = gameHooks(game).resetConfirmModalEl;
    const cancelBtn = Array.from(modal.querySelectorAll('button'))
      .find((b) => b.textContent === 'Cancel')! as HTMLButtonElement;
    cancelBtn.click();

    expect(modal.style.display).toBe('none');
  });

  it('clears completed levels and re-renders level list when reset is confirmed', () => {
    const { game } = makeGame();
    const hooks = gameHooks(game);

    // Mark level 1 as completed internally, then re-render
    hooks.completedLevels.add(1);
    hooks._renderLevelList();

    const levelListEl = document.getElementById('level-list')!;
    const resetBtn = Array.from(levelListEl.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Progress'))!;
    resetBtn.click();

    const modal = hooks.resetConfirmModalEl;
    const confirmBtn = Array.from(modal.querySelectorAll('button'))
      .find((b) => b.textContent === 'Reset')! as HTMLButtonElement;
    confirmBtn.click();

    // Completed levels should be cleared
    expect(hooks.completedLevels.size).toBe(0);
    // The first level button should no longer have the 'completed' class
    const firstLevelBtn = levelListEl.querySelector('.level-btn');
    expect(firstLevelBtn?.classList.contains('completed')).toBe(false);
  });
});

// ─── Tests: pendingRotation and placement orientation ─────────────────────────

describe('Game – pending rotation', () => {
  it('initialises pendingRotation to 0 when starting a level', () => {
    const { game } = makeGame();
    game.startLevel(1);
    expect(gameHooks(game).pendingRotation).toBe(0);
  });

  it('Tab key advances pendingRotation by 90° when a shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(hooks.pendingRotation).toBe(90);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(hooks.pendingRotation).toBe(180);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(hooks.pendingRotation).toBe(270);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('Tab key does nothing when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = null;
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('wheel scroll down advances pendingRotation clockwise', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Elbow;

    hooks._handleCanvasWheel(new WheelEvent('wheel', { deltaY: 1 }));
    expect(hooks.pendingRotation).toBe(90);
  });

  it('wheel scroll up advances pendingRotation counter-clockwise', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Elbow;

    hooks._handleCanvasWheel(new WheelEvent('wheel', { deltaY: -1 }));
    expect(hooks.pendingRotation).toBe(270);
  });

  it('wheel scroll does nothing when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = null;

    hooks._handleCanvasWheel(new WheelEvent('wheel', { deltaY: 1 }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('places tile at pendingRotation and records it in lastPlacedRotations', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Placed tile should have rotation 90
    const placedGame = game as unknown as { board: { grid: { rotation: number }[][] } };
    expect(placedGame.board.grid[0][1].rotation).toBe(90);

    // lastPlacedRotations should record 90 for Straight
    expect(hooks.lastPlacedRotations.get(PipeShape.Straight)).toBe(90);
  });

  it('restores lastPlacedRotations when re-selecting a shape', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Manually set a remembered rotation
    hooks.lastPlacedRotations.set(PipeShape.Elbow, 180);

    // Select Elbow from inventory (simulate what _handleInventoryClick does)
    hooks.selectedShape = null;
    // Use the inventory bar click mechanism by directly calling the method via hooks
    (game as unknown as { _handleInventoryClick(s: PipeShape, n: number): void })
      ._handleInventoryClick(PipeShape.Elbow, 2);

    expect(hooks.selectedShape).toBe(PipeShape.Elbow);
    expect(hooks.pendingRotation).toBe(180);
  });
});

// ─── Tests: board.placeInventoryTile with rotation ───────────────────────────


// ─── Tests: undoLastMove ──────────────────────────────────────────────────────

import { Board } from './board';
import { GameState } from './types';

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

  it('undoLastMove() restores the board grid to its pre-move state', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Place a tile via keyboard (records move automatically)
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Verify the tile was placed
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);

    // Simulate game-over
    boardAccess.gameState = GameState.GameOver;

    game.undoLastMove();

    // The placed tile should be gone
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Empty);
  });
});
