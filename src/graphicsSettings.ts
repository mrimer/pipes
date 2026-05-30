/**
 * In-memory cache for graphics settings (Background and Environmental).
 *
 * Both settings default to enabled (true). They are initialized from
 * localStorage at startup by the caller (main.ts) and updated when the
 * player changes them via the Settings modal (game.ts).
 *
 * This module is intentionally dependency-free so that it can be imported
 * by both game.ts and mapScreenBase.ts without creating circular imports.
 */

let _backgroundEnabled = true;
let _environmentalEnabled = true;

/** Sets the in-memory background-enabled flag. */
export function setBackgroundEnabled(enabled: boolean): void {
  _backgroundEnabled = enabled;
}

/** Returns whether environmental visuals (clouds, cloud shadows) are enabled. */
export function isEnvironmentalEnabled(): boolean {
  return _environmentalEnabled;
}

/** Sets the in-memory environmental-enabled flag. */
export function setEnvironmentalEnabled(enabled: boolean): void {
  _environmentalEnabled = enabled;
}
