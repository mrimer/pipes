/**
 * @jest-environment jsdom
 */

import type { Game } from '../../src/game';
import type { LevelDef, CampaignDef } from '../../src/types';
import { PipeShape, GameState } from '../../src/types';
import { LEVELS, CHAPTERS } from '../levels';
import {
  savePartialProgressEntry,
  getPartialProgressFor,
} from '../../src/persistence';
import { sfxManager, SfxId } from '../../src/audio/sfxManager';
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
describe('Game – retryLevel preserves undo history', () => {
  it('keeps the undo button enabled after retryLevel when moves were made', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;

    // Make a move so there is something to undo
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

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
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));

    // Press R to restart
    hooks._input._handleKey(new KeyboardEvent('keydown', { key: 'R' }));

    // Undo button should be enabled and pressing it restores pre-restart state
    expect(undoBtn.disabled).toBe(false);
    game.performUndo();
    expect(boardAccess.board.grid[0][1].shape).toBe(PipeShape.Straight);
  });

  it('requestExitLevel exits directly after retryLevel with no post-restart moves and deletes stale partial progress', () => {
    const { game, levelSelectEl } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    const preRestartMoves = game.getMoveLog();
    expect(preRestartMoves.length).toBeGreaterThan(0);

    game.retryLevel();
    expect(game.getMoveLog()).toEqual([]);

    savePartialProgressEntry({
      campaignId: 'test-campaign',
      levelId: 1,
      moves: preRestartMoves,
      timestamp: 123,
      formatVersion: 1,
    });

    const exitSpy = jest.spyOn(game, 'exitToMenu');
    game.requestExitLevel();

    expect(exitSpy).toHaveBeenCalled();
    expect(hooks._exitConfirmModalEl.style.display).not.toBe('flex');
    expect(levelSelectEl.style.display).toBe('flex');
    expect(getPartialProgressFor('test-campaign', 1)).toBeNull();
  });

  it('requestExitLevel still shows the notice after retryLevel when new moves were made and saves only post-restart moves', () => {
    const { game } = makeGame();
    game.startLevel(1);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    const preRestartMoves = game.getMoveLog();
    expect(preRestartMoves.length).toBeGreaterThan(0);

    game.retryLevel();

    hooks.selectedShape = PipeShape.Tee;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 160, clientY: 32 }));
    const postRestartMoves = game.getMoveLog();
    expect(postRestartMoves.length).toBeGreaterThan(0);
    expect(postRestartMoves).not.toEqual(preRestartMoves);

    const exitSpy = jest.spyOn(game, 'exitToMenu');
    game.requestExitLevel();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(hooks._exitConfirmModalEl.style.display).toBe('flex');

    game.exitToMenu();

    expect(getPartialProgressFor('test-campaign', 1)?.moves).toEqual(postRestartMoves);
  });

  it('_hasSaveableProgress only tracks non-playtest, non-won, post-restart moves', () => {
    const { game } = makeGame();
    const hasSaveableProgress = (game as unknown as { _hasSaveableProgress(): boolean })._hasSaveableProgress.bind(game);

    game.startLevel(1);
    expect(hasSaveableProgress()).toBe(false);

    const hooks = gameHooks(game);
    hooks.selectedShape = PipeShape.Straight;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    expect(hasSaveableProgress()).toBe(true);

    hooks.gameState = GameState.Won;
    expect(hasSaveableProgress()).toBe(false);

    game.retryLevel();
    expect(hasSaveableProgress()).toBe(false);

    hooks.selectedShape = PipeShape.Tee;
    hooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 160, clientY: 32 }));
    hooks.gameState = GameState.Playing;
    expect(hasSaveableProgress()).toBe(true);

    const { game: playtestGame } = makeGame();
    gameHooks(playtestGame)._playtestLevel(LEVELS[0]);
    const playtestHooks = gameHooks(playtestGame);
    playtestHooks.selectedShape = PipeShape.Straight;
    playtestHooks._input._handleCanvasClick(new MouseEvent('click', { clientX: 96, clientY: 32 }));
    expect((playtestGame as unknown as { _hasSaveableProgress(): boolean })._hasSaveableProgress()).toBe(false);
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
    expect(hooks._campaign._newChapterModalElInternal.style.display).toBe('flex');
    // pending level should be set but the play screen is still on the previous level
    expect(hooks._campaign._pendingLevelIdInternal).toBe(firstLevelOfChapter2.id);
    expect(playScreenEl.style.display).toBe('flex');
  });

  it('populates the new-chapter modal with the correct chapter number and name', () => {
    const { game } = makeGame();
    game.startLevel(lastLevelOfChapter1.id);

    game.nextLevel();

    const hooks = gameHooks(game);
    const box = hooks._campaign._newChapterModalElInternal.querySelector<HTMLElement>('.modal-box')!;
    expect(box.textContent).toContain('Chapter 2');
    expect(box.textContent).toContain(CHAPTERS[1].name);
  });

  it('hides the new-chapter modal and starts the level when startChapterLevel() is called', () => {
    const { game, playScreenEl } = makeGame();
    game.startLevel(lastLevelOfChapter1.id);
    game.nextLevel();

    game.startChapterLevel();

    const hooks = gameHooks(game);
    expect(hooks._campaign._newChapterModalElInternal.style.display).toBe('none');
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
    expect(hooks._campaign._newChapterModalElInternal.style.display).toBe('none');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id)
      .toBe(secondLevelOfChapter1.id);
  });

  it('hides the new-chapter modal when exitToMenu is called', () => {
    const { game } = makeGame();
    game.startLevel(lastLevelOfChapter1.id);
    game.nextLevel();

    game.exitToMenu();

    const hooks = gameHooks(game);
    expect(hooks._campaign._newChapterModalElInternal.style.display).toBe('none');
    expect(hooks._campaign._pendingLevelIdInternal).toBeNull();
  });
});

