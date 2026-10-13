import { useState } from 'react';
import Modal from '@/components/Modal';
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABELS } from '@shared/lib/teaching';
import { SupportForm } from './StudentActions';
import { BTN_SMALL, Card, Chip, Empty, INPUT, TD, TH, Table } from './kit';

export interface SupportRow {
  id: string;
  classId: string;
  studentId: string;
  student: string;
  studentNumber: string;
  subject: string;
  difficulty: string;
  evidence: string | null;
  interventions: string[];
  support: string | null;
  followUpOn: string | null;
  notes: string | null;
  status: string;
  statusLabel: string;
  instructor: string | null;
  updatedAt: string;
}

/**
 * Learning Support Recommendations. The Instructor edits their own; the
 * Director and Coordinator see the same list read-only, to monitor
 * interventions across classes.
 */
export default function SupportList({ rows, editable, showInstructor = false }: { rows: SupportRow[]; editable: boolean; showInstructor?: boolean }) {
  const [editing, setEditing] = useState<SupportRow | null>(null);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const shown = rows.filter((r) => (!status || r.status === status) && (!query || `${r.student} ${r.studentNumber} ${r.subject}`.toLowerCase().includes(query.toLowerCase())));

  return (
    <Card padded={false} title={`${rows.filter((r) => r.status !== 'RESOLVED').length} open of ${rows.length}`}>
      <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2 sm:px-6">
        <label><span className="sr-only">Search</span><input className={INPUT} placeholder="Search student or subject…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label>
          <span className="sr-only">Status</span>
          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="px-5 pb-5 sm:px-6">
          <Empty title="No recommendations" description={editable ? 'Record one from a student’s row in My Classes or Students.' : 'Recommendations recorded by Diploma Instructors appear here.'} />
        </div>
      ) : (
        <Table
          label="Learning support recommendations"
          head={
            <>
              <th scope="col" className={TH}>Student</th>
              <th scope="col" className={TH}>Subject</th>
              {showInstructor && <th scope="col" className={TH}>Instructor</th>}
              <th scope="col" className={TH}>Observed difficulty</th>
              <th scope="col" className={TH}>Intervention</th>
              <th scope="col" className={TH}>Follow-up</th>
              <th scope="col" className={TH}>Status</th>
              {editable && <th scope="col" className={TH}><span className="sr-only">Edit</span></th>}
            </>
          }
        >
          {shown.map((r) => (
            <tr key={r.id}>
              <td className={TD}><span className="font-semibold">{r.student}</span><span className="block text-xs text-tdms-muted tabular-nums">{r.studentNumber}</span></td>
              <td className={TD}>{r.subject}</td>
              {showInstructor && <td className={TD}>{r.instructor ?? '—'}</td>}
              <td className={`${TD} max-w-xs text-[13px]`}>
                {r.difficulty}
                {r.evidence && <span className="mt-1 block text-xs text-tdms-muted">Evidence: {r.evidence}</span>}
              </td>
              <td className={`${TD} max-w-xs text-[13px]`}>
                {r.interventions.length ? r.interventions.join(', ') : '—'}
                {r.support && <span className="mt-1 block text-xs text-tdms-muted">{r.support}</span>}
              </td>
              <td className={`${TD} whitespace-nowrap text-[13px] tabular-nums ${r.followUpOn && r.followUpOn < today && r.status !== 'RESOLVED' ? 'font-semibold text-red-700' : ''}`}>{r.followUpOn ?? '—'}</td>
              <td className={TD}><Chip status={r.status} label={r.statusLabel} /></td>
              {editable && (
                <td className={`${TD} text-right`}>
                  <button type="button" className={BTN_SMALL} onClick={() => setEditing(r)}>Update</button>
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Learning support — ${editing.student}` : ''}>
        {editing && <SupportForm classId={editing.classId} studentId={editing.studentId} supportId={editing.id} initial={editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      </Modal>
    </Card>
  );
}
