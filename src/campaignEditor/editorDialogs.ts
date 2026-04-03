/**
 * EditorDialogs – modal dialogs used by the Campaign Editor.
 *
 * Extracted from CampaignEditor so that all dialog rendering lives in one
 * place.  Each method is stateless: it takes all data as parameters and
 * returns actions via callbacks.
 */

import { CampaignDef } from '../types';

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
    title.textContent = '✅ Same Version';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;';
    msg.innerHTML =
      `<strong style="color:#fff;">"${name}"</strong> is already up to date.<br><br>` +
      `The imported campaign has the same version as your local copy<br>` +
      `(last updated: <em>${this._formatTimestamp(ts)}</em>).<br><br>` +
      `The campaign will not be updated.`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;
    btnRow.appendChild(this._btn('OK', '#4a90d9', '#fff', () => overlay.remove()));

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
    title.textContent = isNewer ? '⏩ Import Newer Version?' : '⏪ Import Older Version?';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.95rem;color:#eee;line-height:1.6;';
    const localLabel = `Local version: <em>${this._formatTimestamp(existing.lastUpdated)}</em>`;
    const importedLabel = `Imported version: <em>${this._formatTimestamp(imported.lastUpdated)}</em> (${isNewer ? 'newer' : 'older'})`;
    msg.innerHTML =
      `<strong style="color:#fff;">"${imported.name}"</strong> already exists locally.<br><br>` +
      `${localLabel}<br>` +
      `${importedLabel}<br><br>` +
      `Importing will replace all chapters and levels in the local campaign.<br>` +
      `Player progress will be retained.`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;

    const confirmLabel = isNewer ? '⏩ Import newer version' : '⏪ Overwrite with older version';
    const confirmColor = isNewer ? '#27ae60' : '#e67e22';
    const confirmBtn = this._btn(confirmLabel, confirmColor, '#fff', () => {
      overlay.remove();
      onConfirm();
    });
    const cancelBtn = this._btn('Cancel', '#2a2a4a', '#aaa', () => overlay.remove());

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

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:1rem;color:#eee;line-height:1.5;';
    msg.textContent = 'You have unsaved changes. Would you like to save before leaving?';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = EDITOR_BTN_ROW_CSS;

    const saveBtn = this._btn('💾 Save', '#27ae60', '#fff', () => {
      overlay.remove();
      onSave();
    });
    const discardBtn = this._btn('🗑 Discard', '#c0392b', '#fff', () => {
      overlay.remove();
      onDiscard();
    });
    const cancelBtn = this._btn('Cancel', '#2a2a4a', '#aaa', () => {
      overlay.remove();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(discardBtn);
    btnRow.appendChild(saveBtn);
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
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;' +
      'justify-content:center;z-index:300;';
    const dialog = document.createElement('div');
    dialog.style.cssText =
      `background:#16213e;border:2px solid #4a90d9;border-radius:10px;padding:28px 32px;` +
      `display:flex;flex-direction:column;gap:18px;min-width:300px;max-width:${maxWidth};` +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6);';
    overlay.appendChild(dialog);
    this._container.appendChild(overlay);
    return { overlay, dialog };
  }

  /** Format an ISO timestamp for display, or return a fallback string if absent. */
  private _formatTimestamp(ts: string | undefined): string {
    if (!ts) return 'unknown';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  }
}
