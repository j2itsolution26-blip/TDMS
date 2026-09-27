import { redirect } from 'next/navigation';
import AuthBrandedLayout from '@/components/AuthBrandedLayout';
import AdminAccessCodeForm from '@/components/AdminAccessCodeForm';
import { getCurrentUser } from '@/server/auth/current-user';

/**
 * /login/access-code — the second step of an Admin sign-in.
 *
 * Public by middleware's reckoning, because the visitor has no session yet.
 * What authorises them is the HttpOnly challenge cookie, and the form asks
 * the server what to draw rather than being told by this page — the page
 * cannot read that cookie's meaning either.
 *
 * The only thing decided here is the case of somebody who is ALREADY signed
 * in wandering onto this URL. They have nothing to verify, so they are sent on
 * to wherever they should be, exactly as /login does.
 */
export const dynamic = 'force-dynamic';

export default async function AdminAccessCodePage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(user.mustChangePassword ? '/change-password' : '/dashboard');

  return (
    <AuthBrandedLayout>
      <AdminAccessCodeForm />
    </AuthBrandedLayout>
  );
}
