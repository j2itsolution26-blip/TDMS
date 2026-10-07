import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import LoginForm from '@/components/login/LoginForm';
import { isSystemInitialized } from '@/server/services/setup-service';
import { getCurrentUser } from '@/server/auth/current-user';
import { googleConfigured } from '@/server/auth/google/oauth';
import {
  domainRestrictionEnabled,
  domainRejectionMessage,
  allowedDomain,
} from '@/lib/institutional-email';

/**
 * /login — the branded sign-in screen.
 */
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  /*
   * The authoritative "you are already signed in" check.
   *
   * This lives here rather than in middleware on purpose: middleware can
   * only see that a cookie exists, and redirecting on that alone loops
   * forever against a stale cookie (see src/middleware.ts). Resolving the
   * session for real is the only way to tell the two apart.
   */
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(user.mustChangePassword ? '/change-password' : '/dashboard');

  /*
   * Whether this is a brand-new installation is the only reason this page
   * touches the database at all. If that probe fails, the sign-in form itself
   * is still perfectly renderable — so the failure is logged and the page
   * degrades, rather than the whole screen becoming an opaque "Something went
   * wrong" with a digest.
   *
   * This is not swallowing the error: it is logged in full server-side, the
   * visitor is told plainly that the system is unavailable, and an actual
   * sign-in attempt still fails loudly with its own message. /api/health
   * reports the cause.
   */
  let uninitialized = false;
  let systemUnavailable = false;

  try {
    uninitialized = !(await isSystemInitialized());
  } catch (error) {
    systemUnavailable = true;
    console.error(
      '[TDMS] /login could not reach the database for the first-run check.',
      'Check that DATABASE_URL is set for this environment. See /api/health.',
      error,
    );
  }

  return (
    <AuthBrandedLayout>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <LoginForm
          uninitialized={uninitialized}
          systemUnavailable={systemUnavailable}
          providers={{
            // No Microsoft (Entra ID) sign-in exists yet; its button renders disabled.
            microsoft: null,
            google: googleConfigured() ? '/api/auth/google' : null,
          }}
          domainNotice={domainRestrictionEnabled() ? domainRejectionMessage() : null}
          allowedDomain={domainRestrictionEnabled() ? allowedDomain() : null}
        />
      </Suspense>
    </AuthBrandedLayout>
  );
}
