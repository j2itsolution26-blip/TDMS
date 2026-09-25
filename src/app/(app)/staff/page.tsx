import { requireUser, authorizePage } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { listStaff, assignableRoles } from '@/server/services/staff-service';
import StaffScreen from '@/components/screens/StaffScreen';

/** Port of livewire/staff/index.blade.php. */
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
  const data = await listStaff(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return (
    <StaffScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      // Only a Super Admin sees 'admin' in this list; the API re-checks.
      roleOptions={assignableRoles(user)}
      currentUserId={user.id}
      canCreate={userPolicy.create(user)}
    />
  );
}
