import Link from '@/lib/link';
import { Clock3, MapPin, UsersRound } from 'lucide-react';
import { classHeading } from '@shared/lib/teaching-labels';
import { DAY_SHORT, SEMESTER_LABELS, formatClock } from '@shared/lib/teaching';
import { ArchivedNote, Chip, Empty, FOCUS, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import { Page } from '@/lib/page-data';
import type { loadTeachingClasses } from '@/server/controllers/pages/app/teaching/classes';

type Data = Awaited<ReturnType<typeof loadTeachingClasses>>;

function View({ classes, ctx, roster }: Data) {
  return (
    <PageShell
      eyebrow="Teaching"
      title="My Classes"
      description="The classes assigned to you. Open one for its roster, attendance, assessments and grades."
      actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}
    >
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}
      {classes.length === 0 ? (
        <Empty
          title="No classes assigned"
          description="When the TVET office assigns you to a class for this school year, it will appear here."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {classes.map((c) => {
            const h = classHeading(c);
            return (
              <li key={c.id.toString()}>
                <Link href={`/teaching/classes/${c.id}`} className={`block h-full rounded-2xl border border-tdms-hairline bg-white p-5 shadow-card transition-colors hover:border-[#CDE3D8] hover:bg-[#FBFDFC] ${FOCUS}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-tdms-text">{h.subjectCode} · {SEMESTER_LABELS[c.semester]}</p>
                      <p className="mt-0.5 text-base font-bold text-tdms-ink">{h.subject}</p>
                      <p className="text-[13px] text-tdms-muted">{h.detail}</p>
                    </div>
                    <Chip status={c.gradeStatus} label={`Grades: ${c.gradeStatus.charAt(0)}${c.gradeStatus.slice(1).toLowerCase()}`} />
                  </div>
                  <div className="mt-3 space-y-1.5 text-[13px] text-tdms-ink">
                    <p className="flex items-center gap-1.5">
                      <UsersRound className="h-4 w-4 text-tdms-muted" aria-hidden="true" />
                      {roster.get(c.sectionId.toString()) ?? 0} students
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock3 className="h-4 w-4 text-tdms-muted" aria-hidden="true" />
                      {c.schedules.length
                        ? c.schedules.map((s) => `${DAY_SHORT[s.dayOfWeek]} ${formatClock(s.startTime)}–${formatClock(s.endTime)}`).join(', ')
                        : 'No schedule set'}
                    </p>
                    {c.room && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-tdms-muted" aria-hidden="true" />
                        Room {c.room}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}

/** /teaching/classes */
export default function TeachingClassesPage() {
  return <Page<Data> endpoint={'/teaching/classes'} render={(d) => <View {...d} />} />;
}
