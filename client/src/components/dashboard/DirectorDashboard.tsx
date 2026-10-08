import Link from '@/lib/link';
import type { DirectorWorkspace } from '@shared/types/dashboard';
import {
  ActivityList,
  DashboardHeader,
  EmptyState,
  FOCUS,
  MetricGrid,
  NotTrackedNote,
  QuickLinks,
  SectionCard,
  SegmentGrid,
  StatusPill,
  TableScroll,
  WorkList,
  toneOf,
} from './RoleDashboardParts';

/**
 * The TVET Director — leadership and oversight.
 * "How is the entire program performing?"
 *
 *   header ............. greeting and the Director's remit
 *   KPI row ............ active programs, students, faculty, applications,
 *                        graduating students, actions requiring attention
 *   primary ............ Director Actions · Program Performance
 *   secondary .......... Student Progression · Graduation Readiness
 *                        Recent Program Activity
 *   quick actions
 *
 * Every panel comes from directorWorkspace() (role-workspaces.ts), gated by
 * the Director's policies. Grades, competencies and assessments are not
 * recorded by TDMS; the note under the figures says so instead of a panel of
 * zeros.
 */

const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'));

export default function DirectorDashboard({
  workspace: w,
  firstName,
  greeting,
  date,
  description,
}: {
  workspace: DirectorWorkspace;
  firstName: string;
  greeting: string;
  date: string;
  description: string;
}) {
  const hasStudents = w.programs?.some((p) => p.students !== null) ?? false;
  const hasApps = w.programs?.some((p) => p.pendingApplications !== null) ?? false;

  return (
    <div className="space-y-6">
      <DashboardHeader firstName={firstName} greeting={greeting} date={date} roleLabel="TVET Director" description={description} />

      <MetricGrid metrics={w.metrics} />
      <NotTrackedNote items={w.notTracked} />

      {/* Primary: what needs a decision, and where students stand. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard id="director-actions" title="Director Actions" description="Only what needs your attention">
          {w.actions.length === 0 ? (
            <EmptyState icon="attention" title="Nothing needs your attention" description="Decisions and reviews will be listed here as they come in." />
          ) : (
            <WorkList items={w.actions} />
          )}
        </SectionCard>
        {w.progression && (
          <SectionCard id="progression" title="Student Progression" description="Where active students stand" action={{ label: 'Students', href: '/students' }}>
            {w.progression.every((s) => s.value === 0) ? (
              <EmptyState icon="students" title="No students yet" description="Students will appear here after enrollment." action={{ label: 'View enrollment', href: '/enrollments' }} />
            ) : (
              <SegmentGrid segments={w.progression} label="Student progression" bar={false} />
            )}
            <p className="mt-3 text-xs text-tdms-muted">
              Graduating: in the final year of their curriculum. Incomplete: a required document not yet verified.
            </p>
          </SectionCard>
        )}
        {w.graduation && (
          <SectionCard id="graduation" title="Graduation Readiness" description="Final-year students and their outstanding requirements">
            {w.graduation.length === 0 ? (
              <EmptyState icon="graduation" title="No students in their final year" description="Students appear here when they reach the last year level of their curriculum." />
            ) : (
              <ul className="divide-y divide-tdms-hairline">
                {w.graduation.map((g) => (
                  <li key={g.id}>
                    <Link href={`/students/${g.id}/enrollment`} className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-tdms-bg ${FOCUS}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-tdms-ink">{g.name}</span>
                        <span className="block truncate text-xs text-tdms-muted">
                          {g.studentNumber} · {g.program} · Year {g.yearLevel}
                        </span>
                      </span>
                      {g.outstanding === 0 ? (
                        <StatusPill label="Requirements complete" tone="success" />
                      ) : (
                        <StatusPill label={`${g.outstanding} outstanding`} tone="attention" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
      </div>

      {/* How each program is doing — the full width, so every column fits. */}
        {w.programs && (
          <SectionCard
            id="program-performance"
            title="Program Performance"
            description="Students, progression and waiting applications per program"
            action={w.programs.length > 0 ? { label: 'All programs', href: '/programs' } : undefined}
          >
            {w.programs.length === 0 ? (
              <EmptyState icon="programs" title="No programs yet" description="Programs appear here once the Admin creates them." action={{ label: 'View programs', href: '/programs' }} />
            ) : (
              <TableScroll label="Program performance">
                <table className="w-full text-sm">
                  <caption className="sr-only">Program performance</caption>
                  <thead>
                    <tr className="border-y border-tdms-hairline bg-tdms-bg text-left text-xs font-semibold uppercase tracking-wide text-tdms-muted">
                      <th scope="col" className="px-5 py-2.5 sm:px-6">Program</th>
                      {hasStudents && <th scope="col" className="px-3 py-2.5 text-right">Students</th>}
                      {hasStudents && <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">Active</th>}
                      {hasStudents && <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">Graduating</th>}
                      {hasStudents && <th scope="col" className="hidden px-3 py-2.5 text-right lg:table-cell">Graduated</th>}
                      {hasApps && <th scope="col" className="px-3 py-2.5 text-right">Pending apps</th>}
                      <th scope="col" className="hidden px-5 py-2.5 sm:table-cell sm:px-6">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.programs.map((p) => (
                      <tr key={p.id} className="border-b border-tdms-hairline last:border-b-0 hover:bg-tdms-bg/60">
                        <td className="max-w-[16rem] px-5 py-3 sm:px-6">
                          <Link href={`/programs/${p.id}`} className={`block rounded ${FOCUS}`}>
                            <span className="block truncate font-semibold text-tdms-ink hover:underline">{p.name}</span>
                            <span className="block text-xs text-tdms-muted">{p.code}</span>
                          </Link>
                        </td>
                        {hasStudents && <td className="px-3 py-3 text-right font-semibold tabular-nums text-tdms-ink">{num(p.students)}</td>}
                        {hasStudents && <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">{num(p.active)}</td>}
                        {hasStudents && <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">{num(p.graduating)}</td>}
                        {hasStudents && <td className="hidden px-3 py-3 text-right tabular-nums lg:table-cell">{num(p.graduated)}</td>}
                        {hasApps && <td className="px-3 py-3 text-right tabular-nums">{num(p.pendingApplications)}</td>}
                        <td className="hidden px-5 py-3 sm:table-cell sm:px-6">
                          <StatusPill label={p.status.label} tone={toneOf(p.status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </SectionCard>
        )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <SectionCard id="activity" className="xl:col-span-3" title="Recent Program Activity" description="Applications, students, enrollments and documents">
          {w.activity.length === 0 ? (
            <EmptyState icon="applications" title="No recent activity" description="Activity will appear here as the office works." />
          ) : (
            <ActivityList items={w.activity} />
          )}
        </SectionCard>
        {w.quickActions.length > 0 && (
          <SectionCard id="quick-actions" title="Quick Actions" description="Pages you open most" className="xl:col-span-2">
            <QuickLinks links={w.quickActions} compact />
          </SectionCard>
        )}
      </div>
    </div>
  );
}
