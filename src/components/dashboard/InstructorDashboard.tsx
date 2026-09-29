import Link from 'next/link';
import { CalendarCheck, CheckCircle2, Clock3, MapPin, UsersRound } from 'lucide-react';
import type { InstructorDashboardData, TodayClass } from '@/server/services/teaching/instructor-dashboard';
import { SUPPORT_STATUS_LABELS, type SupportStatus } from '@/lib/teaching';
import { ActivityList, EmptyState, FOCUS, MetricGrid, SectionCard, StatusPill, WorkList } from './RoleDashboardParts';
import GreetingHeading from './GreetingHeading';

/**
 * The Diploma Instructor's dashboard: "Here's your teaching overview for
 * today." Every figure comes from the database through one service call
 * (instructor-dashboard.ts); nothing here is sample data.
 */

const STROKE = 1.9;

function StateBadge({ state }: { state: TodayClass['state'] }) {
  if (state === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
        <span aria-hidden="true" className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
        </span>
        LIVE
      </span>
    );
  }
  if (state === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" /> Completed
      </span>
    );
  }
  return <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Upcoming</span>;
}

function ClassRow({ c }: { c: TodayClass }) {
  const a = c.attendance;
  return (
    <li className={`rounded-xl border p-4 ${c.state === 'LIVE' ? 'border-emerald-200 bg-emerald-50/40' : 'border-tdms-hairline'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-tdms-ink">{c.subject}</p>
          <p className="text-[13px] text-tdms-muted">
            {c.program} • {c.yearLevel} • Section {c.section}
          </p>
        </div>
        <StateBadge state={c.state} />
      </div>
      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-tdms-ink">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Time</dt>
          <Clock3 className="h-4 w-4 text-tdms-muted" strokeWidth={STROKE} aria-hidden="true" />
          <dd>{c.time}</dd>
        </div>
        {c.room && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Room</dt>
            <MapPin className="h-4 w-4 text-tdms-muted" strokeWidth={STROKE} aria-hidden="true" />
            <dd>Room {c.room}</dd>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Students</dt>
          <UsersRound className="h-4 w-4 text-tdms-muted" strokeWidth={STROKE} aria-hidden="true" />
          <dd>{c.students} students</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Attendance</dt>
          <CalendarCheck className="h-4 w-4 text-tdms-muted" strokeWidth={STROKE} aria-hidden="true" />
          <dd>
            {a
              ? `Attendance ${a.status === 'OPEN' ? 'open' : 'taken'} · ${a.present + a.late}/${c.students} present${a.late ? ` (${a.late} late)` : ''}`
              : 'Attendance not taken'}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/teaching/classes/${c.classId}`} className={`rounded-lg border border-tdms-hairline bg-white px-3 py-2 text-xs font-semibold text-tdms-ink hover:bg-tdms-bg ${FOCUS}`}>
          Open Class
        </Link>
        <Link
          href={a ? `/teaching/attendance/${a.sessionId}` : `/teaching/attendance?class=${c.classId}&start=${c.startTime}&end=${c.endTime}`}
          className={`rounded-lg bg-tdms-text px-3 py-2 text-xs font-semibold text-white hover:bg-[#0B6A45] ${FOCUS}`}
        >
          {a?.status === 'OPEN' ? 'Continue Attendance' : a ? 'View Attendance' : 'Take Attendance'}
        </Link>
      </div>
    </li>
  );
}

