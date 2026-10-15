import { useState } from 'react';
import Link from '@/lib/link';
import Modal from '@/components/Modal';
import { Alert, Badge, BUTTON_DANGER, BUTTON_SECONDARY, BUTTON_SUCCESS, Card, EmptyState, FieldError, INPUT_CLASS, LABEL_CLASS, PageHeader, Pagination } from '@/components/ui';
import { formatDate } from '@shared/lib/dates';
import { yearLevelLabel } from '@shared/lib/teaching';
import { ENROLLMENT_STATUS_LABELS, type EnrollmentStatus } from '@shared/types/domain';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { Page } from '@/lib/page-data';
import type { loadEnrollments } from '@/server/controllers/pages/app/enrollments';
import { approvalNotice, type Placement } from '@/lib/enrollment-notice';

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
    const result = await api.post<{ placement: Placement | null }>(`/api/v1/enrollments/${row.id}/transition`, { status, reason: status === 'rejected' ? reason : '' });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setError(result.message);
      // Someone else decided it meanwhile: show the current state.
      if (result.code === 'ENROLLMENT_ALREADY_DECIDED') router.refresh();
      return;
    }
    router.refresh();
    onDone(status === 'enrolled' ? approvalNotice(row.student.name, result.data.placement) : `${row.student.name}'s enrollment was rejected.`);
  }

  const facts: [string, string][] = [
    ['Student', `${row.student.name} · ${row.student.studentNumber}`],
    ['Program', `${row.student.programCode} — ${row.student.programName}`],
    ['Curriculum', row.curriculum ?? '—'],
    ['Term', `SY ${row.schoolYear} · Semester ${row.semester}`],
    ['Year level', yearLevelLabel(row.yearLevel)],
    ['Section', row.section ?? 'Assigned automatically when approved'],
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

const TAB = 'rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';

function View({ canOpenStudent, canDecide, data, filters, status, programTabs, program, search, years, schoolYear, yearLevel }: Data) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [term, setTerm] = useState(search);

  // Program, status, term and search together in the URL; a change starts at page 1.
  const href = (next: { program?: string; status?: string; search?: string; year?: string; yearLevel?: string }) => {
    const merged = { program, status, search, year: schoolYear, yearLevel, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/enrollments${params.toString() ? `?${params}` : ''}`;
  };
  const programCode = programTabs.find((t) => t.value === program)?.label;
  const scope = [programCode, schoolYear && `SY ${schoolYear}`, yearLevel && yearLevelLabel(Number(yearLevel)), status && label(status).toLowerCase(), search && `matching “${search}”`].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrollments"
        subtitle={canDecide ? 'Term enrollments across all students. Review a pending enrollment to approve or reject it.' : 'Term enrollments across all students.'}
      />

      {/* Program tabs: All Programs, then each program by code. */}
      <nav aria-label="Filter by program" className="flex flex-wrap gap-2">
        {programTabs.map((t) => {
          const active = t.value === program;
          return (
            <Link key={t.value || 'all'} href={href({ program: t.value })} aria-current={active ? 'page' : undefined} title={t.name}
              className={`${TAB} inline-flex items-center gap-2 ${active ? 'bg-forest text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <span className="font-semibold">{t.label}</span>
              {t.value && <span className={`hidden text-xs md:inline ${active ? 'text-white/80' : 'text-slate-500'}`}>{t.name}</span>}
              <span className={`tabular-nums ${active ? 'text-white/80' : 'text-slate-500'}`}>{t.count}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = f.value === status;
          return (
            <Link
              key={f.value || 'all'}
              href={href({ status: f.value })}
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
        <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="enrollments-year">School year</label>
        <select id="enrollments-year" className={`${INPUT_CLASS} sm:w-auto`} value={schoolYear} onChange={(e) => router.push(href({ year: e.target.value }))}>
          <option value="">All school years</option>
          {years.map((y) => <option key={y} value={y}>SY {y}</option>)}
        </select>
        <label className="sr-only" htmlFor="enrollments-level">Year level</label>
        <select id="enrollments-level" className={`${INPUT_CLASS} sm:w-auto`} value={yearLevel} onChange={(e) => router.push(href({ yearLevel: e.target.value }))}>
          <option value="">All year levels</option>
          {[1, 2, 3].map((n) => <option key={n} value={n}>{yearLevelLabel(n)}</option>)}
        </select>
        <form role="search" aria-label="Search enrollments" className="flex gap-2 lg:w-80" onSubmit={(e) => { e.preventDefault(); router.push(href({ search: term.trim() })); }}>
          <label htmlFor="enrollments-search" className="sr-only">Search by student name or number</label>
          <input id="enrollments-search" type="search" className={INPUT_CLASS} placeholder="Student name or number…" value={term} onChange={(e) => setTerm(e.target.value)} />
          <button type="submit" className={BUTTON_SECONDARY}>Search</button>
        </form>
        </div>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}

      <Card padding="p-0">
        {data.rows.length === 0 ? (
          <EmptyState
            title={scope ? `No ${scope} enrollments` : 'No enrollments yet'}
            description={scope
              ? 'Nothing matches these filters. Choose another program or status, or clear the search.'
              : "Enrollments are created from a student's record, one per school year and semester."}
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Section</th>
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
                      <td className="px-6 py-3.5 text-sm">
                        <span className="inline-flex rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800 ring-1 ring-inset ring-primary-100">{row.student.programCode}</span>
                        <p className="mt-0.5 text-xs text-slate-500">{row.student.programName}</p>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">
                        SY {row.schoolYear} · Semester {row.semester}
                        <p className="text-xs text-slate-500">{yearLevelLabel(row.yearLevel)}</p>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">
                        {row.section
                          ? <span className="whitespace-nowrap font-medium text-navy-900">Section {row.section.split('Section ').pop()}</span>
                          : <span className="text-xs text-slate-500">{row.status === 'pending' ? 'On approval' : '—'}</span>}
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
            <Pagination page={data.page} lastPage={data.lastPage} total={data.total} basePath="/enrollments" query={{ status: status || undefined, program: program || undefined, search: search || undefined, year: schoolYear || undefined, yearLevel: yearLevel || undefined }} />
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
