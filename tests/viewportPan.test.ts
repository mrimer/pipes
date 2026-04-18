/**
 * @jest-environment jsdom
 */

/**
 * Tests for viewport pan model, coordinate mapping, and gridSizePanel maxDim option.
 */

import { MAP_VIEW_MAX_COLS, MAP_VIEW_MAX_ROWS } from '../src/chapterMapScreen';
import { GRID_MAX_DIM, CAMPAIGN_MAP_MAX_DIM, GRID_MIN_DIM } from '../src/campaignEditor/types';
import { buildGridSizePanel, GridSizePanelCallbacks } from '../src/campaignEditor/gridSizePanel';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('MAP_VIEW constants', () => {
  it('MAP_VIEW_MAX_COLS is 12', () => expect(MAP_VIEW_MAX_COLS).toBe(12));
  it('MAP_VIEW_MAX_ROWS is 9',  () => expect(MAP_VIEW_MAX_ROWS).toBe(9));
  it('CAMPAIGN_MAP_MAX_DIM is 50', () => expect(CAMPAIGN_MAP_MAX_DIM).toBe(50));
  it('GRID_MAX_DIM remains 20',    () => expect(GRID_MAX_DIM).toBe(20));
});

// ─── gridSizePanel maxDim option ──────────────────────────────────────────────

function makeCallbacks(rows = 3, cols = 6): GridSizePanelCallbacks {
  const state = { rows, cols };
  return {
    getRows:        () => state.rows,
    getCols:        () => state.cols,
    resize:         (r, c) => { state.rows = r; state.cols = c; },
    slide:          () => {},
    rotate:         () => {},
    reflect:        () => {},
    flipHorizontal: () => {},
    flipVertical:   () => {},
    rebuildPanel:   () => {},
  };
}

function makeBtn(
  label: string, _bg: string, _fg: string, onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

describe('buildGridSizePanel', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('uses GRID_MAX_DIM as the default max', () => {
    const panel = buildGridSizePanel(makeCallbacks(), makeBtn, {
      panelId: 'test-panel-default',
      title: 'Test',
      inputWidth: '60px',
      inputRowStyle: '',
    });
    const inputs = panel.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(inputs[0].max).toBe(String(GRID_MAX_DIM));
    expect(inputs[1].max).toBe(String(GRID_MAX_DIM));
  });

  it('respects a custom maxDim option', () => {
    const panel = buildGridSizePanel(makeCallbacks(), makeBtn, {
      panelId: 'test-panel-50',
      title: 'Test50',
      inputWidth: '60px',
      inputRowStyle: '',
      maxDim: CAMPAIGN_MAP_MAX_DIM,
    });
    const inputs = panel.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(inputs[0].max).toBe(String(CAMPAIGN_MAP_MAX_DIM));
    expect(inputs[1].max).toBe(String(CAMPAIGN_MAP_MAX_DIM));
  });

  it('shows error message with the correct maxDim in range label', () => {
    document.body.innerHTML = '';
    const cbs = makeCallbacks(3, 6);
    const panel = buildGridSizePanel(cbs, makeBtn, {
      panelId: 'test-panel-err',
      title: 'Err',
      inputWidth: '60px',
      inputRowStyle: '',
      maxDim: 50,
    });
    document.body.appendChild(panel);

    const inputs = panel.querySelectorAll<HTMLInputElement>('input[type="number"]');
    // Set an out-of-range value and click Resize.
    inputs[0].value = '99';
    inputs[1].value = '99';
    const resizeBtn = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('Resize'));
    resizeBtn!.click();

    // Find the error element (a div below the input row, above the resize button).
    const allDivs = Array.from(panel.querySelectorAll<HTMLDivElement>('div'));
    const errDiv = allDivs.find(d => d.textContent?.includes('1–50'));
    expect(errDiv).toBeTruthy();
    // Clamped values should be applied to the inputs.
    expect(parseInt(inputs[0].value)).toBeLessThanOrEqual(50);
    expect(parseInt(inputs[1].value)).toBeLessThanOrEqual(50);
  });

  it('allows resize within custom maxDim', () => {
    const cbs = makeCallbacks(3, 6);
    const panel = buildGridSizePanel(cbs, makeBtn, {
      panelId: 'test-panel-ok',
      title: 'Ok',
      inputWidth: '60px',
      inputRowStyle: '',
      maxDim: 50,
    });
    document.body.appendChild(panel);

    const inputs = panel.querySelectorAll<HTMLInputElement>('input[type="number"]');
    inputs[0].value = '25';
    inputs[1].value = '30';
    const resizeBtn = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('Resize'));
    resizeBtn!.click();

    expect(cbs.getRows()).toBe(25);
    expect(cbs.getCols()).toBe(30);
  });
});

