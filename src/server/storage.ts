import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { AppError } from '@/lib/http';
import { UPLOAD_MAX_BYTES, UPLOAD_TYPES } from '@/lib/teaching';

/**
 * File storage for academic documents.
 *
 * Production: Vercel Blob, configured by BLOB_READ_WRITE_TOKEN (set by the
 * Vercel dashboard when a Blob store is connected; never sent to a browser).
 * Files are written with `access: 'private'` by default — so a file has no
 * public URL, and the only way to read one is the authorized download route,
 * which checks who is asking first. BLOB_ACCESS=public is honoured for a store
 * created as public, and even then the URL is never handed out.
 *
 * Development without a token: a local folder (.data/uploads), so the
 * workflow can be exercised without cloud credentials. Refused in production.
 */

const LOCAL_ROOT = path.join(process.cwd(), '.data', 'uploads');

function driver(): 'blob' | 'local' {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.NODE_ENV !== 'production') return 'local';
  throw new AppError(
    'File storage is not configured, so files cannot be uploaded yet. Please contact the administrator.',
    503,
    undefined,
    'STORAGE_NOT_CONFIGURED',
  );
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
export async function checkUpload(file: File): Promise<CheckedUpload> {
  const name = file.name.replace(/[\\/]/g, '_').slice(-200) || 'file';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const type = UPLOAD_TYPES[ext];
  if (!type) throw new AppError('That file type is not allowed. Upload a PDF, Word, Excel, PowerPoint, JPG or PNG file.', 422, { file: ['File type not allowed.'] });
  if (file.size === 0) throw new AppError('The file is empty.', 422, { file: ['The file is empty.'] });
  if (file.size > UPLOAD_MAX_BYTES) throw new AppError('The file is larger than 4 MB.', 422, { file: ['The file is larger than 4 MB.'] });

  const bytes = Buffer.from(await file.arrayBuffer());
  const ok = (SIGNATURES[ext] ?? []).some((sig) => sig.every((b, i) => bytes[i] === b));
  if (!ok) throw new AppError('The file content does not match its type.', 422, { file: ['The file content does not match its type.'] });
  return { name, type, size: file.size, ext, bytes };
}

/** Store a checked upload under an unguessable name; returns its storage key. */
export async function storeUpload(folder: string, upload: CheckedUpload): Promise<string> {
  const key = `${folder}/${randomBytes(16).toString('hex')}.${upload.ext}`;
  if (driver() === 'blob') {
    const result = await put(key, upload.bytes, { access: access(), contentType: upload.type, addRandomSuffix: false });
    return result.pathname;
  }
  const target = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, upload.bytes);
  return key;
}

export async function readStored(key: string): Promise<{ body: ReadableStream<Uint8Array> | Buffer; size: number | null } | null> {
  if (driver() === 'blob') {
    const result = await get(key, { access: access() });
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
