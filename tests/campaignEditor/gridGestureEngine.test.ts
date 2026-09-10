/**
 * @jest-environment jsdom
 */
/**
 * GridGestureEngine — shared drag/erase/click gesture state machine used by
 * both the level editor (EditorInputHandler) and the chapter map editor
 * (ChapterMapInput). See src/campaignEditor/gridGestureEngine.ts.
 */
import type { GestureRules, LeftMouseDownAction } from '../../src/campaignEditor/gridGestureEngine';
import { GridGestureEngine } from '../../src/campaignEditor/gridGestureEngine';
import type { TileDef } from '../../src/types';
import { PipeShape } from '../../src/types';

function fakeTile(): TileDef {
  return { shape: PipeShape.Straight, rotation: 0 } as TileDef;
}

type FakeRules = Record<keyof GestureRules, jest.Mock>;

/** Builds a fully-stubbed GestureRules; individual mocks are overridden per test. */
function createFakeRules(overrides: Partial<GestureRules> = {}): FakeRules {
  const base: FakeRules = {
    canvasPos: jest.fn(() => ({ row: 0, col: 0 })),
    decideLeftMouseDown: jest.fn((): LeftMouseDownAction => ({ type: 'immediate' })),
    paintCell: jest.fn(),
    eraseCell: jest.fn(() => false),
    canDropTileAt: jest.fn(() => true),
    onTileMoved: jest.fn(),
    onTileClicked: jest.fn(),
    onRightClick: jest.fn(),
    onWheel: jest.fn(),
    onGestureEnd: jest.fn(),
    onHoverChanged: jest.fn(),
  };
  return Object.assign(base, overrides);
}

/** Real usage always has the canvas in the document — the engine's window-level
 *  mouseup listener (so drags can end outside the canvas) depends on bubbling,
 *  which requires the element to be attached. */
function createAttachedCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return canvas;
}

function leftMouseDown(canvas: HTMLCanvasElement, opts: Partial<MouseEventInit> = {}): void {
  canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, ...opts }));
}

function rightMouseDown(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
}

function mouseMove(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
}

function mouseUp(target: HTMLCanvasElement | Window, button = 0): void {
  target.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true }));
}

/** attach() adds a window-level 'mouseup' listener; tracking + detaching every
 *  engine here keeps that from leaking across tests. */
const _trackedEngines: GridGestureEngine[] = [];
function createTrackedEngine(...args: ConstructorParameters<typeof GridGestureEngine>): GridGestureEngine {
  const engine = new GridGestureEngine(...args);
  _trackedEngines.push(engine);
  return engine;
}
afterEach(() => {
  for (const engine of _trackedEngines) engine.detach();
  _trackedEngines.length = 0;
  document.body.innerHTML = '';
});

describe('GridGestureEngine — attach/detach', () => {
  test('attach() wires mousedown so a left-click asks rules.decideLeftMouseDown', () => {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules();
    const renderCanvas = jest.fn();
    const engine = createTrackedEngine(rules, { renderCanvas });
    engine.attach(canvas);

    leftMouseDown(canvas);

    expect(rules.decideLeftMouseDown).toHaveBeenCalledTimes(1);
    expect(rules.decideLeftMouseDown).toHaveBeenCalledWith({ row: 0, col: 0 }, expect.any(MouseEvent));
  });

  test('an "immediate" action starts no drag', () => {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules();
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);

    leftMouseDown(canvas);

    expect(engine.paintDragActive).toBe(false);
    expect(engine.dragState).toBeNull();
  });

  test('detach() removes listeners — mousedown after detach does not call rules', () => {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules();
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    engine.detach();

    leftMouseDown(canvas);

    expect(rules.decideLeftMouseDown).not.toHaveBeenCalled();
  });

  test('detach() before any attach() is a safe no-op', () => {
    const rules = createFakeRules();
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });

    expect(() => engine.detach()).not.toThrow();
  });

  test('re-attaching to a different canvas moves listeners off the old one', () => {
    const oldCanvas = createAttachedCanvas();
    const newCanvas = createAttachedCanvas();
    const rules = createFakeRules();
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(oldCanvas);

    engine.attach(newCanvas);
    leftMouseDown(oldCanvas);
    expect(rules.decideLeftMouseDown).not.toHaveBeenCalled();

    leftMouseDown(newCanvas);
    expect(rules.decideLeftMouseDown).toHaveBeenCalledTimes(1);
  });
});

