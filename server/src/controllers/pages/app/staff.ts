import { requireUser, authorizePage } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { listAccounts, assignableRoles } from '@/server/services/account-service';
import { allowedDomain, domainRestrictionEnabled } from '@/server/lib/institutional-email';
import type { PageRequest } from '@/server/controllers/pages/types';

/** /staff — staff accounts, for whoever may manage them. */
export async function loadStaff({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(userPolicy.viewAny(user));

  const parsed = Number(query.page ?? 1);
  const data = await listAccounts(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    // Only a Super Admin sees 'admin' here; the API re-checks.
    roleOptions: assignableRoles(user),
    currentUserId: user.id,
    canCreate: userPolicy.create(user),
    institutionalDomain: domainRestrictionEnabled() ? allowedDomain() : null,
  };
}
