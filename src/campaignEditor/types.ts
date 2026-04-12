/**
 * Types, interfaces, constants, and pure utility functions shared within the
 * Campaign Editor. Kept separate to reduce the size of campaignEditor.ts.
 */

import { PipeShape, TileDef, InventoryItem, Rotation, ChamberContent, COST_CHAMBER_CONTENTS, TEMP_RELEVANT_CONTENTS, Direction } from '../types';
import { PIPE_SHAPES } from '../board';
import { DIRT_COLOR, ICE_COLOR } from '../colors';

// ─── Valid field sets for data validation ─────────────────────────────────────

/** Valid keys for a CampaignDef record. */
export const VALID_CAMPAIGN_KEYS: ReadonlySet<string> = new Set([
  'id', 'name', 'author', 'chapters', 'official', 'lastUpdated',
]);

/** Valid keys for a ChapterDef record. */
export const VALID_CHAPTER_KEYS: ReadonlySet<string> = new Set([
  'id', 'name', 'levels', 'rows', 'cols', 'grid',
]);

/** Valid keys for a LevelDef record. */
export const VALID_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'id', 'name', 'rows', 'cols', 'grid', 'inventory',
  'note', 'hints', 'starCount', 'challenge',
]);
/** Valid keys for an InventoryItem record. */
export const VALID_INVENTORY_ITEM_KEYS: ReadonlySet<string> = new Set(['shape', 'count']);

/** Pipe shapes for which the `rotation` TileDef field is semantically meaningful.
 *  Includes asymmetric pipe shapes (where rotation changes which sides are open)
 *  and OneWay tiles (where rotation encodes the allowed flow direction). */
const ROTATION_SHAPES: ReadonlySet<PipeShape> = new Set([
  PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee,
  PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee,
  PipeShape.SpinStraight, PipeShape.SpinElbow, PipeShape.SpinTee,
  PipeShape.SpinStraightCement, PipeShape.SpinElbowCement, PipeShape.SpinTeeCement,
  PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee,
  PipeShape.OneWay,
]);

/**
 * Return the set of valid TileDef field names for the given tile definition,
 * based on the tile's shape and (for Chamber tiles) chamber content type.
 */
export function getValidTileDefKeys(tile: TileDef): ReadonlySet<string> {
  const valid = new Set<string>(['shape']);
  const shape = tile.shape;

  if (ROTATION_SHAPES.has(shape)) valid.add('rotation');

  if (shape === PipeShape.Source) {
    valid.add('capacity');
    valid.add('connections');
    valid.add('temperature');
    valid.add('pressure');
  } else if (shape === PipeShape.Sink) {
    valid.add('connections');
  } else if (shape === PipeShape.Chamber) {
    valid.add('chamberContent');
    valid.add('connections');
    const cc = tile.chamberContent;
    if (cc === 'tank') valid.add('capacity');
    if (cc !== undefined && COST_CHAMBER_CONTENTS.has(cc)) valid.add('cost');
    if (cc === 'item') { valid.add('itemShape'); valid.add('itemCount'); }
    if (cc !== undefined && TEMP_RELEVANT_CONTENTS.has(cc)) valid.add('temperature');
    if (cc === 'pump') valid.add('pressure');
    if (cc === 'sandstone') { valid.add('hardness'); valid.add('shatter'); }
    if (cc === 'level') valid.add('levelIdx');
  } else if (shape === PipeShape.Cement) {
    valid.add('dryingTime');
  } else if (shape === PipeShape.SpinStraightCement || shape === PipeShape.SpinElbowCement || shape === PipeShape.SpinTeeCement) {
    valid.add('dryingTime');
  }

  return valid;
}

/**
 * Return the set of valid TileDef field names for the given tile definition
 * on a **chapter map** grid.  Chapter map tiles use a more restricted field
 * set than level tiles (e.g. Source has no capacity; Sink has completion).
 */
