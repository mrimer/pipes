import type { CampaignDef, TileDef } from '../types';
import type { ValidationResult } from './types';
import { validateMapGrid } from './mapValidator';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';

export function validateCampaignMap(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  campaign: CampaignDef,
): ValidationResult {
  const result = validateMapGrid(grid, rows, cols, {
    chamberContent: 'chapter',
    entityIdxField: 'chapterIdx',
    entityCount: campaign.chapters.length,
    entityName: (i) => t('validation.map.chapterEntityName', {
      number: i + 1,
      name: resolveLocalizedText(campaign.chapters[i]?.name) || '?',
    }),
  });
  // Non-blocking: warn if the campaign name has no text in any language.
  if (!resolveLocalizedText(campaign.name).trim()) result.messages.push(t('validation.map.campaignNameEmpty'));
  return result;
}