// ─── Viewport clamping helpers (pure logic test) ──────────────────────────────

/**
 * Mirrors the core `_clampPan` math in ChapterMapScreen to validate the logic
 * independently of the DOM.
 */
function clampPanEdgeOnly(
  panX: number, panY: number,
  rows: number, cols: number,
  viewRows: number, viewCols: number,
  tileSize = 64,
): { x: number; y: number } {
  const maxX = Math.max(0, (cols - viewCols) * tileSize);
  const maxY = Math.max(0, (rows - viewRows) * tileSize);
  return {
    x: Math.max(0, Math.min(maxX, panX)),
    y: Math.max(0, Math.min(maxY, panY)),
  };
}

describe('viewport clamp (pure logic)', () => {
  it('clamps pan to (0,0) when map fits within view', () => {
    expect(clampPanEdgeOnly(-100, -50, 5, 8, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS)).toEqual({ x: 0, y: 0 });
  });

  it('clamps pan to max when scrolled too far right/down', () => {
    const rows = 20, cols = 20;
    const tileSize = 64;
    const result = clampPanEdgeOnly(9999, 9999, rows, cols, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS, tileSize);
    expect(result.x).toBe((cols - MAP_VIEW_MAX_COLS) * tileSize);
    expect(result.y).toBe((rows - MAP_VIEW_MAX_ROWS) * tileSize);
  });

  it('clamps negative pan to 0', () => {
    expect(clampPanEdgeOnly(-500, -300, 20, 20, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS)).toEqual({ x: 0, y: 0 });
  });

  it('max pan is zero when map equals view size', () => {
    const result = clampPanEdgeOnly(100, 100, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS);
    expect(result).toEqual({ x: 0, y: 0 });
  });
});

// ─── Initial snap logic (pure logic test) ─────────────────────────────────────

/**
 * Mirrors the initial-snap math from ChapterMapScreen._computeInitialSnap.
 */
function computeInitialSnapCenter(
  targetRow: number, targetCol: number,
  rows: number, cols: number,
  viewRows: number, viewCols: number,
  tileSize = 64,
): { x: number; y: number } {
  let panX = (targetCol + 0.5) * tileSize - (viewCols * tileSize) / 2;
  let panY = (targetRow + 0.5) * tileSize - (viewRows * tileSize) / 2;
  // Edge clamp only.
  const maxX = Math.max(0, (cols - viewCols) * tileSize);
  const maxY = Math.max(0, (rows - viewRows) * tileSize);
  panX = Math.max(0, Math.min(maxX, panX));
  panY = Math.max(0, Math.min(maxY, panY));
  return { x: panX, y: panY };
}

