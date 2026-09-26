import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';
import { INSTITUTIONAL_DOMAIN } from '@/lib/institutional-email';

/**
 * /forgot-password — self-service reset, reachable from the login screen.
 *
 * Under Laravel this was a dead end: MAIL_MAILER was `log`, so the mail was
 * written to a file nobody read. It now issues a real single-use token and
 * sends it, provided a mail provider is configured (see docs/deployment.md).
 */
export const metadata = { title: 'Forgot Password · TDMS' };

export default function ForgotPasswordPage() {
  return (
    <AuthBrandedLayout>
      <ForgotPasswordForm domain={INSTITUTIONAL_DOMAIN} />
    </AuthBrandedLayout>
  );
}
