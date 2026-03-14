/**
 * Board rendering helpers – draw the game board canvas and individual pipe tiles.
 */

import { Board, GOLD_PIPE_SHAPES, PIPE_SHAPES, SPIN_PIPE_SHAPES } from './board';
import { Tile } from './tile';
import { AmbientDecoration, GridPos, PipeShape, Direction } from './types';
import {
  BG_COLOR, TILE_BG, FOCUS_COLOR,
  EMPTY_COLOR, EMPTY_TARGET_COLOR,
  GOLD_SPACE_BASE_COLOR, GOLD_SPACE_SHIMMER_COLOR, GOLD_SPACE_BORDER_COLOR,
  PIPE_COLOR, WATER_COLOR,
  SOURCE_COLOR, SOURCE_WATER_COLOR,
  SINK_COLOR, SINK_WATER_COLOR,
  TANK_COLOR, TANK_WATER_COLOR,
  FIXED_PIPE_COLOR, FIXED_PIPE_WATER_COLOR,
  DIRT_WATER_COLOR, DIRT_COST_COLOR, DIRT_COLOR,
  CONTAINER_COLOR, CONTAINER_WATER_COLOR,
  CHAMBER_COLOR, CHAMBER_WATER_COLOR, CHAMBER_FILL_COLOR, CHAMBER_FILL_WATER_COLOR,
  GRANITE_COLOR, GRANITE_FILL_COLOR,
  CEMENT_COLOR, CEMENT_FILL_COLOR,
  GOLD_PIPE_COLOR, GOLD_PIPE_WATER_COLOR,
  LABEL_COLOR,
  REMOVABLE_BG_COLOR,
  HEATER_COLOR, HEATER_WATER_COLOR,
  COOLER_COLOR, COOLER_WATER_COLOR,
  ICE_COLOR, ICE_WATER_COLOR,
  PUMP_COLOR, PUMP_WATER_COLOR,
  VACUUM_COLOR, VACUUM_WATER_COLOR,
  SNOW_COLOR, SNOW_WATER_COLOR,
  SANDSTONE_COLOR, SANDSTONE_WATER_COLOR,
  SANDSTONE_HARD_COLOR, SANDSTONE_HARD_WATER_COLOR,
  SANDSTONE_SHATTER_COLOR, SANDSTONE_SHATTER_WATER_COLOR,
  STAR_COLOR, STAR_WATER_COLOR,
  HOT_PLATE_COLOR, HOT_PLATE_WATER_COLOR,
  ANIM_POSITIVE_COLOR, ANIM_NEGATIVE_COLOR,
} from './colors';

let LINE_WIDTH = 10; // pipe stroke width in px

/** The current tile size in pixels.  64 (default) or 128 (large) depending on the viewport. */
export let TILE_SIZE = 64; // px

/** Base tile size used as the reference for all pixel-value scaling. */
const BASE_TILE_SIZE = 64;

/**
 * Scale a pixel value that was designed for BASE_TILE_SIZE to the current TILE_SIZE.
 * Use for font sizes, small offsets and decoration dimensions.
 */
function _s(n: number): number {
  return Math.round(n * TILE_SIZE / BASE_TILE_SIZE);
}

/**
 * Exported alias for `_s`.  Allows other modules (e.g. campaignEditorRenderer)
 * to scale pixel constants using the same factor.
 */
export function scalePx(n: number): number {
  return _s(n);
}

/**
 * Compute the largest tile size between 64 and 128 px (inclusive) such that
 * the full grid fits within the current window's inner dimensions.
 * Returns BASE_TILE_SIZE (64) when no window is available or the grid already
 * overflows at the base size.
 *
 * @param vOverhead  Vertical pixels already consumed by UI elements outside
 *                   the grid (e.g. title, header buttons, panels below the
 *                   grid).  Subtracted from the available height before the
 *                   tile size is computed so that those elements can all fit
 *                   on screen at once.
 */
export function computeTileSize(rows: number, cols: number, vOverhead = 0): number {
  if (typeof window === 'undefined') return BASE_TILE_SIZE;
  const avW = window.innerWidth;
  const avH = window.innerHeight - vOverhead;
  const maxFit = Math.floor(Math.min(avW / cols, avH / rows));
  return Math.max(BASE_TILE_SIZE, Math.min(128, maxFit));
}

/**
 * Update the active tile size and derived constants.
 * Call this before setting canvas dimensions when loading a level.
 */
export function setTileSize(size: number): void {
  TILE_SIZE = size;
  LINE_WIDTH = Math.round(10 * size / BASE_TILE_SIZE);
}

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
};

/** Return an inline SVG icon for the given pipe shape. */
export function shapeIcon(shape: PipeShape, color = '#4a90d9'): string {
  const S = 32;
  const H = S / 2;
  const sw = 5;
  const base = `width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"`;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  // Map gold pipe shapes to their base shape for icon rendering
  let drawShape = shape;
  if (shape === PipeShape.GoldStraight) drawShape = PipeShape.Straight;
  else if (shape === PipeShape.GoldElbow) drawShape = PipeShape.Elbow;
  else if (shape === PipeShape.GoldTee) drawShape = PipeShape.Tee;
  else if (shape === PipeShape.GoldCross) drawShape = PipeShape.Cross;
  else if (shape === PipeShape.SpinStraight) drawShape = PipeShape.Straight;
  else if (shape === PipeShape.SpinElbow) drawShape = PipeShape.Elbow;
  else if (shape === PipeShape.SpinTee) drawShape = PipeShape.Tee;
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

/**
 * Draw a white CW curved arrow with a black outline, centred at the canvas
 * origin.  Used to indicate that a spinnable pipe can be rotated clockwise.
 * The caller is responsible for translating the context to the desired centre.
 */
export function drawSpinArrow(ctx: CanvasRenderingContext2D): void {
  const r = _s(11);
  // Arc spans ~270° clockwise: start at 150°, end at 60° (going CW = increasing angle).
  const startAngle = (150 * Math.PI) / 180;
  const endAngle   = startAngle + (270 * Math.PI) / 180;
  // Tip of the arrowhead: the point on the circle at endAngle (mod 2π = 60°).
  const tipAngle = endAngle % (Math.PI * 2);
  const tipX = r * Math.cos(tipAngle);
  const tipY = r * Math.sin(tipAngle);
  // Tangent direction at tipAngle going CW (increasing angle in canvas coords).
  const tdx = -Math.sin(tipAngle);
  const tdy =  Math.cos(tipAngle);
  // Arrowhead dimensions.
  const headLen = _s(5);
  const headHalf = _s(3);
  const baseX = tipX - tdx * headLen;
  const baseY = tipY - tdy * headLen;
  const p1x = baseX + tdy * headHalf;
  const p1y = baseY - tdx * headHalf;
  const p2x = baseX - tdy * headHalf;
  const p2y = baseY + tdx * headHalf;

  // Draw black outline layer.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = _s(3);
  ctx.strokeStyle = 'black';
  ctx.beginPath();
  ctx.arc(0, 0, r, startAngle, endAngle, false);
  ctx.stroke();
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.closePath();
  ctx.fill();

  // Draw white arrow on top.
  ctx.lineWidth = _s(1.5);
  ctx.strokeStyle = 'white';
  ctx.beginPath();
  ctx.arc(0, 0, r, startAngle, endAngle, false);
  ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function _drawSourceOrSink(ctx: CanvasRenderingContext2D, tile: Tile, color: string, half: number, currentWater: number, shape: PipeShape): void {
  // Filled circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // Radiating lines – only for connected directions
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';
  if (tile.connections.has(Direction.North)) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -half); ctx.stroke();
  }
  if (tile.connections.has(Direction.South)) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, half); ctx.stroke();
  }
  if (tile.connections.has(Direction.East)) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(half, 0); ctx.stroke();
  }
  if (tile.connections.has(Direction.West)) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-half, 0); ctx.stroke();
  }
  // Show capacity number on Source (drawn last so it appears on top)
  if (shape === PipeShape.Source) {
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(currentWater), 0, 0);
  }
}

