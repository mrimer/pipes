/**
 * Shared UI constants for inline CSS used across the game and editor.
 * These values appear frequently in element.style.cssText assignments.
 */

// Theme colors
export const UI_BG         = '#16213e';
export const UI_BORDER     = '#4a90d9';
export const UI_TEXT       = '#eee';
export const UI_GOLD       = '#f0c040';
export const UI_OVERLAY_BG = 'rgba(0,0,0,0.7)';

// Editor colors
export const EDITOR_INPUT_BG = '#0d1a30';
export const MUTED_BTN_BG    = '#2a2a4a';
export const ERROR_COLOR     = '#e74c3c';
export const ERROR_DARK      = '#c0392b';

// Border radii
export const RADIUS_SM = '4px';
export const RADIUS_MD = '6px';
export const RADIUS_LG = '10px';

// Reusable cssText fragments
export const MODAL_OVERLAY_CSS =
  `position:fixed;inset:0;background:${UI_OVERLAY_BG};display:flex;align-items:center;justify-content:center;z-index:300;`;
export const MODAL_DIALOG_CSS =
  `background:${UI_BG};border:2px solid ${UI_BORDER};border-radius:${RADIUS_LG};padding:28px 32px;` +
  `display:flex;flex-direction:column;gap:18px;box-shadow:0 8px 32px rgba(0,0,0,0.6);`;
