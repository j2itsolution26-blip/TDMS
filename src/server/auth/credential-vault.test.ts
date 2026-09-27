import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  sealTemporaryPassword,
  openTemporaryPassword,
  vaultConfigured,
  describeVault,
  revealWindowHours,
} from './credential-vault';

/**
 * The sealed store for temporary passwords.
 *
 * The properties: it round-trips; every kind of tampering reads as "not
 * available" rather than garbage or a crash; a ciphertext is bound to one user;
 * the ciphertext never contains the password; and nothing works without a
 * proper key.
 */

const KEYS = ['TEMP_CREDENTIAL_KEY', 'TEMP_CREDENTIAL_REVEAL_HOURS'] as const;
let saved: Record<string, string | undefined>;
const KEY = randomBytes(32).toString('base64');
const PASSWORD = 'Institution#2026xQ';

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.TEMP_CREDENTIAL_KEY = KEY;
  delete process.env.TEMP_CREDENTIAL_REVEAL_HOURS;
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('sealing', () => {
  it('round-trips for the same user', () => {
    const sealed = sealTemporaryPassword(PASSWORD, 28n);
    expect(openTemporaryPassword(sealed, 28n)).toBe(PASSWORD);
  });

  it('never contains the password', () => {
    const sealed = sealTemporaryPassword(PASSWORD, 28n);
    expect(sealed).not.toContain(PASSWORD);
    expect(Buffer.from(sealed).toString('base64')).not.toContain(Buffer.from(PASSWORD).toString('base64'));
  });

  it('uses a fresh IV every time', () => {
    expect(sealTemporaryPassword(PASSWORD, 28n)).not.toBe(sealTemporaryPassword(PASSWORD, 28n));
  });
});

describe('everything that is not exactly right reads as unavailable', () => {
  it('another user cannot open it', () => {
    const sealed = sealTemporaryPassword(PASSWORD, 28n);
    expect(openTemporaryPassword(sealed, 31n)).toBeNull();
  });

  it('a tampered ciphertext does not open', () => {
    const sealed = sealTemporaryPassword(PASSWORD, 28n);
    const parts = sealed.split('.');
    const ct = Buffer.from(parts[3]!, 'base64');
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString('base64');
    expect(openTemporaryPassword(parts.join('.'), 28n)).toBeNull();
  });

  it('a rotated key does not open old rows', () => {
    const sealed = sealTemporaryPassword(PASSWORD, 28n);
    process.env.TEMP_CREDENTIAL_KEY = randomBytes(32).toString('base64');
    expect(openTemporaryPassword(sealed, 28n)).toBeNull();
  });

  it('an emptied or malformed row does not open', () => {
    for (const junk of ['', 'v1', 'v1.a.b', 'v2.a.b.c', 'not-sealed-at-all']) {
      expect(openTemporaryPassword(junk, 28n)).toBeNull();
    }
  });
});

describe('the key', () => {
  it('is required: without it nothing seals or opens', () => {
    const sealed = sealTemporaryPassword(PASSWORD, 28n);
    delete process.env.TEMP_CREDENTIAL_KEY;
    expect(vaultConfigured()).toBe(false);
    expect(() => sealTemporaryPassword(PASSWORD, 28n)).toThrow(/TEMP_CREDENTIAL_KEY/);
    expect(openTemporaryPassword(sealed, 28n)).toBeNull();
  });

  it('must be exactly 32 bytes; anything else counts as unconfigured', () => {
    for (const bad of [randomBytes(16).toString('base64'), randomBytes(31).toString('base64'), 'short', '   ']) {
      process.env.TEMP_CREDENTIAL_KEY = bad;
      expect(vaultConfigured()).toBe(false);
    }
  });

  it('is never reported, only whether it is configured', () => {
    expect(JSON.stringify(describeVault())).not.toContain(KEY);
    expect(describeVault().configured).toBe(true);
  });
});

describe('reveal window', () => {
  it('defaults to three days and is capped at thirty', () => {
    expect(revealWindowHours()).toBe(72);
    process.env.TEMP_CREDENTIAL_REVEAL_HOURS = '24';
    expect(revealWindowHours()).toBe(24);
    process.env.TEMP_CREDENTIAL_REVEAL_HOURS = '100000';
    expect(revealWindowHours()).toBe(720);
    process.env.TEMP_CREDENTIAL_REVEAL_HOURS = 'nonsense';
    expect(revealWindowHours()).toBe(72);
  });
});
