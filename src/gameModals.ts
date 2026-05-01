import { EDITOR_INPUT_BG, ERROR_COLOR, MUTED_BTN_BG, RADIUS_LG, RADIUS_MD, UI_BG, UI_INPUT_BORDER, UI_OVERLAY_BG } from './uiConstants';
import { createButton } from './uiHelpers';
import { CommandAction, COMMAND_LABELS, commandKeyManager, isPureModifierKey } from './commandKeyManager';
import type { CampaignImportOutcome } from './playerProfile';
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
 * Internal helper used by all builder functions in this module and in
 * recordingModals.ts.
 * @param backgroundAlpha - Opacity of the dark backdrop (default 0.5).
 */
export function createModalOverlay(backgroundAlpha = 0.5): HTMLDivElement {
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
    `background:${UI_BG};border:3px solid ${ERROR_COLOR};border-radius:${RADIUS_LG};` +
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
    'padding:10px 24px;font-size:1rem;background:' + MUTED_BTN_BG + ';color:#aaa;' +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;
  cancelBtn.addEventListener('click', () => onCancel());
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Reset';
  confirmBtn.style.cssText =
    'padding:10px 24px;font-size:1rem;background:' + ERROR_COLOR + ';color:#fff;' +
    `border:none;border-radius:${RADIUS_MD};cursor:pointer;`;
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
 * The modal contains a "Sound Effects" volume slider (0–100), a touch-device
 * toggle, and a Confirm button. The slider calls `onVolumeChange` live as the
 * user drags it; the Confirm button calls `onConfirm` (which should persist
 * values and dismiss the modal).
 *
 * @param getVolume      - Returns the current volume (0–100) to initialise the slider.
 * @param onVolumeChange - Called with the new value whenever the slider moves.
 * @param onConfirm      - Called when the player clicks Confirm; receives the
 *                         modal element so the caller can hide it.
 * @param getRecordingSettings - Returns the current recording settings.
 */
export function buildSettingsModal(
  getVolume: () => number,
  onVolumeChange: (v: number) => void,
  onVolumePreview: () => void,
  getTouchUiEnabled: () => boolean,
  isTouchUiToggleEnabled: () => boolean,
  onTouchUiChange: (enabled: boolean) => void,
  onConfirm: (el: HTMLElement) => void,
  getRecordingSettings?: () => import('./types').RecordingSettings,
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

  // ── Touch Device row ─────────────────────────────────────────────────────
  const touchSection = document.createElement('div');
  touchSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;margin-top:4px;';

  const touchRow = document.createElement('label');
  touchRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;';
  touchRow.title = 'Enables touch-optimized UI behavior (larger tap-friendly interactions). Disable this on touchscreen laptops to keep desktop-style hover controls.';

  const touchLabelText = document.createElement('span');
  touchLabelText.textContent = '📱 Touch Device';

  const touchToggle = document.createElement('input');
  touchToggle.type = 'checkbox';
  touchToggle.dataset.touchUiToggle = '1';
  touchToggle.checked = getTouchUiEnabled();
  touchToggle.disabled = !isTouchUiToggleEnabled();
  touchToggle.title = touchRow.title;
  touchToggle.addEventListener('change', () => {
    onTouchUiChange(touchToggle.checked);
  });

  touchRow.appendChild(touchLabelText);
  touchRow.appendChild(touchToggle);
  touchSection.appendChild(touchRow);
  box.appendChild(touchSection);

  // ── Command key assignments ───────────────────────────────────────────────
  const commandsSection = document.createElement('div');
  commandsSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

  const commandsHeader = document.createElement('div');
  commandsHeader.style.cssText = 'font-weight:bold;color:#7ed321;margin-top:4px;';
  commandsHeader.textContent = '⌨️ Command Keys';
  commandsSection.appendChild(commandsHeader);

  const commandActions: CommandAction[] = ['rotateCW', 'rotateCCW', 'restartLevel', 'undo', 'redo'];
  const rowMap = new Map<CommandAction, { valueEl: HTMLElement; buttonEl: HTMLButtonElement }>();
  let capturing: CommandAction | null = null;
  let captureListenerAttached = false;

  const onDocKeyDown = (e: KeyboardEvent) => {
    if (capturing === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      capturing = null;
      renderCommandRows();
      return;
    }
    if (isPureModifierKey(e.key)) return;
    const result = commandKeyManager.assignFromEvent(capturing, e);
    if (!result.ok) {
      window.alert(result.error ?? 'Could not assign that key.');
      return;
    }
    capturing = null;
    renderCommandRows();
  };

  function syncCaptureListener(): void {
    const shouldAttach = capturing !== null;
    if (shouldAttach && !captureListenerAttached) {
      document.addEventListener('keydown', onDocKeyDown);
      captureListenerAttached = true;
    } else if (!shouldAttach && captureListenerAttached) {
      document.removeEventListener('keydown', onDocKeyDown);
      captureListenerAttached = false;
    }
  }

  function renderCommandRows(): void {
    for (const action of commandActions) {
      const row = rowMap.get(action);
      if (!row) continue;
      row.valueEl.textContent = capturing === action
        ? 'Press keys...'
        : commandKeyManager.getBindingDisplay(action);
      row.buttonEl.textContent = capturing === action ? '✖️' : '⌨️';
    }
    syncCaptureListener();
  }

  for (const action of commandActions) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;';

    const label = document.createElement('span');
    label.textContent = COMMAND_LABELS[action];
    label.style.cssText = 'color:#eee;font-size:0.9rem;';

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const valueEl = document.createElement('span');
    valueEl.style.cssText =
      `font-size:0.85rem;color:#ddd;background:${EDITOR_INPUT_BG};border:1px solid ${UI_INPUT_BORDER};border-radius:6px;padding:4px 8px;min-width:95px;text-align:center;`;

    const assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.title = `Reassign ${COMMAND_LABELS[action]}`;
    assignBtn.style.cssText =
      `padding:4px 8px;font-size:0.9rem;background:${MUTED_BTN_BG};color:#ddd;border:1px solid #555;border-radius:4px;cursor:pointer;`;
    assignBtn.addEventListener('click', () => {
      capturing = capturing === action ? null : action;
      renderCommandRows();
    });

    right.appendChild(valueEl);
    right.appendChild(assignBtn);
    row.appendChild(label);
    row.appendChild(right);
    commandsSection.appendChild(row);
    rowMap.set(action, { valueEl, buttonEl: assignBtn });
  }

  const resetCommandsBtn = document.createElement('button');
  resetCommandsBtn.type = 'button';
  resetCommandsBtn.textContent = 'Reset Commands';
  resetCommandsBtn.style.cssText =
    `padding:8px 12px;font-size:0.9rem;background:${MUTED_BTN_BG};color:#ddd;border:1px solid #666;border-radius:6px;cursor:pointer;align-self:flex-start;`;
  resetCommandsBtn.addEventListener('click', () => {
    const confirmed = window.confirm('Reset all command key assignments to defaults?');
    if (!confirmed) return;
    commandKeyManager.resetToDefaults();
    capturing = null;
    renderCommandRows();
  });
  commandsSection.appendChild(resetCommandsBtn);
  box.appendChild(commandsSection);

  renderCommandRows();

  // ── Recording section ──────────────────────────────────────────────────────
  const recordingSection = document.createElement('div');
  recordingSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

  const recordingHeader = document.createElement('div');
  recordingHeader.style.cssText = 'font-weight:bold;color:#7ed321;margin-top:4px;';
  recordingHeader.textContent = '📼 Recording';
  recordingSection.appendChild(recordingHeader);

  const initialRecordingSettings = getRecordingSettings ? getRecordingSettings() : { recordSuccesses: true, recordFailures: false };

  const makeRecordingToggleRow = (
    labelText: string,
    dataAttr: string,
    defaultChecked: boolean,
  ): HTMLInputElement => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;';
    const span = document.createElement('span');
    span.textContent = labelText;
    span.style.cssText = 'color:#eee;font-size:0.9rem;';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = defaultChecked;
    toggle.dataset[dataAttr] = '1';
    row.appendChild(span);
    row.appendChild(toggle);
    recordingSection.appendChild(row);
    return toggle;
  };

  makeRecordingToggleRow('✅ Record Successes', 'recordSuccesses', initialRecordingSettings.recordSuccesses);
  makeRecordingToggleRow('Record Failures', 'recordFailures', initialRecordingSettings.recordFailures);

  box.appendChild(recordingSection);

  // ── Confirm button ───────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.className = 'modal-btn primary';
  confirmBtn.type = 'button';
  confirmBtn.addEventListener('click', () => {
    capturing = null;
    renderCommandRows();
    onConfirm(el);
  });

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
    `position:fixed;inset:0;background:${UI_OVERLAY_BG};display:flex;align-items:center;justify-content:center;z-index:200;`;

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

  const kudosBtn = createButton('Kudos!', '#1a3a10', '#f0c040', () => onKudos(), 'padding:10px 28px;font-size:1rem;');
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

