import { RADIUS_MD } from './uiConstants';

/**
 * Create a styled button element with a consistent look used across the game UI.
 *
 * Produces a button with:
 *   `padding:8px 16px; font-size:0.9rem; background:<bg>; color:<color>;`
 *   `border:1px solid <color>; border-radius:<RADIUS_MD>; cursor:pointer;`
 * followed by any `extraStyle` overrides.
 *
 * @param label      - Button text content.
 * @param bg         - Background color (CSS value).
 * @param color      - Text and border color (CSS value).
 * @param onClick    - Click handler.
 * @param extraStyle - Optional additional CSS text appended after the defaults
 *                     (can override padding, font-size, border, etc.).
 */
export function createButton(
  label: string,
  bg: string,
  color: string,
  onClick: () => void,
  extraStyle?: string,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    `padding:8px 16px;font-size:0.9rem;background:${bg};color:${color};` +
    `border:1px solid ${color};border-radius:${RADIUS_MD};cursor:pointer;${extraStyle ?? ''}`;
  b.addEventListener('click', onClick);
  return b;
}
