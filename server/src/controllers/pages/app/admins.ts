import { requireUser, authorizePage } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { listAdminAccounts } from '@/server/services/admin-account-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Super Admin Dashboard → Admin Accounts. Super Admin only. */

export async function loadAdmins({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(adminAccountPolicy.viewAny(user));

  const { page } = query;
  const parsed = Number(page ?? 1);
  const data = await listAdminAccounts(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    currentUserId: user.id,
  };
}
