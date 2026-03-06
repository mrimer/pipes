/** Helpers for rendering the level-selection screen. */

import { CHAPTERS } from './levels';

/**
 * Populate the level-list element with chapters (expandable/collapsible) and
 * their nested level buttons.
 *
 * @param levelListEl - The container element for chapter boxes.
 * @param completedLevels - Set of level IDs that the player has already completed.
 * @param startLevel - Callback invoked when the player selects a level to play.
 * @param onResetClick - Callback invoked when the player clicks the reset-progress button.
 * @param onRulesClick - Callback invoked when the player clicks the "Game Rules" button.
 * @param onCampaignEditorClick - Callback invoked when the player clicks the "Campaign Editor" button.
 * @param onUnlockAllClick - Callback invoked when the dev cheat "Unlock All" button is clicked.
 */
export function renderLevelList(
  levelListEl: HTMLElement,
  completedLevels: Set<number>,
  startLevel: (levelId: number) => void,
  onResetClick: () => void,
  onRulesClick: () => void,
  onCampaignEditorClick: () => void,
  onUnlockAllClick: () => void,
): void {
  levelListEl.innerHTML = '';

  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    const chapter = CHAPTERS[ci];

    // A chapter is locked if a previous chapter exists and not all its levels are done.
    const prevChapter = ci > 0 ? CHAPTERS[ci - 1] : null;
    const chapterLocked = prevChapter !== null &&
      prevChapter.levels.some((l) => !completedLevels.has(l.id));

    const completedInChapter = chapter.levels.filter((l) => completedLevels.has(l.id)).length;
    const totalInChapter = chapter.levels.length;

    // ── Chapter container ──────────────────────────────────────────────────
    const chapterBox = document.createElement('div');
    chapterBox.classList.add('chapter-box');
    chapterBox.style.cssText =
      'border:2px solid ' + (chapterLocked ? '#555' : '#4a90d9') + ';' +
      'border-radius:8px;overflow:hidden;';

    // ── Chapter header (click to expand/collapse) ──────────────────────────
    const chapterHeader = document.createElement('button');
    chapterHeader.classList.add('chapter-header');
    if (chapterLocked) chapterHeader.classList.add('locked');
    chapterHeader.style.cssText =
      'width:100%;display:flex;justify-content:space-between;align-items:center;' +
      'padding:12px 16px;font-size:1rem;font-weight:bold;' +
      'background:' + (chapterLocked ? '#1e1e2e' : '#16213e') + ';' +
      'color:' + (chapterLocked ? '#777' : '#eee') + ';' +
      'border:none;cursor:' + (chapterLocked ? 'default' : 'pointer') + ';' +
      'text-align:left;';

    const lockIcon = chapterLocked ? ' 🔒' : '';
    const progressText = totalInChapter > 0
      ? ` (${completedInChapter}/${totalInChapter})`
      : '';
    const chapterTitle = document.createElement('span');
    chapterTitle.textContent = `Chapter ${chapter.id}: ${chapter.name}${lockIcon}${progressText}`;

    // Expand/collapse chevron
    const chevron = document.createElement('span');
    chevron.style.cssText = 'font-size:0.8rem;transition:transform 0.2s;';

    // Default: expand if not locked
    let expanded = !chapterLocked;
    chevron.textContent = expanded ? '▲' : '▼';

    chapterHeader.appendChild(chapterTitle);
    chapterHeader.appendChild(chevron);

    // ── Levels container ───────────────────────────────────────────────────
    const levelsContainer = document.createElement('div');
    levelsContainer.classList.add('chapter-levels');
    levelsContainer.style.cssText =
      'display:' + (expanded ? 'flex' : 'none') + ';' +
      'flex-direction:column;gap:8px;padding:' +
      (totalInChapter > 0 ? '8px 12px 12px' : '0') + ';' +
      'background:#0d1a30;';

    if (!chapterLocked) {
      chapterHeader.addEventListener('click', () => {
        expanded = !expanded;
        levelsContainer.style.display = expanded ? 'flex' : 'none';
        chevron.textContent = expanded ? '▲' : '▼';
      });
    }

    // ── Level buttons ──────────────────────────────────────────────────────
    for (let li = 0; li < chapter.levels.length; li++) {
      const level = chapter.levels[li];
      const isCompleted = completedLevels.has(level.id);

      // Within a chapter, a level is locked if the previous level is not yet done.
      const prevLevel = li > 0 ? chapter.levels[li - 1] : null;
      const isLocked = chapterLocked || (prevLevel !== null && !completedLevels.has(prevLevel.id));

      const btn = document.createElement('button');
      btn.classList.add('level-btn');
      if (isLocked)    btn.classList.add('locked');
      if (isCompleted) btn.classList.add('completed');

      const icon = isLocked ? '🔒' : isCompleted ? '✅' : '▶';
      btn.textContent = `${icon} Level ${li + 1}: ${level.name}`;
      btn.disabled = isLocked;

      if (!isLocked) {
        btn.addEventListener('click', () => startLevel(level.id));
      }
      levelsContainer.appendChild(btn);
    }

    if (totalInChapter === 0 && !chapterLocked) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'color:#777;font-size:0.85rem;padding:8px 12px 12px;text-align:center;';
      emptyMsg.textContent = 'No levels yet – coming soon!';
      levelsContainer.appendChild(emptyMsg);
      levelsContainer.style.padding = '0';
      levelsContainer.style.display = expanded ? 'flex' : 'none';
    }

    chapterBox.appendChild(chapterHeader);
    chapterBox.appendChild(levelsContainer);
    levelListEl.appendChild(chapterBox);
  }

  // Campaign Editor button at the top of the controls
  const campaignEditorBtn = document.createElement('button');
  campaignEditorBtn.textContent = '🗺️ Campaign Editor';
  campaignEditorBtn.style.cssText =
    'margin-top:8px;padding:10px 20px;font-size:0.9rem;background:#16213e;color:#f0c040;' +
    'border:1px solid #f0c040;border-radius:6px;cursor:pointer;width:100%;';
  campaignEditorBtn.addEventListener('click', onCampaignEditorClick);
  levelListEl.appendChild(campaignEditorBtn);

  // Game Rules button above the reset button
  const rulesBtn = document.createElement('button');
  rulesBtn.textContent = '📋 Game Rules';
  rulesBtn.style.cssText =
    'margin-top:8px;padding:10px 20px;font-size:0.9rem;background:#16213e;color:#7ed321;' +
    'border:1px solid #7ed321;border-radius:6px;cursor:pointer;width:100%;';
  rulesBtn.addEventListener('click', onRulesClick);
  levelListEl.appendChild(rulesBtn);

  // Reset-progress button at the bottom of the level list
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '🔄 Reset Progress';
  resetBtn.style.cssText =
    'margin-top:8px;padding:10px 20px;font-size:0.9rem;background:#2a2a4a;color:#e74c3c;' +
    'border:1px solid #e74c3c;border-radius:6px;cursor:pointer;width:100%;';
  resetBtn.addEventListener('click', onResetClick);
  levelListEl.appendChild(resetBtn);

  // Dev cheat button: mark all levels completed and unlock all chapters/levels
  const unlockAllBtn = document.createElement('button');
  unlockAllBtn.textContent = '🛠️ [Dev] Unlock All';
  unlockAllBtn.style.cssText =
    'margin-top:8px;padding:10px 20px;font-size:0.9rem;background:#2a2a4a;color:#f39c12;' +
    'border:1px solid #f39c12;border-radius:6px;cursor:pointer;width:100%;';
  unlockAllBtn.addEventListener('click', onUnlockAllClick);
  levelListEl.appendChild(unlockAllBtn);
}
