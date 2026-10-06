import 'server-only';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';

/**
 * Passwords are hashed with Argon2id (the library's default algorithm) at the
 * OWASP-recommended baseline: 19 MiB memory, 2 iterations, 1 lane.
 *
 * Laravel wrote every existing hash with PHP's password_hash(PASSWORD_BCRYPT)
 * at cost 12 ($2y$). Those still verify — bcryptjs accepts $2y$ directly —
 * so no account needs a reset. needsRehash() reports every bcrypt hash as
 * stale, and the login path rewrites it as Argon2id the next time its owner
 * signs in with the correct password. Bcrypt support can be dropped once no
 * $2 hashes remain in users.password.
 */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const ARGON2_PREFIX = '$argon2id$';
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

export async function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // Both libraries throw on a malformed hash rather than returning false; a
  // corrupt row must read as "wrong password", never as a 500.
  try {
    if (hash.startsWith(ARGON2_PREFIX)) return await argon2Verify(hash, plain);
    if (BCRYPT_PATTERN.test(hash)) return await bcrypt.compare(plain, hash);
    return false;
  } catch {
    return false;
  }
}

/**
 * True when the stored hash is not Argon2id at the current parameters — a
 * legacy bcrypt hash, or an Argon2id hash from weaker settings.
 */
export function needsRehash(hash: string): boolean {
  if (!hash.startsWith(ARGON2_PREFIX)) return true;
  const match = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hash);
  if (!match) return true;
  const [, m, t, p] = match.map(Number);
  return (
    m < ARGON2_OPTIONS.memoryCost || t < ARGON2_OPTIONS.timeCost || p < ARGON2_OPTIONS.parallelism
  );
}