export function getValidChapterMapTileDefKeys(tile: TileDef): ReadonlySet<string> {
  const valid = new Set<string>(['shape']);
  const shape = tile.shape;

  if (ROTATION_SHAPES.has(shape)) valid.add('rotation');

  if (shape === PipeShape.Source) {
    // Chapter map Source: connections only – no capacity, temperature or pressure
    valid.add('connections');
  } else if (shape === PipeShape.Sink) {
    valid.add('connections');
    valid.add('completion');
  } else if (shape === PipeShape.Chamber) {
    valid.add('chamberContent');
    valid.add('connections');
    if (tile.chamberContent === 'level') valid.add('levelIdx');
  }

  return valid;
}

// ─── Editor navigation ────────────────────────────────────────────────────────

/** Top-level screens within the Campaign Editor UI. */
export enum EditorScreen {
  List        = 'list',
  Campaign    = 'campaign',
  Chapter     = 'chapter',
  LevelEditor = 'levelEditor',
}

// ─── Editor palette tool ──────────────────────────────────────────────────────

// Re-export ChamberContent from types so consumers that import from here still work.
export type { ChamberContent };

/** A palette entry that represents a Chamber tile with a specific content type. */
export type ChamberPalette = `chamber:${ChamberContent}`;

/** Which palette item is currently active in the level editor. */
export type EditorPalette =
  | 'erase'
  | PipeShape
  | ChamberPalette;

/** Returns true if the palette entry is a chamber content type. */
export function isChamberPalette(p: EditorPalette): p is ChamberPalette {
  return typeof p === 'string' && p.startsWith('chamber:');
}

/**
 * Returns true when the palette entry is a pipe shape, Source, or Sink —
 * the tile types that trigger the standard pipe-placement sound effect.
 */
export function isPipePlacementPalette(p: EditorPalette): boolean {
  return PIPE_SHAPES.has(p as PipeShape) || p === PipeShape.Source || p === PipeShape.Sink;
}

/** Extracts the ChamberContent from a ChamberPalette entry. */
export function chamberPaletteContent(p: ChamberPalette): ChamberContent {
  return p.slice('chamber:'.length) as ChamberContent;
}

// ─── Tile parameter state ────────────────────────────────────────────────────

/** Editable parameters for the currently selected palette tile. */
export interface TileParams {
  rotation: Rotation;
  capacity: number;
  cost: number;
  temperature: number;
  pressure: number;
  hardness: number;
  shatter: number;
  chamberContent: ChamberContent;
  itemShape: PipeShape;
  itemCount: number;
  connections: { N: boolean; E: boolean; S: boolean; W: boolean };
  /** Drying Time for Cement tiles – number of adjustments allowed before hardening. */
  dryingTime: number;
  /** Completion threshold for Sink tiles on chapter maps (≥ 0). */
  completion: number;
}

export const DEFAULT_PARAMS: TileParams = {
  rotation: 0,
  capacity: 6,
  cost: 1,
  temperature: 0,
  pressure: 0,
  hardness: 0,
  shatter: 0,
  chamberContent: 'tank',
  itemShape: PipeShape.Straight,
  itemCount: 1,
  connections: { N: true, E: true, S: true, W: true },
  dryingTime: 0,
  completion: 0,
};

// ─── Editor snapshot for undo/redo ───────────────────────────────────────────

export interface EditorSnapshot {
  grid: (TileDef | null)[][];
  rows: number;
  cols: number;
  inventory: InventoryItem[];
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  messages: string[];
}

// ─── Editor tile colors ────────────────────────────────────────────────────────

