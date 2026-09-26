import { Suspense } from 'react';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import VerifyEmailPanel from '@/components/VerifyEmailPanel';

/**
 * /verify-email?token=... — the destination of the verification email.
 *
 * Public: the recipient is by definition not signed in yet. The token is the
 * credential, and it is single-use and expiring.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Verify your email · TDMS' };

export default function VerifyEmailPage() {
  return (
    <AuthBrandedLayout>
      <Suspense fallback={null}>
        <VerifyEmailPanel />
      </Suspense>
    </AuthBrandedLayout>
  );
}
