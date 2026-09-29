import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CoordinatorWorkspace, ProgramReadiness } from '@/types/dashboard';
import {
  ActivityList,
  DashboardHeader,
  EmptyState,
  FOCUS,
  MetricGrid,
  NotTrackedNote,
  ProgressList,
  QuickLinks,
  SectionCard,
  StatusPill,
  WorkList,
  toneOf,
} from './RoleDashboardParts';
import SubjectsPerProgramTable from './SubjectsPerProgramTable';

/**
 * The TVET Coordinator — academic and curriculum operations.
 * "Is the academic structure ready and properly managed?"
 *
 *   header · KPI row
 *   primary ............ Coordinator Tasks · Academic Setup Progress
 *   readiness .......... one card per program: curriculum, subjects, terms, enrollment
 *   secondary .......... Subjects per Program (sortable) · Recent Academic Activity
 *   quick actions
 *
 * A Coordinator may not see student records, so nothing here counts or names
 * a student.
 */

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${ok ? 'text-emerald-800' : 'text-amber-800'}`}>
      <Icon className={`h-4 w-4 ${ok ? 'text-emerald-600' : 'text-amber-600'}`} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{ok ? 'Done: ' : 'Needs attention: '}</span>
      {children}
    </span>
  );
}

function ReadinessCard({ p }: { p: ProgramReadiness }) {
  const inactive = p.status.status === 'inactive';
  return (
    <li className="flex h-full flex-col rounded-xl border border-tdms-hairline bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-tdms-ink">{p.name}</p>
          <p className="text-xs text-tdms-muted">{p.code}</p>
        </div>
        <StatusPill label={p.status.label} tone={toneOf(p.status)} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-tdms-muted">Curriculum</dt>
          <dd><Check ok={Boolean(p.curriculum)}>{p.curriculum ?? 'Not set up'}</Check></dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-tdms-muted">Subjects</dt>
          <dd><Check ok={p.subjects > 0}>{p.subjects > 0 ? `${p.subjects} mapped` : 'None mapped'}</Check></dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-tdms-muted">Terms</dt>
          <dd><Check ok={p.emptyTerms === 0}>{p.emptyTerms === 0 ? 'No gaps' : `${p.emptyTerms} empty`}</Check></dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-tdms-muted">Enrollment</dt>
          <dd><Check ok={p.ready}>{p.ready ? 'Ready' : inactive ? 'Inactive' : 'Not ready'}</Check></dd>
        </div>
      </dl>
      {!p.ready && !inactive && (
        <Link
          href={`/programs/${p.id}`}
          aria-label={`Review ${p.name}`}
          className={`mt-4 inline-flex w-fit rounded-lg border border-tdms-hairline px-3 py-1.5 text-xs font-semibold text-tdms-ink hover:bg-tdms-bg ${FOCUS}`}
        >
          Review
        </Link>
      )}
    </li>
  );
}

export default function CoordinatorDashboard({
  workspace: w,
  firstName,
  greeting,
  date,
  description,
}: {
  workspace: CoordinatorWorkspace;
  firstName: string;
  greeting: string;
  date: string;
  description: string;
}) {
  // Programs needing work first, then the rest; the table below lists them all.
  const cards = [...(w.readiness ?? [])]
    .filter((p) => p.status.status !== 'inactive')
    .sort((a, b) => Number(a.ready) - Number(b.ready) || a.name.localeCompare(b.name))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <DashboardHeader firstName={firstName} greeting={greeting} date={date} roleLabel="TVET Coordinator" description={description} />

      <MetricGrid metrics={w.metrics} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <SectionCard id="coordinator-tasks" title="Coordinator Tasks" description="Academic work waiting to be done" className="xl:col-span-3">
          {w.tasks.length === 0 ? (
            <EmptyState icon="tasks" title="The academic structure is in order" description="Curricula, subject mapping and reviews that need attention will be listed here." />
          ) : (
            <WorkList items={w.tasks} />
          )}
        </SectionCard>

        {w.progress && (
          <SectionCard id="setup-progress" title="Academic Setup Progress" description="Measured from the programs, curricula and subjects" className="xl:col-span-2">
            {w.progress.length === 0 ? (
              <EmptyState icon="programs" title="No programs yet" description="Create your first diploma program to begin academic setup." action={{ label: 'Open programs', href: '/programs' }} />
            ) : (
              <ProgressList rows={w.progress} />
            )}
          </SectionCard>
        )}
      </div>

      {w.readiness && (
        <SectionCard id="readiness" title="Program & Curriculum Readiness" description="Is each active program ready to enroll into?" action={w.readiness.length > 0 ? { label: 'All programs', href: '/programs' } : undefined}>
          {cards.length === 0 ? (
            <EmptyState icon="programs" title="No active programs yet" description="Create your first diploma program to begin academic setup." action={{ label: 'Open programs', href: '/programs' }} />
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {cards.map((p) => (
                <ReadinessCard key={p.id} p={p} />
              ))}
            </ul>
          )}
        </SectionCard>
      )}

        {w.readiness && (
          <SectionCard id="subjects-per-program" title="Subjects per Program" description="Each program's current curriculum. Sort or filter the table.">
            {w.readiness.length === 0 ? (
              <EmptyState icon="subjects" title="No programs yet" description="Subjects per program appear once programs and curricula exist." />
            ) : (
              <SubjectsPerProgramTable rows={w.readiness} />
            )}
          </SectionCard>
        )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <SectionCard id="activity" title="Recent Academic Activity" description="Curricula, subjects, programs, applications and enrollment" className="xl:col-span-3">
          {w.activity.length === 0 ? (
            <EmptyState icon="curricula" title="No recent activity" description="Curriculum, subject and enrollment changes will appear here." />
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

      <NotTrackedNote items={w.notTracked} />
    </div>
  );
}