export const EDITOR_COLORS: Partial<Record<PipeShape, string>> = {
  [PipeShape.Source]:        '#27ae60',
  [PipeShape.Sink]:          '#2980b9',
  [PipeShape.Straight]:      '#4a90d9',
  [PipeShape.Elbow]:         '#4a90d9',
  [PipeShape.Tee]:           '#4a90d9',
  [PipeShape.Cross]:         '#4a90d9',
  [PipeShape.Granite]:       '#636e72',
  [PipeShape.Tree]:          '#2d6e1a',
  [PipeShape.Sea]:           '#2a7fbf',
  [PipeShape.Empty]:         '#1a2840',
  [PipeShape.EmptyDirt]:     '#7b5230',
  [PipeShape.EmptyDark]:     '#1a1a2e',
  [PipeShape.Cement]:        '#8090a0',
  [PipeShape.GoldSpace]:     '#b8860b',
  [PipeShape.GoldStraight]:  '#f39c12',
  [PipeShape.GoldElbow]:     '#f39c12',
  [PipeShape.GoldTee]:       '#f39c12',
  [PipeShape.GoldCross]:     '#f39c12',
  [PipeShape.SpinStraight]:  '#5a7fbf',
  [PipeShape.SpinElbow]:     '#5a7fbf',
  [PipeShape.SpinTee]:       '#5a7fbf',
  [PipeShape.SpinStraightCement]: '#5a7fbf',
  [PipeShape.SpinElbowCement]:    '#5a7fbf',
  [PipeShape.SpinTeeCement]:      '#5a7fbf',
  [PipeShape.LeakyStraight]: '#8b5c2a',
  [PipeShape.LeakyElbow]:    '#8b5c2a',
  [PipeShape.LeakyTee]:      '#8b5c2a',
  [PipeShape.LeakyCross]:    '#8b5c2a',
};

export function chamberColor(content: string): string {
  switch (content) {
    case 'tank':     return '#74b9ff';
    case 'dirt':     return DIRT_COLOR;
    case 'item':     return '#ffd700';
    case 'heater':   return '#e17055';
    case 'ice':      return ICE_COLOR;
    case 'pump':     return '#a8e063';
    case 'snow':     return '#b0d8f8';
    case 'sandstone': return '#c2a26e';
    case 'star':      return '#f0c040';
    case 'hot_plate': return '#e44';
    case 'level':    return '#2a3a5e';
    default:         return '#b2bec3';
  }
}

// ─── Shared editor UI constants ───────────────────────────────────────────────

/** Maximum CSS display size (px) for the editor canvas on either axis. */
export const MAX_EDITOR_CANVAS_PX = 512;
/** Border width (px) on each side of the editor canvas. */
export const EDITOR_CANVAS_BORDER = 3;
/** Minimum allowed grid dimension (rows or cols). */
export const GRID_MIN_DIM = 1;
/** Maximum allowed grid dimension (rows or cols). */
export const GRID_MAX_DIM = 20;
/** Border color for the currently selected palette item button. */
export const PALETTE_ITEM_SELECTED_BORDER = '#f0c040';
/** Border color for an unselected palette item button. */
export const PALETTE_ITEM_UNSELECTED_BORDER = '#2a3a5e';
/** Background color for the currently selected palette item button. */
export const PALETTE_ITEM_SELECTED_BG = '#2a3a1a';
/** Background color for an unselected palette item button. */
export const PALETTE_ITEM_UNSELECTED_BG = '#0d1a30';
/** Text color for the currently selected palette item button. */
export const PALETTE_ITEM_SELECTED_COLOR = '#f0c040';
/** Text color for an unselected palette item button. */
export const PALETTE_ITEM_UNSELECTED_COLOR = '#eee';
/** Base CSS for a side-panel box in the level editor (background, border, radius, padding). */
export const EDITOR_PANEL_BASE_CSS =
  'background:#16213e;border:1px solid #4a90d9;border-radius:8px;padding:10px;';
/** CSS for the all-caps section-title label inside an editor side-panel. */
export const EDITOR_PANEL_TITLE_CSS = 'font-size:0.8rem;color:#7ed321;font-weight:bold;letter-spacing:1px;';
/** CSS for a flex row that centers items and adds a small gap (used for label+input pairs). */
export const EDITOR_FLEX_ROW_CSS = 'display:flex;align-items:center;gap:8px;';

/**
 * Palette values that support paint-drag: clicking and dragging across multiple
 * empty cells places the tile on each one.  Includes all pipe shapes (regular and
 * gold), gold spaces, and granite – tile types commonly laid in bulk.
 */
