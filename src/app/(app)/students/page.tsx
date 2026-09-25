import { requireUser, authorizePage } from '@/server/auth/current-user';
import { studentPolicy } from '@/server/auth/policies';
import { listStudents } from '@/server/services/student-service';
import { activePrograms } from '@/server/services/catalogue-service';
import StudentsScreen from '@/components/screens/StudentsScreen';

/** Port of livewire/students/index.blade.php. */
export const dynamic = 'force-dynamic';

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const user = await requireUser();
  authorizePage(studentPolicy.viewAny(user));

  const { page, search } = await searchParams;
  const parsed = Number(page ?? 1);
  const [data, programs] = await Promise.all([
    listStudents({ page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1, search }),
    activePrograms(),
  ]);

  return (
    <StudentsScreen
      rows={data.rows}
      page={data.page}
      lastPage={data.lastPage}
      total={data.total}
      search={search ?? ''}
      programs={programs}
      canCreate={studentPolicy.create(user)}
      canUpdate={studentPolicy.update(user)}
    />
  );
}
