/**
 * Rendering helpers for chamber tiles – extracted from renderer.ts so that
 * the main renderer module stays focused on board/tile orchestration.
 */

import { GOLD_PIPE_SHAPES, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from '../board';
import { Tile } from '../tile';
import { PipeShape, Direction } from '../types';
import {
  TANK_COLOR, TANK_WATER_COLOR,
  DIRT_WATER_COLOR, DIRT_COST_COLOR,
  CONTAINER_COLOR, CONTAINER_WATER_COLOR,
  WATER_COLOR, PIPE_COLOR,
  ANIM_NEGATIVE_COLOR, ANIM_ZERO_COLOR, ANIM_POSITIVE_COLOR,
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
  CHAMBER_FILL_COLOR, CHAMBER_FILL_WATER_COLOR,
} from '../colors';
import { TILE_SIZE, LINE_WIDTH, _s } from './rendererState';

// ---------------------------------------------------------------------------
// Internal content drawers (not exported)
// ---------------------------------------------------------------------------

function _drawDeltaTempCostFormula(ctx: CanvasRenderingContext2D, tempLine: string, costLine: string): void {
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.fillText(tempLine, 0, -_s(9));
  ctx.font = `bold ${_s(9)}px Arial`;
  ctx.fillText('x', 0, 0);
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.fillText(costLine, 0, _s(11));
}

function _drawChamberTankContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
  // Draw water line with wave ripples near top of the box
  const tankDecorColor = isWater ? TANK_WATER_COLOR : TANK_COLOR;
  ctx.strokeStyle = tankDecorColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const wy = -bh + _s(7);
  const wLeft = -bw + _s(4);
  const wRight = bw - _s(4);
  const waveWidth = wRight - wLeft;
  if (isWater) {
    // Animated scrolling wave when connected: scrolls horizontally and wraps around,
    // giving the impression of water moving smoothly inside the tank.
    const WAVE_PERIOD_MS = 2000; // one full scroll cycle in milliseconds
    const offset = (Date.now() % WAVE_PERIOD_MS) / WAVE_PERIOD_MS * waveWidth;
    ctx.save();
    // Clip to the wave strip so the wrapping seam is hidden
    ctx.beginPath();
    ctx.rect(wLeft, wy - _s(5), waveWidth, _s(10));
    ctx.clip();
    // Draw enough wave periods starting at (wLeft - offset) so the visible
    // strip [wLeft, wRight] is always fully covered regardless of scroll position.
    // Two shifted copies suffice; one extra is included as a safety margin.
    const WAVE_COPIES = 3;
    const startX = wLeft - offset;
    ctx.beginPath();
    for (let i = 0; i < WAVE_COPIES; i++) {
      const x0 = startX + i * waveWidth;
      const xMid = x0 + waveWidth / 2;
      const xEnd = x0 + waveWidth;
      const wQuart = waveWidth / 4;
      if (i === 0) ctx.moveTo(x0, wy);
      ctx.quadraticCurveTo(x0 + wQuart, wy - _s(3), xMid, wy);
      ctx.quadraticCurveTo(xMid + wQuart, wy + _s(3), xEnd, wy);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    // Static wave when not connected
    const wMid = 0;
    const wQuart = waveWidth / 4;
    ctx.beginPath();
    ctx.moveTo(wLeft, wy);
    ctx.quadraticCurveTo(wLeft + wQuart, wy - _s(3), wMid, wy);
    ctx.quadraticCurveTo(wMid + wQuart, wy + _s(3), wRight, wy);
    ctx.stroke();
  }
  // Show capacity number in tank-like color
  ctx.fillStyle = tankDecorColor;
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(tile.capacity), 0, 0);
}

