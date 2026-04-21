import { gzipString, ungzipBytes, blobToBytes, isGzipBytes } from './campaignEditor/types';

/** Delay (ms) before revoking the object URL after triggering a file download. */
const DOWNLOAD_URL_REVOKE_DELAY_MS = 10_000;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Compress JSON text with gzip and trigger a browser download. */
export async function downloadGzipJson(json: string, filename: string): Promise<void> {
  let compressed: Uint8Array;
  try {
    compressed = await gzipString(json);
  } catch (err) {
    throw new Error(`Failed to compress JSON for "${filename}": ${describeError(err)}`);
  }

  try {
    const buf = compressed.buffer.slice(
      compressed.byteOffset,
      compressed.byteOffset + compressed.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([buf], { type: 'application/gzip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS);
  } catch (err) {
    throw new Error(`Failed to trigger download for "${filename}": ${describeError(err)}`);
  }
}

/** Read a File and return text, automatically decompressing gzip inputs. */
export async function readGzipOrJsonFile(file: File): Promise<string> {
  try {
    const bytes = await blobToBytes(file);
    if (isGzipBytes(bytes)) {
      return await ungzipBytes(bytes);
    }
    return new TextDecoder().decode(bytes);
  } catch (err) {
    throw new Error(`Failed to read file "${file.name}": ${describeError(err)}`);
  }
}
