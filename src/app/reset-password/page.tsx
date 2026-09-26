import { Suspense } from 'react';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import ResetPasswordForm from '@/components/ResetPasswordForm';

/** /reset-password?token=... — also the last step of an invitation. */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set your password · TDMS' };

export default function ResetPasswordPage() {
  return (
    <AuthBrandedLayout>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthBrandedLayout>
  );
}