describe('GridGestureEngine — paint-drag', () => {
  function attachPaintDragEngine() {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules({
      decideLeftMouseDown: jest.fn((): LeftMouseDownAction => ({ type: 'startPaintDrag' })),
    });
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    return { canvas, rules, engine };
  }

  test('startPaintDrag begins a paint-drag and paints the mousedown cell', () => {
    const { canvas, rules, engine } = attachPaintDragEngine();

    leftMouseDown(canvas);

    expect(engine.paintDragActive).toBe(true);
    expect(rules.paintCell).toHaveBeenCalledWith({ row: 0, col: 0 });
  });

  test('paint-drag move paints each new cell the cursor enters', () => {
    const { canvas, rules, engine } = attachPaintDragEngine();
    leftMouseDown(canvas);
    rules.paintCell.mockClear();
    rules.canvasPos.mockReturnValue({ row: 1, col: 2 });

    mouseMove(canvas);

    expect(engine.paintDragActive).toBe(true);
    expect(rules.paintCell).toHaveBeenCalledWith({ row: 1, col: 2 });
  });

  test('paint-drag end (mouseup) always fires onGestureEnd("paintDrag")', () => {
    const { canvas, rules, engine } = attachPaintDragEngine();
    leftMouseDown(canvas);

    mouseUp(canvas);

    expect(engine.paintDragActive).toBe(false);
    expect(rules.onGestureEnd).toHaveBeenCalledWith('paintDrag', 'mouseup');
  });
});

describe('GridGestureEngine — tile-drag', () => {
  function attachTileDragEngine(overrides: Partial<GestureRules> = {}) {
    const canvas = createAttachedCanvas();
    const tile = fakeTile();
    const rules = createFakeRules({
      decideLeftMouseDown: jest.fn((): LeftMouseDownAction => ({ type: 'startTileDrag', tile })),
      ...overrides,
    });
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    return { canvas, rules, engine, tile };
  }

  test('startTileDrag tracks dragState at the mousedown cell, not yet moved', () => {
    const { canvas, engine, tile } = attachTileDragEngine();

    leftMouseDown(canvas);

    expect(engine.dragState).toEqual({
      startPos: { row: 0, col: 0 },
      currentPos: { row: 0, col: 0 },
      tile,
      moved: false,
    });
  });

  test('tile-drag move to a droppable cell updates currentPos and sets moved', () => {
    const { canvas, rules, engine } = attachTileDragEngine();
    leftMouseDown(canvas);
    rules.canvasPos.mockReturnValue({ row: 3, col: 4 });

    mouseMove(canvas);

    expect(engine.dragState?.currentPos).toEqual({ row: 3, col: 4 });
    expect(engine.dragState?.moved).toBe(true);
  });

  test('tile-drag move back to the start cell cancels the move', () => {
    const { canvas, rules, engine } = attachTileDragEngine();
    leftMouseDown(canvas);
    rules.canvasPos.mockReturnValue({ row: 3, col: 4 });
    mouseMove(canvas);
    rules.canvasPos.mockReturnValue({ row: 0, col: 0 });

    mouseMove(canvas);

    expect(engine.dragState?.currentPos).toEqual({ row: 0, col: 0 });
    expect(engine.dragState?.moved).toBe(false);
  });

  test('tile-drag move to a non-droppable cell is ignored', () => {
    const { canvas, rules, engine } = attachTileDragEngine({ canDropTileAt: jest.fn(() => false) });
    leftMouseDown(canvas);
    rules.canvasPos.mockReturnValue({ row: 3, col: 4 });

    mouseMove(canvas);

    expect(engine.dragState?.currentPos).toEqual({ row: 0, col: 0 });
    expect(engine.dragState?.moved).toBe(false);
  });

  test('tile-drag end when moved calls onTileMoved and clears dragState', () => {
    const { canvas, rules, engine } = attachTileDragEngine();
    leftMouseDown(canvas);
    rules.canvasPos.mockReturnValue({ row: 3, col: 4 });
    mouseMove(canvas);

    mouseUp(canvas);

    expect(rules.onTileMoved).toHaveBeenCalledWith(
      expect.objectContaining({ startPos: { row: 0, col: 0 }, currentPos: { row: 3, col: 4 }, moved: true }),
    );
    expect(rules.onTileClicked).not.toHaveBeenCalled();
    expect(engine.dragState).toBeNull();
  });

  test('tile-drag end when not moved calls onTileClicked', () => {
    const { canvas, rules, engine } = attachTileDragEngine();
    leftMouseDown(canvas);

    mouseUp(canvas);

    expect(rules.onTileClicked).toHaveBeenCalledWith(
      expect.objectContaining({ startPos: { row: 0, col: 0 }, moved: false }),
      expect.any(MouseEvent),
    );
    expect(rules.onTileMoved).not.toHaveBeenCalled();
    expect(engine.dragState).toBeNull();
  });
});

