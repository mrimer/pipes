/**
 * Factory functions for building the game's modal overlay elements.
 *
 * Each function is a pure DOM builder that accepts callbacks for any game
 * actions it needs to trigger.  Extracting them here removes ~200 lines of
 * boilerplate from {@link Game} and makes the modal structure easy to find and
 * modify in isolation.
 *
 * None of the functions retain a reference to the `Game` class, so there are
 * no circular imports.
 */

// ─── Low-level helpers ────────────────────────────────────────────────────────

/**
 * Create a standard full-screen modal overlay element (hidden by default).
 * Internal helper used by all builder functions in this module.
 * @param backgroundAlpha - Opacity of the dark backdrop (default 0.5).
 */
function createModalOverlay(backgroundAlpha = 0.5): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText =
    `display:none;position:fixed;inset:0;background:rgba(0,0,0,${backgroundAlpha});` +
    'justify-content:center;align-items:center;z-index:100;';
  return el;
}

/**
 * Create a standard modal overlay with a centered box, title heading, and an
 * empty actions bar at the bottom.  Appends the overlay to `document.body`.
 * @returns `{ el }` – the overlay, `box` – the inner dialog div,
 *          `actionsEl` – the pre-appended actions container for buttons.
 */
export function buildModalShell(
  title: string,
): { el: HTMLDivElement; box: HTMLDivElement; actionsEl: HTMLDivElement } {
  const el = createModalOverlay();
  const box = document.createElement('div');
  box.className = 'modal-box';
  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  box.appendChild(titleEl);
  const actionsEl = document.createElement('div');
  actionsEl.className = 'modal-actions';
  box.appendChild(actionsEl);
  el.appendChild(box);
  document.body.appendChild(el);
  return { el, box, actionsEl };
}

// ─── Game-specific modal builders ────────────────────────────────────────────

/**
 * Build and attach the reset-progress confirmation modal.
 *
 * @param onConfirm - Called when the player confirms the reset.
 *                    Should reset progress **and** dismiss the modal.
 * @param onCancel  - Called when the player cancels.  Should dismiss the modal.
 */
export function buildResetModal(
  onConfirm: () => void,
  onCancel: () => void,
): HTMLElement {
  const el = createModalOverlay(0.7);
  const box = document.createElement('div');
  box.style.cssText =
    'background:#16213e;border:3px solid #e74c3c;border-radius:10px;' +
    'padding:32px 40px;text-align:center;display:flex;flex-direction:column;' +
    'gap:16px;min-width:280px;';
  const title = document.createElement('h2');
  title.textContent = '⚠️ Reset Progress?';
  const msg = document.createElement('p');
  msg.style.cssText = 'font-size:0.95rem;color:#aaa;';
  msg.textContent = 'This will remove all level completion data. Are you sure?';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;justify-content:center;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText =
    'padding:10px 24px;font-size:1rem;background:#2a2a4a;color:#aaa;' +
    'border:1px solid #555;border-radius:6px;cursor:pointer;';
  cancelBtn.addEventListener('click', () => onCancel());
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Reset';
  confirmBtn.style.cssText =
    'padding:10px 24px;font-size:1rem;background:#e74c3c;color:#fff;' +
    'border:none;border-radius:6px;cursor:pointer;';
  confirmBtn.addEventListener('click', () => onConfirm());
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  box.appendChild(title);
  box.appendChild(msg);
  box.appendChild(actions);
  el.appendChild(box);
  document.body.appendChild(el);
  return el;
}

/**
 * Build and attach the new-chapter intro modal.
 *
 * @param onStart - Called when the player clicks "Start Level".
 * @returns The overlay element and the two sub-elements whose text is updated
 *          each time the modal is shown for a different chapter.
 */
