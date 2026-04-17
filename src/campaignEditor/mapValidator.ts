/**
 * Shared map-grid validation logic used by both the chapter map editor
 * (validateChapterMap) and the campaign map editor (validateCampaignMap).
 *
 * Checks:
 *   • Exactly one Source tile
 *   • At most one Sink tile (warns if multiple)
 *   • All entities (levels or chapters) have a chamber placed on the grid
 *   • The Sink is reachable from the Source through connected tiles
 *   • All entity chambers are reachable from the Source
 *   • Optional: Sink completion threshold does not exceed entity count
 */

import { TileDef, PipeShape } from '../types';
import { computeMapReachable, editorTileConns } from '../mapUtils';
import { ValidationResult } from './types';
import { MULTIPLE_SOURCES, NO_SINK, NO_SOURCE } from './validationMessages';

/** Controls how the entity-chamber field is named and described. */
export interface MapEntityConfig {
  /** The chamberContent value that identifies entity tiles ('level' | 'chapter'). */
  chamberContent: 'level' | 'chapter';
  /** The tile field used as the entity index ('levelIdx' | 'chapterIdx'). */
  entityIdxField: 'levelIdx' | 'chapterIdx';
  /** Total number of entities that must be placed. */
  entityCount: number;
  /** Human-readable name for one entity, e.g. "Level 3 (Tutorial)". */
  entityName: (idx: number) => string;
  /**
   * When provided, validates that the Sink completion threshold does not
   * exceed this value.  Pass `undefined` to skip the check.
   */
  sinkCompletionMax?: number;
}

/**
 * Validate a map grid against the given entity configuration.
 * Returns a ValidationResult with all found issues.
 */
export function validateMapGrid(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  config: MapEntityConfig,
): ValidationResult {
  const msgs: string[] = [];
  let ok = true;

  let sourcePos: { row: number; col: number } | null = null;
  let sinkPos: { row: number; col: number } | null = null;
  const placedEntityIdxs = new Set<number>();

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
      if (
        def.shape === PipeShape.Chamber &&
        def.chamberContent === config.chamberContent
      ) {
        const idx = def[config.entityIdxField as keyof TileDef] as number | undefined;
        if (idx !== undefined) placedEntityIdxs.add(idx);
      }
    }
  }

  if (!sourcePos) { msgs.push(`❌ ${NO_SOURCE}`); ok = false; }
  if (!sinkPos)   { msgs.push(`❌ ${NO_SINK}`);   ok = false; }

  // Check sink completion threshold
  if (sinkPos && config.sinkCompletionMax !== undefined) {
    const sinkDef = grid[sinkPos.row]?.[sinkPos.col];
    const completion = sinkDef?.completion ?? 0;
    if (completion > config.sinkCompletionMax) {
      msgs.push(
        `⚠️ Sink completion threshold (${completion}) exceeds the number of ` +
        `entities in this map (${config.sinkCompletionMax}).`,
      );
      ok = false;
    }
  }

  // Check all entities are placed
  for (let i = 0; i < config.entityCount; i++) {
    if (!placedEntityIdxs.has(i)) {
      msgs.push(`❌ ${config.entityName(i)} is not placed on the map.`);
      ok = false;
    }
  }

  if (!sourcePos || !sinkPos) return { ok, messages: msgs };

  // BFS reachability
  const reached = computeMapReachable(
    grid, rows, cols, sourcePos,
    (def) => editorTileConns(def),
  );

  // Sink reachable?
  if (!reached.has(`${sinkPos.row},${sinkPos.col}`)) {
    msgs.push('❌ Sink is not reachable from the Source through connections.');
    ok = false;
  }

  // All entity chambers reachable?
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c];
      if (
        def?.shape === PipeShape.Chamber &&
        def.chamberContent === config.chamberContent
      ) {
        const idx = def[config.entityIdxField as keyof TileDef] as number | undefined;
        if (idx !== undefined && !reached.has(`${r},${c}`)) {
          msgs.push(
            `❌ ${config.entityName(idx)} chamber at (${r},${c}) is not reachable from the Source.`,
          );
          ok = false;
        }
      }
    }
  }

  if (msgs.length === 0 && ok) msgs.push('✅ Map structure looks valid.');
  return { ok, messages: msgs };
}
