import Link from 'next/link';
import { notFound } from 'next/navigation';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, classRoster, requireInstructorClass, studentName } from '@/server/services/teaching/access';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import { DAY_NAMES, SEMESTER_LABELS, formatClock, schoolYearDisplay, yearLevelLabel } from '@/lib/teaching';
import { STUDENT_STATUS_LABELS, type StudentStatus } from '@/types/domain';
import { ArchivedNote, Card, Chip, Empty, FOCUS, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import StudentActions from '@/components/teaching/StudentActions';

export const dynamic = 'force-dynamic';

/** One class: its schedule, its roster and everything the Instructor does for it. */
export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((await params).id);
  if (!id) notFound();
  const cls = await orNotFound(requireInstructorClass(user, id));
  const roster = await classRoster(cls.sectionId);
  const h = classHeading(cls);
  const archived = cls.schoolYear.status === 'ARCHIVED';
  const q = `class=${cls.id}&year=${cls.schoolYearId}`;

  const links = [
    { label: 'Take Attendance', href: `/teaching/attendance?${q}`, primary: true },
    { label: 'Attendance Records', href: `/teaching/attendance-records?${q}` },
    { label: 'Gradebook', href: `/teaching/gradebook?${q}` },
    { label: 'Class Record', href: `/teaching/records?${q}` },
    { label: 'Quizzes', href: `/teaching/quizzes?${q}` },
    { label: 'Examinations', href: `/teaching/exams?${q}` },
    { label: 'Online Activities', href: `/teaching/activities?${q}` },
    { label: 'Performance Tasks', href: `/teaching/performance-tasks?${q}` },
  ];

  return (
    <PageShell
      back={{ href: '/teaching/classes', label: 'My Classes' }}
      eyebrow={`${h.subjectCode} · ${schoolYearDisplay(cls.schoolYear.label)} · ${SEMESTER_LABELS[cls.semester]}`}
      title={h.subject}
      description={`${h.program} • ${yearLevelLabel(cls.section.yearLevel)} • Section ${cls.section.name}${cls.room ? ` • Room ${cls.room}` : ''}`}
    >
      {archived && <ArchivedNote label={cls.schoolYear.label} />}

      <nav aria-label="Class tools" className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${FOCUS} ${
              l.primary && !archived ? 'bg-tdms-text text-white hover:bg-[#0B6A45]' : 'border border-tdms-hairline bg-white text-tdms-ink hover:bg-tdms-bg'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Schedule" description="Weekly meetings" className="xl:col-span-1">
          {cls.schedules.length === 0 ? (
            <p className="text-sm text-tdms-muted">No schedule has been set for this class yet.</p>
          ) : (
            <ul className="divide-y divide-tdms-hairline text-sm">
              {cls.schedules.map((s) => (
                <li key={s.id.toString()} className="flex items-center justify-between py-2">
                  <span className="font-semibold text-tdms-ink">{DAY_NAMES[s.dayOfWeek]}</span>
                  <span className="text-tdms-muted">
                    {formatClock(s.startTime)} – {formatClock(s.endTime)}
                    {(s.room ?? cls.room) ? ` · Room ${s.room ?? cls.room}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Class Roster" description={`${roster.length} ${roster.length === 1 ? 'student' : 'students'} in Section ${cls.section.name}`} padded={false} className="xl:col-span-2">
          {roster.length === 0 ? (
            <div className="px-5 pb-5 sm:px-6">
              <Empty title="No students yet" description="Students appear here once the TVET office adds them to this section." />
            </div>
          ) : (
            <Table
              label="Class roster"
              head={
                <>
                  <th scope="col" className={TH}>Student ID</th>
                  <th scope="col" className={TH}>Name</th>
                  <th scope="col" className={TH}>Program</th>
                  <th scope="col" className={TH}>Year</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                </>
              }
            >
              {roster.map((s) => (
                <tr key={s.id.toString()}>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{s.studentNumber}</td>
                  <td className={`${TD} whitespace-nowrap font-semibold`}>{studentName(s)}</td>
                  <td className={TD}>{s.program.code}</td>
                  <td className={`${TD} whitespace-nowrap`}>{yearLevelLabel(s.yearLevel)}</td>
                  <td className={TD}><Chip status={s.status} label={STUDENT_STATUS_LABELS[s.status as StudentStatus] ?? s.status} /></td>
                  <td className={TD}>
                    <StudentActions
                      classId={cls.id.toString()}
                      disabled={archived}
                      student={{ id: s.id.toString(), name: `${s.firstName} ${s.lastName}`, studentNumber: s.studentNumber, status: s.status }}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
