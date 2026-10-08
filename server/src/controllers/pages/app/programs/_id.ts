import { notFound } from '@/server/lib/page-signals';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { programPolicy, curriculumPolicy } from '@/server/auth/policies';
import { getProgram, listCurriculaForProgram } from '@/server/services/catalogue-service';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of livewire/programs/show.blade.php. */

export async function loadProgramsId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(programPolicy.view(user));

  const { id } = params;
  if (!/^\d+$/.test(id)) notFound();

  const program = await getProgram(BigInt(id)).catch(() => null);
  if (!program) notFound();

  const rows = await listCurriculaForProgram(program.id);

  return {
    program: {
        id: program.id.toString(),
        code: program.code,
        name: program.name,
        description: program.description,
      },
    rows,
    canCreate: curriculumPolicy.create(user),
    canUpdate: curriculumPolicy.update(user),
  };
}
