import { requestMemo } from '@/server/plugins/request-context';
import { redirect } from '@/server/lib/page-signals';
import { prisma } from '@/server/lib/prisma';
import { AppError, AuthenticationError, AuthorizationError } from '@/server/lib/http';
import type { AuthUser } from '@shared/types/domain';
import { loadRolesAndPermissions } from './rbac';
import { resolveSession } from './session';

/**
 * The request's principal, or null.
 *
 * requestMemo() dedupes this within one request, so the several services a
 * page loader calls can each ask "who is signed in?" for the cost of one
 * session lookup and one role lookup between them.
 *
 * This is the replacement for Laravel's Auth::user(), and it also absorbs
 * the EnsureAccountIsActive middleware: a user deactivated mid-session is
 * signed out on their very next request rather than lingering until their
 * session happens to expire.
 */
export const getCurrentUser = requestMemo(async (): Promise<AuthUser | null> => {
  const session = await resolveSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      mustChangePassword: true,
    },
  });

  /*
   * Deliberately read-only.
   *
   * It is tempting to clear the cookie here when the session turns out to
   * be worthless, but a read that writes is how a stale cookie once became a
   * 500 on every protected page (see scripts/e2e/session-redirect.mjs).
   * Sign-out and session rotation are the only places a cookie is cleared.
   *
   * Leaving the stale cookie in place is safe: middleware no longer treats
   * its presence as proof of anything, an unresolvable token grants
   * nothing, and the next successful sign-in overwrites it. Sign-out and
   * deactivation still delete the session ROW, which is what actually
   * revokes access.
   */

  // The row is gone (hard-deleted elsewhere) — treat as signed out.
  if (!user) return null;

  /*
   * Re-checked on every request, not just at sign-in, so deactivating,
   * suspending or un-verifying an account ends its access immediately
   * rather than whenever the session happens to lapse. This is the job
   * Laravel's EnsureAccountIsActive middleware did.
   */
  if (user.status !== 'ACTIVE') return null;
  if (!user.emailVerifiedAt) return null;

  const { roles, permissions } = await loadRolesAndPermissions(user.id);

  return {
    id: user.id.toString(),
    name: user.name,
    username: user.username,
    email: user.email,
    status: user.status as AuthUser['status'],
    emailVerifiedAt: user.emailVerifiedAt,
    mustChangePassword: user.mustChangePassword,
    roles,
    permissions,
  };
});

/**
 * For pages: bounce an anonymous visitor to the login screen.
 *
 * Laravel's `auth` middleware did this. The redirect happens server-side
 * before any markup is produced, so a protected page never streams even a
 * skeleton to someone who is not signed in.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  /*
   * A temporary password issued by a Super Admin is a credential two people
   * know, so it is not one to be left in place. The holder is sent to the
   * change-password screen and cannot navigate around it: this runs in the
   * layout of the signed-in segment and in every page within it, so there is
   * no protected page that does not pass through here.
   *
   * The screen itself lives OUTSIDE that segment and calls getCurrentUser()
   * directly, which is what keeps this from redirecting to itself forever.
   */
  if (user.mustChangePassword) redirect('/change-password');

  return user;
}

/**
 * For API routes: throw rather than redirect, so the caller gets JSON.
 *
 * `allowTemporaryPassword` exists for exactly one caller — the endpoint that
 * replaces the temporary password. Every other route refuses, so an account
 * on a temporary credential cannot do the system's work through the API while
 * declining to finish setting itself up.
 */
export async function requireApiUser(
  options: { allowTemporaryPassword?: boolean } = {},
): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();

  if (user.mustChangePassword && !options.allowTemporaryPassword) {
    throw new AppError(
      'Please choose a permanent password before continuing.',
      403,
      undefined,
      'PASSWORD_CHANGE_REQUIRED',
    );
  }

  return user;
}

/**
 * Enforce a policy decision. `allowed` is the boolean a policy function
 * returned; passing the call site's own check keeps authorisation next to
 * the action it guards instead of in a lookup table far away.
 */
export function authorize(allowed: boolean, message = 'This action is unauthorized.'): void {
  if (!allowed) throw new AuthorizationError(message);
}

/** Page-level equivalent: render the 403 page instead of throwing JSON. */
export function authorizePage(allowed: boolean): void {
  if (!allowed) {
    // The page route answers 403 and the React app shows its forbidden screen.
    throw new AuthorizationError();
  }
}