export default function InstructorDashboard({
  data,
  firstName,
  greeting,
}: {
  data: InstructorDashboardData;
  firstName: string;
  greeting: string;
}) {
  const { context, kpis, todayClasses, pendingWork, support, activity } = data;
  const at = kpis.attendanceToday;
  const recorded = at.present + at.late + at.absent + at.excused;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-tdms-text">
          Diploma Instructor <span aria-hidden="true" className="text-tdms-muted">·</span>{' '}
          <span className="font-medium text-tdms-muted">{context.date}</span>
        </p>
        <GreetingHeading firstName={firstName} initialGreeting={greeting} />
        <p className="text-[15px] text-tdms-muted">Here&apos;s your teaching overview for today.</p>
        <dl className="mt-2 flex flex-wrap gap-2 text-[13px]">
          <div className="rounded-full border border-tdms-hairline bg-white px-3 py-1">
            <dt className="inline text-tdms-muted">School Year </dt>
            <dd className="inline font-semibold text-tdms-ink">{context.schoolYear ?? 'Not set'}</dd>
          </div>
          <div className="rounded-full border border-tdms-hairline bg-white px-3 py-1">
            <dt className="inline text-tdms-muted">Semester </dt>
            <dd className="inline font-semibold text-tdms-ink">{context.semester ?? '—'}</dd>
          </div>
          {context.current && (
            <div className={`rounded-full border px-3 py-1 ${context.current.live ? 'border-emerald-200 bg-emerald-50' : 'border-tdms-hairline bg-white'}`}>
              <dt className="inline text-tdms-muted">{context.current.live ? 'Now: ' : 'Next: '}</dt>
              <dd className="inline font-semibold text-tdms-ink">
                {context.current.subject} · {context.current.time}
              </dd>
            </div>
          )}
        </dl>
      </header>

      {!context.schoolYear && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No school year is active yet. Your classes will appear once the TVET office opens one and assigns you.
        </p>
      )}

      <MetricGrid
        metrics={[
          { key: 'subjects', label: 'My Subjects', value: kpis.subjects, hint: kpis.subjects === 0 ? 'None assigned this semester' : 'This semester', icon: 'subjects', href: '/teaching/subjects' },
          { key: 'students', label: 'My Students', value: kpis.students, hint: 'Across your sections', icon: 'students', href: '/teaching/students' },
          { key: 'today', label: "Today's Classes", value: kpis.todayClasses, hint: kpis.todayClasses === 0 ? 'No classes today' : 'Scheduled today', icon: 'teachers', href: '/teaching/attendance' },
          {
            key: 'attendance',
            label: 'Attendance Today',
            value: at.present + at.late,
            hint: at.expected > 0 ? `of ${at.expected} expected${at.absent ? ` · ${at.absent} absent` : ''}` : 'Nothing expected today',
            icon: 'enrollment',
            href: '/teaching/attendance-records',
          },
          { key: 'activities', label: 'Pending Activities', value: kpis.pendingActivities, hint: 'Results not yet released', tone: kpis.pendingActivities > 0 ? 'attention' : undefined, icon: 'tasks', href: '/teaching/checking' },
          { key: 'grades', label: 'Pending Grades', value: kpis.pendingGrades, hint: 'Classes not yet released', tone: kpis.pendingGrades > 0 ? 'attention' : undefined, icon: 'graduation', href: '/teaching/gradebook' },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard id="today" title="Today's Classes" description="Current and upcoming meetings" action={{ label: 'My classes', href: '/teaching/classes' }} className="xl:col-span-2">
          {todayClasses.length === 0 ? (
            <EmptyState icon="teachers" title="No classes today" description="Your schedule has no meetings on this day of the week." action={{ label: 'View my classes', href: '/teaching/classes' }} />
          ) : (
            <ul className="space-y-3">
              {todayClasses.map((c) => (
                <ClassRow key={`${c.classId}-${c.startTime}`} c={c} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard id="attendance" title="Attendance" description="Recorded today across your classes" action={{ label: 'Records', href: '/teaching/attendance-records' }}>
          {recorded === 0 ? (
            <EmptyState icon="enrollment" title="No attendance yet today" description="Open an attendance session from Today's Classes to start scanning." />
          ) : (
            <ul className="grid grid-cols-3 gap-3">
              {[
                { label: 'Present', value: at.present, tone: 'success' as const },
                { label: 'Late', value: at.late, tone: 'attention' as const },
                { label: 'Absent', value: at.absent, tone: 'failed' as const },
              ].map((s) => (
                <li key={s.label} className="rounded-xl border border-tdms-hairline p-3 text-center">
                  <StatusPill label={s.label} tone={s.tone} />
                  <p className="mt-2 text-2xl font-bold tabular-nums text-tdms-ink">{s.value}</p>
                </li>
              ))}
            </ul>
          )}
          {at.expected > 0 && (
            <p className="mt-3 text-xs text-tdms-muted">
              {at.present + at.late} of {at.expected} students present in today&apos;s classes.
            </p>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard id="pending" title="Pending Work" description="What is waiting on you">
          <WorkList items={pendingWork.map((p) => ({ ...p, icon: 'tasks' as const }))} />
        </SectionCard>

        <SectionCard id="support" title="Student Support" description="Learning support and attendance concerns" action={{ label: 'Learning support', href: '/teaching/learning-support' }}>
          <p className="text-sm text-tdms-ink">
            <span className="text-2xl font-bold tabular-nums">{support.open}</span>{' '}
            <span className="text-tdms-muted">{support.open === 1 ? 'student requires' : 'students require'} learning support</span>
          </p>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-[0.08em] text-tdms-muted">Recent recommendations</h3>
          {support.recent.length === 0 ? (
            <p className="mt-1 text-[13px] text-tdms-muted">None yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-tdms-hairline">
              {support.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-tdms-ink">{r.student}</span> <span className="text-tdms-muted">· {r.subject}</span>
                  </span>
                  <StatusPill label={SUPPORT_STATUS_LABELS[r.status as SupportStatus] ?? r.status} tone={r.status === 'RESOLVED' ? 'success' : r.status === 'IN_PROGRESS' ? 'info' : 'attention'} />
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-4 text-xs font-bold uppercase tracking-[0.08em] text-tdms-muted">Attendance concerns (3+ absences)</h3>
          {support.attendanceConcerns.length === 0 ? (
            <p className="mt-1 text-[13px] text-tdms-muted">No student has three or more absences.</p>
          ) : (
            <ul className="mt-1 divide-y divide-tdms-hairline">
              {support.attendanceConcerns.map((s) => (
                <li key={s.studentId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-tdms-ink">
                    {s.name} <span className="font-normal text-tdms-muted">· {s.studentNumber}</span>
                  </span>
                  <StatusPill label={`${s.absences} absences`} tone="failed" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard id="activity" title="Recent Activity" description="Your latest actions in TDMS">
        {activity.length === 0 ? (
          <EmptyState icon="records" title="No activity yet" description="Attendance, assessments, grades and documents you work on will appear here." />
        ) : (
          <ActivityList items={activity.map((a) => ({ id: a.id, title: a.title, subtitle: a.subtitle, at: a.at }))} />
        )}
      </SectionCard>
    </div>
  );
}