// ─── Tests: challenge-level modal ────────────────────────────────────────────

describe('Game – challenge-level modal', () => {
  it('shows the challenge modal when requestLevel() is called with a challenge level', () => {
    const { game, playScreenEl } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    const playSpy = jest.spyOn(sfxManager, 'play').mockImplementation(() => {});

    game.requestLevel(9002);

    const hooks = gameHooks(game);
    expect(hooks._campaign._challengeModalElInternal.style.display).toBe('flex');
    expect(hooks._campaign._pendingLevelIdInternal).toBe(9002);
    expect(playSpy).toHaveBeenCalledWith(SfxId.Challenge);
    // The level should be started (visible on screen) before the modal appears.
    expect(playScreenEl.style.display).toBe('flex');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9002);
  });

  it('skips the challenge modal and challenge sfx when partial progress is being resumed', () => {
    const { game, playScreenEl } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    savePartialProgressEntry({
      campaignId: campaign.id,
      levelId: 9002,
      moves: ['P:Straight:0:1:0'],
      timestamp: 123,
      formatVersion: 1,
    });
    const playSpy = jest.spyOn(sfxManager, 'play').mockImplementation(() => {});

    game.requestLevel(9002);

    const hooks = gameHooks(game);
    expect(hooks._campaign._challengeModalElInternal.style.display).toBe('none');
    expect(hooks._campaign._pendingLevelIdInternal).toBeNull();
    expect(playSpy).not.toHaveBeenCalledWith(SfxId.Challenge);
    expect(playScreenEl.style.display).toBe('flex');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9002);
    expect(game.isResuming()).toBe(true);
  });

  // Regression: a running ResumePlayer must be cancelled by every path that
  // replaces or abandons the board, not only by the branch that starts a new
  // resume. A surviving driver keeps ticking against the new/off-screen board
  // (spurious win/lose, desynced HUD, locked input).
  describe('resume-driver cancellation lifecycle', () => {
    function startWithResume(): Game {
      const { game } = makeGame();
      const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
      gameHooks(game)._activateCampaign(campaign);
      savePartialProgressEntry({
        campaignId: campaign.id,
        levelId: 9001,
        moves: ['P:Straight:0:1:0'],
        timestamp: 123,
        formatVersion: 1,
      });
      game.requestLevel(9001); // non-challenge → starts immediately and resumes
      expect(game.isResuming()).toBe(true);
      return game;
    }

    it('cancels the resume driver on retryLevel (restart skips the new-resume branch)', () => {
      const game = startWithResume();
      game.retryLevel();
      expect(game.isResuming()).toBe(false);
    });

    it('cancels the resume driver on exitToMenu (board kept, gameState stays Playing)', () => {
      const game = startWithResume();
      game.exitToMenu();
      expect(game.isResuming()).toBe(false);
    });

    it('cancels the resume driver on destroy', () => {
      const game = startWithResume();
      game.destroy();
      expect(game.isResuming()).toBe(false);
    });

    it('cancels a prior resume driver when starting a different level with no partial progress', () => {
      const game = startWithResume();
      game.startLevel(9003); // non-challenge, no partial → resume branch skipped
      expect(game.isResuming()).toBe(false);
    });
  });

  it('does NOT show the challenge modal for a non-challenge level', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);

    game.requestLevel(9001);

    const hooks = gameHooks(game);
    expect(hooks._campaign._challengeModalElInternal.style.display).toBe('none');
    expect((game as unknown as { currentLevel: LevelDef }).currentLevel?.id).toBe(9001);
  });

  it('shows the challenge modal when nextLevel() advances into a challenge level (same chapter)', () => {
    const { game, playScreenEl } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    game.startLevel(9001);

    game.nextLevel();

    const hooks = gameHooks(game);
    expect(hooks._campaign._challengeModalElInternal.style.display).toBe('flex');
    expect(hooks._campaign._pendingLevelIdInternal).toBe(9002);
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
    expect(hooks._campaign._challengeModalElInternal.style.display).toBe('none');
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
    expect(hooks._campaign._challengeModalElInternal.style.display).toBe('none');
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
    expect(hooks._campaign._challengeModalElInternal.style.display).toBe('none');
    expect(hooks._campaign._pendingLevelIdInternal).toBeNull();
  });

  it('hides the skip button and description when opened via requestLevel() (direct selection)', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);

    game.requestLevel(9002);

    const hooks = gameHooks(game);
    expect(hooks._campaign._challengePlayBtnElInternal.style.display).toBe('none');
    expect(hooks._campaign._challengeSkipBtnElInternal.style.display).toBe('none');
    expect(hooks._campaign._challengeMsgElInternal.style.display).toBe('none');
  });

  it('shows the skip button and description when opened via nextLevel() (sequential flow)', () => {
    const { game } = makeGame();
    const campaign = makeChallengeTestCampaign(LEVELS[0], LEVELS[1]);
    gameHooks(game)._activateCampaign(campaign);
    game.startLevel(9001);

    game.nextLevel();

    const hooks = gameHooks(game);
    expect(hooks._campaign._challengePlayBtnElInternal.style.display).not.toBe('none');
    expect(hooks._campaign._challengeSkipBtnElInternal.style.display).not.toBe('none');
    expect(hooks._campaign._challengeMsgElInternal.style.display).not.toBe('none');
  });
});
