/** Floating animation labels that rise and fade on the canvas after tile connections. */

import { TILE_SIZE } from '../renderer';
import { ANIM_POSITIVE_COLOR, ANIM_NEGATIVE_COLOR, ANIM_ZERO_COLOR } from '../colors';
export { ANIM_POSITIVE_COLOR, ANIM_NEGATIVE_COLOR, ANIM_ZERO_COLOR };

/** A floating animation label drawn on the canvas. */
export interface TileAnimation {
  /** Canvas pixel X of the animation origin (tile center). */
  x: number;
  /** Canvas pixel Y of the animation origin (tile center). */
  y: number;
  /** Text to display (e.g. '+5', '-1'). */
  text: string;
  /** CSS/canvas color string for the label. */
  color: string;
  /** `performance.now()` timestamp when the animation started. */
  startTime: number;
  /** Total duration in milliseconds. */
  duration: number;
}

/** Duration for tile-connection animations (ms). */
export const ANIM_DURATION = 900;

/** Vertical rise in pixels over the full animation duration. */
export const ANIM_RISE_PX = 36;

/** Color for item-grant animation labels (gold, to distinguish from generic positive). */
export const ANIM_ITEM_COLOR = '#ffd700';

/** Color for negative item-grant animation labels (darker gold, to differentiate from positive). */
export const ANIM_ITEM_NEG_COLOR = '#b8860b';

/**
 * Choose the animation label color based on a numeric value.
 * Positive → green, negative → red, zero → gray.
 */
export function animColor(value: number): string {
  if (value > 0) return ANIM_POSITIVE_COLOR;
  if (value < 0) return ANIM_NEGATIVE_COLOR;
  return ANIM_ZERO_COLOR;
}

/**
 * Draw all active animation labels onto the canvas and remove expired ones.
 * Mutates the `animations` array in-place (splices out finished animations).
 *
 * @param ctx - The 2D rendering context to draw onto.
 * @param animations - The live array of active animations.
 * @param canvasWidth - Optional canvas pixel width used to clamp animation
 *   labels that would otherwise be clipped at the right edge of the board.
 *   When provided, each label's x position is shifted left as needed so the
 *   full text stays within the canvas.
 */
/** The water droplet emoji used in animation labels. */
const DROPLET_CHAR = '💧';

export function renderAnimations(
  ctx: CanvasRenderingContext2D,
  animations: TileAnimation[],
  canvasWidth?: number,
): void {
  const now = performance.now();
  const mainFontSize = Math.round(30 * TILE_SIZE / 64);
  const dropletFontSize = Math.round(18 * TILE_SIZE / 64);
  const mainFont = `bold ${mainFontSize}px Arial`;
  const dropletFont = `bold ${dropletFontSize}px Arial`;
  ctx.font = mainFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riseAmount = ANIM_RISE_PX * TILE_SIZE / 64;
  let i = 0;
  while (i < animations.length) {
    const anim = animations[i];
    const elapsed = now - anim.startTime;
    if (elapsed >= anim.duration) {
      animations.splice(i, 1);
      continue;
    }
    const progress = elapsed / anim.duration;
    // Remain fully visible for the first 50% of the duration, then fade out.
    const alpha = progress < 0.5 ? 1 : (1 - progress) * 2;
    const yOffset = -riseAmount * progress;
    const y = anim.y + yOffset;

    // Split off the trailing droplet character, if present, to render it
    // at a smaller font size so it doesn't crowd adjacent tiles.
    const dropletIdx = anim.text.indexOf(DROPLET_CHAR);
    const hasDroplet = dropletIdx !== -1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    if (!hasDroplet) {
      // No droplet – render as a single centered label.
      ctx.font = mainFont;
      let x = anim.x;
      if (canvasWidth !== undefined) {
        const halfW = ctx.measureText(anim.text).width / 2;
        if (x + halfW > canvasWidth) x = canvasWidth - halfW;
      }
      ctx.strokeText(anim.text, x, y);
      ctx.fillStyle = anim.color;
      ctx.fillText(anim.text, x, y);
    } else {
      // Render the numeric part at full size, droplet at reduced size, side
      // by side so the combined label is centered at anim.x.
      const numPart = anim.text.slice(0, dropletIdx);
      ctx.font = mainFont;
      const numWidth = numPart ? ctx.measureText(numPart).width : 0;
      ctx.font = dropletFont;
      const dropWidth = ctx.measureText(DROPLET_CHAR).width;
      const halfTotal = (numWidth + dropWidth) / 2;
      let cx = anim.x;
      if (canvasWidth !== undefined && cx + halfTotal > canvasWidth) {
        cx = canvasWidth - halfTotal;
      }
      ctx.textAlign = 'center';
      if (numPart) {
        ctx.font = mainFont;
        const numCx = cx - dropWidth / 2;
        ctx.strokeText(numPart, numCx, y);
        ctx.fillStyle = anim.color;
        ctx.fillText(numPart, numCx, y);
      }
      ctx.font = dropletFont;
      const dropCx = cx + numWidth / 2;
      ctx.strokeText(DROPLET_CHAR, dropCx, y);
      ctx.fillStyle = anim.color;
      ctx.fillText(DROPLET_CHAR, dropCx, y);
    }

    ctx.restore();

    i++;
  }
}
