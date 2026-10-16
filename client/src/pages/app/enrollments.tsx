import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, CircleDashed, ExternalLink, FileText, Loader2, TriangleAlert } from 'lucide-react';
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
import { DECISION_CONSEQUENCES, decisionSummary, type Decision } from '@/lib/enrollment-decision';

type Data = Awaited<ReturnType<typeof loadEnrollments>>;
type Row = Data['data']['rows'][number];

const label = (s: string) => ENROLLMENT_STATUS_LABELS[s as EnrollmentStatus] ?? s;

const FACT_LABEL = 'text-xs font-medium uppercase tracking-wide text-slate-500';

/** The required-documents check, said in words and icons as well as colour. */
function DocumentStatus({ docs }: { docs: Row['documents'] }) {
  if (!docs || docs.required === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-slate-600">
        <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        No required documents are configured for this program.
      </p>
    );
  }
  const ready = docs.missing.length === 0;
  return (
    <div className={`rounded-xl border p-4 ${ready ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start gap-3">
        {ready
          ? <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden="true" />
          : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${ready ? 'text-green-800' : 'text-amber-800'}`}>
            {ready ? 'All required documents are verified' : 'Document verification is incomplete'}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Required documents verified"
              aria-valuemin={0}
              aria-valuemax={docs.required}
              aria-valuenow={docs.verified}
              aria-valuetext={`${docs.verified} of ${docs.required} verified`}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"
            >
              <div className={`h-full rounded-full ${ready ? 'bg-green-600' : 'bg-amber-500'}`} style={{ width: `${Math.round((docs.verified / docs.required) * 100)}%` }} />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">{docs.verified} of {docs.required} verified</span>
          </div>
          <ul className="mt-3 space-y-1.5" aria-label="Required documents">
            {docs.items.map((d) => (
              <li key={d.name} className="flex items-start gap-2 text-sm text-navy-900">
                {d.verified
                  ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
                  : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />}
                <span className="min-w-0 flex-1 break-words">{d.name}</span>
                <span className={`shrink-0 rounded-md bg-white px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${d.verified ? 'text-green-800 ring-green-200' : 'text-amber-800 ring-amber-200'}`}>
                  {d.verified ? 'Verified' : 'Not verified'}
                </span>
              </li>
            ))}
          </ul>
          {!ready && <p className="mt-3 text-sm text-slate-600">Verify the remaining documents on the student&apos;s record before approving.</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * The second, separate dialog that actually decides the enrollment. Nothing
 * is sent until its confirm button is pressed; while the request runs it
 * cannot be closed or sent again. It closes only on success. Rejecting needs
 * a reason, as the server requires.
 */
function ConfirmDecision({ row, decision, onCancel, onConfirmed, onStale }: {
  row: Row;
  decision: Decision;
  onCancel: () => void;
  onConfirmed: (message: string) => void;
  /** The enrollment was decided by someone else meanwhile. */
  onStale: () => void;
}) {
  const router = useRouter();
  const approve = decision === 'approve';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // State alone lets a fast double click through before the re-render.
  const inFlight = useRef(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reasonHint = useId();

  // Start on the safe control: Cancel, or the reason a rejection needs.
  useEffect(() => { (approve ? cancelRef.current : reasonRef.current)?.focus(); }, [approve]);

  async function confirm() {
    if (inFlight.current || stale) return;
    if (!approve && !reason.trim()) {
      setErrors({ reason: ['Give a reason for rejecting this enrollment.'] });
      reasonRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setErrors({});
    const result = await api.post<{ placement: Placement | null }>(`/api/v1/enrollments/${row.id}/transition`, { status: approve ? 'enrolled' : 'rejected', reason: approve ? '' : reason });
    if (!result.ok) {
      inFlight.current = false;
      setBusy(false);
      setErrors(result.errors ?? {});
      setError(result.message);
      // Someone else decided it meanwhile: show the current state.
      if (result.code === 'ENROLLMENT_ALREADY_DECIDED') { setStale(true); router.refresh(); }
      return;
    }
    router.refresh();
    onConfirmed(approve ? approvalNotice(row.student.name, result.data.placement) : `${row.student.name}'s enrollment was rejected.`);
  }

  const close = () => { if (!inFlight.current) (stale ? onStale : onCancel)(); };

  return (
    <Modal
      open
      onClose={close}
      title={approve ? 'Confirm Enrollment Approval' : 'Confirm Enrollment Rejection'}
      maxWidth="sm:max-w-lg"
      // Fluent: the buttons stay pinned while the body scrolls, so on a phone they are never below the fold.
      appearance="fluent"
      animate
      trapFocus
      icon={(
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${approve ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {approve ? <CircleCheck className="h-5 w-5" aria-hidden="true" /> : <TriangleAlert className="h-5 w-5" aria-hidden="true" />}
        </span>
      )}
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={close}>
            {stale ? 'Close' : 'Cancel'}
          </button>
          {!stale && (
            <button type="button" className={approve ? BUTTON_SUCCESS : BUTTON_DANGER} disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {busy ? (approve ? 'Approving…' : 'Rejecting…') : (approve ? 'Confirm Approval' : 'Confirm Rejection')}
            </button>
          )}
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-navy-900">
          {approve
            ? 'Approving changes this student’s enrollment status. Check the record before you confirm.'
            : 'This enrollment will be rejected. Check the record before you confirm.'}
        </p>

        <dl className="divide-y divide-border rounded-xl border border-border">
          {decisionSummary(row, decision).map(([k, v]) => (
            <div key={k} className="flex gap-3 px-4 py-2.5 sm:gap-4">
              <dt className="w-28 shrink-0 text-sm text-slate-500 sm:w-32">{k}</dt>
              <dd className="min-w-0 break-words text-sm font-medium text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className={FACT_LABEL}>What happens</p>
          <ul className="mt-2 space-y-1.5">
            {DECISION_CONSEQUENCES[decision].map((line) => (
              <li key={line} className="flex gap-2 text-sm text-slate-700">
                <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${approve ? 'bg-green-600' : 'bg-red-600'}`} aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {!approve && (
          <div>
            <label className={LABEL_CLASS} htmlFor="reject-reason">Reason for rejecting <span className="font-normal text-slate-500">(required)</span></label>
            <textarea
              ref={reasonRef}
              id="reject-reason"
              rows={3}
              maxLength={500}
              className={`${INPUT_CLASS} mt-1.5`}
              value={reason}
              disabled={busy || stale}
              aria-required="true"
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={reasonHint}
              onChange={(e) => { setReason(e.target.value); if (errors.reason) setErrors({}); }}
            />
            <p id={reasonHint} className="mt-1 text-xs text-slate-500">Kept in the enrollment&apos;s history. {reason.length}/500 characters.</p>
            <FieldError messages={errors.reason} />
          </div>
        )}

        {error && !Object.keys(errors).length && <Alert type="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

/**
 * Review one pending enrollment. Approve and Reject open a separate
 * confirmation; nothing changes until it is confirmed. The server re-checks
 * the permission, the current status and the required documents.
 */
function Review({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (message: string) => void }) {
  const [confirming, setConfirming] = useState<Decision | null>(null);
  // Set when both dialogs are to close: with a success notice, or without one.
  const [leaving, setLeaving] = useState<{ notice: string | null } | null>(null);
  const hintId = useId();
  const docs = row.documents;
  const ready = !docs || docs.missing.length === 0;

  // Close the confirmation first and this dialog after: each restores the
  // body scroll lock it found, so they must let go in that order.
  useEffect(() => {
    if (leaving && confirming === null) {
      if (leaving.notice !== null) onDone(leaving.notice);
      else onClose();
    }
  }, [leaving, confirming, onDone, onClose]);

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
    <>
      <Modal
        open
        onClose={() => { if (confirming === null && leaving === null) onClose(); }}
        title="Review enrollment"
        subtitle={`${row.student.name} · ${row.student.studentNumber}`}
        appearance="fluent"
        animate
        trapFocus
        maxWidth="sm:max-w-3xl"
        footer={(
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/students/${row.student.id}/enrollment`} className={BUTTON_SECONDARY}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open student record
              </Link>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" className={BUTTON_DANGER} onClick={() => setConfirming('reject')}>Reject Enrollment</button>
                <button type="button" className={BUTTON_SUCCESS} disabled={!ready} aria-describedby={ready ? undefined : hintId} onClick={() => setConfirming('approve')}>
                  Approve Enrollment
                </button>
              </div>
            </div>
            {!ready && <p id={hintId} className="text-xs text-amber-700 sm:text-right">Approve Enrollment becomes available once every required document is verified.</p>}
          </div>
        )}
      >
        <div className="space-y-6">
          <section aria-labelledby="review-details">
            <h3 id="review-details" className="sr-only">Enrollment details</h3>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className={FACT_LABEL}>{k}</dt>
                  <dd className="mt-0.5 break-words text-sm text-navy-900">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="review-documents" className="border-t border-border pt-5">
            <h3 id="review-documents" className={`${FACT_LABEL} mb-2`}>Required documents</h3>
            <DocumentStatus docs={docs} />
          </section>
        </div>
      </Modal>

      {confirming && (
        <ConfirmDecision
          key={confirming}
          row={row}
          decision={confirming}
          onCancel={() => setConfirming(null)}
          onStale={() => { setLeaving({ notice: null }); setConfirming(null); }}
          onConfirmed={(message) => { setLeaving({ notice: message }); setConfirming(null); }}
        />
      )}
    </>
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

function View({ canOpenStudent, canDecide, data, filters, status, programTabs, program, search, years, schoolYear, yearLevel, withoutEnrollment }: Data) {
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

      {/* A student record with no enrollment is not listed here at all; say so rather than let the counts look short. */}
      {withoutEnrollment ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <span className="font-semibold">{withoutEnrollment} student {withoutEnrollment === 1 ? 'record has' : 'records have'} no enrollment</span> and {withoutEnrollment === 1 ? 'is' : 'are'} not counted here. Open {withoutEnrollment === 1 ? 'one' : 'one for each'} from the student’s Enrollment page.
          </span>
          <Link href="/students?enrollment=none" className="font-semibold underline underline-offset-2 hover:no-underline">
            Show {withoutEnrollment === 1 ? 'the student' : 'the students'}
          </Link>
        </p>
      ) : null}

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
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Student</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Program</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Term</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Section</th>
                    <th scope="col" className="hidden px-4 py-3 text-left text-xs font-medium uppercase text-slate-500 sm:table-cell">Created</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    {canDecide && <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row) => (
                    <tr key={row.id} className={row.status === 'pending' ? 'bg-amber-50/40' : undefined}>
                      <td className="px-4 py-3.5 text-sm">
                        {canOpenStudent ? (
                          <Link href={`/students/${row.student.id}/enrollment`} className="whitespace-nowrap font-medium text-primary-700 hover:underline">
                            {row.student.name}
                          </Link>
                        ) : (
                          <span className="whitespace-nowrap font-medium text-ink">{row.student.name}</span>
                        )}
                        <p className="text-xs text-slate-500">{row.student.studentNumber}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <span className="inline-flex rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800 ring-1 ring-inset ring-primary-100">{row.student.programCode}</span>
                        <p className="mt-0.5 max-w-[11rem] truncate text-xs text-slate-500" title={row.student.programName}>{row.student.programName}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-600">
                        SY {row.schoolYear} · Semester {row.semester}
                        <p className="text-xs text-slate-500">{yearLevelLabel(row.yearLevel)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {row.section
                          ? <span className="whitespace-nowrap font-medium text-navy-900">Section {row.section.split('Section ').pop()}</span>
                          : <span className="text-xs text-slate-500">{row.status === 'pending' ? 'On approval' : '—'}</span>}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3.5 text-sm text-slate-600 sm:table-cell">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3.5">
                        <Badge status={row.status} label={label(row.status)} />
                        <Decision row={row} />
                        {row.status === 'pending' && row.documents && row.documents.missing.length > 0 && (
                          <p className="mt-1 text-xs text-amber-700">{row.documents.missing.length} document{row.documents.missing.length === 1 ? '' : 's'} not verified</p>
                        )}
                      </td>
                      {canDecide && (
                        <td className="px-4 py-3.5 text-right">
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

      {reviewing && <Review key={reviewing.id} row={reviewing} onClose={() => setReviewing(null)} onDone={(message) => { setReviewing(null); setNotice(message); }} />}
    </div>
  );
}

/** /enrollments */
export default function EnrollmentsPage() {
  return <Page<Data> endpoint={'/enrollments'} render={(d) => <View {...d} />} />;
}
