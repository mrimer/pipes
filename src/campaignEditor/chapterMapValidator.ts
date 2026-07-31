import type { ChapterDef, TileDef } from '../types';
import type { ValidationResult } from './types';
import { validateMapGrid } from './mapValidator';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';

export function validateChapterMap(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  chapter: ChapterDef,
): ValidationResult {
  const result = validateMapGrid(grid, rows, cols, {
    chamberContent: 'level',
    entityIdxField: 'levelIdx',
    entityCount: chapter.levels.length,
    entityName: (i) => t('validation.map.levelEntityName', {
      number: i + 1,
      name: resolveLocalizedText(chapter.levels[i]?.name) || '?',
    }),
    sinkCompletionMax: chapter.levels.length,
  });
  // Non-blocking: warn if the chapter name has no text in any language.
  if (!resolveLocalizedText(chapter.name).trim()) result.messages.push(t('validation.map.chapterNameEmpty'));
  return result;
}
