import { buildTitleGlyphLayout } from '../src/titleScreen';
import { PipeShape } from '../src/types';

describe('buildTitleGlyphLayout', () => {
  test('builds COOL PIPES as a single landscape row of connected pipe-only glyph cells', () => {
    const layout = buildTitleGlyphLayout();

    // All 9 letters (C-O-O-L-P-I-P-E-S) are on one row of 7-cell-tall glyphs.
    expect(layout.letterCount).toBe(9);
    expect(layout.rows).toBe(7);
    expect(layout.cols).toBeGreaterThan(0);
    expect(layout.cells.length).toBeGreaterThan(0);

    for (const cell of layout.cells) {
      // Every occupied cell must have at least one pipe connection.
      expect(cell.directions.size).toBeGreaterThan(0);
      // Only the four base pipe shapes should be emitted.
      expect([
        PipeShape.Straight,
        PipeShape.Elbow,
        PipeShape.Tee,
        PipeShape.Cross,
      ]).toContain(cell.shape);
      // All cells share the same row band (0–6) since there is only one row.
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(7);
    }

    // COOL (letters 0-3) and PIPES (letters 4-8) must all start on row 0 (no vertical offset).
    const topRowByLetter = new Map<number, number>();
    for (const cell of layout.cells) {
      topRowByLetter.set(
        cell.letterIndex,
        Math.min(topRowByLetter.get(cell.letterIndex) ?? Number.POSITIVE_INFINITY, cell.row),
      );
    }
    for (let i = 0; i < layout.letterCount; i++) {
      expect(topRowByLetter.get(i)).toBe(0);
    }
  });
});