function _drawGranite(ctx: CanvasRenderingContext2D, half: number): void {
  const bw = half * 0.7;
  const bh = half * 0.7;
  ctx.fillStyle = GRANITE_FILL_COLOR;
  ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(3);
  ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
  // Stone texture – a few crack-like lines
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.beginPath(); ctx.moveTo(-bw + _s(4), -bh + _s(10)); ctx.lineTo(bw - _s(6), -bh + _s(16)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(2), _s(2));         ctx.lineTo(bw - _s(8), _s(8));        ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(6), bh - _s(14));   ctx.lineTo(bw - _s(4), bh - _s(8));  ctx.stroke();
}

/**
 * Draw the cement background for a grid cell.
 * Call once during renderBoard pass 1, using full tile-space coordinates (x, y top-left).
 */
function _drawCementBackground(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const ts = TILE_SIZE;
  // Light-gray fill
  ctx.fillStyle = CEMENT_FILL_COLOR;
  ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
  // Slightly darker border
  ctx.strokeStyle = CEMENT_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
  // Three diagonal wavy lines (SW→NE direction), clipped to tile interior
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, ts - 4, ts - 4);
  ctx.clip();
  ctx.strokeStyle = CEMENT_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const len = ts * 0.52; // half-length of each line (will be clipped)
  const spacing = _s(10); // spacing between parallel lines
  const sq2 = Math.SQRT1_2;
  for (let i = -1; i <= 1; i++) {
    // Offset along perpendicular direction (1,1)/√2
    const px = i * spacing * sq2;
    const py = i * spacing * sq2;
    const lx = cx + px;
    const ly = cy + py;
    // Line endpoints along direction (1,−1)/√2
    const sx = lx - len * sq2;
    const sy = ly + len * sq2;
    const ex = lx + len * sq2;
    const ey = ly - len * sq2;
    // Wavy: control point offset slightly along (1,1)/√2 from the line midpoint
    const wave = _s(3);
    const cpx = lx + wave * sq2;
    const cpy = ly + wave * sq2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the drying time label in the top-left corner of a cement cell.
 * Replaces the dark shadow overlay: displays the numeric T value (or "X" when
 * hardened) with a black edge on a dark-gray fill for maximum readability over
 * any tile background.
 * Call after all tile content is drawn, using full tile-space coordinates (x, y top-left).
 *
 * @param isHardened - true when dryingTime is 0 AND a pipe has been placed on
 *   the tile.  Only hardened tiles display the "X"; otherwise the numeric value
 *   (including "0") is shown.
 */
function _drawCementLabel(ctx: CanvasRenderingContext2D, x: number, y: number, dryingTime: number, isHardened: boolean): void {
  const label = isHardened ? 'X' : String(dryingTime);
  const fontSize = _s(18);
  ctx.save();
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lx = x + _s(4);
  const ly = y + _s(3);
  // Black stroke for edge contrast over any background
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = _s(1.5);
  ctx.lineJoin = 'round';
  ctx.strokeText(label, lx, ly);
  // Dark gray fill – readable but not as harsh as pure black
  ctx.fillStyle = '#505050';
  ctx.fillText(label, lx, ly);
  ctx.restore();
}

function _drawChamberItemContent(ctx: CanvasRenderingContext2D, itemShape: PipeShape | null, itemCount: number, bw: number, bh: number, isWater: boolean, half: number): void {
  // Draw a mini version of the item pipe shape scaled to fit snugly inside the chamber box
  const isGoldItem = itemShape !== null && GOLD_PIPE_SHAPES.has(itemShape);
  const itemColor = isGoldItem
    ? (isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR)
    : (isWater ? WATER_COLOR : PIPE_COLOR);
  if (itemShape !== null) {
    let drawShape = itemShape;
    if (itemShape === PipeShape.GoldStraight) drawShape = PipeShape.Straight;
    else if (itemShape === PipeShape.GoldElbow) drawShape = PipeShape.Elbow;
    else if (itemShape === PipeShape.GoldTee) drawShape = PipeShape.Tee;
    else if (itemShape === PipeShape.GoldCross) drawShape = PipeShape.Cross;
    ctx.save();
    // Clip to the inner box so the pipe image never bleeds onto the connection stubs
    ctx.beginPath();
    ctx.rect(-bw, -bh, bw * 2, bh * 2);
    ctx.clip();
    // Scale item to 75% of box size so it doesn't touch the chamber box edge
    const scale = (bw * 0.75) / half;
    ctx.scale(scale, scale);
    ctx.strokeStyle = itemColor;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    if (drawShape === PipeShape.Straight) {
      ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(0, half); ctx.stroke();
    } else if (drawShape === PipeShape.Elbow) {
      ctx.beginPath();
      ctx.moveTo(0, -half); ctx.lineTo(0, 0); ctx.lineTo(half, 0);
      ctx.stroke();
    } else if (drawShape === PipeShape.Tee) {
      ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(0, half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(half, 0); ctx.stroke();
    } else if (drawShape === PipeShape.Cross) {
      ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(0, half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(half, 0); ctx.stroke();
    }
    ctx.restore();
  }
  // Draw quantity number centered, white with a 1px black outline
  if (itemCount > 1) {
    const countLabel = String(itemCount);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${_s(30)}px Arial`;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = _s(1);
    ctx.strokeText(countLabel, 0, 0);
    ctx.fillStyle = 'white';
    ctx.fillText(countLabel, 0, 0);
  }
}

function _drawChamberHeaterContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
  // Show temperature bonus (no plus sign for negative values)
  const isCooler = tile.temperature < 0;
  const heaterBaseColor = isCooler
    ? (isWater ? COOLER_WATER_COLOR : COOLER_COLOR)
    : (isWater ? HEATER_WATER_COLOR : HEATER_COLOR);
  // Draw decorative lines near the top of the box
  ctx.strokeStyle = heaterBaseColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const lineLeft = -bw + _s(4);
  const lineRight = bw - _s(4);
  const lineSpan = lineRight - lineLeft;
  if (isCooler) {
    // Cooler: thin horizontal wind lines near top
    for (let i = 0; i < 3; i++) {
      const lineY = -bh + _s(4) + i * _s(3.5);
      const hw = (lineSpan - i * _s(5)) / 2;
      ctx.beginPath();
      ctx.moveTo(-hw, lineY);
      ctx.lineTo(hw, lineY);
      ctx.stroke();
    }
  } else {
    // Heater: 3 short, thin wavy heat lines near the top
    for (let i = 0; i < 3; i++) {
      const lineY = -bh + _s(4) + i * _s(3.5);
      const xMid = 0;
      const xQuart = lineSpan / 4;
      ctx.beginPath();
      ctx.moveTo(lineLeft, lineY);
      ctx.quadraticCurveTo(lineLeft + xQuart, lineY - _s(2.5), xMid, lineY);
      ctx.quadraticCurveTo(xMid + xQuart, lineY + _s(2.5), lineRight, lineY);
      ctx.stroke();
    }
  }
  ctx.fillStyle = heaterBaseColor;
  ctx.font = `bold ${_s(13)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tempStr = tile.temperature >= 0 ? `+${tile.temperature}°` : `${tile.temperature}°`;
  ctx.fillText(tempStr, 0, 0);
}

function _drawChamberIceContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, shiftHeld: boolean, currentTemp: number, lockedCost: number | null): void {
  // Draw short diagonal ice lines in top-left and bottom-right corners
  const iceDecorColor = isWater ? ICE_WATER_COLOR : ICE_COLOR;
  ctx.strokeStyle = iceDecorColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-bw + _s(3), -bh + _s(9)); ctx.lineTo(-bw + _s(9), -bh + _s(3)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(3), -bh + _s(13)); ctx.lineTo(-bw + _s(13), -bh + _s(3)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bw - _s(9), bh - _s(3)); ctx.lineTo(bw - _s(3), bh - _s(9)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bw - _s(13), bh - _s(3)); ctx.lineTo(bw - _s(3), bh - _s(13)); ctx.stroke();
  ctx.fillStyle = iceDecorColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lockedCost !== null) {
    // Connected: show the single locked effective (negative) cost value
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(-lockedCost), 0, 0);
  } else {
    // Unconnected: show three lines: negative cost, "x", and the temperature threshold.
    // By default, adjust the threshold display by current temperature (capped at 0).
    // When shift is held, show the raw (unadjusted) threshold value.
    const iceThreshold = shiftHeld
      ? tile.temperature
      : Math.max(0, tile.temperature - currentTemp);
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(`-${iceThreshold}°`, 0, -_s(9));
    ctx.font = `bold ${_s(9)}px Arial`;
    ctx.fillText('x', 0, 0);
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(tile.cost), 0, _s(9));
  }
}

