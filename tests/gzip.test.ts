/**
 * Tests for gzip helpers: gzipString, ungzipBytes, blobToBytes, isGzipBytes.
 * Runs in the default Node.js environment (no @jest-environment jsdom needed)
 * because DecompressionStream / CompressionStream / TextEncoder / FileReader are
 * all available as globals in Node.js 18+.
 */

import { gzipString, ungzipBytes, blobToBytes, isGzipBytes } from '../src/campaignEditor/types';

describe('gzip helpers', () => {
  beforeAll(() => {
    // Polyfill Compression/DecompressionStream for jsdom / older Node environments
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const webStreams = require('node:stream/web') as any;
    const g = globalThis as Record<string, unknown>;
    if (!g.CompressionStream) g.CompressionStream = webStreams.CompressionStream;
    if (!g.DecompressionStream) g.DecompressionStream = webStreams.DecompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require('node:util') as any;
    if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;
    if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder;
  });

  describe('isGzipBytes', () => {
    it('returns true for bytes starting with gzip magic number', () => {
      expect(isGzipBytes(new Uint8Array([0x1f, 0x8b, 0x00]))).toBe(true);
    });
    it('returns false for plain text bytes', () => {
      expect(isGzipBytes(new TextEncoder().encode('{"hello":"world"}'))).toBe(false);
    });
    it('returns false for empty or single-byte input', () => {
      expect(isGzipBytes(new Uint8Array([]))).toBe(false);
      expect(isGzipBytes(new Uint8Array([0x1f]))).toBe(false);
    });
  });

  describe('gzipString / ungzipBytes round-trip', () => {
    it('round-trips a simple string', async () => {
      const text = 'hello world';
      const compressed = await gzipString(text);
      expect(isGzipBytes(compressed)).toBe(true);
      const result = await ungzipBytes(compressed);
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
      const compressed = await gzipString(json);
      expect(isGzipBytes(compressed)).toBe(true);
      const result = await ungzipBytes(compressed);
      expect(result).toBe(json);
      expect(JSON.parse(result)).toEqual(campaign);
    });

    it('round-trips unicode content', async () => {
      const text = 'Héllo Wörld 🌊 pipes game → ←';
      const compressed = await gzipString(text);
      const result = await ungzipBytes(compressed);
      expect(result).toBe(text);
    });
  });

  describe('blobToBytes', () => {
    it('converts a Blob to Uint8Array', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const blob = new Blob([bytes]);
      const result = await blobToBytes(blob);
      expect(result).toEqual(bytes);
    });
  });
});

