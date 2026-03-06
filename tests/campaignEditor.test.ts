/**
 * @jest-environment jsdom
 */

/**
 * Tests for the CampaignEditor and related persistence helpers.
 */

import { loadImportedCampaigns, saveImportedCampaigns, loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress } from '../src/persistence';
import { OFFICIAL_CAMPAIGN } from '../src/campaignEditor';
import { CampaignDef } from '../src/types';

// ─── Persistence helpers ──────────────────────────────────────────────────────

describe('Campaign persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadImportedCampaigns returns empty array when nothing is stored', () => {
    expect(loadImportedCampaigns()).toEqual([]);
  });

  it('saveImportedCampaigns and loadImportedCampaigns round-trip correctly', () => {
    const campaigns: CampaignDef[] = [
      { id: 'test1', name: 'Test Campaign', author: 'Tester', chapters: [] },
    ];
    saveImportedCampaigns(campaigns);
    expect(loadImportedCampaigns()).toEqual(campaigns);
  });

  it('loadImportedCampaigns handles corrupted storage gracefully', () => {
    localStorage.setItem('pipes_campaigns', 'not-json');
    expect(loadImportedCampaigns()).toEqual([]);
  });

  it('loadCampaignProgress returns empty set when nothing is stored', () => {
    expect(loadCampaignProgress('cmp_test').size).toBe(0);
  });

  it('markCampaignLevelCompleted persists completion', () => {
    const progress = loadCampaignProgress('cmp_test');
    markCampaignLevelCompleted('cmp_test', 42, progress);
    expect(progress.has(42)).toBe(true);

    // Reload from storage
    const reloaded = loadCampaignProgress('cmp_test');
    expect(reloaded.has(42)).toBe(true);
  });

  it('clearCampaignProgress removes all completions', () => {
    const progress = loadCampaignProgress('cmp_test');
    markCampaignLevelCompleted('cmp_test', 1, progress);
    markCampaignLevelCompleted('cmp_test', 2, progress);
    clearCampaignProgress('cmp_test', progress);
    expect(progress.size).toBe(0);
    expect(loadCampaignProgress('cmp_test').size).toBe(0);
  });

  it('different campaign IDs have independent progress', () => {
    const p1 = loadCampaignProgress('cmp_a');
    const p2 = loadCampaignProgress('cmp_b');
    markCampaignLevelCompleted('cmp_a', 10, p1);
    expect(p1.has(10)).toBe(true);
    expect(p2.has(10)).toBe(false);
    expect(loadCampaignProgress('cmp_b').has(10)).toBe(false);
  });
});

// ─── OFFICIAL_CAMPAIGN ────────────────────────────────────────────────────────

describe('OFFICIAL_CAMPAIGN', () => {
  it('has id "official"', () => {
    expect(OFFICIAL_CAMPAIGN.id).toBe('official');
  });

  it('has a non-empty name and author', () => {
    expect(OFFICIAL_CAMPAIGN.name.length).toBeGreaterThan(0);
    expect(OFFICIAL_CAMPAIGN.author.length).toBeGreaterThan(0);
  });

  it('contains at least one chapter', () => {
    expect(OFFICIAL_CAMPAIGN.chapters.length).toBeGreaterThan(0);
  });

  it('has at least one level across all chapters', () => {
    const total = OFFICIAL_CAMPAIGN.chapters.reduce((n, ch) => n + ch.levels.length, 0);
    expect(total).toBeGreaterThan(0);
  });
});
