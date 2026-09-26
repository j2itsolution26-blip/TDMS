import 'server-only';
import { cookies } from 'next/headers';
import { COMPLETION_WINDOW_MINUTES, CODE_TTL_MINUTES, isWellFormedHandle } from './verification-code';

/**
 * The cookie that carries one Super Admin registration attempt from the
 * details form, through the emailed code, to account creation.
 *
 * A cookie rather than an identifier in the page, for two reasons:
 *
 *   * it survives a refresh, so reloading the verification screen resumes it
 *     instead of stranding the operator with a code and nowhere to type it;
 *   * it is HttpOnly, so the page cannot read it and a script on the page
 *     cannot lift it. Verification attempts therefore cannot be aimed at a
 *     pending registration the browser does not hold.
 *
 * It contains only an opaque random handle — no email address, no name, no
 * indication of progress. Everything the screen displays comes from the
 * server, looked up by the SHA-256 of this value.
 *
 * Its lifetime covers the code's own window plus the time allowed to finish
 * account creation afterwards, and nothing beyond that.
 */

const COOKIE = 'tdms_admin_setup';

function maxAgeSeconds(): number {
  return (CODE_TTL_MINUTES + COMPLETION_WINDOW_MINUTES) * 60;
}

export async function storeHandle(handle: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, handle, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds(),
  });
}

/** The handle this request carries, or null. Shape-checked before any query. */
export async function readHandle(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (!value || !isWellFormedHandle(value)) return null;
  return value;
}

/** Cleared once the flow is finished or abandoned, success or failure. */
export async function clearHandle(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
