import { redirect } from '@/server/lib/page-signals';
import { isSystemInitialized } from '@/server/services/setup-service';
import { getCurrentUser } from '@/server/auth/current-user';
import { googleConfigured } from '@/server/auth/google/oauth';
import {
  allowedDomain,
  describeDomainPolicy,
  domainRejectionMessage,
  domainRestrictionEnabled,
} from '@/server/lib/institutional-email';
import type { PageLoader } from './types';

/**
 * Loaders for the screens used before (or instead of) signing in.
 */

/** Someone already signed in has no business on a sign-in screen. */
async function leaveIfSignedIn(): Promise<void> {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(user.mustChangePassword ? '/change-password' : '/dashboard');
}

/**
 * /login. The authoritative "you are already signed in" check lives here
 * rather than in the request guard: the guard only sees that a cookie
 * exists, and redirecting on that alone loops forever against a stale one.
 *
 * Whether this is a brand-new installation is the only database question;
 * if it cannot be answered the form still renders, with a notice, and the
 * cause is logged — an actual sign-in attempt fails loudly with its own
 * message. /api/v1/health reports the cause.
 */
export const loadLogin: PageLoader = async () => {
  await leaveIfSignedIn();

  let uninitialized = false;
  let systemUnavailable = false;
  try {
    uninitialized = !(await isSystemInitialized());
  } catch (error) {
    systemUnavailable = true;
    console.error(
      '[TDMS] /login could not reach the database for the first-run check.',
      'Check that DATABASE_URL is set for this environment. See /api/v1/health.',
      error,
    );
  }

  return {
    uninitialized,
    systemUnavailable,
    providers: {
      // No Microsoft (Entra ID) sign-in exists yet; its button renders disabled.
      microsoft: null,
      google: googleConfigured() ? '/api/v1/auth/google' : null,
    },
    domainNotice: domainRestrictionEnabled() ? domainRejectionMessage() : null,
    allowedDomain: domainRestrictionEnabled() ? allowedDomain() : null,
  };
};

/** /login/access-code — the second step of an Admin's first sign-in. */
export const loadAccessCode: PageLoader = async () => {
  await leaveIfSignedIn();
  return {};
};

/** /change-password — only for an account on a temporary password. */
export const loadChangePassword: PageLoader = async () => {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.mustChangePassword) redirect('/dashboard');
  return { name: user.name, email: user.email };
};

/** /forgot-password — names the institutional domain only when it is enforced. */
export const loadForgotPassword: PageLoader = async () => ({
  domain: domainRestrictionEnabled() ? allowedDomain() : null,
});

/**
 * /setup — first-run setup. A database failure is not "no accounts": it gets
 * its own state rather than a setup form that cannot be completed.
 */
export const loadSetup: PageLoader = async () => {
  let initialized: boolean;
  try {
    initialized = await isSystemInitialized();
  } catch (error) {
    console.error('[TDMS] /setup could not reach the database. See /api/v1/health.', error);
    return { state: 'unavailable' as const };
  }
  if (initialized) return { state: 'initialized' as const };

  const policy = describeDomainPolicy();
  return { state: 'open' as const, domainRestricted: policy.enabled, allowedDomain: policy.allowedDomain };
};
