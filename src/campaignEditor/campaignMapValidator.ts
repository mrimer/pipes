import { CampaignDef, TileDef } from '../types';
import { ValidationResult } from './types';
import { validateMapGrid } from './mapValidator';

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
    entityName: (i) => `Chapter ${i + 1} (${campaign.chapters[i]?.name ?? '?'})`,
  });
}

