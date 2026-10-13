import { PageShell, Stat } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import SupportList from '@/components/teaching/SupportList';
import { Page } from '@/lib/page-data';
import type { loadLearningSupport } from '@/server/controllers/pages/app/learning-support';

type Data = Awaited<ReturnType<typeof loadLearningSupport>>;

function View({ ctx, open, overdue, progress, rows }: Data) {
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

/** /learning-support */
export default function LearningSupportPage() {
  return <Page<Data> endpoint={'/learning-support'} render={(d) => <View {...d} />} />;
}
