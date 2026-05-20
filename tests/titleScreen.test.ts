import { buildTitleGlyphLayout } from '../src/titleScreen';
import { PipeShape } from '../src/types';

const PIPES_START_INDEX = 4;

describe('buildTitleGlyphLayout', () => {
  test('builds COOL PIPES with connected pipe-only glyph cells', () => {
    const layout = buildTitleGlyphLayout();

    expect(layout.letterCount).toBe(9);
    expect(layout.rows).toBeGreaterThan(7);
    expect(layout.cols).toBeGreaterThan(0);
    expect(layout.cells.length).toBeGreaterThan(0);

    const topRowByLetter = new Map<number, number>();
    for (const cell of layout.cells) {
      expect(cell.directions.size).toBeGreaterThan(0);
      expect([
        PipeShape.Straight,
        PipeShape.Elbow,
        PipeShape.Tee,
        PipeShape.Cross,
      ]).toContain(cell.shape);
      topRowByLetter.set(
        cell.letterIndex,
        Math.min(topRowByLetter.get(cell.letterIndex) ?? Number.POSITIVE_INFINITY, cell.row),
      );
    }

    for (let i = 0; i < PIPES_START_INDEX; i++) {
      expect((topRowByLetter.get(i) ?? 0)).toBeLessThan((topRowByLetter.get(PIPES_START_INDEX) ?? 0));
    }
  });
});
