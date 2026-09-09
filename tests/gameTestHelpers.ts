/**
 * Shared Game test fixtures used across the tests/game/*.test.ts split files
 * (split out of game.test.ts in the game.test.ts hotspot sweep). Each split
 * file still registers its own `beforeEach(gameTestBeforeEach)` /
 * `afterEach(gameTestAfterEach)` and its own confetti `jest.mock(...)` --
 * both are Jest-per-file constructs and can't be shared across test files.
 */

import { Game } from '../src/game';
import type { LevelDef, CampaignDef } from '../src/types';
import { PipeShape } from '../src/types';
import { CHAPTERS } from './levels';
import { saveImportedCampaigns } from '../src/persistence';
import { collectConnectionSfx as _collectConnectionSfx } from '../src/gameConnectionSfx';
import type { SfxId } from '../src/audio/sfxManager';
import { Board } from '../src/board';
import { Tile } from '../src/tile';

// ─── Canvas mock ──────────────────────────────────────────────────────────────

export const MOCK_CTX = {
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
  roundRect:  jest.fn(),
  clip:       jest.fn(),
  scale:      jest.fn(),
  closePath:  jest.fn(),
  createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
};

// Stub out requestAnimationFrame so _loop() never fires.
let originalInnerWidth: PropertyDescriptor | undefined;
let originalInnerHeight: PropertyDescriptor | undefined;
let originalCanvasGetContext: PropertyDescriptor | undefined;
/** Tracks every Game created by makeGame() so gameTestAfterEach can destroy them. */
export const activeGames: Game[] = [];

export function gameTestBeforeEach(): void {
  originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  originalCanvasGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  // Keep TILE_SIZE at 64 for tests by simulating a small viewport.
  Object.defineProperty(window, 'innerWidth',  { value: 0, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true });
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => MOCK_CTX,
    configurable: true,
  });
}

export function gameTestAfterEach(): void {
  // Destroy all Game instances to remove InputHandler event listeners from
  // canvas and document; without this they accumulate across makeGame() calls.
  for (const g of activeGames) g.destroy();
  activeGames.length = 0;
  jest.restoreAllMocks();
  if (originalInnerWidth) {
    Object.defineProperty(window, 'innerWidth', originalInnerWidth);
  }
  if (originalInnerHeight) {
    Object.defineProperty(window, 'innerHeight', originalInnerHeight);
  }
  if (originalCanvasGetContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalCanvasGetContext);
  } else {
    delete (HTMLCanvasElement.prototype as { getContext?: unknown }).getContext;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal DOM and return a fully wired-up Game instance. */
export function makeGame(): {
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
      <div id="best-score-box"><div id="best-score-title">Best Score</div></div>
      <button id="undo-btn"></button>
      <button id="redo-btn"></button>
      <button id="exit-btn">← Menu</button>
    </div>
    <div id="win-modal"><p id="win-water" style="display:none;"></p><button id="win-next-btn">Continue</button></div>
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

  const game = new Game({
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
  });

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

  activeGames.push(game);
  return { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl, exitBtnEl,
    winNextBtnEl: get('win-next-btn') as HTMLButtonElement };
}

/**
 * Build a 1-row board: Source(0,0, temp=0, pressure=1) → chamberTiles... → Sink.
 * All tiles are fixed and mutually connected, so every chamber is filled
 * (flood-filled from source) with nothing pre-existing in `filledBefore` —
 * used to exercise Game._collectConnectionSfx in isolation for one turn.
 */
export function makeChamberConnectionBoard(chamberTiles: Tile[]): Board {
  const cols = chamberTiles.length + 2;
  const board = new Board(1, cols);
  board.source = { row: 0, col: 0 };
  board.sink = { row: 0, col: cols - 1 };
  // Source: temperature=0, pressure=1 (explicit, so tests don't depend on the
  // Tile constructor's own defaults for the environment baseline).
  board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, null, null, 0, 1);
  chamberTiles.forEach((tile, i) => { board.grid[0][i + 1] = tile; });
  board.grid[0][cols - 1] = new Tile(PipeShape.Sink, 0, true);
  board.sourceCapacity = 100;
  return board;
}

/** Call gameConnectionSfx's collectConnectionSfx for a test (moved out of Game in the src/game.ts hotspot sweep). */
export function collectConnectionSfx(_game: Game, board: Board): SfxId[] {
  return _collectConnectionSfx(board, new Set<string>());
}

// ─── Test-only Game hook casting ───────────────────────────────────────────────

export type GameTestHooks = {
  selectedShape: PipeShape | null;
  pendingRotation: number;
  completedLevels: Set<number>;
  resetConfirmModalEl: HTMLElement;
  _exitConfirmModalEl: HTMLElement;
  _rulesModalEl: HTMLElement;
  board: { recordMove(): void; canUndo(): boolean; undoMove(): void } | null;
  _animMgr: { animations: { x: number; y: number; text: string; color: string }[] };
  _tooltip: { el: HTMLElement };
  _campaign: {
    activeCampaign: unknown;
    progress: Set<number>;
    _newChapterModalElInternal: HTMLElement;
    _challengeModalElInternal: HTMLElement;
    _challengeMsgElInternal: HTMLElement;
    _challengePlayBtnElInternal: HTMLButtonElement;
    _challengeSkipBtnElInternal: HTMLButtonElement;
    _pendingLevelIdInternal: number | null;
    _playtestExitCallbackInternal: (() => void) | null;
  };
  _input: {
    handleInventoryClick(shape: PipeShape, count: number): void;
    _handleKey(e: KeyboardEvent): void;
    _handleCanvasClick(e: MouseEvent): void;
    _handleCanvasRightClick(e: MouseEvent): void;
    _handleCanvasWheel(e: WheelEvent): void;
    _handleCanvasMouseDown(e: MouseEvent): void;
    _handleCanvasMouseUp(e: MouseEvent): void;
    _handleCanvasMouseMove(e: MouseEvent): void;
    _handleDocKeyDown(e: KeyboardEvent): void;
    _handleDocKeyUp(e: KeyboardEvent): void;
    ctrlHeld: boolean;
    shiftHeld: boolean;
    mouseCanvasPos: { x: number; y: number } | null;
    lastPlacedRotations: Map<PipeShape, number>;
  };
  _markLevelCompleted(levelId: number): void;
  _renderLevelList(): void;
  _playtestLevel(level: LevelDef): void;
  _activateCampaign(campaign: unknown): void;
  _profileScreen: {
    onProfileSelected(slotIndex: number): void;
  };
  gameState: string;
};

export function gameHooks(g: Game): GameTestHooks {
  return g as unknown as GameTestHooks;
}

// ─── Shared campaign builder (challenge-level modal + level header challenge icon) ──

/** Build a minimal campaign with one regular level followed by one challenge level. */
export function makeChallengeTestCampaign(levelTemplate: LevelDef, challengeLevelTemplate: LevelDef): CampaignDef {
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
