/**
 * @jest-environment jsdom
 */

import { Game } from '../src/game';
import { LevelDef, PipeShape, CampaignDef } from '../src/types';
import { LEVELS, CHAPTERS } from './levels';
import { saveImportedCampaigns, loadActiveCampaignId } from '../src/persistence';

// Make spawnConfetti synchronous in tests by immediately invoking the onComplete callback.
jest.mock('../src/confetti', () => ({
  spawnConfetti: (onComplete?: () => void) => { if (onComplete) onComplete(); },
  clearConfetti: jest.fn(),
}));

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
  ellipse:    jest.fn(),
  translate:  jest.fn(),
  rotate:     jest.fn(),
  save:       jest.fn(),
  restore:    jest.fn(),
  fillText:   jest.fn(),
  strokeText: jest.fn(),
  quadraticCurveTo: jest.fn(),
  rect:       jest.fn(),
  clip:       jest.fn(),
  scale:      jest.fn(),
  closePath:  jest.fn(),
};

// Stub out requestAnimationFrame so _loop() never fires.
beforeAll(() => {
  // Keep TILE_SIZE at 64 for tests by simulating a small viewport.
  Object.defineProperty(window, 'innerWidth',  { value: 0, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true });
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
  winNextBtnEl: HTMLButtonElement;
} {
  // Clear any previously saved state so the game starts without an active campaign.
  localStorage.clear();

  document.body.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="level-select">
      <h2>Select a Level</h2>
      <div id="level-list"></div>
    </div>
    <div id="play-screen">
      <div id="level-header"></div>
      <div id="water-display" class="stat-row"><span class="stat-label">💧 Water</span><span class="stat-value"></span></div>
      <div id="inventory-bar"></div>
      <button id="undo-btn"></button>
      <button id="redo-btn"></button>
      <button id="exit-btn">← Menu</button>
    </div>
    <div id="win-modal"><button id="win-next-btn">Next Level ▶</button><button id="win-menu-btn">Level Select</button></div>
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

  // Activate a test campaign using the original CHAPTERS reference so that
  // tests can mutate LEVELS objects and see the changes reflected in startLevel().
  const testCampaign: CampaignDef = {
    id: 'test-campaign',
    name: 'Test Campaign',
    author: 'Test',
    chapters: CHAPTERS,
  };
  saveImportedCampaigns([testCampaign]);
  gameHooks(game)._activateCampaign(testCampaign);

  return { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl, exitBtnEl,
    winNextBtnEl: get('win-next-btn') as HTMLButtonElement };
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

  it('hides the "Next Level" button in the win modal when playtesting from the editor', () => {
    const { game, winNextBtnEl } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);

    expect(winNextBtnEl.style.display).toBe('none');
  });

  it('restores the "Next Level" button visibility when exitToMenu is called after playtesting', () => {
    const { game, winNextBtnEl } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);
    game.exitToMenu();

    expect(winNextBtnEl.style.display).toBe('');
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
  _newChapterModalEl: HTMLElement;
  _challengeModalEl: HTMLElement;
  _challengeMsgEl: HTMLElement;
  _challengeSkipBtnEl: HTMLButtonElement;
  _exitConfirmModalEl: HTMLElement;
  _rulesModalEl: HTMLElement;
  _pendingLevelId: number | null;
  board: { recordMove(): void; canUndo(): boolean; undoMove(): void } | null;
  _animations: { x: number; y: number; text: string; color: string }[];
  _playtestExitCallback: (() => void) | null;
  _activeCampaign: unknown;
  _activeCampaignProgress: Set<number>;
  ctrlHeld: boolean;
  shiftHeld: boolean;
  mouseCanvasPos: { x: number; y: number } | null;
  tooltipEl: HTMLElement;
  _handleKey(e: KeyboardEvent): void;
  _handleCanvasClick(e: MouseEvent): void;
  _handleCanvasRightClick(e: MouseEvent): void;
  _handleCanvasWheel(e: WheelEvent): void;
  _handleCanvasMouseMove(e: MouseEvent): void;
  _handleDocKeyDown(e: KeyboardEvent): void;
  _handleDocKeyUp(e: KeyboardEvent): void;
  _handleInventoryClick(shape: PipeShape, count: number): void;
  _markLevelCompleted(levelId: number): void;
  _renderLevelList(): void;
  _playtestLevel(level: LevelDef): void;
  _activateCampaign(campaign: unknown): void;
  gameState: string;
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

// ─── Tests: pending rotation syncs on tile click-rotate ───────────────────────

describe('Game – pendingRotation syncs when rotating a tile whose shape is selected', () => {
  it('updates pendingRotation to match the new tile rotation after a click-rotate', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Place a Straight tile at (0,1) with rotation=0 using Enter key.
    // (0,1) is an empty cell in level 1; inventory has Straight×4.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Now select Straight again with pendingRotation=0 matching the placed tile.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;

    // TILE_SIZE=64: col 1 → clientX 96, row 0 → clientY 32.
    hooks._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // The tile rotated from 0→90, so pendingRotation must follow.
    expect(hooks.pendingRotation).toBe(90);
  });

  it('leaves pendingRotation unchanged when selectedShape is null', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Place a Straight tile at (0,1) first.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Now deselect the inventory item.
    hooks.selectedShape = null;
    hooks.pendingRotation = 0;

    // Click the placed Straight at (0,1) to rotate it (no inventory item selected).
    hooks._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // pendingRotation must remain 0 (selectedShape is null, no sync).
    expect(hooks.pendingRotation).toBe(0);
  });
});

