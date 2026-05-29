import { validateMapGrid } from '../src/campaignEditor/mapValidator';
import { PipeShape, TileDef } from '../src/types';

describe('validateMapGrid', () => {
  it('flags entity chambers that are missing their index field', () => {
    const grid: (TileDef | null)[][] = [[{
      shape: PipeShape.Chamber,
      chamberContent: 'chapter',
    }]];
    const result = validateMapGrid(grid, 1, 1, {
      chamberContent: 'chapter',
      entityIdxField: 'chapterIdx',
      entityCount: 1,
      entityName: (idx) => `Chapter ${idx + 1}`,
    });
    expect(result.ok).toBe(false);
    expect(result.messages).toContain('❌ chapter chamber at (0,0) is missing chapterIdx.');
    expect(result.messages).toContain('❌ Chapter 1 is not placed on the map.');
  });

  it('flags out-of-range entity indexes as invalid placements', () => {
    const grid: (TileDef | null)[][] = [[{
      shape: PipeShape.Chamber,
      chamberContent: 'chapter',
      chapterIdx: -1,
    }]];
    const result = validateMapGrid(grid, 1, 1, {
      chamberContent: 'chapter',
      entityIdxField: 'chapterIdx',
      entityCount: 1,
      entityName: (idx) => `Chapter ${idx + 1}`,
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes('invalid chapterIdx (-1)'))).toBe(true);
    expect(result.messages).toContain('❌ Chapter 1 is not placed on the map.');
  });

  it('counts in-range entity indexes as placed', () => {
    const grid: (TileDef | null)[][] = [[{
      shape: PipeShape.Chamber,
      chamberContent: 'chapter',
      chapterIdx: 0,
    }]];
    const result = validateMapGrid(grid, 1, 1, {
      chamberContent: 'chapter',
      entityIdxField: 'chapterIdx',
      entityCount: 1,
      entityName: (idx) => `Chapter ${idx + 1}`,
    });
    expect(result.messages).not.toContain('❌ Chapter 1 is not placed on the map.');
  });
});
