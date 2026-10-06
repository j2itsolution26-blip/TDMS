import { redirect } from 'next/navigation';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import ChangeTemporaryPasswordForm from '@/components/ChangeTemporaryPasswordForm';
import { getCurrentUser } from '@/server/auth/current-user';

/**
 * /change-password — forced replacement of a temporary password.
 *
 * Deliberately OUTSIDE the (app) route group. Every page in that group calls
 * requireUser(), which redirects anybody carrying `mustChangePassword` here —
 * so a page inside it would redirect to itself forever.
 *
 * It calls getCurrentUser() directly instead, which is the same session check
 * without the diversion.
 */
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  /*
   * Nothing to do. Somebody who has already replaced their password, or never
   * had a temporary one, is sent on rather than shown a form that would be a
   * no-op — and leaving this screen reachable for them would make it look
   * like a second, stranger way to change a password.
   */
  if (!user.mustChangePassword) redirect('/dashboard');

  return (
    <AuthBrandedLayout heading="Set a new password to continue">
      <ChangeTemporaryPasswordForm name={user.name} email={user.email} />
    </AuthBrandedLayout>
  );
}
