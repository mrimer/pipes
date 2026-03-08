/**
 * Types, interfaces, constants, and pure utility functions shared within the
 * Campaign Editor. Kept separate to reduce the size of campaignEditor.ts.
 */

import { PipeShape, TileDef, InventoryItem, Rotation } from './types';

// ─── Editor palette tool ──────────────────────────────────────────────────────

/** All chamber content types. */
export type ChamberContent = 'tank' | 'dirt' | 'item' | 'heater' | 'ice' | 'pump' | 'snow' | 'sandstone' | 'star';

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
  chamberContent: ChamberContent;
  itemShape: PipeShape;
  itemCount: number;
  connections: { N: boolean; E: boolean; S: boolean; W: boolean };
}

export const DEFAULT_PARAMS: TileParams = {
  rotation: 0,
  capacity: 6,
  cost: 1,
  temperature: 0,
  pressure: 0,
  hardness: 0,
  chamberContent: 'tank',
  itemShape: PipeShape.Straight,
  itemCount: 1,
  connections: { N: true, E: true, S: true, W: true },
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
  [PipeShape.Source]:       '#27ae60',
  [PipeShape.Sink]:         '#2980b9',
  [PipeShape.Straight]:     '#4a90d9',
  [PipeShape.Elbow]:        '#4a90d9',
  [PipeShape.Tee]:          '#4a90d9',
  [PipeShape.Cross]:        '#4a90d9',
  [PipeShape.Granite]:      '#636e72',
  [PipeShape.GoldSpace]:    '#b8860b',
  [PipeShape.GoldStraight]: '#f39c12',
  [PipeShape.GoldElbow]:    '#f39c12',
  [PipeShape.GoldTee]:      '#f39c12',
  [PipeShape.GoldCross]:    '#f39c12',
};

export function chamberColor(content: string): string {
  switch (content) {
    case 'tank':     return '#74b9ff';
    case 'dirt':     return '#a29bfe';
    case 'item':     return '#ffd700';
    case 'heater':   return '#e17055';
    case 'ice':      return '#00cec9';
    case 'pump':     return '#a8e063';
    case 'snow':     return '#b0d8f8';
    case 'sandstone': return '#c2a26e';
    case 'star':      return '#f0c040';
    default:         return '#b2bec3';
  }
}

// ─── Helper: generate a unique ID ─────────────────────────────────────────────

/** Generate a unique campaign ID. */
export function generateCampaignId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Generate a numeric level ID unlikely to collide with official levels (1–99). */
export function generateLevelId(): number {
  return 10000 + Math.floor(Math.random() * 89999);
}
