import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { verifyPassword, hashPassword, needsRehash } from '@/server/auth/password';
import { createSession, destroyCurrentSession } from '@/server/auth/session';
import {
  checkLoginThrottle,
  hitLoginThrottle,
  clearLoginThrottle,
  loginThrottleKey,
} from '@/server/auth/rate-limit';

/**
 * Authentication service — the Node replacement for App\Livewire\Forms\LoginForm.
 *
 * The whole login decision lives here, on the server, and every account goes
 * through it identically: there is no demo shortcut, no seeded bypass, and
 * no credential of any kind in this file. A demo account signs in because
 * its bcrypt hash verifies, exactly like anyone else's.
 */

/** Shown for a bad identifier AND for a bad password, deliberately. */
const GENERIC_FAILURE = 'Invalid username/email or password.';
const INACTIVE_MESSAGE = 'Your account is inactive. Please contact the administrator.';

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
 * Split the "Username or Email" field into the column it should match.
 *
 * Both sides are lower-cased so an email matches case-insensitively, and so
 * does a username — the column is new, so no case-sensitive username can be
 * broken by this. Whitespace is trimmed because it is almost always a paste
 * artefact rather than part of the credential.
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

  // Case-insensitive lookup on whichever column the identifier implies.
  // `mode: 'insensitive'` compiles to ILIKE-equivalent SQL through Prisma,
  // which is parameterised, so the identifier is never concatenated in.
  const user = await prisma.user.findFirst({
    where:
      column === 'email'
        ? { email: { equals: value, mode: 'insensitive' } }
        : { username: { equals: value, mode: 'insensitive' } },
    select: { id: true, password: true, isActive: true },
  });

  /*
   * Always run a bcrypt comparison, even when no user matched.
   *
   * Skipping it would let an attacker distinguish "no such account" from
   * "wrong password" by timing alone, which is the account-enumeration leak
   * Phase 12 asks to avoid. The dummy hash below is a real bcrypt hash of a
   * random value, so the work factor matches the genuine path.
   */
  const hashToCheck = user?.password ?? DUMMY_HASH;
  const passwordValid = await verifyPassword(input.password, hashToCheck);

  if (!user || !passwordValid) {
    await hitLoginThrottle(throttleKey);
    logAuthDebug({ column, userFound: Boolean(user), passwordVerified: false });
    throw new AppError(GENERIC_FAILURE, 401);
  }

  /*
   * Account status is checked only after the password is known to be
   * correct. Reversing the order would turn the "inactive" message into an
   * oracle: anyone could discover which accounts exist by watching for it.
   */
  if (!user.isActive) {
    await hitLoginThrottle(throttleKey);
    logAuthDebug({ column, userFound: true, passwordVerified: true, active: false });
    throw new AppError(INACTIVE_MESSAGE, 403);
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

  logAuthDebug({ column, userFound: true, passwordVerified: true, active: true, session: true });

  return { userId: user.id, redirectTo: '/dashboard' };
}

export async function logout(): Promise<void> {
  await destroyCurrentSession();
}

/**
 * A real bcrypt hash at the same cost as production hashes, used purely to
 * equalise timing on the "no such user" path. It is not a credential: no
 * password is known that produces it, and it is never written anywhere.
 */
const DUMMY_HASH = '$2b$12$6p0lwdiEfXY6J3XH0FMYuebojRn6x/FQwr7ud0jKiWqjIOLNquerS';

/**
 * Development-only trace of where an attempt landed.
 *
 * Booleans only. No identifier value, password, hash, cookie or token is
 * ever passed in, so enabling debug logging cannot leak a credential.
 */
function logAuthDebug(stages: {
  column: string;
  userFound: boolean;
  passwordVerified: boolean;
  active?: boolean;
  session?: boolean;
}): void {
  if (process.env.NODE_ENV === 'production') return;
  console.debug('AUTH DEBUG', {
    lookup_column: stages.column,
    user_found: stages.userFound,
    password_verified: stages.passwordVerified,
    account_active: stages.active ?? null,
    session_created: stages.session ?? false,
  });
}
