/**
 * @jest-environment jsdom
 */

import { Game } from './game';

// ─── Canvas mock ──────────────────────────────────────────────────────────────

const MOCK_CTX = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  lineCap: '',
  font: '',
  textAlign: '',
  textBaseline: '',
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
} {
  document.body.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="level-select">
      <h2>Select a Level</h2>
      <div id="level-list"></div>
    </div>
    <div id="play-screen">
      <span id="water-display"></span>
      <div id="inventory-bar"></div>
    </div>
    <div id="win-modal"></div>
    <div id="gameover-modal"><p id="gameover-msg"></p></div>
  `;

  const get = (id: string) => document.getElementById(id) as HTMLElement;

  const levelSelectEl  = get('level-select');
  const levelListEl    = get('level-list');
  const playScreenEl   = get('play-screen');
  const inventoryBarEl = get('inventory-bar');
  const waterDisplayEl = get('water-display');
  const winModalEl     = get('win-modal');
  const gameoverModalEl = get('gameover-modal');
  const gameoverMsgEl  = get('gameover-msg');

  const canvas = get('game-canvas') as HTMLCanvasElement;

  const game = new Game(
    canvas,
    levelSelectEl,
    levelListEl,
    playScreenEl,
    inventoryBarEl,
    waterDisplayEl,
    winModalEl,
    gameoverModalEl,
    gameoverMsgEl,
  );

  return { game, levelSelectEl, playScreenEl, winModalEl, gameoverModalEl };
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
