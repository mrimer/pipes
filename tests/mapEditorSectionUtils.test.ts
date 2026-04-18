/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for the mapEditorSectionUtils.ts keyboard handler.
 */

import { handleMapEditorKeyDown, MapEditorKeydownCallbacks } from '../src/campaignEditor/mapEditorSectionUtils';
import { PipeShape } from '../src/types';
import type { TileDef } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCallbacks(overrides: Partial<MapEditorKeydownCallbacks> = {}): {
  cbs: MapEditorKeydownCallbacks;
  calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {
    onUndo: [],
    onRedo: [],
    rotateTileAt: [],
    rotateSourceSinkAt: [],
    rotatePalette: [],
  };

  const cbs: MapEditorKeydownCallbacks = {
    onUndo: () => { calls.onUndo.push([]); },
    onRedo: () => { calls.onRedo.push([]); },
    getHoverTileAndPos: () => null,
    isConnectableForRotation: () => false,
    rotateTileAt: (pos, cw) => { calls.rotateTileAt.push([pos, cw]); },
    rotateSourceSinkAt: (pos, cw) => { calls.rotateSourceSinkAt.push([pos, cw]); },
    rotatePalette: (cw) => { calls.rotatePalette.push([cw]); },
    ...overrides,
  };

  return { cbs, calls };
}

function keyEvent(key: string, opts: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
}

// ─── Ctrl+Z / Ctrl+Y ─────────────────────────────────────────────────────────

describe('handleMapEditorKeyDown – Ctrl shortcuts', () => {
  it('Ctrl+Z calls onUndo', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('z', { ctrlKey: true }), cbs);
    expect(calls.onUndo.length).toBe(1);
    expect(calls.onRedo.length).toBe(0);
  });

  it('Ctrl+Y calls onRedo', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('y', { ctrlKey: true }), cbs);
    expect(calls.onRedo.length).toBe(1);
    expect(calls.onUndo.length).toBe(0);
  });

  it('Ctrl+A does nothing', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('a', { ctrlKey: true }), cbs);
    expect(calls.onUndo.length).toBe(0);
    expect(calls.onRedo.length).toBe(0);
    expect(calls.rotatePalette.length).toBe(0);
  });

  it('Ctrl+Z is case-insensitive (capital Z)', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('Z', { ctrlKey: true }), cbs);
    expect(calls.onUndo.length).toBe(1);
  });
});

// ─── Alt key guard ────────────────────────────────────────────────────────────

describe('handleMapEditorKeyDown – Alt key guard', () => {
  it('ignores Q when Alt is held', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('q', { altKey: true }), cbs);
    expect(calls.rotatePalette.length).toBe(0);
  });

  it('ignores Ctrl+Z when Alt is held', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('z', { ctrlKey: true, altKey: true }), cbs);
    expect(calls.onUndo.length).toBe(0);
  });
});

// ─── Input focus guard ────────────────────────────────────────────────────────

describe('handleMapEditorKeyDown – input focus guard', () => {
  it('ignores Q when an INPUT has focus', () => {
    const { cbs, calls } = makeCallbacks();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = new KeyboardEvent('keydown', { key: 'q', bubbles: true });
    Object.defineProperty(e, 'target', { value: input });
    handleMapEditorKeyDown(e, cbs);
    expect(calls.rotatePalette.length).toBe(0);
    document.body.removeChild(input);
  });

  it('ignores Ctrl+Z when a TEXTAREA has focus', () => {
    const { cbs, calls } = makeCallbacks();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true });
    Object.defineProperty(e, 'target', { value: ta });
    handleMapEditorKeyDown(e, cbs);
    expect(calls.onUndo.length).toBe(0);
    document.body.removeChild(ta);
  });
});

// ─── Q/W palette rotation ────────────────────────────────────────────────────

describe('handleMapEditorKeyDown – Q/W palette rotation', () => {
  it('W rotates palette CW when cursor is off-canvas', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('w'), cbs);
    expect(calls.rotatePalette).toEqual([[true]]);
  });

  it('Q rotates palette CCW when cursor is off-canvas', () => {
    const { cbs, calls } = makeCallbacks();
    handleMapEditorKeyDown(keyEvent('q'), cbs);
    expect(calls.rotatePalette).toEqual([[false]]);
  });

  it('W rotates pipe tile when hovering over one', () => {
    const hoverTile: TileDef = { shape: PipeShape.Straight };
    const pos = { row: 1, col: 2 };
    const { cbs, calls } = makeCallbacks({
      getHoverTileAndPos: () => ({ tile: hoverTile, pos }),
      isConnectableForRotation: () => false,
    });
    handleMapEditorKeyDown(keyEvent('w'), cbs);
    expect(calls.rotateTileAt).toEqual([[pos, true]]);
    expect(calls.rotatePalette.length).toBe(0);
  });

  it('Q rotates pipe tile CCW when hovering', () => {
    const hoverTile: TileDef = { shape: PipeShape.Elbow };
    const pos = { row: 0, col: 0 };
    const { cbs, calls } = makeCallbacks({
      getHoverTileAndPos: () => ({ tile: hoverTile, pos }),
      isConnectableForRotation: () => false,
    });
    handleMapEditorKeyDown(keyEvent('q'), cbs);
    expect(calls.rotateTileAt).toEqual([[pos, false]]);
  });

  it('W rotates source/sink connections when isConnectableForRotation returns true', () => {
    const hoverTile: TileDef = { shape: PipeShape.Source };
    const pos = { row: 2, col: 0 };
    const { cbs, calls } = makeCallbacks({
      getHoverTileAndPos: () => ({ tile: hoverTile, pos }),
      isConnectableForRotation: () => true,
    });
    handleMapEditorKeyDown(keyEvent('w'), cbs);
    expect(calls.rotateSourceSinkAt).toEqual([[pos, true]]);
    expect(calls.rotateTileAt.length).toBe(0);
  });

  it('falls back to palette rotation if tile is not a pipe and not connectable', () => {
    const hoverTile: TileDef = { shape: PipeShape.Granite };
    const pos = { row: 1, col: 3 };
    const { cbs, calls } = makeCallbacks({
      getHoverTileAndPos: () => ({ tile: hoverTile, pos }),
      isConnectableForRotation: () => false,
    });
    handleMapEditorKeyDown(keyEvent('w'), cbs);
    expect(calls.rotatePalette).toEqual([[true]]);
    expect(calls.rotateTileAt.length).toBe(0);
    expect(calls.rotateSourceSinkAt.length).toBe(0);
  });
});
