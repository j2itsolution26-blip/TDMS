import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AuthenticationError, AuthorizationError } from '@/lib/http';
import type { AuthUser } from '@/types/domain';
import { loadRolesAndPermissions } from './rbac';
import { resolveSession } from './session';

/**
 * The request's principal, or null.
 *
 * React's `cache` dedupes this across a single render pass, so a layout, a
 * page and three server components asking "who is signed in?" cost one
 * session lookup and one role lookup between them, not four of each.
 *
 * This is the replacement for Laravel's Auth::user(), and it also absorbs
 * the EnsureAccountIsActive middleware: a user deactivated mid-session is
 * signed out on their very next request rather than lingering until their
 * session happens to expire.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await resolveSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      isActive: true,
      emailVerifiedAt: true,
    },
  });

  /*
   * Deliberately read-only.
   *
   * It is tempting to clear the cookie here when the session turns out to
   * be worthless — but this function runs during Server Component render,
   * and Next.js does not allow cookies to be written there ("Setting
   * cookies is not supported during Server Component rendering"; .delete()
   * is restricted to a Server Function or Route Handler). Calling
   * destroyCurrentSession() from here therefore throws, turning a merely
   * stale session into a 500 on every protected page.
   *
   * Leaving the stale cookie in place is safe: middleware no longer treats
   * its presence as proof of anything, an unresolvable token grants
   * nothing, and the next successful sign-in overwrites it. Sign-out and
   * deactivation still delete the session ROW, which is what actually
   * revokes access.
   */

  // The row is gone (hard-deleted elsewhere) — treat as signed out.
  if (!user) return null;

  // Deactivated mid-session: this is the EnsureAccountIsActive middleware.
  if (!user.isActive) return null;

  const { roles, permissions } = await loadRolesAndPermissions(user.id);

  return {
    id: user.id.toString(),
    name: user.name,
    username: user.username,
    email: user.email,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt,
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
  return user;
}

/** For API routes: throw rather than redirect, so the caller gets JSON. */
export async function requireApiUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
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
    // Next renders the nearest forbidden UI via the error boundary.
    throw new AuthorizationError();
  }
}
