/**
 * Campaign import/export sequencing — file pick, gzip/JSON sniffing,
 * version-conflict routing, and text-pack merge — extracted from
 * CampaignEditor. Owns no persisted state; reads/writes campaigns entirely
 * through the injected CampaignService, and reports UI outcomes through the
 * injected EditorDialogs. See campaignManager.ts's CampaignCompletionFlow
 * for the sibling pattern this mirrors.
 */

import type { CampaignDef } from '../types';
import type { ImportResult, CampaignTextPack, CampaignService } from './campaignService';
import type { EditorDialogs } from './editorDialogs';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';
import { ERROR_COLOR } from '../uiConstants';
import { downloadGzipJson, downloadJson, readGzipOrJsonFile } from '../fileIO';
import { FILE_TYPE_CAMPAIGN_TEXT_PACK } from '../profile/playerProfile';

/** Effects CampaignImportExportFlow needs from the owning CampaignEditor. */
export interface CampaignImportExportCallbacks {
  /** Dismiss the editor (e.g. before handing off to gameplay). */
  hide(): void;
  /** Invoked with the newly-imported campaign to start playing it. */
  onPlayCampaign(campaign: CampaignDef): void;
}

export class CampaignImportExportFlow {
  constructor(
    private readonly _service: CampaignService,
    private readonly _dialogs: EditorDialogs,
    private readonly _cb: CampaignImportExportCallbacks,
  ) {}

  /** Export a campaign by compressing the JSON with gzip and triggering a download.
   *  Unrecognized fields are stripped from the output via a clean pass.
   *
   *  An on-screen diagnostic overlay is shown so users can identify the step
   *  that fails if the download does not start. */
  exportCampaign(campaign: CampaignDef): void {
    const log = this._createExportLog();

    let json: string;
    try {
      json = this._service.exportToJson(campaign);
      log.append(`✅ JSON serialised (${json.length} chars)`);
    } catch (err) {
      log.append(`❌ JSON serialisation failed: ${String(err)}`);
      log.done(false);
      return;
    }

    log.append('⏳ Compressing and downloading …');
    const filename = `${resolveLocalizedText(campaign.name).replace(/\s+/g, '_')}.pipes.json.gz`;
    downloadGzipJson(json, filename).then(() => {
      log.append('✅ Export complete – download should have started.');
      log.done(true);
    }).catch((err) => {
      log.append(`❌ Export failed: ${String(err)}`);
      log.done(false);
    });
  }

  /**
   * Export just the translatable text of a campaign (name/note/hints, at
   * campaign/chapter/level level) as a plain, uncompressed JSON file for a
   * chosen language — meant to be hand-edited and re-imported to add that
   * language. Prompts for the target locale first.
   */
  exportCampaignTexts(campaign: CampaignDef): void {
    this._dialogs.showExportTextsDialog(resolveLocalizedText(campaign.name), (locale) => {
      let json: string;
      try {
        json = this._service.exportTextPack(campaign, locale);
      } catch (err) {
        this._dialogs.showMessage(t('editor.textPack.exportErrorTitle'), String(err), ERROR_COLOR);
        return;
      }
      const filename = `${resolveLocalizedText(campaign.name).replace(/\s+/g, '_')}.pipes-texts.${locale}.json`;
      downloadJson(json, filename);
      this._dialogs.showMessage(
        t('editor.textPack.exportSuccessTitle'),
        t('editor.textPack.exportSuccessMessage', { locale, name: resolveLocalizedText(campaign.name) }),
      );
    });
  }

  /**
   * Create a small on-screen diagnostic overlay that accumulates timestamped
   * log lines.  The overlay is only shown onscreen if there was a failure;
   * on success it is never attached to the DOM.  On failure it stays visible
   * until the user clicks it.
   */
  private _createExportLog(): { append(msg: string): void; done(ok: boolean): void } {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;bottom:12px;right:12px;z-index:99999;max-width:480px;' +
      'background:#1a1a2e;color:#ccc;font:12px/1.5 monospace;' +
      'padding:10px 14px;border-radius:8px;border:1px solid #4a90d9;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.6);max-height:50vh;overflow-y:auto;';
    const title = document.createElement('div');
    title.textContent = t('editor.exportLog.title');
    title.style.cssText = 'font-weight:bold;color:#4a90d9;margin-bottom:6px;';
    overlay.appendChild(title);

    const t0 = performance.now();

    return {
      append(msg: string) {
        const ms = (performance.now() - t0).toFixed(0);
        const line = document.createElement('div');
        line.textContent = `[${ms} ms] ${msg}`;
        overlay.appendChild(line);
        overlay.scrollTop = overlay.scrollHeight;
      },
      done(ok: boolean) {
        if (ok) {
          return;
        }
        title.textContent = t('editor.exportLog.failedTitle');
        title.style.color = ERROR_COLOR;
        overlay.style.cursor = 'pointer';
        overlay.addEventListener('click', () => { overlay.remove(); }, { once: true });
        document.body.appendChild(overlay);
      },
    };
  }

