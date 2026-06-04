import type { CampaignDef, TileDef } from '../types';
import type { ValidationResult } from './types';
import { validateMapGrid } from './mapValidator';
import { t } from '../i18n';

export function validateCampaignMap(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  campaign: CampaignDef,
): ValidationResult {
  return validateMapGrid(grid, rows, cols, {
    chamberContent: 'chapter',
    entityIdxField: 'chapterIdx',
    entityCount: campaign.chapters.length,
    entityName: (i) => t('validation.map.chapterEntityName', {
      number: i + 1,
      name: campaign.chapters[i]?.name ?? '?',
    }),
  });
}