// ─── New Player modal ──────────────────────────────────────────────────────────

/**
 * Show a modal that lets the player rename an existing profile.
 *
 * Displays a pre-populated text input with OK and Cancel buttons.
 * Calls `onOK` with the trimmed name (falling back to `currentName`) when
 * confirmed, or `onCancel` when dismissed.
 *
 * @param currentName - The name to pre-fill in the input field.
 * @param onOK        - Called with the new name when the player clicks OK.
 * @param onCancel    - Called when the player cancels.
 */
export function buildEditPlayerNameModal(
  currentName: string,
  onOK: (name: string) => void,
  onCancel: () => void,
): void {
  const el = createModalOverlay(0.7);

  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:2px solid #4a90d9;border-radius:${RADIUS_LG};` +
    'padding:28px 36px;display:flex;flex-direction:column;gap:16px;' +
    'min-width:280px;max-width:380px;';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:1.2rem;color:#74b9ff;';
  title.textContent = '✏️ Edit Player Name';
  box.appendChild(title);

  const label = document.createElement('label');
  label.textContent = 'Player name:';
  label.style.cssText = 'color:#eee;font-size:0.95rem;';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.maxLength = 40;
  input.style.cssText =
    `width:100%;box-sizing:border-box;padding:8px 10px;font-size:0.95rem;background:${EDITOR_INPUT_BG};` +
    `color:#eee;border:1px solid ${UI_INPUT_BORDER};border-radius:6px;`;

  label.appendChild(document.createElement('br'));
  label.appendChild(input);
  box.appendChild(label);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.type = 'button';
  cancelBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:${MUTED_BTN_BG};color:#aaa;` +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;

  const okBtn = document.createElement('button');
  okBtn.textContent = 'OK';
  okBtn.type = 'button';
  okBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:#1a4a9a;color:#fff;` +
    `border:1px solid #4a90d9;border-radius:${RADIUS_MD};cursor:pointer;`;

  const dismiss = (): void => { el.remove(); };

  cancelBtn.addEventListener('click', () => { dismiss(); onCancel(); });
  okBtn.addEventListener('click', () => {
    const name = input.value.trim() || currentName;
    dismiss();
    onOK(name);
  });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { okBtn.click(); }
    if (e.key === 'Escape') { cancelBtn.click(); }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  box.appendChild(actions);
  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
  setTimeout(() => input.focus(), 0);
}

