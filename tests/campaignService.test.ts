/**
 * @jest-environment jsdom
 */

/**
 * Tests for CampaignService – pure data-operations service.
 */

import { saveImportedCampaigns, loadImportedCampaigns } from '../src/persistence';
import { CampaignService, ImportResult } from '../src/campaignEditor';
import { CampaignDef, LevelDef, PipeShape, TileDef } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeService(campaigns: CampaignDef[] = []): CampaignService {
  // Save to localStorage so persistence tests can read back via loadImportedCampaigns().
  // Pass the same array reference to CampaignService so mutations on the campaign
  // objects are visible through both the test variable and the service's internal list.
  saveImportedCampaigns(campaigns);
  return new CampaignService(campaigns);
}

function emptyCampaign(id = 'cmp_test', name = 'Test Campaign'): CampaignDef {
  return { id, name, author: 'Tester', chapters: [] };
}

function campaignWithChapter(): CampaignDef {
  return {
    id: 'cmp_ch',
    name: 'Campaign',
    author: 'A',
    chapters: [
      {
        id: 1,
        name: 'Chapter 1',
        levels: [
          {
            id: 101,
            name: 'Level 1',
            rows: 2,
            cols: 2,
            grid: [[null, null], [null, null]],
            inventory: [],
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('CampaignService – constructor', () => {
  it('loads campaigns from storage by default', () => {
    const stored: CampaignDef[] = [emptyCampaign()];
    saveImportedCampaigns(stored);
    const svc = new CampaignService();
    expect(svc.campaigns).toHaveLength(1);
    expect(svc.campaigns[0].id).toBe('cmp_test');
  });

  it('uses provided campaigns array instead of reading from storage', () => {
    const provided: CampaignDef[] = [emptyCampaign('cmp_provided')];
    const svc = new CampaignService(provided);
    expect(svc.campaigns).toHaveLength(1);
    expect(svc.campaigns[0].id).toBe('cmp_provided');
  });
});

// ─── campaigns getter ─────────────────────────────────────────────────────────

describe('CampaignService – campaigns / getAllCampaigns / getCampaign', () => {
  it('campaigns returns a readonly view of the list', () => {
    const svc = makeService([emptyCampaign()]);
    expect(svc.campaigns).toHaveLength(1);
  });

  it('getAllCampaigns returns a shallow copy', () => {
    const svc = makeService([emptyCampaign()]);
    const all = svc.getAllCampaigns();
    expect(all).toHaveLength(1);
    // Should be a copy, not the same array reference
    expect(all).not.toBe(svc.campaigns);
  });

  it('getCampaign finds by ID', () => {
    const svc = makeService([emptyCampaign('cmp_a'), emptyCampaign('cmp_b')]);
    expect(svc.getCampaign('cmp_b')?.id).toBe('cmp_b');
  });

  it('getCampaign returns null for unknown ID', () => {
    const svc = makeService([emptyCampaign()]);
    expect(svc.getCampaign('missing')).toBeNull();
  });
});

// ─── ensureCampaignMaps ────────────────────────────────────────────────────────

describe('CampaignService – ensureCampaignMaps', () => {
  it('adds a default map when map fields are missing', () => {
    const campaign = emptyCampaign('cmp_missing_map');
    const svc = makeService([campaign]);

    const changed = svc.ensureCampaignMaps();

    expect(changed).toBe(true);
    expect(campaign.rows).toBe(3);
    expect(campaign.cols).toBe(6);
    expect(campaign.grid).toHaveLength(3);
    expect(campaign.grid?.[1][0]?.shape).toBe(PipeShape.Source);
    expect(campaign.grid?.[1][5]?.shape).toBe(PipeShape.Sink);
  });

  it('replaces structurally invalid campaign maps with a default map', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign('cmp_invalid_map'),
      rows: 3,
      cols: 6,
      grid: [],
    };
    const svc = makeService([campaign]);

    const changed = svc.ensureCampaignMaps();

    expect(changed).toBe(true);
    expect(campaign.grid).toHaveLength(3);
    expect(campaign.grid?.every((row) => row.length === 6)).toBe(true);
    expect(campaign.grid?.[1][0]?.shape).toBe(PipeShape.Source);
    expect(campaign.grid?.[1][5]?.shape).toBe(PipeShape.Sink);
  });

  it('does not modify campaigns that already have a valid campaign map', () => {
    const grid: (TileDef | null)[][] = Array.from({ length: 3 }, () => Array(6).fill(null) as null[]);
    grid[1][0] = { shape: PipeShape.Source };
    grid[1][5] = { shape: PipeShape.Sink };
    const campaign: CampaignDef = {
      ...emptyCampaign('cmp_valid_map'),
      rows: 3,
      cols: 6,
      grid,
      lastUpdated: '2020-01-01T00:00:00.000Z',
    };
    const svc = makeService([campaign]);

    const changed = svc.ensureCampaignMaps();

    expect(changed).toBe(false);
    expect(campaign.grid).toBe(grid);
    expect(campaign.lastUpdated).toBe('2020-01-01T00:00:00.000Z');
  });
});

// ─── reload ───────────────────────────────────────────────────────────────────

describe('CampaignService – reload', () => {
  it('re-reads campaigns from storage', () => {
    const svc = makeService([]);
    // Write a new campaign to storage externally
    saveImportedCampaigns([emptyCampaign('cmp_new')]);
    svc.reload();
    expect(svc.getCampaign('cmp_new')).not.toBeNull();
  });
});

// ─── createCampaign ───────────────────────────────────────────────────────────

describe('CampaignService – createCampaign', () => {
  it('returns a new campaign with the given name and author', () => {
    const svc = makeService();
    const c = svc.createCampaign('  My Campaign  ', '  Alice  ');
    expect(c.name).toBe('My Campaign');
    expect(c.author).toBe('Alice');
  });

  it('assigns a unique ID', () => {
    const svc = makeService();
    const c1 = svc.createCampaign('A', '');
    const c2 = svc.createCampaign('B', '');
    expect(c1.id).not.toBe(c2.id);
  });

  it('sets lastUpdated on creation', () => {
    const before = Date.now();
    const svc = makeService();
    const c = svc.createCampaign('X', '');
    expect(c.lastUpdated).toBeDefined();
    expect(new Date(c.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('persists the new campaign to storage', () => {
    const svc = makeService();
    svc.createCampaign('Saved', '');
    const stored = loadImportedCampaigns();
    expect(stored.some((c) => c.name === 'Saved')).toBe(true);
  });
});

// ─── deleteCampaign ───────────────────────────────────────────────────────────

describe('CampaignService – deleteCampaign', () => {
  it('removes the campaign from the list', () => {
    const svc = makeService([emptyCampaign('cmp_del')]);
    svc.deleteCampaign('cmp_del');
    expect(svc.getCampaign('cmp_del')).toBeNull();
  });

  it('persists the deletion', () => {
    const svc = makeService([emptyCampaign('cmp_del')]);
    svc.deleteCampaign('cmp_del');
    expect(loadImportedCampaigns().some((c) => c.id === 'cmp_del')).toBe(false);
  });

  it('is a no-op for an unknown ID', () => {
    const svc = makeService([emptyCampaign()]);
    expect(() => svc.deleteCampaign('nonexistent')).not.toThrow();
    expect(svc.campaigns).toHaveLength(1);
  });
});

// ─── updateCampaignField ──────────────────────────────────────────────────────

describe('CampaignService – updateCampaignField', () => {
  it('updates name and persists', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'name', 'New Name');
    expect(campaign.name).toBe('New Name');
    expect(loadImportedCampaigns()[0].name).toBe('New Name');
  });

  it('updates author and persists', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'author', 'Bob');
    expect(campaign.author).toBe('Bob');
    expect(loadImportedCampaigns()[0].author).toBe('Bob');
  });

  it('sets official=true when passed true', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'official', true);
    expect(campaign.official).toBe(true);
  });

  it('removes official flag when passed false', () => {
    const campaign: CampaignDef = { ...emptyCampaign(), official: true };
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'official', false);
    expect(campaign.official).toBeUndefined();
  });

  it('touches lastUpdated', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const campaign: CampaignDef = { ...emptyCampaign(), lastUpdated: old };
    const svc = makeService([campaign]);
    const before = Date.now();
    svc.updateCampaignField(campaign, 'name', 'Changed');
    expect(new Date(campaign.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ─── touch ────────────────────────────────────────────────────────────────────

describe('CampaignService – touch', () => {
  it('sets lastUpdated to the current time', () => {
    const campaign = emptyCampaign();
    const svc = new CampaignService([campaign]);
    const before = Date.now();
    svc.touch(campaign);
    expect(new Date(campaign.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ─── save ─────────────────────────────────────────────────────────────────────

describe('CampaignService – save', () => {
  it('writes the current list to storage', () => {
    const svc = new CampaignService([emptyCampaign('cmp_s1')]);
    svc.save();
    expect(loadImportedCampaigns()[0].id).toBe('cmp_s1');
  });
});

// ─── addChapter ───────────────────────────────────────────────────────────────

describe('CampaignService – addChapter', () => {
  it('appends a chapter to the campaign', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    const ch = svc.addChapter(campaign, 'Act 1');
    expect(campaign.chapters).toHaveLength(1);
    expect(ch.name).toBe('Act 1');
  });

  it('assigns a monotonically increasing id', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    const ch1 = svc.addChapter(campaign, 'A');
    const ch2 = svc.addChapter(campaign, 'B');
    expect(ch2.id).toBeGreaterThan(ch1.id);
  });

  it('trims whitespace from the name', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    const ch = svc.addChapter(campaign, '  Spaces  ');
    expect(ch.name).toBe('Spaces');
  });

  it('persists the change', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.addChapter(campaign, 'Persisted Chapter');
    const stored = loadImportedCampaigns()[0];
    expect(stored.chapters[0].name).toBe('Persisted Chapter');
  });
});

// ─── deleteChapter ────────────────────────────────────────────────────────────

describe('CampaignService – deleteChapter', () => {
  it('removes the chapter at the given index', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteChapter(campaign, 0);
    expect(campaign.chapters).toHaveLength(0);
  });

  it('persists the deletion', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteChapter(campaign, 0);
    expect(loadImportedCampaigns()[0].chapters).toHaveLength(0);
  });
});

// ─── renameChapter ────────────────────────────────────────────────────────────

describe('CampaignService – renameChapter', () => {
  it('renames the chapter', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.renameChapter(campaign, 0, 'Renamed');
    expect(campaign.chapters[0].name).toBe('Renamed');
  });

  it('is a no-op for invalid index', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    expect(() => svc.renameChapter(campaign, 99, 'X')).not.toThrow();
  });

  it('persists the change', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.renameChapter(campaign, 0, 'Stored Name');
    expect(loadImportedCampaigns()[0].chapters[0].name).toBe('Stored Name');
  });
});

// ─── reorderChapters ─────────────────────────────────────────────────────────

describe('CampaignService – reorderChapters', () => {
  it('moves a chapter from one position to another', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [
        { id: 1, name: 'A', levels: [] },
        { id: 2, name: 'B', levels: [] },
        { id: 3, name: 'C', levels: [] },
      ],
    };
    const svc = makeService([campaign]);
    svc.reorderChapters(campaign, 0, 2); // move A to position 2
    expect(campaign.chapters.map((c) => c.name)).toEqual(['B', 'C', 'A']);
  });

  it('is a no-op for out-of-range indices', () => {
    const campaign: CampaignDef = { ...emptyCampaign(), chapters: [{ id: 1, name: 'A', levels: [] }] };
    const svc = makeService([campaign]);
    expect(() => svc.reorderChapters(campaign, 0, 5)).not.toThrow();
    expect(campaign.chapters[0].name).toBe('A');
  });
});

// ─── addLevel ─────────────────────────────────────────────────────────────────

describe('CampaignService – addLevel', () => {
  it('appends a level to the chapter', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const lv = svc.addLevel(campaign, 0, 'New Level');
    expect(campaign.chapters[0].levels).toHaveLength(2);
    expect(lv.name).toBe('New Level');
  });

  it('creates a 6×6 blank grid', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const lv = svc.addLevel(campaign, 0, 'Grid Test');
    expect(lv.rows).toBe(6);
    expect(lv.cols).toBe(6);
    expect(lv.grid).toHaveLength(6);
  });

  it('assigns a unique id', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const l1 = svc.addLevel(campaign, 0, 'A');
    const l2 = svc.addLevel(campaign, 0, 'B');
    expect(l1.id).not.toBe(l2.id);
  });

  it('throws for an invalid chapter index', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    expect(() => svc.addLevel(campaign, 0, 'X')).toThrow();
  });
});

