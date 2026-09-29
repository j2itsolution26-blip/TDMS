import { teachingPolicy } from '@/server/auth/policies';
import { monitoredLearningSupports } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import { PageShell, Stat } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import SupportList from '@/components/teaching/SupportList';

export const dynamic = 'force-dynamic';

/** Learning Support — the Director and Coordinator monitor interventions across classes. */
export default async function LearningSupportMonitorPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const ctx = await yearPage(teachingPolicy.monitorLearningSupport, year);
  const rows = await monitoredLearningSupports(ctx.user, { schoolYearId: ctx.yearId });
  const today = new Date().toISOString().slice(0, 10);
  const open = rows.filter((r) => r.status === 'OPEN').length;
  const progress = rows.filter((r) => r.status === 'IN_PROGRESS').length;
  const overdue = rows.filter((r) => r.status !== 'RESOLVED' && r.followUpOn && r.followUpOn < today).length;

  return (
    <PageShell eyebrow="Academic Oversight" title="Learning Support" description="Learning Support Recommendations from Diploma Instructors and their interventions." actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Recommendations" value={rows.length} />
        <Stat label="Open" value={open} tone={open ? 'attention' : undefined} hint={open ? 'Awaiting intervention' : 'None'} />
        <Stat label="In progress" value={progress} />
        <Stat label="Follow-up overdue" value={overdue} tone={overdue ? 'failed' : undefined} hint={overdue ? 'Past the follow-up date' : 'None'} />
      </div>
      <SupportList rows={rows} editable={false} showInstructor />
    </PageShell>
  );
}
