/**
 * DataValidationDialog – standalone modal that scans a campaign for unrecognized
 * fields and optionally removes them.
 *
 * Extracted from CampaignEditor to keep the dialog flow self-contained and
 * independently testable.
 */

import type { CampaignDef, LocalizedText } from '../types';
import type { CampaignService } from './campaignService';
import { MODAL_DIALOG_CSS, MODAL_OVERLAY_CSS, UI_INPUT_BORDER } from '../uiConstants';
import { t } from '../i18n';
import { collectLocalesPresent, rawLocalizedTextSlice } from '../campaignLocalization';

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
      MODAL_OVERLAY_CSS;

    this._render(overlay, campaign, this._service.scanData(campaign, true), false);
    container.appendChild(overlay);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Every campaign/chapter/level text field, in a flat list, for completeness scanning. */
  private _collectTextFields(campaign: CampaignDef): (string | LocalizedText | undefined)[] {
    const fields: (string | LocalizedText | undefined)[] = [campaign.name];
    for (const chapter of campaign.chapters) {
      fields.push(chapter.name);
      for (const level of chapter.levels) {
        fields.push(level.name);
        if (level.note !== undefined) fields.push(level.note);
        if (level.hints !== undefined) fields.push(...level.hints);
      }
    }
    return fields;
  }

  /**
   * Build a per-locale "N / total fields translated" table, or null when the
   * campaign has 0 or 1 languages present (nothing meaningful to report yet).
   */
  private _buildCompletenessTable(campaign: CampaignDef): HTMLElement | null {
    const fields = this._collectTextFields(campaign);
    const locales = collectLocalesPresent(fields);
    if (locales.size <= 1) return null;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:14px;';

    const heading = document.createElement('p');
    heading.style.margin = '0 0 8px 0';
    heading.textContent = t('editor.dataValidation.translationCompleteness');
    wrap.appendChild(heading);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;';
    const tbody = document.createElement('tbody');
    for (const locale of [...locales].sort()) {
      const translated = fields.filter((f) => rawLocalizedTextSlice(f, locale).trim() !== '').length;
      const tr = document.createElement('tr');
      const localeTd = document.createElement('td');
      localeTd.style.cssText = `padding:4px 8px;border-bottom:1px solid #1a2a3e;`;
      localeTd.textContent = locale;
      const countTd = document.createElement('td');
      countTd.style.cssText = `text-align:right;padding:4px 8px;border-bottom:1px solid #1a2a3e;color:#aaa;`;
      countTd.textContent = t('editor.dataValidation.translationCount', { count: translated, total: fields.length });
      tr.appendChild(localeTd);
      tr.appendChild(countTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

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
    for (const [label, align] of [[t('editor.dataValidation.recordType'), 'left'], [t('editor.dataValidation.fieldName'), 'left'], [t('editor.dataValidation.count'), 'right']] as const) {
      const th = document.createElement('th');
      th.style.cssText = `text-align:${align};padding:4px 8px;color:#aaa;border-bottom:1px solid ${UI_INPUT_BORDER};`;
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
      MODAL_DIALOG_CSS + 'min-width:300px;max-width:520px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:bold;color:#f0c040;';
    title.textContent = cleanupDone ? t('editor.dataValidation.cleanupComplete') : t('editor.toolbar.validateData');
    dialog.appendChild(title);

    const body = document.createElement('div');
    body.style.cssText = 'font-size:0.9rem;color:#eee;line-height:1.6;';

    const completenessTable = this._buildCompletenessTable(campaign);
    if (completenessTable) body.appendChild(completenessTable);

    const issuesTable = this._buildIssuesTable(issues);
    if (!issuesTable) {
      const p = document.createElement('p');
      p.style.margin = '0';
      p.textContent = cleanupDone
        ? t('editor.dataValidation.cleanupNoIssues')
        : t('editor.dataValidation.noIssues');
      body.appendChild(p);
    } else {
      const intro = document.createElement('p');
      intro.style.margin = '0 0 8px 0';
      intro.textContent = cleanupDone
        ? t('editor.dataValidation.removedFields')
        : t('editor.dataValidation.foundFields');
      body.appendChild(intro);
      body.appendChild(issuesTable);
    }
    dialog.appendChild(body);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = BTN_ROW_CSS;

    if (totalIssues > 0 && !cleanupDone) {
      const cleanupBtn = this._btn(t('editor.dataValidation.cleanUp'), '#e67e22', '#fff', () => {
        const cleanIssues = this._service.scanData(campaign, false);
        this._service.touch(campaign);
        this._service.save();
        this._render(overlay, campaign, cleanIssues, true);
      });
      btnRow.appendChild(cleanupBtn);
    }

    btnRow.appendChild(this._btn(t('editor.common.ok'), '#4a90d9', '#fff', () => overlay.remove()));
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
  }
}
