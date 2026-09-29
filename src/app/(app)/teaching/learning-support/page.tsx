import { teachingPolicy } from '@/server/auth/policies';
import { instructorLearningSupports } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import { ArchivedNote, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import SupportList from '@/components/teaching/SupportList';

export const dynamic = 'force-dynamic';

/** Learning Support — the Instructor's recommendations and their follow-up. */
export default async function InstructorLearningSupportPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const rows = await instructorLearningSupports(ctx.user, ctx.yearId);
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
