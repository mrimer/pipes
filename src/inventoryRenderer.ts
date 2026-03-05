/** Helpers for rendering the inventory bar in the play screen. */

import { Board, GOLD_PIPE_SHAPES } from './board';
import { PipeShape } from './types';
import { GOLD_PIPE_COLOR } from './colors';
import { shapeIcon } from './renderer';

/**
 * Re-render the inventory bar element.
 *
 * @param inventoryBarEl - The container element for inventory items.
 * @param board - The active board (provides inventory counts and container bonuses).
 * @param selectedShape - The pipe shape currently selected by the player, or null.
 * @param onItemClick - Callback invoked when the player clicks an inventory item.
 */
export function renderInventoryBar(
  inventoryBarEl: HTMLElement,
  board: Board,
  selectedShape: PipeShape | null,
  onItemClick: (shape: PipeShape, effectiveCount: number) => void,
): void {
  inventoryBarEl.innerHTML = '<h3 class="inv-title">Inventory</h3>';

  const bonuses = board.getContainerBonuses();

  for (const item of board.inventory) {
    const effectiveCount = item.count + (bonuses.get(item.shape) ?? 0);
    // Gold pipe items are only shown when there is at least one available
    if (GOLD_PIPE_SHAPES.has(item.shape) && effectiveCount <= 0) continue;

    const isGold = GOLD_PIPE_SHAPES.has(item.shape);
    const el = document.createElement('div');
    el.classList.add('inv-item');
    if (isGold) el.classList.add('gold');
    if (item.shape === selectedShape) el.classList.add('selected');
    if (effectiveCount === 0) el.classList.add('depleted');

    const icon = shapeIcon(item.shape, isGold ? GOLD_PIPE_COLOR : '#4a90d9');
    el.innerHTML =
      `<span class="inv-shape">${icon}</span>` +
      `<span class="inv-count">×${effectiveCount}</span>`;

    el.dataset['shape'] = item.shape;
    el.addEventListener('click', () => onItemClick(item.shape, effectiveCount));
    inventoryBarEl.appendChild(el);
  }
}