/**
 * Build and show a modal prompting the user to enter a name for a new profile.
 *
 * The modal is self-managed: it appends itself to `document.body`, shows
 * immediately, and removes itself when dismissed.
 *
 * @param defaultName - Pre-filled value for the name input.
 * @param onOK        - Called with the trimmed name when the user confirms.
 * @param onCancel    - Called when the user cancels.
 */
export function buildNewPlayerModal(
  defaultName: string,
  onOK: (name: string) => void,
  onCancel: () => void,
): void {
  const el = createModalOverlay(0.7);

  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:2px solid #4a90d9;border-radius:${RADIUS_LG};` +
    'padding:28px 36px;display:flex;flex-direction:column;gap:16px;' +
    'min-width:280px;max-width:380px;';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:1.2rem;color:#74b9ff;';
  title.textContent = '👤 New Player';
  box.appendChild(title);

  const label = document.createElement('label');
  label.textContent = 'Player name:';
  label.style.cssText = 'color:#eee;font-size:0.95rem;';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultName;
  input.maxLength = 40;
  input.style.cssText =
    `width:100%;box-sizing:border-box;padding:8px 10px;font-size:0.95rem;background:${EDITOR_INPUT_BG};` +
    `color:#eee;border:1px solid ${UI_INPUT_BORDER};border-radius:6px;`;

  label.appendChild(document.createElement('br'));
  label.appendChild(input);
  box.appendChild(label);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.type = 'button';
  cancelBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:${MUTED_BTN_BG};color:#aaa;` +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;

  const okBtn = document.createElement('button');
  okBtn.textContent = 'Create';
  okBtn.type = 'button';
  okBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:#1a4a9a;color:#fff;` +
    `border:1px solid #4a90d9;border-radius:${RADIUS_MD};cursor:pointer;`;

  const dismiss = (): void => { el.remove(); };

  cancelBtn.addEventListener('click', () => { dismiss(); onCancel(); });
  okBtn.addEventListener('click', () => {
    const name = input.value.trim() || defaultName;
    dismiss();
    onOK(name);
  });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { okBtn.click(); }
    if (e.key === 'Escape') { cancelBtn.click(); }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  box.appendChild(actions);
  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
  // Focus the input after the overlay is visible.
  setTimeout(() => input.focus(), 0);
}

