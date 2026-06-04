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

import type { TileDef} from '../types';
import { PipeShape } from '../types';
import { computeMapReachable, editorTileConns } from '../mapUtils';
import type { ValidationResult } from './types';
import { t } from '../i18n';
import { MULTIPLE_SOURCES } from './validationMessages';

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
        if (sourcePos) { msgs.push(t(MULTIPLE_SOURCES)); ok = false; }
        else sourcePos = { row: r, col: c };
      }
      if (def.shape === PipeShape.Sink) {
        if (sinkPos) msgs.push(t('validation.map.multipleSinksOnlyFirstChecked'));
        else sinkPos = { row: r, col: c };
      }
      if (
        def.shape === PipeShape.Chamber &&
        def.chamberContent === config.chamberContent
      ) {
        const idx = def[config.entityIdxField as keyof TileDef] as number | undefined;
        if (idx === undefined) {
          msgs.push(
            t('validation.map.entityChamberMissingIndex', {
              chamberContent: config.chamberContent,
              row: r,
              col: c,
              entityIdxField: config.entityIdxField,
            }),
          );
          ok = false;
        } else if (idx < 0 || idx >= config.entityCount) {
          msgs.push(
            t('validation.map.entityChamberInvalidIndex', {
              chamberContent: config.chamberContent,
              row: r,
              col: c,
              entityIdxField: config.entityIdxField,
              idx,
            }),
          );
          ok = false;
        } else {
          placedEntityIdxs.add(idx);
        }
      }
    }
  }

  if (!sourcePos) { msgs.push(t('validation.map.noSourceError')); ok = false; }
  if (!sinkPos)   { msgs.push(t('validation.map.noSinkError')); ok = false; }

  // Check sink completion threshold
  if (sinkPos && config.sinkCompletionMax !== undefined) {
    const sinkDef = grid[sinkPos.row]?.[sinkPos.col];
    const completion = sinkDef?.completion ?? 0;
    if (completion > config.sinkCompletionMax) {
      msgs.push(
        t('validation.map.sinkCompletionExceedsEntityCount', {
          completion,
          sinkCompletionMax: config.sinkCompletionMax,
        }),
      );
      ok = false;
    }
  }

  // Check all entities are placed
  for (let i = 0; i < config.entityCount; i++) {
    if (!placedEntityIdxs.has(i)) {
      msgs.push(t('validation.map.entityNotPlaced', { entityName: config.entityName(i) }));
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
    msgs.push(t('validation.map.sinkNotReachableFromSource'));
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
            t('validation.map.entityChamberNotReachable', {
              entityName: config.entityName(idx),
              row: r,
              col: c,
            }),
          );
          ok = false;
        }
      }
    }
  }

  if (msgs.length === 0 && ok) msgs.push(t('validation.map.structureValid'));
  return { ok, messages: msgs };
}
