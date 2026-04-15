import { CampaignDef, TileDef, PipeShape } from '../types';
import { computeMapReachable, editorTileConns } from '../mapUtils';
import { ValidationResult } from './types';
import { MULTIPLE_SOURCES, NO_SINK, NO_SOURCE } from './validationMessages';

export function validateCampaignMap(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  campaign: CampaignDef,
): ValidationResult {
  const msgs: string[] = [];
  let ok = true;

  let sourcePos: { row: number; col: number } | null = null;
  let sinkPos: { row: number; col: number } | null = null;
  const chapterChamberIdxs = new Set<number>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c];
      if (!def) continue;
      if (def.shape === PipeShape.Source) {
        if (sourcePos) { msgs.push(MULTIPLE_SOURCES); ok = false; }
        else sourcePos = { row: r, col: c };
      }
      if (def.shape === PipeShape.Sink) {
        if (sinkPos) msgs.push('⚠️ Multiple Sink tiles found – only first is checked.');
        else sinkPos = { row: r, col: c };
      }
      if (def.shape === PipeShape.Chamber && def.chamberContent === 'chapter' && def.chapterIdx !== undefined) {
        chapterChamberIdxs.add(def.chapterIdx);
      }
    }
  }

  if (!sourcePos) { msgs.push(`❌ ${NO_SOURCE}`); ok = false; }
  if (!sinkPos) { msgs.push(`❌ ${NO_SINK}`); ok = false; }

  for (let ci = 0; ci < campaign.chapters.length; ci++) {
    if (!chapterChamberIdxs.has(ci)) {
      msgs.push(`❌ Chapter ${ci + 1} (${campaign.chapters[ci].name}) is not placed on the map.`);
      ok = false;
    }
  }

  if (!sourcePos || !sinkPos) return { ok, messages: msgs };

  const reached = computeMapReachable(
    grid,
    rows,
    cols,
    sourcePos,
    (def) => editorTileConns(def),
  );

  const sinkKey = `${sinkPos.row},${sinkPos.col}`;
  if (!reached.has(sinkKey)) {
    msgs.push('❌ Sink is not reachable from the Source through connections.');
    ok = false;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c];
      if (def?.shape === PipeShape.Chamber && def.chamberContent === 'chapter' && def.chapterIdx !== undefined) {
        if (!reached.has(`${r},${c}`)) {
          msgs.push(`❌ Chapter ${def.chapterIdx + 1} chamber at (${r},${c}) is not reachable from the Source.`);
          ok = false;
        }
      }
    }
  }

  if (msgs.length === 0 && ok) msgs.push('✅ Campaign map structure looks valid.');
  return { ok, messages: msgs };
}
