import { ChapterDef, TileDef, PipeShape } from '../types';
import { computeChapterMapReachable, editorTileConns } from '../chapterMapUtils';
import { ValidationResult } from './types';

export function validateChapterMap(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  chapter: ChapterDef,
): ValidationResult {
  const msgs: string[] = [];
  let ok = true;

  let sourcePos: { row: number; col: number } | null = null;
  let sinkPos: { row: number; col: number } | null = null;
  const levelChamberIdxs = new Set<number>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c];
      if (!def) continue;
      if (def.shape === PipeShape.Source) {
        if (sourcePos) { msgs.push('Multiple Source tiles found.'); ok = false; }
        else sourcePos = { row: r, col: c };
      }
      if (def.shape === PipeShape.Sink) {
        if (sinkPos) msgs.push('⚠️ Multiple Sink tiles found – only first is checked.');
        else sinkPos = { row: r, col: c };
      }
      if (def.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
        levelChamberIdxs.add(def.levelIdx);
      }
    }
  }

  if (!sourcePos) { msgs.push('❌ No Source tile found.'); ok = false; }
  if (!sinkPos) { msgs.push('❌ No Sink tile found.'); ok = false; }

  // Check all levels are placed
  for (let li = 0; li < chapter.levels.length; li++) {
    if (!levelChamberIdxs.has(li)) {
      msgs.push(`❌ Level ${li + 1} (${chapter.levels[li].name}) is not placed on the map.`);
      ok = false;
    }
  }

  if (!sourcePos || !sinkPos) return { ok, messages: msgs };

  // BFS reachability check
  const reached = computeChapterMapReachable(
    grid,
    rows,
    cols,
    sourcePos,
    (def) => editorTileConns(def),
  );

  // Check sink reachable
  const sinkKey = `${sinkPos.row},${sinkPos.col}`;
  if (!reached.has(sinkKey)) {
    msgs.push('❌ Sink is not reachable from the Source through connections.');
    ok = false;
  }

  // Check all level chambers reachable
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c];
      if (def?.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
        if (!reached.has(`${r},${c}`)) {
          msgs.push(`❌ Level ${def.levelIdx + 1} chamber at (${r},${c}) is not reachable from the Source.`);
          ok = false;
        }
      }
    }
  }

  if (msgs.length === 0 && ok) msgs.push('✅ Chapter map structure looks valid.');
  return { ok, messages: msgs };
}
