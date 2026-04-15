/** Helpers for rendering the level-selection screen. */

import { ChapterDef } from './types';
import { attachChapterWaveAnimation } from './visuals/chapterWaves';
import { sfxManager, SfxId } from './sfxManager';
import { EDITOR_INPUT_BG, ERROR_COLOR, MUTED_BTN_BG, RADIUS_MD, RADIUS_SM, UI_BG, UI_BORDER, UI_GOLD } from './uiConstants';
import { createButton } from './uiHelpers';

/** Metadata for the active campaign shown in the campaign header on the main menu. */
export interface ActiveCampaignInfo {
  name: string;
  author: string;
  completionPct: number;
}

/**
 * Find the level ID to use for the "Continue" button.
 *
 * Priority:
 *  1. First non-completed, non-challenge level that is available for selection.
 *  2. First non-completed challenge level that is available for selection.
 *  3. First available level that has at least one uncollected star.
 *  4. `null` when every selectable level has been completed and all stars collected.
 *
 * A level is considered "available for selection" when it would not be shown as
 * locked in the level list (same locking logic used by renderLevelList).
 */
export function findContinueLevelId(
  chapters: import('./types').ChapterDef[],
  completedLevels: Set<number>,
  levelStars: Record<number, number> = {},
  completedChapters?: ReadonlySet<number>,
): number | null {
  let firstNonCompleteChallenge: number | null = null;
  let firstUncollectedStar: number | null = null;
  let foundLockedChapter = false;

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];

    const prevChapter = ci > 0 ? chapters[ci - 1] : null;
    const prevNonChallengeCount = prevChapter
      ? prevChapter.levels.filter((l) => !l.challenge).length : 0;
    const prevCompletedCount = prevChapter
      ? prevChapter.levels.filter((l) => completedLevels.has(l.id)).length : 0;
    let chapterLocked: boolean;
    if (prevChapter !== null && prevChapter.grid && completedChapters !== undefined) {
      chapterLocked = !completedChapters.has(prevChapter.id);
    } else {
      chapterLocked = prevChapter !== null && prevCompletedCount < prevNonChallengeCount;
    }

    if (chapterLocked) {
      if (foundLockedChapter) break;
      foundLockedChapter = true;
    }

    for (let li = 0; li < chapter.levels.length; li++) {
      const level = chapter.levels[li];

      const prevNonChallenge = li > 0
        ? (chapter.levels.slice(0, li).reverse().find((l) => !l.challenge) ?? null)
        : null;
      const isLocked = chapterLocked || (prevNonChallenge !== null && !completedLevels.has(prevNonChallenge.id));

      // Stop scanning within this chapter once the first locked level is hit.
      if (isLocked) break;

      if (!completedLevels.has(level.id)) {
        if (!level.challenge) {
          // Best match: first available, non-completed, non-challenge level.
          return level.id;
        }
        if (firstNonCompleteChallenge === null) {
          firstNonCompleteChallenge = level.id;
        }
      } else if (firstUncollectedStar === null) {
        // Completed level: check whether it has stars that haven't all been collected.
        const starTotal = level.starCount ?? 0;
        if (starTotal > 0 && (levelStars[level.id] ?? 0) < starTotal) {
          firstUncollectedStar = level.id;
        }
      }
    }
  }

  return firstNonCompleteChallenge ?? firstUncollectedStar;
}

/**
 * Find the index of the latest unlocked chapter that has a chapter map (grid).
 * Returns the 0-based chapter index, or `null` if no such chapter is accessible.
 */
