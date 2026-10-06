import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Sealed storage for a TEMPORARY password, so a Super Admin can reveal it again
 * until the Admin replaces it.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A HASH
 *
 * The login check uses the password hash on `users.password`, as it always has.
 * A hash cannot be reversed, so it cannot answer "show me the temporary
 * password again". Meeting that requirement without storing plaintext means
 * reversible encryption, under a key the database does not hold:
 *
 *   * AES-256-GCM, authenticated: a tampered or swapped ciphertext fails to
 *     open rather than decrypting to garbage.
 *   * a fresh random 96-bit IV per seal, so two identical passwords never
 *     produce the same ciphertext.
 *   * additional authenticated data binding each ciphertext to one user id, so
 *     a sealed row copied onto another account will not open.
 *   * the key is TEMP_CREDENTIAL_KEY in the server environment — never in the
 *     database, never NEXT_PUBLIC_, never logged. A database dump alone does not
 *     yield a single password.
 *
 * WHAT IT IS USED FOR, AND FOR HOW LONG
 *
 * Temporary passwords only, and only while they are temporary. The sealed copy
 * is wiped the moment the Admin chooses their own password, the Super Admin
 * reissues one, or the reveal window closes. A permanent password is never
 * sealed, never stored in any recoverable form, and can never be shown.
 *
 * THE HONEST LIMIT
 *
 * Anyone holding BOTH a database dump AND the key can read a temporary password
 * that is still inside its window. That is the unavoidable cost of "reveal it
 * again later", and it is bounded: the password is temporary, must be changed at
 * first sign-in, and is useless without a separately issued access code.
 */

const VARIABLE = 'TEMP_CREDENTIAL_KEY';
const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * The key, or null when it is not configured or not usable.
 *
 * Base64 of exactly 32 bytes (`openssl rand -base64 32`). A malformed value is
 * treated as unconfigured rather than padded or truncated into shape, because
 * a silently weakened key is worse than a clearly missing one.
 */
function key(): Buffer | null {
  const raw = process.env[VARIABLE]?.trim();
  if (!raw) return null;
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
  return decoded.length === KEY_BYTES ? decoded : null;
}

export function vaultConfigured(): boolean {
  return key() !== null;
}

/** For /api/health and the dashboard: whether it is configured, never the key. */
export function describeVault(): { configured: boolean; variable: string } {
  return { configured: vaultConfigured(), variable: VARIABLE };
}

export const VAULT_NOT_CONFIGURED =
  `Temporary passwords cannot be shown again because ${VARIABLE} is not configured. ` +
  'Set it in the server environment (openssl rand -base64 32), then reset the temporary password.';

/** What a sealed value is bound to: one user, and this purpose. */
function aad(userId: bigint | string): Buffer {
  return Buffer.from(`tdms:temporary-credential:${VERSION}:${userId.toString()}`, 'utf8');
}

/**
 * Seal a temporary password for one user.
 *
 * Throws when the vault is not configured: callers check vaultConfigured()
 * first and simply do not keep a revealable copy, rather than failing the
 * account operation.
 */
export function sealTemporaryPassword(plaintext: string, userId: bigint | string): string {
  const k = key();
  if (!k) throw new Error(VAULT_NOT_CONFIGURED);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  cipher.setAAD(aad(userId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/**
 * Open a sealed temporary password, or null.
 *
 * Null for anything that does not authenticate — an emptied row, a tampered
 * value, a row belonging to another user, a key that has since been rotated —
 * so every failure is the same clean "not available" and never a 500.
 */
export function openTemporaryPassword(sealed: string, userId: bigint | string): string | null {
  const k = key();
  if (!k || !sealed) return null;

  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
    const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'));
    decipher.setAAD(aad(userId));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** How long a temporary password stays revealable. Default three days. */
export function revealWindowHours(): number {
  const raw = Number(process.env.TEMP_CREDENTIAL_REVEAL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 24 * 30) : 72;
}
