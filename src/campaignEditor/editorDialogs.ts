/**
 * EditorDialogs – modal dialogs used by the Campaign Editor.
 *
 * Extracted from CampaignEditor so that all dialog rendering lives in one
 * place.  Each method is stateless: it takes all data as parameters and
 * returns actions via callbacks.
 */

import type { CampaignDef } from '../types';
import { ERROR_DARK, MODAL_DIALOG_CSS, MODAL_OVERLAY_CSS, MUTED_BTN_BG } from '../uiConstants';
import { setupModal } from '../modals/modalUtils';
import { t } from '../i18n';

/** CSS for a button row aligned to the trailing edge (used at the bottom of modal/confirm dialogs). */
export const EDITOR_BTN_ROW_CSS = 'display:flex;gap:12px;justify-content:flex-end;';

export class EditorDialogs {
  constructor(
    private readonly _container: HTMLElement,
    private readonly _btn: (
      label: string,
      bg: string,
      fg: string,
      onClick: () => void,
    ) => HTMLButtonElement,
  ) {}

  /**
   * Show an info dialog telling the user the imported campaign is the same
   * version as the local copy. The import is canceled.
   */
  showImportSameVersion(name: string, ts: string | undefined): void {
    const { overlay, dialog } = this._createOverlay('460px');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#4a90d9;';
    title.textContent = t('editor.dialog.importSameVersion.title');
    const { closeModal } = setupModal(overlay, { titleEl: title, onClose: () => { overlay.remove(); } });

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;';
    const campaignName = document.createElement('strong');
    campaignName.style.color = '#fff';
    campaignName.textContent = `"${name}"`;
    const sameVersionTs = document.createElement('em');
    sameVersionTs.textContent = this._formatTimestamp(ts);
    msg.appendChild(campaignName);
    msg.appendChild(document.createTextNode(t('editor.dialog.importSameVersion.upToDateSuffix')));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(t('editor.dialog.importSameVersion.sameVersionLine')));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(t('editor.dialog.importSameVersion.lastUpdatedPrefix')));
    msg.appendChild(sameVersionTs);
    msg.appendChild(document.createTextNode(t('editor.dialog.importSameVersion.lastUpdatedSuffix')));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(t('editor.dialog.importSameVersion.noUpdateLine')));

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;
    btnRow.appendChild(this._btn(t('editor.common.ok'), '#4a90d9', '#fff', () => closeModal()));

    dialog.appendChild(title);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  /**
   * Show a confirmation dialog asking the user whether to overwrite a local
   * campaign with an imported one of a different version.
   * @param imported  The campaign data being imported.
   * @param existing  The local campaign with the same ID.
   * @param isNewer   True when the imported campaign is more recent.
   * @param onConfirm Called when the user confirms the import.
   */
  showImportVersionConflict(
    imported: CampaignDef,
    existing: CampaignDef,
    isNewer: boolean,
    onConfirm: () => void,
  ): void {
    const { overlay, dialog } = this._createOverlay('480px');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#f0c040;';
    title.textContent = isNewer ? t('editor.dialog.importConflict.newerTitle') : t('editor.dialog.importConflict.olderTitle');
    const { closeModal } = setupModal(overlay, { titleEl: title, onClose: () => { overlay.remove(); } });

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;';
    const importedName = document.createElement('strong');
    importedName.style.color = '#fff';
    importedName.textContent = `"${imported.name}"`;
    const localTs = document.createElement('em');
    localTs.textContent = this._formatTimestamp(existing.lastUpdated);
    const importedTs = document.createElement('em');
    importedTs.textContent = this._formatTimestamp(imported.lastUpdated);
    msg.appendChild(importedName);
    msg.appendChild(document.createTextNode(t('editor.dialog.importConflict.existsLocallySuffix')));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(t('editor.dialog.importConflict.localVersion')));
    msg.appendChild(localTs);
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(t('editor.dialog.importConflict.importedVersion')));
    msg.appendChild(importedTs);
    msg.appendChild(document.createTextNode(t('editor.dialog.importConflict.versionAge', { age: isNewer ? t('editor.common.newer') : t('editor.common.older') })));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(t('editor.dialog.importConflict.replaceLine')));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(t('editor.dialog.importConflict.progressRetainedLine')));

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;

    const confirmLabel = isNewer ? t('editor.dialog.importConflict.newerButton') : t('editor.dialog.importConflict.olderButton');
    const confirmColor = isNewer ? '#27ae60' : '#e67e22';
    const confirmBtn = this._btn(confirmLabel, confirmColor, '#fff', () => {
      closeModal();
      onConfirm();
    });
    const cancelBtn = this._btn(t('modal.common.cancel'), MUTED_BTN_BG, '#aaa', () => closeModal());

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    dialog.appendChild(title);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  /**
   * Show a modal dialog asking the user to Save or Discard unsaved level
   * changes.  Appended to the container; removed when a button is clicked.
   */
  showUnsavedChanges(onSave: () => void, onDiscard: () => void): void {
    const { overlay, dialog } = this._createOverlay('420px');
    const { closeModal } = setupModal(overlay, { onClose: () => { overlay.remove(); } });

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:1rem;color:#eee;line-height:1.5;';
    msg.textContent = t('editor.dialog.unsaved.message');

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;

    const saveBtn = this._btn(t('editor.toolbar.save'), '#27ae60', '#fff', () => {
      closeModal();
      onSave();
    });
    const discardBtn = this._btn(t('editor.dialog.unsaved.discard'), ERROR_DARK, '#fff', () => {
      closeModal();
      onDiscard();
    });
    const cancelBtn = this._btn(t('modal.common.cancel'), MUTED_BTN_BG, '#aaa', () => {
      closeModal();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(discardBtn);
    btnRow.appendChild(saveBtn);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  showMessage(titleText: string, messageText: string, color = '#4a90d9'): void {
    const { overlay, dialog } = this._createOverlay('460px');
    const title = document.createElement('div');
    title.style.cssText = `font-size:1.1rem;font-weight:bold;color:${color};`;
    title.textContent = titleText;
    const { closeModal } = setupModal(overlay, { titleEl: title, onClose: () => { overlay.remove(); } });

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;white-space:pre-wrap;';
    msg.textContent = messageText;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;
    btnRow.appendChild(this._btn(t('editor.common.ok'), '#4a90d9', '#fff', () => closeModal()));

    dialog.appendChild(title);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  showConfirm(messageText: string, onConfirm: () => void, confirmLabel: string, danger = false): void {
    const { overlay, dialog } = this._createOverlay('460px');
    const { closeModal } = setupModal(overlay, { onClose: () => { overlay.remove(); } });

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;white-space:pre-wrap;';
    msg.textContent = messageText;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;
    btnRow.appendChild(this._btn(t('modal.common.cancel'), MUTED_BTN_BG, '#aaa', () => closeModal()));
    btnRow.appendChild(this._btn(confirmLabel, danger ? ERROR_DARK : '#27ae60', '#fff', () => {
      closeModal();
      onConfirm();
    }));

    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Create a standard full-screen modal overlay and a centered dialog box,
   * append the overlay to the container, and return both elements for the
   * caller to populate.
   * @param maxWidth CSS max-width for the dialog (default '460px').
   */
  private _createOverlay(maxWidth = '460px'): { overlay: HTMLDivElement; dialog: HTMLDivElement } {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      MODAL_OVERLAY_CSS;
    const dialog = document.createElement('div');
    dialog.style.cssText =
      MODAL_DIALOG_CSS + `min-width:300px;max-width:${maxWidth};`;
    overlay.appendChild(dialog);
    this._container.appendChild(overlay);
    return { overlay, dialog };
  }

  /** Format an ISO timestamp for display, or return a fallback string if absent. */
  private _formatTimestamp(ts: string | undefined): string {
    if (!ts) return t('editor.common.unknown');
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  }
}
