import { Game } from './game';
import { sfxManager, SfxId } from './audio/sfxManager';
import { loadSfxVolume, loadTouchUiEnabled } from './persistence';
import { attachInventoryWaveAnimation } from './visuals/chapterWaves';
import { hasTouchUiSupport, isTouchDevice, setTouchUiEnabledOverride } from './deviceUtils';
import { migrateIfNeeded, loadActiveSlotIndex } from './profile/playerProfileSlots';
import { setActiveSlotIndex } from './profile/activeProfile';
import { applyScrollingPipeBackground, setGlobalBackgroundPatternEnabled } from './uiBackground';
import { BG_COLOR } from './colors';
import { setEnvironmentalEnabled } from './graphicsSettings';
import { loadBackgroundEnabled, loadEnvironmentalEnabled } from './persistence';
import { showIntroTitleScreen } from './titleScreen';
import { showSplashScreen } from './splashScreen';
import { initLocale, registerTranslations, t } from './i18n';
import { en } from './i18n/en';

// ─── Step 1: migrate legacy profile data (runs once, no-op thereafter) ───────
migrateIfNeeded();

// ─── Step 2: activate the persisted slot (if any) ────────────────────────────
const savedActiveSlot = loadActiveSlotIndex();
if (savedActiveSlot !== null) {
  setActiveSlotIndex(savedActiveSlot);
}

// ─── Step 3: apply player settings from the active slot ──────────────────────
sfxManager.setVolume(loadSfxVolume());
sfxManager.preload();

// Mark the body so CSS touch-specific rules can apply.
const savedTouchUiEnabled = loadTouchUiEnabled();
if (savedTouchUiEnabled !== null && hasTouchUiSupport()) {
  setTouchUiEnabledOverride(savedTouchUiEnabled);
}
document.body.classList.toggle('is-touch', isTouchDevice());

// Initialize graphics settings cache from persistence.
const _bgEnabled  = loadBackgroundEnabled();
const _envEnabled = loadEnvironmentalEnabled();
setEnvironmentalEnabled(_envEnabled);

// Always apply the background (registering the target), then immediately
// disable the pattern when the Background setting is off.
applyScrollingPipeBackground(document.body, {
  baseColor: BG_COLOR,
  overlayAlpha: 0.82,
});
if (!_bgEnabled) {
  setGlobalBackgroundPatternEnabled(false);
}

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Required DOM element #${id} not found`);
  return el;
}

function localizeStaticChrome(): void {
  const setText = (id: string, key: string): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  const setAttr = (id: string, attr: 'aria-label' | 'title', key: string): void => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, t(key));
  };

  document.title = t('app.title');
  setText('skip-to-game-link', 'a11y.skipToGame');
  setText('sr-app-title', 'a11y.appName');
  setAttr('game-canvas', 'aria-label', 'a11y.gameBoard');
  setText('stats-water-label', 'stats.water');
  setText('best-score-title', 'stats.bestScore');

  setText('undo-btn', 'hud.undo');
  setText('redo-btn', 'hud.redo');
  setText('restart-btn', 'hud.restart');
  setText('rules-btn', 'hud.rules');
  setAttr('record-btn', 'title', 'hud.record.title');
  setAttr('record-btn', 'aria-label', 'hud.record.ariaLabel');
  setAttr('playback-btn', 'title', 'hud.playback.title');
  setAttr('playback-btn', 'aria-label', 'hud.playback.ariaLabel');
  setText('exit-btn', 'hud.exit.menu');

  setText('win-modal-title', 'modal.win.title');
  setText('win-modal-subtitle', 'modal.win.subtitle');
  setText('win-next-btn', 'modal.win.continue');
  setText('win-undo-btn', 'modal.win.undoMove');
  setText('win-retry-btn', 'modal.win.retry');

  setText('gameover-modal-title', 'modal.gameover.title');
  setText('gameover-undo-btn', 'modal.gameover.undoMove');
  setText('gameover-retry-btn', 'modal.gameover.retry');
  setText('gameover-menu-btn', 'modal.gameover.menu');
}

const canvas         = getEl<HTMLCanvasElement>('game-canvas');
const levelSelectEl  = getEl('level-select');
const levelListEl    = getEl('level-list');
const playScreenEl   = getEl('play-screen');
const levelHeaderEl  = getEl('level-header');
const inventoryBarEl = getEl('inventory-bar');
const statsBoxEl     = getEl('stats-box');
const bestScoreBoxEl = getEl('best-score-box');
const waterDisplayEl = getEl('water-display');
const winModalEl     = getEl('win-modal');
const gameoverModalEl = getEl('gameover-modal');
const gameoverMsgEl  = getEl('gameover-msg');
const undoBtnEl      = getEl<HTMLButtonElement>('undo-btn');
const redoBtnEl      = getEl<HTMLButtonElement>('redo-btn');
const exitBtnEl      = getEl<HTMLButtonElement>('exit-btn');
const rulesBtnEl     = getEl<HTMLButtonElement>('rules-btn');

async function bootstrap(): Promise<void> {
  registerTranslations('en', en);
  initLocale(['en']);
  localizeStaticChrome();

  await showSplashScreen();
  await showIntroTitleScreen();

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

  // Attach a persistent water-wave background animation (alpha 0.2) to the inventory box, stats box, and best-score box.
  attachInventoryWaveAnimation(statsBoxEl);
  attachInventoryWaveAnimation(inventoryBarEl);
  attachInventoryWaveAnimation(bestScoreBoxEl);

  // Win modal buttons
  getEl('win-next-btn').addEventListener('click',  () => { game.exitToMenu(); sfxManager.play(SfxId.Click); });
  getEl('win-undo-btn').addEventListener('click',  () => { sfxManager.play(SfxId.Click); game.undoWinningMove(); });
  getEl('win-retry-btn').addEventListener('click', () => { sfxManager.play(SfxId.Click); game.retryLevel(); });

  // Game-over modal buttons
  getEl('gameover-undo-btn').addEventListener('click',  () => game.undoLastMove());
  getEl('gameover-retry-btn').addEventListener('click', () => { sfxManager.play(SfxId.Click); game.retryLevel(); });
  getEl('gameover-menu-btn').addEventListener('click',  () => { game.exitToMenu(); sfxManager.play(SfxId.Click); });

  // HUD undo / redo / restart buttons
  undoBtnEl.addEventListener('click', () => game.performUndo());
  redoBtnEl.addEventListener('click', () => game.performRedo());
  getEl('restart-btn').addEventListener('click', () => { sfxManager.play(SfxId.Click); game.retryLevel(); });

  // Exit to menu button on play screen
  exitBtnEl.addEventListener('click', () => {
    game.requestExitLevel();
    sfxManager.play(SfxId.Back);
  });

  // Rules button on play screen
  rulesBtnEl.addEventListener('click', () => { sfxManager.play(SfxId.Click); game.showRules(); });
}

void bootstrap();
