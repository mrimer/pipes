/**
 * @jest-environment jsdom
 */

/**
 * Tests for ResumePlayer (src/resumePlayer.ts).
 *
 * The driver replays a saved move sequence into a live Board instance at
 * 125 ms per move, halting on win/lose or invalid moves.
 */

import { Board } from '../src/board';
import { ResumePlayer } from '../src/resumePlayer';
import type { ResumeGameCallbacks } from '../src/resumePlayer';
import type { MoveAnimationInfo } from '../src/playbackScreen';
import { GameState, PipeShape, Direction } from '../src/types';
import type { LevelDef } from '../src/types';
import { encodePlaceMove } from '../src/moveRecorder';
import * as uiHelpers from '../src/uiHelpers';

jest.useFakeTimers();

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLevel(): LevelDef {
  return {
    id: 1,
    name: 'Test',
    rows: 2,
    cols: 2,
    grid: [
      [
        { shape: PipeShape.Source, rotation: 0, capacity: 2, connections: [Direction.East, Direction.South] },
        null,
      ],
      [
        null,
        { shape: PipeShape.Sink, rotation: 0, connections: [Direction.North, Direction.West] },
      ],
    ],
    inventory: [
      { shape: PipeShape.Elbow, count: 2 },
    ],
  };
}

function makeBoard(level?: LevelDef): Board {
  const lv = level ?? makeLevel();
  const board = new Board(lv.rows, lv.cols, lv);
  board.initHistory();
  return board;
}

/** A straight-through winning sequence for the 2×2 level above. */
function winningMoves(): string[] {
  return [
    encodePlaceMove(PipeShape.Elbow, 0, 1, 90),  // (0,1) Elbow E-S → connects Source to Sink column
    encodePlaceMove(PipeShape.Elbow, 1, 0, 0),   // (1,0) Elbow N-E → connects to Sink
  ];
}

let _gameState: GameState;

function makeCallbacks(): {
  callbacks: ResumeGameCallbacks;
  spawnSpy: jest.Mock;
  updateSpy: jest.Mock;
  checkWinSpy: jest.Mock;
} {
  _gameState = GameState.Playing;
  const spawnSpy = jest.fn();
  const updateSpy = jest.fn();
  const checkWinSpy = jest.fn();

  const callbacks: ResumeGameCallbacks = {
    getGameState: () => _gameState,
    checkWinLose: checkWinSpy,
    spawnMoveAnimations: spawnSpy as unknown as (b: Board, i: MoveAnimationInfo) => void,
    updateUndoRedoButtons: updateSpy,
  };
  return { callbacks, spawnSpy, updateSpy, checkWinSpy };
}

function flashEl(): HTMLElement {
  return document.createElement('div');
}

// ─── Trigger gating ───────────────────────────────────────────────────────────

describe('ResumePlayer – trigger gating', () => {
  it('does not start when moves list is empty', () => {
    const board = makeBoard();
    const { callbacks, spawnSpy } = makeCallbacks();
    const player = new ResumePlayer(callbacks, board, [], flashEl());
    player.start();
    jest.runAllTimers();
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(player.isActive()).toBe(false);
  });

  it('is inactive before start() is called', () => {
    const board = makeBoard();
    const { callbacks } = makeCallbacks();
    const player = new ResumePlayer(callbacks, board, ['P:ELBOW:0:1:90'], flashEl());
    expect(player.isActive()).toBe(false);
  });

  it('becomes active after start() and inactive after all moves complete', () => {
    const board = makeBoard();
    const { callbacks } = makeCallbacks();
    const el = flashEl();
    const player = new ResumePlayer(callbacks, board, winningMoves(), el);
    player.start();
    expect(player.isActive()).toBe(true);
    jest.runAllTimers();
    expect(player.isActive()).toBe(false);
  });
});

// ─── Full completion ──────────────────────────────────────────────────────────

describe('ResumePlayer – full completion', () => {
  it('applies all moves and canUndo() is true after completion', () => {
    const board = makeBoard();
    const { callbacks } = makeCallbacks();
    const el = flashEl();
    const player = new ResumePlayer(callbacks, board, winningMoves(), el);
    player.start();
    jest.runAllTimers();

    expect(board.canUndo()).toBe(true);
    expect(board.getMoveSequence()).toEqual(winningMoves());
  });

  it('shows resume.flash.resuming after full completion', () => {
    const board = makeBoard();
    const { callbacks } = makeCallbacks();
    const el = flashEl();
    const showSpy = jest.spyOn(uiHelpers, 'showTimedMessage');
    const player = new ResumePlayer(callbacks, board, winningMoves(), el);
    player.start();
    jest.runAllTimers();

    expect(showSpy).toHaveBeenCalledWith(el, expect.stringContaining('Resuming'), expect.any(Number));
  });

  it('calls spawnMoveAnimations for each move', () => {
    const board = makeBoard();
    const { callbacks, spawnSpy } = makeCallbacks();
    const player = new ResumePlayer(callbacks, board, winningMoves(), flashEl());
    player.start();
    jest.runAllTimers();

    expect(spawnSpy).toHaveBeenCalledTimes(winningMoves().length);
  });

  it('calls checkWinLose after each move', () => {
    const board = makeBoard();
    const { callbacks, checkWinSpy } = makeCallbacks();
    const player = new ResumePlayer(callbacks, board, winningMoves(), flashEl());
    player.start();
    jest.runAllTimers();

    expect(checkWinSpy).toHaveBeenCalledTimes(winningMoves().length);
  });
});

// ─── Invalid-move halt ────────────────────────────────────────────────────────

