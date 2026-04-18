/**
 * Utilities for detecting device type and viewport orientation.
 * Used to tailor input handling and layout for mobile/tablet devices.
 */

let touchUiEnabledOverride: boolean | null = null;

/**
 * Returns true when the environment exposes any touch capability.
 */
export function hasTouchUiSupport(): boolean {
  if (navigator.maxTouchPoints > 0) return true;
  return window.matchMedia?.('(any-pointer: coarse)').matches ?? false;
}

/**
 * Returns the default touch-UI mode for this device.
 *
 * Touch-first devices (phones/tablets) generally have coarse pointers and
 * cannot hover, while touchscreen laptops usually still report fine pointer +
 * hover capability. We default to desktop UI in that mixed-input case.
 */
export function detectDefaultTouchUiEnabled(): boolean {
  if (!hasTouchUiSupport()) return false;
  const hasFinePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? false;
  const canHover = window.matchMedia?.('(any-hover: hover)').matches ?? false;
  return !(hasFinePointer && canHover);
}

/** Returns true when touch UI should be active for gameplay/UI rendering. */
export function isTouchDevice(): boolean {
  if (touchUiEnabledOverride !== null) return touchUiEnabledOverride;
  return detectDefaultTouchUiEnabled();
}

/** Set or clear a runtime override for touch UI behavior. */
export function setTouchUiEnabledOverride(enabled: boolean | null): void {
  touchUiEnabledOverride = enabled;
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
