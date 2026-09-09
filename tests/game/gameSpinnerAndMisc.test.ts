/**
 * @jest-environment jsdom
 */

import { Game } from '../../src/game';
import type { CampaignDef } from '../../src/types';
import { PipeShape } from '../../src/types';
import { LEVELS } from '../levels';
import {
  saveImportedCampaigns,
  loadActiveCampaignId,
  saveLevelWater,
} from '../../src/persistence';
import type { Board } from '../../src/board';
import {
  makeGame,
  gameHooks,
  gameTestBeforeEach,
  gameTestAfterEach,
  makeChallengeTestCampaign,
} from '../gameTestHelpers';

// Make spawnConfetti synchronous in tests by immediately invoking the onComplete callback.
jest.mock('../../src/visuals/confetti', () => ({
  spawnConfetti: (onComplete?: () => void) => { if (onComplete) onComplete(); },
  clearConfetti: jest.fn(),
}));
beforeEach(gameTestBeforeEach);
afterEach(gameTestAfterEach);

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
      <div id="best-score-box"><div id="best-score-title">Best Score</div></div>
      <button id="undo-btn"></button>
      <button id="redo-btn"></button>
      <button id="exit-btn">← Menu</button>
    </div>
    <div id="win-modal"><p id="win-water" style="display:none;"></p><button id="win-next-btn">Continue</button></div>
    <div id="gameover-modal"><p id="gameover-msg"></p><button id="gameover-menu-btn">Level Select</button></div>
  `;
  const get = (id: string) => document.getElementById(id) as HTMLElement;
  return new Game({
    canvas: get('game-canvas') as HTMLCanvasElement,
    levelSelectEl: get('level-select'),
    levelListEl: get('level-list'),
    playScreenEl: get('play-screen'),
    levelHeaderEl: get('level-header'),
    inventoryBarEl: get('inventory-bar'),
    waterDisplayEl: get('water-display'),
    winModalEl: get('win-modal'),
    gameoverModalEl: get('gameover-modal'),
    gameoverMsgEl: get('gameover-msg'),
    undoBtnEl: get('undo-btn') as HTMLButtonElement,
    redoBtnEl: get('redo-btn') as HTMLButtonElement,
    exitBtnEl: get('exit-btn') as HTMLButtonElement,
  });
}

describe('Game – campaign auto-selection on startup', () => {
  beforeEach(() => { localStorage.clear(); });

  it('selects no campaign when no campaigns are available', () => {
    const game = makeGameWithStorage();
    expect(gameHooks(game)._campaign.activeCampaign).toBeNull();
  });

  it('auto-selects the first available campaign when none is saved', () => {
    const campaign: CampaignDef = { id: 'c1', name: 'Campaign 1', author: 'A', chapters: [] };
    saveImportedCampaigns([campaign]);

    const game = makeGameWithStorage();

    expect(gameHooks(game)._campaign.activeCampaign).toMatchObject({ id: 'c1' });
    expect(loadActiveCampaignId()).toBe('c1');
  });

  it('prefers an official campaign over a non-official one', () => {
    const unofficial: CampaignDef = { id: 'u1', name: 'Unofficial', author: 'A', chapters: [] };
    const official: CampaignDef = { id: 'o1', name: 'Official', author: 'A', chapters: [], official: true };
    saveImportedCampaigns([unofficial, official]);

    const game = makeGameWithStorage();

    expect(gameHooks(game)._campaign.activeCampaign).toMatchObject({ id: 'o1' });
    expect(loadActiveCampaignId()).toBe('o1');
  });

  it('does not override an existing saved campaign on startup', () => {
    const c1: CampaignDef = { id: 'c1', name: 'Campaign 1', author: 'A', chapters: [] };
    const c2: CampaignDef = { id: 'c2', name: 'Campaign 2', author: 'A', chapters: [], official: true };
    saveImportedCampaigns([c1, c2]);
    localStorage.setItem('pipes_active_campaign', 'c1');

    const game = makeGameWithStorage();

    // Should restore c1 (the saved one) rather than auto-selecting the official c2.
    expect(gameHooks(game)._campaign.activeCampaign).toMatchObject({ id: 'c1' });
  });
});

// ─── Tests: level header challenge icon ──────────────────────────────────────

describe('Game – level header challenge icon', () => {
  it('appends 💀 to the level header when the level is a challenge level', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);

    game.startLevel(9002); // challenge level

    const levelHeaderEl = document.getElementById('level-header');
    expect(levelHeaderEl?.textContent).toContain('💀');
  });

  it('does not append 💀 to the level header for a non-challenge level', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);

    game.startLevel(9001); // non-challenge level

    const levelHeaderEl = document.getElementById('level-header');
    expect(levelHeaderEl?.textContent).not.toContain('💀');
  });
});

// ─── Tests: spinner tile interaction with inventory selected ──────────────────

describe('Game – spinner tile click with inventory selected', () => {
  it('rotates the spinner on left-click even when an inventory item is selected', () => {
    const { game } = makeGame();
    game.startLevel(8); // LEVEL_8: SpinStraight at (0,1) with initial rotation 90
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    expect(boardAccess.board.grid[0][1].rotation).toBe(90);

    // Select an inventory item so the drag-paint path normally runs on mouseup.
    hooks.selectedShape = PipeShape.Straight;

    // TILE_SIZE=64: col 1 → clientX 96, row 0 → clientY 32.
    const x = 96, y = 32;

    // Simulate the full left-click sequence (mousedown → mouseup → click).
    hooks._input._handleCanvasMouseDown(new MouseEvent('mousedown', { button: 0, clientX: x, clientY: y }));
    hooks._input._handleCanvasMouseUp(new MouseEvent('mouseup', { button: 0, clientX: x, clientY: y }));
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: x, clientY: y }));

    // The spinner should have rotated CW (90→180) – the click must NOT have been suppressed.
    expect(boardAccess.board.grid[0][1].rotation).toBe(180);
    // The inventory selection must remain active (spinner cannot be placed/replaced).
    expect(hooks.selectedShape).toBe(PipeShape.Straight);
  });
});

describe('Game – spinner tile right-click deselects inventory', () => {
  it('deselects the selected inventory item when right-clicking a spinner tile', () => {
    const { game } = makeGame();
    game.startLevel(8); // LEVEL_8: SpinStraight at (0,1)
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    hooks.selectedShape = PipeShape.Straight;

    // TILE_SIZE=64: col 1 → clientX 96, row 0 → clientY 32.
    const x = 96, y = 32;

    // Simulate right-click on the spinner (mousedown button=2, mouseup button=2).
    hooks._input._handleCanvasMouseDown(new MouseEvent('mousedown', { button: 2, clientX: x, clientY: y }));
    hooks._input._handleCanvasMouseUp(new MouseEvent('mouseup', { button: 2, clientX: x, clientY: y }));

    // Inventory selection must be cleared.
    expect(hooks.selectedShape).toBeNull();
    // The spinner tile itself must NOT have been removed.
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.SpinStraight);
  });

  it('deselects the selected inventory item when the contextmenu event fires on a spinner tile', () => {
    const { game } = makeGame();
    game.startLevel(8); // LEVEL_8: SpinStraight at (0,1)
    const hooks = gameHooks(game);

    hooks.selectedShape = PipeShape.Straight;

    // Simulate a contextmenu event directly on the spinner tile (e.g. keyboard-triggered).
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    expect(hooks.selectedShape).toBeNull();
  });
});

describe('Game – right-click deselects on non-placeable hovered tile', () => {
  it('deselects selected inventory on right-mouseup over an unreplaceable tile', () => {
    const { game } = makeGame();
    game.startLevel(1); // Level has Source at (0,0), which cannot be replaced.
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    hooks.selectedShape = PipeShape.Straight;
    expect(boardAccess.board.grid[0][0].shape).toBe(PipeShape.Source);

    // TILE_SIZE=64: col 0 → x=32, row 0 → y=32.
    hooks._input._handleCanvasMouseDown(new MouseEvent('mousedown', { button: 2, clientX: 32, clientY: 32 }));
    hooks._input._handleCanvasMouseUp(new MouseEvent('mouseup', { button: 2, clientX: 32, clientY: 32 }));

    expect(hooks.selectedShape).toBeNull();
    expect(boardAccess.board.grid[0][0].shape).toBe(PipeShape.Source);
  });

  it('deselects selected inventory on contextmenu over an unreplaceable tile', () => {
    const { game } = makeGame();
    game.startLevel(1); // Level has Source at (0,0), which cannot be replaced.
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    hooks.selectedShape = PipeShape.Straight;
    expect(boardAccess.board.grid[0][0].shape).toBe(PipeShape.Source);

    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 32, clientY: 32 }));

    expect(hooks.selectedShape).toBeNull();
    expect(boardAccess.board.grid[0][0].shape).toBe(PipeShape.Source);
  });
});

// ─── Tests: spinner tile wheel rotation ───────────────────────────────────────

describe('Game – spinner tile wheel rotation', () => {
  it('rotates the spinner clockwise (90→180) when scrolling down over it', () => {
    const { game } = makeGame();
    game.startLevel(8); // LEVEL_8: SpinStraight at (0,1) with initial rotation 90
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    expect(boardAccess.board.grid[0][1].rotation).toBe(90);

    // No inventory selected; hover over grid (row=0, col=1).
    // TILE_SIZE=64: col 1 → x=96, row 0 → y=32.
    hooks.selectedShape = null;
    hooks._input.mouseCanvasPos = { x: 96, y: 32 };

    hooks._input._handleCanvasWheel(new WheelEvent('wheel', { deltaY: 1 }));

    expect(boardAccess.board.grid[0][1].rotation).toBe(180);
  });

  it('rotates the spinner counter-clockwise (90→0) when scrolling up over it', () => {
    const { game } = makeGame();
    game.startLevel(8); // LEVEL_8: SpinStraight at (0,1) with initial rotation 90
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    expect(boardAccess.board.grid[0][1].rotation).toBe(90);

    hooks.selectedShape = null;
    hooks._input.mouseCanvasPos = { x: 96, y: 32 };

    hooks._input._handleCanvasWheel(new WheelEvent('wheel', { deltaY: -1 }));

    expect(boardAccess.board.grid[0][1].rotation).toBe(0);
  });

  it('does NOT rotate the spinner when scrolling over a non-spinner tile', () => {
    const { game } = makeGame();
    game.startLevel(8); // LEVEL_8: SpinStraight at (0,1) with initial rotation 90
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    hooks.selectedShape = null;
    // Hover over (row=0, col=0) which is the Source tile, not a spin pipe.
    hooks._input.mouseCanvasPos = { x: 32, y: 32 };

    hooks._input._handleCanvasWheel(new WheelEvent('wheel', { deltaY: 1 }));

    // Spinner at (0,1) must be unchanged.
    expect(boardAccess.board.grid[0][1].rotation).toBe(90);
  });

  it('rotates the spinner (not the pending piece) when an inventory item is selected and cursor hovers over the spinner', () => {
    const { game } = makeGame();
    game.startLevel(8); // LEVEL_8: SpinStraight at (0,1) with initial rotation 90
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    // Select an inventory item and hover over the spinner.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input.mouseCanvasPos = { x: 96, y: 32 };

    hooks._input._handleCanvasWheel(new WheelEvent('wheel', { deltaY: 1 }));

    // The spinner should rotate, not the pending piece.
    expect(boardAccess.board.grid[0][1].rotation).toBe(180);
    expect(hooks.pendingRotation).toBe(0);
  });
});

// ─── Tests: win modal "(New Best!)" water indicator ───────────────────────────

describe('Game – win modal shows "(New Best!)" for a new water record', () => {
  /** Direct-call helper: invoke private _showWin() via a cast. */
  function showWin(game: Game): void {
    (game as unknown as { _showWin(): void })._showWin();
  }

  it('appends "(New Best!)" when current water exceeds the previous saved best', () => {
    const { game } = makeGame();
    game.startLevel(1); // sourceCapacity=6, so getCurrentWater() returns 6 on a fresh board

    // Pre-save a lower previous best (campaign water is stored under 'test-campaign').
    saveLevelWater(1, 3, 'test-campaign');

    showWin(game);

    const winWaterEl = document.getElementById('win-water');
    expect(winWaterEl?.textContent).toContain('(New Best!)');
  });

  it('does not show "(New Best!)" when there is no previous water record (first completion)', () => {
    const { game } = makeGame();
    game.startLevel(1);
    // localStorage was cleared by makeGame(); no previous best exists.

    showWin(game);

    const winWaterEl = document.getElementById('win-water');
    expect(winWaterEl?.textContent).not.toContain('(New Best!)');
  });

  it('does not show "(New Best!)" when current water does not exceed the previous best', () => {
    const { game } = makeGame();
    game.startLevel(1); // getCurrentWater() returns 6

    // Pre-save a higher previous best that the current run cannot beat.
    saveLevelWater(1, 100, 'test-campaign');

    showWin(game);

    const winWaterEl = document.getElementById('win-water');
    expect(winWaterEl?.textContent).not.toContain('(New Best!)');
  });

  it('always includes the water value in the text regardless of new-best status', () => {
    const { game } = makeGame();
    game.startLevel(1); // sourceCapacity=6 → waterRemaining=6 on a fresh board

    showWin(game);

    const winWaterEl = document.getElementById('win-water');
    expect(winWaterEl?.textContent).toContain('6');
    expect(winWaterEl?.textContent).toContain('water retained');
  });
});

