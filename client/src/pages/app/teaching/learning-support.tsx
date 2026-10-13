import { ArchivedNote, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import SupportList from '@/components/teaching/SupportList';
import { Page } from '@/lib/page-data';
import type { loadTeachingLearningSupport } from '@/server/controllers/pages/app/teaching/learning-support';

type Data = Awaited<ReturnType<typeof loadTeachingLearningSupport>>;

function View({ ctx, rows }: Data) {
  return (
    <PageShell
      eyebrow="Academic"
      title="Learning Support"
      description="Learning Support Recommendations for students who would benefit from extra help. Never shown to students; visible to the TVET Director and Coordinator."
      actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}
    >
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}
      <SupportList rows={rows} editable={!ctx.archived} />
    </PageShell>
  );
}

/** /teaching/learning-support */
export default function TeachingLearningSupportPage() {
  return <Page<Data> endpoint={'/teaching/learning-support'} render={(d) => <View {...d} />} />;
}