function _drawChamberPumpContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
  // Show pressure bonus (no plus sign for negative values)
  const isVacuum = tile.pressure < 0;
  const pumpBaseColor = isVacuum
    ? (isWater ? VACUUM_WATER_COLOR : VACUUM_COLOR)
    : (isWater ? PUMP_WATER_COLOR : PUMP_COLOR);
  // Draw decorative graphics near the top of the box
  ctx.strokeStyle = pumpBaseColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  if (isVacuum) {
    // Vacuum: simple vortex swirl near the top
    const swirlY = -bh + _s(9);
    ctx.beginPath();
    ctx.arc(0, swirlY, _s(7), 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, swirlY, _s(3.5), Math.PI * 0.5, Math.PI * 2);
    ctx.stroke();
  } else {
    // Pump: series of thin chevrons in a horizontal line near the top
    const chevY = -bh + _s(7);
    const chevH = _s(4);
    const chevSpacing = _s(7);
    const numChev = 4;
    const chevStartX = -(numChev - 1) * chevSpacing / 2;
    for (let i = 0; i < numChev; i++) {
      const chx = chevStartX + i * chevSpacing;
      ctx.beginPath();
      ctx.moveTo(chx - _s(2.5), chevY - chevH);
      ctx.lineTo(chx + _s(2.5), chevY);
      ctx.lineTo(chx - _s(2.5), chevY + chevH);
      ctx.stroke();
    }
  }
  ctx.fillStyle = pumpBaseColor;
  ctx.font = `bold ${_s(13)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pressStr = tile.pressure >= 0 ? `+${tile.pressure}P` : `${tile.pressure}P`;
  ctx.fillText(pressStr, 0, 0);
}

function _drawChamberSnowContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, shiftHeld: boolean, currentTemp: number, currentPressure: number, lockedCost: number | null): void {
  // Draw a small snowflake in the top-right inside corner
  const snowDecorColor = isWater ? SNOW_WATER_COLOR : SNOW_COLOR;
  ctx.strokeStyle = snowDecorColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const sfx = bw - _s(8);
  const sfy = -bh + _s(8);
  const sfR = _s(5);
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    ctx.beginPath();
    ctx.moveTo(sfx, sfy);
    ctx.lineTo(sfx + sfR * Math.cos(angle), sfy + sfR * Math.sin(angle));
    ctx.stroke();
  }
  ctx.fillStyle = snowDecorColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lockedCost !== null) {
    // Connected: show the single locked effective (negative) cost value
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(-lockedCost), 0, 0);
  } else {
    // Unconnected: show three lines: negative adjusted cost, "x", and the temperature threshold.
    // By default, show values adjusted by current Pressure and Temperature.
    // When shift is held, show the raw (unadjusted) values.
    const deltaTemp = shiftHeld
      ? tile.temperature
      : Math.max(0, tile.temperature - currentTemp);
    const snowCost = shiftHeld
      ? tile.cost
      : Math.max(1, currentPressure >= 1 ? Math.ceil(tile.cost / currentPressure) : tile.cost);
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(`-${deltaTemp}°`, 0, -_s(9));
    ctx.font = `bold ${_s(9)}px Arial`;
    ctx.fillText('x', 0, 0);
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(snowCost), 0, _s(9));
  }
}

function _drawChamberSandstoneContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, sandstoneColor: string, shiftHeld: boolean, currentTemp: number, currentPressure: number, lockedCost: number | null): void {
  // When hardness >= pressure, use darker color and show hardness.
  // When shatter is active and pressure reaches the shatter threshold, use lighter color.
  // When connected, show the locked effective cost value.
  // Otherwise show cost display lines.
  const shatterActive = tile.shatter > tile.hardness;
  const isHard = tile.hardness >= currentPressure;
  const isShatterTriggered = shatterActive && currentPressure >= tile.shatter;
  // Draw 2 wavy lines near the bottom inside the box (sandstone layers)
  ctx.strokeStyle = sandstoneColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const sLineLeft = -bw + _s(4);
  const sLineRight = bw - _s(4);
  const sLineSpan = sLineRight - sLineLeft;
  const sLineMid = 0;
  const sLineQuart = sLineSpan / 4;
  for (let i = 0; i < 2; i++) {
    const sLineY = bh - _s(5) - i * _s(4);
    ctx.beginPath();
    ctx.moveTo(sLineLeft, sLineY);
    ctx.quadraticCurveTo(sLineLeft + sLineQuart, sLineY - _s(2.5), sLineMid, sLineY);
    ctx.quadraticCurveTo(sLineMid + sLineQuart, sLineY + _s(2.5), sLineRight, sLineY);
    ctx.stroke();
  }
  // Vertically center text between the rect top (−bh) and the top of the wavy lines.
  const wavesTop = bh - _s(11.5);
  const textCenterY = (-bh + wavesTop) / 2;
  // Use the lighter standard sandstone color for text when isHard so it is readable
  // against the dark tile background.
  ctx.fillStyle = isHard ? (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR) : sandstoneColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isHard) {
    // Alternative display: show hardness/H on top line and "temperature x cost" below, centered together
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(`${tile.hardness}H`, 0, textCenterY - _s(4));
    ctx.font = (tile.temperature < 10 && tile.cost < 10) ? `bold ${_s(11)}px Arial` : `bold ${_s(9)}px Arial`;
    ctx.fillText(`${tile.temperature}° x ${tile.cost}`, 0, textCenterY + _s(10));
  } else if (lockedCost !== null) {
    // Connected: show the single locked effective (negative) cost value
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(-lockedCost), 0, textCenterY);
  } else {
    // Unconnected: show cost display.
    // deltaDamage = Pressure − Hardness is used as the cost divisor.
    // When shift is held, show the raw (unadjusted) values.
    const sandstoneThreshold = shiftHeld
      ? tile.temperature
      : Math.max(0, tile.temperature - currentTemp);
    const deltaDamage = currentPressure - tile.hardness;
    const sandstoneCost = shiftHeld
      ? tile.cost
      : Math.max(1, deltaDamage >= 1 ? Math.ceil(tile.cost / deltaDamage) : tile.cost);
    if (shatterActive) {
      const displayCost = isShatterTriggered ? 0 : sandstoneCost;
      ctx.font = tile.shatter < 10 ? `bold ${_s(12)}px Arial` : `bold ${_s(9)}px Arial`;
      ctx.fillText(isShatterTriggered ? 'WEAK' : `S @ ${tile.shatter}P`, 0, textCenterY - _s(7));
      ctx.font = (sandstoneThreshold < 10 && displayCost < 10) ? `bold ${_s(11)}px Arial` : `bold ${_s(9)}px Arial`;
      ctx.fillText(`-${sandstoneThreshold}° x ${displayCost}`, 0, textCenterY + _s(7));
    } else {
      ctx.font = `bold ${_s(14)}px Arial`;
      ctx.fillText(`-${sandstoneThreshold}°`, 0, textCenterY - _s(5));
      ctx.font = `bold ${_s(9)}px Arial`;
      ctx.fillText('x', 0, textCenterY + _s(4));
      ctx.font = `bold ${_s(14)}px Arial`;
      ctx.fillText(String(sandstoneCost), 0, textCenterY + _s(13));
    }
  }
}

function _drawChamberHotPlateContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, shiftHeld: boolean, currentTemp: number, lockedCost: number | null, lockedGain: number | null): void {
  // Draw a small flame icon in the top-right inside corner
  const hotColor = isWater ? HOT_PLATE_WATER_COLOR : HOT_PLATE_COLOR;
  ctx.strokeStyle = hotColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  // Flame: a simple upward-pointing flame shape
  const fx = bw - _s(8);
  const fy = -bh + _s(9);
  const fr = _s(5);
  ctx.beginPath();
  ctx.moveTo(fx, fy + fr);
  ctx.bezierCurveTo(fx - fr, fy, fx - fr * 0.5, fy - fr * 1.2, fx, fy - fr);
  ctx.bezierCurveTo(fx + fr * 0.5, fy - fr * 1.2, fx + fr, fy, fx, fy + fr);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lockedGain !== null || lockedCost !== null) {
    // Connected: show gain in green and/or loss in red
    const gain = lockedGain ?? 0;
    const loss = lockedCost ?? 0;
    ctx.font = `bold ${_s(12)}px Arial`;
    if (gain > 0 && loss > 0) {
      // Both gain and loss: show each in its own colour, offset vertically
      ctx.fillStyle = ANIM_POSITIVE_COLOR;
      ctx.fillText(`+${gain}`, 0, -_s(6));
      ctx.fillStyle = ANIM_NEGATIVE_COLOR;
      ctx.fillText(`-${loss}`, 0, _s(6));
    } else if (gain > 0) {
      ctx.fillStyle = ANIM_POSITIVE_COLOR;
      ctx.fillText(`+${gain}`, 0, 0);
    } else if (loss > 0) {
      ctx.fillStyle = ANIM_NEGATIVE_COLOR;
      ctx.fillText(`-${loss}`, 0, 0);
    } else {
      ctx.fillStyle = hotColor;
      ctx.fillText('0', 0, 0);
    }
  } else {
    // Unconnected: show boiling temp and mass.
    // When shift is held, show the raw temp parameter; otherwise show tile.temperature + currentTemp.
    const deltaTemp = shiftHeld
      ? tile.temperature
      : tile.temperature + currentTemp;
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(`${deltaTemp}°`, 0, -_s(9));
    ctx.font = `bold ${_s(9)}px Arial`;
    ctx.fillText('x', 0, 0);
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(tile.cost), 0, _s(9));
  }
}

function _drawChamber(ctx: CanvasRenderingContext2D, tile: Tile, color: string, isWater: boolean, half: number, shiftHeld: boolean, currentTemp: number, currentPressure: number, lockedCost: number | null, lockedGain: number | null): void {
  // Clip to tile bounds so that connection stubs end exactly at the tile edge.
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.clip();
  const bw = half * 0.7 + 2;
  const bh = half * 0.7 + 2;
  ctx.fillStyle = isWater ? CHAMBER_FILL_WATER_COLOR : CHAMBER_FILL_COLOR;
  ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = _s(3);
  ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
  // Draw inner content based on chamberContent
  const { chamberContent } = tile;
  if (chamberContent === 'tank') {
    // Draw water line with wave ripples near top of the box
    const tankDecorColor = isWater ? TANK_WATER_COLOR : TANK_COLOR;
    ctx.strokeStyle = tankDecorColor;
    ctx.lineWidth = _s(1.5);
    ctx.lineCap = 'round';
    const wy = -bh + _s(7);
    const wLeft = -bw + _s(4);
    const wRight = bw - _s(4);
    const wMid = 0;
    const wQuart = (wRight - wLeft) / 4;
    ctx.beginPath();
    ctx.moveTo(wLeft, wy);
    ctx.quadraticCurveTo(wLeft + wQuart, wy - _s(3), wMid, wy);
    ctx.quadraticCurveTo(wMid + wQuart, wy + _s(3), wRight, wy);
    ctx.stroke();
    // Show capacity number in tank-like color
    ctx.fillStyle = tankDecorColor;
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tile.capacity), 0, 0);
  } else if (chamberContent === 'dirt') {
    // Draw short diagonal dirt lines near top-right and bottom-left corners
    const dirtDecorColor = isWater ? DIRT_WATER_COLOR : DIRT_COST_COLOR;
    ctx.strokeStyle = dirtDecorColor;
    ctx.lineWidth = _s(1.5);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bw - _s(9), -bh + _s(3)); ctx.lineTo(bw - _s(3), -bh + _s(9)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bw - _s(13), -bh + _s(3)); ctx.lineTo(bw - _s(3), -bh + _s(13)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw + _s(3), bh - _s(9)); ctx.lineTo(-bw + _s(9), bh - _s(3)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw + _s(3), bh - _s(13)); ctx.lineTo(-bw + _s(13), bh - _s(3)); ctx.stroke();
    // Show negative cost label in dirt-like color
    ctx.fillStyle = dirtDecorColor;
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`-${tile.cost}`, 0, 0);
  } else if (chamberContent === 'item') {
    _drawChamberItemContent(ctx, tile.itemShape, tile.itemCount, bw, bh, isWater, half);
  } else if (chamberContent === 'heater') {
    _drawChamberHeaterContent(ctx, tile, bw, bh, isWater);
  } else if (chamberContent === 'ice') {
    _drawChamberIceContent(ctx, tile, bw, bh, isWater, shiftHeld, currentTemp, lockedCost);
  } else if (chamberContent === 'pump') {
    _drawChamberPumpContent(ctx, tile, bw, bh, isWater);
  } else if (chamberContent === 'snow') {
    _drawChamberSnowContent(ctx, tile, bw, bh, isWater, shiftHeld, currentTemp, currentPressure, lockedCost);
  } else if (chamberContent === 'sandstone') {
    const shatterActive = tile.shatter > tile.hardness;
    const isShatterTriggered = shatterActive && currentPressure >= tile.shatter;
    const isHard = tile.hardness >= currentPressure;
    const sandstoneColor = isShatterTriggered
      ? (isWater ? SANDSTONE_SHATTER_WATER_COLOR : SANDSTONE_SHATTER_COLOR)
      : isHard
        ? (isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR)
        : (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR);
    _drawChamberSandstoneContent(ctx, tile, bw, bh, isWater, sandstoneColor, shiftHeld, currentTemp, currentPressure, lockedCost);
  } else if (chamberContent === 'star') {
    // Draw a 5-pointed star
    ctx.fillStyle = isWater ? STAR_WATER_COLOR : STAR_COLOR;
    const outerR = half * 0.45;
    const innerR = outerR * 0.42;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fill();
  } else if (chamberContent === 'hot_plate') {
    _drawChamberHotPlateContent(ctx, tile, bw, bh, isWater, shiftHeld, currentTemp, lockedCost, lockedGain);
  }
  // Connection stubs
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';
  if (tile.connections.has(Direction.North)) {
    ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
  }
  if (tile.connections.has(Direction.South)) {
    ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
  }
  if (tile.connections.has(Direction.West)) {
    ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
  }
  if (tile.connections.has(Direction.East)) {
    ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
  }
}

/** Draw a single tile at canvas position (x, y). */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: Tile,
  isWater: boolean,
  currentWater: number,
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
  lockedCost: number | null = null,
  lockedGain: number | null = null,
): void {
  const { shape, rotation, isFixed, itemShape } = tile;
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);

  let color: string;
  if (shape === PipeShape.Source) {
    color = isWater ? SOURCE_WATER_COLOR : SOURCE_COLOR;
  } else if (shape === PipeShape.Sink) {
    color = isWater ? SINK_WATER_COLOR : SINK_COLOR;
  } else if (shape === PipeShape.Chamber) {
    const { chamberContent } = tile;
    if (chamberContent === 'tank') {
      color = isWater ? TANK_WATER_COLOR : TANK_COLOR;
    } else if (chamberContent === 'dirt') {
      color = isWater ? DIRT_WATER_COLOR : DIRT_COLOR;
    } else if (chamberContent === 'item') {
      const isGoldItem = itemShape !== null && GOLD_PIPE_SHAPES.has(itemShape);
      color = isGoldItem
        ? (isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR)
        : (isWater ? WATER_COLOR : PIPE_COLOR);
    } else if (chamberContent === 'heater') {
      color = tile.temperature < 0
        ? (isWater ? COOLER_WATER_COLOR : COOLER_COLOR)
        : (isWater ? HEATER_WATER_COLOR : HEATER_COLOR);
    } else if (chamberContent === 'ice') {
      color = isWater ? ICE_WATER_COLOR : ICE_COLOR;
    } else if (chamberContent === 'pump') {
      color = tile.pressure < 0
        ? (isWater ? VACUUM_WATER_COLOR : VACUUM_COLOR)
        : (isWater ? PUMP_WATER_COLOR : PUMP_COLOR);
    } else if (chamberContent === 'snow') {
      color = isWater ? SNOW_WATER_COLOR : SNOW_COLOR;
    } else if (chamberContent === 'sandstone') {
      // When hardness >= pressure (and shatter not active), use darker color.
      // When shatter is active and pressure reaches the shatter threshold, use lighter color.
      const shatterActive = tile.shatter > tile.hardness;
      const isShatterTriggered = shatterActive && currentPressure >= tile.shatter;
      const isHard = tile.hardness >= currentPressure;
      color = isShatterTriggered
        ? (isWater ? SANDSTONE_SHATTER_WATER_COLOR : SANDSTONE_SHATTER_COLOR)
        : isHard
          ? (isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR)
          : (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR);
    } else if (chamberContent === 'hot_plate') {
      color = isWater ? HOT_PLATE_WATER_COLOR : HOT_PLATE_COLOR;
    } else {
      color = isWater ? CHAMBER_WATER_COLOR : CHAMBER_COLOR;
    }
  } else if (shape === PipeShape.Granite) {
    color = GRANITE_COLOR;
  } else if (GOLD_PIPE_SHAPES.has(shape)) {
    color = isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR;
  } else if (SPIN_PIPE_SHAPES.has(shape)) {
    color = isWater ? FIXED_PIPE_WATER_COLOR : FIXED_PIPE_COLOR;
  } else {
    color = isFixed
      ? (isWater ? FIXED_PIPE_WATER_COLOR : FIXED_PIPE_COLOR)
      : isWater ? WATER_COLOR : PIPE_COLOR;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';

  if (shape === PipeShape.Empty) {
    // Draw a subtle dot so the tile is visually distinct from fixed tiles
    ctx.fillStyle = EMPTY_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, _s(4), 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight || shape === PipeShape.SpinStraight) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
  } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow || shape === PipeShape.SpinElbow) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
  } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee || shape === PipeShape.SpinTee) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
  } else if (shape === PipeShape.Cross || shape === PipeShape.GoldCross) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
  } else if (shape === PipeShape.Source || shape === PipeShape.Sink) {
    // Restore to un-rotated state so we can draw based on actual connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _drawSourceOrSink(ctx, tile, color, half, currentWater, shape);
  } else if (shape === PipeShape.Chamber) {
    // Chamber – a steel-blue enclosure whose interior display varies by content
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _drawChamber(ctx, tile, color, isWater, half, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain);
  } else if (shape === PipeShape.Granite) {
    // Granite – solid impassable stone block; no connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _drawGranite(ctx, half);
  }

  ctx.restore();

  // CW rotation arrow overlay for spinnable pipes
  if (SPIN_PIPE_SHAPES.has(shape)) {
    ctx.save();
    ctx.translate(cx, cy);
    drawSpinArrow(ctx);
    ctx.restore();
  }
}

/** Return a human-readable name for an inventory item shape (used inside item-container tooltips). */
function _itemShapeDisplayName(shape: PipeShape | null): string {
  switch (shape) {
    case PipeShape.Straight:     return 'Straight';
    case PipeShape.Elbow:        return 'Elbow';
    case PipeShape.Tee:          return 'Tee';
    case PipeShape.Cross:        return 'Cross';
    case PipeShape.GoldStraight: return 'Gold Straight';
    case PipeShape.GoldElbow:    return 'Gold Elbow';
    case PipeShape.GoldTee:      return 'Gold Tee';
    case PipeShape.GoldCross:    return 'Gold Cross';
    default:                     return 'Item';
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
    case PipeShape.Source:       return 'Source';
    case PipeShape.Sink:         return 'Sink';
    case PipeShape.Granite:      return 'Granite';
    case PipeShape.Cement:       return 'Cement';
    case PipeShape.Chamber:
      switch (tile.chamberContent) {
        case 'tank':   return tile.capacity > 0 ? `Tank +${tile.capacity}` : 'Tank';
        case 'dirt':   return `Dirt -${tile.cost}`;
        case 'item': {
          const itemName = _itemShapeDisplayName(tile.itemShape);
          return tile.itemCount > 1 ? `${tile.itemCount}× ${itemName}` : itemName;
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
        default:       return 'Chamber';
      }
    default: return '';
  }
}

/**
 * Returns true when a tile can be replaced by the given selected shape and
 * rotation.  A tile is replaceable when it is a non-fixed regular or gold pipe,
 * the gold-space constraint is satisfied, and the result would actually differ
 * from the current tile (different shape or different rotation).
 */
function isReplaceableByShape(
  tile: Tile,
  selectedShape: PipeShape,
  pendingRotation: number,
  selectedIsGold: boolean,
  isGoldCell: boolean,
): boolean {
  return (
    !tile.isFixed &&
    !SPIN_PIPE_SHAPES.has(tile.shape) &&
    (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) &&
    (tile.shape !== selectedShape || tile.rotation !== pendingRotation) &&
    (!isGoldCell || selectedIsGold)
  );
}

// ─── Ambient decoration colours (local constants, not exported) ──────────────

/** Pebble fill colours: slightly lighter, more neutral than the tile background. */
const PEBBLE_COLORS = [
  'rgba(68,65,96,0.78)',
  'rgba(80,76,112,0.72)',
  'rgba(58,56,84,0.82)',
] as const;

/** Flower petal colours: muted warm/cool tones that sit against the dark bg. */
const FLOWER_PETAL_COLORS = [
  'rgba(100,65,88,0.72)',   // muted rose
  'rgba(95,85,48,0.72)',    // muted gold
  'rgba(78,65,112,0.72)',   // muted lavender
] as const;

/** Flower centre dot colour. */
const FLOWER_CENTER_COLOR = 'rgba(120,104,56,0.82)';

/** Grass blade colour. */
const GRASS_COLOR = 'rgba(72,115,58,0.90)';

// ─── Ambient decoration drawing helpers ──────────────────────────────────────

/** Draw a small cluster of pebbles centred at the current canvas origin. */
function _drawPebbles(ctx: CanvasRenderingContext2D, variant: number): void {
  const color = PEBBLE_COLORS[variant % PEBBLE_COLORS.length];
  const stones: Array<[number, number, number, number]> = [
    [0, 0, _s(5.25), _s(3.75)],
    [_s(7.5), -_s(3.75), _s(4.2), _s(3.0)],
  ];
  if (variant < 2) stones.push([-_s(6), _s(4.5), _s(3.3), _s(2.4)]);
  ctx.fillStyle = color;
  for (const [dx, dy, rx, ry] of stones) {
    ctx.beginPath();
    ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw a small top-down flower centred at the current canvas origin. */
function _drawFlower(ctx: CanvasRenderingContext2D, variant: number): void {
  const petalColor = FLOWER_PETAL_COLORS[variant % FLOWER_PETAL_COLORS.length];
  const petals = 5;
  const petalDist = _s(4.5);
  const petalR = _s(2.8);
  ctx.fillStyle = petalColor;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * petalDist, Math.sin(angle) * petalDist, petalR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, _s(2.2), 0, Math.PI * 2);
  ctx.fillStyle = FLOWER_CENTER_COLOR;
  ctx.fill();
}

/** Draw a small tuft of grass blades centred at the current canvas origin. */
function _drawGrass(ctx: CanvasRenderingContext2D, variant: number): void {
  const blades = variant + 3; // 3–5 blades
  ctx.strokeStyle = GRASS_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    // Fan the blades symmetrically; vary length slightly for a natural look
    const spread = (blades > 1) ? ((i / (blades - 1)) - 0.5) * (Math.PI * 0.55) : 0;
    const len = _s(8.25 + (i % 2) * 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(spread) * len, -Math.cos(spread) * len);
    ctx.stroke();
  }
}

/**
 * Draw a single ambient decoration onto the canvas.
 * The canvas context should NOT have any prior transforms applied;
 * this function handles its own save/restore cycle.
 */
export function drawAmbientDecoration(
  ctx: CanvasRenderingContext2D,
  dec: AmbientDecoration,
): void {
  const cx = dec.col * TILE_SIZE + dec.offsetX * TILE_SIZE;
  const cy = dec.row * TILE_SIZE + dec.offsetY * TILE_SIZE;
  ctx.save();
  ctx.translate(cx, cy);
  if (dec.type !== 'grass') {
    ctx.rotate((dec.rotation * Math.PI) / 180);
  }
  switch (dec.type) {
    case 'pebbles': _drawPebbles(ctx, dec.variant); break;
    case 'flower':  _drawFlower(ctx, dec.variant);  break;
    case 'grass':   _drawGrass(ctx, dec.variant);   break;
  }
  ctx.restore();
}

/** Render the full game board onto the canvas. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  board: Board,
  focusPos: GridPos,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  mouseCanvasPos: { x: number; y: number } | null,
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
  highlightedPositions: Set<string> = new Set(),
  hoverRotationDelta = 0,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const filled = board.getFilledPositions();
  const currentWater = board.getCurrentWater();

  // Shimmer phase for gold spaces (oscillates smoothly over time)
  const shimmerAlpha = 0.2 + 0.25 * ((Math.sin(Date.now() / 500) + 1) / 2);

  const selectedIsGold = selectedShape !== null && GOLD_PIPE_SHAPES.has(selectedShape);

  // Pass 1: Draw all tile backgrounds first so that pipe tile content drawn in pass 2
  // is never covered by a neighbouring empty tile's background fill.
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isFocused  = focusPos.row === r && focusPos.col === c;
      const isGoldCell = board.goldSpaces.has(`${r},${c}`);
      const isCementCell = board.cementData.has(`${r},${c}`);

      // A cell is a valid placement target when it's empty and either:
      // it's not a gold space (any pipe fits), or it IS a gold space (gold pipe required)
      const isTarget = selectedShape !== null &&
        tile.shape === PipeShape.Empty &&
        (!isGoldCell || selectedIsGold);

      // A non-empty cell is a valid replacement target when the selected shape can replace it:
      // the tile must be a player-placed (non-fixed) regular or gold pipe, and satisfy
      // the gold-space constraint.
      const isReplaceTarget = selectedShape !== null &&
        isReplaceableByShape(tile, selectedShape, pendingRotation, selectedIsGold, isGoldCell);

      // Tile background
      if (isCementCell) {
        // Cement cell: always show cement background regardless of tile on top
        _drawCementBackground(ctx, x, y);
        if (isTarget) {
          ctx.fillStyle = 'rgba(140,160,200,0.22)';
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
        if (isReplaceTarget) {
          ctx.fillStyle = EMPTY_TARGET_COLOR;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.globalAlpha = 1;
        } else if (
          selectedShape !== null &&
          tile.shape !== PipeShape.Empty &&
          tile.shape === selectedShape &&
          tile.rotation === pendingRotation
        ) {
          // Darken cement cells that have the same piece and orientation as the
          // selected shape: replacing with an identical tile is not a valid move,
          // so shade the cell to indicate it is not a placement target.
          ctx.fillStyle = EMPTY_TARGET_COLOR; //'#000000';
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.globalAlpha = 1;
        }
      } else if (tile.shape === PipeShape.Empty) {
        if (isGoldCell) {
          // Shimmering gold background
          ctx.fillStyle = GOLD_SPACE_BASE_COLOR;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.fillStyle = `${GOLD_SPACE_SHIMMER_COLOR}${shimmerAlpha.toFixed(3)})`;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          // Gold border to make the cell clearly distinct
          ctx.strokeStyle = GOLD_SPACE_BORDER_COLOR;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          // Brighten when it's a valid drop target
          if (isTarget) {
            ctx.fillStyle = 'rgba(255,215,0,0.2)';
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        } else {
          ctx.fillStyle = isTarget ? EMPTY_TARGET_COLOR : EMPTY_COLOR;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          // Draw any ambient decoration on this empty non-gold cell
          const dec = board.ambientDecorationMap.get(`${r},${c}`);
          if (dec) drawAmbientDecoration(ctx, dec);
        }
      } else {
        // Non-empty tile: player-placed (removable) pipes get a distinct background
        if (isGoldCell) {
          // Non-empty tile on a gold space: keep the darker gold background so the space is visible
          ctx.fillStyle = GOLD_SPACE_BASE_COLOR;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.strokeStyle = GOLD_SPACE_BORDER_COLOR;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else {
          const isRemovable = !tile.isFixed &&
            (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape));
          ctx.fillStyle = isRemovable ? REMOVABLE_BG_COLOR : TILE_BG;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
        // Overlay a target highlight when this tile is a valid replacement target
        if (isReplaceTarget) {
          ctx.fillStyle = EMPTY_TARGET_COLOR;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.globalAlpha = 1;
        }
      }

      // Focus highlight
      if (isFocused) {
        ctx.strokeStyle = FOCUS_COLOR;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }

      // Sandstone error highlight (pulsing red overlay)
      if (highlightedPositions.has(`${r},${c}`)) {
        const pulse = 0.35 + 0.25 * ((Math.sin(Date.now() / 120) + 1) / 2);
        ctx.fillStyle = `rgba(220,50,50,${pulse.toFixed(3)})`;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.strokeStyle = '#ff2020';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }

  // Pass 2: Draw all tile content on top of all backgrounds so that pipe rounded
  // caps (from lineCap='round') are never overwritten by a neighbouring empty tile's
  // background fill.
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      const isCementCell = board.cementData.has(`${r},${c}`);

      // Skip drawing the empty-tile dot on cement cells – the cement background
      // texture is already clearly visible and the label (pass 3) provides the
      // setting-time indicator.
      if (tile.shape === PipeShape.Empty && isCementCell) continue;

      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isWater = filled.has(`${r},${c}`);

      // For connected ice/snow/sandstone tiles, pass the locked effective cost so
      // the tile can display the single locked-in value instead of the live formula.
      // For connected hot_plate tiles, pass both the locked gain (from frozen) and locked loss.
      let lockedCost: number | null = null;
      let lockedGain: number | null = null;
      if (isWater && tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'ice' || tile.chamberContent === 'snow' || tile.chamberContent === 'sandstone') {
          const impact = board.getLockedWaterImpact({ row: r, col: c });
          if (impact !== null) {
            lockedCost = Math.abs(impact);
          }
        } else if (tile.chamberContent === 'hot_plate') {
          const impact = board.getLockedWaterImpact({ row: r, col: c });
          const gain = board.getLockedHotPlateGain({ row: r, col: c });
          if (impact !== null && gain !== null) {
            const loss = Math.max(0, gain - impact);
            lockedGain = gain;
            lockedCost = loss;
          }
        }
      }

      drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain);
    }
  }

  // Pass 3: Draw cement drying-time labels in the top-left corner of every cement cell.
  // Drawn after all tile content so the label always appears on top of any pipe graphic.
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (!board.cementData.has(`${r},${c}`)) continue;
      const dryingTime = board.cementData.get(`${r},${c}`) as number;
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      // A tile is "hardened" (shows 'X') only when dryingTime is 0 AND a pipe
      // has actually been placed on it.  Cement cells at T=0 without a pipe
      // still display the numeric "0" to avoid confusing the player.
      const tileShape = board.grid[r][c].shape;
      const hasPipe = PIPE_SHAPES.has(tileShape) || GOLD_PIPE_SHAPES.has(tileShape) || SPIN_PIPE_SHAPES.has(tileShape);
      const isHardened = dryingTime === 0 && hasPipe;
      _drawCementLabel(ctx, x, y, dryingTime, isHardened);
    }
  }

  // Draw semi-transparent hover preview of the pending inventory item
  if (selectedShape !== null && mouseCanvasPos) {
    const hoverCol = Math.floor(mouseCanvasPos.x / TILE_SIZE);
    const hoverRow = Math.floor(mouseCanvasPos.y / TILE_SIZE);
    if (hoverRow >= 0 && hoverRow < board.rows && hoverCol >= 0 && hoverCol < board.cols) {
      const hoverTile = board.grid[hoverRow][hoverCol];
      const isGoldCell = board.goldSpaces.has(`${hoverRow},${hoverCol}`);
      const canPlace = hoverTile.shape === PipeShape.Empty && (!isGoldCell || selectedIsGold);
      const canReplace = isReplaceableByShape(hoverTile, selectedShape, pendingRotation, selectedIsGold, isGoldCell);
      if (canPlace || canReplace) {
        const previewTile = new Tile(selectedShape, pendingRotation as 0 | 90 | 180 | 270);
        const px = hoverCol * TILE_SIZE;
        const py = hoverRow * TILE_SIZE;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 14;
        drawTile(ctx, px, py, previewTile, false, currentWater);
        ctx.restore();
      }
    }
  }

  // Draw semi-transparent preview when a rotation is being previewed on an existing tile
  // (no inventory item selected, user pressed Q/W or scrolled the wheel).
  if (selectedShape === null && hoverRotationDelta > 0 && mouseCanvasPos) {
    const hoverCol = Math.floor(mouseCanvasPos.x / TILE_SIZE);
    const hoverRow = Math.floor(mouseCanvasPos.y / TILE_SIZE);
    if (hoverRow >= 0 && hoverRow < board.rows && hoverCol >= 0 && hoverCol < board.cols) {
      const hoverTile = board.grid[hoverRow][hoverCol];
      if (!hoverTile.isFixed && hoverTile.shape !== PipeShape.Empty && !SPIN_PIPE_SHAPES.has(hoverTile.shape)) {
        const previewRotation = ((hoverTile.rotation + hoverRotationDelta * 90) % 360) as 0 | 90 | 180 | 270;
        const previewTile = new Tile(
          hoverTile.shape, previewRotation, false, hoverTile.capacity, hoverTile.cost,
          hoverTile.itemShape, hoverTile.itemCount, null, hoverTile.chamberContent,
          hoverTile.temperature, hoverTile.pressure, hoverTile.hardness, hoverTile.shatter,
        );
        const px = hoverCol * TILE_SIZE;
        const py = hoverRow * TILE_SIZE;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 14;
        drawTile(ctx, px, py, previewTile, false, currentWater);
        ctx.restore();
      }
    }
  }
}
