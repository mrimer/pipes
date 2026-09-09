/**
 * @jest-environment jsdom
 */

import {
  loadImportedCampaigns,
  saveImportedCampaigns,
  loadCampaignProgress,
  markCampaignLevelCompleted,
  clearCampaignProgress,
  migrateCampaign,
} from '../../src/persistence';
import type { CampaignDef } from '../../src/types';
import { PipeShape } from '../../src/types';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
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

  it('loadImportedCampaigns drops invalid entries from parsed storage array', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(
      'pipes_campaigns',
      JSON.stringify([
        { id: 'ok', name: 'Valid Campaign', author: 'A', chapters: [] },
        { id: 123, name: 'Bad Campaign', chapters: [] },
      ]),
    );

    const loaded = loadImportedCampaigns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('ok');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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

// ─── migrateCampaign – backwards compatibility: weak_ice → snow ───────────────

describe('migrateCampaign', () => {
  /** Build a minimal campaign with one tile whose chamberContent is set to the given string. */
  function campaignWithContent(content: string): CampaignDef {
    return {
      id: 'cmp_migrate_test',
      name: 'Migrate Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 1,
          name: 'Level 1',
          rows: 1,
          cols: 2,
          grid: [
            [
              { shape: PipeShape.Chamber, chamberContent: content as never },
              null,
            ],
          ],
          inventory: [],
        }],
      }],
    };
  }

  it('converts chamberContent weak_ice → snow', () => {
    const campaign = campaignWithContent('weak_ice');
    const migrated = migrateCampaign(campaign);
    expect(migrated.chapters[0].levels[0].grid[0][0]?.chamberContent).toBe('snow');
  });

  it('leaves other chamberContent values unchanged', () => {
    for (const content of ['ice', 'tank', 'dirt', 'heater', 'pump', 'sandstone', 'star', 'snow']) {
      const campaign = campaignWithContent(content);
      const migrated = migrateCampaign(campaign);
      expect(migrated.chapters[0].levels[0].grid[0][0]?.chamberContent).toBe(content);
    }
  });

  it('handles null grid cells without error', () => {
    const campaign = campaignWithContent('snow');
    campaign.chapters[0].levels[0].grid[0][1] = null;
    expect(() => migrateCampaign(campaign)).not.toThrow();
  });

  it('returns the same campaign object (mutates in place)', () => {
    const campaign = campaignWithContent('weak_ice');
    const result = migrateCampaign(campaign);
    expect(result).toBe(campaign);
  });

  it('migrates legacy hint string to hints array', () => {
    const campaign: CampaignDef = {
      id: 'cmp_hint_test',
      name: 'Hint Test',
      author: 'Tester',
      chapters: [{
        id: 1, name: 'Ch 1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[null]],
          inventory: [],
        }],
      }],
    };
    // Inject the deprecated field via a cast (it's no longer in LevelDef).
    (campaign.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint'] = 'A legacy hint.';
    const migrated = migrateCampaign(campaign);
    expect(migrated.chapters[0].levels[0].hints).toEqual(['A legacy hint.']);
    expect((migrated.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint']).toBeUndefined();
  });

  it('does not overwrite existing hints when hint is also present', () => {
    const campaign: CampaignDef = {
      id: 'cmp_hint_test2',
      name: 'Hint Test 2',
      author: 'Tester',
      chapters: [{
        id: 1, name: 'Ch 1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[null]],
          inventory: [],
          hints: ['Existing hint.'],
        }],
      }],
    };
    (campaign.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint'] = 'Old hint.';
    const migrated = migrateCampaign(campaign);
    // hints should be preserved; old hint deleted
    expect(migrated.chapters[0].levels[0].hints).toEqual(['Existing hint.']);
    expect((migrated.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint']).toBeUndefined();
  });
});

// ─── loadImportedCampaigns – applies weak_ice → snow migration ───────────────

describe('loadImportedCampaigns – weak_ice migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates weak_ice tiles in campaigns loaded from localStorage', () => {
    // Write old-format data directly to localStorage (bypassing saveImportedCampaigns)
    const oldCampaign = {
      id: 'cmp_old',
      name: 'Old Campaign',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 1,
          name: 'Level 1',
          rows: 1,
          cols: 1,
          grid: [[{ shape: 'CHAMBER', chamberContent: 'weak_ice', cost: 3, temperature: 5 }]],
          inventory: [],
        }],
      }],
    };
    localStorage.setItem('pipes_campaigns', JSON.stringify([oldCampaign]));

    const loaded = loadImportedCampaigns();
    expect(loaded[0].chapters[0].levels[0].grid[0][0]?.chamberContent).toBe('snow');
  });
});

