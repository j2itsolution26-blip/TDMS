import Link from 'next/link';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { yearPage } from '@/server/services/teaching/page-context';
import { SEMESTER_LABELS } from '@/lib/teaching';
import { Card, Empty, FOCUS, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';

export const dynamic = 'force-dynamic';

/** My Subjects — the subjects this Instructor teaches, with the sections for each. */
export default async function MySubjectsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);

  const bySubject = new Map<string, { code: string; title: string; classes: typeof classes }>();
  for (const c of classes) {
    const key = c.subject.id.toString();
    const entry = bySubject.get(key) ?? { code: c.subject.code, title: c.subject.title, classes: [] };
    entry.classes.push(c);
    bySubject.set(key, entry);
  }
  const subjects = [...bySubject.values()].sort((a, b) => a.code.localeCompare(b.code));

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