function contextMenu(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

describe('GridGestureEngine — erase-drag and contextmenu suppression', () => {
  function attachEngine(overrides: Partial<GestureRules> = {}) {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules(overrides);
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    return { canvas, rules, engine };
  }

  test('right mousedown starts an erase-drag and erases the initial cell', () => {
    const { canvas, rules, engine } = attachEngine();

    rightMouseDown(canvas);

    expect(engine.rightEraseDragActive).toBe(true);
    expect(rules.eraseCell).toHaveBeenCalledWith({ row: 0, col: 0 });
  });

  test('erase-drag move erases each new cell the cursor enters', () => {
    const { canvas, rules, engine } = attachEngine();
    rightMouseDown(canvas);
    rules.eraseCell.mockClear();
    rules.canvasPos.mockReturnValue({ row: 5, col: 6 });

    mouseMove(canvas);

    expect(engine.rightEraseDragActive).toBe(true);
    expect(rules.eraseCell).toHaveBeenCalledWith({ row: 5, col: 6 });
  });

  test('erase-drag end fires onGestureEnd("eraseDrag") when something actually changed', () => {
    const { canvas, rules, engine } = attachEngine({ eraseCell: jest.fn(() => true) });
    rightMouseDown(canvas);

    mouseUp(canvas, 2);

    expect(engine.rightEraseDragActive).toBe(false);
    expect(rules.onGestureEnd).toHaveBeenCalledWith('eraseDrag', 'mouseup');
  });

  test('erase-drag end fires nothing when nothing changed', () => {
    const { canvas, rules, engine } = attachEngine({ eraseCell: jest.fn(() => false) });
    rightMouseDown(canvas);

    mouseUp(canvas, 2);

    expect(engine.rightEraseDragActive).toBe(false);
    expect(rules.onGestureEnd).not.toHaveBeenCalled();
  });

  test('a right-click drag sequence suppresses the contextmenu that follows it', () => {
    const { canvas, rules, engine } = attachEngine();
    rightMouseDown(canvas);
    mouseUp(canvas, 2);

    contextMenu(canvas);

    expect(rules.onRightClick).not.toHaveBeenCalled();
    void engine;
  });

  test('suppressNextContextMenu reflects the flag: true right after a right-click drag, consumed by the next contextmenu', () => {
    const { canvas, engine } = attachEngine();
    expect(engine.suppressNextContextMenu).toBe(false);

    rightMouseDown(canvas);
    mouseUp(canvas, 2);
    expect(engine.suppressNextContextMenu).toBe(true);

    contextMenu(canvas);
    expect(engine.suppressNextContextMenu).toBe(false);
  });

  test('a bare contextmenu with no preceding right-mousedown calls onRightClick', () => {
    const { canvas, rules } = attachEngine();

    contextMenu(canvas);

    expect(rules.onRightClick).toHaveBeenCalledWith({ row: 0, col: 0 });
  });
});

function mouseLeave(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
}

describe('GridGestureEngine — mouseleave and window-level mouseup', () => {
  test('mouseleave cancels an in-flight tile-drag without calling onTileMoved/onTileClicked', () => {
    const canvas = createAttachedCanvas();
    const tile = fakeTile();
    const rules = createFakeRules({
      decideLeftMouseDown: jest.fn((): LeftMouseDownAction => ({ type: 'startTileDrag', tile })),
    });
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    leftMouseDown(canvas);
    rules.canvasPos.mockReturnValue({ row: 3, col: 4 });
    mouseMove(canvas);

    mouseLeave(canvas);

    expect(engine.dragState).toBeNull();
    expect(rules.onTileMoved).not.toHaveBeenCalled();
    expect(rules.onTileClicked).not.toHaveBeenCalled();
  });

  test('mouseleave during a paint-drag ends it and fires onGestureEnd with trigger "mouseleave"', () => {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules({
      decideLeftMouseDown: jest.fn((): LeftMouseDownAction => ({ type: 'startPaintDrag' })),
    });
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    leftMouseDown(canvas);

    mouseLeave(canvas);

    expect(engine.paintDragActive).toBe(false);
    expect(rules.onGestureEnd).toHaveBeenCalledWith('paintDrag', 'mouseleave');
  });

  test('mouseleave during an erase-drag that changed something fires onGestureEnd with trigger "mouseleave"', () => {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules({ eraseCell: jest.fn(() => true) });
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    rightMouseDown(canvas);

    mouseLeave(canvas);

    expect(engine.rightEraseDragActive).toBe(false);
    expect(rules.onGestureEnd).toHaveBeenCalledWith('eraseDrag', 'mouseleave');
  });

  test('mouseup on window (outside the canvas) still ends an active paint-drag', () => {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules({
      decideLeftMouseDown: jest.fn((): LeftMouseDownAction => ({ type: 'startPaintDrag' })),
    });
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    leftMouseDown(canvas);

    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));

    expect(engine.paintDragActive).toBe(false);
    expect(rules.onGestureEnd).toHaveBeenCalledWith('paintDrag', 'mouseup');
  });
});

