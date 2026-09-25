import { notFound } from 'next/navigation';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { programPolicy, curriculumPolicy } from '@/server/auth/policies';
import { getProgram, listCurriculaForProgram } from '@/server/services/catalogue-service';
import ProgramDetailScreen from '@/components/screens/ProgramDetailScreen';

/** Port of livewire/programs/show.blade.php. */
export const dynamic = 'force-dynamic';

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  authorizePage(programPolicy.view(user));

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const program = await getProgram(BigInt(id)).catch(() => null);
  if (!program) notFound();

  const rows = await listCurriculaForProgram(program.id);

  return (
    <ProgramDetailScreen
      program={{
        id: program.id.toString(),
        code: program.code,
        name: program.name,
        description: program.description,
      }}
      rows={rows}
      canCreate={curriculumPolicy.create(user)}
      canUpdate={curriculumPolicy.update(user)}
    />
  );
}
