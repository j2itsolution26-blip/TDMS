import { notFound } from '@/server/lib/page-signals';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { curriculumPolicy, curriculumSubjectPolicy } from '@/server/auth/policies';
import {
  getCurriculum, listCurriculumSubjects, activeSubjects,
} from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/curricula/show.blade.php. */

export async function loadCurriculaId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(curriculumPolicy.view(user));

  const { id } = params;
  if (!/^\d+$/.test(id)) notFound();

  const curriculum = await getCurriculum(BigInt(id)).catch(() => null);
  if (!curriculum) notFound();

  const [entries, subjects] = await Promise.all([
    listCurriculumSubjects(curriculum.id),
    activeSubjects(),
  ]);

  return {
    curriculum: {
        id: curriculum.id.toString(),
        versionLabel: curriculum.versionLabel,
        effectiveSchoolYear: curriculum.effectiveSchoolYear,
        program: {
          id: curriculum.program.id.toString(),
          name: curriculum.program.name,
          code: curriculum.program.code,
        },
      },
    entries,
    subjects,
    canCreate: curriculumSubjectPolicy.create(user),
    canDelete: curriculumSubjectPolicy.delete(user),
  };
}
