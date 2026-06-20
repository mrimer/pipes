/**
 * Tile display name helpers – pure string/data functions with no canvas or
 * rendering state dependencies.
 */

import type { Tile } from '../tile';
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

/** Return a human-readable name for an inventory item shape (used for inventory slot tooltips and item-container display names). */
export function getInventoryItemDisplayName(shape: PipeShape | null): string {
  switch (shape) {
    case PipeShape.Straight:      return t('tile.name.straight');
    case PipeShape.Elbow:         return t('tile.name.elbow');
    case PipeShape.Tee:           return t('tile.name.tee');
    case PipeShape.Cross:         return t('tile.name.cross');
    case PipeShape.GoldStraight:  return t('tile.name.goldStraight');
    case PipeShape.GoldElbow:     return t('tile.name.goldElbow');
    case PipeShape.GoldTee:       return t('tile.name.goldTee');
    case PipeShape.GoldCross:     return t('tile.name.goldCross');
    case PipeShape.LeakyStraight: return t('tile.name.leakyStraight');
    case PipeShape.LeakyElbow:    return t('tile.name.leakyElbow');
    case PipeShape.LeakyTee:      return t('tile.name.leakyTee');
    case PipeShape.LeakyCross:    return t('tile.name.leakyCross');
    default:                      return t('tile.name.item');
  }
}

/**
 * Returns a human-readable display name for a tile derived from its shape and
 * chamber content.  Returns an empty string for tiles with no meaningful label
 * (Empty, GoldSpace).
 */
export function getTileDisplayName(tile: Tile): string {
  switch (tile.shape) {
    case PipeShape.Straight:     return t('tile.name.straight');
    case PipeShape.GoldStraight: return t('tile.name.goldStraight');
    case PipeShape.Elbow:        return t('tile.name.elbow');
    case PipeShape.GoldElbow:    return t('tile.name.goldElbow');
    case PipeShape.Tee:          return t('tile.name.tee');
    case PipeShape.GoldTee:      return t('tile.name.goldTee');
    case PipeShape.Cross:        return t('tile.name.cross');
    case PipeShape.GoldCross:    return t('tile.name.goldCross');
    case PipeShape.SpinStraight: return t('tile.name.spinStraight');
    case PipeShape.SpinElbow:    return t('tile.name.spinElbow');
    case PipeShape.SpinTee:      return t('tile.name.spinTee');
    case PipeShape.SpinStraightCement: return t('tile.name.spinStraightCement');
    case PipeShape.SpinElbowCement:    return t('tile.name.spinElbowCement');
    case PipeShape.SpinTeeCement:      return t('tile.name.spinTeeCement');
    case PipeShape.LeakyStraight: return t('tile.name.leakyStraight');
    case PipeShape.LeakyElbow:    return t('tile.name.leakyElbow');
    case PipeShape.LeakyTee:      return t('tile.name.leakyTee');
    case PipeShape.LeakyCross:    return t('tile.name.leakyCross');
    case PipeShape.Source:       return t('tile.name.source', { capacity: tile.capacity });
    case PipeShape.Sink:         return t('tile.name.sink');
    case PipeShape.Granite:      return t('tile.name.granite');
    case PipeShape.Tree:         return t('tile.name.tree');
    case PipeShape.Tree2:        return t('tile.name.tree2');
    case PipeShape.Tree3:        return t('tile.name.tree3');
    case PipeShape.Tree4:        return t('tile.name.tree4');
    case PipeShape.Sea:          return t('tile.name.sea');
    case PipeShape.Cement:       return t('tile.name.cementTile');
    case PipeShape.Chamber:
      switch (tile.chamberContent) {
        case 'tank':   return tile.capacity > 0 ? t('tile.chamber.tank', { capacity: tile.capacity }) : t('tile.chamber.tankEmpty');
        case 'dirt':   return t('tile.chamber.dirt', { cost: tile.cost });
        case 'item': {
          const itemName = getInventoryItemDisplayName(tile.itemShape);
          const countedName = tile.itemCount !== 1 ? t('tile.chamber.item.counted', { count: tile.itemCount, name: itemName }) : itemName;
          return t('tile.chamber.item', { name: countedName });
        }
        case 'heater':
          if (tile.temperature < 0) return t('tile.chamber.cooler', { temp: tile.temperature });
          return tile.temperature > 0 ? t('tile.chamber.heater', { temp: tile.temperature }) : t('tile.chamber.heaterZero');
        case 'ice':    return t('tile.chamber.ice', { temp: tile.temperature, cost: tile.cost });
        case 'pump':
          if (tile.pressure < 0) return t('tile.chamber.vacuum', { pressure: tile.pressure });
          return t('tile.chamber.pump', { pressure: tile.pressure });
        case 'snow':    return t('tile.chamber.snow', { temp: tile.temperature, cost: tile.cost });
        case 'sandstone': {
          const shatterActive = tile.shatter > tile.hardness;
          return shatterActive
            ? t('tile.chamber.sandstoneShatter', { temp: tile.temperature, cost: tile.cost, hardness: tile.hardness, shatter: tile.shatter })
            : t('tile.chamber.sandstone', { temp: tile.temperature, cost: tile.cost, hardness: tile.hardness });
        }
        case 'hot_plate': return t('tile.chamber.hotPlate', { temp: tile.temperature, cost: tile.cost });
        case 'star':   return t('tile.chamber.star');
        case 'regulator': {
          const stat = tile.regulatorStat ?? 'water';
          const op   = tile.regulatorOperator ?? '>';
          const statLabel = stat.charAt(0).toUpperCase() + stat.slice(1);
          return t('tile.chamber.regulator', { stat: statLabel, op, cost: tile.cost });
        }
        case 'gel':    return t('tile.chamber.gel');
        case 'siphon': return t('tile.chamber.siphon');
        default:       return t('tile.chamber.default');
      }
    default: return '';
  }
}
