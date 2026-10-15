import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ArchivedNote, Empty, FOCUS, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import ClassSetupScreen, { type SetupTab } from '@/components/teaching/ClassSetupScreen';
import { Page } from '@/lib/page-data';
import { usePathname, useRouter, useSearchParams } from '@/lib/navigation';
import type { loadClassSetup } from '@/server/controllers/pages/app/class-setup';

type Data = Awaited<ReturnType<typeof loadClassSetup>>;

function View({ ctx, setup, canManage }: Data) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get('tab');
  const tab: SetupTab = requested === 'sections' || requested === 'timetable' || requested === 'rooms' ? requested : 'classes';
  const [newSection, setNewSection] = useState(0);
  const onTab = (t: SetupTab) => {
    // From the live URL: the Sections tab keeps ?program=&level= there itself.
    const next = new URLSearchParams(window.location.search);
    if (t === 'classes') next.delete('tab'); else next.set('tab', t);
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`);
  };
  const yearLabel = ctx.current?.label.replace('-', '–') ?? '';
  const canAdd = !!setup && !!ctx.current && !ctx.archived && canManage;

  const sections = tab === 'sections';
  return (
    <PageShell
      eyebrow="Academic"
      title="Classes & Sections"
      description={sections
        ? 'Organize diploma students by year level and section.'
        : 'Build the school year: sections and their students, then classes with a Diploma Instructor and schedule.'}
      actions={
        <>
          <YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />
          {sections && canAdd && (
            <button type="button" onClick={() => setNewSection((n) => n + 1)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 ${FOCUS}`}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New Section
            </button>
          )}
        </>
      }
    >
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}
      {!setup || !ctx.current ? (
        <Empty title="No school year yet" description="Create a school year first, under School Years." />
      ) : (
        <ClassSetupScreen setup={setup} schoolYearId={ctx.current.id.toString()} yearLabel={yearLabel} archived={ctx.archived} canManage={canManage} tab={tab} onTab={onTab} newSection={newSection} />
      )}
    </PageShell>
  );
}

/** /class-setup */
export default function ClassSetupPage() {
  return <Page<Data> endpoint={'/class-setup'} render={(d) => <View {...d} />} />;
}
