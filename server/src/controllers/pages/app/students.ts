import { requireUser, authorizePage } from '@/server/auth/current-user';
import { studentPolicy } from '@/server/auth/policies';
import { listStudents } from '@/server/services/student-service';
import { activePrograms } from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';
import { STUDENT_STATUSES } from '@shared/types/domain';
import { YEAR_LEVELS } from '@shared/lib/teaching';

/** Port of livewire/students/index.blade.php. */

export async function loadStudents({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPolicy.viewAny(user));

  const { page, search } = query;
  const parsed = Number(page ?? 1);
  const programs = await activePrograms();
  // Filters from the URL, kept only when they name something real.
  const program = programs.find((p) => p.id === query.program)?.id ?? '';
  const yearLevel = (YEAR_LEVELS as readonly number[]).includes(Number(query.yearLevel)) ? Number(query.yearLevel) : 0;
  const status = (STUDENT_STATUSES as readonly string[]).includes(query.status ?? '') ? query.status! : '';
  const data = await listStudents({
    page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
    search,
    programId: program ? BigInt(program) : undefined,
    yearLevel: yearLevel || undefined,
    status: status || undefined,
  });

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    search: search ?? '',
    filters: { program, yearLevel: yearLevel ? String(yearLevel) : '', status },
    programs,
    canCreate: studentPolicy.create(user),
    canUpdate: studentPolicy.update(user),
  };
}
