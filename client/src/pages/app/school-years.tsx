import { teachingPolicy } from '@shared/lib/policies';
import { dateColumnKey } from '@shared/lib/institution-time';
import { PageShell } from '@/components/teaching/kit';
import SchoolYearsScreen from '@/components/teaching/SchoolYearsScreen';
import { Page } from '@/lib/page-data';
import type { loadSchoolYears } from '@/server/controllers/pages/app/school-years';

type Data = Awaited<ReturnType<typeof loadSchoolYears>>;

function View({ user, years }: Data) {
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

/** /school-years */
export default function SchoolYearsPage() {
  return <Page<Data> endpoint={'/school-years'} render={(d) => <View {...d} />} />;
}