// ─── deleteLevel ──────────────────────────────────────────────────────────────

describe('CampaignService – deleteLevel', () => {
  it('removes the level at the given index', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteLevel(campaign, 0, 0);
    expect(campaign.chapters[0].levels).toHaveLength(0);
  });

  it('persists the change', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteLevel(campaign, 0, 0);
    expect(loadImportedCampaigns()[0].chapters[0].levels).toHaveLength(0);
  });
});

// ─── duplicateLevel ───────────────────────────────────────────────────────────

describe('CampaignService – duplicateLevel', () => {
  it('inserts a copy after the original', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const copy = svc.duplicateLevel(campaign, 0, 0);
    expect(campaign.chapters[0].levels).toHaveLength(2);
    expect(campaign.chapters[0].levels[1]).toBe(copy);
  });

  it('gives the copy a different ID', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const original = campaign.chapters[0].levels[0];
    const copy = svc.duplicateLevel(campaign, 0, 0);
    expect(copy.id).not.toBe(original.id);
  });

  it('appends " (copy)" to the name', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const copy = svc.duplicateLevel(campaign, 0, 0);
    expect(copy.name).toBe('Level 1 (copy)');
  });
});

// ─── moveLevel ────────────────────────────────────────────────────────────────

describe('CampaignService – moveLevel', () => {
  it('moves a level to another chapter', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [
        { id: 1, name: 'A', levels: [{ id: 10, name: 'Lv1', rows: 2, cols: 2, grid: [[null, null], [null, null]], inventory: [] }] },
        { id: 2, name: 'B', levels: [] },
      ],
    };
    const svc = makeService([campaign]);
    svc.moveLevel(campaign, 0, 0, 1, 0);
    expect(campaign.chapters[0].levels).toHaveLength(0);
    expect(campaign.chapters[1].levels).toHaveLength(1);
    expect(campaign.chapters[1].levels[0].name).toBe('Lv1');
  });

  it('is a no-op for invalid chapter indices', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    expect(() => svc.moveLevel(campaign, 0, 0, 99, 0)).not.toThrow();
  });
});