function _drawChamberDirtContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
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
  // Draw quantity number in the inner top-left corner, with a 1px black outline
  if (itemCount !== 1) {
    const countLabel = String(itemCount);
    let countColor: string;
    if (itemCount < 0) countColor = ANIM_NEGATIVE_COLOR;
    else if (itemCount === 0) countColor = ANIM_ZERO_COLOR;
    else countColor = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${_s(20)}px Arial`;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = _s(1);
    ctx.strokeText(countLabel, -bw + _s(3), -bh + _s(2));
    ctx.fillStyle = countColor;
    ctx.fillText(countLabel, -bw + _s(3), -bh + _s(2));
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
  const numLines = 3;
  const lineSpacing = _s(3.5);
  const topY = -bh + _s(4);
  if (isCooler) {
    if (isWater) {
      // Animated: wind lines scroll downward, shrinking in width as they descend.
      // A new line at full width appears at the top each time one exits the bottom.
      const COOLER_SCROLL_MS = 2000;
      const widthDelta = _s(5);
      const offset = (Date.now() % COOLER_SCROLL_MS) / COOLER_SCROLL_MS * lineSpacing;
      ctx.save();
      ctx.beginPath();
      ctx.rect(lineLeft, topY - _s(1), lineSpan, (numLines - 1) * lineSpacing + _s(2));
      ctx.clip();
      // Draw numLines+1 lines: k=0 enters from above, k=numLines exits below.
      for (let k = 0; k <= numLines; k++) {
        const lineY = topY + (k - 1) * lineSpacing + offset;
        const slotFrac = (lineY - topY) / lineSpacing;
        const hw = (lineSpan - slotFrac * widthDelta) / 2;
        if (hw <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(-hw, lineY);
        ctx.lineTo(hw, lineY);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Static: thin horizontal wind lines near top
      for (let i = 0; i < numLines; i++) {
        const lineY = topY + i * lineSpacing;
        const hw = (lineSpan - i * _s(5)) / 2;
        ctx.beginPath();
        ctx.moveTo(-hw, lineY);
        ctx.lineTo(hw, lineY);
        ctx.stroke();
      }
    }
  } else {
    const xMid = 0;
    const xQuart = lineSpan / 4;
    if (isWater) {
      // Animated: wavy heat lines scroll upwards and wrap vertically within the region.
      const HEATER_SCROLL_MS = 1500;
      const offset = (Date.now() % HEATER_SCROLL_MS) / HEATER_SCROLL_MS * lineSpacing;
      ctx.save();
      ctx.beginPath();
      ctx.rect(lineLeft, topY - _s(3), lineSpan, numLines * lineSpacing + _s(3));
      ctx.clip();
      // Draw numLines+3 lines: k=-1 starts one lineSpacing above topY so the
      // exiting sliver at the clip top is always present throughout the cycle
      // (symmetric with k=numLines+1 which fills the entry gap at the bottom).
      for (let k = -1; k <= numLines + 1; k++) {
        const lineY = topY + k * lineSpacing - offset;
        ctx.beginPath();
        ctx.moveTo(lineLeft, lineY);
        ctx.quadraticCurveTo(lineLeft + xQuart, lineY - _s(2.5), xMid, lineY);
        ctx.quadraticCurveTo(xMid + xQuart, lineY + _s(2.5), lineRight, lineY);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Static: 3 short, thin wavy heat lines near the top
      for (let i = 0; i < numLines; i++) {
        const lineY = topY + i * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(lineLeft, lineY);
        ctx.quadraticCurveTo(lineLeft + xQuart, lineY - _s(2.5), xMid, lineY);
        ctx.quadraticCurveTo(xMid + xQuart, lineY + _s(2.5), lineRight, lineY);
        ctx.stroke();
      }
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
      : computeDeltaTemp(tile.temperature, currentTemp);
    _drawDeltaTempCostFormula(ctx, `-${iceThreshold}°`, String(tile.cost));
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
    if (isWater) {
      // Animated: swirl arcs rotate slowly in place
      const SWIRL_PERIOD_MS = 3000;
      const rotAngle = (Date.now() % SWIRL_PERIOD_MS) / SWIRL_PERIOD_MS * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(7), rotAngle, rotAngle + Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(3.5), rotAngle + Math.PI * 0.5, rotAngle + Math.PI * 2);
      ctx.stroke();
    } else {
      // Static swirl
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(7), 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(3.5), Math.PI * 0.5, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Pump: series of thin chevrons in a horizontal line near the top
    const chevY = -bh + _s(7);
    const chevH = _s(4);
    const chevSpacing = _s(7);
    const numChev = 4;
    if (isWater) {
      // Animated: chevrons scroll slowly to the right and wrap horizontally within the tile
      const PUMP_SCROLL_MS = 1500;
      const offset = (Date.now() % PUMP_SCROLL_MS) / PUMP_SCROLL_MS * chevSpacing;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-bw + _s(2), chevY - chevH - _s(2), bw * 2 - _s(4), chevH * 2 + _s(4));
      ctx.clip();
      const visibleWidth = bw * 2 - _s(4);
      const numDraw = Math.ceil(visibleWidth / chevSpacing) + 2;
      const startX = -bw + _s(2) - chevSpacing + offset;
      for (let i = 0; i < numDraw; i++) {
        const chx = startX + i * chevSpacing;
        ctx.beginPath();
        ctx.moveTo(chx - _s(2.5), chevY - chevH);
        ctx.lineTo(chx + _s(2.5), chevY);
        ctx.lineTo(chx - _s(2.5), chevY + chevH);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Static chevrons
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
      : computeDeltaTemp(tile.temperature, currentTemp);
    const snowCost = shiftHeld
      ? tile.cost
      : Math.max(1, snowCostPerDeltaTemp(tile.cost, currentPressure));
    _drawDeltaTempCostFormula(ctx, `-${deltaTemp}°`, String(snowCost));
  }
}

/**
 * Compute the sandstone visual state from the tile's hardness/shatter config
 * and the current board pressure.  Used by both {@link drawChamber} and
 * the renderer's color-resolution pass to derive the appropriate color without
 * duplicating the threshold logic.
 */
export function sandstoneColorState(
  tile: Tile,
  currentPressure: number,
): { isShatterTriggered: boolean; isHard: boolean } {
  const shatterActive = tile.shatter > tile.hardness;
  return {
    isShatterTriggered: shatterActive && currentPressure >= tile.shatter,
    isHard: tile.hardness >= currentPressure,
  };
}

function _drawChamberSandstoneContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, sandstoneColor: string, shiftHeld: boolean, currentTemp: number, currentPressure: number, lockedCost: number | null): void {
  // When hardness >= pressure, use darker color and show hardness.
  // When shatter is active and pressure reaches the shatter threshold, use lighter color.
  // When connected, show the locked effective cost value.
  // Otherwise show cost display lines.
  const { shatterOverride, deltaDamage, costPerDeltaTemp } =
    sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
  const shatterActive = tile.shatter > tile.hardness;
  const isHard = tile.hardness >= currentPressure;
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
  // When pressure > hardness, or when connected (locked cost), show the hardness number
  // in the top-left corner for reference
  if ((!isHard && !shatterActive) || lockedCost !== null) {
    ctx.save();
    ctx.fillStyle = isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${_s(9)}px Arial`;
    ctx.fillText(`${tile.hardness}H`, -bw + _s(2), -bh + _s(2));
    ctx.restore();
  }
  if (lockedCost !== null) {
    // Connected: locked effective cost takes precedence regardless of hardness
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(-lockedCost), 0, textCenterY);
  } else if (isHard) {
    // Unconnected and pressure <= hardness: show hardness/H and "temperature x cost"
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(`${tile.hardness}H`, 0, textCenterY - _s(4));
    ctx.font = (tile.temperature < 10 && tile.cost < 10) ? `bold ${_s(11)}px Arial` : `bold ${_s(9)}px Arial`;
    ctx.fillText(`${tile.temperature}° x ${tile.cost}`, 0, textCenterY + _s(10));
  } else {
    // Unconnected: show cost display.
    // deltaDamage = Pressure − Hardness is used as the cost divisor.
    // When shift is held, show the raw (unadjusted) values.
    const sandstoneThreshold = shiftHeld
      ? tile.temperature
      : computeDeltaTemp(tile.temperature, currentTemp);
    const sandstoneCost = shiftHeld
      ? tile.cost
      : Math.max(1, deltaDamage >= 1 ? costPerDeltaTemp : tile.cost);
    if (shatterActive) {
      const displayCost = shatterOverride ? 0 : sandstoneCost;
      ctx.font = tile.shatter < 10 ? `bold ${_s(12)}px Arial` : `bold ${_s(9)}px Arial`;
      ctx.fillText(shatterOverride ? 'WEAK' : `S @ ${tile.shatter}P`, 0, textCenterY - _s(7));
      ctx.font = (sandstoneThreshold < 10 && displayCost < 10) ? `bold ${_s(11)}px Arial` : `bold ${_s(9)}px Arial`;
      ctx.fillText(`-${sandstoneThreshold}° x ${displayCost}`, 0, textCenterY + _s(7));
    } else {
      ctx.font = `bold ${_s(14)}px Arial`;
      ctx.fillText(`-${sandstoneThreshold}°`, 0, textCenterY - _s(5));
      ctx.font = `bold ${_s(9)}px Arial`;
      ctx.fillText('x', 0, textCenterY + _s(4));
      ctx.font = `bold ${_s(14)}px Arial`;
      ctx.fillText(String(sandstoneCost), 0, textCenterY + _s(14));
    }
  }
}

