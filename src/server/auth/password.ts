import 'server-only';
import bcrypt from 'bcryptjs';

/**
 * Laravel wrote every existing hash with PHP's password_hash(PASSWORD_BCRYPT)
 * at cost 12, which produces the $2y$ prefix. bcryptjs implements the same
 * corrected Blowfish variant as $2b$ and accepts $2y$ directly, so every
 * account that worked under Laravel keeps working here with no reset and no
 * rehash. BCRYPT_ROUNDS stays at 12 so new hashes match the old cost.
 */
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // bcryptjs throws on a malformed hash rather than returning false; a
  // corrupt row must read as "wrong password", never as a 500.
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** True when the stored hash was produced at a weaker cost than we now use. */
export function needsRehash(hash: string): boolean {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return match ? Number(match[1]) < ROUNDS : true;
}
