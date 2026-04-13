/**
 * Heat-wave shimmer effect for hot_plate chamber tiles.
 *
 * A heat wave ripples from the bottom to the top of each hot_plate chamber tile
 * every few seconds, making the chamber background waver like a mirage for
 * approximately one second per ripple.
 *
 * Multiple wavy horizontal shimmer lines trail behind a leading edge that sweeps
 * from the bottom of the chamber box to the top.  The lines are drawn in a warm
 * semi-transparent colour and avoid the centre region where the numbers and icon
 * are displayed.
 */

import { TILE_SIZE, scalePx as _s } from '../renderer';
import { Board, posKey } from '../board';
import { PipeShape } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Total duration of one heat-wave sweep in milliseconds (~1 second). */
export const HEAT_WAVE_DURATION_MS = 1000;

/** Time between the start of successive heat-wave events on the same tile (ms). */
export const HEAT_WAVE_INTERVAL_MS = 4500;

// ─── Types ────────────────────────────────────────────────────────────────────

/** One active heat-wave ripple sweeping through a single hot_plate chamber tile. */
export interface HeatWave {
  row: number;
  col: number;
  /** `performance.now()` when this wave started. */
  startTime: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Spawn new heat-wave events for hot_plate tiles that are due for one.
 * Modifies `waves` and `lastSpawnTimes` in-place.
 *
 * Only unconnected (dry) hot_plate tiles receive the effect.  When a tile
 * becomes connected its timer is reset so it fires fresh once the pipe is
 * disconnected again.
 *
 * Initial timing is staggered by tile position so multiple tiles on the same
 * board do not all fire simultaneously.
 */
export function tickHeatWaves(
  waves: HeatWave[],
  lastSpawnTimes: Map<string, number>,
  board: Board,
  filled: ReadonlySet<string>,
  now: number,
): void {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      if (tile.shape !== PipeShape.Chamber || tile.chamberContent !== 'hot_plate') continue;

      const key = posKey(r, c);

      // Skip connected (water-filled) tiles and reset their timer so the
      // effect fires fresh once they become dry again.
      if (filled.has(key)) {
        lastSpawnTimes.delete(key);
        continue;
      }

      if (!lastSpawnTimes.has(key)) {
        // First frame this tile is seen as dry – stagger the initial delay by
        // position so tiles don't all wave in unison.
        const stagger = ((r * 3 + c * 7) * 1137) % HEAT_WAVE_INTERVAL_MS;
        lastSpawnTimes.set(key, now - stagger);
      }
      const last = lastSpawnTimes.get(key)!;
      if (now - last >= HEAT_WAVE_INTERVAL_MS) {
        waves.push({ row: r, col: c, startTime: now });
        lastSpawnTimes.set(key, now);
      }
    }
  }
}

/**
 * Render all active heat-wave ripples onto the canvas and remove expired ones.
 * Should be called each frame from the animation tick.
 */
export function renderHeatWaves(
  ctx: CanvasRenderingContext2D,
  waves: HeatWave[],
  now: number,
): void {
  let i = 0;
  while (i < waves.length) {
    if (_renderOneHeatWave(ctx, waves[i], now)) {
      i++;
    } else {
      waves.splice(i, 1);
    }
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Render a single heat-wave sweep.
 * Returns `true` while the wave is still active, `false` once it has expired.
 */
function _renderOneHeatWave(
  ctx: CanvasRenderingContext2D,
  wave: HeatWave,
  now: number,
): boolean {
  const elapsed = now - wave.startTime;
  if (elapsed >= HEAT_WAVE_DURATION_MS) return false;

  const progress = elapsed / HEAT_WAVE_DURATION_MS; // 0 = just started, 1 = done

  const cx = wave.col * TILE_SIZE + TILE_SIZE / 2;
  const cy = wave.row * TILE_SIZE + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  // Chamber inner-box dimensions (must match chamberRenderers.ts drawChamber).
  const bw = half * 0.7 + 2;
  const bh = half * 0.7 + 2;

  // Leading edge: starts one chamber-height below the clip rectangle
  // (cy + 2*bh) so the shimmer lines rise up into the clip rectangle rather
  // than appearing instantly inside it.  Sweeps to the top (cy - bh).
  const leadY = cy + bh * 2 - progress * bh * 3;

  ctx.save();
  // Clip to the chamber inner box so shimmer doesn't bleed outside.
  ctx.beginPath();
  ctx.rect(cx - bw, cy - bh, bw * 2, bh * 2);
  ctx.clip();

  // Number of wavy shimmer lines trailing behind the leading edge.
  const WAVE_COUNT = 5;
  // Vertical spacing between successive shimmer lines.
  const LINE_SPACING = bh / WAVE_COUNT;

  ctx.lineCap = 'round';
  ctx.lineWidth = _s(1.5);

  for (let w = 0; w < WAVE_COUNT; w++) {
    // Each shimmer line sits a fixed distance above the leading edge.
    const lineY = leadY - w * LINE_SPACING;

    // Don't draw above the chamber box.
    if (lineY < cy - bh) continue;
    // Don't draw below the leading edge.
    if (lineY > leadY + 2) continue;

    // Alpha fades as the line trails further behind the leading edge.
    const distFromLead = leadY - lineY;
    const alpha = Math.max(0, 1 - distFromLead / (bh * 1.2)) * 0.35;
    if (alpha <= 0) continue;

    // Draw a wavy horizontal stroke.
    const phase = now * 0.004 + w * 1.1; // time-varying phase for each line
    const amp = _s(2); // horizontal undulation amplitude
    const STEPS = 10;
    const stepWidth = (bw * 2) / STEPS;

    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 185, 80, ${alpha.toFixed(3)})`;

    for (let s = 0; s <= STEPS; s++) {
      const sx = cx - bw + s * stepWidth;
      const sy = lineY + Math.sin(s * 1.8 + phase) * amp;
      if (s === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  ctx.restore();
  return true;
}