  /** Import a campaign from a JSON or gzip-compressed JSON file.
   *  Compression is detected automatically by inspecting the gzip magic bytes. */
  importCampaign(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gz,.pipes.json.gz,application/json,application/gzip';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const processText = (text: string) => {
        let sniffedType: unknown;
        try {
          sniffedType = (JSON.parse(text) as Record<string, unknown>)['type'];
        } catch {
          this._dialogs.showMessage(t('editor.import.errorTitle'), t('editor.import.parseError'), ERROR_COLOR);
          return;
        }
        if (sniffedType === FILE_TYPE_CAMPAIGN_TEXT_PACK) {
          this._importCampaignTextPack(text);
          return;
        }

        let result: ImportResult;
        try {
          result = this._service.parseImport(text);
        } catch {
          this._dialogs.showMessage(t('editor.import.errorTitle'), t('editor.import.parseError'), ERROR_COLOR);
          return;
        }

        if (result.conflict === 'same_version') {
          this._dialogs.showImportSameVersion(resolveLocalizedText(result.campaign.name), result.campaign.lastUpdated);
          return;
        }

        if (result.conflict === 'version_conflict') {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- result.existing and result.isNewer are always set when result.conflict === 'version_conflict'
          this._dialogs.showImportVersionConflict(result.campaign, result.existing!, result.isNewer!, () => {
            // Replace the campaign record while retaining player progress (keyed by ID).
            this._service.acceptImport(result);
            this._dialogs.showMessage(
              t('editor.import.successTitle'),
              t('editor.import.successMessage', { name: resolveLocalizedText(result.campaign.name) }),
            );
            this._cb.hide();
            this._cb.onPlayCampaign(result.campaign);
          });
          return;
        }

        // No conflict – add the new campaign directly.
        this._service.acceptImport(result);
        this._dialogs.showMessage(
          t('editor.import.successTitle'),
          t('editor.import.successMessage', { name: resolveLocalizedText(result.campaign.name) }),
        );
        this._cb.hide();
        this._cb.onPlayCampaign(result.campaign);
      };

      readGzipOrJsonFile(file).then(processText).catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err);
        this._dialogs.showMessage(
          t('editor.import.errorTitle'),
          `${t('editor.import.readError')}\n${details}`,
          ERROR_COLOR,
        );
      });
    });
    input.click();
  }

  /**
   * Parse and merge a text-pack file into the local campaign it references
   * (matched by `campaignGuid`, never by the local `id`). Prompts for
   * confirmation (with an opt-in overwrite toggle) before writing anything.
   */
  private _importCampaignTextPack(text: string): void {
    let pack: CampaignTextPack;
    try {
      pack = this._service.parseTextPack(text);
    } catch {
      this._dialogs.showMessage(t('editor.textPack.importErrorTitle'), t('editor.textPack.parseError'), ERROR_COLOR);
      return;
    }
    const campaign = this._service.getCampaignByGuid(pack.campaignGuid);
    if (!campaign) {
      this._dialogs.showMessage(t('editor.textPack.importErrorTitle'), t('editor.textPack.campaignNotFound'), ERROR_COLOR);
      return;
    }
    this._dialogs.showTextPackImportConfirm(resolveLocalizedText(campaign.name), pack.locale, (overwrite) => {
      const result = this._service.mergeTextPack(pack, { overwrite });
      let message = t('editor.textPack.mergeSummary', {
        added: result.added,
        locale: result.locale,
        name: resolveLocalizedText(result.campaign.name),
        skipped: result.skipped,
      });
      if (result.overwritten > 0) {
        message += t('editor.textPack.mergeSummaryOverwritten', { overwritten: result.overwritten });
      }
      if (result.unmatchedNodes > 0) {
        message += t('editor.textPack.mergeSummaryUnmatched', { unmatched: result.unmatchedNodes });
      }
      this._dialogs.showMessage(t('editor.textPack.mergeSuccessTitle'), message);
    });
  }
}
