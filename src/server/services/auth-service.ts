import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { verifyPassword, hashPassword, needsRehash } from '@/server/auth/password';
import { createSession, destroyCurrentSession } from '@/server/auth/session';
import {
  isInstitutionalEmail,
  normalizeEmail,
  DOMAIN_REJECTION_MESSAGE,
} from '@/lib/institutional-email';
import {
  checkLoginThrottle,
  hitLoginThrottle,
  clearLoginThrottle,
  loginThrottleKey,
} from '@/server/auth/rate-limit';

/**
 * Authentication service.
 *
 * The whole sign-in decision lives here, on the server, and every account
 * goes through it identically. There is no demo shortcut, no seeded bypass
 * and no credential of any kind in this file.
 *
 * Order of checks, and why:
 *   1. rate limit        — before any work is done
 *   2. identifier shape  — a non-institutional email is refused outright
 *   3. lookup + password — always a bcrypt compare, even with no match
 *   4. email verified    — after the password, never before
 *   5. account status    — after the password, never before
 *
 * Steps 4 and 5 come last on purpose. Reporting "unverified" or "inactive"
 * to someone who has not proved they own the account would turn those
 * messages into an oracle for which addresses exist.
 */

const GENERIC_FAILURE = 'Invalid username/email or password.';
const UNVERIFIED_MESSAGE = 'Please verify your institutional email before signing in.';
const INACTIVE_MESSAGE = 'Your account is inactive. Please contact the administrator.';
const SUSPENDED_MESSAGE = 'Your account has been suspended. Please contact the administrator.';

export interface LoginInput {
  identifier: string;
  password: string;
  remember: boolean;
}

export interface LoginContext {
  ip: string;
  userAgent: string | null;
}

export interface LoginResult {
  userId: bigint;
  redirectTo: string;
}

/**
 * Split the "Username or Email" field into the column to match on.
 *
 * Both sides are lower-cased, so an email matches case-insensitively and so
 * does a username.
 */
export function resolveIdentifier(raw: string): { column: 'email' | 'username'; value: string } {
  const trimmed = raw.trim();
  return {
    column: trimmed.includes('@') ? 'email' : 'username',
    value: trimmed.toLowerCase(),
  };
}

export async function login(input: LoginInput, context: LoginContext): Promise<LoginResult> {
  const { column, value } = resolveIdentifier(input.identifier);
  const throttleKey = loginThrottleKey(value, context.ip);

  const throttle = await checkLoginThrottle(throttleKey);
  if (throttle.limited) {
    throw new AppError(
      `Too many login attempts. Please try again in ${throttle.retryAfterSeconds} seconds.`,
      429,
    );
  }

  /*
   * An address on the wrong domain cannot belong to a TDMS account, so it is
   * refused by name rather than with the generic message. This discloses
   * nothing: it is a statement about the domain, identical for every address
   * on it, and says nothing about whether any account exists.
   *
   * A username is not checked here — usernames carry no domain. The account
   * behind it still had to be created with an institutional address.
   */
  if (column === 'email' && !isInstitutionalEmail(value)) {
    await hitLoginThrottle(throttleKey);
    throw new AppError(DOMAIN_REJECTION_MESSAGE, 403);
  }

  const user = await prisma.user.findFirst({
    where:
      column === 'email'
        ? { email: { equals: normalizeEmail(value), mode: 'insensitive' } }
        : { username: { equals: value, mode: 'insensitive' } },
    select: { id: true, password: true, status: true, emailVerifiedAt: true, email: true },
  });

  /*
   * Always run a bcrypt comparison, even when no user matched, against a
   * real hash of the same cost. Skipping it would let an attacker tell
   * "no such account" from "wrong password" by timing alone.
   */
  const passwordValid = await verifyPassword(input.password, user?.password ?? DUMMY_HASH);

  if (!user || !passwordValid) {
    await hitLoginThrottle(throttleKey);
    logAuthDebug({ column, userFound: Boolean(user), passwordVerified: false });
    throw new AppError(GENERIC_FAILURE, 401);
  }

  // From here the caller has proved they own the account, so a specific
  // reason is safe — and necessary, or they cannot act on it.

  if (!user.emailVerifiedAt) {
    await hitLoginThrottle(throttleKey);
    logAuthDebug({ column, userFound: true, passwordVerified: true, status: user.status });
    throw new AppError(UNVERIFIED_MESSAGE, 403);
  }

  if (user.status !== 'ACTIVE') {
    await hitLoginThrottle(throttleKey);
    logAuthDebug({ column, userFound: true, passwordVerified: true, status: user.status });
    throw new AppError(
      user.status === 'SUSPENDED' ? SUSPENDED_MESSAGE : INACTIVE_MESSAGE,
      403,
    );
  }

  /*
   * An account whose address is no longer institutional cannot sign in even
   * if it once could — covers a domain change, or a record edited directly
   * in the database.
   */
  if (!isInstitutionalEmail(user.email)) {
    await hitLoginThrottle(throttleKey);
    throw new AppError(DOMAIN_REJECTION_MESSAGE, 403);
  }

  // Opportunistic upgrade if the stored hash predates the current cost.
  if (needsRehash(user.password)) {
    await prisma.user
      .update({ where: { id: user.id }, data: { password: await hashPassword(input.password) } })
      .catch(() => undefined);
  }

  await clearLoginThrottle(throttleKey);

  await createSession(user.id, {
    remember: input.remember,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  logAuthDebug({
    column,
    userFound: true,
    passwordVerified: true,
    status: user.status,
    session: true,
  });

  return { userId: user.id, redirectTo: '/dashboard' };
}

export async function logout(): Promise<void> {
  await destroyCurrentSession();
}

/**
 * A real bcrypt hash at production cost, used only to equalise timing on the
 * "no such user" path. It is not a credential: no password is known that
 * produces it, and it is never written anywhere.
 */
const DUMMY_HASH = '$2b$12$6p0lwdiEfXY6J3XH0FMYuebojRn6x/FQwr7ud0jKiWqjIOLNquerS';

/**
 * Development-only trace. Booleans and a status string only — no identifier
 * value, password, hash, cookie or token is ever passed in.
 */
function logAuthDebug(stages: {
  column: string;
  userFound: boolean;
  passwordVerified: boolean;
  status?: string;
  session?: boolean;
}): void {
  if (process.env.NODE_ENV === 'production') return;
  console.debug('AUTH DEBUG', {
    lookup_column: stages.column,
    user_found: stages.userFound,
    password_verified: stages.passwordVerified,
    account_status: stages.status ?? null,
    session_created: stages.session ?? false,
  });
}