// ─── Tests: Shift key cycles inventory selection ──────────────────────────────

describe('Game – Shift key cycles to next available inventory item', () => {
  function pressShift(hooks: GameTestHooks): void {
    // Simulate a fresh keydown (shiftHeld starts false so the cycle fires).
    hooks.shiftHeld = false;
    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Shift' }));
  }

  it('selects the first available item when nothing is selected', () => {
    const { game } = makeGame();
    game.startLevel(1); // inventory: Straight×4, Elbow×1, Tee×1, Cross×1

    const hooks = gameHooks(game);
    hooks.selectedShape = null;

    pressShift(hooks);

    expect(hooks.selectedShape).toBe(PipeShape.Straight);
  });

  it('advances to the next available item', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;

    pressShift(hooks);

    expect(hooks.selectedShape).toBe(PipeShape.Elbow);
  });

  it('wraps around to the first item after the last', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Cross; // last item in level-1 inventory

    pressShift(hooks);

    expect(hooks.selectedShape).toBe(PipeShape.Straight); // back to first
  });

  it('skips items with effective count 0', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    // Exhaust Elbow by placing it (only ×1 available).
    hooks.selectedShape = PipeShape.Elbow;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    // Elbow is now depleted; selection was auto-cleared.
    expect(hooks.selectedShape).toBeNull();

    // Start cycling from Straight (first item).
    hooks.selectedShape = PipeShape.Straight;
    pressShift(hooks); // should skip depleted Elbow and land on Tee
    expect(hooks.selectedShape).toBe(PipeShape.Tee);
  });

  it('does nothing when no inventory items are available', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Drain all inventory by placing pieces via board directly.
    const board = hooks.board as unknown as { inventory: { shape: PipeShape; count: number }[] };
    for (const item of board.inventory) item.count = 0;

    hooks.selectedShape = null;
    pressShift(hooks);

    expect(hooks.selectedShape).toBeNull();
  });

  it('does nothing when game is not in Playing state', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    hooks.gameState = 'Won'; // simulate won state
    hooks.selectedShape = null;

    pressShift(hooks);

    expect(hooks.selectedShape).toBeNull();
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
    hooks._activeCampaignProgress.add(1);
    hooks._renderLevelList();

    const levelListEl = document.getElementById('level-list')!;
    const resetBtn = Array.from(levelListEl.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Progress'))!;
    resetBtn.click();

    const modal = hooks.resetConfirmModalEl;
    const confirmBtn = Array.from(modal.querySelectorAll('button'))
      .find((b) => b.textContent === 'Reset')! as HTMLButtonElement;
    confirmBtn.click();

    // Campaign progress should be cleared
    expect(hooks._activeCampaignProgress.size).toBe(0);
    // The first level button should no longer have the 'completed' class
    const firstLevelBtn = levelListEl.querySelector('.level-btn');
    expect(firstLevelBtn?.classList.contains('completed')).toBe(false);
  });
});

// ─── Tests: level-select chapter numbering ────────────────────────────────────

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
  it('initialises pendingRotation to 0 when starting a level', () => {
    const { game } = makeGame();
    game.startLevel(1);
    expect(gameHooks(game).pendingRotation).toBe(0);
  });

  it('W key advances pendingRotation clockwise by 90° when a shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(90);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(180);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(270);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('Q key advances pendingRotation counter-clockwise by 90° when a shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(270);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(180);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(90);

    hooks._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('W key does nothing when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = null;
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'w' }));
    expect(hooks.pendingRotation).toBe(0);
  });

  it('Q key does nothing when no shape is selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.selectedShape = null;
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'q' }));
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
    expect(iceAnims[0].color).toBe(ANIM_ZERO_COLOR);
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

  it('positions the modal near the bottom of the screen', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const modal = document.createElement('div');
    modal.style.display = 'flex';
    positionModal(game, modal);

    expect(modal.style.alignItems).toBe('flex-end');
    expect(modal.style.paddingBottom).toBe('16px');
  });

  it('always uses bottom positioning regardless of canvas position', () => {
    const { game } = makeGame();
    game.startLevel(1);

    // Canvas bottom near the bottom of the viewport – modal still goes to bottom
    jest.spyOn(game['canvas'], 'getBoundingClientRect').mockReturnValue(mockCanvasRect(700, 700));
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const modal = document.createElement('div');
    modal.style.display = 'flex';
    positionModal(game, modal);

    expect(modal.style.alignItems).toBe('flex-end');
    expect(modal.style.paddingBottom).toBe('16px');
  });

  it('resets stale positioning styles before re-evaluating', () => {
    const { game } = makeGame();
    game.startLevel(1);

    // Simulate a stale paddingTop from a previous implementation
    const modal = document.createElement('div');
    modal.style.display = 'flex';
    modal.style.paddingTop = '116px';
    positionModal(game, modal);

    // paddingTop must be cleared; bottom layout applied
    expect(modal.style.paddingTop).toBe('');
    expect(modal.style.alignItems).toBe('flex-end');
    expect(modal.style.paddingBottom).toBe('16px');
  });
});

