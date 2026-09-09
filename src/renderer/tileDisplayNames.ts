/**
 * Tile display name helpers – pure string/data functions with no canvas or
 * rendering state dependencies.
 */

import type { Tile } from '../tile';
import type { ChamberContent } from '../types';
import { PipeShape } from '../types';
import { svgEl, svgRoot } from '../svgUtils';
import { t } from '../i18n';

/** Unambiguous two-character abbreviation for each pipe shape, used inside ItemContainer tiles. */
export const SHAPE_ABBREV: Partial<Record<PipeShape, string>> = {
  [PipeShape.Straight]:     'St',
  [PipeShape.Elbow]:        'El',
  [PipeShape.Tee]:          'Te',
  [PipeShape.Cross]:        'Cr',
  [PipeShape.GoldStraight]: 'St',
  [PipeShape.GoldElbow]:    'El',
  [PipeShape.GoldTee]:      'Te',
  [PipeShape.GoldCross]:    'Cr',
  [PipeShape.LeakyStraight]: 'St',
  [PipeShape.LeakyElbow]:    'El',
  [PipeShape.LeakyTee]:      'Te',
  [PipeShape.LeakyCross]:    'Cr',
};

/** Build an SVG icon for the given pipe shape. */
export function buildShapeIcon(shape: PipeShape, color = '#4a90d9'): SVGSVGElement {
  const S = 32;
  const H = S / 2;
  const sw = 5;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    svgEl('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' });
  // Normalize gold, spin, and leaky variants to their base shape for icon rendering
  const SHAPE_ICON_BASE: Partial<Record<PipeShape, PipeShape>> = {
    [PipeShape.GoldStraight]:  PipeShape.Straight,
    [PipeShape.GoldElbow]:     PipeShape.Elbow,
    [PipeShape.GoldTee]:       PipeShape.Tee,
    [PipeShape.GoldCross]:     PipeShape.Cross,
    [PipeShape.SpinStraight]:  PipeShape.Straight,
    [PipeShape.SpinElbow]:     PipeShape.Elbow,
    [PipeShape.SpinTee]:       PipeShape.Tee,
    [PipeShape.SpinStraightCement]: PipeShape.Straight,
    [PipeShape.SpinElbowCement]:    PipeShape.Elbow,
    [PipeShape.SpinTeeCement]:      PipeShape.Tee,
    [PipeShape.LeakyStraight]: PipeShape.Straight,
    [PipeShape.LeakyElbow]:    PipeShape.Elbow,
    [PipeShape.LeakyTee]:      PipeShape.Tee,
    [PipeShape.LeakyCross]:    PipeShape.Cross,
  };
  const drawShape = SHAPE_ICON_BASE[shape] ?? shape;
  switch (drawShape) {
    case PipeShape.Straight:
      return svgRoot(S, [line(H, 0, H, S)]);
    case PipeShape.Elbow:
      return svgRoot(S, [svgEl('polyline', {
        points: `${H},0 ${H},${H} ${S},${H}`,
        fill: 'none',
        stroke: color,
        'stroke-width': sw,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      })]);
    case PipeShape.Tee:
      return svgRoot(S, [line(H, 0, H, S), line(H, H, S, H)]);
    case PipeShape.Cross:
      return svgRoot(S, [line(H, 0, H, S), line(0, H, S, H)]);
    default:
      return svgRoot(S, []);
  }
}

/** i18n key for each inventory-item shape's display name; shapes absent here fall back to 'tile.name.item'. */
const INVENTORY_ITEM_NAME_KEYS: Partial<Record<PipeShape, string>> = {
  [PipeShape.Straight]:      'tile.name.straight',
  [PipeShape.Elbow]:         'tile.name.elbow',
  [PipeShape.Tee]:           'tile.name.tee',
  [PipeShape.Cross]:         'tile.name.cross',
  [PipeShape.GoldStraight]:  'tile.name.goldStraight',
  [PipeShape.GoldElbow]:     'tile.name.goldElbow',
  [PipeShape.GoldTee]:       'tile.name.goldTee',
  [PipeShape.GoldCross]:     'tile.name.goldCross',
  [PipeShape.LeakyStraight]: 'tile.name.leakyStraight',
  [PipeShape.LeakyElbow]:    'tile.name.leakyElbow',
  [PipeShape.LeakyTee]:      'tile.name.leakyTee',
  [PipeShape.LeakyCross]:    'tile.name.leakyCross',
};

/** Return a human-readable name for an inventory item shape (used for inventory slot tooltips and item-container display names). */
export function getInventoryItemDisplayName(shape: PipeShape | null): string {
  const key = shape !== null ? INVENTORY_ITEM_NAME_KEYS[shape] : undefined;
  return t(key ?? 'tile.name.item');
}

