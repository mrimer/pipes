import { Board, parseKey } from '../board';
import type { LevelDef} from '../types';
import { PipeShape } from '../types';
import type { ValidationResult } from './types';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';
import { MULTIPLE_SINKS, MULTIPLE_SOURCES, NO_SINK, NO_SOURCE } from './validationMessages';

/**
 * Validates a level definition and returns a structured result.
 * Pure function – no DOM, no editor state.
 */
export function validateLevel(levelDef: LevelDef): ValidationResult {
  const msgs: string[] = [];
  let sourcePos: { row: number; col: number } | null = null;
  const sinkPositions: Array<{ row: number; col: number }> = [];
  let ok = true;

  // Count sources and sinks
  for (let r = 0; r < levelDef.rows; r++) {
    for (let c = 0; c < levelDef.cols; c++) {
      const def = levelDef.grid[r]?.[c];
      if (!def) continue;
      if (def.shape === PipeShape.Source) {
        if (sourcePos) { msgs.push(t(MULTIPLE_SOURCES)); ok = false; }
        else { sourcePos = { row: r, col: c }; }
      }
      if (def.shape === PipeShape.Sink) sinkPositions.push({ row: r, col: c });
    }
  }

  if (!sourcePos) { msgs.push(t(NO_SOURCE)); ok = false; }
  if (sinkPositions.length === 0) { msgs.push(t(NO_SINK)); ok = false; }
  if (sinkPositions.length > 1) { msgs.push(t(MULTIPLE_SINKS)); ok = false; }
  if (!ok) return { ok, messages: msgs };

  // Check that inventory has at least one item (otherwise level may be impossible)
  const hasInventory = levelDef.inventory.some((it) => it.count > 0);
  if (!hasInventory) msgs.push(t('validation.level.inventoryEmpty'));

  // Non-blocking: warn if the level name has no text in any language.
  if (!resolveLocalizedText(levelDef.name).trim()) msgs.push(t('validation.level.nameEmpty'));

  // Try to create a Board and check if the level has a valid layout
  try {
    const board = new Board(levelDef.rows, levelDef.cols, levelDef);
    board.initHistory();

    // Check for sandstone tiles in the initial fill path with invalid deltaDamage.
    const initialFilled = board.getFilledPositions();
    const initialPressure = board.getCurrentPressure(initialFilled);
    for (const key of initialFilled) {
      const [r, c] = parseKey(key);
      const tile = board.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'sandstone') {
        // Board construction normalizes missing hardness to 0 via def.hardness ?? 0,
        // so this subtraction always uses a numeric hardness.
        const deltaDamage = initialPressure - tile.hardness;
        if (deltaDamage <= 0) {
          msgs.push(
            t('validation.level.sandstoneInitialFailure', {
              row: r,
              col: c,
              hardness: tile.hardness,
              initialPressure,
            }),
          );
          ok = false;
        }
      }
    }

    // Check if the initial state already has zero or negative water (immediate game over).
    if (ok && board.getCurrentWater() <= 0) {
      msgs.push(t('validation.level.nonPositiveWaterStart'));
      ok = false;
    }

    // If source is directly connected to sink (pre-solved), warn
    if (ok) {
      if (board.isSolved()) {
        msgs.push(t('validation.level.alreadySolved'));
      } else {
        msgs.push(t('validation.level.structureValid'));
      }
    }
  } catch {
    msgs.push(t('validation.level.structureError'));
    ok = false;
  }

  if (msgs.length === 0) msgs.push(t('validation.level.allChecksPassed'));
  return { ok, messages: msgs };
}