// ─── Tests: auto-select reclaimed tile when no shape is selected ──────────────

describe('Game – auto-select reclaimed tile when no shape is selected', () => {
  it('selects the reclaimed shape when no inventory shape was selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight (E-W, rotation=90) at (0,1), then deselect it
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    hooks.selectedShape = null;

    // Right-click at (0,1): TILE_SIZE=64 → col 1 → clientX 96, row 0 → clientY 32
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    expect(hooks.selectedShape).toBe(PipeShape.Straight);
  });

  it('sets pendingRotation to the reclaimed tile\'s rotation', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight (E-W, rotation=90) at (0,1), then deselect
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    hooks.selectedShape = null;

    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    expect(hooks.pendingRotation).toBe(90);
  });

  it('does not change selectedShape when a shape is already selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight at (0,1), keep Elbow selected
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Now select Elbow instead
    hooks.selectedShape = PipeShape.Elbow;

    // Right-click at (0,1) to reclaim the Straight
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    // Should still be Elbow, not Straight
    expect(hooks.selectedShape).toBe(PipeShape.Elbow);
  });
});

// ─── Tests: clicking already-selected inventory item keeps it selected ─────────

describe('Game – inventory click on already-selected item', () => {
  it('deselects selectedShape when clicking the already-selected item', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.selectedShape = PipeShape.Straight;
    hooks._handleInventoryClick(PipeShape.Straight, 4);

    expect(hooks.selectedShape).toBeNull();
  });

  it('changes selectedShape when clicking a different item', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.selectedShape = PipeShape.Straight;
    hooks._handleInventoryClick(PipeShape.Elbow, 2);

    expect(hooks.selectedShape).toBe(PipeShape.Elbow);
  });
});

// ─── Tests: 'R' key resets the level ─────────────────────────────────────────

describe('Game – R key resets the level', () => {
  it('restarts the level when R is pressed during play', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a tile to dirty the board state
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    const startLevelSpy = jest.spyOn(game, 'startLevel');
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'R' }));

    expect(startLevelSpy).toHaveBeenCalledWith(1);
  });

  it('also resets when lowercase r is pressed', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const startLevelSpy = jest.spyOn(game, 'startLevel');
    gameHooks(game)._handleKey(new KeyboardEvent('keydown', { key: 'r' }));

    expect(startLevelSpy).toHaveBeenCalledWith(1);
  });
});

// ─── Tests: Escape key returns to level select ────────────────────────────────

describe('Game – Escape key returns to level select', () => {
  it('shows the exit-confirm modal when Escape is pressed during play instead of immediately exiting', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const exitSpy = jest.spyOn(game, 'exitToMenu');
    const hooks = gameHooks(game);
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Esc during active play now shows the confirm modal; exitToMenu is NOT called immediately.
    expect(exitSpy).not.toHaveBeenCalled();
    expect(hooks._exitConfirmModalEl.style.display).toBe('flex');
  });

  it('dismisses the exit-confirm modal on a second Esc press', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    // First Esc: show modal
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(hooks._exitConfirmModalEl.style.display).toBe('flex');

    // Second Esc: hide modal
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(hooks._exitConfirmModalEl.style.display).toBe('none');
  });

  it('closes the rules modal via _handleDocKeyDown when the modal is open', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Simulate opening the rules modal
    hooks._rulesModalEl.style.display = 'flex';

    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(hooks._rulesModalEl.style.display).toBe('none');
  });

  it('does not call exitToMenu when Esc closes the rules modal', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const exitSpy = jest.spyOn(game, 'exitToMenu');

    hooks._rulesModalEl.style.display = 'flex';
    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(exitSpy).not.toHaveBeenCalled();
    expect(hooks._rulesModalEl.style.display).toBe('none');
  });
});

// ─── Tests: playtesting does not persist level-completion progress ─────────────

describe('Game – playtesting does not persist progress', () => {
  it('does not add the level to campaign progress when winning during a playtest', () => {
    const { game } = makeGame();
    const hooks = gameHooks(game);

    // Enter playtest mode (sets _playtestExitCallback)
    hooks._playtestLevel(LEVELS[0]);
    expect(hooks._playtestExitCallback).not.toBeNull();

    const levelId = LEVELS[0].id;
    hooks._activeCampaignProgress.delete(levelId); // reset any data from shared localStorage
    hooks._markLevelCompleted(levelId);

    expect(hooks._activeCampaignProgress.has(levelId)).toBe(false);
  });

  it('adds the level to campaign progress when winning during normal play', () => {
    const { game } = makeGame();
    const hooks = gameHooks(game);

    game.startLevel(LEVELS[0].id);
    // Not in playtest mode
    expect(hooks._playtestExitCallback).toBeNull();

    const levelId = LEVELS[0].id;
    hooks._activeCampaignProgress.delete(levelId); // reset any data from shared localStorage
    hooks._markLevelCompleted(levelId);

    expect(hooks._activeCampaignProgress.has(levelId)).toBe(true);
  });
});

