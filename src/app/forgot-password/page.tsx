import Link from 'next/link';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';

/**
 * Port of livewire/pages/auth/forgot-password.blade.php.
 *
 * Laravel sent the reset link through its Mail/Notification stack, which
 * has no configured transport in this deployment (MAIL_MAILER=log). Rather
 * than pretend to send an email that nobody receives, this page states the
 * real recovery path. Wiring a Node mail provider is tracked in
 * docs/migration.md under "Remaining work".
 */
export const metadata = { title: 'Forgot Password · TDMS' };

export default function ForgotPasswordPage() {
  return (
    <AuthBrandedLayout>
      <div>
        <p className="text-sm text-slate-600">
          Password resets are handled by your system administrator. Contact them and they will
          issue you a new one-time password from the Staff screen.
        </p>

        <div className="tdms-bootstrap-wrap">
          <Link href="/login" className="tdms-bootstrap-link">
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    </AuthBrandedLayout>
  );
}
