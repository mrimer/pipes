/**
 * In-memory cache for the Environmental graphics setting.
 *
 * Defaults to enabled (true). Initialized from localStorage at startup by the
 * caller (main.ts) and updated when the player changes it via the Settings
 * modal (game.ts).  (The Background setting is applied directly through
 * setGlobalBackgroundPatternEnabled and needs no in-memory mirror here.)
 *
 * This module is intentionally dependency-free so that it can be imported
 * by both game.ts and mapScreenBase.ts without creating circular imports.
 */

let _environmentalEnabled = true;

/** Returns whether environmental visuals (clouds, cloud shadows) are enabled. */
export function isEnvironmentalEnabled(): boolean {
  return _environmentalEnabled;
}

/** Sets the in-memory environmental-enabled flag. */
export function setEnvironmentalEnabled(enabled: boolean): void {
  _environmentalEnabled = enabled;
}
