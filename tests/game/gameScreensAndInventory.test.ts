/**
 * @jest-environment jsdom
 */

import { PipeShape } from '../../src/types';
import { LEVELS } from '../levels';
import { CloudShadowField } from '../../src/visuals/cloudShadows';
import { FireflyField } from '../../src/visuals/fireflyField';
import { ButterflyField } from '../../src/visuals/butterflyField';
import { isEnvironmentalEnabled, setEnvironmentalEnabled } from '../../src/graphicsSettings';
import { Tile } from '../../src/tile';
import {
  makeGame,
  gameHooks,
  gameTestBeforeEach,
  gameTestAfterEach,
} from '../gameTestHelpers';
import type { GameTestHooks } from '../gameTestHelpers';

// Make spawnConfetti synchronous in tests by immediately invoking the onComplete callback.
jest.mock('../../src/visuals/confetti', () => ({
  spawnConfetti: (onComplete?: () => void) => { if (onComplete) onComplete(); },
  clearConfetti: jest.fn(),
}));
beforeEach(gameTestBeforeEach);
afterEach(gameTestAfterEach);
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

  it('sets the "Continue" button text to "↩ Return to Editor" when playtesting from the editor', () => {
    const { game, winNextBtnEl } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);

    expect(winNextBtnEl.textContent).toBe('↩ Return to Editor');
  });

  it('resets the "Continue" button text when exitToMenu is called after playtesting', () => {
    const { game, winNextBtnEl } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);
    game.exitToMenu();

    expect(winNextBtnEl.textContent).toBe('Continue');
  });

  it('initializes environmental effects when entering playtesting', () => {
    const cloudSpy = jest.spyOn(CloudShadowField.prototype, 'resetForScreen');
    const fireflySpy = jest.spyOn(FireflyField.prototype, 'resetForLevel');
    const butterflySpy = jest.spyOn(ButterflyField.prototype, 'resetForLevel');
    const { game } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);

    expect(cloudSpy).toHaveBeenCalled();
    expect(fireflySpy).toHaveBeenCalled();
    expect(butterflySpy).toHaveBeenCalled();
  });

  it('renders fireflies and butterflies after animation-manager overlay ticks', () => {
    const originalEnvironmentalEnabled = isEnvironmentalEnabled();
    setEnvironmentalEnabled(true);
    const { game } = makeGame();
    try {
      game.startLevel(1);
      const hooks = game as unknown as {
        _animMgr: { tick(board: unknown, gameState: unknown): void };
        _loop(): void;
      };
      const tickSpy = jest.spyOn(hooks._animMgr, 'tick');
      const fireflySpy = jest.spyOn(FireflyField.prototype, 'updateAndRender');
      const butterflySpy = jest.spyOn(ButterflyField.prototype, 'updateAndRender');

      hooks._loop();

      expect(tickSpy).toHaveBeenCalled();
      expect(fireflySpy).toHaveBeenCalled();
      expect(butterflySpy).toHaveBeenCalled();
      expect(fireflySpy.mock.invocationCallOrder[0]).toBeGreaterThan(tickSpy.mock.invocationCallOrder[0]);
      expect(butterflySpy.mock.invocationCallOrder[0]).toBeGreaterThan(tickSpy.mock.invocationCallOrder[0]);
    } finally {
      setEnvironmentalEnabled(originalEnvironmentalEnabled);
    }
  });
});

// ─── Tests: playtest header preserved on restart ──────────────────────────────

