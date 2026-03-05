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

  it('Chamber connects all four directions regardless of rotation', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const c = getConnections(PipeShape.Chamber, rot);
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

    const chamber = new Tile(PipeShape.Chamber, 0, true, 12, 0, null, 1, null, 'tank');
    expect(chamber.capacity).toBe(12);
  });

  it('stores dirtCost and defaults to 0', () => {
    const plain = new Tile(PipeShape.Straight, 0);
    expect(plain.dirtCost).toBe(0);

    const chamber = new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'dirt');
    expect(chamber.dirtCost).toBe(3);
  });

  it('stores itemShape and itemCount, defaulting to null and 1', () => {
    const plain = new Tile(PipeShape.Straight, 0);
    expect(plain.itemShape).toBeNull();
    expect(plain.itemCount).toBe(1);

    const chamber = new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Straight, 2, null, 'item');
    expect(chamber.itemShape).toBe(PipeShape.Straight);
    expect(chamber.itemCount).toBe(2);
  });

  it('customConnections overrides rotation-based connections when set', () => {
    const northOnly = new Set([Direction.North]);
    const chamber = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, northOnly, 'tank');
    expect(chamber.connections.has(Direction.North)).toBe(true);
    expect(chamber.connections.has(Direction.East)).toBe(false);
    expect(chamber.connections.has(Direction.South)).toBe(false);
    expect(chamber.connections.has(Direction.West)).toBe(false);
  });

  it('customConnections works for Source tiles (east+south only)', () => {
    const eastSouth = new Set([Direction.East, Direction.South]);
    const source = new Tile(PipeShape.Source, 0, true, 5, 0, null, 1, eastSouth);
    expect(source.connections.has(Direction.East)).toBe(true);
    expect(source.connections.has(Direction.South)).toBe(true);
    expect(source.connections.has(Direction.North)).toBe(false);
    expect(source.connections.has(Direction.West)).toBe(false);
  });

  it('customConnections works for Sink tiles (north+west only)', () => {
    const northWest = new Set([Direction.North, Direction.West]);
    const sink = new Tile(PipeShape.Sink, 0, true, 0, 0, null, 1, northWest);
    expect(sink.connections.has(Direction.North)).toBe(true);
    expect(sink.connections.has(Direction.West)).toBe(true);
    expect(sink.connections.has(Direction.East)).toBe(false);
    expect(sink.connections.has(Direction.South)).toBe(false);
  });

  it('customConnections defaults to null (rotation-based connections used)', () => {
    const chamber = new Tile(PipeShape.Chamber, 0, true, 5, 0, null, 1, null, 'tank');
    expect(chamber.customConnections).toBeNull();
    expect(chamber.connections.size).toBe(4);
  });
});