function wheel(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1 }));
}

describe('GridGestureEngine — hover tracking and wheel', () => {
  function attachEngine(overrides: Partial<GestureRules> = {}) {
    const canvas = createAttachedCanvas();
    const rules = createFakeRules(overrides);
    const engine = createTrackedEngine(rules, { renderCanvas: jest.fn() });
    engine.attach(canvas);
    return { canvas, rules, engine };
  }

  test('mousemove (with no active gesture) tracks hover and notifies rules', () => {
    const { canvas, rules, engine } = attachEngine();
    rules.canvasPos.mockReturnValue({ row: 2, col: 9 });

    mouseMove(canvas);

    expect(engine.hover).toEqual({ row: 2, col: 9 });
    expect(rules.onHoverChanged).toHaveBeenCalledWith({ row: 2, col: 9 });
  });

  test('mouseleave clears hover and notifies rules', () => {
    const { canvas, rules, engine } = attachEngine();
    rules.canvasPos.mockReturnValue({ row: 2, col: 9 });
    mouseMove(canvas);
    rules.onHoverChanged.mockClear();

    mouseLeave(canvas);

    expect(engine.hover).toBeNull();
    expect(rules.onHoverChanged).toHaveBeenCalledWith(null);
  });

  test('wheel forwards the event and the current hover position to rules.onWheel', () => {
    const { canvas, rules, engine } = attachEngine();
    rules.canvasPos.mockReturnValue({ row: 7, col: 1 });
    mouseMove(canvas);

    wheel(canvas);

    expect(rules.onWheel).toHaveBeenCalledWith(expect.any(WheelEvent), { row: 7, col: 1 });
    void engine;
  });
});