// ─── Tests: Ctrl tooltip suppressed during win/fail modals ───────────────────

describe('Game – Ctrl key tooltip suppressed during win/fail modals', () => {
  it('shows tooltip on Ctrl keydown when gameState is Playing', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Simulate mouse position on canvas
    hooks.mouseCanvasPos = { x: 50, y: 50 };

    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Control' }));

    expect(hooks.ctrlHeld).toBe(true);
    expect(hooks.tooltipEl.style.display).toBe('block');
  });

  it('does not show tooltip on Ctrl keydown when gameState is Won', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.Won;
    hooks.mouseCanvasPos = { x: 50, y: 50 };

    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Control' }));

    expect(hooks.ctrlHeld).toBe(true);
    expect(hooks.tooltipEl.style.display).not.toBe('block');
  });

  it('does not show tooltip on Ctrl keydown when gameState is GameOver', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.GameOver;
    hooks.mouseCanvasPos = { x: 50, y: 50 };

    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Control' }));

    expect(hooks.ctrlHeld).toBe(true);
    expect(hooks.tooltipEl.style.display).not.toBe('block');
  });

  it('does not show tooltip on mouse move when gameState is Won and Ctrl is held', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.Won;
    hooks.ctrlHeld = true;

    hooks._handleCanvasMouseMove(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));

    expect(hooks.tooltipEl.style.display).not.toBe('block');
  });

  it('does not show tooltip on mouse move when gameState is GameOver and Ctrl is held', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.GameOver;
    hooks.ctrlHeld = true;

    hooks._handleCanvasMouseMove(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));

    expect(hooks.tooltipEl.style.display).not.toBe('block');
  });

  it('shows tooltip on mouse move when gameState is Playing and Ctrl is held', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.ctrlHeld = true;

    hooks._handleCanvasMouseMove(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));

    expect(hooks.tooltipEl.style.display).toBe('block');
  });
});

// ─── Tests: reclaimTile records move for undo/redo ────────────────────────────

describe('Game – reclaimTile records a move in the undo history', () => {
  it('canUndo() returns true after right-clicking to reclaim a tile', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight (E-W) at (0,1) so it can be reclaimed
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Clear the undo history snapshot from placement, then verify reclaim adds one
    const boardAccess = game as unknown as { board: Board };
    const historyLenAfterPlace = (boardAccess.board as unknown as { _history: unknown[] })._history.length;

    // Right-click at (0,1): TILE_SIZE=64 → col 1 clientX=96, row 0 clientY=32
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    const historyLenAfterReclaim = (boardAccess.board as unknown as { _history: unknown[] })._history.length;
    expect(historyLenAfterReclaim).toBe(historyLenAfterPlace + 1);
    expect(boardAccess.board.canUndo()).toBe(true);
  });

  it('undo after reclaim restores the reclaimed tile back to the grid', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    // Place a Straight (E-W) at (0,1)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);

    // Reclaim it via right-click
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Empty);

    // Undo the reclaim → tile should be back
    boardAccess.board.undoMove();
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);
  });
});

// ─── Tests: contextmenu suppressed even when game-over modal is visible ──────

describe('Game – contextmenu suppressed when game-over modal is showing', () => {
  it('calls preventDefault() on a contextmenu event fired while in GameOver state', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Force the game into GameOver state (as _checkWinLose does when water runs out)
    (hooks as unknown as { gameState: GameState }).gameState = GameState.GameOver;

    // Simulate a contextmenu event (e.g. fired on the modal element instead of canvas)
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

    hooks._handleCanvasRightClick(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

// ─── Tests: disconnection animations after reclaimTile ────────────────────────

describe('Game – disconnection animations after reclaimTile', () => {
  it('spawns a "+1" animation when a connected regular pipe is reclaimed', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place Straight (E-W) at (0,1) – it connects to Source at (0,0)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Clear animations from placement
    hooks._animations.length = 0;

    // Reclaim it via right-click
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    const plusOneAnims = hooks._animations.filter((a) => a.text === '+1');
    expect(plusOneAnims.length).toBeGreaterThanOrEqual(1);
    expect(plusOneAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
  });

  it('spawns no disconnection animation when reclaiming an unconnected pipe', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    // Manually place a Straight at (2,1) – not reachable from source
    const { Tile } = jest.requireActual('../src/tile') as typeof import('../src/tile');
    boardAccess.board.grid[2][1] = new Tile(PipeShape.Straight, 90);
    // Add it back to inventory so reclaimTile constraint passes
    boardAccess.board.inventory.push({ shape: PipeShape.Straight, count: 1 });
    boardAccess.board.initHistory();

    hooks._animations.length = 0;

    // Right-click at (row=2, col=1): clientX = col*TILE_SIZE+32 = 1*64+32=96, clientY = row*TILE_SIZE+32 = 2*64+32=160
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 160 }));

    // No animation since the pipe was not in the fill path
    expect(hooks._animations.filter((a) => a.text === '+1').length).toBe(0);
  });
});

