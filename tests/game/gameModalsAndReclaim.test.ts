/**
 * @jest-environment jsdom
 */

import type { Game } from '../../src/game';
import type { LevelDef } from '../../src/types';
import { PipeShape, Direction, GameState } from '../../src/types';
import { LEVELS } from '../levels';
import {
  saveBackgroundEnabled,
  saveEnvironmentalEnabled,
} from '../../src/persistence';
import { sfxManager, SfxId } from '../../src/audio/sfxManager';
import { isEnvironmentalEnabled } from '../../src/graphicsSettings';
import { getActiveSlotIndex, setActiveSlotIndex, withSlot } from '../../src/profile/activeProfile';
import * as uiBackground from '../../src/uiBackground';
import { Board } from '../../src/board';
import { AnimationManager } from '../../src/animationManager';
import { ANIM_POSITIVE_COLOR } from '../../src/visuals/tileAnimation';
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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    hooks.selectedShape = null;

    // Right-click at (0,1): TILE_SIZE=64 → col 1 → clientX 96, row 0 → clientY 32
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    expect(hooks.selectedShape).toBe(PipeShape.Straight);
  });

  it('sets pendingRotation to the reclaimed tile\'s rotation', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight (E-W, rotation=90) at (0,1), then deselect
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    hooks.selectedShape = null;

    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    expect(hooks.pendingRotation).toBe(90);
  });

  it('does not change selectedShape when a shape is already selected', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight at (0,1), keep Elbow selected
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Now select Elbow instead
    hooks.selectedShape = PipeShape.Elbow;

    // Right-click at (0,1) to reclaim the Straight
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

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
    hooks._input.handleInventoryClick(PipeShape.Straight, 4);

    expect(hooks.selectedShape).toBeNull();
  });

  it('changes selectedShape when clicking a different item', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.selectedShape = PipeShape.Straight;
    hooks._input.handleInventoryClick(PipeShape.Elbow, 2);

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    const startLevelSpy = jest.spyOn(game, 'startLevel');
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'R' }));

    expect(startLevelSpy).toHaveBeenCalledWith(1, expect.anything(), true);
  });

  it('also resets when lowercase r is pressed', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const startLevelSpy = jest.spyOn(game, 'startLevel');
    gameHooks(game)._input._handleKey(new KeyboardEvent('keydown', { key: 'r' }));

    expect(startLevelSpy).toHaveBeenCalledWith(1, expect.anything(), true);
  });
});

// ─── Tests: profile selection applies settings ─────────────────────────────────

describe('Game – profile selection settings', () => {
  it('applies selected profile graphics settings when profile is selected', () => {
    const { game } = makeGame();
    const setBackgroundSpy = jest.spyOn(uiBackground, 'setGlobalBackgroundPatternEnabled');
    const previousActiveSlot = getActiveSlotIndex();

    withSlot(1, () => {
      saveBackgroundEnabled(false);
      saveEnvironmentalEnabled(false);
    });
    try {
      gameHooks(game)._profileScreen.onProfileSelected(1);
      expect(setBackgroundSpy).toHaveBeenCalledWith(false);
      expect(isEnvironmentalEnabled()).toBe(false);
    } finally {
      setActiveSlotIndex(previousActiveSlot);
    }
  });
});

// ─── Tests: Escape key returns to level select ────────────────────────────────

