/**
 * Tile display name helpers – pure string/data functions with no canvas or
 * rendering state dependencies.
 */

import { Tile } from '../tile';
import { PipeShape } from '../types';

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

/** Return an inline SVG icon for the given pipe shape. */
export function shapeIcon(shape: PipeShape, color = '#4a90d9'): string {
  const S = 32;
  const H = S / 2;
  const sw = 5;
  const base = `width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"`;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
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
      return `<svg ${base}>${line(H, 0, H, S)}</svg>`;
    case PipeShape.Elbow:
      return `<svg ${base}><polyline points="${H},0 ${H},${H} ${S},${H}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case PipeShape.Tee:
      return `<svg ${base}>${line(H, 0, H, S)}${line(H, H, S, H)}</svg>`;
    case PipeShape.Cross:
      return `<svg ${base}>${line(H, 0, H, S)}${line(0, H, S, H)}</svg>`;
    default:
      return '';
  }
}

/** Return a human-readable name for an inventory item shape (used inside item-container tooltips). */
function _itemShapeDisplayName(shape: PipeShape | null): string {
  switch (shape) {
    case PipeShape.Straight:      return 'Straight';
    case PipeShape.Elbow:         return 'Elbow';
    case PipeShape.Tee:           return 'Tee';
    case PipeShape.Cross:         return 'Cross';
    case PipeShape.GoldStraight:  return 'Gold Straight';
    case PipeShape.GoldElbow:     return 'Gold Elbow';
    case PipeShape.GoldTee:       return 'Gold Tee';
    case PipeShape.GoldCross:     return 'Gold Cross';
    case PipeShape.LeakyStraight: return 'Leaky Straight';
    case PipeShape.LeakyElbow:    return 'Leaky Elbow';
    case PipeShape.LeakyTee:      return 'Leaky Tee';
    case PipeShape.LeakyCross:    return 'Leaky Cross';
    default:                      return 'Item';
  }
}

/**
 * Returns a human-readable display name for a tile derived from its shape and
 * chamber content.  Returns an empty string for tiles with no meaningful label
 * (Empty, GoldSpace).
 */
export function getTileDisplayName(tile: Tile): string {
  switch (tile.shape) {
    case PipeShape.Straight:
    case PipeShape.GoldStraight: return 'Straight';
    case PipeShape.Elbow:
    case PipeShape.GoldElbow:    return 'Elbow';
    case PipeShape.Tee:
    case PipeShape.GoldTee:      return 'Tee';
    case PipeShape.Cross:
    case PipeShape.GoldCross:    return 'Cross';
    case PipeShape.SpinStraight: return 'Spin Straight';
    case PipeShape.SpinElbow:    return 'Spin Elbow';
    case PipeShape.SpinTee:      return 'Spin Tee';
    case PipeShape.SpinStraightCement: return 'Spin Straight (Cement)';
    case PipeShape.SpinElbowCement:    return 'Spin Elbow (Cement)';
    case PipeShape.SpinTeeCement:      return 'Spin Tee (Cement)';
    case PipeShape.LeakyStraight: return 'Leaky Straight';
    case PipeShape.LeakyElbow:    return 'Leaky Elbow';
    case PipeShape.LeakyTee:      return 'Leaky Tee';
    case PipeShape.LeakyCross:    return 'Leaky Cross';
    case PipeShape.Source:       return `Source - Initial Capacity: ${tile.capacity}`;
    case PipeShape.Sink:         return 'Sink - goal';
    case PipeShape.Granite:      return 'Granite';
    case PipeShape.Tree:         return 'Tree';
    case PipeShape.Cement:       return 'Cement';
    case PipeShape.Chamber:
      switch (tile.chamberContent) {
        case 'tank':   return tile.capacity > 0 ? `Tank +${tile.capacity} water` : 'Tank water';
        case 'dirt':   return `Dirt -${tile.cost}`;
        case 'item': {
          const itemName = _itemShapeDisplayName(tile.itemShape);
          return tile.itemCount !== 1 ? `${tile.itemCount}× ${itemName}` : itemName;
        }
        case 'heater':
          if (tile.temperature < 0) return `Cooler ${tile.temperature}°`;
          return tile.temperature > 0 ? `Heater +${tile.temperature}°` : 'Heater';
        case 'ice':    return `Ice -${tile.temperature}° x ${tile.cost}`;
        case 'pump':
          if (tile.pressure < 0) return `Vacuum ${tile.pressure}P`;
          return `Pump +${tile.pressure}P`;
        case 'snow':    return `Snow -${tile.temperature}° x ${tile.cost}`;
        case 'sandstone': {
          const shatterActive = tile.shatter > tile.hardness;
          return shatterActive
            ? `Sandstone -${tile.temperature}° x ${tile.cost} (H=${tile.hardness}, S=${tile.shatter})`
            : `Sandstone -${tile.temperature}° x ${tile.cost} (H=${tile.hardness})`;
        }
        case 'hot_plate': return `Hot Plate ${tile.temperature}° x ${tile.cost}`;
        case 'star':   return 'Star';
        default:       return 'Chamber';
      }
    default: return '';
  }
}
