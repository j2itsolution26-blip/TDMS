import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';


const { hashPassword, verifyPassword, needsRehash } = await import('./password');

describe('password hashing', () => {
  it('writes Argon2id hashes, never plaintext', async () => {
    const hash = await hashPassword('Correct#Horse2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Correct#Horse2026');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Correct#Horse2026');
    expect(await verifyPassword('Correct#Horse2026', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('still verifies a legacy Laravel $2y$ bcrypt hash', async () => {
    const legacy = (await bcrypt.hash('Laravel#Pass1', 4)).replace(/^\$2b\$/, '$2y$');
    expect(await verifyPassword('Laravel#Pass1', legacy)).toBe(true);
    expect(await verifyPassword('nope', legacy)).toBe(false);
  });

  it('treats a malformed or unknown hash as a wrong password', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'plaintext')).toBe(false);
    expect(await verifyPassword('x', '$argon2id$garbage')).toBe(false);
  });

  it('flags bcrypt and weaker Argon2id hashes for upgrade, not current ones', async () => {
    expect(needsRehash(await bcrypt.hash('a', 4))).toBe(true);
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA')).toBe(true);
    expect(needsRehash(await hashPassword('a'))).toBe(false);
  });
});
