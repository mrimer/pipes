/**
 * Platform-agnostic storage abstraction.
 *
 * All three platforms currently delegate to window.localStorage, which works
 * everywhere the game runs: Chromium (web), Electron renderer, Capacitor
 * WebView (Android). The abstraction exists so the backing store can be
 * swapped per-platform without touching persistence.ts.
 *
 * --- How to use ---
 *
 *   import { getStorage } from './platform/storage';
 *   const s = getStorage();
 *   s.setItem('key', 'value');
 *   const v = s.getItem('key');   // string | null
 *
 * persistence.ts currently calls localStorage directly and works as-is on
 * all platforms. Migrate it to getStorage() only if you need native-store
 * semantics:
 *   - Electron: electron-store  → per-user app-data file, survives profile wipes
 *   - Android:  @capacitor/preferences → OS-managed key-value store, async API
 *
 * --- Extending a platform stub ---
 *
 * Electron (electron-store):
 *   1. Add electron-store to devDependencies.
 *   2. In electron/preload.ts, expose store.get/set/delete via contextBridge.
 *   3. Replace the ElectronStorage method bodies below to call
 *      window.electronAPI.store.* (sync wrappers exposed from preload).
 *
 * Android (@capacitor/preferences):
 *   1. `npm install @capacitor/preferences && npx cap sync android`
 *   2. Note: Preferences is async. Either cache values at startup into a
 *      Map<string,string> and return synchronously, or convert persistence.ts
 *      to async. Replace the AndroidStorage bodies below accordingly.
 */

export interface PlatformStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class WebStorage implements PlatformStorage {
  getItem(key: string): string | null   { return localStorage.getItem(key); }
  setItem(key: string, value: string): void { localStorage.setItem(key, value); }
  removeItem(key: string): void         { localStorage.removeItem(key); }
}

/** Electron renderer stub — delegates to localStorage until electron-store is wired. */
class ElectronStorage implements PlatformStorage {
  getItem(key: string): string | null   { return localStorage.getItem(key); }
  setItem(key: string, value: string): void { localStorage.setItem(key, value); }
  removeItem(key: string): void         { localStorage.removeItem(key); }
}

/** Capacitor / Android stub — delegates to localStorage until @capacitor/preferences is wired. */
class AndroidStorage implements PlatformStorage {
  getItem(key: string): string | null   { return localStorage.getItem(key); }
  setItem(key: string, value: string): void { localStorage.setItem(key, value); }
  removeItem(key: string): void         { localStorage.removeItem(key); }
}

let _instance: PlatformStorage | null = null;

/** Return the singleton PlatformStorage for the current BUILD_TARGET. */
export function getStorage(): PlatformStorage {
  if (!_instance) {
    if (BUILD_TARGET === 'electron')     _instance = new ElectronStorage();
    else if (BUILD_TARGET === 'android') _instance = new AndroidStorage();
    else                                 _instance = new WebStorage();
  }
  return _instance;
}

/** Reset the storage singleton. Test helper only — do not call in game code. */
export function _resetStorageForTests(): void {
  _instance = null;
}