describe('Game – playtest header preserved on restart', () => {
  it('keeps the "▶ Playtesting" text in the header after retryLevel', () => {
    const { game } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);

    const levelHeaderEl = document.getElementById('level-header')!;
    expect(levelHeaderEl.textContent).toContain('▶ Playtesting');

    game.retryLevel();

    expect(levelHeaderEl.textContent).toContain('▶ Playtesting');
  });

  it('keeps the level name text in the header after retryLevel during playtesting', () => {
    const { game } = makeGame();

    gameHooks(game)._playtestLevel(LEVELS[0]);

    const levelHeaderEl = document.getElementById('level-header')!;
    expect(levelHeaderEl.textContent).toContain(LEVELS[0].name);

    game.retryLevel();

    expect(levelHeaderEl.textContent).toContain(LEVELS[0].name);
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

  it('performUndo routes a Won-state undo through undoWinningMove (closes the win modal)', () => {
    const { game, winModalEl } = makeGame();

    game.startLevel(1);
    gameHooks(game).board!.recordMove();
    gameHooks(game).gameState = 'WON';
    winModalEl.style.display = 'flex';

    const winUndoSpy = jest.spyOn(game, 'undoWinningMove');
    game.performUndo();

    expect(winUndoSpy).toHaveBeenCalled();
    // The win modal must be dismissed, not left stuck over the restored board.
    expect(winModalEl.style.display).toBe('none');
  });

  it('Backspace in the Won state dismisses the win modal', () => {
    const { game, winModalEl } = makeGame();

    game.startLevel(1);
    const hooks = gameHooks(game);
    hooks.board!.recordMove();
    hooks.gameState = 'WON';
    winModalEl.style.display = 'flex';

    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Backspace' }));

    expect(winModalEl.style.display).toBe('none');
  });
});

// ─── Tests: inventory selection kept after placement ──────────────────────────

describe('Game – inventory selection kept when stock remains', () => {
  it('keeps selectedShape after placement when effective count is still > 0', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Level 1 has Straight ×4 in inventory – select it and place at empty (0,1)
    hooks.selectedShape = PipeShape.Straight;

    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // 3 Straight pipes remain → selection should be kept
    expect(hooks.selectedShape).toBe(PipeShape.Straight);
  });

  it('clears selectedShape after placement when effective count drops to 0', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Level 1 has Tee ×1 in inventory – select it and place at empty (0,1)
    hooks.selectedShape = PipeShape.Tee;

    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Select GoldStraight – it is now available via the container bonus
    hooks.selectedShape = PipeShape.GoldStraight;

    // Right-click at (0,1) to reclaim the Straight; this disconnects the container,
    // so GoldStraight's effective count drops back to 0.
    // TILE_SIZE=64: col 1 → clientX 96, row 0 → clientY 32.
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 96, clientY: 32 }));

    // GoldStraight effective count is now 0 → selection must be cleared
    expect(hooks.selectedShape).toBeNull();
  });

  it('does not auto-select the reclaimed shape when its effective count is <= 0 after reclaim', () => {
    const { game } = makeGame();
    game.startLevel(3); // Level 3: ItemContainer at (0,2) grants 1×GoldStraight when filled

    const hooks = gameHooks(game);
    const board = hooks.board as unknown as {
      grid: Array<Array<Tile | null>>;
      inventory: { shape: PipeShape; count: number }[];
    };

    // Directly place a GoldStraight tile at (1,3) without going through game logic.
    // This simulates a state reachable via replaceInventoryTile's Exception 2 path, where
    // a shape can end up on the board with effective inventory count < 0.
    // Container is NOT connected here (no Straight at (0,1)), so bonus = 0.
    board.grid[1][3] = new Tile(PipeShape.GoldStraight, 0, false);

    // Set base count to -1 so that after reclaim (base → 0) the effective count
    // is still 0 (base 0 + bonus 0 = 0) — not enough to place.
    const gsItem = board.inventory.find((it) => it.shape === PipeShape.GoldStraight)!;
    gsItem.count = -1;

    // Ensure no shape is currently selected.
    hooks.selectedShape = null;

    // Right-click at (1,3) to reclaim the GoldStraight.
    // TILE_SIZE=64: col 3 → clientX 224, row 1 → clientY 96.
    hooks._input._handleCanvasRightClick(new MouseEvent('contextmenu', { clientX: 224, clientY: 96 }));

    // After reclaim, effective count = 0 (base 0, no container bonus).
    // The fix must NOT auto-select GoldStraight, since placement is impossible.
    expect(hooks.selectedShape).toBeNull();
  });
});