/**
 * Show a simple confirmation modal (OK / Cancel) and call the appropriate
 * callback on dismissal.
 *
 * @param message   - Text shown in the modal body.
 * @param onConfirm - Called when the user clicks "Confirm".
 * @param onCancel  - Called when the user cancels.
 */
export function buildConfirmModal(
  message: string,
  onConfirm: () => void,
  onCancel: () => void,
): void {
  const el = createModalOverlay(0.7);
  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:2px solid ${ERROR_COLOR};border-radius:${RADIUS_LG};` +
    'padding:24px 32px;display:flex;flex-direction:column;gap:16px;' +
    'min-width:260px;max-width:360px;';

  const msg = document.createElement('p');
  msg.style.cssText = 'margin:0;color:#eee;font-size:0.95rem;';
  msg.textContent = message;
  box.appendChild(msg);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.type = 'button';
  cancelBtn.style.cssText =
    `padding:8px 18px;font-size:0.95rem;background:${MUTED_BTN_BG};color:#aaa;` +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.type = 'button';
  confirmBtn.style.cssText =
    `padding:8px 18px;font-size:0.95rem;background:${ERROR_COLOR};color:#fff;` +
    `border:none;border-radius:${RADIUS_MD};cursor:pointer;`;

  const dismiss = (): void => { el.remove(); };
  cancelBtn.addEventListener('click',  () => { dismiss(); onCancel(); });
  confirmBtn.addEventListener('click', () => { dismiss(); onConfirm(); });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  box.appendChild(actions);
  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
}


/** Backdrop opacity for the player-import result modal. */
const IMPORT_RESULT_MODAL_OVERLAY_ALPHA = 0.7;

/**
 * Show a transient modal listing the outcome of a player-profile import.
 *
 * The modal is built, appended to `document.body`, made visible immediately,
 * and auto-removes itself when the player closes it.  It does not need to be
 * retained by the caller.
 *
 * @param outcomes            - Per-campaign import outcomes returned by applyPlayerProfile.
 * @param isNewSlot           - True when the import target was an empty slot (fresh import,
 *                              not a merge into an existing profile).  Controls the language
 *                              used in the modal: "imported" vs "merged".
 * @param importedPlayerName  - Name of the player from the imported file.  When provided
 *                              and `isNewSlot` is true, the name is displayed in the modal.
 */
