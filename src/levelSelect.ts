/** Helpers for rendering the level-selection screen. */

import { LEVELS } from './levels';

/**
 * Populate the level-list element with buttons for each available level.
 *
 * @param levelListEl - The container element for level buttons.
 * @param completedLevels - Set of level IDs that the player has already completed.
 * @param startLevel - Callback invoked when the player selects a level to play.
 * @param onResetClick - Callback invoked when the player clicks the reset-progress button.
 */
export function renderLevelList(
  levelListEl: HTMLElement,
  completedLevels: Set<number>,
  startLevel: (levelId: number) => void,
  onResetClick: () => void,
): void {
  levelListEl.innerHTML = '';
  for (const level of LEVELS) {
    const isCompleted = completedLevels.has(level.id);
    const isLocked = level.id > 1 && !completedLevels.has(level.id - 1);

    const btn = document.createElement('button');
    btn.classList.add('level-btn');
    if (isLocked)    btn.classList.add('locked');
    if (isCompleted) btn.classList.add('completed');

    const icon = isLocked ? '🔒' : isCompleted ? '✅' : '▶';
    btn.textContent = `${icon} Level ${level.id}: ${level.name}`;
    btn.disabled = isLocked;

    if (!isLocked) {
      btn.addEventListener('click', () => startLevel(level.id));
    }
    levelListEl.appendChild(btn);
  }

  // Reset-progress button at the bottom of the level list
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '🔄 Reset Progress';
  resetBtn.style.cssText =
    'margin-top:8px;padding:10px 20px;font-size:0.9rem;background:#2a2a4a;color:#e74c3c;' +
    'border:1px solid #e74c3c;border-radius:6px;cursor:pointer;width:100%;';
  resetBtn.addEventListener('click', onResetClick);
  levelListEl.appendChild(resetBtn);
}