export function findContinueChapterIdx(
  chapters: import('./types').ChapterDef[],
  completedLevels: Set<number>,
  completedChapters?: ReadonlySet<number>,
): number | null {
  let lastUnlockedIdx: number | null = null;

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    if (!chapter.grid) continue;

    const prevChapter = ci > 0 ? chapters[ci - 1] : null;
    const prevNonChallengeCount = prevChapter
      ? prevChapter.levels.filter((l) => !l.challenge).length : 0;
    const prevCompletedCount = prevChapter
      ? prevChapter.levels.filter((l) => completedLevels.has(l.id)).length : 0;
    let chapterLocked: boolean;
    if (prevChapter !== null && prevChapter.grid && completedChapters !== undefined) {
      chapterLocked = !completedChapters.has(prevChapter.id);
    } else {
      chapterLocked = prevChapter !== null && prevCompletedCount < prevNonChallengeCount;
    }

    if (chapterLocked) break;
    lastUnlockedIdx = ci;
  }

  return lastUnlockedIdx;
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

/** Compute the sum of water remaining across all completed levels in a set. */
function chapterWaterTotal(
  levels: import('./types').LevelDef[],
  completedLevels: Set<number>,
  levelWater: Record<number, number>,
): number {
  let total = 0;
  for (const level of levels) {
    if (completedLevels.has(level.id)) {
      total += levelWater[level.id] ?? 0;
    }
  }
  return total;
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
 * @param levelWater - Map of level ID → max water remaining recorded for the current campaign.
 * @param chapterExpandedState - Map of chapter index → expanded state from the previous visit.
 *   When provided, a chapter's expansion is restored from this map instead of being computed
 *   from completion status.  Only chapters absent from the map use the default rule.
 * @param onChapterToggle - Callback invoked when the player expands or collapses a chapter,
 *   so the caller can persist the new state across re-renders.
 * @param onCampaignMastered - Optional callback invoked the first time the
 *   campaign box is rendered in the fully-mastered state.  The caller is
 *   responsible for tracking whether the sequence has already fired and only
 *   passing a non-null callback when the sequence should run.
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
  levelWater: Record<number, number> = {},
  onChapterMap?: (chapterIdx: number) => void,
  completedChapters?: ReadonlySet<number>,
  onSettingsClick?: () => void,
  onCampaignMastered?: () => void,
  campaignHasMap = false,
): void {
  levelListEl.innerHTML = '';

  // campaignChapters is always provided by game.ts (via the active campaign).
  // The empty-array fallback guards against callers that omit the parameter.
  const chapters = campaignChapters ?? [];

  // ── Campaign-state header ──────────────────────────────────────────────────
  if (!activeCampaign) {
    const msg = document.createElement('p');
    msg.style.cssText =
      'font-size:0.95rem;color:#aaa;text-align:center;margin:16px 0;';
    msg.textContent = 'Click Campaign Editor to import or create levels.';
    levelListEl.appendChild(msg);
  } else {
    const h2 = document.createElement('h2');
    h2.textContent = 'Select a Level';
    h2.style.textAlign = 'center';

    if (onSettingsClick) {
      // Row containing the gear/settings button (left) and the "Select a Level" heading.
      const selectRow = document.createElement('div');
      selectRow.style.cssText =
        'display:flex;align-items:center;justify-content:center;gap:10px;width:100%;position:relative;';

      const gearBtn = document.createElement('button');
      gearBtn.type = 'button';
      gearBtn.title = 'Settings';
      gearBtn.textContent = '⚙️';
      gearBtn.style.cssText =
        'font-size:1.2rem;background:none;border:none;cursor:pointer;padding:0;line-height:1;' +
        'position:absolute;left:0;';
      gearBtn.addEventListener('click', () => onSettingsClick());
      selectRow.appendChild(gearBtn);
      selectRow.appendChild(h2);
      levelListEl.appendChild(selectRow);
    } else {
      levelListEl.appendChild(h2);
    }
  }

  // ── Active campaign header ─────────────────────────────────────────────────
  if (activeCampaign) {
    // Campaign aggregate stats: compute before creating the header so the
    // completion state can influence the box color.
    const allLevels = chapters.flatMap((ch) => ch.levels);
    const { total: campaignStarTotal, collected: campaignStarCollected } =
      chapterStarTotals(allLevels, levelStars);
    const campaignWaterTotal = chapterWaterTotal(allLevels, completedLevels, levelWater);
    const campaignChallengeTotal = allLevels.filter((l) => l.challenge).length;
    const campaignChallengeCompleted = allLevels.filter((l) => l.challenge && completedLevels.has(l.id)).length;
    const campaignNonChallengeTotal = allLevels.filter((l) => !l.challenge).length;
    const campaignNonChallengeCompleted = allLevels.filter((l) => !l.challenge && completedLevels.has(l.id)).length;
    const allNonChallengeCompleted = campaignNonChallengeTotal > 0 &&
      campaignNonChallengeCompleted === campaignNonChallengeTotal;
    const allStarsCompleted = campaignStarTotal === 0 || campaignStarCollected >= campaignStarTotal;
    const allChallengesCompleted = campaignChallengeTotal === 0 || campaignChallengeCompleted >= campaignChallengeTotal;
    const campaignAllComplete = allNonChallengeCompleted && allStarsCompleted && allChallengesCompleted;
    const hasAnyCompletions = completedLevels.size > 0;

    // Gold when every level, star, and challenge is done; white otherwise.
    const headerAccentColor = campaignAllComplete ? '#f0c040' : '#ffffff';

    const header = document.createElement('div');
    header.style.cssText =
      `background:${UI_BG};border:2px solid ` + headerAccentColor + `;border-radius:8px;` +
      'padding:14px 16px;display:flex;flex-direction:column;gap:8px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:1.05rem;font-weight:bold;color:' + headerAccentColor + ';';
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
      `flex:1;height:8px;background:${EDITOR_INPUT_BG};border-radius:${RADIUS_SM};overflow:hidden;`;
    const progressFill = document.createElement('div');
    progressFill.style.cssText =
      `height:100%;width:${activeCampaign.completionPct}%;background:#7ed321;border-radius:${RADIUS_SM};` +
      'transition:width 0.3s;';
    progressBar.appendChild(progressFill);
    progressRow.appendChild(progressLabel);
    progressRow.appendChild(progressBar);

    header.appendChild(titleEl);
    header.appendChild(metaEl);
    header.appendChild(progressRow);

    if (hasAnyCompletions) {
      const statsRow = document.createElement('div');
      statsRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;font-size:0.9rem;font-weight:bold;';

      if (campaignWaterTotal > 0) {
        const waterEl = document.createElement('span');
        waterEl.style.color = '#4fc3f7';
        waterEl.textContent = `💧 ${campaignWaterTotal}`;
        statsRow.appendChild(waterEl);
      }

      if (campaignStarTotal > 0 && campaignStarCollected > 0) {
        const starEl = document.createElement('span');
        starEl.style.color = '#f0c040';
        starEl.textContent = allNonChallengeCompleted
          ? `⭐ ${campaignStarCollected}/${campaignStarTotal}`
          : `⭐ ${campaignStarCollected}`;
        statsRow.appendChild(starEl);
      }

      if (campaignChallengeTotal > 0 && campaignChallengeCompleted > 0) {
        const challengeEl = document.createElement('span');
        challengeEl.style.color = ERROR_COLOR;
        challengeEl.textContent = allNonChallengeCompleted
          ? `💀 ${campaignChallengeCompleted}/${campaignChallengeTotal}`
          : `💀 ${campaignChallengeCompleted}`;
        statsRow.appendChild(challengeEl);
      }

      if (statsRow.children.length > 0) {
        header.appendChild(statsRow);
      }
    }

    // ── Continue button ────────────────────────────────────────────────────
    // When chapter maps are available, navigate to the latest unlocked chapter map.
    // Otherwise fall back to the level-based continue behaviour.
    const continueChapterIdx = campaignHasMap
      ? 0
      : onChapterMap
      ? findContinueChapterIdx(chapters, completedLevels, completedChapters)
      : null;
    const continueId = continueChapterIdx === null
      ? findContinueLevelId(chapters, completedLevels, levelStars, completedChapters)
      : null;

    // When all chapters are mastered (every level, star, and challenge done)
    // and chapter maps are in use, replace the continue button with a
    // "Mastered!" trophy indicator that does nothing on click.
    const showMastered = onChapterMap !== undefined && campaignAllComplete;

    const continueActive = continueChapterIdx !== null || continueId !== null;
    const continueBtn = document.createElement('button');
    if (showMastered) {
      continueBtn.textContent = '🏆 Mastered!';
    } else if (campaignHasMap) {
      continueBtn.textContent = '▶ Campaign Map';
    } else if (continueChapterIdx !== null) {
      const noProgress = completedLevels.size === 0 && (!completedChapters || completedChapters.size === 0);
      continueBtn.textContent = noProgress ? '▶ Start' : `▶ Chapter ${continueChapterIdx + 1}`;
    } else {
      // Find the chapter and level number (1-based) for the level-based continue target.
      let continueChapterNum: number | null = null;
      let continueLevelNum: number | null = null;
      if (continueId !== null) {
        for (let ci = 0; ci < chapters.length; ci++) {
          const idx = chapters[ci].levels.findIndex((l) => l.id === continueId);
          if (idx !== -1) {
            continueChapterNum = ci + 1;
            continueLevelNum = idx + 1;
            break;
          }
        }
      }
      const continueLoc = (continueChapterNum !== null && continueLevelNum !== null)
        ? ` (${continueChapterNum}-${continueLevelNum})` : '';
      continueBtn.textContent = `▶ Continue${continueLoc}`;
    }
    continueBtn.disabled = !showMastered && !continueActive;
    continueBtn.style.cssText =
      `padding:8px 16px;font-size:0.95rem;font-weight:bold;border-radius:${RADIUS_MD};` +
      'border:1px solid ' + (showMastered || continueActive ? '#f0c040' : '#555') + ';' +
      'background:' + (showMastered || continueActive ? '#f0c040' : '#333') + ';' +
      'color:' + (showMastered || continueActive ? UI_BG : '#888') + ';' +
      'cursor:' + (showMastered ? 'default' : continueActive ? 'pointer' : 'default') + ';' +
      'width:100%;';
    if (!showMastered) {
      if ((campaignHasMap || continueChapterIdx !== null) && onChapterMap) {
        continueBtn.addEventListener('click', () => { sfxManager.play(SfxId.ChapterSelect); onChapterMap(continueChapterIdx ?? 0); });
      } else if (continueId !== null) {
        continueBtn.addEventListener('click', () => startLevel(continueId));
      }
    }
    header.appendChild(continueBtn);

    // Notify the caller the first time the mastered state is rendered so it
    // can fire the congratulatory sequence (confetti + modal) exactly once.
    if (showMastered) {
      onCampaignMastered?.();
    }

    // Attach the hover water-wave background animation (gold when fully complete).
    attachChapterWaveAnimation(header, campaignAllComplete);

    levelListEl.appendChild(header);
  }

  let foundLockedChapter = false;
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
    let chapterLocked: boolean;
    if (prevChapter !== null && prevChapter.grid && completedChapters !== undefined) {
      chapterLocked = !completedChapters.has(prevChapter.id);
    } else {
      chapterLocked = prevChapter !== null && prevCompletedCount < prevNonChallengeCount;
    }

    // Only show one locked chapter; hide any chapters beyond the first locked one.
    if (chapterLocked) {
      if (foundLockedChapter) break;
      foundLockedChapter = true;
    }

    const { completedInChapter, nonChallengeInChapter, nonChallengeCompleted, challengeInChapter, challengeCompleted } =
      chapter.levels.reduce(
        (acc, l) => {
          const done = completedLevels.has(l.id);
          if (done) acc.completedInChapter++;
          if (!l.challenge) {
            acc.nonChallengeInChapter++;
            if (done) acc.nonChallengeCompleted++;
          } else {
            acc.challengeInChapter++;
            if (done) acc.challengeCompleted++;
          }
          return acc;
        },
        { completedInChapter: 0, nonChallengeInChapter: 0, nonChallengeCompleted: 0, challengeInChapter: 0, challengeCompleted: 0 },
      );
    const allLevelsCompleted = nonChallengeInChapter > 0 && nonChallengeCompleted >= nonChallengeInChapter;

    // Compute star totals for this chapter
    const { total: chapterStarTotal, collected: chapterStarCollected } =
      chapterStarTotals(chapter.levels, levelStars);

    // Compute sum of water remaining for completed levels in this chapter
    const chapterWater = chapterWaterTotal(chapter.levels, completedLevels, levelWater);

    // Determine chapter completion status for color coding:
    //   Gold   – all non-challenge levels done AND all stars collected (or no stars).
    //   Indigo – all non-challenge levels done but some stars remain.
    const allStarsCollected = chapterStarTotal === 0 || chapterStarCollected >= chapterStarTotal;
    const isGold   = !chapterLocked && allLevelsCompleted && allStarsCollected;
    const isIndigo = !chapterLocked && allLevelsCompleted && !allStarsCollected;

    const borderColor = chapterLocked ? '#555' : isGold ? '#f0c040' : isIndigo ? '#5c6bc0' : '#4a90d9';
    const headerBg    = chapterLocked ? '#1e1e2e' : isGold ? '#1e1800' : isIndigo ? '#151030' : UI_BG;

    // ── Chapter container ──────────────────────────────────────────────────
    const chapterBox = document.createElement('div');
    chapterBox.classList.add('chapter-box');
    if (isGold)   chapterBox.classList.add('chapter-gold');
    if (isIndigo) chapterBox.classList.add('chapter-indigo');
    chapterBox.style.cssText =
      'border:2px solid ' + borderColor + ';' +
      'border-radius:8px;overflow:hidden;';

    // ── Chapter header (click to expand/collapse) ──────────────────────────
    const chapterHeader = document.createElement('button');
    chapterHeader.classList.add('chapter-header');
    if (chapterLocked) chapterHeader.classList.add('locked');
    chapterHeader.style.cssText =
      'width:100%;display:flex;justify-content:space-between;align-items:center;' +
      'padding:12px 16px;font-size:1rem;font-weight:bold;' +
      'background:' + headerBg + ';' +
      'color:' + (chapterLocked ? '#777' : '#eee') + ';' +
      'border:none;cursor:' + (chapterLocked ? 'default' : 'pointer') + ';' +
      'text-align:left;';

    const lockIcon = chapterLocked ? ' 🔒' : '';
    const doneIcon = allLevelsCompleted ? ' ✅' : '';
    // Water is shown as soon as any levels in the chapter are completed (running total),
    // unlike stars/skulls which are only shown once the chapter is fully done.
    const chapterWaterText = (!chapterLocked && chapterWater > 0)
      ? `  💧 ${chapterWater}` : '';
    // When chapter is fully complete and has stars, append a ⭐ X/Y tally
    const chapterStarText = (allLevelsCompleted && chapterStarTotal > 0)
      ? `  ⭐ ${chapterStarCollected}/${chapterStarTotal}` : '';
    // When chapter is fully complete and has challenge levels, append a 💀 X/Y tally
    const chapterSkullText = (allLevelsCompleted && challengeInChapter > 0)
      ? `  💀 ${challengeCompleted}/${challengeInChapter}` : '';
    const progressText = (nonChallengeInChapter > 0 && !chapterLocked)
      ? ` (${completedInChapter}/${nonChallengeInChapter}${doneIcon})${chapterWaterText}${chapterStarText}${chapterSkullText}`
      : '';
    const chapterTitle = document.createElement('span');
    chapterTitle.textContent = `Chapter ${ci + 1}: ${chapter.name}${lockIcon}${progressText}`;

    chapterHeader.appendChild(chapterTitle);

    if (!chapterLocked) {
      chapterHeader.style.cursor = 'pointer';
      if ((campaignHasMap || chapter.grid) && onChapterMap) {
        // Chapter has a map: clicking navigates to the chapter map screen
        chapterHeader.addEventListener('click', () => { sfxManager.play(SfxId.ChapterSelect); onChapterMap(ci); });
      } else {
        // Chapter has no map: show a temporary error message when clicked
        const noMapError = document.createElement('p');
        noMapError.classList.add('chapter-no-map-error');
        noMapError.style.cssText =
          'color:' + ERROR_COLOR + ';font-size:0.85rem;padding:4px 16px;margin:0;display:none;';
        noMapError.textContent = 'Error: This chapter has no map.';
        let noMapErrorTimeout: ReturnType<typeof setTimeout> | null = null;
        chapterHeader.addEventListener('click', () => {
          noMapError.style.display = '';
          if (noMapErrorTimeout !== null) clearTimeout(noMapErrorTimeout);
          noMapErrorTimeout = setTimeout(() => {
            noMapError.style.display = 'none';
            noMapErrorTimeout = null;
          }, 3000);
        });
        chapterBox.appendChild(noMapError);
      }
      attachChapterWaveAnimation(chapterHeader, isGold, chapterBox);
    } else {
      // Locked chapter: play invalid-selection sound on click.
      chapterHeader.addEventListener('click', () => { sfxManager.play(SfxId.InvalidSelection); });
    }

    chapterBox.appendChild(chapterHeader);
    levelListEl.appendChild(chapterBox);
  }

  // Campaign Editor button at the top of the controls
  const campaignEditorBtn = createButton(
    '🗺️ Campaign Editor', UI_BG, UI_GOLD,
    () => { sfxManager.play(SfxId.ChapterSelect); onCampaignEditorClick(); },
    'margin-top:8px;padding:10px 20px;width:100%;',
  );
  levelListEl.appendChild(campaignEditorBtn);

  // Game Rules button above the reset button
  const rulesBtn = createButton(
    '📋 Game Rules', UI_BG, '#7ed321',
    () => { sfxManager.play(SfxId.ChapterSelect); onRulesClick(); },
    'margin-top:8px;padding:10px 20px;width:100%;',
  );
  levelListEl.appendChild(rulesBtn);

  // Reset-progress button: hidden when no campaign is active; disabled when there is no
  // recorded progress (no completed levels and no collected stars) so it cannot be clicked.
  if (activeCampaign) {
    const hasProgress =
      completedLevels.size > 0 ||
      Object.values(levelStars).some((s) => s > 0);
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🔄 Reset Progress';
    resetBtn.disabled = !hasProgress;
    resetBtn.style.cssText =
      `margin-top:8px;padding:10px 20px;font-size:0.9rem;background:${MUTED_BTN_BG};width:100%;` +
      `border-radius:${RADIUS_MD};border:1px solid ` + (hasProgress ? ERROR_COLOR : '#555') + ';' +
      'color:' + (hasProgress ? ERROR_COLOR : '#888') + ';' +
      'cursor:' + (hasProgress ? 'pointer' : 'default') + ';';
    if (hasProgress) {
      resetBtn.addEventListener('click', () => { sfxManager.play(SfxId.ChapterSelect); onResetClick(); });
    }
    levelListEl.appendChild(resetBtn);
  }

  // Dev cheat button: mark all levels completed and unlock all chapters/levels
  const unlockAllBtn = createButton(
    '🛠️ [Dev] Unlock All', MUTED_BTN_BG, '#f39c12',
    () => { sfxManager.play(SfxId.ChapterSelect); onUnlockAllClick(); },
    'margin-top:8px;padding:10px 20px;width:100%;',
  );
  levelListEl.appendChild(unlockAllBtn);
}
