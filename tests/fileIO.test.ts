/**
 * @jest-environment jsdom
 */

import { TextDecoder, TextEncoder } from 'util';
import { readGzipOrJsonFile } from '../src/fileIO';

describe('readGzipOrJsonFile', () => {
  beforeAll(() => {
    (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
    (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
  });

  it('rejects oversized files before reading bytes', async () => {
    const arrayBuffer = jest.fn<Promise<ArrayBuffer>, []>(() => Promise.resolve(new ArrayBuffer(0)));
    const oversized = {
      name: 'too-big.json',
      size: 5 * 1024 * 1024 + 1,
      arrayBuffer,
    } as unknown as File;

    await expect(readGzipOrJsonFile(oversized)).rejects.toThrow(
      'File "too-big.json" is too large (5242881 bytes; limit 5242880).',
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects files that decode beyond text length limit', async () => {
    const hugeText = 'x'.repeat(21 * 1024 * 1024);
    const bytes = new TextEncoder().encode(hugeText);
    const file = {
      name: 'huge.json',
      size: 1,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    } as unknown as File;

    await expect(readGzipOrJsonFile(file)).rejects.toThrow(
      'expands too large',
    );
  });

  it('reads a normal small json file', async () => {
    const file = new File(['{"ok":true}'], 'small.json', { type: 'application/json' });
    await expect(readGzipOrJsonFile(file)).resolves.toBe('{"ok":true}');
  });
});
