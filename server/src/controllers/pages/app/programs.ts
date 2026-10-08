import { requireUser, authorizePage } from '@/server/auth/current-user';
import { programPolicy } from '@/server/auth/policies';
import { listPrograms } from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/programs/index.blade.php (the mount() authorize + with()). */

export async function loadPrograms({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(programPolicy.viewAny(user));

  const { page } = query;
  const parsed = Number(page ?? 1);
  const data = await listPrograms(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    canCreate: programPolicy.create(user),
    canUpdate: programPolicy.update(user),
  };
}
