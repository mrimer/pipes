/** Helpers for persisting long-term player progress in localStorage. */

import { CampaignDef } from './types';

const STORAGE_KEY = 'pipes_completed';

/** Load the set of completed level IDs from localStorage. */
export function loadCompletedLevels(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as number[];
      return new Set(ids);
    }
  } catch {
    // ignore parse errors
  }
  return new Set<number>();
}

/** Persist a newly-completed level and return the updated set. */
export function markLevelCompleted(completedLevels: Set<number>, levelId: number): void {
  completedLevels.add(levelId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completedLevels]));
  } catch {
    // ignore storage errors
  }
}

/** Clear all level-completion data from both memory and localStorage. */
export function clearCompletedLevels(completedLevels: Set<number>): void {
  completedLevels.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

/** Mark every level in allLevelIds as completed and persist the full set. */
export function markAllLevelsCompleted(completedLevels: Set<number>, allLevelIds: number[]): void {
  for (const id of allLevelIds) {
    completedLevels.add(id);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completedLevels]));
  } catch {
    // ignore storage errors
  }
}

// ─── Campaign persistence ────────────────────────────────────────────────────

const CAMPAIGNS_STORAGE_KEY = 'pipes_campaigns';

/** Load user-created and imported campaigns from localStorage. */
export function loadImportedCampaigns(): CampaignDef[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as CampaignDef[];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

/** Save the full list of user campaigns to localStorage. */
export function saveImportedCampaigns(campaigns: CampaignDef[]): void {
  try {
    localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
  } catch {
    // ignore storage errors
  }
}

// ─── Per-campaign progress ────────────────────────────────────────────────────

function campaignProgressKey(campaignId: string): string {
  return `pipes_campaign_progress_${campaignId}`;
}

/** Load the set of completed level IDs for a specific campaign. */
export function loadCampaignProgress(campaignId: string): Set<number> {
  try {
    const raw = localStorage.getItem(campaignProgressKey(campaignId));
    if (raw) {
      const ids = JSON.parse(raw) as number[];
      return new Set(ids);
    }
  } catch {
    // ignore parse errors
  }
  return new Set<number>();
}

/** Mark a level as completed in a campaign and persist the progress. */
export function markCampaignLevelCompleted(campaignId: string, levelId: number, progress: Set<number>): void {
  progress.add(levelId);
  try {
    localStorage.setItem(campaignProgressKey(campaignId), JSON.stringify([...progress]));
  } catch {
    // ignore storage errors
  }
}

/** Clear all completion progress for a specific campaign. */
export function clearCampaignProgress(campaignId: string, progress: Set<number>): void {
  progress.clear();
  try {
    localStorage.removeItem(campaignProgressKey(campaignId));
  } catch {
    // ignore storage errors
  }
}
