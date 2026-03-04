import { Game } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const messageEl = document.getElementById('message') as HTMLElement | null;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement | null;

if (!canvas || !messageEl) {
  throw new Error('Required DOM elements not found');
}

const game = new Game(canvas, messageEl, 6, 6);

restartBtn?.addEventListener('click', () => game.restart());
