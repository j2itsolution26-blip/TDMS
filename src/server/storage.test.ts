import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkUpload, storeUpload } from './storage';

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
