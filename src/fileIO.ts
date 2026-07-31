import { gzipString, ungzipBytes, blobToBytes, isGzipBytes } from './campaignEditor/types';

/** Delay (ms) before revoking the object URL after triggering a file download. */
const DOWNLOAD_URL_REVOKE_DELAY_MS = 10_000;
/** Reject pathologically large imports (raw bytes) — self-inflicted DoS guard. */
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
/** Reject decompression bombs — cap the decoded text length. */
const MAX_DECODED_TEXT_CHARS = 20 * 1024 * 1024;

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

/** Trigger a browser download of plain (uncompressed) JSON text — for files meant to be hand-edited directly. */
export function downloadJson(json: string, filename: string): void {
  try {
    const blob = new Blob([json], { type: 'application/json' });
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
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`File "${file.name}" is too large (${file.size} bytes; limit ${MAX_IMPORT_FILE_BYTES}).`);
  }
  try {
    const bytes = await blobToBytes(file);
    const text = isGzipBytes(bytes) ? await ungzipBytes(bytes) : new TextDecoder().decode(bytes);
    if (text.length > MAX_DECODED_TEXT_CHARS) {
      throw new Error(`File "${file.name}" expands too large (${text.length} chars; limit ${MAX_DECODED_TEXT_CHARS}).`);
    }
    return text;
  } catch (err) {
    throw new Error(`Failed to read file "${file.name}": ${describeError(err)}`);
  }
}
