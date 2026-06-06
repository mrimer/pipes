import { drawChamber } from '../src/renderer/chamberRenderers';
import { Tile } from '../src/tile';
import { PipeShape } from '../src/types';

type FakeCtx = CanvasRenderingContext2D & {
  fillStyles: string[];
  createLinearGradientMock: jest.Mock;
};

function createMockCtx(): FakeCtx {
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
    const ctx = createMockCtx();
    const tile = new Tile(PipeShape.Chamber, 0, false, 0, 0, PipeShape.GoldStraight, 1, null, 'item');
    jest.spyOn(Date, 'now').mockReturnValue(250);

    drawChamber(ctx, tile, '#ccaa22', true, 32, false, 0, 0, null, null);

    expect(ctx.createLinearGradientMock).toHaveBeenCalledTimes(2);
  });

  it('emits outward fading star particles for connected star chambers', () => {
    const ctx = createMockCtx();
    const tile = new Tile(PipeShape.Chamber, 0, false, 0, 0, null, 1, null, 'star');
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1100);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    drawChamber(ctx, tile, '#ffee66', true, 32, false, 0, 0, null, null); // initializes burst state
    // Advance 100ms so the burst spawns and draws particles on the second render.
    drawChamber(ctx, tile, '#ffee66', true, 32, false, 0, 0, null, null);

    expect(ctx.fillStyles.some((style) => style.startsWith('hsla('))).toBe(true);
  });

  it('does not draw star burst particles for disconnected star chambers', () => {
    const ctx = createMockCtx();
    const tile = new Tile(PipeShape.Chamber, 0, false, 0, 0, null, 1, null, 'star');
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    drawChamber(ctx, tile, '#ffee66', false, 32, false, 0, 0, null, null);

    expect(ctx.fillStyles.some((style) => style.startsWith('hsla('))).toBe(false);
  });

  it.each([
    [PipeShape.Straight, PipeShape.LeakyStraight],
    [PipeShape.Elbow, PipeShape.LeakyElbow],
    [PipeShape.Tee, PipeShape.LeakyTee],
    [PipeShape.Cross, PipeShape.LeakyCross],
  ])('renders %s item chambers like %s', (baseShape, leakyShape) => {
    const baseCtx = createMockCtx();
    const leakyCtx = createMockCtx();
    const baseTile = new Tile(PipeShape.Chamber, 0, false, 0, 0, baseShape, 1, null, 'item');
    const leakyTile = new Tile(PipeShape.Chamber, 0, false, 0, 0, leakyShape, 1, null, 'item');

    drawChamber(baseCtx, baseTile, '#88ccff', false, 32, false, 0, 0, null, null);
    drawChamber(leakyCtx, leakyTile, '#88ccff', false, 32, false, 0, 0, null, null);

    expect((leakyCtx.stroke as jest.Mock).mock.calls).toHaveLength((baseCtx.stroke as jest.Mock).mock.calls.length);
    expect((leakyCtx.moveTo as jest.Mock).mock.calls).toHaveLength((baseCtx.moveTo as jest.Mock).mock.calls.length);
    expect((leakyCtx.lineTo as jest.Mock).mock.calls).toHaveLength((baseCtx.lineTo as jest.Mock).mock.calls.length);
  });
});
