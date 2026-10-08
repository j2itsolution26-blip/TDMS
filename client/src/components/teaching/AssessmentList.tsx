import { useState } from 'react';
import Link from '@/lib/link';
import { Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { ASSESSMENT_KIND_LABELS, ASSESSMENT_KIND_PLURALS, ASSESSMENT_PHASE_LABELS, SCORE_STATUS_LABELS, type AssessmentKind, type ScoreStatus } from '@shared/lib/teaching';
import type { AssessmentListRow } from '@/server/services/teaching/assessments';
import AssessmentForm from './AssessmentForm';
import { BTN, Card, Chip, Empty, FOCUS, INPUT, TD, TH, Table } from './kit';

/** The list for one kind — Quizzes, Examinations, Online Activities or Performance Tasks. */
export default function AssessmentList({
  kind,
  rows,
  classes,
  canCreate,
  initialClass,
}: {
  kind: AssessmentKind;
  rows: AssessmentListRow[];
  classes: { id: string; label: string }[];
  canCreate: boolean;
  initialClass: string | null;
}) {
  const [creating, setCreating] = useState(false);
  const [classFilter, setClassFilter] = useState(initialClass ?? '');
  const [query, setQuery] = useState('');
  const label = ASSESSMENT_KIND_LABELS[kind];
  const shown = rows.filter((r) => (!classFilter || r.classId === classFilter) && (!query || r.title.toLowerCase().includes(query.toLowerCase())));

  return (
    <>
      <Card
        padded={false}
        title={`${rows.length} ${(rows.length === 1 ? label : ASSESSMENT_KIND_PLURALS[kind]).toLowerCase()}`}
        actions={
          canCreate && classes.length > 0 ? (
            <button type="button" className={BTN} onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New {kind === 'EXAM' ? 'Examination' : label}
            </button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2 sm:px-6">
          <label className="text-[13px] font-semibold">
            <span className="sr-only">Search</span>
            <input className={INPUT} placeholder={`Search ${label.toLowerCase()} titles…`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="text-[13px] font-semibold">
            <span className="sr-only">Class</span>
            <select className={INPUT} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </div>
        {shown.length === 0 ? (
          <div className="px-5 pb-5 sm:px-6">
            <Empty title={`No ${ASSESSMENT_KIND_PLURALS[kind].toLowerCase()} yet`} description={canCreate ? `Create one with “New ${kind === 'EXAM' ? 'Examination' : label}”.` : undefined} />
          </div>
        ) : (
          <Table
            label={label}
            head={
              <>
                <th scope="col" className={TH}>Title</th>
                <th scope="col" className={TH}>Class</th>
                <th scope="col" className={TH}>Schedule</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}>Scored</th>
                <th scope="col" className={TH}>Results</th>
              </>
            }
          >
            {shown.map((r) => (
              <tr key={r.id}>
                <td className={TD}>
                  <Link href={`/teaching/assessments/${r.id}`} className={`rounded font-semibold text-tdms-ink hover:text-tdms-text hover:underline ${FOCUS}`}>{r.title}</Link>
                  <span className="block text-xs text-tdms-muted">{r.kindLabel} · {r.totalPoints} pts{r.onlineEnabled ? ' · Online' : ''}</span>
                </td>
                <td className={TD}>
                  <span className="block">{r.subject}</span>
                  <span className="text-xs text-tdms-muted">{r.classDetail}</span>
                </td>
                <td className={`${TD} text-[13px]`}>{r.schedule ?? <span className="text-tdms-muted">Not scheduled</span>}</td>
                <td className={TD}><Chip status={r.phase} label={ASSESSMENT_PHASE_LABELS[r.phase]} /></td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.scored} / {r.roster}</td>
                <td className={TD}><Chip status={r.scoreStatus} label={SCORE_STATUS_LABELS[r.scoreStatus as ScoreStatus]} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title={`New ${kind === 'EXAM' ? 'Examination' : label}`} maxWidth="sm:max-w-3xl">
        <AssessmentForm kind={kind} classes={classes} defaultClassId={classFilter || initialClass} onCancel={() => setCreating(false)} />
      </Modal>
    </>
  );
}
