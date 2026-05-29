import { LevelEditorState } from '../src/campaignEditor/levelEditorState';
import { PipeShape, type LevelDef } from '../src/types';

describe('LevelEditorState.resize', () => {
  it('clears linked tile when it falls outside resized bounds', () => {
    const state = new LevelEditorState();
    const level: LevelDef = {
      id: 1,
      name: 'Resize test',
      rows: 2,
      cols: 2,
      grid: [
        [null, null],
        [null, { shape: PipeShape.Straight }],
      ],
      inventory: [{ shape: PipeShape.Straight, count: 1 }],
    };

    state.initFromLevel(level);
    state.linkTile({ row: 1, col: 1 });
    state.resize(1, 1);

    expect(state.linkedTilePos).toBeNull();
    expect(state.linkedTileDirty).toBe(false);
  });
});