/** Draw a 5-pointed star inside the chamber inner box. */
function _drawChamberStarContent(ctx: CanvasRenderingContext2D, isWater: boolean, half: number): void {
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
      // Both gain and loss: show each in its own color, offset vertically
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
    ctx.fillStyle = hotColor;
    _drawDeltaTempCostFormula(ctx, `${deltaTemp}°`, String(tile.cost));
  }
}

/**
 * Draw a frosted-glass halo overlay inside the chamber box for snow and ice chambers.
 * A radial gradient fades from fully transparent at the tile center (keeping the cost
 * number readable) to ~25% opaque at the box border (75% transparency), giving a
 * frosted-over ring effect in the same colour as the chamber border.
 */
function _drawChamberFrostHalo(ctx: CanvasRenderingContext2D, color: string, bw: number, bh: number, br: number): void {
  // Gradient radius: reach the box edge so the frost is most visible at the border.
  const frostRadius = Math.min(bw, bh);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, frostRadius);
  gradient.addColorStop(0,    color + '00'); // fully transparent at centre
  gradient.addColorStop(0.35, color + '00'); // stay clear in the inner area (cost number zone)
  gradient.addColorStop(1,    color + '40'); // ~25% opaque at the box edge (75% transparent)
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(-bw, -bh, bw * 2, bh * 2, br);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Draw a chamber tile (box, inner content, and connection stubs).
 *
 * The canvas origin must already be translated to the tile center before
 * calling this function.
 */
