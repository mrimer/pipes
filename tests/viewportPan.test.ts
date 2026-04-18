/**
 * @jest-environment jsdom
 */

/**
 * Tests for viewport pan model, coordinate mapping, and gridSizePanel maxDim option.
 */

import { MAP_VIEW_MAX_COLS, MAP_VIEW_MAX_ROWS } from '../src/chapterMapScreen';
import { GRID_MAX_DIM, CAMPAIGN_MAP_MAX_DIM, GRID_MIN_DIM } from '../src/campaignEditor/types';
import { buildGridSizePanel, GridSizePanelCallbacks } from '../src/campaignEditor/gridSizePanel';
import { clampPanAxisWithFallback } from '../src/mapScreenBase';

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

  it('clampPanAxisWithFallback constrains values when preferred range is inverted', () => {
    expect(clampPanAxisWithFallback(9999, 9 * 64, 4 * 64)).toBe(9 * 64);
    expect(clampPanAxisWithFallback(0, 9 * 64, 4 * 64)).toBe(4 * 64);
  });
});

// ─── Connected-bbox clamp logic (pure logic test) ─────────────────────────────

/**
 * Mirrors the connected-bbox clamp math from MapScreenBase._clampPan after the
 * upward-drag fix: when the strict far-side formula is negative, fall back to
 * (rMax+1)*TILE_SIZE so upward drag cannot push all connected tiles off the top.
 */
function clampPanBBox(
  panY: number,
  maxPanY: number,
  rMin: number,
  rMax: number,
  viewRows: number,
  tileSize = 64,
): number {
  const bboxMinY = Math.max(0, (rMin - 1) * tileSize);
  const strictBboxMaxY = (rMax + 2 - viewRows) * tileSize;
  const bboxMaxY = Math.min(maxPanY,
    strictBboxMaxY >= 0 ? strictBboxMaxY : (rMax + 1) * tileSize);
  return clampPanAxisWithFallback(panY, bboxMinY, bboxMaxY);
}

describe('connected-bbox clamp (pure logic)', () => {
  const TS = 64; // tile size

  it('enforces bboxMinY when strict bboxMaxY < 0 and pan is below bboxMinY', () => {
    // rows=12, viewRows=9 → maxPanY=3*TS; connected rows 3-6 → bboxMinY=2*TS
    // strictBboxMaxY = (6+2-9)*TS = -TS → fallback bboxMaxY = min(3*TS, 7*TS) = 3*TS
    const maxPanY = 3 * TS;
    // pan=0 should be forced up to bboxMinY=2*TS
    expect(clampPanBBox(0, maxPanY, 3, 6, 9, TS)).toBe(2 * TS);
    expect(clampPanBBox(TS, maxPanY, 3, 6, 9, TS)).toBe(2 * TS);
  });

  it('caps upward drag at (rMax+1)*TILE_SIZE when strict bboxMaxY is negative', () => {
    // 22-row map, viewRows=9, connected only at rows 0-2 (rMin=0, rMax=2).
    // maxPanY = (22-9)*TS = 13*TS.
    // strictBboxMaxY = (2+2-9)*TS = -5*TS → fallback bboxMaxY = min(13*TS, 3*TS) = 3*TS.
    // bboxMinY = max(0, -TS) = 0.
    // Upward drag (pan increasing) must stop at 3*TS, not 13*TS.
    const maxPanY = 13 * TS;
    expect(clampPanBBox(13 * TS, maxPanY, 0, 2, 9, TS)).toBe(3 * TS);
    expect(clampPanBBox(4 * TS,  maxPanY, 0, 2, 9, TS)).toBe(3 * TS);
    expect(clampPanBBox(3 * TS,  maxPanY, 0, 2, 9, TS)).toBe(3 * TS);
    expect(clampPanBBox(2 * TS,  maxPanY, 0, 2, 9, TS)).toBe(2 * TS);
    expect(clampPanBBox(0,        maxPanY, 0, 2, 9, TS)).toBe(0);
  });

  it('does not exceed maxPanY when bboxMinY > maxPanY', () => {
    // Connected tiles near the bottom of a short grid (rMin=5, rMax=5).
    // maxPanY = 2*TS; bboxMinY = 4*TS > maxPanY → inverted range resolved to maxPanY.
    const maxPanY = 2 * TS;
    const result = clampPanBBox(0, maxPanY, 5, 5, 9, TS);
    expect(result).toBeLessThanOrEqual(maxPanY);
  });

  it('normal case (bboxMin ≤ bboxMax > 0): clamps to [bboxMin, bboxMax]', () => {
    // rows=20, viewRows=9, connected rows 5-14 → bboxMinY=4*TS, strictBboxMaxY=7*TS.
    const maxPanY = 11 * TS;
    expect(clampPanBBox(0,       maxPanY, 5, 14, 9, TS)).toBe(4 * TS);
    expect(clampPanBBox(6 * TS,  maxPanY, 5, 14, 9, TS)).toBe(6 * TS);
    expect(clampPanBBox(99 * TS, maxPanY, 5, 14, 9, TS)).toBe(7 * TS);
  });

  it('inverted range (connected region smaller than viewport): pan stays within [bboxMax, bboxMin]', () => {
    // 22-row map, viewRows=9, connected only at row 10 (rMin=rMax=10).
    // bboxMinY=9*TS, strictBboxMaxY=(10+2-9)*TS=3*TS → inverted → [3*TS, 9*TS].
    const maxPanY = 13 * TS;
    expect(clampPanBBox(0,       maxPanY, 10, 10, 9, TS)).toBe(3 * TS);
    expect(clampPanBBox(6 * TS,  maxPanY, 10, 10, 9, TS)).toBe(6 * TS);
    expect(clampPanBBox(13 * TS, maxPanY, 10, 10, 9, TS)).toBe(9 * TS);
  });
});

// ─── Initial snap logic (pure logic test) ─────────────────────────────────────

/**
 * Mirrors the initial-snap math from MapScreenBase._computeInitialSnap.
 * Uses edge-clamp only (no bbox clamping) so the focused tile is centred as
 * much as the map boundaries allow.
 */
function computeInitialSnapCenter(
  targetRow: number, targetCol: number,
  rows: number, cols: number,
  viewRows: number, viewCols: number,
  tileSize = 64,
): { x: number; y: number } {
  const maxX = Math.max(0, (cols - viewCols) * tileSize);
  const maxY = Math.max(0, (rows - viewRows) * tileSize);
  const panX = Math.max(0, Math.min(maxX,
    (targetCol + 0.5) * tileSize - (viewCols * tileSize) / 2));
  const panY = Math.max(0, Math.min(maxY,
    (targetRow + 0.5) * tileSize - (viewRows * tileSize) / 2));
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

  it('centers upper-part target using edge-only clamp (no bbox push-down)', () => {
    // 22-row map, connected tiles at row 2. Ideal pan = (2.5 - 4.5)*TS = -2*TS.
    // Edge clamp → 0.  Without the fix, bbox clamp would push it to (rMin-1)*TS = TS.
    const TS = 64;
    const result = computeInitialSnapCenter(2, 5, 22, 12, MAP_VIEW_MAX_ROWS, MAP_VIEW_MAX_COLS, TS);
    // panY should be 0 (best centering), not TS (old bbox-pushed value).
    expect(result.y).toBe(0);
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
