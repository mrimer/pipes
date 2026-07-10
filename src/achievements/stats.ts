import { getActiveSlotPrefix } from '../profile/activeProfile';

export interface AchievementStats {
  totalLevelsWon: number;
  totalStarsEarned: number;
  totalWaterSaved: number;
  challengeLevelsWon: number;
  unlockedIds: string[];
}

function key(): string {
  return `pipes_${getActiveSlotPrefix()}achievement_stats`;
}

export function loadAchievementStats(): AchievementStats {
  try {
    const raw = localStorage.getItem(key());
    if (raw) {
      const p = JSON.parse(raw) as Partial<AchievementStats>;
      return {
        totalLevelsWon:     p.totalLevelsWon     ?? 0,
        totalStarsEarned:   p.totalStarsEarned   ?? 0,
        totalWaterSaved:    p.totalWaterSaved     ?? 0,
        challengeLevelsWon: p.challengeLevelsWon ?? 0,
        unlockedIds:        Array.isArray(p.unlockedIds) ? p.unlockedIds : [],
      };
    }
  } catch { /* ignore */ }
  return { totalLevelsWon: 0, totalStarsEarned: 0, totalWaterSaved: 0, challengeLevelsWon: 0, unlockedIds: [] };
}

export function saveAchievementStats(stats: AchievementStats): void {
  try {
    localStorage.setItem(key(), JSON.stringify(stats));
  } catch { /* ignore */ }
}

/** Remove all persisted achievement stats for the active slot (e.g. on progress reset). */
export function clearAchievementStats(): void {
  try {
    localStorage.removeItem(key());
  } catch { /* ignore */ }
}
