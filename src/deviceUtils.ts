/**
 * Utilities for detecting device type and viewport orientation.
 * Used to tailor input handling and layout for mobile/tablet devices.
 */

/**
 * Returns true when the device supports touch input.
 * Uses `navigator.maxTouchPoints > 0` which is supported by all modern
 * iOS and Android browsers, and correctly returns 0 in desktop environments.
 * (The older `'ontouchstart' in window` check is not used because some
 * headless and testing environments report it as present without real touch
 * support.)
 */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0;
}

/**
 * Returns true when the viewport is taller than it is wide (portrait orientation).
 */
export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

/**
 * Returns true when the viewport is narrower than 600 px.
 * Used to trigger compact/mobile layout overrides.
 */
export function isNarrowScreen(): boolean {
  return window.innerWidth < 600;
}
