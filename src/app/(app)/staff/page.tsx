import { requireUser, authorizePage } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { listAccounts, assignableRoles, mailIsConfigured } from '@/server/services/account-service';
import { INSTITUTIONAL_DOMAIN } from '@/lib/institutional-email';
import StaffScreen from '@/components/screens/StaffScreen';

/** Account administration. */
export const dynamic = 'force-dynamic';

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  authorizePage(userPolicy.viewAny(user));

  const { page } = await searchParams;
  const parsed = Number(page ?? 1);
  const data = await listAccounts(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return (
    <StaffScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      // Only a Super Admin sees 'admin' here; the API re-checks.
      roleOptions={assignableRoles(user)}
      currentUserId={user.id}
      canCreate={userPolicy.create(user)}
      mailConfigured={mailIsConfigured()}
      institutionalDomain={INSTITUTIONAL_DOMAIN}
    />
  );
}
