import { requireUser, authorizePage } from '@/server/auth/current-user';
import { curriculumSubjectPolicy, subjectPolicy } from '@/server/auth/policies';
import { activeSubjects, curriculumMap, listSubjects } from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/subjects/index.blade.php. */

export async function loadSubjects({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(subjectPolicy.viewAny(user));

  const { page } = query;
  const parsed = Number(page ?? 1);
  const search = (query.search ?? '').trim().slice(0, 100);
  const [data, map, active] = await Promise.all([
    listSubjects(Number.isFinite(parsed) && parsed > 0 ? parsed : 1, search),
    curriculumMap(),
    activeSubjects(),
  ]);

  return {
    rows: data.rows,
    page: data.page,
    lastPage: data.lastPage,
    total: data.total,
    search,
    /** The Curriculum Map: programs, their current curriculum and its entries. */
    map,
    /** Active subjects, for mapping. */
    subjects: active,
    canMap: curriculumSubjectPolicy.create(user),
    canCreate: subjectPolicy.create(user),
    canUpdate: subjectPolicy.update(user),
  };
}