export const REPEATABLE_EDITOR_TILES = new Set<EditorPalette>([
  PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee, PipeShape.Cross,
  PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross,
  PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee, PipeShape.LeakyCross,
  PipeShape.GoldSpace, PipeShape.OneWay, PipeShape.Cement, PipeShape.Granite, PipeShape.Tree, PipeShape.Sea,
  PipeShape.EmptyDirt, PipeShape.EmptyDark,
  PipeShape.SpinStraight, PipeShape.SpinElbow, PipeShape.SpinTee,
  PipeShape.SpinStraightCement, PipeShape.SpinElbowCement, PipeShape.SpinTeeCement,
]);

// ─── Helper: generate a unique ID ─────────────────────────────────────────────



/** Generate a unique campaign ID. */
export function generateCampaignId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Generate a numeric level ID unlikely to collide with official levels (1–99). */
export function generateLevelId(): number {
  return 10000 + Math.floor(Math.random() * 89999);
}

// ─── Gzip helpers ─────────────────────────────────────────────────────────────

/**
 * Decompress a gzip Blob and return the contained text.
 * Uses the Web Streams `DecompressionStream` API.
 */
export async function ungzipBlob(blob: Blob): Promise<string> {
  // Use blob.arrayBuffer() when available (Node.js, modern browsers);
  // fall back to FileReader for environments that lack it (e.g. jsdom).
  const buf: ArrayBuffer = 'arrayBuffer' in blob
    ? await blob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(blob);
    });
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  await writer.write(new Uint8Array(buf));
  await writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

// ── Grid rotation and reflection helpers ─────────────────────────────────────

/**
 * Rotate a 2-D grid of TileDefs 90° clockwise or counter-clockwise.
 * Returns the rotated grid and its new dimensions (rows/cols are swapped).
 *
 * Transform formulas:
 *   CW:  (r, c) → (c, oldRows-1-r)
 *   CCW: (r, c) → (oldCols-1-c, r)
 */
export function rotateGridBy90(
  grid: (TileDef | null)[][],
  oldRows: number,
  oldCols: number,
  clockwise: boolean,
): { newGrid: (TileDef | null)[][]; newRows: number; newCols: number } {
  const newRows = oldCols;
  const newCols = oldRows;

  const newGrid: (TileDef | null)[][] = Array.from(
    { length: newRows },
    () => Array(newCols).fill(null) as null[],
  );

  for (let r = 0; r < oldRows; r++) {
    for (let c = 0; c < oldCols; c++) {
      const tile = grid[r]?.[c];
      if (!tile) continue;
      const nr = clockwise ? c : oldCols - 1 - c;
      const nc = clockwise ? oldRows - 1 - r : r;
      newGrid[nr][nc] = rotateTileDefBy90(tile, clockwise);
    }
  }

  return { newGrid, newRows, newCols };
}

/**
 * Return a grid position transformed by a 90° CW or CCW board rotation.
 *
 * CW:  (r, c) → (c, oldRows-1-r)
 * CCW: (r, c) → (oldCols-1-c, r)
 */
export function rotatePositionBy90(
  pos: { row: number; col: number },
  oldRows: number,
  oldCols: number,
  clockwise: boolean,
): { row: number; col: number } {
  return clockwise
    ? { row: pos.col, col: oldRows - 1 - pos.row }
    : { row: oldCols - 1 - pos.col, col: pos.row };
}
export function rotateDirectionBy90(dir: Direction, clockwise: boolean): Direction {
  if (clockwise) {
    switch (dir) {
      case Direction.North: return Direction.East;
      case Direction.East:  return Direction.South;
      case Direction.South: return Direction.West;
      case Direction.West:  return Direction.North;
    }
  } else {
    switch (dir) {
      case Direction.North: return Direction.West;
      case Direction.West:  return Direction.South;
      case Direction.South: return Direction.East;
      case Direction.East:  return Direction.North;
    }
  }
}

/**
 * Return a shallow-copy of `tile` with its orientation (rotation/connections)
 * rotated 90° CW or CCW to match a board rotation.
 */
