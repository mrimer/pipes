/**
 * @jest-environment jsdom
 */
/**
 * Direct unit tests for ChapterMapInput's own placement/erase/rotate rules,
 * driven through real DOM events against a fake ChapterMapInputCallbacks —
 * no CampaignEditor/canvas-2d-context harness required. This is the
 * testability win the GridGestureEngine extraction was for: previously
 * ChapterMapInput was only reachable through a full editor instance.
 */
import type { ChapterMapInputCallbacks } from '../../src/campaignEditor/chapterMapInput';
import { ChapterMapInput } from '../../src/campaignEditor/chapterMapInput';
import type { CampaignDef, ChapterDef, TileDef } from '../../src/types';
import { PipeShape } from '../../src/types';
import type { EditorPalette } from '../../src/campaignEditor/types';

function fakeTile(): TileDef {
  return { shape: PipeShape.Straight, rotation: 0 } as TileDef;
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  // 2x2 grid at 32px/cell — canvasPos resolves clientX/clientY against this rect.
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64, x: 0, y: 0, toJSON: () => ({}),
  });
  return canvas;
}

type FakeCallbacks = ChapterMapInputCallbacks & Record<keyof ChapterMapInputCallbacks, jest.Mock>;

function makeCallbacks(grid: (TileDef | null)[][]): FakeCallbacks {
  return {
    getEditGrid: jest.fn(() => grid),
    getEditRows: jest.fn(() => grid.length),
    getEditCols: jest.fn(() => grid[0].length),
    getPalette: jest.fn((): EditorPalette => 'erase'),
    setPalette: jest.fn(),
    getSelectedLevelIdx: jest.fn(() => null),
    setSelectedLevelIdx: jest.fn(),
    getFocusedTilePos: jest.fn(() => null),
    setFocusedTilePos: jest.fn(),
    buildTileDef: jest.fn(() => fakeTile()),
    hasSourceElsewhere: jest.fn(() => false),
    hasSinkElsewhere: jest.fn(() => false),
    showSinkError: jest.fn(),
    rotateTileAt: jest.fn(),
    rotateSourceSinkAt: jest.fn(),
    rotatePalette: jest.fn(),
    recordSnapshot: jest.fn(),
    saveGridState: jest.fn(),
    renderCanvas: jest.fn(),
    rebuildPalette: jest.fn(),
    rebuildLevelInventory: jest.fn(),
    rebuildTileParamsPanel: jest.fn(),
    clearFocusIfAt: jest.fn(),
    getActiveCampaign: jest.fn(() => null),
    getActiveChapterIdx: jest.fn(() => 0),
    openLevelEditor: jest.fn(),
  };
}

function rightMouseDownAt(canvas: HTMLCanvasElement, x: number, y: number): void {
  canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: x, clientY: y, bubbles: true }));
}

function mouseLeave(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
}

function windowMouseUp(button = 2): void {
  window.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true }));
}

describe('ChapterMapInput — erase-drag end rebuilds the level inventory', () => {
  function attachInput() {
    const grid: (TileDef | null)[][] = [
      [fakeTile(), fakeTile()],
      [null, null],
    ];
    const canvas = makeCanvas();
    const cb = makeCallbacks(grid);
    const input = new ChapterMapInput(cb);
    input.attach(canvas, {} as CampaignDef, {} as ChapterDef);
    return { canvas, cb, input };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('ended by releasing the mouse over the canvas', () => {
    const { canvas, cb } = attachInput();
    rightMouseDownAt(canvas, 16, 16); // row 0, col 0 — occupied, erase happens

    windowMouseUp();

    expect(cb.rebuildLevelInventory).toHaveBeenCalledTimes(1);
  });

  test('ended by the cursor leaving the canvas (regression: this used to skip the rebuild)', () => {
    const { canvas, cb } = attachInput();
    rightMouseDownAt(canvas, 16, 16); // row 0, col 0 — occupied, erase happens

    mouseLeave(canvas);

    expect(cb.rebuildLevelInventory).toHaveBeenCalledTimes(1);
  });
});
