import { useState } from 'react';
import Link from '@/lib/link';
import Modal from '@/components/Modal';
import { Alert, Badge, BUTTON_DANGER, BUTTON_SECONDARY, BUTTON_SUCCESS, Card, EmptyState, FieldError, INPUT_CLASS, LABEL_CLASS, PageHeader, Pagination } from '@/components/ui';
import { formatDate } from '@shared/lib/dates';
import { ENROLLMENT_STATUS_LABELS, type EnrollmentStatus } from '@shared/types/domain';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { Page } from '@/lib/page-data';
import type { loadEnrollments } from '@/server/controllers/pages/app/enrollments';

type Data = Awaited<ReturnType<typeof loadEnrollments>>;
type Row = Data['data']['rows'][number];

const label = (s: string) => ENROLLMENT_STATUS_LABELS[s as EnrollmentStatus] ?? s;

/**
 * Review one pending enrollment and decide it. Approving asks for a second
 * confirmation; rejecting needs a reason. The server re-checks the
 * permission, the current status and the required documents.
 */
function Review({ row, onDone }: { row: Row; onDone: (message: string) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<'review' | 'approve' | 'reject'>('review');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const docs = row.documents;
  const ready = !docs || docs.missing.length === 0;

  async function decide(status: 'enrolled' | 'rejected') {
    if (busy) return;
    setBusy(true);
    setError(null);
    setErrors({});
    const result = await api.post(`/api/v1/enrollments/${row.id}/transition`, { status, reason: status === 'rejected' ? reason : '' });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setError(result.message);
      // Someone else decided it meanwhile: show the current state.
      if (result.code === 'ENROLLMENT_ALREADY_DECIDED') router.refresh();
      return;
    }
    router.refresh();
    onDone(status === 'enrolled' ? `${row.student.name} is now enrolled.` : `${row.student.name}'s enrollment was rejected.`);
  }

  const facts: [string, string][] = [
    ['Student', `${row.student.name} · ${row.student.studentNumber}`],
    ['Program', `${row.student.programCode} — ${row.student.programName}`],
    ['Curriculum', row.curriculum ?? '—'],
    ['Term', `SY ${row.schoolYear} · Semester ${row.semester}`],
    ['Year level', `Year ${row.yearLevel}`],
    ['Requested', row.createdAt ? formatDate(row.createdAt) : '—'],
  ];

  return (
    <div className="space-y-5">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium uppercase text-slate-500">{k}</dt>
            <dd className="text-sm text-navy-900">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="text-xs font-medium uppercase text-slate-500">Required documents</p>
        {!docs || docs.required === 0 ? (
          <p className="text-sm text-slate-600">No required documents are configured.</p>
        ) : ready ? (
          <p className="text-sm text-green-700">All {docs.required} required documents are verified.</p>
        ) : (
          <div className="mt-1">
            <Alert type="warning" title={`${docs.verified} of ${docs.required} verified`}>
              Not yet verified: {docs.missing.join(', ')}. Verify them on the student&apos;s record before approving.
            </Alert>
          </div>
        )}
      </div>

      {error && !Object.keys(errors).length && <Alert type="danger">{error}</Alert>}

      {step === 'review' && (
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`/students/${row.student.id}/enrollment`} className={BUTTON_SECONDARY}>Open student record</Link>
          <button type="button" className={BUTTON_DANGER} disabled={busy} onClick={() => { setStep('reject'); setError(null); }}>Reject…</button>
          <button type="button" className={BUTTON_SUCCESS} disabled={busy || !ready} onClick={() => { setStep('approve'); setError(null); }}
            title={ready ? undefined : 'Every required document must be verified first'}>
            Approve…
          </button>
        </div>
      )}

      {step === 'approve' && (
        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-navy-900">
            Approve <b>{row.student.name}</b> for SY {row.schoolYear}, Semester {row.semester}? The student becomes <b>Enrolled</b> and active. This decision cannot be undone; an enrolled student can only be dropped later.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => setStep('review')}>Back</button>
            <button type="button" className={BUTTON_SUCCESS} disabled={busy} onClick={() => decide('enrolled')}>{busy ? 'Approving…' : 'Yes, approve enrollment'}</button>
          </div>
        </div>
      )}

      {step === 'reject' && (
        <form className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4" onSubmit={(e) => { e.preventDefault(); void decide('rejected'); }}>
          <div>
            <label className={LABEL_CLASS} htmlFor="reject-reason">Reason for rejecting</label>
            <textarea id="reject-reason" rows={3} maxLength={500} className={INPUT_CLASS} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <FieldError messages={errors.reason} />
          </div>
          <p className="text-sm text-navy-900">Rejected enrollments are final and are not counted as enrolled or dropped.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => setStep('review')}>Back</button>
            <button type="submit" className={BUTTON_DANGER} disabled={busy || !reason.trim()}>{busy ? 'Rejecting…' : 'Reject enrollment'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Decision({ row }: { row: Row }) {
  if (row.status === 'enrolled' && row.approvedAt) {
    return <p className="text-xs text-slate-500">Approved {formatDate(row.approvedAt)}{row.approver ? ` by ${row.approver}` : ''}</p>;
  }
  if (row.decision && (row.status === 'rejected' || row.status === 'dropped')) {
    return (
      <p className="text-xs text-slate-500">
        {label(row.status)} {formatDate(row.decision.at)}{row.decision.by ? ` by ${row.decision.by}` : ''}
        {row.decision.reason && <span className="block text-slate-600">“{row.decision.reason}”</span>}
      </p>
    );
  }
  return null;
}

function View({ canOpenStudent, canDecide, data, filters, status }: Data) {
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrollments"
        subtitle={canDecide ? 'Term enrollments across all students. Review a pending enrollment to approve or reject it.' : 'Term enrollments across all students.'}
      />

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = f.value === status;
          return (
            <Link
              key={f.value || 'all'}
              href={f.value ? `/enrollments?status=${f.value}` : '/enrollments'}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 ${
                active ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f.label} <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'text-slate-500'}`}>{f.count}</span>
            </Link>
          );
        })}
      </nav>

      {notice && <Alert type="success">{notice}</Alert>}

      <Card padding="p-0">
        {data.rows.length === 0 ? (
          <EmptyState
            title={status ? `No ${label(status).toLowerCase()} enrollments` : 'No enrollments yet'}
            description="Enrollments are created from a student's record, one per school year and semester."
          />
        ) : (
          <>
            {/* `relative`: contains the screen-reader-only header label, which would otherwise sit past the scroll box and widen the page on phones. */}
            <div className="relative overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Student</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Program</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Term</th>
                    <th scope="col" className="hidden px-6 py-3 text-left text-xs font-medium uppercase text-slate-500 sm:table-cell">Created</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    {canDecide && <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row) => (
                    <tr key={row.id} className={row.status === 'pending' ? 'bg-amber-50/40' : undefined}>
                      <td className="px-6 py-3.5 text-sm">
                        {canOpenStudent ? (
                          <Link href={`/students/${row.student.id}/enrollment`} className="font-medium text-primary-700 hover:underline">
                            {row.student.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-navy-900">{row.student.name}</span>
                        )}
                        <p className="text-xs text-slate-500">{row.student.studentNumber}</p>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">{row.student.programCode}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">
                        SY {row.schoolYear} · Semester {row.semester}
                        <p className="text-xs text-slate-500">Year {row.yearLevel}</p>
                      </td>
                      <td className="hidden px-6 py-3.5 text-sm text-slate-600 sm:table-cell">{formatDate(row.createdAt)}</td>
                      <td className="px-6 py-3.5">
                        <Badge status={row.status} label={label(row.status)} />
                        <Decision row={row} />
                        {row.status === 'pending' && row.documents && row.documents.missing.length > 0 && (
                          <p className="text-xs text-amber-700">{row.documents.missing.length} document{row.documents.missing.length === 1 ? '' : 's'} not verified</p>
                        )}
                      </td>
                      {canDecide && (
                        <td className="px-6 py-3.5 text-right">
                          {row.status === 'pending' && (
                            <button type="button" className={BUTTON_SECONDARY} onClick={() => { setNotice(null); setReviewing(row); }}>
                              Review
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} lastPage={data.lastPage} total={data.total} basePath="/enrollments" query={{ status: status || undefined }} />
          </>
        )}
      </Card>

      <Modal open={reviewing !== null} onClose={() => setReviewing(null)} title="Review enrollment" subtitle={reviewing ? `${reviewing.student.name} · ${reviewing.student.studentNumber}` : undefined}>
        {reviewing && <Review key={reviewing.id} row={reviewing} onDone={(message) => { setReviewing(null); setNotice(message); }} />}
      </Modal>
    </div>
  );
}

/** /enrollments */
export default function EnrollmentsPage() {
  return <Page<Data> endpoint={'/enrollments'} render={(d) => <View {...d} />} />;
}
