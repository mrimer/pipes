import type { ChapterDef, TileDef } from '../types';
import type { ValidationResult } from './types';
import { validateMapGrid } from './mapValidator';
import { t } from '../i18n';

export function validateChapterMap(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  chapter: ChapterDef,
): ValidationResult {
  return validateMapGrid(grid, rows, cols, {
    chamberContent: 'level',
    entityIdxField: 'levelIdx',
    entityCount: chapter.levels.length,
    entityName: (i) => t('validation.map.levelEntityName', {
      number: i + 1,
      name: chapter.levels[i]?.name ?? '?',
    }),
    sinkCompletionMax: chapter.levels.length,
  });
}
