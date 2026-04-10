/**
 * Ambient decoration rendering – scattered pebbles, flowers, grass tufts,
 * mushrooms, and crystals drawn on top of empty tiles in the game board and
 * chapter map.
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

/** Mushroom cap colors: earthy tones for each variant. */
const MUSHROOM_CAP_COLORS = [
  'rgba(160,72,52,0.85)',   // earthy red-brown
  'rgba(180,138,58,0.85)',  // warm tan
  'rgba(120,70,140,0.82)',  // purple
] as const;

/** Mushroom spot color: light, translucent dots on the cap. */
const MUSHROOM_SPOT_COLOR = 'rgba(235,222,195,0.90)';

/** Crystal shard colors: gem-like tones for each variant. */
const CRYSTAL_COLORS = [
  'rgba(72,152,212,0.80)',  // sky blue
  'rgba(140,82,198,0.80)',  // amethyst purple
  'rgba(65,192,162,0.80)',  // teal
] as const;

/** Highlight facet color applied to crystal shards. */
const CRYSTAL_HIGHLIGHT = 'rgba(225,242,255,0.55)';

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
 * Draw a small top-down mushroom cap centered at the current canvas origin.
 * Rendered as a filled circle with a large central spot and four smaller spots
 * evenly spaced near the edge (at 90-degree intervals).
 */
function _drawMushroom(ctx: CanvasRenderingContext2D, variant: number): void {
  const capColor = MUSHROOM_CAP_COLORS[variant % MUSHROOM_CAP_COLORS.length];
  // Cap circle
  ctx.fillStyle = capColor;
  ctx.beginPath();
  ctx.arc(0, 0, _s(5), 0, Math.PI * 2);
  ctx.fill();
  // Spots: one large center dot and four smaller dots near the edge
  ctx.fillStyle = MUSHROOM_SPOT_COLOR;
  // Large center dot
  ctx.beginPath();
  ctx.arc(0, 0, _s(1.5), 0, Math.PI * 2);
  ctx.fill();
  // Four smaller edge dots at 90-degree intervals
  const edgeDist = _s(3.4);
  const edgeDotR = _s(0.85);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * edgeDist, Math.sin(angle) * edgeDist, edgeDotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw a small cluster of crystal shards centered at the current canvas origin.
 * Each shard is an elongated diamond with a lighter highlight facet.
 */
function _drawCrystal(ctx: CanvasRenderingContext2D, variant: number): void {
  const color = CRYSTAL_COLORS[variant % CRYSTAL_COLORS.length];
  // Two shards side-by-side with slight height variation
  const shards: Array<[number, number, number, number]> = [
    [-_s(3.0),  _s(0.5), _s(2.2), _s(6.5)],  // [cx, cy, halfW, halfH]
    [ _s(2.0), -_s(1.0), _s(1.8), _s(5.0)],
  ];
  for (const [cx, cy, hw, hh] of shards) {
    // Diamond shard (slightly flat bottom for a natural crystal look)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh * 0.55);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fill();
    // Highlight facet on the upper-left face
    ctx.fillStyle = CRYSTAL_HIGHLIGHT;
    ctx.beginPath();
    ctx.moveTo(cx,             cy - hh);
    ctx.lineTo(cx + hw * 0.4,  cy - hh * 0.35);
    ctx.lineTo(cx,             cy - hh * 0.1);
    ctx.closePath();
    ctx.fill();
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
  if (dec.scale !== undefined && dec.scale !== 1) {
    ctx.scale(dec.scale, dec.scale);
  }
  switch (dec.type) {
    case 'pebbles':  _drawPebbles(ctx, dec.variant);  break;
    case 'flower':   _drawFlower(ctx, dec.variant);   break;
    case 'grass':    _drawGrass(ctx, dec.variant);    break;
    case 'mushroom': _drawMushroom(ctx, dec.variant); break;
    case 'crystal':  _drawCrystal(ctx, dec.variant);  break;
  }
  ctx.restore();
}
