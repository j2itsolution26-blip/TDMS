import { Card, Empty, PageShell } from '@/components/teaching/kit';
import { Page } from '@/lib/page-data';
import type { loadMyAssessments } from '@/server/controllers/pages/app/my/assessments';
import Link from '@/lib/link';
import { Chip, FOCUS } from '@/components/teaching/kit';
import { ASSESSMENT_PHASE_LABELS } from '@shared/lib/teaching';

type Data = Awaited<ReturnType<typeof loadMyAssessments>>;

function View({ open, rest, rows, upcoming }: Data) {
  const list = (items: Data['rows']) => (
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

/** /my/assessments */
export default function MyAssessmentsPage() {
  return <Page<Data> endpoint={'/my/assessments'} render={(d) => <View {...d} />} />;
}