// ─── Tests: disconnection animations after replaceInventoryTile ───────────────

describe('Game – disconnection animations after replaceInventoryTile', () => {
  it('spawns a "+1" animation for a pipe disconnected by replacing a connected pipe', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place Straight E-W at (0,1) – connects east from Source(0,0)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Place Straight E-W at (0,2) – extends the chain via (0,1)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 2 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Clear animations from the placements above
    hooks._animations.length = 0;

    // Replace the Straight at (0,1) with a N-S orientation (rotation=0):
    // it no longer connects East → (0,2) becomes disconnected.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Expect a "+1" disconnection animation for the now-disconnected pipe at (0,2)
    const plusOneAnims = hooks._animations.filter((a) => a.text === '+1');
    expect(plusOneAnims.length).toBeGreaterThanOrEqual(1);
    expect(plusOneAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
  });

  it('spawns a "+1" animation for the replaced tile position itself when the new tile is not connected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place Straight E-W at (0,1) – connects east from Source(0,0); no downstream tiles
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Clear animations
    hooks._animations.length = 0;

    // Replace with Straight N-S (rotation=0) – it doesn't connect to Source's East,
    // so the position itself is disconnected and the old tile's cost is reversed.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // The replaced position (0,1) was in the fill path before and is not after,
    // so a "+1" disconnection animation is shown for the old tile's water cost reversal.
    const plusOneAnims = hooks._animations.filter((a) => a.text === '+1');
    expect(plusOneAnims.length).toBeGreaterThanOrEqual(1);
    expect(plusOneAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
  });
});

// ─── Tests: redo spawns tile impact animations ────────────────────────────────

describe('Game – performRedo spawns tile impact animations', () => {
  it('spawns a connection animation when a pipe placement is redone', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight (E-W) at (0,1) → it connects to Source at (0,0)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Undo the placement
    game.performUndo();
    hooks._animations.length = 0;

    // Redo – should respawn the connection animation ("-1" for the pipe)
    game.performRedo();

    const minusOneAnims = hooks._animations.filter((a) => a.text === '-1');
    expect(minusOneAnims.length).toBeGreaterThanOrEqual(1);
    expect(minusOneAnims[0].color).toBe(ANIM_NEGATIVE_COLOR);
  });

  it('spawns a disconnection animation when a pipe reclaim is redone', () => {
    // Place TWO connected pipes, then reclaim the first (which disconnects both).
    // After undo+redo of the reclaim, the second pipe (still in grid) should show "+1".
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place E-W Straight at (0,1) – connects to Source at (0,0)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Place E-W Straight at (0,2) – extends the chain; also newly connected
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks.focusPos = { row: 0, col: 2 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Reclaim the first pipe at (0,1) via right-click – disconnects both (0,1) and (0,2)
    // (0,1) centre: clientX=96, clientY=32
    hooks._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    // Undo the reclaim (restores the pipe at (0,1), reconnects (0,1) and (0,2))
    game.performUndo();
    hooks._animations.length = 0;

    // Redo the reclaim – (0,1) becomes empty again, (0,2) disconnects.
    // _spawnDisconnectionAnimations should fire "+1" for (0,2) (still in grid).
    game.performRedo();

    // (0,2) is still in the grid and was disconnected → "+1" disconnection animation
    const plusOneAnims = hooks._animations.filter((a) => a.text === '+1');
    expect(plusOneAnims.length).toBeGreaterThanOrEqual(1);
    expect(plusOneAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
  });
});

// ─── Tests: Ctrl-Z / Ctrl-Y undo/redo keyboard shortcuts ─────────────────────

describe('Game – Ctrl-Z / Ctrl-Y keyboard shortcuts', () => {
  it('Ctrl-Z calls performUndo during gameplay', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board; gameState: GameState };

    // Place a tile so there is something to undo
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    const undoSpy = jest.spyOn(game, 'performUndo');
    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));

    expect(undoSpy).toHaveBeenCalled();
  });

  it('Ctrl-Y calls performRedo during gameplay', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a tile, undo it, then redo via Ctrl-Y
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    game.performUndo();

    const redoSpy = jest.spyOn(game, 'performRedo');
    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));

    expect(redoSpy).toHaveBeenCalled();
  });

  it('Ctrl-Z does nothing when not on the play screen', () => {
    const { game } = makeGame();
    // game starts on level-select screen
    const hooks = gameHooks(game);
    const undoSpy = jest.spyOn(game, 'performUndo');
    hooks._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(undoSpy).not.toHaveBeenCalled();
  });
});

// ─── Tests: note and hint boxes ───────────────────────────────────────────────