// ─── saveLevel ────────────────────────────────────────────────────────────────

describe('CampaignService – saveLevel', () => {
  it('replaces an existing level in-place', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const updated: LevelDef = {
      id: 101,
      name: 'Updated',
      rows: 3,
      cols: 3,
      grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
      inventory: [],
    };
    svc.saveLevel(campaign, 0, 0, updated);
    expect(campaign.chapters[0].levels[0].name).toBe('Updated');
  });

  it('touches the campaign timestamp', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const campaign = { ...campaignWithChapter(), lastUpdated: old };
    const svc = makeService([campaign]);
    const before = Date.now();
    svc.saveLevel(campaign, 0, 0, campaign.chapters[0].levels[0]);
    expect(new Date(campaign.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('persists the change', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const updated: LevelDef = { ...campaign.chapters[0].levels[0], name: 'Persisted' };
    svc.saveLevel(campaign, 0, 0, updated);
    expect(loadImportedCampaigns()[0].chapters[0].levels[0].name).toBe('Persisted');
  });
});

// ─── reorderLevels ───────────────────────────────────────────────────────────

describe('CampaignService – reorderLevels', () => {
  it('moves a level within the chapter', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 3, name: 'C', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 2); // move A to position 2
    expect(campaign.chapters[0].levels.map((l) => l.name)).toEqual(['B', 'C', 'A']);
  });

  it('updates chapter.grid levelIdx references on adjacent swap (move down)', () => {
    const levelTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'level',
      levelIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
        grid: [[levelTile(0), levelTile(1)]],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 1); // swap A↔B
    const grid = campaign.chapters[0].grid!;
    expect((grid[0][0] as TileDef).levelIdx).toBe(1); // was 0 (A), now points to B's new position
    expect((grid[0][1] as TileDef).levelIdx).toBe(0); // was 1 (B), now points to A's new position
  });

  it('updates chapter.grid levelIdx references on non-adjacent move', () => {
    const levelTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'level',
      levelIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 3, name: 'C', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
        grid: [[levelTile(0), levelTile(1), levelTile(2)]],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 2); // move A (idx 0) to position 2 → [B, C, A]
    const grid = campaign.chapters[0].grid!;
    expect((grid[0][0] as TileDef).levelIdx).toBe(2); // was 0 (A), now at position 2
    expect((grid[0][1] as TileDef).levelIdx).toBe(0); // was 1 (B), shifted left to 0
    expect((grid[0][2] as TileDef).levelIdx).toBe(1); // was 2 (C), shifted left to 1
  });

  it('does not touch levelIdx on tiles without chamberContent=level', () => {
    const otherTile: TileDef = {
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'tank',
    };
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
        grid: [[otherTile]],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 1);
    expect((campaign.chapters[0].grid![0][0] as TileDef).levelIdx).toBeUndefined();
  });
});

