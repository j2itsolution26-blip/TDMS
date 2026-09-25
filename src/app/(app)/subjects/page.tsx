import { requireUser, authorizePage } from '@/server/auth/current-user';
import { subjectPolicy } from '@/server/auth/policies';
import { listSubjects } from '@/server/services/catalogue-service';
import SubjectsScreen from '@/components/screens/SubjectsScreen';

/** Port of livewire/subjects/index.blade.php. */
export const dynamic = 'force-dynamic';

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  authorizePage(subjectPolicy.viewAny(user));

  const { page } = await searchParams;
  const parsed = Number(page ?? 1);
  const data = await listSubjects(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);

  return (
    <SubjectsScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      canCreate={subjectPolicy.create(user)}
      canUpdate={subjectPolicy.update(user)}
    />
  );
}