describe('Game – note and hint boxes', () => {
  /** Returns the internal DOM elements for note/hint from the game instance. */
  function getBoxEls(game: Game) {
    const { noteBoxEl, hintBoxEl } = game as unknown as {
      noteBoxEl: HTMLElement;
      hintBoxEl: HTMLElement;
    };
    // The hint toggle button and text are built dynamically inside hintBoxEl when
    // a level with hints is loaded. The first child is the toggle button and the
    // second child is the hint text div.
    const hintToggleBtnEl = hintBoxEl.children[0] as HTMLButtonElement | undefined;
    const hintTextEl = hintBoxEl.children[1] as HTMLElement | undefined;
    return { noteBoxEl, hintBoxEl, hintTextEl, hintToggleBtnEl };
  }

  it('note box is hidden when the level has no note', () => {
    const { game } = makeGame();
    game.startLevel(1);   // official level 1 has no note
    const { noteBoxEl } = getBoxEls(game);
    expect(noteBoxEl.style.display).toBe('none');
  });

  it('hint box is hidden when the level has no hint', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const { hintBoxEl } = getBoxEls(game);
    expect(hintBoxEl.style.display).toBe('none');
  });

  it('note box is shown and populated when the level has a note', () => {
    const { game } = makeGame();
    // Inject a note into level 1
    const level = LEVELS.find((l) => l.id === 1)!;
    const origNote = level.note;
    level.note = 'Connect the pipes!';
    game.startLevel(1);
    const { noteBoxEl } = getBoxEls(game);
    expect(noteBoxEl.style.display).toBe('block');
    expect(noteBoxEl.textContent).toBe('Connect the pipes!');
    level.note = origNote; // restore
  });

  it('hint box is shown (collapsed) when the level has a hint', () => {
    const { game } = makeGame();
    const level = LEVELS.find((l) => l.id === 1)!;
    const origHints = level.hints;
    level.hints = ['Try placing a straight pipe first.'];
    game.startLevel(1);
    const { hintBoxEl, hintTextEl, hintToggleBtnEl } = getBoxEls(game);
    expect(hintBoxEl.style.display).toBe('block');
    expect(hintTextEl!.style.display).toBe('none');   // collapsed by default
    expect(hintToggleBtnEl!.textContent).toBe('💡 Show Hint');
    level.hints = origHints; // restore
  });

  it('clicking the hint toggle reveals the hint text', () => {
    const { game } = makeGame();
    const level = LEVELS.find((l) => l.id === 1)!;
    const origHints = level.hints;
    level.hints = ['A secret tip.'];
    game.startLevel(1);
    const { hintTextEl, hintToggleBtnEl } = getBoxEls(game);
    // Hint is collapsed; click to expand
    hintToggleBtnEl!.click();
    expect(hintTextEl!.style.display).toBe('block');
    expect(hintToggleBtnEl!.textContent).toBe('💡 Hide Hint');
    // Click again to collapse
    hintToggleBtnEl!.click();
    expect(hintTextEl!.style.display).toBe('none');
    expect(hintToggleBtnEl!.textContent).toBe('💡 Show Hint');
    level.hints = origHints; // restore
  });

  it('hint always starts collapsed when restarting a level', () => {
    const { game } = makeGame();
    const level = LEVELS.find((l) => l.id === 1)!;
    const origHints = level.hints;
    level.hints = ['A secret tip.'];
    game.startLevel(1);
    const { hintTextEl, hintToggleBtnEl } = getBoxEls(game);
    // Expand the hint
    hintToggleBtnEl!.click();
    expect(hintTextEl!.style.display).toBe('block');
    // Restart the level – elements are rebuilt so re-query
    game.startLevel(1);
    const { hintTextEl: hintTextEl2, hintToggleBtnEl: hintToggleBtnEl2 } = getBoxEls(game);
    expect(hintTextEl2!.style.display).toBe('none');
    expect(hintToggleBtnEl2!.textContent).toBe('💡 Show Hint');
    level.hints = origHints; // restore
  });
});

// ─── Tests: retryLevel preserves undo history ─────────────────────────────────

describe('Game – retryLevel preserves undo history', () => {
  it('keeps the undo button enabled after retryLevel when moves were made', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;

    // Make a move so there is something to undo
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Sanity: undo button should be enabled after the move
    expect(undoBtn.disabled).toBe(false);

    // Restart the level via retryLevel()
    game.retryLevel();

    // The undo button should still be enabled (pre-restart history was preserved)
    expect(undoBtn.disabled).toBe(false);
  });

  it('undo after retryLevel restores the board state that was in play before restart', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    // Place a Straight at (0,1) so the board differs from the initial state
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Capture the shape at (0,1) before restart (should be Straight)
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);

    // Restart the level – board should revert to initial state
    game.retryLevel();
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Empty);

    // Undo should restore the pre-restart state where (0,1) was Straight
    game.performUndo();
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);
  });

  it('undo button remains disabled after retryLevel when no moves were made', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;

    // No moves made – undo should be disabled both before and after retry
    expect(undoBtn.disabled).toBe(true);
    game.retryLevel();
    expect(undoBtn.disabled).toBe(true);
  });

  it('R key triggers retryLevel and preserves undo history', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
    const boardAccess = game as unknown as { board: Board };

    // Place a tile so there is pre-restart history
    hooks.selectedShape = PipeShape.Straight;
    hooks.focusPos = { row: 0, col: 1 };
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Press R to restart
    hooks._handleKey(new KeyboardEvent('keydown', { key: 'R' }));

    // Undo button should be enabled and pressing it restores pre-restart state
    expect(undoBtn.disabled).toBe(false);
    game.performUndo();
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);
  });
});

