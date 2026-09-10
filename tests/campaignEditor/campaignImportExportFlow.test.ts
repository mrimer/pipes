/**
 * @jest-environment jsdom
 *
 * Direct unit tests for CampaignImportExportFlow, constructed standalone
 * (fake CampaignService + EditorDialogs + callbacks) rather than through a
 * full CampaignEditor — the locality win this extraction is meant to prove.
 */

import { CampaignImportExportFlow } from '../../src/campaignEditor/campaignImportExportFlow';
import type { CampaignImportExportCallbacks } from '../../src/campaignEditor/campaignImportExportFlow';
import type { CampaignService, ImportResult, CampaignTextPack, TextPackMergeResult } from '../../src/campaignEditor/campaignService';
import type { EditorDialogs } from '../../src/campaignEditor/editorDialogs';
import type { CampaignDef } from '../../src/types';
import { FILE_TYPE_CAMPAIGN_TEXT_PACK } from '../../src/profile/playerProfile';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';

// jsdom does not implement TextEncoder/TextDecoder; readGzipOrJsonFile needs them.
const g = globalThis as Record<string, unknown>;
if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;
if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder;

function makeCampaign(overrides: Partial<CampaignDef> = {}): CampaignDef {
  return { id: 'cmp_1', name: 'Test Campaign', author: 'Tester', chapters: [], ...overrides };
}

function makeFakeService(): jest.Mocked<Pick<CampaignService,
  'exportToJson' | 'exportTextPack' | 'parseImport' | 'acceptImport' | 'parseTextPack' | 'mergeTextPack' | 'getCampaignByGuid'>> {
  return {
    exportToJson: jest.fn<string, [CampaignDef]>(),
    exportTextPack: jest.fn<string, [CampaignDef, string]>(),
    parseImport: jest.fn<ImportResult, [string]>(),
    acceptImport: jest.fn<void, [ImportResult]>(),
    parseTextPack: jest.fn<CampaignTextPack, [string]>(),
    mergeTextPack: jest.fn<TextPackMergeResult, [CampaignTextPack, { overwrite?: boolean } | undefined]>(),
    getCampaignByGuid: jest.fn<CampaignDef | null, [string]>(),
  };
}

function makeFakeDialogs(): jest.Mocked<Pick<EditorDialogs,
  'showMessage' | 'showExportTextsDialog' | 'showImportSameVersion' | 'showImportVersionConflict' | 'showTextPackImportConfirm'>> {
  return {
    showMessage: jest.fn<void, [string, string, string?]>(),
    showExportTextsDialog: jest.fn<void, [string, (locale: string) => void]>(),
    showImportSameVersion: jest.fn<void, [string, string | undefined]>(),
    showImportVersionConflict: jest.fn<void, [CampaignDef, CampaignDef, boolean, () => void]>(),
    showTextPackImportConfirm: jest.fn<void, [string, string, (overwrite: boolean) => void]>(),
  };
}

function makeFlow(service: ReturnType<typeof makeFakeService>, dialogs: ReturnType<typeof makeFakeDialogs>) {
  const callbacks: jest.Mocked<CampaignImportExportCallbacks> = {
    hide: jest.fn<void, []>(),
    onPlayCampaign: jest.fn<void, [CampaignDef]>(),
  };
  const flow = new CampaignImportExportFlow(
    service as unknown as CampaignService,
    dialogs as unknown as EditorDialogs,
    callbacks,
  );
  return { flow, callbacks };
}

/** Simulate a file-picker selection by intercepting the hidden `<input type=file>` Flow creates. */
function simulateFilePick(json: string): void {
  const origCreate = document.createElement.bind(document) as (tag: string) => HTMLElement;
  jest.spyOn(document, 'createElement').mockImplementationOnce((tag: string) => {
    const el = origCreate(tag);
    if (tag === 'input') {
      const input = el as HTMLInputElement;
      Object.defineProperty(input, 'click', {
        value: () => {
          const file = new File([json], 'test.json', { type: 'application/json' });
          const buf = new TextEncoder().encode(json).buffer;
          Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(buf) });
          Object.defineProperty(input, 'files', { value: [file], configurable: true });
          input.dispatchEvent(new Event('change'));
        },
        writable: true,
      });
    }
    return el;
  });
}

