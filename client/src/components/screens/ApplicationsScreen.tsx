import { useCallback, useState } from 'react';
import { CheckCircle2, ClipboardList, Eye, FileClock, FileSearch, Pencil, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useRouter } from '@/lib/navigation';
import { useOpenOnNew } from '@/lib/use-open-on-new';
import { succeeded, type Notice } from '@/lib/notice';
import { Alert, Badge, Card, EmptyState, PageHeader, Pagination, BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS } from '@/components/ui';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@shared/types/domain';
import { isEditable } from '@shared/lib/applications';
import { formatDate } from '@shared/lib/dates';
import ApplicationForm, { type ProgramOption, type RequirementOption, type SchoolYearOption } from './ApplicationForm';
import ApplicationReview from './ApplicationReview';

/**
 * Applications: the counts, the list with its filters, and the two panels —
 * Record/Edit Application (ApplicationForm) and the review (ApplicationReview).
 * Filters live in the URL, so a filtered list can be shared and survives a reload.
 */

export interface ApplicationRow {
  id: string;
  applicationNumber: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  program: { id: string; name: string; code: string };
  schoolYear: { id: string; label: string } | null;
  reviewer: { name: string } | null;
  student: { id: string; studentNumber: string } | null;
  documents: { handedIn: number; verified: number; total: number };
}

type Filters = { status: string; search: string; program: string; year: string; from: string; to: string };

interface Props {
  rows: ApplicationRow[];
  page: number;
  lastPage: number;
  total: number;
  counts: Record<ApplicationStatus | 'total', number>;
  filters: Filters;
  programs: ProgramOption[];
  schoolYears: SchoolYearOption[];
  requirements: RequirementOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canReview: boolean;
  canManageDocuments: boolean;
}

const KPIS: { key: ApplicationStatus | 'total'; label: string; icon: typeof ClipboardList; tone: string; hint: string }[] = [
  { key: 'total', label: 'Total Applications', icon: ClipboardList, tone: 'bg-primary-50 text-primary-600', hint: 'Including drafts' },
  { key: 'submitted', label: 'Submitted', icon: FileClock, tone: 'bg-amber-50 text-amber-700', hint: 'Waiting for review' },
  { key: 'under_review', label: 'Under Review', icon: FileSearch, tone: 'bg-blue-50 text-blue-700', hint: 'Being reviewed' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, tone: 'bg-primary-50 text-primary-600', hint: 'Sent to Enrollments' },
  { key: 'returned', label: 'Returned', icon: RotateCcw, tone: 'bg-red-50 text-red-700', hint: 'Sent back to fix' },
];