// ─── Tests: new-chapter modal ─────────────────────────────────────────────────

describe('Game – new-chapter modal', () => {
  // LEVEL_2 is the last level in Chapter 1; LEVEL_3 is the first in Chapter 2.
  const lastLevelOfChapter1 = CHAPTERS[0].levels[CHAPTERS[0].levels.length - 1];
  const firstLevelOfChapter2 = CHAPTERS[1].levels[0];

  it('shows the new-chapter modal (not the play screen) when nextLevel() crosses a chapter boundary', () => {
    const { game, playScreenEl } = makeGame();
    game.startLevel(lastLevelOfChapter1.id);

    game.nextLevel();

    const hooks = gameHooks(game);
    expect(hooks._newChapterModalEl.style.display).toBe('flex');
    // pending level should be set but the play screen is still on the previous level
    expect(hooks._pendingLevelId).toBe(firstLevelOfChapter2.id);
    expect(playScreenEl.style.display).toBe('flex');
  });

  it('populates the new-chapter modal with the correct chapter number and name', () => {
    const { game } = makeGame();
    game.startLevel(lastLevelOfChapter1.id);

    game.nextLevel();

    const hooks = gameHooks(game);
    const box = hooks._newChapterModalEl.querySelector<HTMLElement>('.modal-box')!;
    expect(box.textContent).toContain('Chapter 2');
    expect(box.textContent).toContain(CHAPTERS[1].name);
  });

  it('hides the new-chapter modal and starts the level when startChapterLevel() is called', () => {
    const { game, playScreenEl } = makeGame();
    game.startLevel(lastLevelOfChapter1.id);
    game.nextLevel();

    game.startChapterLevel();

    const hooks = gameHooks(game);
    expect(hooks._newChapterModalEl.style.display).toBe('none');
    expect(playScreenEl.style.display).toBe('flex');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id)
      .toBe(firstLevelOfChapter2.id);
  });

  it('does NOT show the new-chapter modal when nextLevel() stays within the same chapter', () => {
    const firstLevelOfChapter1 = CHAPTERS[0].levels[0];
    const secondLevelOfChapter1 = CHAPTERS[0].levels[1];

    const { game } = makeGame();
    game.startLevel(firstLevelOfChapter1.id);

    game.nextLevel();

    const hooks = gameHooks(game);
    expect(hooks._newChapterModalEl.style.display).toBe('none');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id)
      .toBe(secondLevelOfChapter1.id);
  });

  it('hides the new-chapter modal when exitToMenu is called', () => {
    const { game } = makeGame();
    game.startLevel(lastLevelOfChapter1.id);
    game.nextLevel();

    game.exitToMenu();

    const hooks = gameHooks(game);
    expect(hooks._newChapterModalEl.style.display).toBe('none');
    expect(hooks._pendingLevelId).toBeNull();
  });
});

// ─── Tests: challenge-level modal ────────────────────────────────────────────

/** Build a minimal campaign with one regular level followed by one challenge level. */
function makeChallengeTestCampaign(levelTemplate: LevelDef, challengeLevelTemplate: LevelDef): CampaignDef {
  return {
    id: 'test-challenge-campaign',
    name: 'Test',
    author: 'Test',
    chapters: [
      {
        id: 1,
        name: 'Test Chapter',
        levels: [
          { ...levelTemplate, id: 9001 },
          { ...challengeLevelTemplate, id: 9002, challenge: true },
          { ...levelTemplate, id: 9003 },
        ],
      },
    ],
  };
}

