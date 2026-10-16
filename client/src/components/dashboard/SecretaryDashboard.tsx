import type { SecretaryWorkspace } from '@shared/types/dashboard';
import { EmptyState } from './RoleDashboardParts';
import { Plus } from 'lucide-react';
import Link from '@/lib/link';
import { ActivityFeed, KpiTiles, Panel, ProgramTable, StatusBreakdown, UpcomingEvents, WorkQueue } from './SecretaryParts';
import WelcomeBanner, { BANNER_PRIMARY } from './WelcomeBanner';

/**
 * The TVET Secretary — records and administrative operations.
 * "Are student records, applications and enrollment processed?"
 *
 *   banner ............. the shared WelcomeBanner, with Add Student when permitted
 *   key figures ........ six counts, each opening the list it counts
 *   workspace .......... Work Queue (tabs by stream, oldest-waiting age) · Recent Activity
 *   status ............. Application Status · Document Status · Upcoming Events
 *   programs ........... students, applications and enrollment per program
 *
 * The Processing Officer gets the same page under their own title; every
 * panel is present only when the server let the viewer's permissions fill it.
 */

export default function SecretaryDashboard({
  workspace: w,
  firstName,
  greeting,
  date,
  description,
  roleLabel = 'TVET Secretary',
}: {
  workspace: SecretaryWorkspace;
  firstName: string;
  greeting: string;
  date: string;
  description: string;
  /** The same workspace serves the Processing Officer under their own title. */
  roleLabel?: string;
}) {
  const statusPanels = [w.pipeline, w.documents].filter(Boolean).length + 1;

  return (
    <div className="space-y-6">
      <WelcomeBanner
        firstName={firstName}
        greeting={greeting}
        date={date}
        roleLabel={roleLabel}
        description={description}
        actions={
          w.canAddStudent ? (
            <Link href="/students?new=1" className={BANNER_PRIMARY}>
              <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Add Student
            </Link>
          ) : undefined
        }
      />

      <KpiTiles metrics={w.metrics} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {w.queue.length > 0 && (
          <div className="min-w-0 xl:col-span-7">
            <WorkQueue items={w.queue} />
          </div>
        )}
        <Panel
          id="activity"
          title="Recent Activity"
          description="Registrations, applications, enrollment and documents"
          className={w.queue.length > 0 ? 'xl:col-span-5' : 'xl:col-span-12'}
        >
          <ActivityFeed items={w.activity} />
        </Panel>
      </div>

      <div className={`grid grid-cols-1 gap-6 lg:grid-cols-2 ${statusPanels === 3 ? 'xl:grid-cols-3' : ''}`}>
        {w.pipeline && (
          <Panel id="pipeline" title="Application Status" description="Every application by where it stands" action={{ label: 'Applications', href: '/applications' }}>
            {w.pipeline.every((s) => s.value === 0) ? (
              <EmptyState icon="applications" title="No applications yet" description="Applications appear here once they are recorded." action={{ label: 'Open applications', href: '/applications' }} />
            ) : (
              <StatusBreakdown segments={w.pipeline} label="Application status" />
            )}
          </Panel>
        )}

        {w.documents && (
          <Panel id="documents" title="Document Status" description="Student requirements, verified on each student’s record" action={{ label: 'Students', href: '/students' }}>
            {w.documents.every((s) => s.value === 0) ? (
              <EmptyState icon="documents" title="No student documents yet" description="Requirements appear here once students are recorded." />
            ) : (
              <StatusBreakdown segments={w.documents} label="Document status" />
            )}
          </Panel>
        )}

        <Panel
          id="events"
          title="Upcoming Events"
          description="The school calendar, next 60 days"
          action={{ label: 'Calendar', href: '/calendar' }}
          // Alone, it takes the row; third of three, it takes the second row on a laptop.
          className={statusPanels === 1 ? 'lg:col-span-2' : statusPanels === 3 ? 'lg:col-span-2 xl:col-span-1' : ''}
        >
          <UpcomingEvents events={w.events} />
        </Panel>
      </div>

      {w.enrollmentByProgram && (
        <Panel
          id="enrollment-overview"
          title="Enrollment by Program"
          description="Students, applications and enrollment per program"
          action={{ label: 'Enrollment', href: '/enrollments' }}
          flush={w.enrollmentByProgram.length > 0}
        >
          {w.enrollmentByProgram.length === 0 ? (
            <EmptyState icon="enrollment" title="No programs yet" description="Each program’s students, applications and enrollments will appear here." action={{ label: 'View programs', href: '/programs' }} />
          ) : (
            <ProgramTable rows={w.enrollmentByProgram} />
          )}
        </Panel>
      )}
    </div>
  );
}
