/** Helpers for rendering the level-selection screen. */

import { CHAPTERS } from './levels';
import { ChapterDef } from './types';
import { renderMinimap } from './minimap';

/** Metadata for the active campaign shown in the campaign header on the main menu. */
export interface ActiveCampaignInfo {
  name: string;
  author: string;
  completionPct: number;
}

/** Compute the total stars available and collected across a set of levels. */
function chapterStarTotals(
  levels: import('./types').LevelDef[],
  levelStars: Record<number, number>,
): { total: number; collected: number } {
  let total = 0;
  let collected = 0;
  for (const level of levels) {
    const t = level.starCount ?? 0;
    total += t;
    if (t > 0) {
      collected += Math.min(levelStars[level.id] ?? 0, t);
    }
  }
  return { total, collected };
}

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
 * @param activeCampaign - The campaign currently active for play (official or user campaign).
 * @param campaignChapters - When set, the chapters to render (from the active campaign).
 * @param levelStars - Map of level ID → stars collected for the current campaign.
 */
export function renderLevelList(
  levelListEl: HTMLElement,
  completedLevels: Set<number>,
  startLevel: (levelId: number) => void,
  onResetClick: () => void,
  onRulesClick: () => void,
  onCampaignEditorClick: () => void,
  onUnlockAllClick: () => void,
  activeCampaign?: ActiveCampaignInfo,
  campaignChapters?: ChapterDef[],
  levelStars: Record<number, number> = {},
): void {
  levelListEl.innerHTML = '';

  const chapters = campaignChapters ?? CHAPTERS;

  // ── Active campaign header ─────────────────────────────────────────────────
  if (activeCampaign) {
    const header = document.createElement('div');
    header.style.cssText =
      'background:#16213e;border:2px solid #f0c040;border-radius:8px;' +
      'padding:14px 16px;display:flex;flex-direction:column;gap:8px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:1.05rem;font-weight:bold;color:#f0c040;';
    titleEl.textContent = `🎯 ${activeCampaign.name}`;

    const metaEl = document.createElement('div');
    metaEl.style.cssText = 'font-size:0.8rem;color:#aaa;';
    metaEl.textContent = `By ${activeCampaign.author}`;

    const progressRow = document.createElement('div');
    progressRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const progressLabel = document.createElement('span');
    progressLabel.style.cssText = 'font-size:0.85rem;color:#7ed321;white-space:nowrap;';
    progressLabel.textContent = `Progress: ${activeCampaign.completionPct}%`;
    const progressBar = document.createElement('div');
    progressBar.style.cssText =
      'flex:1;height:8px;background:#0d1a30;border-radius:4px;overflow:hidden;';
    const progressFill = document.createElement('div');
    progressFill.style.cssText =
      `height:100%;width:${activeCampaign.completionPct}%;background:#7ed321;border-radius:4px;` +
      'transition:width 0.3s;';
    progressBar.appendChild(progressFill);
    progressRow.appendChild(progressLabel);
    progressRow.appendChild(progressBar);

    header.appendChild(titleEl);
    header.appendChild(metaEl);
    header.appendChild(progressRow);

    // When the campaign is 100% complete, show aggregate star tally (if any stars exist)
    if (activeCampaign.completionPct >= 100) {
      const allLevels = chapters.flatMap((ch) => ch.levels);
      const { total: campaignStarTotal, collected: campaignStarCollected } =
        chapterStarTotals(allLevels, levelStars);
      if (campaignStarTotal > 0) {
        const starRow = document.createElement('div');
        starRow.style.cssText = 'font-size:0.9rem;color:#f0c040;font-weight:bold;';
        starRow.textContent = `⭐ ${campaignStarCollected}/${campaignStarTotal}`;
        header.appendChild(starRow);
      }
    }

    levelListEl.appendChild(header);
  }

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];

    // A chapter is locked unless the previous chapter has enough completions.
    // The required count equals the number of non-challenge levels in that chapter, but
    // any completed level (challenge or not) counts toward the total.  This means players
    // can substitute a challenge level for a non-challenge one to meet the quota.
    const prevChapter = ci > 0 ? chapters[ci - 1] : null;
    const prevNonChallengeCount = prevChapter
      ? prevChapter.levels.filter((l) => !l.challenge).length : 0;
    const prevCompletedCount = prevChapter
      ? prevChapter.levels.filter((l) => completedLevels.has(l.id)).length : 0;
    const chapterLocked = prevChapter !== null && prevCompletedCount < prevNonChallengeCount;

    const completedInChapter = chapter.levels.filter((l) => completedLevels.has(l.id)).length;
    const totalInChapter = chapter.levels.length;
    const allLevelsCompleted = totalInChapter > 0 && completedInChapter === totalInChapter;

    // Compute star totals for this chapter
    const { total: chapterStarTotal, collected: chapterStarCollected } =
      chapterStarTotals(chapter.levels, levelStars);

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
    const doneIcon = allLevelsCompleted ? ' ✅' : '';
    // When chapter is fully complete and has stars, append a ⭐ X/Y tally
    const chapterStarText = (allLevelsCompleted && chapterStarTotal > 0)
      ? `  ⭐ ${chapterStarCollected}/${chapterStarTotal}` : '';
    const progressText = totalInChapter > 0
      ? ` (${completedInChapter}/${totalInChapter}${doneIcon})${chapterStarText}`
      : '';
    const chapterTitle = document.createElement('span');
    chapterTitle.textContent = `Chapter ${ci + 1}: ${chapter.name}${lockIcon}${progressText}`;

    // Expand/collapse chevron
    const chevron = document.createElement('span');
    chevron.style.cssText = 'font-size:0.8rem;transition:transform 0.2s;';

    // Default: expand if not locked and not all levels completed
    let expanded = !chapterLocked && !allLevelsCompleted;
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

      // Within a chapter, a level is locked if the previous non-challenge level is not yet done.
      // Challenge levels are skipped in the chain so that non-challenge levels after a challenge
      // level are not blocked by it.
      const prevNonChallenge = li > 0
        ? (chapter.levels.slice(0, li).reverse().find((l) => !l.challenge) ?? null)
        : null;
      const isLocked = chapterLocked || (prevNonChallenge !== null && !completedLevels.has(prevNonChallenge.id));

      const btn = document.createElement('button');
      btn.classList.add('level-btn');
      if (isLocked)    btn.classList.add('locked');
      if (isCompleted) btn.classList.add('completed');

      const icon = isLocked ? '🔒' : isCompleted ? '✅' : '▶';
      const challengeIcon = level.challenge ? ' 💀' : '';
      const levelStarTotal = level.starCount ?? 0;
      const levelStarCollected = levelStarTotal > 0
        ? Math.min(levelStars[level.id] ?? 0, levelStarTotal) : 0;
      const levelStarText = levelStarTotal > 0
        ? `  ⭐ ${levelStarCollected}/${levelStarTotal}` : '';
      btn.textContent = `${icon} Level ${li + 1}: ${level.name}${challengeIcon}${levelStarText}`;
      btn.disabled = isLocked;

      if (!isLocked) {
        btn.addEventListener('click', () => startLevel(level.id));
      }

      // Wrap level button and its minimap in a flex row
      const levelRow = document.createElement('div');
      levelRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const minimap = renderMinimap(level);
      minimap.style.cssText = 'flex-shrink:0;image-rendering:pixelated;';
      levelRow.appendChild(minimap);
      levelRow.appendChild(btn);
      levelsContainer.appendChild(levelRow);
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
