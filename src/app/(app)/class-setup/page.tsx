import { teachingPolicy } from '@/server/auth/policies';
import { classSetupOverview } from '@/server/services/teaching/class-setup';
import { yearPage } from '@/server/services/teaching/page-context';
import { ArchivedNote, Empty, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import ClassSetupScreen from '@/components/teaching/ClassSetupScreen';

export const dynamic = 'force-dynamic';

/** Classes & Sections — the Admin's and Coordinator's setup of a school year. */
export default async function ClassSetupPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const ctx = await yearPage(teachingPolicy.manageClasses, year);
  const setup = ctx.yearId ? await classSetupOverview(ctx.yearId) : null;

  return (
    <PageShell eyebrow="Academic" title="Classes & Sections" description="Build the school year: sections and their students, then classes with a Diploma Instructor and schedule." actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}
      {!setup || !ctx.current ? (
        <Empty title="No school year yet" description="Create a school year first, under School Years." />
      ) : (
        <ClassSetupScreen setup={setup} schoolYearId={ctx.current.id.toString()} archived={ctx.archived} />
      )}
    </PageShell>
  );
}
