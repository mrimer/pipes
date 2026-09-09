/**
 * @jest-environment jsdom
 */

import type { Game } from '../../src/game';
import { PipeShape } from '../../src/types';
import { LEVELS } from '../levels';
import { ANIM_NEGATIVE_COLOR, ANIM_POSITIVE_COLOR } from '../../src/visuals/tileAnimation';
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
describe('Game – performRedo spawns tile impact animations', () => {
  it('spawns a connection animation when a pipe placement is redone', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a Straight (E-W) at (0,1) → it connects to Source at (0,0)
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Undo the placement
    game.performUndo();
    hooks._animMgr.animations.length = 0;

    // Redo – should respawn the connection animation ("-1" for the pipe)
    game.performRedo();

    const minusOneAnims = hooks._animMgr.animations.filter((a) => a.text === '-1💧');
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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Place E-W Straight at (0,2) – extends the chain; also newly connected
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 90;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 160, clientY: 32 }));

    // Reclaim the first pipe at (0,1) via right-click – disconnects both (0,1) and (0,2)
    // (0,1) center: clientX=96, clientY=32
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    // Undo the reclaim (restores the pipe at (0,1), reconnects (0,1) and (0,2))
    game.performUndo();
    hooks._animMgr.animations.length = 0;

    // Redo the reclaim – (0,1) becomes empty again, (0,2) disconnects.
    // _spawnDisconnectionAnimations should fire "+1" for (0,2) (still in grid).
    game.performRedo();

    // (0,2) is still in the grid and was disconnected → "+1" disconnection animation
    const plusOneAnims = hooks._animMgr.animations.filter((a) => a.text === '+1💧');
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

    // Place a tile so there is something to undo
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    const undoSpy = jest.spyOn(game, 'performUndo');
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));

    expect(undoSpy).toHaveBeenCalled();
  });

  it('Ctrl-Y calls performRedo during gameplay', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a tile, undo it, then redo via Ctrl-Y
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    game.performUndo();

    const redoSpy = jest.spyOn(game, 'performRedo');
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));

    expect(redoSpy).toHaveBeenCalled();
  });

  it('Ctrl-Z does nothing when not on the play screen', () => {
    const { game } = makeGame();
    // game starts on level-select screen
    const hooks = gameHooks(game);
    const undoSpy = jest.spyOn(game, 'performUndo');
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(undoSpy).not.toHaveBeenCalled();
  });
});

// ─── Tests: Backspace key undo shortcut ───────────────────────────────────────

describe('Game – Backspace key undo shortcut', () => {
  it('Backspace calls performUndo during gameplay', () => {
    const { game } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a tile so there is something to undo
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    const undoSpy = jest.spyOn(game, 'performUndo');
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Backspace' }));

    expect(undoSpy).toHaveBeenCalled();
  });

  it('Backspace calls performUndo from the game-over modal', () => {
    const { game, gameoverModalEl } = makeGame();
    game.startLevel(1);
    const hooks = gameHooks(game);

    // Place a tile to create undo history, then simulate game-over state
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    hooks.gameState = 'GAME_OVER';
    gameoverModalEl.style.display = 'flex';

    const undoSpy = jest.spyOn(game, 'performUndo');
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Backspace' }));

    expect(undoSpy).toHaveBeenCalled();
    expect(gameoverModalEl.style.display).toBe('none');
  });

  it('Backspace does nothing when not on the play screen', () => {
    const { game } = makeGame();
    // game starts on level-select screen
    const hooks = gameHooks(game);
    const undoSpy = jest.spyOn(game, 'performUndo');
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Backspace' }));
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
    try {
      level.note = 'Connect the pipes!';
      game.startLevel(1);
      const { noteBoxEl } = getBoxEls(game);
      expect(noteBoxEl.style.display).toBe('block');
      expect(noteBoxEl.textContent).toBe('\u2755  Connect the pipes!');
    } finally {
      level.note = origNote; // restore
    }
  });

  it('hint box is shown (collapsed) when the level has a hint', () => {
    const { game } = makeGame();
    const level = LEVELS.find((l) => l.id === 1)!;
    const origHints = level.hints;
    try {
      level.hints = ['Try placing a straight pipe first.'];
      game.startLevel(1);
      const { hintBoxEl, hintTextEl, hintToggleBtnEl } = getBoxEls(game);
      expect(hintBoxEl.style.display).toBe('block');
      expect(hintTextEl!.style.display).toBe('none');   // collapsed by default
      expect(hintToggleBtnEl!.textContent).toBe('💡 Show Hint');
    } finally {
      level.hints = origHints; // restore
    }
  });

  it('clicking the hint toggle reveals the hint text', () => {
    const { game } = makeGame();
    const level = LEVELS.find((l) => l.id === 1)!;
    const origHints = level.hints;
    try {
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
    } finally {
      level.hints = origHints; // restore
    }
  });

  it('hint always starts collapsed when restarting a level', () => {
    const { game } = makeGame();
    const level = LEVELS.find((l) => l.id === 1)!;
    const origHints = level.hints;
    try {
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
    } finally {
      level.hints = origHints; // restore
    }
  });
});

// ─── Tests: retryLevel preserves undo history ─────────────────────────────────

