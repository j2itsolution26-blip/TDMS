import { afterEach, describe, expect, it, vi } from 'vitest';
import { put } from '@vercel/blob';
import { checkUpload, describeStorage, storeUpload } from './storage';

vi.mock('@vercel/blob', () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));

/** What may be uploaded, and where it may be kept. */

const file = (bytes: number[] | string, name: string, type = 'application/pdf') =>
  new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name, { type });

afterEach(() => vi.unstubAllEnvs());

describe('checkUpload', () => {
  it('accepts a real PDF', async () => {
    const ok = await checkUpload(file('%PDF-1.4\n%%EOF\n', 'plan.pdf'));
    expect(ok.ext).toBe('pdf');
  });

  it('refuses a file whose content is not what its name says', async () => {
    await expect(checkUpload(file('MZ executable', 'plan.pdf'))).rejects.toThrow();
  });

  it('refuses a type outside the policy', async () => {
    await expect(checkUpload(file('#!/bin/sh', 'run.sh', 'text/x-sh'))).rejects.toThrow();
  });

  it('refuses an empty file', async () => {
    await expect(checkUpload(file('', 'empty.pdf'))).rejects.toThrow();
  });
});

describe('where files are kept', () => {
  it('refuses in production when no storage is configured, rather than losing the file', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('FILE_STORAGE', '');
    const upload = await checkUpload(file('%PDF-1.4\n', 'plan.pdf'));
    await expect(storeUpload('documents/test', upload)).rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED' });
  });

  it('never uses the local disk on Vercel, even when asked to', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('FILE_STORAGE', 'local');
    vi.stubEnv('VERCEL', '1');
    const upload = await checkUpload(file('%PDF-1.4\n', 'plan.pdf'));
    await expect(storeUpload('documents/test', upload)).rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED' });
  });
});

describe('when Vercel Blob is configured', () => {
  it('stores the file privately under a generated key, never the uploaded name', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    vi.mocked(put).mockImplementation(async (pathname) => ({ pathname }) as Awaited<ReturnType<typeof put>>);
    const upload = await checkUpload(file('%PDF-1.4\n', '../../etc/passwd.pdf'));
    const key = await storeUpload('students/7/credentials', upload);
    expect(key).toMatch(/^students\/7\/credentials\/[0-9a-f]{32}\.pdf$/);
    expect(vi.mocked(put).mock.calls[0][2]).toMatchObject({ access: 'private', addRandomSuffix: false, contentType: 'application/pdf' });
  });

  it('a storage failure is reported, not swallowed — the caller changes no record', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    vi.mocked(put).mockRejectedValue(new Error('Blob store unavailable'));
    const upload = await checkUpload(file('%PDF-1.4\n', 'birth-certificate.pdf'));
    await expect(storeUpload('students/7/credentials', upload)).rejects.toThrow('Blob store unavailable');
  });
});

describe('describeStorage (for /api/health)', () => {
  it('production without a Blob token: not configured — the cause of the upload error', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('FILE_STORAGE', '');
    vi.stubEnv('BLOB_STORE_ID', '');
    expect(describeStorage()).toEqual({ driver: 'not configured', access: null, auth: null });
  });
  it('with a Blob token: Vercel Blob, private by default', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    vi.stubEnv('BLOB_ACCESS', '');
    expect(describeStorage()).toEqual({ driver: 'vercel-blob', access: 'private', auth: 'token' });
  });
  it('with only BLOB_STORE_ID (a store connected the current way): Vercel Blob over OIDC', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('BLOB_STORE_ID', 'store_test');
    expect(describeStorage()).toEqual({ driver: 'vercel-blob', access: 'private', auth: 'oidc' });
  });
});

describe('a store named by BLOB_STORE_ID', () => {
  it('uploads go to Blob, not refused as unconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('BLOB_STORE_ID', 'store_test');
    vi.mocked(put).mockImplementation(async (pathname) => ({ pathname }) as Awaited<ReturnType<typeof put>>);
    const upload = await checkUpload(file('%PDF-1.4\n', 'form-137.pdf'));
    await expect(storeUpload('students/7/credentials', upload)).resolves.toMatch(/^students\/7\/credentials\//);
  });
  it('without an OIDC token for the request: a clear 503, not an opaque 500', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('BLOB_STORE_ID', 'store_test');
    vi.mocked(put).mockRejectedValue(new Error('Vercel Blob: No blob credentials found. Pass a `token` option, set `BLOB_READ_WRITE_TOKEN`, or use `oidcToken`.'));
    const upload = await checkUpload(file('%PDF-1.4\n', 'form-137.pdf'));
    await expect(storeUpload('students/7/credentials', upload)).rejects.toMatchObject({ status: 503, code: 'STORAGE_AUTH_FAILED' });
  });
});