// ─── exportToJson ─────────────────────────────────────────────────────────────

describe('CampaignService – exportToJson', () => {
  it('returns valid JSON that round-trips the campaign', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const json = svc.exportToJson(campaign);
    const parsed = JSON.parse(json) as CampaignDef;
    expect(parsed.id).toBe(campaign.id);
    expect(parsed.chapters[0].levels[0].name).toBe('Level 1');
  });

  it('strips unrecognized fields from the output', () => {
    const campaign = campaignWithChapter();
    // Inject an unknown field
    (campaign as unknown as Record<string, unknown>)['unknownField'] = 'surprise';
    const svc = makeService([campaign]);
    const json = svc.exportToJson(campaign);
    expect(json).not.toContain('unknownField');
  });
});

// ─── parseImport ─────────────────────────────────────────────────────────────

describe('CampaignService – parseImport', () => {
  it('returns conflict=none for a brand-new campaign', () => {
    const svc = makeService();
    const result = svc.parseImport(JSON.stringify(emptyCampaign('cmp_brand_new')));
    expect(result.conflict).toBe('none');
    expect(result.campaign.id).toBe('cmp_brand_new');
  });

  it('returns conflict=same_version when timestamps match', () => {
    const ts = '2024-06-01T12:00:00.000Z';
    const existing: CampaignDef = { ...emptyCampaign('cmp_sv'), lastUpdated: ts };
    const svc = makeService([existing]);
    const result = svc.parseImport(JSON.stringify({ ...existing }));
    expect(result.conflict).toBe('same_version');
    expect(result.existing).toBeDefined();
  });

  it('returns conflict=version_conflict with isNewer=true when import is newer', () => {
    const existing: CampaignDef = { ...emptyCampaign('cmp_vc'), lastUpdated: '2024-01-01T00:00:00.000Z' };
    const svc = makeService([existing]);
    const result = svc.parseImport(JSON.stringify({ ...existing, lastUpdated: '2024-06-01T00:00:00.000Z' }));
    expect(result.conflict).toBe('version_conflict');
    expect(result.isNewer).toBe(true);
  });

  it('returns conflict=version_conflict with isNewer=false when import is older', () => {
    const existing: CampaignDef = { ...emptyCampaign('cmp_old'), lastUpdated: '2024-06-01T00:00:00.000Z' };
    const svc = makeService([existing]);
    const result = svc.parseImport(JSON.stringify({ ...existing, lastUpdated: '2024-01-01T00:00:00.000Z' }));
    expect(result.conflict).toBe('version_conflict');
    expect(result.isNewer).toBe(false);
  });

  it('throws for invalid JSON', () => {
    const svc = makeService();
    expect(() => svc.parseImport('not-json')).toThrow();
  });

  it('throws for a campaign with missing required fields', () => {
    const svc = makeService();
    expect(() => svc.parseImport(JSON.stringify({ id: 'x', name: 'X' }))).toThrow();
  });

  it('strips the official flag on import', () => {
    const campaign: CampaignDef = { ...emptyCampaign('cmp_official_strip'), official: true };
    const svc = makeService();
    const result = svc.parseImport(JSON.stringify(campaign));
    expect(result.campaign.official).toBeUndefined();
  });

  it('reassigns the ID when the imported campaign uses "official"', () => {
    const campaign: CampaignDef = { ...emptyCampaign('official') };
    const svc = makeService();
    const result = svc.parseImport(JSON.stringify(campaign));
    expect(result.campaign.id).not.toBe('official');
  });
});

