import { drawChamber } from '../src/renderer/chamberRenderers';
import { Tile } from '../src/tile';
import { PipeShape } from '../src/types';

type FakeCtx = CanvasRenderingContext2D & {
  fillStyles: string[];
  createLinearGradientMock: jest.Mock;
};

function createFakeCtx(): FakeCtx {
  const fillStyles: string[] = [];
  const ctx: Partial<CanvasRenderingContext2D> & { fillStyles: string[]; createLinearGradientMock: jest.Mock } = {
    fillStyles,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    quadraticCurveTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    roundRect: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
    fill: jest.fn(() => {
      if (typeof ctx.fillStyle === 'string') fillStyles.push(ctx.fillStyle);
    }),
    stroke: jest.fn(),
    arc: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    scale: jest.fn(),
    fillText: jest.fn(),
    strokeText: jest.fn(),
    createLinearGradientMock: jest.fn(() => ({ addColorStop: jest.fn() })),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };
  ctx.createLinearGradient = ctx.createLinearGradientMock;
  return ctx as FakeCtx;
}

describe('drawChamber visual effects', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds a second linear gradient pass for connected gold-item chambers during shine window', () => {
    const ctx = createFakeCtx();
    const tile = new Tile(PipeShape.Chamber, 0, false, 0, 0, PipeShape.GoldStraight, 1, null, 'item');
    jest.spyOn(Date, 'now').mockReturnValue(250);

    drawChamber(ctx, tile, '#ccaa22', true, 32, false, 0, 0, null, null);

    expect(ctx.createLinearGradientMock).toHaveBeenCalledTimes(2);
  });

  it('emits outward fading star particles for connected star chambers', () => {
    const ctx = createFakeCtx();
    const tile = new Tile(PipeShape.Chamber, 0, false, 0, 0, null, 1, null, 'star');
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1100);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    drawChamber(ctx, tile, '#ffee66', true, 32, false, 0, 0, null, null);
    drawChamber(ctx, tile, '#ffee66', true, 32, false, 0, 0, null, null);

    expect(ctx.fillStyles.some((style) => style.startsWith('hsla('))).toBe(true);
  });
});

