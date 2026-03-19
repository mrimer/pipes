/**
 * Tests for ungzipBlob helper.
 * Runs in the default Node.js environment (no @jest-environment jsdom needed)
 * because DecompressionStream / TextEncoder / FileReader are
 * all available as globals in Node.js 18+.
 */

import { ungzipBlob } from '../src/campaignEditor/types';

// Helper to gzip a string using Node.js built-ins (for test setup only)
async function gzipStringNode(text: string): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const webStreams = require('node:stream/web') as any;
  const { TextEncoder: NodeTextEncoder } = require('node:util') as any; // eslint-disable-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const input = new NodeTextEncoder().encode(text);
  const cs = new webStreams.CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  await writer.write(input);
  await writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read() as { done: boolean; value: Uint8Array };
    if (done) break;
    chunks.push(value);
  }
  return new Blob(chunks as BlobPart[], { type: 'application/gzip' });
}

describe('ungzipBlob', () => {
  beforeAll(() => {
    // Polyfill DecompressionStream for jsdom / older Node environments
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const webStreams = require('node:stream/web') as any;
    const g = globalThis as Record<string, unknown>;
    if (!g.DecompressionStream) g.DecompressionStream = webStreams.DecompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require('node:util') as any;
    if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;
    if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder;
  });

  it('round-trips a simple string', async () => {
    const text = 'hello world';
    const blob = await gzipStringNode(text);
    const result = await ungzipBlob(blob);
    expect(result).toBe(text);
  });

  it('round-trips a JSON campaign object', async () => {
    const campaign = {
      id: 'cmp_gzip_test',
      name: 'Gzip Test Campaign',
      author: 'Tester',
      chapters: [
        {
          id: 1,
          name: 'Chapter 1',
          levels: [
            {
              id: 99001,
              name: 'Level 1',
              rows: 3,
              cols: 3,
              grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
              inventory: [],
            },
          ],
        },
      ],
    };
    const json = JSON.stringify(campaign, null, 2);
    const blob = await gzipStringNode(json);
    const result = await ungzipBlob(blob);
    expect(result).toBe(json);
    expect(JSON.parse(result)).toEqual(campaign);
  });

  it('round-trips unicode content', async () => {
    const text = 'Héllo Wörld 🌊 pipes game → ←';
    const blob = await gzipStringNode(text);
    const result = await ungzipBlob(blob);
    expect(result).toBe(text);
  });
});
