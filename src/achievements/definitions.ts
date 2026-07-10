/**
 * Static achievement definitions.
 *
 * Each entry has:
 *   id        — canonical local ID (stored in AchievementStats.unlockedIds)
 *   title     — display string for the unlock toast
 *   steamId   — API name registered in the Steam developer dashboard
 *   androidId — achievement ID from Google Play Console (starts with CgkI...)
 *   predicate — called with the triggering GameEvent and the already-updated
 *               AchievementStats; return true to unlock
 *
 * IMPORTANT: Update OFFICIAL_CAMPAIGN_ID below to match the `id` field of the
 * bundled official campaign JSON before shipping.
 */

import type { GameEvent } from '../systems/gameEventBus';
import type { AchievementStats } from './stats';

export interface AchievementDef {
  id: string;
  title: string;
  steamId?: string;
  androidId?: string;
  predicate: (event: GameEvent, stats: AchievementStats) => boolean;
}

const OFFICIAL_CAMPAIGN_ID = 'official-1'; // TODO: set to the bundled campaign's id field

export const ACHIEVEMENTS: readonly AchievementDef[] = [

  // ── First steps ───────────────────────────────────────────────────────────

  {
    id: 'first_win',
    title: 'Flow Control',
    steamId: 'FIRST_WIN',
    androidId: '',
    predicate: (e) => e.type === 'levelWon',
  },

  // ── Level-count milestones ────────────────────────────────────────────────

  {
    id: 'levels_10',
    title: 'Plumber Apprentice',
    steamId: 'LEVELS_10',
    androidId: '',
    predicate: (e, s) => e.type === 'levelWon' && s.totalLevelsWon >= 10,
  },
  {
    id: 'levels_25',
    title: 'Plumber Journeyman',
    steamId: 'LEVELS_25',
    androidId: '',
    predicate: (e, s) => e.type === 'levelWon' && s.totalLevelsWon >= 25,
  },
  {
    id: 'levels_50',
    title: 'Master Plumber',
    steamId: 'LEVELS_50',
    androidId: '',
    predicate: (e, s) => e.type === 'levelWon' && s.totalLevelsWon >= 50,
  },

  // ── Star milestones ───────────────────────────────────────────────────────

  {
    id: 'first_star',
    title: 'Star Collector',
    steamId: 'FIRST_STAR',
    androidId: '',
    predicate: (e) => e.type === 'levelWon' && e.stars >= 1,
  },
  {
    id: 'stars_10',
    title: 'Stargazer',
    steamId: 'STARS_10',
    androidId: '',
    predicate: (e, s) => e.type === 'levelWon' && s.totalStarsEarned >= 10,
  },
  {
    id: 'stars_25',
    title: 'Constellation',
    steamId: 'STARS_25',
    androidId: '',
    predicate: (e, s) => e.type === 'levelWon' && s.totalStarsEarned >= 25,
  },

  // ── Challenge levels ──────────────────────────────────────────────────────

  {
    id: 'first_challenge',
    title: 'Challenge Accepted',
    steamId: 'FIRST_CHALLENGE',
    androidId: '',
    predicate: (e) => e.type === 'levelWon' && e.isChallenge,
  },
  {
    id: 'challenges_5',
    title: 'Dare Devil',
    steamId: 'CHALLENGES_5',
    androidId: '',
    predicate: (e, s) => e.type === 'levelWon' && e.isChallenge && s.challengeLevelsWon >= 5,
  },

  // ── Official campaign chapter milestones ──────────────────────────────────
  // completedChapterId is set to the chapter's numeric id field when the level
  // that just won was the last non-challenge level needed in that chapter.

  {
    id: 'chapter_1',
    title: 'First Flow',
    steamId: 'CHAPTER_1',
    androidId: '',
    predicate: (e) =>
      e.type === 'levelWon' &&
      e.campaignId === OFFICIAL_CAMPAIGN_ID &&
      e.completedChapterId === 1,
  },
  {
    id: 'chapter_2',
    title: 'Gaining Pressure',
    steamId: 'CHAPTER_2',
    androidId: '',
    predicate: (e) =>
      e.type === 'levelWon' &&
      e.campaignId === OFFICIAL_CAMPAIGN_ID &&
      e.completedChapterId === 2,
  },
  {
    id: 'chapter_3',
    title: 'Deeper Waters',
    steamId: 'CHAPTER_3',
    androidId: '',
    predicate: (e) =>
      e.type === 'levelWon' &&
      e.campaignId === OFFICIAL_CAMPAIGN_ID &&
      e.completedChapterId === 3,
  },

  // ── Official campaign completion ──────────────────────────────────────────

  {
    id: 'campaign_complete',
    title: 'Master of Pipes',
    steamId: 'CAMPAIGN_COMPLETE',
    androidId: '',
    predicate: (e) =>
      e.type === 'levelWon' &&
      e.campaignId === OFFICIAL_CAMPAIGN_ID &&
      e.isCampaignComplete,
  },
];
