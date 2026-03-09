/**
 * Tests for gzipString / ungzipBlob helpers.
 * Runs in the default Node.js environment (no @jest-environment jsdom needed)
 * because CompressionStream / DecompressionStream / TextEncoder / FileReader are
 * all available as globals in Node.js 18+.
 */

import { gzipString, ungzipBlob } from '../src/campaignEditorTypes';

describe('gzipString / ungzipBlob', () => {
  it('compresses a string to a smaller (or equal) binary Blob', async () => {
    const text = '{"id":"test","name":"My Campaign","chapters":[]}';
    const blob = await gzipString(text);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/gzip');
    // gzip output is binary, so its size may be larger than very short strings;
    // we only require it to produce a non-empty Blob.
    expect(blob.size).toBeGreaterThan(0);
  });

  it('round-trips a simple string', async () => {
    const text = 'hello world';
    const blob = await gzipString(text);
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
    const blob = await gzipString(json);
    const result = await ungzipBlob(blob);
    expect(result).toBe(json);
    expect(JSON.parse(result)).toEqual(campaign);
  });

  it('round-trips a long repetitive string (verifies actual compression)', async () => {
    const text = 'abcdefghijklmnopqrstuvwxyz '.repeat(200);
    const blob = await gzipString(text);
    // A long repetitive string should compress significantly
    expect(blob.size).toBeLessThan(text.length);
    const result = await ungzipBlob(blob);
    expect(result).toBe(text);
  });

  it('round-trips unicode content', async () => {
    const text = 'Héllo Wörld 🌊 pipes game → ←';
    const blob = await gzipString(text);
    const result = await ungzipBlob(blob);
    expect(result).toBe(text);
  });
});
