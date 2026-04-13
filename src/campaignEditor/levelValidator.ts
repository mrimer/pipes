import { Board, parseKey } from '../board';
import { LevelDef, PipeShape } from '../types';
import { ValidationResult } from './types';
import { MULTIPLE_SOURCES, NO_SINK, NO_SOURCE } from './validationMessages';

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
        if (sourcePos) { msgs.push(MULTIPLE_SOURCES); ok = false; }
        else { sourcePos = { row: r, col: c }; }
      }
      if (def.shape === PipeShape.Sink) sinkPositions.push({ row: r, col: c });
    }
  }

  if (!sourcePos) { msgs.push(NO_SOURCE); ok = false; }
  if (sinkPositions.length === 0) { msgs.push(NO_SINK); ok = false; }
  if (!ok) return { ok, messages: msgs };

  // Check that inventory has at least one item (otherwise level may be impossible)
  const hasInventory = levelDef.inventory.some((it) => it.count > 0);
  if (!hasInventory) msgs.push('⚠️ Inventory is empty – the player has no tiles to place.');

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
        const deltaDamage = initialPressure - tile.hardness;
        if (deltaDamage <= 0) {
          msgs.push(
            `❌ Sandstone at (${r},${c}) is immediately connected but its hardness (${tile.hardness}) ` +
            `≥ initial pressure (${initialPressure}) — the level starts in a failure state.`,
          );
          ok = false;
        }
      }
    }

    // Check if the initial state already has zero or negative water (immediate game over).
    if (ok && board.getCurrentWater() <= 0) {
      msgs.push('❌ Level starts with zero or negative water – adjust the source capacity or tile costs.');
      ok = false;
    }

    // If source is directly connected to sink (pre-solved), warn
    if (ok) {
      if (board.isSolved()) {
        msgs.push('⚠️ Level is already solved without placing any tiles.');
      } else {
        msgs.push('✅ Level structure looks valid.');
      }
    }
  } catch {
    msgs.push('❌ Level structure error – check tile configurations.');
    ok = false;
  }

  if (msgs.length === 0) msgs.push('✅ All checks passed!');
  return { ok, messages: msgs };
}