describe('ResumePlayer – invalid-move halt', () => {
  it('halts at the invalid move, applies only prior valid moves, shows flash.invalid', () => {
    const board = makeBoard();
    const { callbacks } = makeCallbacks();
    const el = flashEl();
    const showSpy = jest.spyOn(uiHelpers, 'showTimedMessage');

    // First move is valid; second is an invalid delete (granite tile doesn't exist at 0,0 as reclaim).
    const moves = [
      encodePlaceMove(PipeShape.Elbow, 0, 1, 90),
      'INVALID_ENCODED_GARBAGE',
    ];

    const player = new ResumePlayer(callbacks, board, moves, el);
    player.start();
    jest.runAllTimers();

    // Only the first move should have been applied.
    expect(board.getMoveSequence()).toHaveLength(1);
    expect(board.canUndo()).toBe(true);
    expect(showSpy).toHaveBeenCalledWith(el, expect.stringContaining('Invalid'), expect.any(Number));
    expect(player.isActive()).toBe(false);
  });
});

// ─── Win/lose halt ────────────────────────────────────────────────────────────

describe('ResumePlayer – win halt', () => {
  it('stops scheduling further moves once gameState leaves Playing', () => {
    const board = makeBoard();
    const { callbacks, spawnSpy } = makeCallbacks();

    // After the first move, simulate the game transitioning to Won.
    (callbacks as unknown as { checkWinLose: jest.Mock }).checkWinLose = jest.fn(() => {
      _gameState = GameState.Won;
    });

    const moves = [
      encodePlaceMove(PipeShape.Elbow, 0, 1, 90),
      encodePlaceMove(PipeShape.Elbow, 1, 0, 0),
    ];
    const el = flashEl();
    const showSpy = jest.spyOn(uiHelpers, 'showTimedMessage');

    const player = new ResumePlayer(callbacks, board, moves, el);
    player.start();
    jest.runAllTimers();

    // Only the first move should have been applied (second is skipped because gameState !== Playing).
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    // No resume flash shown (win/lose modal takes over).
    expect(showSpy).not.toHaveBeenCalled();
    expect(player.isActive()).toBe(false);
  });
});

describe('ResumePlayer – lose halt', () => {
  it('stops scheduling further moves on GameOver', () => {
    const board = makeBoard();
    const { callbacks, spawnSpy } = makeCallbacks();
    (callbacks as unknown as { checkWinLose: jest.Mock }).checkWinLose = jest.fn(() => {
      _gameState = GameState.GameOver;
    });

    const moves = [
      encodePlaceMove(PipeShape.Elbow, 0, 1, 90),
      encodePlaceMove(PipeShape.Elbow, 1, 0, 0),
    ];
    const el = flashEl();
    const showSpy = jest.spyOn(uiHelpers, 'showTimedMessage');

    const player = new ResumePlayer(callbacks, board, moves, el);
    player.start();
    jest.runAllTimers();

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(showSpy).not.toHaveBeenCalled();
    expect(player.isActive()).toBe(false);
  });
});

// ─── Scheduler guard ─────────────────────────────────────────────────────────

describe('ResumePlayer – scheduler guard', () => {
  it('applies no moves when gameState is not Playing from the start', () => {
    const board = makeBoard();
    const { callbacks, spawnSpy } = makeCallbacks();
    // Override gameState to non-Playing AFTER makeCallbacks resets it.
    _gameState = GameState.Won;

    const player = new ResumePlayer(callbacks, board, winningMoves(), flashEl());
    player.start();
    jest.runAllTimers();

    expect(spawnSpy).not.toHaveBeenCalled();
  });
});

// ─── cancel() ────────────────────────────────────────────────────────────────

describe('ResumePlayer – cancel()', () => {
  it('stops the replay mid-sequence', () => {
    const board = makeBoard();
    const { callbacks, spawnSpy } = makeCallbacks();

    const player = new ResumePlayer(callbacks, board, winningMoves(), flashEl());
    player.start();
    // Advance only one tick so the first move fires, then cancel.
    jest.advanceTimersByTime(125);
    player.cancel();
    jest.runAllTimers();

    // Only the first tick should have fired.
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(player.isActive()).toBe(false);
  });
});

// ─── After-restart capture ────────────────────────────────────────────────────

describe('After-restart capture', () => {
  it('getMoveSequence() returns only moves after the last restart boundary', () => {
    const board = makeBoard();
    // Apply a move, then call initHistory() to simulate a restart boundary.
    board.placeOrReplaceForReplay(0, 1, PipeShape.Elbow, 90);
    board.applyTurnDelta();
    board.recordMove(encodePlaceMove(PipeShape.Elbow, 0, 1, 90));

    // Restart: initHistory resets the boundary.
    board.initHistory();

    // Apply a second move after restart.
    board.placeOrReplaceForReplay(1, 0, PipeShape.Elbow, 0);
    board.applyTurnDelta();
    board.recordMove(encodePlaceMove(PipeShape.Elbow, 1, 0, 0));

    const seq = board.getMoveSequence();
    // Should contain only post-restart move.
    expect(seq).toHaveLength(1);
    expect(seq[0]).toBe(encodePlaceMove(PipeShape.Elbow, 1, 0, 0));
  });
});

// ─── Input lock (isActive flag) ───────────────────────────────────────────────

describe('ResumePlayer – input lock via isActive()', () => {
  it('isActive() is true while replaying and false after finish', () => {
    const board = makeBoard();
    const { callbacks } = makeCallbacks();
    const player = new ResumePlayer(callbacks, board, winningMoves(), flashEl());
    player.start();

    expect(player.isActive()).toBe(true);
    jest.runAllTimers();
    expect(player.isActive()).toBe(false);
  });
});
