/**
 * @jest-environment jsdom
 */

import { importReplay } from '../src/profileIO';
import * as persistence from '../src/persistence';

jest.mock('../src/fileIO', () => ({
  ...jest.requireActual('../src/fileIO'),
  readGzipOrJsonFile: jest.fn(),
}));

describe('importReplay', () => {
  function mockFilePicker(): void {
    const originalCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string): HTMLElement => {
      const el = originalCreate(tagName);
      if (tagName.toLowerCase() === 'input') {
        const input = el as HTMLInputElement;
        Object.defineProperty(input, 'files', {
          configurable: true,
          get: () => [new File(['x'], 'replay.pipes.json', { type: 'application/json' })],
        });
        input.click = () => {
          input.dispatchEvent(new Event('change'));
        };
      }
      return el;
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects replay files with malformed record shape without crashing', async () => {
    const fileIo = await import('../src/fileIO');
    (fileIo.readGzipOrJsonFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        type: 'pipes-replay',
        version: 1,
        record: { campaignId: 'cmp_1', levelId: 1, moves: [] },
      }),
    );

    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const saveSpy = jest.spyOn(persistence, 'saveRecording');
    const onSuccess = jest.fn();

    mockFilePicker();

    importReplay([], onSuccess);
    await Promise.resolve();
    await Promise.resolve();

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/missing a valid string "id"/i));
    expect(saveSpy).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects replay files from newer versions', async () => {
    const fileIo = await import('../src/fileIO');
    (fileIo.readGzipOrJsonFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        type: 'pipes-replay',
        version: 99,
        record: { id: 'r1', campaignId: 'cmp_1', levelId: 1, moves: [] },
      }),
    );

    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const saveSpy = jest.spyOn(persistence, 'saveRecording');
    const onSuccess = jest.fn();
    mockFilePicker();

    importReplay([], onSuccess);
    await Promise.resolve();
    await Promise.resolve();

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/file from newer version/i));
    expect(saveSpy).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