describe('Game – challenge-level modal', () => {
  it('shows the challenge modal when requestLevel() is called with a challenge level', () => {
    const { game, playScreenEl } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);

    game.requestLevel(9002);

    const hooks = gameHooks(game);
    expect(hooks._challengeModalEl.style.display).toBe('flex');
    expect(hooks._pendingLevelId).toBe(9002);
    // The level should be started (visible on screen) before the modal appears.
    expect(playScreenEl.style.display).toBe('flex');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9002);
  });

  it('does NOT show the challenge modal for a non-challenge level', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);

    game.requestLevel(9001);

    const hooks = gameHooks(game);
    expect(hooks._challengeModalEl.style.display).toBe('none');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9001);
  });

  it('shows the challenge modal when nextLevel() advances into a challenge level (same chapter)', () => {
    const { game, playScreenEl } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    game.startLevel(9001);

    game.nextLevel();

    const hooks = gameHooks(game);
    expect(hooks._challengeModalEl.style.display).toBe('flex');
    expect(hooks._pendingLevelId).toBe(9002);
    // The challenge level should be started (visible on screen) before the modal appears.
    expect(playScreenEl.style.display).toBe('flex');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9002);
  });

  it('playChallengeLevel() hides the challenge modal and starts the level', () => {
    const { game, playScreenEl } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    game.requestLevel(9002);

    game.playChallengeLevel();

    const hooks = gameHooks(game);
    expect(hooks._challengeModalEl.style.display).toBe('none');
    expect(playScreenEl.style.display).toBe('flex');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9002);
  });

  it('skipChallengeLevel() hides the challenge modal and advances to the level after the challenge', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    game.startLevel(9001);
    game.nextLevel(); // shows challenge modal for 9002

    game.skipChallengeLevel();

    const hooks = gameHooks(game);
    expect(hooks._challengeModalEl.style.display).toBe('none');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9003);
  });

  it('skipChallengeLevel() calls exitToMenu when there is no level after the challenge', () => {
    const { game, levelSelectEl } = makeGame();
    const campaignNoNext: CampaignDef = {
      id: 'test-no-next',
      name: 'Test',
      author: 'Test',
      chapters: [{
        id: 1,
        name: 'Chapter',
        levels: [
          { ...LEVELS[0], id: 9010 },
          { ...LEVELS[1], id: 9011, challenge: true },
        ],
      }],
    };
    gameHooks(game)._activateCampaign(campaignNoNext);
    game.startLevel(9010);
    game.nextLevel(); // shows challenge modal for 9011

    game.skipChallengeLevel();

    expect(levelSelectEl.style.display).toBe('flex');
  });

  it('hides the challenge modal when exitToMenu is called', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    game.requestLevel(9002);

    game.exitToMenu();

    const hooks = gameHooks(game);
    expect(hooks._challengeModalEl.style.display).toBe('none');
    expect(hooks._pendingLevelId).toBeNull();
  });

  it('hides the skip button and description when opened via requestLevel() (direct selection)', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);

    game.requestLevel(9002);

    const hooks = gameHooks(game);
    expect(hooks._challengeSkipBtnEl.style.display).toBe('none');
    expect(hooks._challengeMsgEl.style.display).toBe('none');
  });

  it('shows the skip button and description when opened via nextLevel() (sequential flow)', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    game.startLevel(9001);

    game.nextLevel();

    const hooks = gameHooks(game);
    expect(hooks._challengeSkipBtnEl.style.display).not.toBe('none');
    expect(hooks._challengeMsgEl.style.display).not.toBe('none');
  });
});

// ─── Tests: campaign auto-selection on startup ────────────────────────────────

/** Set up the minimal DOM and construct a Game without touching localStorage. */
function makeGameWithStorage(): Game {
  document.body.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="level-select"><div id="level-list"></div></div>
    <div id="play-screen">
      <div id="level-header"></div>
      <div id="water-display" class="stat-row"><span class="stat-label">💧 Water</span><span class="stat-value"></span></div>
      <div id="inventory-bar"></div>
      <button id="undo-btn"></button>
      <button id="redo-btn"></button>
      <button id="exit-btn">← Menu</button>
    </div>
    <div id="win-modal"><button id="win-next-btn">Next Level ▶</button><button id="win-menu-btn">Level Select</button></div>
    <div id="gameover-modal"><p id="gameover-msg"></p><button id="gameover-menu-btn">Level Select</button></div>
  `;
  const get = (id: string) => document.getElementById(id) as HTMLElement;
  return new Game(
    get('game-canvas') as HTMLCanvasElement,
    get('level-select'),
    get('level-list'),
    get('play-screen'),
    get('level-header'),
    get('inventory-bar'),
    get('water-display'),
    get('win-modal'),
    get('gameover-modal'),
    get('gameover-msg'),
    get('undo-btn') as HTMLButtonElement,
    get('redo-btn') as HTMLButtonElement,
    get('exit-btn') as HTMLButtonElement,
  );
}

describe('Game – campaign auto-selection on startup', () => {
  beforeEach(() => { localStorage.clear(); });

  it('selects no campaign when no campaigns are available', () => {
    const game = makeGameWithStorage();
    expect(gameHooks(game)._activeCampaign).toBeNull();
  });

  it('auto-selects the first available campaign when none is saved', () => {
    const campaign: CampaignDef = { id: 'c1', name: 'Campaign 1', author: 'A', chapters: [] };
    saveImportedCampaigns([campaign]);

    const game = makeGameWithStorage();

    expect(gameHooks(game)._activeCampaign).toMatchObject({ id: 'c1' });
    expect(loadActiveCampaignId()).toBe('c1');
  });

  it('prefers an official campaign over a non-official one', () => {
    const unofficial: CampaignDef = { id: 'u1', name: 'Unofficial', author: 'A', chapters: [] };
    const official: CampaignDef = { id: 'o1', name: 'Official', author: 'A', chapters: [], official: true };
    saveImportedCampaigns([unofficial, official]);

    const game = makeGameWithStorage();

    expect(gameHooks(game)._activeCampaign).toMatchObject({ id: 'o1' });
    expect(loadActiveCampaignId()).toBe('o1');
  });

  it('does not override an existing saved campaign on startup', () => {
    const c1: CampaignDef = { id: 'c1', name: 'Campaign 1', author: 'A', chapters: [] };
    const c2: CampaignDef = { id: 'c2', name: 'Campaign 2', author: 'A', chapters: [], official: true };
    saveImportedCampaigns([c1, c2]);
    localStorage.setItem('pipes_active_campaign', 'c1');

    const game = makeGameWithStorage();

    // Should restore c1 (the saved one) rather than auto-selecting the official c2.
    expect(gameHooks(game)._activeCampaign).toMatchObject({ id: 'c1' });
  });
});
