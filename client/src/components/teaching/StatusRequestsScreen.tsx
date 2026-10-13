import { useState } from 'react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { useAction } from './client-kit';
import { BTN, BTN_DANGER, BTN_SECONDARY, BTN_SMALL, Card, Chip, Empty, Field, Flash, INPUT, TD, TH, Table } from './kit';

interface Request {
  id: string;
  student: string;
  studentNumber: string;
  program: string;
  subject: string | null;
  currentStatus: string;
  studentStatusNow: string;
  requestedStatus: string;
  reason: string;
  status: string;
  statusLabel: string;
  requestedBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Status recommendations from Diploma Instructors, awaiting a decision. */
export default function StatusRequestsScreen({ rows, canDecide }: { rows: Request[]; canDecide: boolean }) {
  const [open, setOpen] = useState<Request | null>(null);
  const [filter, setFilter] = useState('PENDING');
  const shown = rows.filter((r) => !filter || r.status === filter);

  return (
    <Card padded={false} title={`${rows.filter((r) => r.status === 'PENDING').length} pending`}>
      <div className="px-5 pb-4 sm:px-6">
        <label className="flex items-center gap-2 text-[13px] font-semibold">Show
          <select className={`${INPUT} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="PENDING">Pending review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="px-5 pb-5 sm:px-6"><Empty title="No requests" description="Status recommendations submitted by Diploma Instructors appear here." /></div>
      ) : (
        <Table label="Status requests" head={<><th scope="col" className={TH}>Student</th><th scope="col" className={TH}>Current → Requested</th><th scope="col" className={TH}>Reason</th><th scope="col" className={TH}>Submitted by</th><th scope="col" className={TH}>Date</th><th scope="col" className={TH}>Status</th><th scope="col" className={TH}><span className="sr-only">Decide</span></th></>}>
          {shown.map((r) => (
            <tr key={r.id}>
              <td className={TD}><span className="font-semibold">{r.student}</span><span className="block text-xs text-tdms-muted">{r.studentNumber} · {r.program}</span></td>
              <td className={`${TD} whitespace-nowrap`}>{r.currentStatus} → <span className="font-semibold">{r.requestedStatus}</span></td>
              <td className={`${TD} max-w-xs text-[13px]`}>{r.reason}{r.subject && <span className="block text-xs text-tdms-muted">{r.subject}</span>}</td>
              <td className={TD}>{r.requestedBy}<span className="block text-xs text-tdms-muted">Diploma Instructor</span></td>
              <td className={`${TD} whitespace-nowrap text-[13px] tabular-nums`}>{r.createdAt.slice(0, 10)}</td>
              <td className={TD}>
                <Chip status={r.status} label={r.statusLabel} />
                {r.decidedBy && <span className="mt-1 block text-xs text-tdms-muted">by {r.decidedBy}{r.decisionNote ? `: ${r.decisionNote}` : ''}</span>}
              </td>
              <td className={`${TD} text-right`}>{canDecide && r.status === 'PENDING' && <button type="button" className={BTN_SMALL} onClick={() => setOpen(r)}>Decide</button>}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open ? `Status request — ${open.student}` : ''}>
        {open && <Decide request={open} onDone={() => setOpen(null)} />}
      </Modal>
    </Card>
  );
}

function Decide({ request, onDone }: { request: Request; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [note, setNote] = useState('');
  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (await run(() => api.post(`/api/v1/status-requests/${request.id}/decide`, { decision, note: note || null }))) onDone();
  };
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-tdms-bg p-3 text-sm">
        <div><dt className="text-xs text-tdms-muted">Student</dt><dd className="font-semibold">{request.student} · {request.studentNumber}</dd></div>
        <div><dt className="text-xs text-tdms-muted">Status now</dt><dd className="font-semibold">{request.studentStatusNow}</dd></div>
        <div><dt className="text-xs text-tdms-muted">Requested</dt><dd className="font-semibold">{request.requestedStatus}</dd></div>
        <div><dt className="text-xs text-tdms-muted">Submitted by</dt><dd>{request.requestedBy}, {request.createdAt.slice(0, 10)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-tdms-muted">Reason</dt><dd>{request.reason}</dd></div>
      </dl>
      <p className="text-sm text-tdms-muted">Approving changes the student&apos;s status on their permanent record. The instructor is notified either way, and the decision is audited.</p>
      <Field label="Note" htmlFor="dec-note" error={errors.note} hint="Required when rejecting.">
        <textarea id="dec-note" rows={2} className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => decide('REJECTED')}>Reject</button>
        <button type="button" className={BTN} disabled={busy} onClick={() => decide('APPROVED')}>Approve</button>
      </div>
    </div>
  );
}
