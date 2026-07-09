/**
 * @jest-environment jsdom
 */

import type { PlaybackCallbacks } from '../src/screens/playbackScreen';
import { PlaybackScreen } from '../src/screens/playbackScreen';
import type { Board } from '../src/board';
import type { PlaySequenceRecord, LevelDef} from '../src/types';
import { GameState } from '../src/types';
import * as moveRecorder from '../src/moveRecorder';

function makeCallbacks(): PlaybackCallbacks {
  return {
    getBoard: () => null,
    getGameState: () => GameState.Playing,
    setBoard: jest.fn(),
    setGameState: jest.fn(),
    setScreen: jest.fn(),
    refreshUI: jest.fn(),
    canvas: document.createElement('canvas'),
    hudEl: document.createElement('div'),
    errorFlashEl: document.createElement('div'),
    levelHeaderEl: document.createElement('div'),
    spawnMoveAnimations: jest.fn(),
    resetMetricBaselines: jest.fn(),
  };
}

function makeRecord(): PlaySequenceRecord {
  return {
    id: 'rec-1',
    campaignId: 'cmp',
    levelId: 1,
    moves: [],
    outcome: 'partial',
    autoRecorded: false,
    timestamp: Date.now(),
    playerName: 'Tester',
    corrupted: false,
  };
}

function makeLevel(): LevelDef {
  return {
    id: 1,
    name: 'Level 1',
    rows: 1,
    cols: 1,
    grid: [[null]],
    inventory: [],
  };
}

describe('PlaybackScreen corruption recovery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears _corrupted when rebuilding to a valid step', () => {
    const callbacks = makeCallbacks();
    const screen = new PlaybackScreen(callbacks) as any;
    const board = {} as Board;
    jest.spyOn(moveRecorder, 'replayMoves').mockReturnValue({
      board,
      stoppedAt: 0,
      corrupted: false,
    });

    screen._record = makeRecord();
    screen._level = makeLevel();
    screen._corrupted = true;

    screen._applyStep(0);

    expect(screen._corrupted).toBe(false);
  });

  it('allows _play after stepping back to a valid position', () => {
    const callbacks = makeCallbacks();
    const screen = new PlaybackScreen(callbacks) as any;
    const board = {} as Board;
    jest.spyOn(moveRecorder, 'replayMoves').mockReturnValue({
      board,
      stoppedAt: 0,
      corrupted: false,
    });
    const scheduleSpy = jest.spyOn(screen, '_scheduleNext').mockImplementation(() => undefined);

    screen._record = makeRecord();
    screen._level = makeLevel();
    screen._corrupted = true;
    screen._stepLimit = 1;
    screen._currentStep = 0;

    screen._applyStep(0);
    screen._play();

    expect(screen._playing).toBe(true);
    expect(scheduleSpy).toHaveBeenCalled();
  });
});
