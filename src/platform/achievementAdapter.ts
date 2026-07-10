/**
 * Platform achievement adapter.
 *
 * Wraps the platform-specific achievement unlock API behind a single interface
 * so the achievement system never branches on BUILD_TARGET directly.
 *
 * Extending to a real SDK:
 *
 *   Steam (Electron):
 *     Install steamworks.js, expose the client via contextBridge in preload.ts,
 *     then replace SteamAchievementAdapter.unlock with:
 *       window.steamworksClient.achievement.activate(def.steamId)
 *
 *   Google Play (Android):
 *     npm install @capawesome-team/capacitor-google-play-games-services
 *     npx cap sync android
 *     Then replace GooglePlayAchievementAdapter.unlock with:
 *       const { GooglePlayGamesServices } = await import('@capawesome-team/...');
 *       await GooglePlayGamesServices.unlockAchievement({ achievementId: def.androidId });
 */

import type { AchievementDef } from '../achievements/definitions';

export interface AchievementAdapter {
  unlock(def: AchievementDef): Promise<void>;
}

class LocalAchievementAdapter implements AchievementAdapter {
  unlock(_def: AchievementDef): Promise<void> {
    // Unlock state is tracked in AchievementStats.unlockedIds; nothing else to do.
    return Promise.resolve();
  }
}

class SteamAchievementAdapter implements AchievementAdapter {
  unlock(def: AchievementDef): Promise<void> {
    if (def.steamId) {
      try {
        const w = window as unknown as Record<string, unknown>;
        const sw = w['steamworksClient'] as Record<string, unknown> | undefined;
        const ach = sw?.['achievement'] as Record<string, unknown> | undefined;
        const activate = ach?.['activate'];
        if (typeof activate === 'function') activate(def.steamId);
      } catch { /* ignore — achievement unlock failures must never crash the game */ }
    }
    return Promise.resolve();
  }
}

class GooglePlayAchievementAdapter implements AchievementAdapter {
  unlock(_def: AchievementDef): Promise<void> {
    // Stub — wire up @capawesome-team/capacitor-google-play-games-services here.
    return Promise.resolve();
  }
}

let _adapter: AchievementAdapter | null = null;

/** Return the singleton adapter for the current BUILD_TARGET. */
export function getAchievementAdapter(): AchievementAdapter {
  if (!_adapter) {
    if (BUILD_TARGET === 'electron')     _adapter = new SteamAchievementAdapter();
    else if (BUILD_TARGET === 'android') _adapter = new GooglePlayAchievementAdapter();
    else                                 _adapter = new LocalAchievementAdapter();
  }
  return _adapter;
}

/** Test helper — resets the singleton. */
export function _resetAchievementAdapterForTests(): void {
  _adapter = null;
}