describe('Game – inventory bar re-renders on tile rotation', () => {
  it('calls _renderInventoryBar when a non-empty tile is rotated via keyboard', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);

    // Place a Straight tile at (1,0) – a player slot in level 1 – so there is
    // a non-fixed tile to rotate.
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 96 }));

    const renderSpy = jest.spyOn(game as unknown as { _renderInventoryBar(): void }, '_renderInventoryBar');

    hooks.selectedShape = null;
    // (1,0) now holds a player-placed Straight tile

    // Enter with no selected shape rotates the focused tile
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 32, clientY: 96 }));

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Now select Straight again with pendingRotation=0 matching the placed tile.
    hooks.selectedShape = PipeShape.Straight;
    hooks.pendingRotation = 0;

    // TILE_SIZE=64: col 1 → clientX 96, row 0 → clientY 32.
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Now deselect the inventory item.
    hooks.selectedShape = null;
    hooks.pendingRotation = 0;

    // Click the placed Straight at (0,1) to rotate it (no inventory item selected).
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // pendingRotation must remain 0 (selectedShape is null, no sync).
    expect(hooks.pendingRotation).toBe(0);
  });
});

// ─── Tests: Shift key cycles inventory selection ──────────────────────────────

describe('Game – Shift key cycles to next available inventory item', () => {
  function pressShift(hooks: GameTestHooks): void {
    // Simulate a fresh keydown (shiftHeld starts false so the cycle fires).
    hooks._input.shiftHeld = false;
    hooks._input._handleDocKeyDown(new KeyboardEvent('keydown', { key: 'Shift' }));
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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
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
    const hooks = gameHooks(game);

    // Add progress so the Reset Progress button becomes enabled.
    hooks._campaign.progress.add(1);
    hooks._renderLevelList();

    const levelListEl = document.getElementById('level-list')!;
    const resetBtn = Array.from(levelListEl.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Progress'))!;

    resetBtn.click();

    expect(hooks.resetConfirmModalEl.style.display).toBe('flex');
  });

  it('hides the reset confirm modal when cancel is clicked', () => {
    const { game } = makeGame();
    const hooks = gameHooks(game);

    // Add progress so the Reset Progress button becomes enabled.
    hooks._campaign.progress.add(1);
    hooks._renderLevelList();

    const levelListEl = document.getElementById('level-list')!;
    const resetBtn = Array.from(levelListEl.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Progress'))!;
    resetBtn.click();

    const modal = hooks.resetConfirmModalEl;
    const cancelBtn = Array.from(modal.querySelectorAll('button'))
      .find((b) => b.textContent === 'Cancel')!;
    cancelBtn.click();

    expect(modal.style.display).toBe('none');
  });

  it('clears completed levels and re-renders level list when reset is confirmed', () => {
    const { game } = makeGame();
    const hooks = gameHooks(game);

    // Mark level 1 as completed internally, then re-render
    hooks._campaign.progress.add(1);
    hooks._renderLevelList();

    const levelListEl = document.getElementById('level-list')!;
    const resetBtn = Array.from(levelListEl.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Progress'))!;
    resetBtn.click();

    const modal = hooks.resetConfirmModalEl;
    const confirmBtn = Array.from(modal.querySelectorAll('button'))
      .find((b) => b.textContent === 'Reset')!;
    confirmBtn.click();

    // Campaign progress should be cleared
    expect(hooks._campaign.progress.size).toBe(0);
    // The chapter header should no longer show a completion indicator
    const chapterHeader = levelListEl.querySelector('.chapter-header span');
    expect(chapterHeader?.textContent).not.toContain('✅');
  });
});

// ─── Tests: level-select chapter numbering ────────────────────────────────────

