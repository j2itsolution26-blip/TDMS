import { requireUser, authorizePage } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import {
  listAdminAccounts,
  mailIsConfigured,
  securityCodeIsConfigured,
} from '@/server/services/admin-account-service';
import { accessCodeTtlMinutes } from '@/server/auth/admin-access-code';
import AdminAccountsScreen from '@/components/screens/AdminAccountsScreen';

/**
 * Administration → Admin Accounts. Super Admin only.
 *
 * `securityCodeIsConfigured()` crosses to the browser; the code itself never
 * does. Whether a secret exists is not the secret, and the screen has to be
 * able to say why its buttons will refuse.
 */
export const dynamic = 'force-dynamic';

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  authorizePage(adminAccountPolicy.viewAny(user));

  const { page } = await searchParams;
  const parsed = Number(page ?? 1);
  const data = await listAdminAccounts(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return (
    <AdminAccountsScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      currentUserId={user.id}
      mailConfigured={mailIsConfigured()}
      securityCodeConfigured={securityCodeIsConfigured()}
      accessCodeTtlMinutes={accessCodeTtlMinutes()}
    />
  );
}