// ─── acceptImport ─────────────────────────────────────────────────────────────

describe('CampaignService – acceptImport', () => {
  it('adds a new campaign when conflict=none', () => {
    const svc = makeService();
    const result: ImportResult = { campaign: emptyCampaign('cmp_new'), conflict: 'none' };
    svc.acceptImport(result);
    expect(svc.getCampaign('cmp_new')).not.toBeNull();
  });

  it('replaces an existing campaign when conflict=version_conflict', () => {
    const existing: CampaignDef = { ...emptyCampaign('cmp_replace'), chapters: [{ id: 1, name: 'Old', levels: [] }] };
    const svc = makeService([existing]);
    const incoming: CampaignDef = { ...emptyCampaign('cmp_replace'), chapters: [{ id: 1, name: 'New', levels: [] }] };
    const result: ImportResult = { campaign: incoming, conflict: 'version_conflict', existing, isNewer: true };
    svc.acceptImport(result);
    expect(svc.campaigns).toHaveLength(1);
    expect(svc.getCampaign('cmp_replace')!.chapters[0].name).toBe('New');
  });

  it('persists after accept', () => {
    const svc = makeService();
    const result: ImportResult = { campaign: emptyCampaign('cmp_persist'), conflict: 'none' };
    svc.acceptImport(result);
    expect(loadImportedCampaigns().some((c) => c.id === 'cmp_persist')).toBe(true);
  });
});

