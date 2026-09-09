/**
 * Top-down tree tile drawing (4 variants: fern/palm, bumpy-6, bumpy-5,
 * dense-rosette). Split out of renderer.ts to shrink its function count
 * (see graniteRenderer.ts/seaRenderer.ts for the analogous splits).
 */

import type { LevelStyle } from '../types';
import { _s } from './rendererState';
import {
  TREE_COLOR, TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR,
  TREE_FALL_COLOR, TREE_FALL_LEAF_COLOR, TREE_FALL_LEAF_ALT_COLOR,
  TREE_DARK_COLOR, TREE_DARK_LEAF_COLOR, TREE_DARK_LEAF_ALT_COLOR,
  TREE_WINTER_COLOR, TREE_WINTER_LEAF_COLOR, TREE_WINTER_LEAF_ALT_COLOR,
  TREE_SPRING_COLOR, TREE_SPRING_LEAF_COLOR, TREE_SPRING_LEAF_ALT_COLOR,
  TREE_SHADOW_COLOR,
  TREE2_COLOR, TREE2_LEAF_COLOR, TREE2_LEAF_ALT_COLOR,
  TREE2_FALL_COLOR, TREE2_FALL_LEAF_COLOR, TREE2_FALL_LEAF_ALT_COLOR,
  TREE2_DARK_COLOR, TREE2_DARK_LEAF_COLOR, TREE2_DARK_LEAF_ALT_COLOR,
  TREE2_WINTER_COLOR, TREE2_WINTER_LEAF_COLOR, TREE2_WINTER_LEAF_ALT_COLOR,
  TREE2_SPRING_COLOR, TREE2_SPRING_LEAF_COLOR, TREE2_SPRING_LEAF_ALT_COLOR,
  TREE3_COLOR, TREE3_LEAF_COLOR, TREE3_LEAF_ALT_COLOR,
  TREE3_FALL_COLOR, TREE3_FALL_LEAF_COLOR, TREE3_FALL_LEAF_ALT_COLOR,
  TREE3_DARK_COLOR, TREE3_DARK_LEAF_COLOR, TREE3_DARK_LEAF_ALT_COLOR,
  TREE3_WINTER_COLOR, TREE3_WINTER_LEAF_COLOR, TREE3_WINTER_LEAF_ALT_COLOR,
  TREE3_SPRING_COLOR, TREE3_SPRING_LEAF_COLOR, TREE3_SPRING_LEAF_ALT_COLOR,
  TREE4_COLOR, TREE4_LEAF_COLOR, TREE4_LEAF_ALT_COLOR,
  TREE4_FALL_COLOR, TREE4_FALL_LEAF_COLOR, TREE4_FALL_LEAF_ALT_COLOR,
  TREE4_DARK_COLOR, TREE4_DARK_LEAF_COLOR, TREE4_DARK_LEAF_ALT_COLOR,
  TREE4_WINTER_COLOR, TREE4_WINTER_LEAF_COLOR, TREE4_WINTER_LEAF_ALT_COLOR,
  TREE4_SPRING_COLOR, TREE4_SPRING_LEAF_COLOR, TREE4_SPRING_LEAF_ALT_COLOR,
} from '../colors';

