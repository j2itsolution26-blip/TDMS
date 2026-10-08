import { requireUser, authorizePage } from '@/server/auth/current-user';
import { subjectPolicy } from '@/server/auth/policies';
import { listSubjects } from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/subjects/index.blade.php. */

export async function loadSubjects({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(subjectPolicy.viewAny(user));

  const { page } = query;
  const parsed = Number(page ?? 1);
  const data = await listSubjects(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    canCreate: subjectPolicy.create(user),
    canUpdate: subjectPolicy.update(user),
  };
}
