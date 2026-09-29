import Link from 'next/link';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { studentAssessments } from '@/server/services/teaching/assessments';
import { orNotFound } from '@/server/services/teaching/page-context';
import { ASSESSMENT_PHASE_LABELS } from '@/lib/teaching';
import { Card, Chip, Empty, FOCUS, PageShell } from '@/components/teaching/kit';

export const dynamic = 'force-dynamic';

/** A student's quizzes, examinations, activities and PT — schedules, and results once released. */
export default async function MyAssessmentsPage() {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const rows = await orNotFound(studentAssessments(user));
  const open = rows.filter((r) => r.canTake);
  const upcoming = rows.filter((r) => r.phase === 'SCHEDULED');
  const rest = rows.filter((r) => !r.canTake && r.phase !== 'SCHEDULED');

  const list = (items: typeof rows) => (
    <ul className="divide-y divide-tdms-hairline">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={`/my/assessments/${r.id}`} className={`-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-tdms-bg ${FOCUS}`}>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-tdms-text">{r.kindLabel}</p>
              <p className="font-semibold text-tdms-ink">{r.title}</p>
              <p className="text-[13px] text-tdms-muted">{r.subject}{r.schedule ? ` · ${r.schedule}` : ''}</p>
            </div>
            <div className="text-right">
              {r.released && r.points !== null ? (
                <>
                  <p className="text-lg font-bold tabular-nums">{r.points} / {r.totalPoints}</p>
                  {r.passed !== null && <Chip status={r.passed ? 'PASSED' : 'FAILED'} label={r.passed ? 'Passed' : 'Failed'} />}
                </>
              ) : r.canTake ? (
                <span className="rounded-lg bg-tdms-text px-3 py-1.5 text-xs font-semibold text-white">Take now</span>
              ) : (
                <Chip status={r.submitted && !r.released ? 'SUBMITTED' : r.phase} label={r.submitted && !r.released ? 'Submitted — awaiting release' : ASSESSMENT_PHASE_LABELS[r.phase]} />
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <PageShell eyebrow="My Learning" title="Quizzes & Exams" description="Scheduled quizzes and examinations, online activities and performance tasks. Scores appear once your instructor releases them.">
      {rows.length === 0 && <Empty title="Nothing scheduled" description="Your instructors' quizzes and examinations will appear here." />}
      {open.length > 0 && <Card title="Open now">{list(open)}</Card>}
      {upcoming.length > 0 && <Card title="Scheduled">{list(upcoming)}</Card>}
      {rest.length > 0 && <Card title="Past and results">{list(rest)}</Card>}
    </PageShell>
  );
}