// ─── scanData ─────────────────────────────────────────────────────────────────

describe('CampaignService – scanData', () => {
  it('detects unrecognized campaign-level fields', () => {
    const campaign = emptyCampaign();
    (campaign as unknown as Record<string, unknown>)['badField'] = 1;
    const svc = new CampaignService([campaign]);
    const issues = svc.scanData(campaign, true);
    expect(issues.get('Campaign')?.has('badField')).toBe(true);
  });

  it('removes unrecognized fields when dryRun=false', () => {
    const campaign = emptyCampaign();
    (campaign as unknown as Record<string, unknown>)['badField'] = 1;
    const svc = new CampaignService([campaign]);
    svc.scanData(campaign, false);
    expect((campaign as unknown as Record<string, unknown>)['badField']).toBeUndefined();
  });

  it('does not modify data when dryRun=true', () => {
    const campaign = emptyCampaign();
    (campaign as unknown as Record<string, unknown>)['badField'] = 1;
    const svc = new CampaignService([campaign]);
    svc.scanData(campaign, true);
    expect((campaign as unknown as Record<string, unknown>)['badField']).toBe(1);
  });

  it('detects unrecognized tile fields on level grid tiles', () => {
    const campaign = campaignWithChapter();
    const tile = { shape: PipeShape.Straight, unknownTileField: 'oops' };
    campaign.chapters[0].levels[0].grid[0][0] = tile as unknown as import('../src/types').TileDef;
    const svc = new CampaignService([campaign]);
    const issues = svc.scanData(campaign, true);
    expect(issues.get('Tile')?.has('unknownTileField')).toBe(true);
  });
});
