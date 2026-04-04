/**
 * Ambient decoration rendering – scattered pebbles, flowers, and grass tufts
 * drawn on top of empty tiles in the game board and chapter map.
 *
 * Zero coupling to game state: decorations are purely positional.
 */

import { AmbientDecoration } from '../types';
import { TILE_SIZE, _s } from './rendererState';

// ─── Ambient decoration colors (local constants, not exported) ──────────────

/** Pebble fill colors: slightly lighter, more neutral than the tile background. */
const PEBBLE_COLORS = [
  'rgba(68,65,96,0.78)',
  'rgba(80,76,112,0.72)',
  'rgba(58,56,84,0.82)',
] as const;

/** Flower petal colors: muted warm/cool tones that sit against the dark bg. */
const FLOWER_PETAL_COLORS = [
  'rgba(100,65,88,0.72)',   // muted rose
  'rgba(95,85,48,0.72)',    // muted gold
  'rgba(78,65,112,0.72)',   // muted lavender
] as const;

/** Flower center dot color. */
const FLOWER_CENTER_COLOR = 'rgba(120,104,56,0.82)';

/** Grass blade color. */
const GRASS_COLOR = 'rgba(72,115,58,0.90)';

// ─── Ambient decoration drawing helpers ──────────────────────────────────────

/** Draw a small cluster of pebbles centered at the current canvas origin. */
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

/** Draw a small top-down flower centered at the current canvas origin. */
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

/** Draw a small tuft of grass blades centered at the current canvas origin. */
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