const flushMicrotasks = (): Promise<void> => Promise.resolve().then(() => Promise.resolve());

beforeEach(() => {
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:fake';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
  jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
  jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CampaignImportExportFlow.exportCampaign', () => {
  it('logs and stops without touching dialogs when JSON serialization throws', () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    service.exportToJson.mockImplementation(() => { throw new Error('boom'); });
    const { flow } = makeFlow(service, dialogs);

    expect(() => flow.exportCampaign(makeCampaign())).not.toThrow();
    expect(dialogs.showMessage).not.toHaveBeenCalled();
  });
});

describe('CampaignImportExportFlow.exportCampaignTexts', () => {
  it('shows an error dialog when exportTextPack throws', () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    service.exportTextPack.mockImplementation(() => { throw new Error('bad locale'); });
    dialogs.showExportTextsDialog.mockImplementation((_name, onConfirm) => onConfirm('fr'));
    const { flow } = makeFlow(service, dialogs);

    flow.exportCampaignTexts(makeCampaign());

    expect(dialogs.showMessage).toHaveBeenCalledWith(
      expect.any(String),
      'Error: bad locale',
      expect.any(String),
    );
  });

  it('downloads and shows a success dialog on successful export', () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    service.exportTextPack.mockReturnValue('{"locale":"fr"}');
    dialogs.showExportTextsDialog.mockImplementation((_name, onConfirm) => onConfirm('fr'));
    const { flow } = makeFlow(service, dialogs);

    flow.exportCampaignTexts(makeCampaign());

    expect(service.exportTextPack).toHaveBeenCalledWith(expect.objectContaining({ id: 'cmp_1' }), 'fr');
    expect(dialogs.showMessage).toHaveBeenCalledTimes(1);
    expect(dialogs.showMessage.mock.calls[0][2]).toBeUndefined(); // success path passes no color
  });
});

describe('CampaignImportExportFlow.importCampaign', () => {
  it('shows a parse-error dialog for malformed JSON', async () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    const { flow } = makeFlow(service, dialogs);
    simulateFilePick('not json{{{');

    flow.importCampaign();
    await flushMicrotasks();

    expect(service.parseImport).not.toHaveBeenCalled();
    expect(dialogs.showMessage).toHaveBeenCalledTimes(1);
  });

  it('routes text-pack payloads to the text-pack merge path, not parseImport', async () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    const pack: CampaignTextPack = { campaignGuid: 'guid-1', locale: 'fr', campaign: { name: 'x' }, chapters: [] };
    service.parseTextPack.mockReturnValue(pack);
    service.getCampaignByGuid.mockReturnValue(makeCampaign({ id: 'cmp_guid' }));
    const { flow } = makeFlow(service, dialogs);
    simulateFilePick(JSON.stringify({ type: FILE_TYPE_CAMPAIGN_TEXT_PACK, ...pack }));

    flow.importCampaign();
    await flushMicrotasks();

    expect(service.parseTextPack).toHaveBeenCalled();
    expect(service.parseImport).not.toHaveBeenCalled();
    expect(dialogs.showTextPackImportConfirm).toHaveBeenCalledTimes(1);
  });

  it('accepts a no-conflict import, then hides and hands the campaign to onPlayCampaign', async () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    const imported = makeCampaign({ id: 'cmp_new' });
    service.parseImport.mockReturnValue({ campaign: imported, conflict: 'none' });
    const { flow, callbacks } = makeFlow(service, dialogs);
    simulateFilePick(JSON.stringify(imported));

    flow.importCampaign();
    await flushMicrotasks();

    expect(service.acceptImport).toHaveBeenCalledWith(expect.objectContaining({ conflict: 'none' }));
    expect(callbacks.hide).toHaveBeenCalledTimes(1);
    expect(callbacks.onPlayCampaign).toHaveBeenCalledWith(imported);
  });

  it('shows the same-version dialog and does not accept the import', async () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    const imported = makeCampaign({ id: 'cmp_same', lastUpdated: '2024-01-01T00:00:00.000Z' });
    service.parseImport.mockReturnValue({ campaign: imported, conflict: 'same_version' });
    const { flow, callbacks } = makeFlow(service, dialogs);
    simulateFilePick(JSON.stringify(imported));

    flow.importCampaign();
    await flushMicrotasks();

    expect(dialogs.showImportSameVersion).toHaveBeenCalledWith('Test Campaign', imported.lastUpdated);
    expect(service.acceptImport).not.toHaveBeenCalled();
    expect(callbacks.onPlayCampaign).not.toHaveBeenCalled();
  });

  it('only accepts a version-conflict import once the confirm callback fires', async () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    const imported = makeCampaign({ id: 'cmp_conflict' });
    const existing = makeCampaign({ id: 'cmp_conflict', name: 'Existing' });
    service.parseImport.mockReturnValue({ campaign: imported, conflict: 'version_conflict', existing, isNewer: true });
    let capturedConfirm: (() => void) | undefined;
    dialogs.showImportVersionConflict.mockImplementation((_imp, _exist, _newer, onConfirm) => { capturedConfirm = onConfirm; });
    const { flow, callbacks } = makeFlow(service, dialogs);
    simulateFilePick(JSON.stringify(imported));

    flow.importCampaign();
    await flushMicrotasks();

    expect(service.acceptImport).not.toHaveBeenCalled();
    expect(callbacks.onPlayCampaign).not.toHaveBeenCalled();

    capturedConfirm!();

    expect(service.acceptImport).toHaveBeenCalledTimes(1);
    expect(callbacks.hide).toHaveBeenCalledTimes(1);
    expect(callbacks.onPlayCampaign).toHaveBeenCalledWith(imported);
  });
});