describe('initial snap (pure logic)', () => {
  it('centers a target tile in the view', () => {
    const rows = 20, cols = 20;
    const targetRow = 10, targetCol = 10;
    const result = computeInitialSnapCenter(targetRow, targetCol, rows, cols, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS);
    // The center of the view should be at the center of the target tile.
    const viewCenterX = result.x + (MAP_VIEW_MAX_COLS / 2) * 64;
    const viewCenterY = result.y + (MAP_VIEW_MAX_ROWS / 2) * 64;
    expect(viewCenterX).toBeCloseTo((targetCol + 0.5) * 64, 0);
    expect(viewCenterY).toBeCloseTo((targetRow + 0.5) * 64, 0);
  });

  it('clamps snap at the top-left edge', () => {
    // Target near top-left: should not show negative pan.
    const result = computeInitialSnapCenter(0, 0, 20, 20, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('clamps snap at the bottom-right edge', () => {
    const rows = 20, cols = 20;
    const result = computeInitialSnapCenter(rows - 1, cols - 1, rows, cols, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS);
    const maxX = (cols - MAP_VIEW_MAX_COLS) * 64;
    const maxY = (rows - MAP_VIEW_MAX_ROWS) * 64;
    expect(result.x).toBe(maxX);
    expect(result.y).toBe(maxY);
  });
});

// ─── Hit-test offset math (pure logic test) ───────────────────────────────────

/**
 * Mirrors the pan-aware hit-test math from ChapterMapScreen._canvasPosFromCoords.
 */
function canvasPosWithPan(
  clientX: number, clientY: number,
  canvasLeft: number, canvasTop: number,
  canvasCssWidth: number, canvasCssHeight: number,
  canvasIntrinsicWidth: number, canvasIntrinsicHeight: number,
  viewRows: number, viewCols: number,
  panX: number, panY: number,
  tileSize = 64,
): { row: number; col: number } | null {
  const canvasPxX = (clientX - canvasLeft) * canvasIntrinsicWidth / canvasCssWidth;
  const canvasPxY = (clientY - canvasTop)  * canvasIntrinsicHeight / canvasCssHeight;
  const gridPxX = canvasPxX + panX;
  const gridPxY = canvasPxY + panY;
  const col = Math.floor(gridPxX / tileSize);
  const row = Math.floor(gridPxY / tileSize);
  const viewCol = Math.floor(canvasPxX / tileSize);
  const viewRow = Math.floor(canvasPxY / tileSize);
  if (viewRow < 0 || viewRow >= viewRows || viewCol < 0 || viewCol >= viewCols) return null;
  return { row, col };
}

describe('pan-aware hit test (pure logic)', () => {
  it('returns correct tile without panning', () => {
    // No pan: click at pixel 100, 64 on a 768x576 canvas maps to col=1, row=1.
    const result = canvasPosWithPan(
      100, 64,               // client coords
      0, 0,                  // canvas left/top
      MAP_VIEW_MAX_COLS * 64, MAP_VIEW_MAX_ROWS * 64,  // css size = intrinsic
      MAP_VIEW_MAX_COLS * 64, MAP_VIEW_MAX_ROWS * 64,
      MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS,
      0, 0,
    );
    expect(result).toEqual({ row: 1, col: 1 });
  });

  it('returns panned tile when map is scrolled right', () => {
    // Pan 5 tiles right (5*64=320px). Click at canvas px 0,0 → grid col 5.
    const result = canvasPosWithPan(
      0, 0,
      0, 0,
      MAP_VIEW_MAX_COLS * 64, MAP_VIEW_MAX_ROWS * 64,
      MAP_VIEW_MAX_COLS * 64, MAP_VIEW_MAX_ROWS * 64,
      MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS,
      5 * 64, 0,
    );
    expect(result).toEqual({ row: 0, col: 5 });
  });

  it('returns panned tile when map is scrolled down', () => {
    // Pan 3 tiles down. Click at canvas px 0,0 → grid row 3.
    const result = canvasPosWithPan(
      0, 0,
      0, 0,
      MAP_VIEW_MAX_COLS * 64, MAP_VIEW_MAX_ROWS * 64,
      MAP_VIEW_MAX_COLS * 64, MAP_VIEW_MAX_ROWS * 64,
      MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS,
      0, 3 * 64,
    );
    expect(result).toEqual({ row: 3, col: 0 });
  });
});
