import { buildChapterPreviewLevelDefs } from '../src/campaignEditor/campaignMapEditor';
import { PipeShape } from '../src/types';
import type { ChapterDef } from '../src/types';

describe('buildChapterPreviewLevelDefs', () => {
  it('uses non-zero fallback map dimensions for chapters without map data', () => {
    const chapters: ChapterDef[] = [{ id: 1, name: 'Chapter 1', levels: [] }];
    const defs = buildChapterPreviewLevelDefs(chapters, 3, 6);

    expect(defs).toHaveLength(1);
    expect(defs[0].rows).toBe(3);
    expect(defs[0].cols).toBe(6);
    expect(defs[0].grid).toHaveLength(3);
    expect(defs[0].grid[0]).toHaveLength(6);
  });

  it('infers dimensions from existing grid when rows/cols are missing', () => {
    const chapters: ChapterDef[] = [{
      id: 2,
      name: 'Chapter 2',
      levels: [],
      grid: [[{ shape: PipeShape.Source, connections: [] }, null], [null, null]],
    }];

    const defs = buildChapterPreviewLevelDefs(chapters, 3, 6);

    expect(defs[0].rows).toBe(2);
    expect(defs[0].cols).toBe(2);
    expect(defs[0].grid).toBe(chapters[0].grid);
  });
});