export function buildNewChapterModal(
  onStart: () => void,
): { el: HTMLElement; numberEl: HTMLElement; nameEl: HTMLElement } {
  const { el, box, actionsEl } = buildModalShell('✨ New Chapter');
  const numberEl = document.createElement('p');
  numberEl.style.cssText = 'font-size:1.2rem;font-weight:bold;color:#74b9ff;';
  const nameEl = document.createElement('p');
  nameEl.style.cssText = 'font-size:1.5rem;font-weight:bold;color:#eee;';
  box.insertBefore(numberEl, actionsEl);
  box.insertBefore(nameEl, actionsEl);
  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start Level';
  startBtn.className = 'modal-btn primary';
  startBtn.type = 'button';
  startBtn.addEventListener('click', () => onStart());
  actionsEl.appendChild(startBtn);
  return { el, numberEl, nameEl };
}

/**
 * Build and attach the challenge-level warning modal.
 *
 * @param onPlay - Called when the player chooses to play the challenge level.
 * @param onSkip - Called when the player chooses to skip it.
 * @returns The overlay and the two elements that are toggled when the modal is
 *          shown in "can skip" vs "directly selected" mode.
 */
export function buildChallengeModal(
  onPlay: () => void,
  onSkip: () => void,
): { el: HTMLElement; msgEl: HTMLElement; skipBtnEl: HTMLButtonElement } {
  const { el, box, actionsEl } = buildModalShell('☠️ Challenge Level ☠️');
  const msgEl = document.createElement('p');
  msgEl.style.cssText = 'font-size:0.95rem;color:#aaa;';
  msgEl.textContent = 'This is an optional challenge level. You may skip it without affecting your progress.';
  box.insertBefore(msgEl, actionsEl);
  const playBtn = document.createElement('button');
  playBtn.textContent = 'Play Level';
  playBtn.className = 'modal-btn primary';
  playBtn.type = 'button';
  playBtn.addEventListener('click', () => onPlay());
  const skipBtnEl = document.createElement('button');
  skipBtnEl.textContent = 'Skip Level';
  skipBtnEl.className = 'modal-btn secondary';
  skipBtnEl.type = 'button';
  skipBtnEl.addEventListener('click', () => onSkip());
  actionsEl.appendChild(playBtn);
  actionsEl.appendChild(skipBtnEl);
  return { el, msgEl, skipBtnEl };
}

/**
 * Build and attach the exit-confirmation modal (shown when the player presses
 * Esc mid-level to abandon the current level).
 *
 * @param onExit     - Called when the player confirms leaving (should dismiss the
 *                     modal then exit to the menu).
 * @param onContinue - Called when the player chooses to stay (should dismiss the
 *                     modal then return focus to the canvas).
 */
export function buildExitConfirmModal(
  onExit: () => void,
  onContinue: () => void,
): HTMLElement {
  const { el, box, actionsEl } = buildModalShell('🚪 Abandon Level?');
  const msgEl = document.createElement('p');
  msgEl.textContent = 'Your progress on this level will be lost.';
  box.insertBefore(msgEl, actionsEl);
  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'Exit Level';
  exitBtn.className = 'modal-btn primary';
  exitBtn.type = 'button';
  exitBtn.addEventListener('click', () => onExit());
  const continueBtn = document.createElement('button');
  continueBtn.textContent = 'Continue';
  continueBtn.className = 'modal-btn secondary';
  continueBtn.type = 'button';
  continueBtn.addEventListener('click', () => onContinue());
  actionsEl.appendChild(exitBtn);
  actionsEl.appendChild(continueBtn);
  return el;
}

/**
 * Build and attach the unplayable-level modal (shown when a level starts in an
 * already-lost state).
 *
 * @param onExit - Called when the player clicks "Exit Level" (should dismiss the
 *                 modal then exit to the menu).
 */
export function buildUnplayableModal(onExit: () => void): HTMLElement {
  const { el, box, actionsEl } = buildModalShell('⚠️ Level Unplayable');
  const msgEl = document.createElement('p');
  msgEl.textContent = 'This level starts in a losing position and cannot be played.';
  box.insertBefore(msgEl, actionsEl);
  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'Exit Level';
  exitBtn.className = 'modal-btn primary';
  exitBtn.type = 'button';
  exitBtn.addEventListener('click', () => onExit());
  actionsEl.appendChild(exitBtn);
  return el;
}
