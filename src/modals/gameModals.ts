import { EDITOR_INPUT_BG, ERROR_COLOR, MUTED_BTN_BG, RADIUS_LG, RADIUS_MD, UI_BG, UI_INPUT_BORDER, UI_OVERLAY_BG } from '../uiConstants';
import { createButton } from '../uiHelpers';
import type { CommandAction} from '../commandKeyManager';
import { commandKeyManager, isPureModifierKey } from '../commandKeyManager';
import type { CampaignImportOutcome } from '../profile/playerProfile';
import { t } from '../i18n';
import type { RecordingSettings } from '../types';
import { setupModal } from './modalUtils';
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
  title.textContent = t('modal.reset.title');

  const campaignNameEl = document.createElement('p');
  campaignNameEl.style.cssText = 'font-size:1rem;font-weight:bold;color:#74b9ff;margin:0;';

  const progressEl = document.createElement('p');
  progressEl.style.cssText = 'font-size:0.85rem;color:#aaa;margin:0;';

  const msg = document.createElement('p');
  msg.style.cssText = 'font-size:0.95rem;color:#aaa;';
  msg.textContent = t('modal.reset.message');
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;justify-content:center;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = t('modal.common.cancel');
  cancelBtn.style.cssText =
    'padding:10px 24px;font-size:1rem;background:' + MUTED_BTN_BG + ';color:#aaa;' +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;
  cancelBtn.addEventListener('click', () => onCancel());
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = t('modal.reset.button');
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
  setupModal(el, { titleEl: title, onClose: onCancel });

  function updateInfo(info: ResetProgressInfo | null): void {
    if (!info) {
      campaignNameEl.textContent = '';
      progressEl.textContent = '';
      return;
    }
    campaignNameEl.textContent = info.campaignName;
    const parts: string[] = [];
    if (info.chaptersTotal > 0) {
      parts.push(t('modal.progress.chapters', {
        completed: info.chaptersCompleted,
        total: info.chaptersTotal,
      }));
    }
    parts.push(t('modal.progress.levels', {
      completed: info.levelsCompleted,
      total: info.levelsTotal,
    }));
    if (info.challengesTotal > 0) {
      parts.push(t('modal.progress.challenges', {
        completed: info.challengesCompleted,
        total: info.challengesTotal,
      }));
    }
    if (info.starsTotal > 0) {
      parts.push(t('modal.progress.stars', {
        collected: info.starsCollected,
        total: info.starsTotal,
      }));
    }
    if (info.waterScore > 0) {
      parts.push(t('modal.progress.water', { score: info.waterScore }));
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
  const { el, box, actionsEl } = buildModalShell(t('modal.newChapter.title'));
  const titleEl = box.querySelector('h2');
  const numberEl = document.createElement('p');
  numberEl.style.cssText = 'font-size:1.2rem;font-weight:bold;color:#74b9ff;';
  const nameEl = document.createElement('p');
  nameEl.style.cssText = 'font-size:1.5rem;font-weight:bold;color:#eee;';
  box.insertBefore(numberEl, actionsEl);
  box.insertBefore(nameEl, actionsEl);
  const startBtn = document.createElement('button');
  startBtn.textContent = t('modal.newChapter.start');
  startBtn.className = 'modal-btn primary';
  startBtn.type = 'button';
  startBtn.addEventListener('click', () => onStart());
  actionsEl.appendChild(startBtn);
  setupModal(el, {
    titleEl,
    onClose: () => {
      el.style.display = 'none';
    },
  });
  return { el, numberEl, nameEl };
}

/**
 * Build and attach the challenge-level warning modal.
 *
 * Two mutually-exclusive modes controlled by the caller via element visibility:
 * - `canSkip=false` (directly selected): all buttons/message are hidden and the
 *   modal auto-fades away after a short delay.
 * - `canSkip=true`  (sequential flow):   "Play Level" and "Skip Level" buttons
 *   plus the skip message are shown; the player must click one to dismiss.
 *
 * @param onPlay - Called when the player proceeds to play the challenge level.
 * @param onSkip - Called when the player chooses to skip the challenge.
 * @returns The overlay and the three interactive elements toggled by the caller.
 */
export function buildChallengeModal(
  onPlay: () => void,
  onSkip: () => void,
): { el: HTMLElement; msgEl: HTMLElement; playBtnEl: HTMLButtonElement; skipBtnEl: HTMLButtonElement } {
  const { el, box, actionsEl } = buildModalShell(t('modal.challenge.title'));
  const titleEl = box.querySelector('h2');
  const msgEl = document.createElement('p');
  msgEl.style.cssText = 'font-size:0.95rem;color:#aaa;';
  msgEl.textContent = t('modal.challenge.message');
  box.insertBefore(msgEl, actionsEl);
  const playBtnEl = document.createElement('button');
  playBtnEl.textContent = t('modal.challenge.play');
  playBtnEl.className = 'modal-btn';
  playBtnEl.type = 'button';
  playBtnEl.addEventListener('click', () => onPlay());
  actionsEl.appendChild(playBtnEl);
  const skipBtnEl = document.createElement('button');
  skipBtnEl.textContent = t('modal.challenge.skip');
  skipBtnEl.className = 'modal-btn secondary';
  skipBtnEl.type = 'button';
  skipBtnEl.addEventListener('click', () => onSkip());
  actionsEl.appendChild(skipBtnEl);
  setupModal(el, {
    titleEl,
    onClose: () => {
      el.style.display = 'none';
    },
  });
  return { el, msgEl, playBtnEl, skipBtnEl };
}

/**
 * Build and attach the save-progress notice modal (shown when the player exits
 * a level mid-game).  The modal is purely informational: progress will be
 * saved, and there is no "Stay" option — exiting is always lossless.
 *
 * @param onOk - Called with `dontShowAgain` flag when the player clicks OK (or
 *               dismisses via Escape/backdrop).
 */
export function buildSaveProgressNoticeModal(
  onOk: (dontShowAgain: boolean) => void,
): HTMLElement {
  const { el, box, actionsEl } = buildModalShell(t('modal.saveProgress.title'));
  const titleEl = box.querySelector('h2');

  const msgEl = document.createElement('p');
  msgEl.textContent = t('modal.saveProgress.message');
  box.insertBefore(msgEl, actionsEl);

  // "Don't show again" checkbox row
  const checkboxRow = document.createElement('label');
  checkboxRow.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;margin-bottom:4px;';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'save-notice-suppress-cb';
  checkbox.style.cssText = 'width:16px;height:16px;cursor:pointer;';
  const checkboxLabel = document.createElement('span');
  checkboxLabel.textContent = t('modal.saveProgress.dontShowAgain');
  checkboxRow.appendChild(checkbox);
  checkboxRow.appendChild(checkboxLabel);
  box.insertBefore(checkboxRow, actionsEl);

  const okBtn = document.createElement('button');
  okBtn.textContent = t('modal.saveProgress.ok');
  okBtn.className = 'modal-btn primary';
  okBtn.type = 'button';
  okBtn.addEventListener('click', () => onOk(checkbox.checked));
  actionsEl.appendChild(okBtn);

  // Esc / backdrop also confirms exit (no "stay" option)
  setupModal(el, { titleEl, onClose: () => onOk(checkbox.checked) });
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
  getMusicVolume: () => number,
  onMusicVolumeChange: (v: number) => void,
  onMusicVolumePreview: () => void,
  getTouchUiEnabled: () => boolean,
  isTouchUiToggleEnabled: () => boolean,
  onTouchUiChange: (enabled: boolean) => void,
  onConfirm: (el: HTMLElement) => void,
  getRecordingSettings?: () => RecordingSettings,
  initialBackgroundEnabled = true,
  onBackgroundChange?: (enabled: boolean) => void,
  initialEnvironmentalEnabled = true,
  onEnvironmentalChange?: (enabled: boolean) => void,
  onCancel?: (el: HTMLElement) => void,
  initialMusicMuteOnFocusLoss = true,
  onMusicMuteOnFocusLossChange?: (enabled: boolean) => void,
  initialEmojisEnabled = false,
): HTMLElement {
  const el = createModalOverlay(0.5);
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.style.minWidth = '300px';

  const title = document.createElement('h2');
  title.textContent = t('settings.title');
  box.appendChild(title);

  // ── Sound Effects row ────────────────────────────────────────────────────
  const sfxSection = document.createElement('div');
  sfxSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

  const sfxLabel = document.createElement('div');
  sfxLabel.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const sliderId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `settings-sfx-slider-${crypto.randomUUID()}`
    : `settings-sfx-slider-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const sfxLabelText = document.createElement('label');
  sfxLabelText.htmlFor = sliderId;
  sfxLabelText.textContent = t('settings.soundEffects');

  const sfxValueEl = document.createElement('span');
  sfxValueEl.style.cssText = 'font-size:0.9rem;color:#aaa;';
  sfxValueEl.dataset.sfxValue = '1';
  sfxValueEl.textContent = String(getVolume());

  sfxLabel.appendChild(sfxLabelText);
  sfxLabel.appendChild(sfxValueEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = sliderId;
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

  // ── Music row ────────────────────────────────────────────────────────────
  const musicSection = document.createElement('div');
  musicSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

  const musicLabel = document.createElement('div');
  musicLabel.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const musicSliderId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `settings-music-slider-${crypto.randomUUID()}`
    : `settings-music-slider-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const musicLabelText = document.createElement('label');
  musicLabelText.htmlFor = musicSliderId;
  musicLabelText.textContent = t('settings.music');

  const musicValueEl = document.createElement('span');
  musicValueEl.style.cssText = 'font-size:0.9rem;color:#aaa;';
  musicValueEl.dataset.musicValue = '1';
  musicValueEl.textContent = String(getMusicVolume());

  musicLabel.appendChild(musicLabelText);
  musicLabel.appendChild(musicValueEl);

  const musicSlider = document.createElement('input');
  musicSlider.type = 'range';
  musicSlider.id = musicSliderId;
  musicSlider.min = '0';
  musicSlider.max = '100';
  musicSlider.value = String(getMusicVolume());
  musicSlider.dataset.musicSlider = '1';
  musicSlider.style.cssText = 'width:100%;cursor:pointer;';
  musicSlider.addEventListener('input', () => {
    const v = Number(musicSlider.value);
    musicValueEl.textContent = String(v);
    onMusicVolumeChange(v);
  });
  musicSlider.addEventListener('mouseup', () => {
    onMusicVolumePreview();
  });

  musicSection.appendChild(musicLabel);
  musicSection.appendChild(musicSlider);
  box.appendChild(musicSection);

  // ── Mute on focus loss toggle ────────────────────────────────────────────
  const muteOnFocusLossRow = document.createElement('label');
  muteOnFocusLossRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;';

  const muteOnFocusLossLabelText = document.createElement('span');
  muteOnFocusLossLabelText.textContent = t('settings.music.muteOnFocusLoss');
  muteOnFocusLossLabelText.style.cssText = 'color:#eee;font-size:0.9rem;';

  const muteOnFocusLossToggle = document.createElement('input');
  muteOnFocusLossToggle.type = 'checkbox';
  muteOnFocusLossToggle.dataset.musicMuteOnFocusLoss = '1';
  muteOnFocusLossToggle.checked = initialMusicMuteOnFocusLoss;
  if (onMusicMuteOnFocusLossChange) {
    muteOnFocusLossToggle.addEventListener('change', () => {
      onMusicMuteOnFocusLossChange(muteOnFocusLossToggle.checked);
    });
  }

  muteOnFocusLossRow.appendChild(muteOnFocusLossLabelText);
  muteOnFocusLossRow.appendChild(muteOnFocusLossToggle);
  box.appendChild(muteOnFocusLossRow);

  // ── Touch Device row ─────────────────────────────────────────────────────
  const touchSection = document.createElement('div');
  touchSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;margin-top:4px;';

  const touchRow = document.createElement('label');
  touchRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;';
  touchRow.title = t('settings.touchDevice.help');

  const touchLabelText = document.createElement('span');
  touchLabelText.textContent = t('settings.touchDevice');

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
  commandsHeader.textContent = t('settings.commands.title');
  commandsSection.appendChild(commandsHeader);

  const commandActions: CommandAction[] = ['rotateCW', 'rotateCCW', 'restartLevel', 'undo', 'redo'];
  const rowMap = new Map<CommandAction, { valueEl: HTMLElement; buttonEl: HTMLButtonElement }>();
  let capturing: CommandAction | null = null;
  let captureListenerAttached = false;

  const commandLabel = (action: CommandAction): string => t(`settings.commands.action.${action}` as const);

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
      buildInfoModal(result.error ?? t('settings.commands.assignError'));
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
        ? t('settings.commands.capturePrompt')
        : commandKeyManager.getBindingDisplay(action);
      row.buttonEl.textContent = capturing === action ? '✖️' : '⌨️';
      row.buttonEl.setAttribute(
        'aria-label',
        capturing === action
          ? t('settings.commands.reassignCancelAria', { action: commandLabel(action) })
          : t('settings.commands.reassignAria', { action: commandLabel(action) }),
      );
    }
    syncCaptureListener();
  }

  for (const action of commandActions) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;';

    const label = document.createElement('span');
    label.textContent = commandLabel(action);
    label.style.cssText = 'color:#eee;font-size:0.9rem;';

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const valueEl = document.createElement('span');
    valueEl.style.cssText =
      `font-size:0.85rem;color:#ddd;background:${EDITOR_INPUT_BG};border:1px solid ${UI_INPUT_BORDER};border-radius:6px;padding:4px 8px;min-width:95px;text-align:center;`;

    const assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.title = t('settings.commands.reassignTitle', { action: commandLabel(action) });
    assignBtn.setAttribute('aria-label', t('settings.commands.reassignAria', { action: commandLabel(action) }));
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
  resetCommandsBtn.textContent = t('settings.commands.reset');
  resetCommandsBtn.style.cssText =
    `padding:8px 12px;font-size:0.9rem;background:${MUTED_BTN_BG};color:#ddd;border:1px solid #666;border-radius:6px;cursor:pointer;align-self:center;`;
  resetCommandsBtn.addEventListener('click', () => {
    buildConfirmModal(
      t('settings.commands.resetConfirm'),
      () => {
        commandKeyManager.resetToDefaults();
        capturing = null;
        renderCommandRows();
      },
      () => { /* cancelled */ },
    );
  });
  commandsSection.appendChild(resetCommandsBtn);
  box.appendChild(commandsSection);

  renderCommandRows();

  // ── Recording section ──────────────────────────────────────────────────────
  const recordingSection = document.createElement('div');
  recordingSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

  const recordingHeader = document.createElement('div');
  recordingHeader.style.cssText = 'font-weight:bold;color:#7ed321;margin-top:4px;';
  recordingHeader.textContent = t('settings.recording.title');
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

  makeRecordingToggleRow(
    t('settings.recording.recordSuccesses'),
    'recordSuccesses',
    initialRecordingSettings.recordSuccesses,
  );
  makeRecordingToggleRow(
    t('settings.recording.recordFailures'),
    'recordFailures',
    initialRecordingSettings.recordFailures,
  );

  box.appendChild(recordingSection);

  // ── Graphics section ──────────────────────────────────────────────────────
  const graphicsSection = document.createElement('div');
  graphicsSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';

  const graphicsHeader = document.createElement('div');
  graphicsHeader.style.cssText = 'font-weight:bold;color:#7ed321;margin-top:4px;';
  graphicsHeader.textContent = t('settings.graphics.title');
  graphicsSection.appendChild(graphicsHeader);

  const makeGraphicsToggleRow = (
    labelText: string,
    dataAttr: string,
    defaultChecked: boolean,
    onChange?: (enabled: boolean) => void,
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
    if (onChange) {
      toggle.addEventListener('change', () => onChange(toggle.checked));
    }
    row.appendChild(span);
    row.appendChild(toggle);
    graphicsSection.appendChild(row);
    return toggle;
  };

  makeGraphicsToggleRow(t('settings.graphics.background'), 'graphicsBackground', initialBackgroundEnabled, onBackgroundChange);
  makeGraphicsToggleRow(t('settings.graphics.environmental'), 'graphicsEnvironmental', initialEnvironmentalEnabled, onEnvironmentalChange);
  makeGraphicsToggleRow(t('settings.emojis'), 'emojisEnabled', initialEmojisEnabled);

  box.appendChild(graphicsSection);

  if (IS_DEMO && STORE_URL) {
    const buyRow = document.createElement('div');
    buyRow.style.cssText = 'display:flex;justify-content:center;padding-top:4px;width:100%;';
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.textContent = t('demo.buyNow');
    buyBtn.style.cssText =
      'font-size:0.85rem;font-weight:bold;background:#3d7a20;color:#e8f5d8;' +
      'border:1px solid #6ab840;border-radius:6px;padding:6px 18px;cursor:pointer;';
    buyBtn.addEventListener('click', () => { window.open(STORE_URL, '_blank'); });
    buyRow.appendChild(buyBtn);
    box.appendChild(buyRow);
  }

  // ── Confirm button ───────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = t('settings.confirm');
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
  setupModal(el, {
    titleEl: title,
    onClose: () => {
      if (onCancel) onCancel(el);
    },
    canCloseOnEscape: () => capturing === null,
  });

  // The modal is reused (hidden via display:none rather than removed), and it
  // can be dismissed by paths that bypass setupModal's close (e.g. the game's
  // own Escape handler calling _cancelSettingsModal directly). If a key
  // reassignment was mid-capture when that happens, `capturing` would stay set
  // and the document keydown listener would remain attached after the modal is
  // gone. Reset capture whenever the modal becomes hidden — the single signal
  // every dismissal path shares — so the listener can never leak.
  const visibilityObserver = new MutationObserver(() => {
    if (capturing !== null && el.style.display === 'none') {
      capturing = null;
      renderCommandRows();
    }
  });
  visibilityObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
  
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
  titleEl.textContent = t('modal.campaignMastered.title');
  titleEl.style.cssText = 'color:#f0c040;margin:0 0 10px;font-size:1.5rem;';
  box.appendChild(titleEl);

  const nameEl = document.createElement('p');
  nameEl.textContent = campaignName;
  nameEl.style.cssText = 'color:#f0c040;font-size:1rem;font-weight:bold;margin:0 0 8px;';
  box.appendChild(nameEl);

  const msgEl = document.createElement('p');
  msgEl.textContent = IS_DEMO
    ? t('demo.upsell.message')
    : t('modal.campaignMastered.message');
  msgEl.style.cssText = 'color:#eee;font-size:1rem;margin:0 0 20px;';
  box.appendChild(msgEl);

  if (IS_DEMO && STORE_URL) {
    const buyBtn = createButton(
      t('demo.buyNow'),
      '#3d7a20',
      '#e8f5d8',
      () => { window.open(STORE_URL, '_blank'); },
      'padding:10px 28px;font-size:1rem;border:1px solid #6ab840;margin-bottom:8px;',
    );
    box.appendChild(buyBtn);
  }

  const kudosBtn = createButton(
    t('modal.campaignMastered.button'),
    '#1a3a10',
    '#f0c040',
    () => onKudos(),
    'padding:10px 28px;font-size:1rem;',
  );
  box.appendChild(kudosBtn);

  el.appendChild(box);
  document.body.appendChild(el);
  setupModal(el, { titleEl, onClose: onKudos });
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
  const { el, box, actionsEl } = buildModalShell(t('modal.unplayable.title'));
  const titleEl = box.querySelector('h2');
  const msgEl = document.createElement('p');
  msgEl.textContent = t('modal.unplayable.message');
  box.insertBefore(msgEl, actionsEl);
  const exitBtn = document.createElement('button');
  exitBtn.textContent = t('modal.unplayable.button');
  exitBtn.className = 'modal-btn primary';
  exitBtn.type = 'button';
  exitBtn.addEventListener('click', () => onExit());
  actionsEl.appendChild(exitBtn);
  setupModal(el, { titleEl, onClose: onExit });
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
  title.textContent = t('modal.editPlayerName.title');
  box.appendChild(title);

  const label = document.createElement('label');
  label.textContent = t('modal.editPlayerName.label');
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
  cancelBtn.textContent = t('modal.common.cancel');
  cancelBtn.type = 'button';
  cancelBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:${MUTED_BTN_BG};color:#aaa;` +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;

  const okBtn = document.createElement('button');
  okBtn.textContent = t('modal.editPlayerName.ok');
  okBtn.type = 'button';
  okBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:#1a4a9a;color:#fff;` +
    `border:1px solid #4a90d9;border-radius:${RADIUS_MD};cursor:pointer;`;

  const { closeModal } = setupModal(el, { titleEl: title, onClose: () => { el.remove(); } });

  cancelBtn.addEventListener('click', () => { closeModal(); onCancel(); });
  okBtn.addEventListener('click', () => {
    const name = input.value.trim() || currentName;
    closeModal();
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
  title.textContent = t('modal.newPlayer.title');
  box.appendChild(title);

  const label = document.createElement('label');
  label.textContent = t('modal.newPlayer.label');
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
  cancelBtn.textContent = t('modal.common.cancel');
  cancelBtn.type = 'button';
  cancelBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:${MUTED_BTN_BG};color:#aaa;` +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;

  const okBtn = document.createElement('button');
  okBtn.textContent = t('modal.newPlayer.create');
  okBtn.type = 'button';
  okBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:#1a4a9a;color:#fff;` +
    `border:1px solid #4a90d9;border-radius:${RADIUS_MD};cursor:pointer;`;

  const { closeModal } = setupModal(el, { titleEl: title, onClose: () => { el.remove(); } });

  cancelBtn.addEventListener('click', () => { closeModal(); onCancel(); });
  okBtn.addEventListener('click', () => {
    const name = input.value.trim() || defaultName;
    closeModal();
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
  cancelBtn.textContent = t('modal.common.cancel');
  cancelBtn.type = 'button';
  cancelBtn.style.cssText =
    `padding:8px 18px;font-size:0.95rem;background:${MUTED_BTN_BG};color:#aaa;` +
    `border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;`;

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = t('modal.common.confirm');
  confirmBtn.type = 'button';
  confirmBtn.style.cssText =
    `padding:8px 18px;font-size:0.95rem;background:${ERROR_COLOR};color:#fff;` +
    `border:none;border-radius:${RADIUS_MD};cursor:pointer;`;

  const { closeModal } = setupModal(el, { titleEl: null, onClose: () => { el.remove(); } });
  cancelBtn.addEventListener('click',  () => { closeModal(); onCancel(); });
  confirmBtn.addEventListener('click', () => { closeModal(); onConfirm(); });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  box.appendChild(actions);
  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
}

export function buildInfoModal(message: string): void {
  const el = createModalOverlay(0.7);
  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:2px solid #4a90d9;border-radius:${RADIUS_LG};` +
    'padding:24px 32px;display:flex;flex-direction:column;gap:16px;' +
    'min-width:260px;max-width:420px;';
  const msg = document.createElement('p');
  msg.style.cssText = 'margin:0;color:#eee;font-size:0.95rem;';
  msg.textContent = message;
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.textContent = t('modal.editPlayerName.ok');
  okBtn.style.cssText =
    `padding:8px 18px;font-size:0.95rem;background:#4a90d9;color:#fff;` +
    `border:none;border-radius:${RADIUS_MD};cursor:pointer;`;
  const { closeModal } = setupModal(el, { titleEl: null, onClose: () => { el.remove(); } });
  okBtn.addEventListener('click', () => closeModal());
  actions.appendChild(okBtn);
  box.appendChild(msg);
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
  // Format "N noun[s]" — noun/verb args are i18n keys; emoji args pass through (t() returns the key when not found).
  const statLine = (n: number, singularKey: string, pluralKey: string, verbKey: string): string => {
    const noun = t(n === 1 ? singularKey : pluralKey);
    const verb = isNewSlot ? '' : ` ${t(verbKey)}`;
    return `${n} ${noun}${verb}`;
  };

  const el = createModalOverlay(IMPORT_RESULT_MODAL_OVERLAY_ALPHA);
  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:3px solid #4a90d9;border-radius:${RADIUS_LG};` +
    'padding:28px 36px;display:flex;flex-direction:column;gap:14px;' +
    'min-width:280px;max-width:540px;max-height:80vh;overflow-y:auto;';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:1.2rem;color:#4a90d9;';
  title.textContent = t('import.complete.title');
  box.appendChild(title);

  if (isNewSlot && importedPlayerName) {
    const nameEl = document.createElement('p');
    nameEl.style.cssText = 'margin:2px 0;font-size:0.9rem;color:#eee;';
    nameEl.textContent = t('import.complete.player', { name: importedPlayerName });
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
    mergedHeader.textContent = isNewSlot
      ? t('import.progressHeader.imported')
      : t('import.progressHeader.merged');
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
        stats.push(statLine(o.newLevelsCompleted, 'import.stats.levelWord', 'import.stats.levelsWord', 'import.stats.completedVerb'));
      if (o.newChaptersCompleted > 0)
        stats.push(statLine(o.newChaptersCompleted, 'import.stats.chapterWord', 'import.stats.chaptersWord', 'import.stats.completedVerb'));
      if (o.newStars > 0)
        stats.push(statLine(o.newStars, '⭐', '⭐', 'import.stats.addedVerb'));
      if (o.newWater > 0)
        stats.push(statLine(o.newWater, '💧', '💧', 'import.stats.addedVerb'));
      if (o.newRecordings > 0)
        stats.push(t(o.newRecordings === 1 ? 'import.stats.recordingImported' : 'import.stats.recordingsImported', { count: o.newRecordings }));

      if (stats.length > 0) {
        const detail = document.createElement('span');
        detail.style.cssText = 'color:#aaa;';
        detail.textContent = ' — ' + stats.join(', ');
        li.appendChild(detail);
      } else {
        const detail = document.createElement('span');
        detail.style.cssText = 'color:#a0a0a0;';
        detail.textContent = isNewSlot
          ? ` — ${t('import.stats.noCampaignProgress')}`
          : ` — ${t('import.stats.alreadyUpToDate')}`;
        li.appendChild(detail);
      }
      ul.appendChild(li);
    }
    box.appendChild(ul);
  } else {
    const none = document.createElement('p');
    none.style.cssText = 'margin:2px 0;font-size:0.85rem;color:#a0a0a0;';
    none.textContent = isNewSlot ? t('import.noProgress') : t('import.noneMerged');
    box.appendChild(none);
  }

  if (ignored.length > 0) {
    const ignoredHeader = document.createElement('h3');
    ignoredHeader.style.cssText = 'margin:4px 0 0;font-size:0.95rem;color:#f0c040;';
    ignoredHeader.textContent = t('import.skippedCampaigns');
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
  const hasMerged = merged.length > 0;
  note.textContent = isNewSlot
    ? t(hasMerged ? 'import.note.new' : 'import.note.newNoProgress')
    : t(hasMerged ? 'import.note.merge' : 'import.note.mergeNoProgress');
  box.appendChild(note);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = t('common.close');
  closeBtn.style.cssText =
    `align-self:flex-end;padding:8px 24px;font-size:0.95rem;background:${MUTED_BTN_BG};` +
    `color:#eee;border:1px solid #555;border-radius:${RADIUS_MD};cursor:pointer;margin-top:4px;`;
  const { closeModal } = setupModal(el, { titleEl: title, onClose: () => { el.remove(); } });
  closeBtn.addEventListener('click', () => { closeModal(); });
  box.appendChild(closeBtn);

  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
}