export function drawChamber(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  color: string,
  isWater: boolean,
  half: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  lockedCost: number | null,
  lockedGain: number | null,
  buttEndDirs?: Set<Direction>,
): void {
  // Phase 1: Draw the box, inner content, and flush (butt-end) stubs inside the tile clip.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.clip();
  const bw = half * 0.7 + 2;
  const bh = half * 0.7 + 2;
  const br = _s(3); // slight corner radius for the inner box
  ctx.beginPath();
  ctx.roundRect(-bw, -bh, bw * 2, bh * 2, br);
  ctx.fillStyle = isWater ? CHAMBER_FILL_WATER_COLOR : CHAMBER_FILL_COLOR;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = _s(3);
  ctx.stroke();
  // Draw inner content based on chamberContent
  const { chamberContent } = tile;
  // Frost halo: drawn after the border stroke, before content, so text/decorations sit on top.
  // Only shown when the chamber is not connected (no water flowing through it).
  if (!isWater && (chamberContent === 'ice' || chamberContent === 'snow')) {
    _drawChamberFrostHalo(ctx, color, bw, bh, br);
  }
  if (chamberContent === 'tank') {
    _drawChamberTankContent(ctx, tile, bw, bh, isWater);
  } else if (chamberContent === 'dirt') {
    _drawChamberDirtContent(ctx, tile, bw, bh, isWater);
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
    const { isShatterTriggered, isHard } = sandstoneColorState(tile, currentPressure);
    const sandstoneColor = isShatterTriggered
      ? (isWater ? SANDSTONE_SHATTER_WATER_COLOR : SANDSTONE_SHATTER_COLOR)
      : isHard
        ? (isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR)
        : (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR);
    _drawChamberSandstoneContent(ctx, tile, bw, bh, isWater, sandstoneColor, shiftHeld, currentTemp, currentPressure, lockedCost);
  } else if (chamberContent === 'star') {
    _drawChamberStarContent(ctx, isWater, half);
  } else if (chamberContent === 'hot_plate') {
    _drawChamberHotPlateContent(ctx, tile, bw, bh, isWater, shiftHeld, currentTemp, lockedCost, lockedGain);
  }
  // Connection stubs that use a flat (butt) end cap are drawn inside the clip so
  // the end sits exactly flush with the tile edge and does not bleed into
  // adjacent tiles.  When buttEndDirs is undefined all stubs use butt caps
  // (legacy / default behaviour for tiles that don't compute butt-end sets).
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'butt';
  if (tile.connections.has(Direction.North) && (!buttEndDirs || buttEndDirs.has(Direction.North))) {
    ctx.beginPath(); ctx.moveTo(0, -bh); ctx.lineTo(0, -half); ctx.stroke();
  }
  if (tile.connections.has(Direction.South) && (!buttEndDirs || buttEndDirs.has(Direction.South))) {
    ctx.beginPath(); ctx.moveTo(0, bh);  ctx.lineTo(0, half);  ctx.stroke();
  }
  if (tile.connections.has(Direction.West) && (!buttEndDirs || buttEndDirs.has(Direction.West))) {
    ctx.beginPath(); ctx.moveTo(-bw, 0); ctx.lineTo(-half, 0); ctx.stroke();
  }
  if (tile.connections.has(Direction.East) && (!buttEndDirs || buttEndDirs.has(Direction.East))) {
    ctx.beginPath(); ctx.moveTo(bw, 0);  ctx.lineTo(half, 0);  ctx.stroke();
  }
  ctx.restore(); // Remove clip so round-end stubs can extend beyond the tile boundary.

  // Phase 2: Connection stubs that face empty tiles or pipes without a reciprocating
  // arm use a round end cap at the outer tip only, matching the nub style used by plain
  // pipe arms.  These are drawn outside the clip so the round cap protrudes slightly
  // beyond the tile edge.  A per-stub clip masks the inner end of each stroke (where it
  // meets the chamber box) so only the outer tip gets a round cap; the inner junction
  // retains a flat (butt) appearance.
  if (buttEndDirs !== undefined) {
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    const capR = LINE_WIDTH / 2;
    if (tile.connections.has(Direction.North) && !buttEndDirs.has(Direction.North)) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-half, -(half + capR), half * 2, half + capR - bh); ctx.clip();
      ctx.beginPath(); ctx.moveTo(0, -bh); ctx.lineTo(0, -half); ctx.stroke();
      ctx.restore();
    }
    if (tile.connections.has(Direction.South) && !buttEndDirs.has(Direction.South)) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-half, bh, half * 2, half + capR - bh); ctx.clip();
      ctx.beginPath(); ctx.moveTo(0, bh);  ctx.lineTo(0, half);  ctx.stroke();
      ctx.restore();
    }
    if (tile.connections.has(Direction.West) && !buttEndDirs.has(Direction.West)) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-(half + capR), -half, half + capR - bw, half * 2); ctx.clip();
      ctx.beginPath(); ctx.moveTo(-bw, 0); ctx.lineTo(-half, 0); ctx.stroke();
      ctx.restore();
    }
    if (tile.connections.has(Direction.East) && !buttEndDirs.has(Direction.East)) {
      ctx.save();
      ctx.beginPath(); ctx.rect(bw, -half, half + capR - bw, half * 2); ctx.clip();
      ctx.beginPath(); ctx.moveTo(bw, 0);  ctx.lineTo(half, 0);  ctx.stroke();
      ctx.restore();
    }
  }
}
