/**
 * Generic gzip compression/decompression and Blob-reading helpers. Kept
 * outside campaignEditor/ (where this logic originally lived) so non-campaign
 * code — e.g. profile persistence, via fileIO.ts — doesn't have to depend on
 * a campaign-editor module for a format-agnostic concern.
 */

/**
 * Compress a string to gzip and return the result as a `Uint8Array`.
 * Uses the Web Streams `CompressionStream` API (available in all modern browsers
 * and Node.js 18+).
 *
 * Writing and reading happen concurrently so that the readable side is drained
 * while the writable side is still flushing.  This avoids a backpressure
 * deadlock that can occur when all data is written (and the stream closed)
 * before any compressed output is consumed.
 */
export async function gzipString(text: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(text);
  const cs = new CompressionStream('gzip');

  // Kick off writing without awaiting – reading will proceed in parallel.
  const writer = cs.writable.getWriter();
  const writeFinished = writer.write(input).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Ensure the write side completed without error.
  await writeFinished;

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Decompress a gzip `Blob` or raw bytes and return the contained text.
 * Uses the Web Streams `DecompressionStream` API.
 *
 * Reading and writing proceed concurrently (same rationale as {@link gzipString}).
 */
export async function ungzipBytes(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  // Copy to a plain ArrayBuffer to satisfy strict BufferSource typing.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  // Kick off writing without awaiting – reading will proceed in parallel.
  const writeFinished = writer.write(copy as unknown as BufferSource).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Ensure the write side completed without error.
  await writeFinished;

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Read a `Blob` into a `Uint8Array`.
 * Uses `blob.arrayBuffer()` when available; falls back to `FileReader` for
 * environments that lack it (e.g. jsdom).
 */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const buf: ArrayBuffer = 'arrayBuffer' in blob
    ? await blob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(blob);
    });
  return new Uint8Array(buf);
}

/** Gzip magic bytes: every valid gzip stream starts with 0x1f 0x8b. */
export function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