/** i18n key for each non-Source, non-Chamber tile shape's display name; shapes absent here have no label. */
const SIMPLE_TILE_NAME_KEYS: Partial<Record<PipeShape, string>> = {
  [PipeShape.Straight]:     'tile.name.straight',
  [PipeShape.GoldStraight]: 'tile.name.goldStraight',
  [PipeShape.Elbow]:        'tile.name.elbow',
  [PipeShape.GoldElbow]:    'tile.name.goldElbow',
  [PipeShape.Tee]:          'tile.name.tee',
  [PipeShape.GoldTee]:      'tile.name.goldTee',
  [PipeShape.Cross]:        'tile.name.cross',
  [PipeShape.GoldCross]:    'tile.name.goldCross',
  [PipeShape.SpinStraight]: 'tile.name.spinStraight',
  [PipeShape.SpinElbow]:    'tile.name.spinElbow',
  [PipeShape.SpinTee]:      'tile.name.spinTee',
  [PipeShape.SpinStraightCement]: 'tile.name.spinStraightCement',
  [PipeShape.SpinElbowCement]:    'tile.name.spinElbowCement',
  [PipeShape.SpinTeeCement]:      'tile.name.spinTeeCement',
  [PipeShape.LeakyStraight]: 'tile.name.leakyStraight',
  [PipeShape.LeakyElbow]:    'tile.name.leakyElbow',
  [PipeShape.LeakyTee]:      'tile.name.leakyTee',
  [PipeShape.LeakyCross]:    'tile.name.leakyCross',
  [PipeShape.Sink]:          'tile.name.sink',
  [PipeShape.Granite]:       'tile.name.granite',
  [PipeShape.Tree]:          'tile.name.tree',
  [PipeShape.Tree2]:         'tile.name.tree2',
  [PipeShape.Tree3]:         'tile.name.tree3',
  [PipeShape.Tree4]:         'tile.name.tree4',
  [PipeShape.Sea]:           'tile.name.sea',
  [PipeShape.Cement]:        'tile.name.cementTile',
};

function _getChamberItemDisplayName(tile: Tile): string {
  const itemName = getInventoryItemDisplayName(tile.itemShape);
  const countedName = tile.itemCount !== 1 ? t('tile.chamber.item.counted', { count: tile.itemCount, name: itemName }) : itemName;
  return t('tile.chamber.item', { name: countedName });
}

function _getChamberHeaterDisplayName(tile: Tile): string {
  if (tile.temperature < 0) return t('tile.chamber.cooler', { temp: tile.temperature });
  return tile.temperature > 0 ? t('tile.chamber.heater', { temp: tile.temperature }) : t('tile.chamber.heaterZero');
}

function _getChamberPumpDisplayName(tile: Tile): string {
  if (tile.pressure < 0) return t('tile.chamber.vacuum', { pressure: tile.pressure });
  return t('tile.chamber.pump', { pressure: tile.pressure });
}

function _getChamberSandstoneDisplayName(tile: Tile): string {
  const shatterActive = tile.shatter > tile.hardness;
  return shatterActive
    ? t('tile.chamber.sandstoneShatter', { temp: tile.temperature, cost: tile.cost, hardness: tile.hardness, shatter: tile.shatter })
    : t('tile.chamber.sandstone', { temp: tile.temperature, cost: tile.cost, hardness: tile.hardness });
}

function _getChamberRegulatorDisplayName(tile: Tile): string {
  const stat = tile.regulatorStat ?? 'water';
  const op   = tile.regulatorOperator ?? '>';
  const statLabel = stat.charAt(0).toUpperCase() + stat.slice(1);
  return t('tile.chamber.regulator', { stat: statLabel, op, cost: tile.cost });
}

/** Per-chamberContent display-name builder; content values absent here (including 'level'/'chapter') fall back to 'tile.chamber.default'. */
const CHAMBER_CONTENT_DISPLAY_NAME: Partial<Record<NonNullable<ChamberContent>, (tile: Tile) => string>> = {
  tank: (tile) => tile.capacity > 0 ? t('tile.chamber.tank', { capacity: tile.capacity }) : t('tile.chamber.tankEmpty'),
  dirt: (tile) => t('tile.chamber.dirt', { cost: tile.cost }),
  item: _getChamberItemDisplayName,
  heater: _getChamberHeaterDisplayName,
  ice: (tile) => t('tile.chamber.ice', { temp: tile.temperature, cost: tile.cost }),
  pump: _getChamberPumpDisplayName,
  snow: (tile) => t('tile.chamber.snow', { temp: tile.temperature, cost: tile.cost }),
  sandstone: _getChamberSandstoneDisplayName,
  hot_plate: (tile) => t('tile.chamber.hotPlate', { temp: tile.temperature, cost: tile.cost }),
  star: () => t('tile.chamber.star'),
  regulator: _getChamberRegulatorDisplayName,
  gel: () => t('tile.chamber.gel'),
  siphon: () => t('tile.chamber.siphon'),
};

function _getChamberTileDisplayName(tile: Tile): string {
  const handler = tile.chamberContent !== null ? CHAMBER_CONTENT_DISPLAY_NAME[tile.chamberContent] : undefined;
  return handler ? handler(tile) : t('tile.chamber.default');
}

/**
 * Returns a human-readable display name for a tile derived from its shape and
 * chamber content.  Returns an empty string for tiles with no meaningful label
 * (Empty, GoldSpace).
 */
export function getTileDisplayName(tile: Tile): string {
  if (tile.shape === PipeShape.Source) return t('tile.name.source', { capacity: tile.capacity });
  if (tile.shape === PipeShape.Chamber) return _getChamberTileDisplayName(tile);
  const key = SIMPLE_TILE_NAME_KEYS[tile.shape];
  return key !== undefined ? t(key) : '';
}
