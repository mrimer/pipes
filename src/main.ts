import { Game } from './game';

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Required DOM element #${id} not found`);
  return el;
}

const canvas         = getEl<HTMLCanvasElement>('game-canvas');
const levelSelectEl  = getEl('level-select');
const levelListEl    = getEl('level-list');
const playScreenEl   = getEl('play-screen');
const inventoryBarEl = getEl('inventory-bar');
const waterDisplayEl = getEl('water-display');
const winModalEl     = getEl('win-modal');
const gameoverModalEl = getEl('gameover-modal');
const gameoverMsgEl  = getEl('gameover-msg');

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

// Win modal buttons
getEl('win-retry-btn').addEventListener('click', () => game.retryLevel());
getEl('win-menu-btn').addEventListener('click',  () => game.exitToMenu());

// Game-over modal buttons
getEl('gameover-undo-btn').addEventListener('click',  () => game.undoLastMove());
getEl('gameover-retry-btn').addEventListener('click', () => game.retryLevel());
getEl('gameover-menu-btn').addEventListener('click',  () => game.exitToMenu());

// Exit to menu button on play screen
getEl('exit-btn').addEventListener('click', () => game.exitToMenu());

