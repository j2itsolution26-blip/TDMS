import 'server-only';
import { cookies } from 'next/headers';
import { generateHandle, hashHandle, isWellFormedHandle } from './verification-code';
import { loginChallengeTtlMinutes } from './admin-access-code';

/**
 * The cookie that carries one Admin sign-in from the password step to the
 * access-code step.
 *
 * It is NOT a session. It grants nothing: no page renders for it, no API call
 * is authorised by it, and getCurrentUser() has never heard of it. All it
 * does is name the half-finished sign-in this browser owns.
 *
 * That separation is deliberate. The alternative — issue the session at the
 * password step and mark it "not yet verified" — puts a credential in the
 * browser that has to be refused everywhere, and a cookie that middleware
 * reads as "signed in" while the app reads as "not signed in" is precisely
 * the shape that produced the /login redirect loop this codebase already
 * fixed once. See the note in src/middleware.ts.
 *
 * Same scheme as the Super Admin setup handle:
 *   * HttpOnly, so the page cannot read it and a script on the page cannot
 *     lift it — code attempts therefore cannot be aimed at a half-finished
 *     sign-in the browser does not hold;
 *   * opaque, so it carries no email address, no user id and no indication of
 *     progress. Everything the screen shows is looked up on the server from
 *     the SHA-256 of this value;
 *   * short-lived, matching the challenge row's own expiry.
 */

const COOKIE = 'tdms_admin_login';

export function generateChallengeHandle(): string {
  return generateHandle();
}

export function hashChallengeHandle(handle: string): string {
  return hashHandle(handle);
}

export async function storeChallengeHandle(handle: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, handle, {
    httpOnly: true,
    /*
     * Derived rather than forced on, for the same reason as the session
     * cookie: over plain http://localhost the browser silently refuses a
     * secure cookie, and the access-code screen would then look broken with
     * no explanation. Every request on Vercel is HTTPS.
     */
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: loginChallengeTtlMinutes() * 60,
  });
}

/** The handle this request carries, or null. Shape-checked before any query. */
export async function readChallengeHandle(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (!value || !isWellFormedHandle(value)) return null;
  return value;
}

/** Cleared when the sign-in completes, is abandoned, or is given up on. */
export async function clearChallengeHandle(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export { COOKIE as ADMIN_LOGIN_COOKIE_NAME };
