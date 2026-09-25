import { notFound } from 'next/navigation';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { curriculumPolicy, curriculumSubjectPolicy } from '@/server/auth/policies';
import {
  getCurriculum, listCurriculumSubjects, activeSubjects,
} from '@/server/services/catalogue-service';
import CurriculumDetailScreen from '@/components/screens/CurriculumDetailScreen';

/** Port of livewire/curricula/show.blade.php. */
export const dynamic = 'force-dynamic';

export default async function CurriculumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  authorizePage(curriculumPolicy.view(user));

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const curriculum = await getCurriculum(BigInt(id)).catch(() => null);
  if (!curriculum) notFound();

  const [entries, subjects] = await Promise.all([
    listCurriculumSubjects(curriculum.id),
    activeSubjects(),
  ]);

  return (
    <CurriculumDetailScreen
      curriculum={{
        id: curriculum.id.toString(),
        versionLabel: curriculum.versionLabel,
        effectiveSchoolYear: curriculum.effectiveSchoolYear,
        program: {
          id: curriculum.program.id.toString(),
          name: curriculum.program.name,
          code: curriculum.program.code,
        },
      }}
      entries={entries}
      subjects={subjects}
      canCreate={curriculumSubjectPolicy.create(user)}
      canDelete={curriculumSubjectPolicy.delete(user)}
    />
  );
}
