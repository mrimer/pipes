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

/** Dandelion stalk and grass-blade color. */
const DANDELION_STALK_COLOR = 'rgba(72,115,58,0.92)';

/** Dandelion puff center color (inner, opaque white). */
const DANDELION_PUFF_CENTER = 'rgba(240,240,235,0.90)';

/** Sunflower petal color. */
const SUNFLOWER_PETAL_COLOR = 'rgba(240,195,28,0.92)';

/** Sunflower inner petal ring / shading color. */
const SUNFLOWER_PETAL_INNER = 'rgba(200,140,20,0.85)';

/** Sunflower disk center color. */
const SUNFLOWER_CENTER_COLOR = 'rgba(75,40,12,0.92)';

// ─── Ambient decoration drawing helpers ──────────────────────────────────────

/** Draw a small cluster of pebbles centered at the current canvas origin.
 * Each rock is drawn as an irregular 5-sided polygon for a more natural look.
 * Rocks are spaced further apart than the old oval layout.
 */
function _drawPebbles(ctx: CanvasRenderingContext2D, variant: number): void {
  const color = PEBBLE_COLORS[variant % PEBBLE_COLORS.length];
  ctx.fillStyle = color;

  // Three rock positions, spaced well apart so they read as distinct pebbles.
  // Positions are in _s() units relative to the cell-centred canvas origin.
  const rocks: Array<{ cx: number; cy: number; rx: number; ry: number }> = [
    { cx:  0,       cy:  0,      rx: _s(4.8), ry: _s(3.6) },
    { cx:  _s(9.5), cy: -_s(4), rx: _s(3.9), ry: _s(3.0) },
  ];
  if (variant < 2) {
    rocks.push({ cx: -_s(8), cy: _s(5.5), rx: _s(3.3), ry: _s(2.6) });
  }

  for (const { cx, cy, rx, ry } of rocks) {
    // Build an irregular 5-gon by displacing each vertex slightly from a regular pentagon.
    const sides = 5;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      // Use per-variant, per-rock, per-vertex deterministic jitter so shapes look
      // irregular but are stable (no flicker on re-render within a frame).
      const baseAngle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      // Alternate small inward/outward nudges to break the regular outline.
      const radiusFactor = 1 + (((i * 7 + variant * 3) % 5) - 2) * 0.09;
      const angleDelta   = (((i * 5 + variant * 7) % 3) - 1) * 0.07;
      const angle = baseAngle + angleDelta;
      const x = cx + Math.cos(angle) * rx * radiusFactor;
      const y = cy + Math.sin(angle) * ry * radiusFactor;
      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    }
    ctx.closePath();
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
 * When `count` is 1, only the larger (first) shard is drawn.
 */
function _drawCrystal(ctx: CanvasRenderingContext2D, variant: number, count = 2): void {
  const color = CRYSTAL_COLORS[variant % CRYSTAL_COLORS.length];
  // Two shards side-by-side with slight height variation
  const shards: Array<[number, number, number, number]> = [
    [-_s(3.0),  _s(0.5), _s(2.2), _s(6.5)],  // [cx, cy, halfW, halfH]
    [ _s(2.0), -_s(1.0), _s(1.8), _s(5.0)],
  ];
  const shardsToRender = count === 1 ? shards.slice(0, 1) : shards;
  for (const [cx, cy, hw, hh] of shardsToRender) {
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
 * Draw a side-view dandelion centered at the current canvas origin.
 * Composed of: a vertical green stalk, one grass blade angled to each side,
 * and a soft white seed-puff at the top.
 */
function _drawDandelion(ctx: CanvasRenderingContext2D): void {
  const stalkH  = _s(11);   // stalk height above origin
  const stalkW  = _s(1.4);  // half-width of stalk

  // Stalk
  ctx.fillStyle = DANDELION_STALK_COLOR;
  ctx.beginPath();
  ctx.rect(-stalkW, -stalkH, stalkW * 2, stalkH);
  ctx.fill();

  // Side grass blades (like the grass tuft helper but just two, angled outward)
  ctx.strokeStyle = DANDELION_STALK_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const bladeLen = _s(6.5);
  const bladeSpread = Math.PI * 0.30;   // ~54° from vertical
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -_s(3));
    ctx.lineTo(Math.sin(bladeSpread * side) * bladeLen, -_s(3) - Math.cos(bladeSpread) * bladeLen);
    ctx.stroke();
  }

  // Seed puff: soft radial gradient circle sitting on top of the stalk
  const puffR  = _s(5.5);
  const puffCY = -stalkH - puffR * 0.55;   // overlap slightly with stalk tip
  const grad = ctx.createRadialGradient(0, puffCY, 0, 0, puffCY, puffR);
  grad.addColorStop(0,   DANDELION_PUFF_CENTER);
  grad.addColorStop(0.6, 'rgba(230,230,220,0.70)');
  grad.addColorStop(1,   'rgba(215,215,205,0.00)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, puffCY, puffR, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw a top-down sunflower centered at the current canvas origin.
 * Yellow petals radiate from a dark brown disk center.
 */
function _drawSunflower(ctx: CanvasRenderingContext2D, variant: number): void {
  const petals    = 10 + (variant % 3) * 2;   // 10, 12, or 14 petals
  const diskR     = _s(4.0);
  const petalDist = _s(5.0);
  const petalRx   = _s(2.6);   // petal half-width
  const petalRy   = _s(4.5);   // petal half-height

  // Outer petal ring
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    const px = Math.cos(angle) * petalDist;
    const py = Math.sin(angle) * petalDist;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = SUNFLOWER_PETAL_COLOR;
    ctx.beginPath();
    ctx.ellipse(0, 0, petalRx, petalRy, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner shading stripe for depth
    ctx.fillStyle = SUNFLOWER_PETAL_INNER;
    ctx.beginPath();
    ctx.ellipse(0, 0, petalRx * 0.35, petalRy * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Disk center
  ctx.fillStyle = SUNFLOWER_CENTER_COLOR;
  ctx.beginPath();
  ctx.arc(0, 0, diskR, 0, Math.PI * 2);
  ctx.fill();

  // Small seed-dot highlights on the disk
  ctx.fillStyle = 'rgba(120,72,22,0.70)';
  const dotR = _s(0.9);
  const seedRing = diskR * 0.55;
  const dots = 6;
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * seedRing, Math.sin(a) * seedRing, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
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
  if (dec.type !== 'grass' && dec.type !== 'dandelion') {
    ctx.rotate((dec.rotation * Math.PI) / 180);
  }
  if (dec.scale !== undefined && dec.scale !== 1) {
    ctx.scale(dec.scale, dec.scale);
  }
  switch (dec.type) {
    case 'pebbles':   _drawPebbles(ctx, dec.variant);  break;
    case 'flower':    _drawFlower(ctx, dec.variant);   break;
    case 'grass':     _drawGrass(ctx, dec.variant);    break;
    case 'mushroom':  _drawMushroom(ctx, dec.variant); break;
    case 'crystal':   _drawCrystal(ctx, dec.variant, dec.count);  break;
    case 'dandelion': _drawDandelion(ctx);              break;
    case 'sunflower': _drawSunflower(ctx, dec.variant); break;
  }
  ctx.restore();
}
