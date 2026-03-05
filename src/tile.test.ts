import { Tile, getConnections, rotateDirection, oppositeDirection } from './tile';
import { Direction, PipeShape } from './types';

describe('rotateDirection', () => {
  it('rotates North → East', () => {
    expect(rotateDirection(Direction.North)).toBe(Direction.East);
  });
  it('rotates East → South', () => {
    expect(rotateDirection(Direction.East)).toBe(Direction.South);
  });
  it('rotates South → West', () => {
    expect(rotateDirection(Direction.South)).toBe(Direction.West);
  });
  it('rotates West → North', () => {
    expect(rotateDirection(Direction.West)).toBe(Direction.North);
  });
});

describe('oppositeDirection', () => {
  it('North ↔ South', () => {
    expect(oppositeDirection(Direction.North)).toBe(Direction.South);
    expect(oppositeDirection(Direction.South)).toBe(Direction.North);
  });
  it('East ↔ West', () => {
    expect(oppositeDirection(Direction.East)).toBe(Direction.West);
    expect(oppositeDirection(Direction.West)).toBe(Direction.East);
  });
});

describe('getConnections', () => {
  it('Empty tile has no connections', () => {
    const c = getConnections(PipeShape.Empty, 0);
    expect(c.size).toBe(0);
  });

  it('Straight at 0° connects North and South', () => {
    const c = getConnections(PipeShape.Straight, 0);
    expect(c.has(Direction.North)).toBe(true);
    expect(c.has(Direction.South)).toBe(true);
    expect(c.has(Direction.East)).toBe(false);
    expect(c.has(Direction.West)).toBe(false);
  });

  it('Straight at 90° connects East and West', () => {
    const c = getConnections(PipeShape.Straight, 90);
    expect(c.has(Direction.East)).toBe(true);
    expect(c.has(Direction.West)).toBe(true);
    expect(c.has(Direction.North)).toBe(false);
  });

  it('Elbow at 0° connects North and East', () => {
    const c = getConnections(PipeShape.Elbow, 0);
    expect(c.has(Direction.North)).toBe(true);
    expect(c.has(Direction.East)).toBe(true);
    expect(c.has(Direction.South)).toBe(false);
    expect(c.has(Direction.West)).toBe(false);
  });

  it('Cross connects all four directions regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const c = getConnections(PipeShape.Cross, rot);
      expect(c.size).toBe(4);
    }
  });

  it('Tank connects all four directions regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const c = getConnections(PipeShape.Tank, rot);
      expect(c.size).toBe(4);
    }
  });

  it('DirtBlock connects all four directions regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const c = getConnections(PipeShape.DirtBlock, rot);
      expect(c.size).toBe(4);
    }
  });

  it('ItemContainer connects all four directions regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const c = getConnections(PipeShape.ItemContainer, rot);
      expect(c.size).toBe(4);
    }
  });

  it('Granite has no connections (water cannot flow through it)', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const c = getConnections(PipeShape.Granite, rot);
      expect(c.size).toBe(0);
    }
  });
});

describe('Tile', () => {
  it('rotates 90° clockwise on each rotate() call', () => {
    const tile = new Tile(PipeShape.Straight, 0);
    tile.rotate();
    expect(tile.rotation).toBe(90);
    tile.rotate();
    expect(tile.rotation).toBe(180);
    tile.rotate();
    expect(tile.rotation).toBe(270);
    tile.rotate();
    expect(tile.rotation).toBe(0);
  });

  it('does not rotate when isFixed is true', () => {
    const tile = new Tile(PipeShape.Source, 0, true);
    tile.rotate();
    expect(tile.rotation).toBe(0);
  });

  it('connections getter reflects current rotation', () => {
    const tile = new Tile(PipeShape.Straight, 0);
    expect(tile.connections.has(Direction.North)).toBe(true);
    tile.rotate(); // 90°
    expect(tile.connections.has(Direction.East)).toBe(true);
    expect(tile.connections.has(Direction.North)).toBe(false);
  });

  it('stores capacity and defaults to 0', () => {
    const plain = new Tile(PipeShape.Straight, 0);
    expect(plain.capacity).toBe(0);

    const tank = new Tile(PipeShape.Tank, 0, true, 12);
    expect(tank.capacity).toBe(12);
  });

  it('stores dirtCost and defaults to 0', () => {
    const plain = new Tile(PipeShape.Straight, 0);
    expect(plain.dirtCost).toBe(0);

    const dirt = new Tile(PipeShape.DirtBlock, 0, true, 0, 3);
    expect(dirt.dirtCost).toBe(3);
  });

  it('stores itemShape and itemCount, defaulting to null and 1', () => {
    const plain = new Tile(PipeShape.Straight, 0);
    expect(plain.itemShape).toBeNull();
    expect(plain.itemCount).toBe(1);

    const container = new Tile(PipeShape.ItemContainer, 0, true, 0, 0, PipeShape.Straight, 2);
    expect(container.itemShape).toBe(PipeShape.Straight);
    expect(container.itemCount).toBe(2);
  });
});
