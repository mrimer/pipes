/**
 * @jest-environment jsdom
 */

import { MapEditorBase } from '../src/campaignEditor/mapEditorBase';
import { PipeShape, Direction } from '../src/types';
import type { EditorSnapshot } from '../src/campaignEditor/types';
import type { EditorPalette } from '../src/campaignEditor/types';
import type { TileDef } from '../src/types';

class TestMapEditorBase extends MapEditorBase {
  protected get _chamberContentType(): 'level' { return 'level'; }
  protected get _undoBtnId(): string { return 'undo'; }
  protected get _redoBtnId(): string { return 'redo'; }
  protected _recordSnapshot(): void {}
  protected _saveGrid(): void {}
  protected _renderCanvas(): void {}
  protected _updateCanvasDisplaySize(): void {}
  protected _rebuildTileParamsPanel(): void {}
  protected _applySnapshot(_snap: EditorSnapshot): void {}

  setPalette(palette: EditorPalette): void {
    this._palette = palette;
  }

  setTile(pos: { row: number; col: number }, tile: TileDef): void {
    this._gridState.init(3, 3, Array.from({ length: 3 }, () => Array(3).fill(null)));
    this._gridState.grid[pos.row][pos.col] = tile;
  }

  rotateSourceSinkAt(pos: { row: number; col: number }, clockwise: boolean): void {
    this._rotateSourceSinkAt(pos, clockwise);
  }

  get connections(): { N: boolean; E: boolean; S: boolean; W: boolean } {
    return this._params.connections;
  }
}

describe('MapEditorBase._rotateSourceSinkAt', () => {
  it('syncs params.connections for matching chamber palette rotations', () => {
    const editor = new TestMapEditorBase(3, 3);
    editor.setPalette('chamber:level');
    editor.setTile(
      { row: 1, col: 1 },
      { shape: PipeShape.Chamber, chamberContent: 'level', connections: [Direction.North, Direction.East] },
    );

    editor.rotateSourceSinkAt({ row: 1, col: 1 }, true);

    expect(editor.connections).toEqual({
      N: false,
      E: true,
      S: true,
      W: false,
    });
  });
});
