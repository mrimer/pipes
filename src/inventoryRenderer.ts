/** Helpers for rendering the inventory bar in the play screen. */

import { Board, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES } from './board';
import { PipeShape } from './types';
import { GOLD_PIPE_COLOR, LEAKY_PIPE_COLOR } from './colors';
import { shapeIcon } from './renderer';

/**
 * Re-render the inventory bar element.
 *
 * @param inventoryBarEl - The container element for inventory items.
 * @param board - The active board (provides inventory counts and container bonuses).
 * @param selectedShape - The pipe shape currently selected by the player, or null.
 * @param onItemClick - Callback invoked when the player left-clicks an inventory item.
 * @param onItemRightClick - Callback invoked when the player right-clicks an inventory item.
 */
export function renderInventoryBar(
  inventoryBarEl: HTMLElement,
  board: Board,
  selectedShape: PipeShape | null,
  onItemClick: (shape: PipeShape, effectiveCount: number) => void,
  onItemRightClick?: () => void,
): void {
  inventoryBarEl.innerHTML = '<h3 class="inv-title">Inventory</h3>';

  const bonuses = board.getContainerBonuses();

  /** Shapes already rendered from board.inventory (avoids duplicates below). */
  const renderedShapes = new Set<PipeShape>();
  /** Count of item elements actually appended to the bar. */
  let renderedCount = 0;

  for (const item of board.inventory) {
    renderedShapes.add(item.shape);
    const effectiveCount = item.count + (bonuses.get(item.shape) ?? 0);
    const isGold = GOLD_PIPE_SHAPES.has(item.shape);
    const isLeaky = LEAKY_PIPE_SHAPES.has(item.shape);
    const el = document.createElement('div');
    el.classList.add('inv-item');
    if (isGold) el.classList.add('gold');
    if (isLeaky) el.classList.add('leaky');
    if (item.shape === selectedShape) el.classList.add('selected');
    if (effectiveCount === 0) el.classList.add('depleted');
    else if (effectiveCount < 0) el.classList.add('negative');

    const iconColor = isGold ? GOLD_PIPE_COLOR : isLeaky ? LEAKY_PIPE_COLOR : '#4a90d9';
    const icon = shapeIcon(item.shape, iconColor);
    el.innerHTML =
      `<span class="inv-shape">${icon}</span>` +
      `<span class="inv-count">×${effectiveCount}</span>`;

    el.dataset['shape'] = item.shape;
    el.addEventListener('click', () => onItemClick(item.shape, effectiveCount));
    if (onItemRightClick) {
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); onItemRightClick(); });
    }
    inventoryBarEl.appendChild(el);
    renderedCount++;
  }

  // Also display shapes granted by connected Chamber-item tiles that are not
  // listed in board.inventory at all (e.g. levels whose inventory list does not
  // pre-declare the bonus shape).
  for (const [bonusShape, bonusCount] of bonuses) {
    if (renderedShapes.has(bonusShape)) continue; // already rendered above

    const isGold = GOLD_PIPE_SHAPES.has(bonusShape);
    const isLeaky = LEAKY_PIPE_SHAPES.has(bonusShape);

    const el = document.createElement('div');
    el.classList.add('inv-item');
    if (isGold) el.classList.add('gold');
    if (isLeaky) el.classList.add('leaky');
    if (bonusShape === selectedShape) el.classList.add('selected');
    if (bonusCount === 0) el.classList.add('depleted');
    else if (bonusCount < 0) el.classList.add('negative');

    const iconColor = isGold ? GOLD_PIPE_COLOR : isLeaky ? LEAKY_PIPE_COLOR : '#4a90d9';
    const icon = shapeIcon(bonusShape, iconColor);
    el.innerHTML =
      `<span class="inv-shape">${icon}</span>` +
      `<span class="inv-count">×${bonusCount}</span>`;

    el.dataset['shape'] = bonusShape;
    el.addEventListener('click', () => onItemClick(bonusShape, bonusCount));
    if (onItemRightClick) {
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); onItemRightClick(); });
    }
    inventoryBarEl.appendChild(el);
    renderedCount++;
  }

  // When no items are visible, show a placeholder so the bar isn't empty.
  if (renderedCount === 0) {
    const noneEl = document.createElement('p');
    noneEl.classList.add('inv-none');
    noneEl.textContent = 'None';
    inventoryBarEl.appendChild(noneEl);
  }
}
