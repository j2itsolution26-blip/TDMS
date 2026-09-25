import 'server-only';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

/**
 * Server-side sessions, replacing Laravel's database session driver.
 *
 * Shape of the scheme:
 *   * A 32-byte random token is generated and handed to the browser inside
 *     an HTTP-only cookie. It is never logged and never rendered.
 *   * Only the SHA-256 of that token is stored, so a leaked database dump
 *     cannot be replayed as a live session — the same reason passwords are
 *     hashed. SHA-256 (not bcrypt) is right here because the input is
 *     already 256 bits of entropy, so there is nothing to brute force.
 *   * Every lookup is a single indexed read on the digest.
 *
 * Laravel's old `sessions` table is left in place but unused: its payload is
 * a PHP-serialised blob Node cannot read.
 */

const COOKIE_NAME = 'tdms_session';
const TOKEN_BYTES = 32;

/** Laravel's SESSION_LIFETIME was 120 minutes; the default is kept. */
const DEFAULT_LIFETIME_MINUTES = Number(process.env.SESSION_LIFETIME_MINUTES ?? 120);

/** "Remember me" kept the user signed in far longer. Laravel used 5 years. */
const REMEMBER_LIFETIME_MINUTES = 60 * 24 * 365 * 5;

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Cookie flags.
 *
 * `secure` is derived rather than hard-coded: forcing it on would silently
 * break sign-in over plain HTTP on localhost, because the browser would
 * refuse to store the cookie and the user would bounce straight back to
 * /login. On Vercel every request is HTTPS, so it is on in production.
 */
function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Issue a session for a user and set the cookie.
 *
 * Called only after the password has been verified and the account checked,
 * so reaching this function is itself the authorisation decision.
 */
export async function createSession(
  userId: bigint,
  options: { remember?: boolean; ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<CreatedSession> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const minutes = options.remember ? REMEMBER_LIFETIME_MINUTES : DEFAULT_LIFETIME_MINUTES;
  const expiresAt = new Date(Date.now() + minutes * 60_000);

  await prisma.session.create({
    data: {
      id: digest(token),
      userId,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
      expiresAt,
    },
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, cookieOptions(expiresAt));

  return { token, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  userId: bigint;
  expiresAt: Date;
}

/**
 * Resolve the request's cookie to a live session row, or null.
 *
 * An expired row is deleted on sight rather than merely ignored, which keeps
 * the table from growing without a scheduled cleanup job (see docs on cron).
 */
export async function resolveSession(): Promise<ResolvedSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: digest(token) },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return { sessionId: session.id, userId: session.userId, expiresAt: session.expiresAt };
}

/**
 * Laravel called Session::regenerate() right after a successful login to
 * blunt session fixation. The equivalent here is that createSession always
 * mints a brand new token, and this drops whatever the visitor arrived with.
 */
export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { id: digest(token) } }).catch(() => undefined);
  }

  jar.delete(COOKIE_NAME);
}

/** Sign a user out everywhere — used when an account is deactivated. */
export async function destroyAllSessionsFor(userId: bigint): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Slide the expiry forward on activity, mirroring Laravel's rolling window. */
export async function touchSession(sessionId: string, remember = false): Promise<void> {
  const minutes = remember ? REMEMBER_LIFETIME_MINUTES : DEFAULT_LIFETIME_MINUTES;
  await prisma.session
    .update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date(), expiresAt: new Date(Date.now() + minutes * 60_000) },
    })
    .catch(() => undefined);
}

/** Housekeeping for the scheduled job described in docs/deployment.md. */
export async function pruneExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return count;
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };

/** Constant-time compare, used by the password-reset token check. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
