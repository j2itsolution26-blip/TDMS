import { Suspense } from 'react';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import LoginForm from '@/components/LoginForm';
import { isBootstrapAllowed } from '@/server/services/super-admin-service';

/**
 * /login — the branded sign-in screen.
 *
 * Server component: the "Create Super Admin" affordance is decided on the
 * server from the real state of the database, exactly as the Volt
 * component's with() did, so the link cannot be revealed by tampering
 * with client state.
 */
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const canBootstrap = await isBootstrapAllowed();

  return (
    <AuthBrandedLayout>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <LoginForm canBootstrap={canBootstrap} />
      </Suspense>
    </AuthBrandedLayout>
  );
}
