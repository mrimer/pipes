import { ChapterDef, TileDef } from '../types';
import { ValidationResult } from './types';
import { validateMapGrid } from './mapValidator';

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
    entityName: (i) => `Level ${i + 1} (${chapter.levels[i]?.name ?? '?'})`,
    sinkCompletionMax: chapter.levels.length,
  });
}

