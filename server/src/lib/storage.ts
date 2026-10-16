import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { AppError } from '@/server/lib/http';
import { UPLOAD_MAX_BYTES, UPLOAD_TYPES } from '@shared/lib/teaching';

/**
 * File storage for academic documents.
 *
 * Production: Vercel Blob. Connecting a Blob store to the Vercel project sets
 * one of two things, depending on when and how it was connected:
 *   * BLOB_STORE_ID — current stores: the SDK authenticates with the
 *     deployment's short-lived OIDC token (Vercel supplies it per request), so
 *     no long-lived secret exists at all; or
 *   * BLOB_READ_WRITE_TOKEN — older stores: a server-only secret.
 * @vercel/blob picks whichever is present; neither is ever sent to a browser.
 * Files are written with `access: 'private'` by default — so a file has no
 * public URL, and the only way to read one is the authorized download route,
 * which checks who is asking first. BLOB_ACCESS=public is honoured for a store
 * created as public, and even then the URL is never handed out.
 *
 * Development without a token: a local folder (.data/uploads), so the
 * workflow can be exercised without cloud credentials.
 *
 * A self-hosted production server with a persistent disk may opt in to that
 * folder with FILE_STORAGE=local. Never on Vercel: its filesystem is discarded
 * between requests, so files would silently disappear. Without either setting,
 * production refuses uploads with a clear message rather than losing them.
 */

const LOCAL_ROOT = path.join(process.cwd(), '.data', 'uploads');

function blobAuth(): 'token' | 'oidc' | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'token';
  if (process.env.BLOB_STORE_ID) return 'oidc';
  return null;
}

function driver(): 'blob' | 'local' {
  if (blobAuth()) return 'blob';
  if (process.env.NODE_ENV !== 'production') return 'local';
  if (process.env.FILE_STORAGE === 'local' && !process.env.VERCEL) return 'local';
  throw new AppError(
    'File storage is not configured, so files cannot be uploaded yet. Please contact the administrator.',
    503,
    undefined,
    'STORAGE_NOT_CONFIGURED',
  );
}

/** For /api/health: where uploads are stored, or that they are refused. Never a token or a path. */
export function describeStorage(): {
  driver: 'vercel-blob' | 'local-disk' | 'not configured';
  access: 'private' | 'public' | null;
  auth: 'token' | 'oidc' | null;
} {
  try {
    const d = driver();
    return { driver: d === 'blob' ? 'vercel-blob' : 'local-disk', access: d === 'blob' ? access() : null, auth: blobAuth() };
  } catch {
    return { driver: 'not configured', access: null, auth: null };
  }
}

/**
 * The store is named (BLOB_STORE_ID) but this request carried no OIDC token —
 * OIDC is switched off for the project, or the code runs outside a Vercel
 * request. Said plainly instead of an opaque 500.
 */
function blobCall<T>(call: () => Promise<T>): Promise<T> {
  return call().catch((error: unknown) => {
    if (error instanceof Error && /No blob credentials found/.test(error.message)) {
      console.error('[TDMS] Vercel Blob: no credentials for this request.', error.message);
      throw new AppError(
        'File storage is connected but could not be reached with this deployment’s credentials. Please contact the administrator.',
        503,
        undefined,
        'STORAGE_AUTH_FAILED',
      );
    }
    throw error;
  });
}

function access(): 'private' | 'public' {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
}

/** What a file's first bytes must look like for its extension. */
const SIGNATURES: Record<string, number[][]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  // Office Open XML is a zip; the legacy formats are OLE compound files.
  docx: [[0x50, 0x4b, 0x03, 0x04]],
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
  pptx: [[0x50, 0x4b, 0x03, 0x04]],
  doc: [[0xd0, 0xcf, 0x11, 0xe0]],
  xls: [[0xd0, 0xcf, 0x11, 0xe0]],
  ppt: [[0xd0, 0xcf, 0x11, 0xe0]],
};

export interface CheckedUpload {
  name: string;
  type: string;
  size: number;
  ext: string;
  bytes: Buffer;
}

/**
 * The upload policy, enforced on the server: an allowed extension, a size
 * within the limit, and content whose signature matches the extension — a
 * renamed executable is refused however it is labelled.
 */
export async function checkUpload(
  file: File,
  // A narrower allowlist (and limit) for a particular kind of document (student credentials: PDF, JPG, PNG).
  allowed: { types: Record<string, string>; label: string; maxBytes?: number } = { types: UPLOAD_TYPES, label: 'PDF, Word, Excel, PowerPoint, JPG or PNG' },
): Promise<CheckedUpload> {
  const maxBytes = allowed.maxBytes ?? UPLOAD_MAX_BYTES;
  const tooLarge = `The file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  const name = file.name.replace(/[\\/]/g, '_').slice(-200) || 'file';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const type = allowed.types[ext];
  if (!type) throw new AppError(`That file type is not allowed. Upload a ${allowed.label} file.`, 422, { file: [`Upload a ${allowed.label} file.`] });
  if (file.size === 0) throw new AppError('The file is empty.', 422, { file: ['The file is empty.'] });
  if (file.size > maxBytes) throw new AppError(tooLarge, 422, { file: [tooLarge] });

  const bytes = Buffer.from(await file.arrayBuffer());
  const ok = (SIGNATURES[ext] ?? []).some((sig) => sig.every((b, i) => bytes[i] === b));
  if (!ok) throw new AppError('The file content does not match its type.', 422, { file: ['The file content does not match its type.'] });
  return { name, type, size: file.size, ext, bytes };
}

/** Store a checked upload under an unguessable name; returns its storage key. */
export async function storeUpload(folder: string, upload: CheckedUpload): Promise<string> {
  const key = `${folder}/${randomBytes(16).toString('hex')}.${upload.ext}`;
  if (driver() === 'blob') {
    const result = await blobCall(() => put(key, upload.bytes, { access: access(), contentType: upload.type, addRandomSuffix: false }));
    return result.pathname;
  }
  const target = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, upload.bytes);
  return key;
}

export async function readStored(key: string): Promise<{ body: ReadableStream<Uint8Array> | Buffer; size: number | null } | null> {
  if (driver() === 'blob') {
    const result = await blobCall(() => get(key, { access: access() }));
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, size: result.blob.size };
  }
  // Keys are generated here; refuse anything that would climb out of the folder.
  const target = path.resolve(LOCAL_ROOT, key);
  if (!target.startsWith(path.resolve(LOCAL_ROOT) + path.sep)) return null;
  try {
    const bytes = await readFile(target);
    return { body: bytes, size: bytes.length };
  } catch {
    return null;
  }
}

export async function deleteStored(key: string): Promise<void> {
  try {
    if (driver() === 'blob') await del(key);
    else {
      const target = path.resolve(LOCAL_ROOT, key);
      if (target.startsWith(path.resolve(LOCAL_ROOT) + path.sep)) await rm(target, { force: true });
    }
  } catch (error) {
    // A file left behind is harmless; failing the user's action over it is not.
    console.error('[TDMS] Could not delete a stored file:', error);
  }
}