export function rotateTileDefBy90(tile: TileDef, clockwise: boolean): TileDef {
  const rotated: TileDef = { ...tile };

  if (rotated.connections) {
    rotated.connections = rotated.connections.map(d => rotateDirectionBy90(d, clockwise));
  }

  if (rotated.rotation !== undefined) {
    const delta = clockwise ? 90 : 270;
    rotated.rotation = ((rotated.rotation + delta) % 360) as Rotation;
  }

  return rotated;
}

// ── Grid reflection helpers (reflect about the x=y diagonal / transpose) ──────

/**
 * Map a direction through a reflection about the main diagonal (x=y / transpose).
 *
 * The transpose swaps (row, col) → (col, row), which transforms neighbors as:
 *   North ↔ West,  East ↔ South
 */
export function reflectDirectionAboutDiagonal(dir: Direction): Direction {
  switch (dir) {
    case Direction.North: return Direction.West;
    case Direction.West:  return Direction.North;
    case Direction.East:  return Direction.South;
    case Direction.South: return Direction.East;
  }
}

/**
 * The rotation value transformation under reflection about the main diagonal
 * depends on the pipe shape's geometry.
 *
 * Straight / Tee  – shapes whose 0° axis points N/S: new = (90  − R + 360) % 360
 * Elbow           – shape whose 0° corner is NE:     new = (180 − R + 360) % 360
 * OneWay          – encodes a single direction:       new = (270 − R + 360) % 360
 */
function _reflectRotationAboutDiagonal(shape: PipeShape, rotation: Rotation): Rotation {
  const isElbowLike = new Set<PipeShape>([
    PipeShape.Elbow, PipeShape.GoldElbow,
    PipeShape.SpinElbow, PipeShape.SpinElbowCement, PipeShape.LeakyElbow,
  ]).has(shape);
  const isOneWay = shape === PipeShape.OneWay;

  if (isElbowLike) return ((180 - rotation + 360) % 360) as Rotation;
  if (isOneWay)    return ((270 - rotation + 360) % 360) as Rotation;
  // Straight-like and Tee-like shapes
  return ((90 - rotation + 360) % 360) as Rotation;
}

/**
 * Return a shallow-copy of `tile` with its orientation reflected about the
 * main diagonal (transpose: row ↔ col).
 */
export function reflectTileDefAboutDiagonal(tile: TileDef): TileDef {
  const reflected: TileDef = { ...tile };

  if (reflected.connections) {
    reflected.connections = reflected.connections.map(reflectDirectionAboutDiagonal);
  }

  if (reflected.rotation !== undefined) {
    reflected.rotation = _reflectRotationAboutDiagonal(reflected.shape, reflected.rotation);
  }

  return reflected;
}

/**
 * Reflect a 2-D grid of TileDefs about the main diagonal (x=y / transpose).
 * Returns the reflected grid and its new dimensions (rows and cols are swapped).
 *
 * Transform: (r, c) → (c, r)
 */
export function reflectGridAboutDiagonal(
  grid: (TileDef | null)[][],
  oldRows: number,
  oldCols: number,
): { newGrid: (TileDef | null)[][]; newRows: number; newCols: number } {
  const newRows = oldCols;
  const newCols = oldRows;

  const newGrid: (TileDef | null)[][] = Array.from(
    { length: newRows },
    () => Array(newCols).fill(null) as null[],
  );

  for (let r = 0; r < oldRows; r++) {
    for (let c = 0; c < oldCols; c++) {
      const tile = grid[r]?.[c];
      if (!tile) continue;
      newGrid[c][r] = reflectTileDefAboutDiagonal(tile);
    }
  }

  return { newGrid, newRows, newCols };
}

/**
 * Return a grid position transformed by a reflection about the main diagonal.
 *
 * (r, c) → (c, r)
 */
export function reflectPositionAboutDiagonal(
  pos: { row: number; col: number },
): { row: number; col: number } {
  return { row: pos.col, col: pos.row };
}
