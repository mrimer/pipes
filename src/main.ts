import { Game } from './game';
import { sfxManager } from './sfxManager';
import { loadSfxVolume } from './persistence';

sfxManager.setVolume(loadSfxVolume());
sfxManager.preload();

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Required DOM element #${id} not found`);
  return el;
}

const canvas         = getEl<HTMLCanvasElement>('game-canvas');
const levelSelectEl  = getEl('level-select');
const levelListEl    = getEl('level-list');
const playScreenEl   = getEl('play-screen');
const levelHeaderEl  = getEl('level-header');
const inventoryBarEl = getEl('inventory-bar');
const waterDisplayEl = getEl('water-display');
const winModalEl     = getEl('win-modal');
const gameoverModalEl = getEl('gameover-modal');
const gameoverMsgEl  = getEl('gameover-msg');
const undoBtnEl      = getEl<HTMLButtonElement>('undo-btn');
const redoBtnEl      = getEl<HTMLButtonElement>('redo-btn');
const exitBtnEl      = getEl<HTMLButtonElement>('exit-btn');
const rulesBtnEl     = getEl<HTMLButtonElement>('rules-btn');

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

// Win modal buttons
getEl('win-next-btn').addEventListener('click',  () => game.exitToMenu());
getEl('win-undo-btn').addEventListener('click',  () => game.undoWinningMove());
getEl('win-retry-btn').addEventListener('click', () => game.retryLevel());

// Game-over modal buttons
getEl('gameover-undo-btn').addEventListener('click',  () => game.undoLastMove());
getEl('gameover-retry-btn').addEventListener('click', () => game.retryLevel());
getEl('gameover-menu-btn').addEventListener('click',  () => game.exitToMenu());

// HUD undo / redo / restart buttons
undoBtnEl.addEventListener('click', () => game.performUndo());
redoBtnEl.addEventListener('click', () => game.performRedo());
getEl('restart-btn').addEventListener('click', () => game.retryLevel());

// Exit to menu button on play screen
exitBtnEl.addEventListener('click', () => game.exitToMenu());

// Rules button on play screen
rulesBtnEl.addEventListener('click', () => game.showRules());