describe('CampaignImportExportFlow text-pack merge', () => {
  function textPackFile(pack: CampaignTextPack): void {
    simulateFilePick(JSON.stringify({ type: FILE_TYPE_CAMPAIGN_TEXT_PACK, ...pack }));
  }

  it('shows campaignNotFound and never calls mergeTextPack when the guid does not match', async () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    const pack: CampaignTextPack = { campaignGuid: 'missing-guid', locale: 'fr', campaign: { name: 'x' }, chapters: [] };
    service.parseTextPack.mockReturnValue(pack);
    service.getCampaignByGuid.mockReturnValue(null);
    const { flow } = makeFlow(service, dialogs);
    textPackFile(pack);

    flow.importCampaign();
    await flushMicrotasks();

    expect(dialogs.showTextPackImportConfirm).not.toHaveBeenCalled();
    expect(service.mergeTextPack).not.toHaveBeenCalled();
    expect(dialogs.showMessage).toHaveBeenCalledTimes(1);
  });

  it('merges with the overwrite flag chosen in the confirm dialog and reports the summary', async () => {
    const service = makeFakeService();
    const dialogs = makeFakeDialogs();
    const pack: CampaignTextPack = { campaignGuid: 'guid-2', locale: 'fr', campaign: { name: 'x' }, chapters: [] };
    const matched = makeCampaign({ id: 'cmp_matched' });
    service.parseTextPack.mockReturnValue(pack);
    service.getCampaignByGuid.mockReturnValue(matched);
    service.mergeTextPack.mockReturnValue({
      campaign: matched, locale: 'fr', added: 2, skipped: 1, overwritten: 0, unmatchedNodes: 0,
    });
    dialogs.showTextPackImportConfirm.mockImplementation((_name, _locale, onConfirm) => onConfirm(true));
    const { flow } = makeFlow(service, dialogs);
    textPackFile(pack);

    flow.importCampaign();
    await flushMicrotasks();

    expect(service.mergeTextPack).toHaveBeenCalledWith(pack, { overwrite: true });
    expect(dialogs.showMessage).toHaveBeenCalledTimes(1);
  });
});
