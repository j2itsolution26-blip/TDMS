import { useState } from 'react';
import { CalendarClock, MapPin, UserRound } from 'lucide-react';
import { Empty, PageShell } from '@/components/teaching/kit';
import { Page } from '@/lib/page-data';
import { useRouter } from '@/lib/navigation';
import { SEMESTER_LABELS } from '@shared/lib/teaching';
import { SUBJECT_TYPE_LABELS, type SubjectType } from '@shared/types/domain';
import type { loadMyClasses } from '@/server/controllers/pages/app/my/classes';

type Data = Awaited<ReturnType<typeof loadMyClasses>>;

/** /my/classes — the student's own classes, by semester, from their section. */
function View({ placement, years, classes }: Data) {
  const router = useRouter();
  const semesters = [...new Set(classes.map((c) => c.semester))].sort();
  const [semester, setSemester] = useState(placement && semesters.includes(placement.currentSemester) ? placement.currentSemester : semesters[0] ?? 1);
  const shown = classes.filter((c) => c.semester === semester);

  if (!placement) {
    return (
      <PageShell eyebrow="My Learning" title="My Classes" description="Your subjects, times, rooms and instructors.">
        <Empty title="You are not in a section yet" description="You are placed in a section when your enrollment is approved. Your classes appear here then." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="My Learning"
      title="My Classes"
      description={`${placement.section} · ${placement.program} · School year ${placement.schoolYear.replace('-', '–')}`}
      actions={years.length > 1 ? (
        <>
          <label htmlFor="my-year" className="sr-only">School year</label>
          <select id="my-year" className="rounded-xl border-tdms-hairline text-sm" value={placement.schoolYearId} onChange={(e) => router.push(`/my/classes?year=${e.target.value}`)}>
            {years.map((y) => <option key={y.id} value={y.id}>SY {y.label.replace('-', '–')}</option>)}
          </select>
        </>
      ) : null}
    >
      {classes.length === 0 ? (
        <Empty title="No classes scheduled yet" description="Your section's classes appear here once they are scheduled." />
      ) : (
        <div className="space-y-4">
          <div role="group" aria-label="Semester" className="inline-flex rounded-xl border border-tdms-hairline bg-white p-1">
            {semesters.map((s) => (
              <button key={s} type="button" aria-pressed={s === semester} onClick={() => setSemester(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${s === semester ? 'bg-forest text-white' : 'text-ink hover:bg-surface'}`}>
                {SEMESTER_LABELS[s] ?? `Semester ${s}`}
              </button>
            ))}
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {shown.map((c) => (
              <li key={c.id} className="rounded-2xl border border-tdms-hairline bg-white p-4 shadow-card">
                <p className="text-sm font-semibold text-ink">{c.title}</p>
                <p className="text-xs text-muted">{c.code} · {SUBJECT_TYPE_LABELS[c.type as SubjectType] ?? c.type}{c.units !== null ? ` · ${c.units} units` : ''}</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex gap-2"><dt><UserRound className="mt-0.5 h-4 w-4 text-muted" aria-label="Instructor" /></dt><dd>{c.instructor ?? 'Instructor to be assigned'}</dd></div>
                  <div className="flex gap-2"><dt><CalendarClock className="mt-0.5 h-4 w-4 text-muted" aria-label="Schedule" /></dt>
                    <dd>{c.meetings.length ? <ul>{c.meetings.map((m, i) => <li key={i}>{m.text}{m.room ? <span className="text-muted"> · {m.room}</span> : null}</li>)}</ul> : 'Schedule to be announced'}</dd>
                  </div>
                  {c.room && <div className="flex gap-2"><dt><MapPin className="mt-0.5 h-4 w-4 text-muted" aria-label="Room" /></dt><dd>{c.room}</dd></div>}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageShell>
  );
}

export default function MyClassesPage() {
  return <Page<Data> endpoint={'/my/classes'} render={(d) => <View {...d} />} />;
}