export function showPlayerImportResultModal(outcomes: CampaignImportOutcome[], isNewSlot: boolean, importedPlayerName?: string): void {
  // Format "N noun[s]" with an optional verb suffix appended when !isNewSlot.
  const statLine = (n: number, singular: string, plural: string, verb: string): string =>
    `${n} ${n === 1 ? singular : plural}${isNewSlot ? '' : ` ${verb}`}`;

  const el = createModalOverlay(IMPORT_RESULT_MODAL_OVERLAY_ALPHA);
  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:3px solid #4a90d9;border-radius:${RADIUS_LG};` +
    'padding:28px 36px;display:flex;flex-direction:column;gap:14px;' +
    'min-width:280px;max-width:540px;max-height:80vh;overflow-y:auto;';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:1.2rem;color:#4a90d9;';
  title.textContent = '📥 Import Complete';
  box.appendChild(title);

  if (isNewSlot && importedPlayerName) {
    const nameEl = document.createElement('p');
    nameEl.style.cssText = 'margin:2px 0;font-size:0.9rem;color:#eee;';
    nameEl.textContent = `Player: ${importedPlayerName}`;
    box.appendChild(nameEl);
  }

  const merged  = outcomes.filter(
    (o): o is Extract<CampaignImportOutcome, { status: 'merged' }> => o.status === 'merged',
  );
  const ignored = outcomes.filter(
    (o): o is Extract<CampaignImportOutcome, { status: 'ignored' }> => o.status === 'ignored',
  );

  if (merged.length > 0) {
    const mergedHeader = document.createElement('h3');
    mergedHeader.style.cssText = 'margin:4px 0 0;font-size:0.95rem;color:#7ed321;';
    mergedHeader.textContent = isNewSlot ? '✅ Campaign progress imported' : '✅ Campaign progress merged';
    box.appendChild(mergedHeader);

    const ul = document.createElement('ul');
    ul.style.cssText = 'margin:4px 0 0 16px;padding:0;display:flex;flex-direction:column;gap:6px;';
    for (const o of merged) {
      const li = document.createElement('li');
      li.style.cssText = 'font-size:0.85rem;color:#ddd;';
      const namePart = document.createElement('strong');
      namePart.textContent = o.campaignName;
      li.appendChild(namePart);

      const stats: string[] = [];
      if (o.newLevelsCompleted > 0)
        stats.push(statLine(o.newLevelsCompleted, 'level', 'levels', 'completed'));
      if (o.newChaptersCompleted > 0)
        stats.push(statLine(o.newChaptersCompleted, 'chapter', 'chapters', 'completed'));
      if (o.newStars > 0)
        stats.push(statLine(o.newStars, '⭐', '⭐', 'added'));
      if (o.newWater > 0)
        stats.push(statLine(o.newWater, '💧', '💧', 'added'));
      if (o.newRecordings > 0)
        stats.push(`${o.newRecordings} recording${o.newRecordings !== 1 ? 's' : ''} imported`);

      if (stats.length > 0) {
        const detail = document.createElement('span');
        detail.style.cssText = 'color:#aaa;';
        detail.textContent = ' — ' + stats.join(', ');
        li.appendChild(detail);
      } else {
        const detail = document.createElement('span');
        detail.style.cssText = 'color:#888;';
        detail.textContent = isNewSlot ? ' — no campaign progress' : ' — already up to date';
        li.appendChild(detail);
      }
      ul.appendChild(li);
    }
    box.appendChild(ul);
  } else {
    const none = document.createElement('p');
    none.style.cssText = 'margin:2px 0;font-size:0.85rem;color:#888;';
    none.textContent = isNewSlot ? 'No campaign progress found in this file.' : 'No campaign progress was merged.';
    box.appendChild(none);
  }

  if (ignored.length > 0) {
    const ignoredHeader = document.createElement('h3');
    ignoredHeader.style.cssText = 'margin:4px 0 0;font-size:0.95rem;color:#f0c040;';
    ignoredHeader.textContent = '⚠️ Campaigns not found locally (skipped)';
    box.appendChild(ignoredHeader);
    const ul = document.createElement('ul');
    ul.style.cssText = 'margin:4px 0 0 16px;padding:0;';
    for (const o of ignored) {
      const li = document.createElement('li');
      li.style.cssText = 'font-size:0.85rem;color:#ddd;margin:2px 0;';
      li.textContent = o.campaignName;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  const note = document.createElement('p');
  note.style.cssText = 'margin:4px 0 0;font-size:0.8rem;color:#aaa;';
  note.textContent = isNewSlot
    ? 'Settings loaded. Campaign progress has been imported.'
    : 'Settings updated. Campaign progress has been merged.';
  box.appendChild(note);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    `align-self:flex-end;padding:8px 24px;font-size:0.95rem;background:${MUTED_BTN_BG};` +
    `color:#eee;border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;margin-top:4px;`;
  closeBtn.addEventListener('click', () => { el.remove(); });
  box.appendChild(closeBtn);

  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
}
