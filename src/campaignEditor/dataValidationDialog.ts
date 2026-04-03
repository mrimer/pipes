/**
 * DataValidationDialog – standalone modal that scans a campaign for unrecognized
 * fields and optionally removes them.
 *
 * Extracted from CampaignEditor to keep the dialog flow self-contained and
 * independently testable.
 */

import { CampaignDef } from '../types';
import { CampaignService } from './campaignService';

/** CSS for a button row aligned to the trailing edge (mirrors EDITOR_BTN_ROW_CSS). */
const BTN_ROW_CSS = 'display:flex;gap:12px;justify-content:flex-end;';

export class DataValidationDialog {
  constructor(
    private readonly _service: CampaignService,
    private readonly _btn: (
      label: string,
      bg: string,
      fg: string,
      onClick: () => void,
    ) => HTMLButtonElement,
  ) {}

  /** Show the validation modal as a child of `container`. */
  show(container: HTMLElement, campaign: CampaignDef): void {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;' +
      'justify-content:center;z-index:300;';

    this._render(overlay, campaign, this._service.scanData(campaign, true), false);
    container.appendChild(overlay);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _buildIssuesTable(
    issues: Map<string, Map<string, number>>,
  ): HTMLTableElement | null {
    let totalIssues = 0;
    for (const m of issues.values()) for (const c of m.values()) totalIssues += c;
    if (totalIssues === 0) return null;

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const [label, align] of [['Record Type', 'left'], ['Field Name', 'left'], ['Count', 'right']] as const) {
      const th = document.createElement('th');
      th.style.cssText = `text-align:${align};padding:4px 8px;color:#aaa;border-bottom:1px solid #2a3a5e;`;
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const [recordType, fieldMap] of issues) {
      for (const [fieldName, count] of fieldMap) {
        const tr = document.createElement('tr');
        for (const [txt, align] of [
          [recordType, 'left'],
          [fieldName, 'left'],
          [String(count), 'right'],
        ] as const) {
          const td = document.createElement('td');
          td.style.cssText = `text-align:${align};padding:4px 8px;border-bottom:1px solid #1a2a3e;`;
          td.textContent = txt;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    return table;
  }

  private _render(
    overlay: HTMLElement,
    campaign: CampaignDef,
    issues: Map<string, Map<string, number>>,
    cleanupDone: boolean,
  ): void {
    overlay.innerHTML = '';

    let totalIssues = 0;
    for (const m of issues.values()) for (const c of m.values()) totalIssues += c;

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'background:#16213e;border:2px solid #4a90d9;border-radius:10px;padding:28px 32px;' +
      'display:flex;flex-direction:column;gap:18px;min-width:300px;max-width:520px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6);';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#f0c040;';
    title.textContent = cleanupDone ? '🧹 Cleanup Complete' : '🔍 Dev – Validate Data';
    dialog.appendChild(title);

    const body = document.createElement('div');
    body.style.cssText = 'font-size:0.9rem;color:#eee;line-height:1.6;';

    const issuesTable = this._buildIssuesTable(issues);
    if (!issuesTable) {
      const p = document.createElement('p');
      p.style.margin = '0';
      p.textContent = cleanupDone
        ? 'Cleanup complete. No issues were found.'
        : 'Data validation complete. No issues found.';
      body.appendChild(p);
    } else {
      const intro = document.createElement('p');
      intro.style.margin = '0 0 8px 0';
      intro.textContent = cleanupDone
        ? 'The following unrecognized fields were removed:'
        : 'The following unrecognized fields were found:';
      body.appendChild(intro);
      body.appendChild(issuesTable);
    }
    dialog.appendChild(body);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = BTN_ROW_CSS;

    if (totalIssues > 0 && !cleanupDone) {
      const cleanupBtn = this._btn('🧹 Clean Up', '#e67e22', '#fff', () => {
        const cleanIssues = this._service.scanData(campaign, false);
        this._service.touch(campaign);
        this._service.save();
        this._render(overlay, campaign, cleanIssues, true);
      });
      btnRow.appendChild(cleanupBtn);
    }

    btnRow.appendChild(this._btn('OK', '#4a90d9', '#fff', () => overlay.remove()));
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
  }
}
