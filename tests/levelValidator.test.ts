import { validateLevel } from '../src/campaignEditor/levelValidator';
import { Direction, PipeShape, type LevelDef } from '../src/types';
import { MULTIPLE_SINKS } from '../src/campaignEditor/validationMessages';
import { t } from '../src/i18n';

describe('validateLevel', () => {
  it('fails when multiple sinks are present', () => {
    const level: LevelDef = {
      id: 1,
      name: 'Multiple sinks',
      rows: 1,
      cols: 3,
      grid: [[
        { shape: PipeShape.Source, connections: [Direction.East] },
        { shape: PipeShape.Sink, connections: [Direction.West] },
        { shape: PipeShape.Sink, connections: [Direction.West] },
      ]],
      inventory: [{ shape: PipeShape.Straight, count: 1 }],
    };

    const result = validateLevel(level);
    expect(result.ok).toBe(false);
    expect(result.messages).toContain(t(MULTIPLE_SINKS));
  });
});
