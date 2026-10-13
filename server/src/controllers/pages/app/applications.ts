import { requireUser, authorizePage } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { listApplications } from '@/server/services/application-service';
import { activePrograms } from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/applications/index.blade.php. */

export async function loadApplications({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(applicationPolicy.viewAny(user));

  const { page, status } = query;
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

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    statusFilter,
    programs,
    canCreate: applicationPolicy.create(user),
    canReview: applicationPolicy.review(user),
  };
}