/** Draw a 2-D top-down tree (fern/palm style) centered at the origin. */
export function drawTree(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  const treeColors: Record<string, [string, string, string]> = {
    Fall:   [TREE_FALL_LEAF_COLOR,    TREE_FALL_LEAF_ALT_COLOR,    TREE_FALL_COLOR],
    Dark:   [TREE_DARK_LEAF_COLOR,    TREE_DARK_LEAF_ALT_COLOR,    TREE_DARK_COLOR],
    Winter: [TREE_WINTER_LEAF_COLOR,  TREE_WINTER_LEAF_ALT_COLOR,  TREE_WINTER_COLOR],
    Spring: [TREE_SPRING_LEAF_COLOR,  TREE_SPRING_LEAF_ALT_COLOR,  TREE_SPRING_COLOR],
  };
  const [leafColor, leafAltColor, outlineColor] = (style && treeColors[style]) ?? [TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR, TREE_COLOR];
  const r = half * 0.75; // outer canopy radius – occupies most of the tile
  _drawTreeCircleShadow(ctx, { half, r, style });
  // Main canopy – large dark-green filled circle
  ctx.fillStyle = leafColor;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Leaf clusters – four overlapping lighter-green lobes around the edge
  const lobeR = r * 0.48;
  const lobeOff = r * 0.52;
  ctx.fillStyle = leafAltColor;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * lobeOff, Math.sin(angle) * lobeOff, lobeR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Diagonal leaf clusters (45°) – smaller, medium green
  const dLobeR = lobeR * 0.72;
  const dLobeOff = lobeOff * 0.88;
  ctx.fillStyle = leafColor;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * dLobeOff, Math.sin(angle) * dLobeOff, dLobeR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Small brown trunk circle in the center – omitted as the trunk would not be
  // visible from a top-down aerial perspective; the canopy fully covers it.
  // Dark green outline around the whole canopy
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = _s(2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draw a clipped circular shadow for a tree canopy.
 * Skipped for Dark style (no strong light source).
 */
/** Half/radius/style bundle shared by every tree ground-shadow drawer. */
interface TreeShadowGeom {
  half: number;
  r: number;
  style: LevelStyle | undefined;
}

/** Shared clip/fill setup for a tree's ground shadow; drawShape draws the actual arc/ellipse path. */
function _drawTreeShadow(
  ctx: CanvasRenderingContext2D,
  geom: TreeShadowGeom,
  drawShape: (ctx: CanvasRenderingContext2D, shadowOff: number, r: number) => void,
): void {
  const { half, r, style } = geom;
  if (style === 'Dark') return;
  const shadowOff = half * 0.18;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.clip();
  ctx.fillStyle = TREE_SHADOW_COLOR;
  ctx.beginPath();
  drawShape(ctx, shadowOff, r);
  ctx.fill();
  ctx.restore();
}

function _drawTreeCircleShadow(ctx: CanvasRenderingContext2D, geom: TreeShadowGeom): void {
  _drawTreeShadow(ctx, geom, (c, off, radius) => c.arc(off, off, radius, 0, Math.PI * 2));
}

/**
 * Resolve color triple [leafColor, leafAltColor, outlineColor] for a tree variant
 * given its per-style color table and the optional level style.
 */
function _treeColorTriple(
  styleTable: Record<string, [string, string, string]>,
  defaultTriple: [string, string, string],
  style?: LevelStyle,
): [string, string, string] {
  return (style && styleTable[style]) ?? defaultTriple;
}

/**
 * Draw a clipped elliptical shadow for a tree canopy.
 * Skipped for Dark style (no strong light source).
 */
function _drawTreeEllipseShadow(ctx: CanvasRenderingContext2D, geom: TreeShadowGeom): void {
  _drawTreeShadow(ctx, geom, (c, off, radius) => c.ellipse(off, off, radius * 1.05, radius * 0.95, 0, 0, Math.PI * 2));
}

/**
 * Draw a ring of `count` evenly-spaced lobes (small circles) around the
 * origin: stroke every lobe's outline first, then fill every lobe on top.
 * This two-pass order is what makes only the outer perimeter arc of each
 * circle visible as an outline once the fill paints over the interior.
 */
function _strokeAndFillLobeRing(
  ctx: CanvasRenderingContext2D,
  opts: { count: number; offset: number; radius: number; strokeColor: string; fillColor: string },
): void {
  const { count, offset, radius, strokeColor, fillColor } = opts;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = _s(2);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * offset, Math.sin(angle) * offset, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = fillColor;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * offset, Math.sin(angle) * offset, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Fill a ring of `count` evenly-spaced lobes (small circles) around the
 * origin with a single color — no outline pass. `phaseOffset` (radians)
 * rotates the ring's starting angle, used for inner rings drawn at a
 * different phase than the outer ring.
 */
function _fillLobeRing(
  ctx: CanvasRenderingContext2D,
  opts: { count: number; offset: number; radius: number; fillColor: string; phaseOffset?: number },
): void {
  const { count, offset, radius, fillColor, phaseOffset = 0 } = opts;
  ctx.fillStyle = fillColor;
  for (let i = 0; i < count; i++) {
    const angle = phaseOffset + (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * offset, Math.sin(angle) * offset, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Full color set for a tree canopy: default plus per-LevelStyle overrides. */
interface TreeColorSet {
  default: [string, string, string];
  Fall: [string, string, string];
  Dark: [string, string, string];
  Winter: [string, string, string];
  Spring: [string, string, string];
}

/**
 * Shared canopy setup for top-down trees: resolves style-specific colors,
 * computes the canopy radius, draws the ground shadow, then fills the main
 * canopy circle. Returns the resolved radius and colors so callers can draw
 * their lobe rings on top.
 */
interface TreeCanopyOptions {
  radiusFactor: number;
  colors: TreeColorSet;
  style: LevelStyle | undefined;
  drawShadow: (ctx: CanvasRenderingContext2D, geom: TreeShadowGeom) => void;
}

function _drawTreeCanopyBase(
  ctx: CanvasRenderingContext2D,
  half: number,
  opts: TreeCanopyOptions,
): { r: number; leafColor: string; leafAltColor: string; outlineColor: string } {
  const { radiusFactor, colors, style, drawShadow } = opts;
  const styleTable: Record<string, [string, string, string]> = {
    Fall: colors.Fall,
    Dark: colors.Dark,
    Winter: colors.Winter,
    Spring: colors.Spring,
  };
  const [leafColor, leafAltColor, outlineColor] = _treeColorTriple(styleTable, colors.default, style);

  const r = half * radiusFactor;
  drawShadow(ctx, { half, r, style });

  // Main canopy – large filled circle
  ctx.fillStyle = leafColor;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  return { r, leafColor, leafAltColor, outlineColor };
}

/** A ring of lobes (outer or inner) expressed as factors of the canopy radius `r`. */
interface TreeLobeRingSpec {
  count: number;
  offsetFactor: number;
  radiusFactor: number;
}

/**
 * Full per-variant recipe for drawTree2/3/4: canopy setup plus one outer
 * stroked-and-filled lobe ring, one inner filled lobe ring (phase-offset by
 * Math.PI / innerLobe.count so it nests visually between the outer lobes),
 * and an optional center dot (Tree 4 only).
 */
interface TreeVariantConfig {
  radiusFactor: number;
  colors: TreeColorSet;
  drawShadow: (ctx: CanvasRenderingContext2D, geom: TreeShadowGeom) => void;
  outerLobe: TreeLobeRingSpec;
  innerLobe: TreeLobeRingSpec;
  centerDotRadiusFactor?: number;
}

/** Draw a bumpy/rosette top-down tree variant from its config -- shared by drawTree2/3/4. */
function _drawTreeVariant(ctx: CanvasRenderingContext2D, half: number, style: LevelStyle | undefined, config: TreeVariantConfig): void {
  const { r, leafColor, leafAltColor, outlineColor } = _drawTreeCanopyBase(ctx, half, {
    radiusFactor: config.radiusFactor,
    colors: config.colors,
    style, drawShadow: config.drawShadow,
  });

  const { outerLobe, innerLobe } = config;
  _strokeAndFillLobeRing(ctx, {
    count: outerLobe.count, offset: r * outerLobe.offsetFactor, radius: r * outerLobe.radiusFactor,
    strokeColor: outlineColor, fillColor: leafAltColor,
  });
  _fillLobeRing(ctx, {
    count: innerLobe.count, offset: r * innerLobe.offsetFactor, radius: r * innerLobe.radiusFactor,
    fillColor: leafColor, phaseOffset: Math.PI / innerLobe.count,
  });

  if (config.centerDotRadiusFactor !== undefined) {
    ctx.fillStyle = leafAltColor;
    ctx.beginPath();
    ctx.arc(0, 0, r * config.centerDotRadiusFactor, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Bumpy rounded outline (6 outer lobes) with a concentric inner ring, layered canopy look. */
const TREE2_CONFIG: TreeVariantConfig = {
  radiusFactor: 0.72,
  colors: {
    default: [TREE2_LEAF_COLOR, TREE2_LEAF_ALT_COLOR, TREE2_COLOR],
    Fall:   [TREE2_FALL_LEAF_COLOR,   TREE2_FALL_LEAF_ALT_COLOR,   TREE2_FALL_COLOR],
    Dark:   [TREE2_DARK_LEAF_COLOR,   TREE2_DARK_LEAF_ALT_COLOR,   TREE2_DARK_COLOR],
    Winter: [TREE2_WINTER_LEAF_COLOR, TREE2_WINTER_LEAF_ALT_COLOR, TREE2_WINTER_COLOR],
    Spring: [TREE2_SPRING_LEAF_COLOR, TREE2_SPRING_LEAF_ALT_COLOR, TREE2_SPRING_COLOR],
  },
  drawShadow: _drawTreeEllipseShadow,
  outerLobe: { count: 6, offsetFactor: 0.64, radiusFactor: 0.42 },
  innerLobe: { count: 6, offsetFactor: 0.32, radiusFactor: 0.30 },
};

/** Bumpy rounded outline (5 outer lobes) with a concentric inner ring, layered canopy look. */
const TREE3_CONFIG: TreeVariantConfig = {
  radiusFactor: 0.72,
  colors: {
    default: [TREE3_LEAF_COLOR, TREE3_LEAF_ALT_COLOR, TREE3_COLOR],
    Fall:   [TREE3_FALL_LEAF_COLOR,   TREE3_FALL_LEAF_ALT_COLOR,   TREE3_FALL_COLOR],
    Dark:   [TREE3_DARK_LEAF_COLOR,   TREE3_DARK_LEAF_ALT_COLOR,   TREE3_DARK_COLOR],
    Winter: [TREE3_WINTER_LEAF_COLOR, TREE3_WINTER_LEAF_ALT_COLOR, TREE3_WINTER_COLOR],
    Spring: [TREE3_SPRING_LEAF_COLOR, TREE3_SPRING_LEAF_ALT_COLOR, TREE3_SPRING_COLOR],
  },
  drawShadow: _drawTreeEllipseShadow,
  outerLobe: { count: 5, offsetFactor: 0.62, radiusFactor: 0.44 },
  innerLobe: { count: 5, offsetFactor: 0.32, radiusFactor: 0.30 },
};

/** Compact, dense rosette formed by many tightly-packed lobes plus a center dot. */
const TREE4_CONFIG: TreeVariantConfig = {
  radiusFactor: 0.70,
  colors: {
    default: [TREE4_LEAF_COLOR, TREE4_LEAF_ALT_COLOR, TREE4_COLOR],
    Fall:   [TREE4_FALL_LEAF_COLOR,   TREE4_FALL_LEAF_ALT_COLOR,   TREE4_FALL_COLOR],
    Dark:   [TREE4_DARK_LEAF_COLOR,   TREE4_DARK_LEAF_ALT_COLOR,   TREE4_DARK_COLOR],
    Winter: [TREE4_WINTER_LEAF_COLOR, TREE4_WINTER_LEAF_ALT_COLOR, TREE4_WINTER_COLOR],
    Spring: [TREE4_SPRING_LEAF_COLOR, TREE4_SPRING_LEAF_ALT_COLOR, TREE4_SPRING_COLOR],
  },
  drawShadow: _drawTreeCircleShadow,
  outerLobe: { count: 8, offsetFactor: 0.65, radiusFactor: 0.35 },
  innerLobe: { count: 6, offsetFactor: 0.38, radiusFactor: 0.28 },
  centerDotRadiusFactor: 0.20,
};

/**
 * Draw Tree 2 – a top-down tree with a bumpy rounded outline formed by 6 outer lobes
 * and a concentric inner ring pattern, giving it a layered canopy look.
 */
export function drawTree2(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  _drawTreeVariant(ctx, half, style, TREE2_CONFIG);
}

/**
 * Draw Tree 3 – a top-down tree with a bumpy rounded outline formed by 5 outer lobes
 * and a concentric inner ring pattern, giving it a layered canopy look.
 */
export function drawTree3(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  _drawTreeVariant(ctx, half, style, TREE3_CONFIG);
}

/**
 * Draw Tree 4 – a compact, dense top-down tree formed by many small tightly-packed
 * lobes arranged in concentric rings, giving a rosette / dense-foliage appearance.
 */
export function drawTree4(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  _drawTreeVariant(ctx, half, style, TREE4_CONFIG);
}