describe('Game – Escape key returns to level select', () => {

  it('plays Back and closes the settings modal when Escape is pressed while it is open', () => {
    const { game } = makeGame();
    const hooks = game as unknown as {
      _settingsModalEl: HTMLElement;
      _input: { _handleDocKeyDown(e: KeyboardEvent): void };
    };
    const playSpy = jest.spyOn(sfxManager, 'play').mockImplementation(() => {});

    hooks._settingsModalEl.style.display = 'flex';
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(playSpy).toHaveBeenCalledWith(SfxId.Back);
    expect(hooks._settingsModalEl.style.display).toBe('none');
  });

  it('shows the exit-confirm modal when Escape is pressed during play instead of immediately exiting', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    const exitSpy = jest.spyOn(game, 'exitToMenu');
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Esc during active play with progress shows the save-progress notice; exitToMenu is NOT called immediately.
    expect(exitSpy).not.toHaveBeenCalled();
    expect(hooks._exitConfirmModalEl.style.display).toBe('flex');
  });

  it('dismisses the exit-confirm modal on a second Esc press', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    // First Esc: show modal
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(hooks._exitConfirmModalEl.style.display).toBe('flex');

    // Second Esc while modal is open: modal's own onClose fires (exits without closing via Esc guard).
    // The modal stays open until its OK button or onClose is invoked through setupModal.
    // Verify modal is still showing (our handleEscapeKey returns early when modal is open).
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    // Modal remains open (Esc while open is a no-op at the handleEscapeKey level; setupModal handles it).
    expect(hooks._exitConfirmModalEl.style.display).toBe('flex');
  });

  it('closes the rules modal via _handleDocKeyDown when the modal is open', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Simulate opening the rules modal
    hooks._rulesModalEl.style.display = 'flex';

    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(hooks._rulesModalEl.style.display).toBe('none');
  });

  it('does not call exitToMenu when Esc closes the rules modal', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const exitSpy = jest.spyOn(game, 'exitToMenu');

    hooks._rulesModalEl.style.display = 'flex';
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

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
    expect(hooks._campaign._playtestExitCallbackInternal).not.toBeNull();

    const levelId = LEVELS[0].id;
    hooks._campaign.progress.delete(levelId); // reset any data from shared localStorage
    hooks._markLevelCompleted(levelId);

    expect(hooks._campaign.progress.has(levelId)).toBe(false);
  });

  it('adds the level to campaign progress when winning during normal play', () => {
    const { game } = makeGame();
    const hooks = gameHooks(game);

    game.startLevel(LEVELS[0].id);
    // Not in playtest mode
    expect(hooks._campaign._playtestExitCallbackInternal).toBeNull();

    const levelId = LEVELS[0].id;
    hooks._campaign.progress.delete(levelId); // reset any data from shared localStorage
    hooks._markLevelCompleted(levelId);

    expect(hooks._campaign.progress.has(levelId)).toBe(true);
  });
});

// ─── Tests: Ctrl tooltip suppressed during win/fail modals ───────────────────

