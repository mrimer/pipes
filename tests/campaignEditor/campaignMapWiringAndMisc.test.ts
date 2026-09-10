/**
 * @jest-environment jsdom
 */

import {
  CampaignMapEditorSection,
  type CampaignMapEditorCallbacks,
} from '../../src/campaignEditor/campaignMapEditor';
import type { CampaignDef } from '../../src/types';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
describe('CampaignMapEditorSection – campaign-map canvas context is wired after buildSection', () => {
  const MOCK_CTX = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: jest.fn(), strokeRect: jest.fn(), clearRect: jest.fn(),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), fill: jest.fn(), arc: jest.fn(), ellipse: jest.fn(),
    translate: jest.fn(), rotate: jest.fn(), restore: jest.fn(), save: jest.fn(),
    scale: jest.fn(), setTransform: jest.fn(), drawImage: jest.fn(),
    closePath: jest.fn(), clip: jest.fn(), rect: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(), strokeText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => MOCK_CTX,
      configurable: true,
    });
  });

  function _isMockClearable(v: unknown): v is jest.Mock {
    return v !== null && typeof v === 'function' && 'mockClear' in v;
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    // Reset all spy call histories before each test.
    Object.values(MOCK_CTX).forEach(v => {
      if (_isMockClearable(v)) v.mockClear();
    });
  });

  /** Construct a CampaignMapEditorSection with minimal no-op callbacks. */
  function makeSection(): CampaignMapEditorSection {
    const noop = () => {};
    const cbs: CampaignMapEditorCallbacks = {
      buildBtn: (_l, _bg, _c, onClick) => {
        const btn = document.createElement('button');
        btn.addEventListener('click', onClick);
        return btn;
      },
      getActiveCampaign: () => null,
      touchCampaign: noop,
      saveCampaigns: noop,
      openChapterEditor: noop,
    };
    return new CampaignMapEditorSection(cbs);
  }

  /** Minimal campaign with an explicit 3×6 map grid. */
  function makeCampaign(): CampaignDef {
    return {
      id: 'ctx_test_cmp',
      name: 'Ctx Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [] }],
      rows: 3,
      cols: 6,
    };
  }

  it('_ctx is non-null after buildSection (regression: was null when ctx was grabbed before _attachInput)', () => {
    const section = makeSection();
    const campaign = makeCampaign();
    section.init(campaign);
    section.buildSection(campaign, false);
    // The bug: _detachInput (called inside _attachInput) was nulling _ctx, and
    // _buildCanvas was grabbing the context BEFORE calling _attachInput, so _ctx
    // ended up null and the map rendered blank.
    expect(section['_ctx']).not.toBeNull();
  });

  it('render calls at least one drawing primitive after buildSection', () => {
    const section = makeSection();
    const campaign = makeCampaign();
    section.init(campaign);
    section.buildSection(campaign, false);
    const drawCalls =
      MOCK_CTX.fillRect.mock.calls.length +
      MOCK_CTX.stroke.mock.calls.length +
      MOCK_CTX.strokeRect.mock.calls.length;
    expect(drawCalls).toBeGreaterThan(0);
  });

  it('translate (when called) receives finite numeric arguments', () => {
    const section = makeSection();
    const campaign = makeCampaign();
    section.init(campaign);
    section.buildSection(campaign, false);
    for (const call of MOCK_CTX.translate.mock.calls) {
      const [x, y] = call as unknown[];
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
      expect(Number.isFinite(x as number)).toBe(true);
      expect(Number.isFinite(y as number)).toBe(true);
    }
  });
});

describe('CampaignEditor import read errors', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows detailed read errors when the selected file is too large', async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-big.pipes.json');
    const origCreate = document.createElement.bind(document) as (tag: string) => HTMLElement;
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        const input = el as HTMLInputElement;
        Object.defineProperty(input, 'click', {
          value: () => {
            Object.defineProperty(input, 'files', { value: [oversized], configurable: true });
            input.dispatchEvent(new Event('change'));
          },
          writable: true,
        });
      }
      return el;
    });

    try {
      const editor = makeEditor();
      (editor as unknown as { _importExportFlow: { importCampaign(): void } })._importExportFlow.importCampaign();
    } finally {
      createSpy.mockRestore();
    }

    await Promise.resolve();
    await Promise.resolve();

    expect(document.body.textContent).toContain('too large');
  });
});

// ─── updateUndoRedoButtonPair ─────────────────────────────────────────────────

import { updateUndoRedoButtonPair } from '../../src/uiHelpers';

describe('updateUndoRedoButtonPair', () => {
  function makeBtn(id: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = id;
    document.body.appendChild(btn);
    return btn;
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('disables undo and enables redo when canUndo=false, canRedo=true', () => {
    const undo = makeBtn('test-undo');
    const redo = makeBtn('test-redo');
    updateUndoRedoButtonPair('test-undo', 'test-redo', false, true);
    expect(undo.disabled).toBe(true);
    expect(undo.style.opacity).toBe('0.4');
    expect(redo.disabled).toBe(false);
    expect(redo.style.opacity).toBe('1');
  });

  it('enables both when canUndo=true, canRedo=true', () => {
    const undo = makeBtn('test-undo2');
    const redo = makeBtn('test-redo2');
    updateUndoRedoButtonPair('test-undo2', 'test-redo2', true, true);
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(false);
  });

  it('silently ignores missing button ids', () => {
    expect(() =>
      updateUndoRedoButtonPair('does-not-exist-undo', 'does-not-exist-redo', true, false),
    ).not.toThrow();
  });
});
