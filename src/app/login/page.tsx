import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import LoginForm from '@/components/LoginForm';
import { isBootstrapAllowed } from '@/server/services/super-admin-service';
import { getCurrentUser } from '@/server/auth/current-user';

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
  if (user) redirect('/dashboard');

  /*
   * Whether to offer "Create Super Admin" is a cosmetic detail, and it is
   * the only reason this page touches the database at all. If that probe
   * fails, the sign-in form itself is still perfectly renderable — so the
   * failure is logged and the page degrades, rather than the whole screen
   * becoming an opaque "Something went wrong" with a digest.
   *
   * This is not swallowing the error: it is logged in full server-side, the
   * visitor is told plainly that the system is unavailable, and an actual
   * sign-in attempt still fails loudly with its own message. /api/health
   * reports the cause.
   */
  let canBootstrap = false;
  let systemUnavailable = false;

  try {
    canBootstrap = await isBootstrapAllowed();
  } catch (error) {
    systemUnavailable = true;
    console.error(
      '[TDMS] /login could not reach the database for the Super Admin bootstrap probe.',
      'Check that DATABASE_URL is set for this environment. See /api/health.',
      error,
    );
  }

  return (
    <AuthBrandedLayout>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <LoginForm canBootstrap={canBootstrap} systemUnavailable={systemUnavailable} />
      </Suspense>
    </AuthBrandedLayout>
  );
}