describe('Game – Ctrl key tooltip suppressed during win/fail modals', () => {
  it('shows tooltip on Ctrl keydown when gameState is Playing', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Simulate mouse position on canvas
    hooks._input.mouseCanvasPos = { x: 50, y: 50 };

    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Control' }));

    expect(hooks._input.ctrlHeld).toBe(true);
    expect(hooks._tooltip.el.style.display).toBe('block');
  });

  it('does not show tooltip on Ctrl keydown when gameState is Won', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.Won;
    hooks._input.mouseCanvasPos = { x: 50, y: 50 };

    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Control' }));

    expect(hooks._input.ctrlHeld).toBe(true);
    expect(hooks._tooltip.el.style.display).not.toBe('block');
  });

  it('does not show tooltip on Ctrl keydown when gameState is GameOver', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.GameOver;
    hooks._input.mouseCanvasPos = { x: 50, y: 50 };

    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Control' }));

    expect(hooks._input.ctrlHeld).toBe(true);
    expect(hooks._tooltip.el.style.display).not.toBe('block');
  });

  it('does not show tooltip on mouse move when gameState is Won and Ctrl is held', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.Won;
    hooks._input.ctrlHeld = true;

    hooks._input._handleCanvasMouseMove(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));

    expect(hooks._tooltip.el.style.display).not.toBe('block');
  });

  it('does not show tooltip on mouse move when gameState is GameOver and Ctrl is held', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks.gameState = GameState.GameOver;
    hooks._input.ctrlHeld = true;

    hooks._input._handleCanvasMouseMove(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));

    expect(hooks._tooltip.el.style.display).not.toBe('block');
  });

  it('shows tooltip on mouse move when gameState is Playing and Ctrl is held', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    hooks._input.ctrlHeld = true;

    hooks._input._handleCanvasMouseMove(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));

    expect(hooks._tooltip.el.style.display).toBe('block');
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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Clear the undo history snapshot from placement, then verify reclaim adds one
    const boardAccess = game as unknown as { board: Board };
    const historyLenAfterPlace = (boardAccess.board as unknown as { _history: unknown[] })._history.length;

    // Right-click at (0,1): TILE_SIZE=64 → col 1 clientX=96, row 0 clientY=32
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);

    // Reclaim it via right-click
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));
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

    hooks._input._handleCanvasRightClick(event);

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Clear animations from placement
    hooks._animMgr.animations.length = 0;

    // Reclaim it via right-click
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    const plusOneAnims = hooks._animMgr.animations.filter((a) => a.text === '+1💧');
    expect(plusOneAnims.length).toBeGreaterThanOrEqual(1);
    expect(plusOneAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
  });

  it('spawns no disconnection animation when reclaiming an unconnected pipe', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);
    const boardAccess = game as unknown as { board: Board };

    // Manually place a Straight at (2,1) – not reachable from source
    const { Tile } = jest.requireActual('../../src/tile');
    boardAccess.board.grid[2][1] = new Tile(PipeShape.Straight, 90);
    // Add it back to inventory so reclaimTile constraint passes
    boardAccess.board.inventory.push({ shape: PipeShape.Straight, count: 1 });
    boardAccess.board.initHistory();

    hooks._animMgr.animations.length = 0;

    // Right-click at (row=2, col=1): clientX = col*TILE_SIZE+32 = 1*64+32=96, clientY = row*TILE_SIZE+32 = 2*64+32=160
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 160 }));

    // No animation since the pipe was not in the fill path
    expect(hooks._animMgr.animations.filter((a) => a.text === '+1💧').length).toBe(0);
  });

  it('uses the locked sandstone refund amount when disconnecting a sandstone path', () => {
    const level: LevelDef = {
      id: 999001,
      name: 'Sandstone disconnect refund',
      rows: 1,
      cols: 3,
      grid: [
        [
          { shape: PipeShape.Source, capacity: 20, pressure: 1, connections: [] },
          {
            shape: PipeShape.Chamber,
            chamberContent: 'sandstone',
            cost: 2,
            temperature: 0,
            hardness: 0,
            connections: [Direction.West],
          },
          { shape: PipeShape.Sink, connections: [] },
        ],
      ],
      inventory: [],
    };
    const board = new Board(level.rows, level.cols, level);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const animMgr = new AnimationManager(canvas, ctx);
    const sparkle = { positive: jest.fn(), negative: jest.fn(), zero: jest.fn() };
    const filledBefore = new Set(['0,1']);
    const lockedBefore = new Map<string, number>([['0,1', -4]]);

    animMgr.spawnDisconnectionAnimations(board, filledBefore, sparkle, undefined, undefined, undefined, lockedBefore);

    const sandstoneRefundAnims = animMgr.animations.filter((a) => a.text === '+4💧');
    expect(sandstoneRefundAnims.length).toBeGreaterThanOrEqual(1);
    expect(sandstoneRefundAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
    expect(animMgr.animations.some((a) => a.text === '+0💧')).toBe(false);
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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Place Straight E-W at (0,2) – extends the chain via (0,1)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 160, clientY: 32 }));

    // Clear animations from the placements above
    hooks._animMgr.animations.length = 0;

    // Replace the Straight at (0,1) with a N-S orientation (rotation=0):
    // it no longer connects East → (0,2) becomes disconnected.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Expect a "+1" disconnection animation for the now-disconnected pipe at (0,2)
    const plusOneAnims = hooks._animMgr.animations.filter((a) => a.text === '+1💧');
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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Clear animations
    hooks._animMgr.animations.length = 0;

    // Replace with Straight N-S (rotation=0) – it doesn't connect to Source's East,
    // so the position itself is disconnected and the old tile's cost is reversed.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // The replaced position (0,1) was in the fill path before and is not after,
    // so a "+1" disconnection animation is shown for the old tile's water cost reversal.
    const plusOneAnims = hooks._animMgr.animations.filter((a) => a.text === '+1💧');
    expect(plusOneAnims.length).toBeGreaterThanOrEqual(1);
    expect(plusOneAnims[0].color).toBe(ANIM_POSITIVE_COLOR);
  });
});

// ─── Tests: redo spawns tile impact animations ────────────────────────────────

