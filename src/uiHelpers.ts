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
/**
 * Show `element` with the given `message` and auto-hide it after `durationMs`
 * milliseconds (default 2000).  Returns the timer ID so callers can cancel it
 * early with `clearTimeout` if needed.
 *
 * @param element    - The element to show/hide.
 * @param message    - Text content to display.
 * @param durationMs - How long to keep the element visible, in milliseconds.
 * @returns The timer ID returned by `setTimeout`.
 */
export function showTimedMessage(
  element: HTMLElement,
  message: string,
  durationMs = 2000,
): ReturnType<typeof setTimeout> {
  element.textContent = message;
  element.style.display = 'block';
  return setTimeout(() => { element.style.display = 'none'; }, durationMs);
}

/**
 * Update the disabled state and visual opacity of a matched undo/redo button
 * pair.  Both buttons are looked up by their DOM id; missing buttons are
 * silently ignored so callers do not need to guard for the read-only case.
 */
export function updateUndoRedoButtonPair(
  undoBtnId: string,
  redoBtnId: string,
  canUndo: boolean,
  canRedo: boolean,
): void {
  const undoBtn = document.getElementById(undoBtnId) as HTMLButtonElement | null;
  const redoBtn = document.getElementById(redoBtnId) as HTMLButtonElement | null;
  if (undoBtn) { undoBtn.disabled = !canUndo;  undoBtn.style.opacity = undoBtn.disabled ? '0.4' : '1'; }
  if (redoBtn) { redoBtn.disabled = !canRedo;  redoBtn.style.opacity = redoBtn.disabled ? '0.4' : '1'; }
}

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

/**
 * Create a small circular icon button (emoji glyph), used for the pencil/slider/
 * color-picker affordances on the gnome avatar and its editor dialog.
 */
export function createRoundIconButton(
  glyph: string,
  title: string,
  ariaLabel: string,
  onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = glyph;
  b.title = title;
  b.setAttribute('aria-label', ariaLabel);
  b.style.cssText =
    'width:22px;height:22px;border-radius:50%;background:#16213e;border:1px solid #4a90d9;' +
    'color:#eee;cursor:pointer;font-size:0.75rem;line-height:1;padding:0;' +
    'display:flex;align-items:center;justify-content:center;';
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Fire `onOutside` on the next mousedown that lands outside `el`, then detach.
 * Returns a manual-detach function for callers that need to dismiss early
 * (e.g. the popover's own close button).
 *
 * @param excludeEl - Optional element (typically the button that opened `el`) whose clicks
 *   are also treated as "inside" — without this, re-clicking the trigger button would be
 *   seen as an outside click on the mousedown that fires *before* the button's own click
 *   handler runs, closing the popover a beat before that handler could decide to toggle it
 *   itself; the popover would then just reopen, looking like the outside click did nothing.
 */
export function attachClickOutsideToClose(
  el: HTMLElement,
  onOutside: () => void,
  excludeEl?: HTMLElement,
): () => void {
  const handler = (e: MouseEvent): void => {
    if (!(e.target instanceof Node)) return;
    if (el.contains(e.target)) return;
    if (excludeEl && excludeEl.contains(e.target)) return;
    detach();
    onOutside();
  };
  // Deferred so the click that opened the popover doesn't immediately close it.
  const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
  const detach = (): void => {
    clearTimeout(timer);
    document.removeEventListener('mousedown', handler);
  };
  return detach;
}
