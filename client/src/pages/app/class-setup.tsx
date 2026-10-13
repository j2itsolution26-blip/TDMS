import { ArchivedNote, Empty, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import ClassSetupScreen from '@/components/teaching/ClassSetupScreen';
import { Page } from '@/lib/page-data';
import type { loadClassSetup } from '@/server/controllers/pages/app/class-setup';

type Data = Awaited<ReturnType<typeof loadClassSetup>>;

function View({ ctx, setup }: Data) {
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

/** /class-setup */
export default function ClassSetupPage() {
  return <Page<Data> endpoint={'/class-setup'} render={(d) => <View {...d} />} />;
}
