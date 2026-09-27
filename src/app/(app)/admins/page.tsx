import { requireUser, authorizePage } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { listAdminAccounts } from '@/server/services/admin-account-service';
import AdminAccountsScreen from '@/components/screens/AdminAccountsScreen';

/** Super Admin Dashboard → Admin Accounts. Super Admin only. */
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
    />
  );
}
