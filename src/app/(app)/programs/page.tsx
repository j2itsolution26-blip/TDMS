import { requireUser, authorizePage } from '@/server/auth/current-user';
import { programPolicy } from '@/server/auth/policies';
import { listPrograms } from '@/server/services/catalogue-service';
import ProgramsScreen from '@/components/screens/ProgramsScreen';

/** Port of livewire/programs/index.blade.php (the mount() authorize + with()). */
export const dynamic = 'force-dynamic';

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  authorizePage(programPolicy.viewAny(user));

  const { page } = await searchParams;
  const parsed = Number(page ?? 1);
  const data = await listPrograms(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return (
    <ProgramsScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      canCreate={programPolicy.create(user)}
      canUpdate={programPolicy.update(user)}
    />
  );
}
