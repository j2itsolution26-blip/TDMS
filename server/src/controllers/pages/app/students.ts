import { requireUser, authorizePage } from '@/server/auth/current-user';
import { studentPolicy } from '@/server/auth/policies';
import { listStudents } from '@/server/services/student-service';
import { activePrograms } from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/students/index.blade.php. */

export async function loadStudents({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPolicy.viewAny(user));

  const { page, search } = query;
  const parsed = Number(page ?? 1);
  const [data, programs] = await Promise.all([
    listStudents({ page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1, search }),
    activePrograms(),
  ]);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    search: search ?? '',
    programs,
    canCreate: studentPolicy.create(user),
    canUpdate: studentPolicy.update(user),
  };
}
