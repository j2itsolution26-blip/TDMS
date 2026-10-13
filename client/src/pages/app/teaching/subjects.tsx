import Link from '@/lib/link';
import { classHeading } from '@shared/lib/teaching-labels';
import { SEMESTER_LABELS } from '@shared/lib/teaching';
import { Card, Empty, FOCUS, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import { Page } from '@/lib/page-data';
import type { loadTeachingSubjects } from '@/server/controllers/pages/app/teaching/subjects';

type Data = Awaited<ReturnType<typeof loadTeachingSubjects>>;

function View({ classes, ctx, subjects }: Data) {
  return (
    <PageShell eyebrow="Teaching" title="My Subjects" description="The subjects you teach this school year and the sections taking each." actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      {subjects.length === 0 ? (
        <Empty title="No subjects assigned" description="Subjects appear here once you are assigned to a class." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {subjects.map((s) => (
            <Card key={s.code} title={s.title} description={`${s.code} · ${s.classes.length} ${s.classes.length === 1 ? 'section' : 'sections'}`}>
              <ul className="divide-y divide-tdms-hairline">
                {s.classes.map((c) => (
                  <li key={c.id.toString()}>
                    <Link href={`/teaching/classes/${c.id}`} className={`-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-tdms-bg ${FOCUS}`}>
                      <span className="font-semibold text-tdms-ink">{classHeading(c).detail}</span>
                      <span className="text-tdms-muted">{SEMESTER_LABELS[c.semester]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

/** /teaching/subjects */
export default function TeachingSubjectsPage() {
  return <Page<Data> endpoint={'/teaching/subjects'} render={(d) => <View {...d} />} />;
}
