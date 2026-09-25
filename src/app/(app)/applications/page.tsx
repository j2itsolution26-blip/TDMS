import { requireUser, authorizePage } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { listApplications } from '@/server/services/application-service';
import { activePrograms } from '@/server/services/catalogue-service';
import ApplicationsScreen from '@/components/screens/ApplicationsScreen';

/** Port of livewire/applications/index.blade.php. */
export const dynamic = 'force-dynamic';

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await requireUser();
  authorizePage(applicationPolicy.viewAny(user));

  const { page, status } = await searchParams;
  const parsed = Number(page ?? 1);
  // The Volt component defaulted the filter to 'submitted'.
  const statusFilter = status === undefined ? 'submitted' : status;

  const [data, programs] = await Promise.all([
    listApplications({
      page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
      status: statusFilter || undefined,
    }),
    activePrograms(),
  ]);

  return (
    <ApplicationsScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      statusFilter={statusFilter}
      programs={programs}
      canCreate={applicationPolicy.create(user)}
      canReview={applicationPolicy.review(user)}
    />
  );
}
