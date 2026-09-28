import type { SecretaryWorkspace } from '@/types/dashboard';
import {
  ActivityList,
  DashboardHeader,
  EmptyState,
  MetricGrid,
  QuickLinks,
  SectionCard,
  SegmentGrid,
  TableScroll,
  WorkList,
} from './RoleDashboardParts';

/**
 * The TVET Secretary — records and administrative operations.
 * "Are student records, applications and enrollment processed?"
 *
 *   header · KPI row
 *   primary ............ the Work Queue, full width and prominent
 *   secondary .......... Application Pipeline · Document Status
 *                        Enrollment Overview (per program) · Recent Student Record Activity
 *   quick actions
 *
 * The pipeline uses TDMS's own application statuses — submitted, under
 * review, approved, returned. TDMS has no "rejected" status (an application
 * is returned for correction), so none is shown.
 */

export default function SecretaryDashboard({
  workspace: w,
  firstName,
  greeting,
  date,
  description,
}: {
  workspace: SecretaryWorkspace;
  firstName: string;
  greeting: string;
  date: string;
  description: string;
}) {
  const waiting = w.queue.reduce((sum, q) => sum + q.count, 0);

  return (
    <div className="space-y-6">
      <DashboardHeader firstName={firstName} greeting={greeting} date={date} roleLabel="TVET Secretary" description={description} />

      <MetricGrid metrics={w.metrics} />

      {w.queue.length > 0 && (
        <SectionCard
          id="work-queue"
          title="Work Queue"
          description={waiting > 0 ? `${waiting.toLocaleString('en-US')} ${waiting === 1 ? 'item' : 'items'} across the office’s work` : 'Everything is processed'}
        >
          <WorkList items={w.queue} prominent />
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {w.pipeline && (
          <SectionCard id="pipeline" title="Application Pipeline" description="Every application by where it stands" action={{ label: 'Applications', href: '/applications' }}>
            {w.pipeline.every((s) => s.value === 0) ? (
              <EmptyState icon="applications" title="No applications yet" description="New applications will appear here when students apply." action={{ label: 'View applications', href: '/applications' }} />
            ) : (
              <SegmentGrid segments={w.pipeline} label="Application pipeline" wide />
            )}
          </SectionCard>
        )}

        {w.documents && (
          <SectionCard id="documents" title="Document Status" description="Student requirements, reviewed on each student’s record" action={{ label: 'Students', href: '/students' }}>
            {w.documents.every((s) => s.value === 0) ? (
              <EmptyState icon="documents" title="No student documents yet" description="Requirements appear here once students are recorded." />
            ) : (
              <SegmentGrid segments={w.documents} label="Document status" wide />
            )}
          </SectionCard>
        )}
      </div>

        {w.enrollmentByProgram && (
          <SectionCard id="enrollment-overview" title="Enrollment Overview" description="Applications and enrollments per program" action={{ label: 'Enrollment', href: '/enrollments' }}>
            {w.enrollmentByProgram.length === 0 ? (
              <EmptyState icon="enrollment" title="No programs yet" description="Each program’s applications and enrollments will appear here." action={{ label: 'View programs', href: '/programs' }} />
            ) : (
              <TableScroll label="Enrollment overview">
                <table className="w-full text-sm">
                  <caption className="sr-only">Enrollment overview per program</caption>
                  <thead>
                    <tr className="border-y border-tdms-hairline bg-tdms-bg text-xs font-semibold uppercase tracking-wide text-tdms-muted">
                      <th scope="col" className="px-5 py-2.5 text-left sm:px-6">Program</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Applications</th>
                      <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">Approved</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Enrolled</th>
                      <th scope="col" className="px-5 py-2.5 text-right sm:px-6">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.enrollmentByProgram.map((r) => (
                      <tr key={r.id} className="border-b border-tdms-hairline last:border-b-0 hover:bg-tdms-bg/60">
                        <td className="max-w-[16rem] px-5 py-3 sm:px-6">
                          <span className="block truncate font-semibold text-tdms-ink">{r.name}</span>
                          <span className="block text-xs text-tdms-muted">{r.code}</span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.applications.toLocaleString('en-US')}</td>
                        <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{r.approved.toLocaleString('en-US')}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-tdms-ink">{r.enrolled.toLocaleString('en-US')}</td>
                        <td className={`px-5 py-3 text-right tabular-nums sm:px-6 ${r.pending > 0 ? 'font-semibold text-amber-800' : ''}`}>{r.pending.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </SectionCard>
        )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <SectionCard id="activity" title="Recent Student Record Activity" description="Registrations, applications, enrollment and documents" className="xl:col-span-3">
          {w.activity.length === 0 ? (
            <EmptyState icon="records" title="No recent activity" description="Student registrations, applications and enrollment changes will appear here." />
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
