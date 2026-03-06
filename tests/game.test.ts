/**
 * @jest-environment jsdom
 */

import { Game } from '../src/game';
import { LevelDef, PipeShape } from '../src/types';
import { LEVELS } from '../src/levels';

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
  exitBtnEl: HTMLButtonElement;
} {
  document.body.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="level-select">
      <h2>Select a Level</h2>
      <div id="level-list"></div>
    </div>
    <div id="play-screen">
      <div id="level-header"></div>
      <span id="water-display"></span>
      <div id="inventory-bar"></div>
      <button id="undo-btn"></button>
      <button id="redo-btn"></button>
      <button id="exit-btn">← Menu</button>
    </div>
    <div id="win-modal"><button id="win-menu-btn">Level Select</button></div>
    <div id="gameover-modal"><p id="gameover-msg"></p><button id="gameover-menu-btn">Level Select</button></div>
  `;

  const get = (id: string) => document.getElementById(id) as HTMLElement;

  const levelSelectEl  = get('level-select');
  const levelListEl    = get('level-list');
  const playScreenEl   = get('play-screen');
  const levelHeaderEl  = get('level-header');
  const inventoryBarEl = get('inventory-bar');
  const waterDisplayEl = get('water-display');
  const winModalEl     = get('win-modal');
  const gameoverModalEl = get('gameover-modal');
  const gameoverMsgEl  = get('gameover-msg');
  const undoBtnEl      = get('undo-btn') as HTMLButtonElement;
  const redoBtnEl      = get('redo-btn') as HTMLButtonElement;
  const exitBtnEl      = get('exit-btn') as HTMLButtonElement;

  const canvas = get('game-canvas') as HTMLCanvasElement;

  const game = new Game(
    canvas,
    levelSelectEl,
    levelListEl,
    playScreenEl,
    levelHeaderEl,
    inventoryBarEl,
    waterDisplayEl,
    winModalEl,
    gameoverModalEl,
    gameoverMsgEl,
    undoBtnEl,
    redoBtnEl,
    exitBtnEl,
  );

  return { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl, exitBtnEl };
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

// ─── Tests: playtest mode button labels ───────────────────────────────────────

describe('Game – playtest mode button labels', () => {
  it('changes exit button text to "← Edit" when playtesting from the editor', () => {
    const { game, exitBtnEl } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);

    expect(exitBtnEl.textContent).toBe('← Edit');
  });

  it('resets exit button text to "← Menu" when exitToMenu is called after playtesting', () => {
    const { game, exitBtnEl } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);
    game.exitToMenu();

    expect(exitBtnEl.textContent).toBe('← Menu');
  });
});

// ─── Tests: undo winning move ─────────────────────────────────────────────────

describe('Game – undoWinningMove', () => {
  it('hides the win modal when undoWinningMove is called after a move was made', () => {
    const { game, winModalEl } = makeGame();

    game.startLevel(1);
    // Simulate a move being recorded so that canUndo() returns true, as it would
    // after the player makes the winning move.
    gameHooks(game).board!.recordMove();
    winModalEl.style.display = 'flex';

    game.undoWinningMove();

    expect(winModalEl.style.display).toBe('none');
  });

  it('does not throw when undoWinningMove is called with no history', () => {
    const { game } = makeGame();

    game.startLevel(1);
    // No moves made, so canUndo() returns false – method should be a no-op.
    expect(() => game.undoWinningMove()).not.toThrow();
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
  board: { recordMove(): void; canUndo(): boolean; undoMove(): void } | null;
  _animations: { x: number; y: number; text: string; color: string }[];
  _handleKey(e: KeyboardEvent): void;
  _handleCanvasRightClick(e: MouseEvent): void;
  _handleCanvasWheel(e: WheelEvent): void;
  _renderLevelList(): void;
  _playtestLevel(level: LevelDef): void;
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

// ─── Tests: deselect when container bonus is removed ──────────────────────────

describe('Game – deselect when effective count drops to zero after reclaim', () => {
  it('clears selectedShape when reclaiming a tile removes the last container-granted bonus', () => {
    const { game } = makeGame();
    game.startLevel(3); // Level 3: ItemContainer at (0,2) grants 1×GoldStraight when filled

    const hooks = gameHooks(game);

    // Place Straight at (0,1) so Source→Straight→ItemContainer path is filled,
    // granting GoldStraight (effectiveCount: 0 base + 1 bonus = 1)
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Select GoldStraight – it is now available via the container bonus
    hooks.selectedShape = PipeShape.GoldStraight;

    // Right-click at (0,1) to reclaim the Straight; this disconnects the container,
    // so GoldStraight's effective count drops back to 0.
    // TILE_SIZE=64: col 1 → clientX 96, row 0 → clientY 32.
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    // GoldStraight effective count is now 0 → selection must be cleared
    expect(hooks.selectedShape).toBeNull();
  });
});

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

import { Board } from '../src/board';
import { Tile } from '../src/tile';
import { GameState } from '../src/types';
import { renderInventoryBar } from '../src/inventoryRenderer';

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

// ─── Tests: tile connection animations ───────────────────────────────────────

import { ANIM_NEGATIVE_COLOR, ANIM_POSITIVE_COLOR, ANIM_ZERO_COLOR } from '../src/tileAnimation';

describe('Game – tile connection animations (_spawnConnectionAnimations)', () => {
  it('spawns a "-1" animation when a regular pipe becomes newly connected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Level 1: Source(0,0) connects East and South.
    // Place a Straight (N-S) at (1,0) → connects North back to Source's South opening.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;       // N-S orientation
    hooks.focusPos = { row: 1, col: 0 };

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    const waterAnims = hooks._animations.filter((a) => a.text === '-1');
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
    hooks.focusPos = { row: 1, col: 0 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Clear animations from step 1 so we can inspect only step 2 results
    hooks._animations.length = 0;

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks.focusPos = { row: 2, col: 0 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // The Chamber-tank at (3,0) should now be newly connected → +5 animation
    const tankAnims = hooks._animations.filter((a) => a.text === '+5');
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
    hooks.focusPos = { row: 1, col: 0 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    hooks._animations.length = 0;

    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks.focusPos = { row: 2, col: 0 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    const tankAnims = hooks._animations.filter((a) => a.text === '+0');
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
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    const dirtAnims = hooks._animations.filter((a) => a.text === '-0');
    expect(dirtAnims.length).toBeGreaterThanOrEqual(1);
    expect(dirtAnims[0].color).toBe(ANIM_NEGATIVE_COLOR);
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
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    hooks._animations.length = 0;

    // Place Tee E-S-W at (0,2) to connect Ice(1,2) with currentTemp=2 (free).
    hooks.selectedShape = PipeShape.Tee;
    hooks.pendingRotation = 90; // E-S-W
    hooks.focusPos = { row: 0, col: 2 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    const iceAnims = hooks._animations.filter((a) => a.text === '-0');
    expect(iceAnims.length).toBeGreaterThanOrEqual(1);
    expect(iceAnims[0].color).toBe(ANIM_NEGATIVE_COLOR);
  });

  it('spawns no animation for a tile that was already in the fill path', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place first pipe at (1,0) to connect it
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks.focusPos = { row: 1, col: 0 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    const animCountAfterFirstPlacement = hooks._animations.length;

    // Rotating the source tile (it's fixed so rotate is a no-op) changes no fill state.
    // No new tiles become connected, so no new animations should be created.
    hooks.selectedShape = null;
    hooks.focusPos = { row: 0, col: 0 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // The animation list should not have grown (no new tiles entered the fill path)
    expect(hooks._animations.length).toBeLessThanOrEqual(animCountAfterFirstPlacement);
  });
});

// ─── Tests: fail condition takes precedence over win ─────────────────────────

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

  it('results in Won when water is zero and sink is reached', () => {
    const { game, winModalEl, gameoverModalEl } = makeGame();
    game.startLevel(1);

    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Water exactly 0 but sink reached → should be a win (not fail)
    jest.spyOn(boardAccess.board, 'isSolved').mockReturnValue(true);
    jest.spyOn(boardAccess.board, 'getCurrentWater').mockReturnValue(0);

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

// ─── Tests: renderInventoryBar – bonus shapes absent from board.inventory ────

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

// ─── Tests: _positionModalBelowCanvas ────────────────────────────────────────

describe('Game – _positionModalBelowCanvas', () => {
  /** Call the private helper directly. */
  function positionModal(game: Game, modalEl: HTMLElement): void {
    (game as unknown as { _positionModalBelowCanvas(el: HTMLElement): void })
      ._positionModalBelowCanvas(modalEl);
  }

  /** Build a minimal DOMRect stub with the given bottom and height. */
  function mockCanvasRect(bottom: number, height: number): DOMRect {
    return { bottom, height, top: bottom - height, left: 0, right: 0, width: 0, x: 0, y: bottom - height, toJSON: () => ({}) } as DOMRect;
  }

  it('positions the modal below the canvas when there is enough vertical space', () => {
    const { game } = makeGame();
    game.startLevel(1);

    // Canvas bottom at 100 px; viewport height 800 px → 700 px of space below
    jest.spyOn(game['canvas'], 'getBoundingClientRect').mockReturnValue(mockCanvasRect(100, 100));
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const modal = document.createElement('div');
    modal.style.display = 'flex';
    positionModal(game, modal);

    expect(modal.style.alignItems).toBe('flex-start');
    // paddingTop should equal canvasBottom (100) + MARGIN (16) = '116px'
    expect(modal.style.paddingTop).toBe('116px');
  });

  it('keeps the default centred layout when there is not enough space below the canvas', () => {
    const { game } = makeGame();
    game.startLevel(1);

    // Canvas bottom at 700 px; viewport height 800 px → only 100 px of space below (< 236)
    jest.spyOn(game['canvas'], 'getBoundingClientRect').mockReturnValue(mockCanvasRect(700, 700));
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const modal = document.createElement('div');
    modal.style.display = 'flex';
    positionModal(game, modal);

    // Not enough room → styles are reset to empty strings (browser uses CSS default)
    expect(modal.style.alignItems).toBe('');
    expect(modal.style.paddingTop).toBe('');
  });

  it('resets stale positioning styles before re-evaluating', () => {
    const { game } = makeGame();
    game.startLevel(1);

    // First call: plenty of space → sets alignItems / paddingTop
    jest.spyOn(game['canvas'], 'getBoundingClientRect').mockReturnValue(mockCanvasRect(50, 50));
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

    const modal = document.createElement('div');
    modal.style.display = 'flex';
    positionModal(game, modal);
    expect(modal.style.alignItems).toBe('flex-start');

    // Second call: no space → previous styles must be cleared
    jest.spyOn(game['canvas'], 'getBoundingClientRect').mockReturnValue(mockCanvasRect(780, 780));
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    positionModal(game, modal);
    expect(modal.style.alignItems).toBe('');
    expect(modal.style.paddingTop).toBe('');
  });
});
