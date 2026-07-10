import { subscribeToGameEvents } from './gameEventBus';
import type { GameEvent } from './gameEventBus';
import { ACHIEVEMENTS } from '../achievements/definitions';
import type { AchievementDef } from '../achievements/definitions';
import { loadAchievementStats, saveAchievementStats } from '../achievements/stats';
import type { AchievementStats } from '../achievements/stats';
import type { AchievementAdapter } from '../platform/achievementAdapter';
import { UI_BG, UI_BORDER, UI_GOLD, RADIUS_MD } from '../uiConstants';

const TOAST_DURATION_MS = 3500;
const TOAST_CSS =
  `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);` +
  `background:${UI_BG};color:${UI_GOLD};border:2px solid ${UI_BORDER};` +
  `border-radius:${RADIUS_MD};padding:10px 20px;font-size:0.9rem;` +
  `z-index:9999;pointer-events:none;text-align:center;` +
  `box-shadow:0 4px 16px rgba(0,0,0,0.6);`;

function showUnlockToast(title: string): void {
  const toast = document.createElement('div');
  toast.textContent = `Achievement unlocked: ${title}`;
  toast.style.cssText = TOAST_CSS;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_DURATION_MS);
}

function updateStats(stats: AchievementStats, event: GameEvent): void {
  if (event.type !== 'levelWon') return;
  stats.totalLevelsWon++;
  stats.totalStarsEarned += event.stars;
  stats.totalWaterSaved += event.waterRemaining;
  if (event.isChallenge) stats.challengeLevelsWon++;
}

export class AchievementSystem {
  private _stats: AchievementStats;
  private readonly _adapter: AchievementAdapter;
  private _unsubscribe: (() => void) | null = null;

  constructor(adapter: AchievementAdapter) {
    this._adapter = adapter;
    this._stats = loadAchievementStats();
  }

  init(): void {
    this._unsubscribe = subscribeToGameEvents((event) => void this._onEvent(event));
  }

  destroy(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  /** Reload stats from persistence after a profile switch. */
  reloadStats(): void {
    this._stats = loadAchievementStats();
  }

  private async _onEvent(event: GameEvent): Promise<void> {
    const isWin = event.type === 'levelWon';

    if (isWin) {
      updateStats(this._stats, event);
    }

    // Collect all newly-unlocked achievements in one synchronous pass so we
    // can persist state before any async platform calls.  If the page closes
    // mid-await the counters and unlocked IDs are already saved.
    const toUnlock: AchievementDef[] = [];
    for (const def of ACHIEVEMENTS) {
      if (this._stats.unlockedIds.includes(def.id)) continue;
      if (def.predicate(event, this._stats)) {
        this._stats.unlockedIds.push(def.id);
        toUnlock.push(def);
      }
    }

    if (isWin || toUnlock.length > 0) {
      saveAchievementStats(this._stats);
    }

    for (const def of toUnlock) {
      showUnlockToast(def.title);
      await this._unlock(def);
    }
  }

  private async _unlock(def: AchievementDef): Promise<void> {
    try {
      await this._adapter.unlock(def);
    } catch { /* never let platform errors surface */ }
  }
}
