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
 * Progress summary shown in the reset-progress confirmation modal.
 * All fields are optional so the modal can degrade gracefully when
 * data is unavailable.
 */
export interface ResetProgressInfo {
  campaignName: string;
  chaptersCompleted: number;
  chaptersTotal: number;
  levelsCompleted: number;
  levelsTotal: number;
  challengesCompleted: number;
  challengesTotal: number;
  starsCollected: number;
  starsTotal: number;
  waterScore: number;
}

/**
 * Build and attach the reset-progress confirmation modal.
 *
 * Returns the overlay element and an `updateInfo` function that should be
 * called (with the current campaign progress data) immediately before the
 * modal is shown, so the modal always reflects up-to-date information.
 *
 * @param onConfirm - Called when the player confirms the reset.
 *                    Should reset progress **and** dismiss the modal.
 * @param onCancel  - Called when the player cancels.  Should dismiss the modal.
 */
export function buildResetModal(
  onConfirm: () => void,
  onCancel: () => void,
): { el: HTMLElement; updateInfo: (info: ResetProgressInfo | null) => void } {
  const el = createModalOverlay(0.7);
  const box = document.createElement('div');
  box.style.cssText =
    'background:#16213e;border:3px solid #e74c3c;border-radius:10px;' +
    'padding:32px 40px;text-align:center;display:flex;flex-direction:column;' +
    'gap:16px;min-width:280px;max-width:420px;';
  const title = document.createElement('h2');
  title.textContent = '⚠️ Reset Progress?';

  const campaignNameEl = document.createElement('p');
  campaignNameEl.style.cssText = 'font-size:1rem;font-weight:bold;color:#74b9ff;margin:0;';

  const progressEl = document.createElement('p');
  progressEl.style.cssText = 'font-size:0.85rem;color:#aaa;margin:0;';

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
  box.appendChild(campaignNameEl);
  box.appendChild(progressEl);
  box.appendChild(msg);
  box.appendChild(actions);
  el.appendChild(box);
  document.body.appendChild(el);

  function updateInfo(info: ResetProgressInfo | null): void {
    if (!info) {
      campaignNameEl.textContent = '';
      progressEl.textContent = '';
      return;
    }
    campaignNameEl.textContent = info.campaignName;
    const parts: string[] = [];
    if (info.chaptersTotal > 0) {
      parts.push(`${info.chaptersCompleted}/${info.chaptersTotal} chapters`);
    }
    parts.push(`${info.levelsCompleted}/${info.levelsTotal} levels`);
    if (info.challengesTotal > 0) {
      parts.push(`${info.challengesCompleted}/${info.challengesTotal} challenges`);
    }
    if (info.starsTotal > 0) {
      parts.push(`⭐ ${info.starsCollected}/${info.starsTotal}`);
    }
    if (info.waterScore > 0) {
      parts.push(`💧 ${info.waterScore}`);
    }
    progressEl.textContent = parts.join('  ·  ');
  }

  return { el, updateInfo };
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
 * Build and attach the Settings modal.
 *
 * The modal contains a "Sound Effects" volume slider (0–100) and a Confirm
 * button.  The slider calls `onVolumeChange` live as the user drags it; the
 * Confirm button calls `onConfirm` (which should persist the value and dismiss
 * the modal).
 *
 * @param getVolume      - Returns the current volume (0–100) to initialise the slider.
 * @param onVolumeChange - Called with the new value whenever the slider moves.
 * @param onConfirm      - Called when the player clicks Confirm; receives the
 *                         modal element so the caller can hide it.
 */
export function buildSettingsModal(
  getVolume: () => number,
  onVolumeChange: (v: number) => void,
  onVolumePreview: () => void,
  onConfirm: (el: HTMLElement) => void,
): HTMLElement {
  const el = createModalOverlay(0.5);
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.style.minWidth = '300px';

  const title = document.createElement('h2');
  title.textContent = '⚙️ Settings';
  box.appendChild(title);

  // ── Sound Effects row ────────────────────────────────────────────────────
  const sfxSection = document.createElement('div');
  sfxSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

  const sfxLabel = document.createElement('div');
  sfxLabel.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const sfxLabelText = document.createElement('span');
  sfxLabelText.textContent = '🔊 Sound Effects';

  const sfxValueEl = document.createElement('span');
  sfxValueEl.style.cssText = 'font-size:0.9rem;color:#aaa;';
  sfxValueEl.dataset.sfxValue = '1';
  sfxValueEl.textContent = String(getVolume());

  sfxLabel.appendChild(sfxLabelText);
  sfxLabel.appendChild(sfxValueEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(getVolume());
  slider.dataset.sfxSlider = '1';
  slider.style.cssText = 'width:100%;cursor:pointer;';
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    sfxValueEl.textContent = String(v);
    onVolumeChange(v);
  });
  slider.addEventListener('mouseup', () => {
    onVolumePreview();
  });

  sfxSection.appendChild(sfxLabel);
  sfxSection.appendChild(slider);
  box.appendChild(sfxSection);

  // ── Confirm button ───────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.className = 'modal-btn primary';
  confirmBtn.type = 'button';
  confirmBtn.addEventListener('click', () => onConfirm(el));

  actions.appendChild(confirmBtn);
  box.appendChild(actions);

  el.appendChild(box);
  document.body.appendChild(el);
  return el;
}

/**
 * Build and attach the campaign-mastered congratulatory modal.
 *
 * Shown once when the player first masters an entire campaign (all levels,
 * stars, and challenges complete). Displayed on top of a confetti animation.
 *
 * @param campaignName - Name of the mastered campaign.
 * @param onKudos      - Called when the player clicks "Kudos!" (should dismiss the modal).
 */
export function buildCampaignMasteredModal(
  campaignName: string,
  onKudos: () => void,
): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;' +
    'justify-content:center;z-index:200;';

  const box = document.createElement('div');
  box.style.cssText =
    'background:#0a0e1a;border:2px solid #f0c040;border-radius:12px;padding:28px 24px;' +
    'max-width:380px;width:90%;text-align:center;';

  const iconEl = document.createElement('div');
  iconEl.style.cssText = 'font-size:3rem;line-height:1;margin-bottom:12px;';
  iconEl.textContent = '🏆';
  box.appendChild(iconEl);

  const titleEl = document.createElement('h2');
  titleEl.textContent = 'Campaign Mastered!';
  titleEl.style.cssText = 'color:#f0c040;margin:0 0 10px;font-size:1.5rem;';
  box.appendChild(titleEl);

  const nameEl = document.createElement('p');
  nameEl.textContent = campaignName;
  nameEl.style.cssText = 'color:#f0c040;font-size:1rem;font-weight:bold;margin:0 0 8px;';
  box.appendChild(nameEl);

  const msgEl = document.createElement('p');
  msgEl.textContent = 'All areas complete!';
  msgEl.style.cssText = 'color:#eee;font-size:1rem;margin:0 0 20px;';
  box.appendChild(msgEl);

  const kudosBtn = document.createElement('button');
  kudosBtn.textContent = 'Kudos!';
  kudosBtn.style.cssText =
    'padding:10px 28px;font-size:1rem;border-radius:6px;cursor:pointer;' +
    'background:#1a3a10;border:1px solid #f0c040;color:#f0c040;';
  kudosBtn.addEventListener('click', () => onKudos());
  box.appendChild(kudosBtn);

  el.appendChild(box);
  document.body.appendChild(el);
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
