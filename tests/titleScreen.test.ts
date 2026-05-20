import { buildTitleGlyphLayout } from '../src/titleScreen';
import { PipeShape } from '../src/types';

describe('buildTitleGlyphLayout', () => {
  test('builds COOL PIPES with connected pipe-only glyph cells', () => {
    const layout = buildTitleGlyphLayout();

    expect(layout.letterCount).toBe(9);
    expect(layout.rows).toBe(7);
    expect(layout.cols).toBeGreaterThan(0);
    expect(layout.cells.length).toBeGreaterThan(0);

    for (const cell of layout.cells) {
      expect(cell.directions.size).toBeGreaterThan(0);
      expect([
        PipeShape.Straight,
        PipeShape.Elbow,
        PipeShape.Tee,
        PipeShape.Cross,
      ]).toContain(cell.shape);
    }
  });
});
