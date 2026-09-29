import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { listSchoolYears } from '@/server/services/teaching/school-years';
import { dateColumnKey } from '@/lib/institution-time';
import { PageShell } from '@/components/teaching/kit';
import SchoolYearsScreen from '@/components/teaching/SchoolYearsScreen';

export const dynamic = 'force-dynamic';

/** School Years — the lifecycle: upcoming, active, archived. */
export default async function SchoolYearsPage() {
  const user = await requireUser();
  authorizePage(teachingPolicy.viewSchoolYears(user));
  const years = await listSchoolYears();
  return (
    <PageShell eyebrow="Academic" title="School Years" description="Open, run and archive school years. Archiving never deletes anything: the year becomes read-only and the next one starts clean.">
      <SchoolYearsScreen
        canManage={teachingPolicy.manageSchoolYears(user)}
        years={years.map((y) => ({
          id: y.id.toString(),
          label: y.label,
          startsOn: dateColumnKey(y.startsOn),
          endsOn: dateColumnKey(y.endsOn),
          status: y.status,
          currentSemester: y.currentSemester,
          archivedAt: y.archivedAt?.toISOString() ?? null,
        }))}
      />
    </PageShell>
  );
}