export default function ApplicationsScreen({
  rows, page, lastPage, total, counts, filters, programs, schoolYears, requirements, canCreate, canUpdate, canReview, canManageDocuments,
}: Props) {
  const router = useRouter();
  const [term, setTerm] = useState(filters.search);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [form, setForm] = useState<{ editingId: string | null } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  useOpenOnNew(canCreate, () => openForm(null));

  function openForm(editingId: string | null) {
    setNotice(null);
    setViewing(null);
    setForm({ editingId });
  }

  function go(next: Partial<Filters>) {
    const merged = { ...filters, search: term, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/applications${params.toString() ? `?${params}` : ''}`);
  }

  // Stable, so the drawer does not re-run its focus handling on every render.
  const closeReview = useCallback(() => setViewing(null), []);
  const changed = useCallback((message: string) => { setNotice(succeeded(message)); router.refresh(); }, [router]);

  const filtered = Boolean(filters.status || filters.search || filters.program || filters.year || filters.from || filters.to);
  const yearLabel = (id: string) => schoolYears.find((y) => y.id === id)?.label;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle="Review applicant information, verify requirements, and manage admission decisions."
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={() => openForm(null)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Record Application
          </button>
        ) : null}
      />

      {/* Counts */}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Application counts">
        {KPIS.map(({ key, label, icon: Icon, tone, hint }) => (
          <li key={key}>
            <button type="button" onClick={() => go({ status: key === 'total' ? '' : key })} aria-pressed={(filters.status || 'total') === key}
              className={`flex h-full w-full items-start gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-primary-600/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${(filters.status || 'total') === key ? 'border-primary-600/60 ring-1 ring-primary-600/20' : 'border-border'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden="true"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-slate-500">{label}</span>
                <span className="block text-2xl font-bold tabular-nums text-ink">{counts[key] ?? 0}</span>
                <span className="block truncate text-[11px] text-slate-500">{hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Status tabs */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max gap-1 rounded-xl border border-border bg-white p-1" role="group" aria-label="Filter by status">
          {(['', ...APPLICATION_STATUSES] as const).map((s) => {
            const on = filters.status === s;
            return (
              <button key={s || 'all'} type="button" onClick={() => go({ status: s })} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${on ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
                {s ? APPLICATION_STATUS_LABELS[s] : 'All'}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? 'bg-[#fff]/20' : 'bg-slate-100 text-slate-500'}`}>{s ? counts[s] ?? 0 : counts.total}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search and filters */}
      <form onSubmit={(e) => { e.preventDefault(); go({ search: term }); }} role="search" aria-label="Find applications" className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
        <div className="relative">
          <label htmlFor="apps-search" className="sr-only">Search by name, application number, email or phone</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id="apps-search" className={`${INPUT_CLASS} mt-0 pl-9`} placeholder="Search name, application no., email or phone…" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div>
          <label className="sr-only" htmlFor="apps-program">Diploma program</label>
          <select id="apps-program" className={`${INPUT_CLASS} mt-0`} value={filters.program} onChange={(e) => go({ program: e.target.value })}>
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="apps-year">School year</label>
          <select id="apps-year" className={`${INPUT_CLASS} mt-0`} value={filters.year} onChange={(e) => go({ year: e.target.value })}>
            <option value="">All school years</option>
            {schoolYears.map((y) => <option key={y.id} value={y.id}>SY {y.label}</option>)}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="apps-from">Submitted from</label>
          <input id="apps-from" type="date" className={`${INPUT_CLASS} mt-0`} value={filters.from} max={filters.to || undefined} onChange={(e) => go({ from: e.target.value })} title="Submitted from" />
        </div>
        <div>
          <label className="sr-only" htmlFor="apps-to">Submitted to</label>
          <input id="apps-to" type="date" className={`${INPUT_CLASS} mt-0`} value={filters.to} min={filters.from || undefined} onChange={(e) => go({ to: e.target.value })} title="Submitted to" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={`${BUTTON_SECONDARY} flex-1 lg:flex-none`}>Search</button>
          {filtered && (
            <button type="button" className={`${BUTTON_SECONDARY} px-2.5`} onClick={() => { setTerm(''); router.push('/applications'); }} aria-label="Clear search and filters">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      {notice && <Alert type={notice.tone}>{notice.text}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No applications match these filters' : 'No applications yet'}
            description={filtered
              ? `Nothing for ${[filters.status && APPLICATION_STATUS_LABELS[filters.status as ApplicationStatus], filters.program && programs.find((p) => p.id === filters.program)?.code, filters.year && `SY ${yearLabel(filters.year)}`, (filters.from || filters.to) && `submitted ${filters.from || '…'} to ${filters.to || '…'}`, filters.search && `“${filters.search}”`].filter(Boolean).join(' · ')}. Change or clear the filters.`
              : canCreate ? 'Record the first one with Record Application.' : 'Applications will appear here once recorded.'}
          />
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{r.fullName}</p>
                      <p className="text-xs text-slate-500">{r.applicationNumber} · {r.program.code}{r.schoolYear ? ` · SY ${r.schoolYear.label}` : ''}</p>
                    </div>
                    <Badge status={r.status} label={APPLICATION_STATUS_LABELS[r.status as ApplicationStatus]} />
                  </div>
                  <Progress docs={r.documents} />
                  <RowActions row={r} canUpdate={canUpdate} canReview={canReview} onView={setViewing} onEdit={openForm} />
                </li>
              ))}
            </ul>

            {/* Wider screens: the table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-2.5 py-3">Application No.</th>
                    <th scope="col" className="px-2.5 py-3">Applicant</th>
                    <th scope="col" className="hidden px-2.5 py-3 2xl:table-cell">Contact</th>
                    <th scope="col" className="px-2.5 py-3">Program</th>
                    <th scope="col" className="whitespace-nowrap px-2.5 py-3">School Year</th>
                    <th scope="col" className="px-2.5 py-3">Requirements</th>
                    <th scope="col" className="px-2.5 py-3">Status</th>
                    <th scope="col" className="px-2.5 py-3">Submitted</th>
                    <th scope="col" className="hidden px-2.5 py-3 2xl:table-cell">Reviewer</th>
                    <th scope="col" className="px-2.5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-2.5 py-3 font-mono text-xs font-semibold text-ink">{r.applicationNumber ?? '—'}</td>
                      <td className="min-w-[9rem] px-2.5 py-3">
                        <button type="button" onClick={() => setViewing(r.id)} className="text-left font-semibold text-ink hover:text-primary-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">{r.fullName}</button>
                        <p className="max-w-[16rem] truncate text-xs text-slate-500 2xl:hidden">{[r.email, r.phone].filter(Boolean).join(' · ')}</p>
                        {r.student && <p className="text-xs text-primary-600">Student No. {r.student.studentNumber}</p>}
                      </td>
                      <td className="hidden px-2.5 py-3 text-slate-600 2xl:table-cell">
                        <p className="max-w-[14rem] truncate">{r.email ?? '—'}</p>
                        <p className="text-xs text-slate-500">{r.phone ?? ''}</p>
                      </td>
                      <td className="px-2.5 py-3" title={r.program.name}>
                        <span className="whitespace-nowrap font-semibold text-ink">{r.program.code}</span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-slate-600">{r.schoolYear?.label ?? '—'}</td>
                      <td className="px-2.5 py-3"><Progress docs={r.documents} /></td>
                      <td className="px-2.5 py-3">
                        <Badge status={r.status} label={APPLICATION_STATUS_LABELS[r.status as ApplicationStatus]} />
                        {r.reviewer && <p className="mt-1 whitespace-nowrap text-xs text-slate-500 2xl:hidden">by {r.reviewer.name}</p>}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-slate-600">{r.submittedAt ? formatDate(r.submittedAt) : <span className="text-slate-400">—</span>}</td>
                      <td className="hidden whitespace-nowrap px-2.5 py-3 text-slate-600 2xl:table-cell">{r.reviewer?.name ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-3"><RowActions row={r} canUpdate={canUpdate} canReview={canReview} onView={setViewing} onEdit={openForm} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} lastPage={lastPage} total={total} basePath="/applications" query={{ ...filters }} />
          </>
        )}
      </Card>

      <ApplicationForm
        open={form !== null}
        editingId={form?.editingId ?? null}
        programs={programs}
        schoolYears={schoolYears}
        requirements={requirements}
        canManageDocuments={canManageDocuments}
        onClose={() => setForm(null)}
        onSaved={(message) => { setForm(null); changed(message); }}
      />

      <ApplicationReview
        id={viewing}
        canReview={canReview}
        canUpdate={canUpdate}
        canManageDocuments={canManageDocuments}
        onClose={closeReview}
        onEdit={(id) => openForm(id)}
        onChanged={changed}
      />
    </div>
  );
}

function Progress({ docs }: { docs: ApplicationRow['documents'] }) {
  if (docs.total === 0) return <span className="text-xs text-slate-400">None required</span>;
  const pct = Math.round((docs.handedIn / docs.total) * 100);
  const complete = docs.verified === docs.total;
  return (
    <div className="w-24" title={`${docs.handedIn} of ${docs.total} handed in, ${docs.verified} verified`}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold tabular-nums text-ink">{docs.handedIn}/{docs.total}</span>
        <span className={`tabular-nums ${complete ? 'text-primary-600' : 'text-slate-500'}`}>{docs.verified} verified</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={docs.total} aria-valuenow={docs.handedIn} aria-label="Documents handed in">
        <div className={`h-full rounded-full ${complete ? 'bg-primary-600' : 'bg-[#34A27D]'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RowActions({ row, canUpdate, canReview, onView, onEdit }: {
  row: ApplicationRow; canUpdate: boolean; canReview: boolean; onView: (id: string) => void; onEdit: (id: string) => void;
}) {
  const reviewable = canReview && (row.status === 'submitted' || row.status === 'under_review');
  const btn = 'relative inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';
  return (
    <div className="flex items-center gap-1 md:justify-end">
      {reviewable ? (
        <button type="button" onClick={() => onView(row.id)} className={`${btn} bg-primary-600 text-white hover:bg-primary-700`} aria-label={`Review ${row.fullName}`}>
          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" /> Review
        </button>
      ) : (
        <button type="button" onClick={() => onView(row.id)} className={`${btn} text-slate-600 hover:bg-slate-100 hover:text-ink`} aria-label={`View ${row.fullName}`}>
          <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View
        </button>
      )}
      {canUpdate && isEditable(row.status) && (
        <button type="button" onClick={() => onEdit(row.id)} className={`${btn} text-slate-600 hover:bg-slate-100 hover:text-ink`} aria-label={`Edit ${row.fullName}`} title="Edit">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /><span className="md:sr-only">Edit</span>
        </button>
      )}
    </div>
  );
}
