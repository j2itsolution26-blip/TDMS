import { useMemo, useState } from 'react';
import { BookOpen, GraduationCap, Layers, Plus, Search, Users } from 'lucide-react';
import Link from '@/lib/link';
import { useRouter } from '@/lib/navigation';
import { useOpenOnNew } from '@/lib/use-open-on-new';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import OverflowMenu from '@/components/OverflowMenu';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  Card,
  PageHeader,
  EmptyState,
  Badge,
  FieldError,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT_CLASS,
  LABEL_CLASS,
} from '@/components/ui';
import { enrollmentShare } from '@shared/lib/enrollment-share';

/**
 * Programs & Departments: each diploma program, its curriculum versions, and
 * how many students are enrolled in it this term.
 *
 * The counts are the server's (program-enrollment.ts: active students with an
 * Enrolled enrollment for the current term, each counted once). The summary
 * cards, the table and the distribution all read the same `rows`, and every
 * count links to the Students page filtered to exactly those students.
 *
 * Search and the status filter work in the browser over every program (there
 * are a handful). `can*` flags decide what is shown; every route re-checks the
 * policy before it acts. The create/edit form is unchanged.
 */

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  curriculaCount: number;
  activeCurricula: string[];
  students: number;
  enrolled: number;
}

interface Props {
  rows: ProgramRow[];
  /** "SY 2026-2027 · 1st Semester"; null when no school year is active. */
  term: string | null;
  totalEnrolled: number;
  activePrograms: number;
  canCreate: boolean;
  canUpdate: boolean;
  canViewStudents: boolean;
}

type StatusFilter = 'all' | 'active' | 'inactive';

const EMPTY = { code: '', name: '', description: '', isActive: true };

const share = enrollmentShare;

const enrolledHref = (id: string) => `/students?program=${id}&enrollment=current`;

export default function ProgramsScreen({ rows, term, totalEnrolled, activePrograms, canCreate, canUpdate, canViewStudents }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  useOpenOnNew(canCreate, openCreate);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProgramRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  // Search (name or code) and status together.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) =>
      (status === 'all' || (status === 'active') === p.isActive)
      && (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)));
  }, [rows, query, status]);

  // The distribution: active programs, and any inactive one that still has enrolled students.
  const distribution = useMemo(
    () => rows.filter((p) => p.isActive || p.enrolled > 0).sort((a, b) => b.enrolled - a.enrolled || a.code.localeCompare(b.code)),
    [rows],
  );
  const programCards = rows.filter((p) => p.isActive);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setMessage(null);
    setShowForm(true);
  }

  function openEdit(program: ProgramRow) {
    setEditing(program);
    setForm({ code: program.code, name: program.name, description: program.description ?? '', isActive: program.isActive });
    setErrors({});
    setMessage(null);
    setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const result = editing
      ? await api.put(`/api/v1/programs/${editing.id}`, form)
      : await api.post('/api/v1/programs', form);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }
    setShowForm(false);
    router.refresh();
  }

  /** Activate at once; deactivating asks first. Same route (PATCH toggles) as before. */
  async function toggle(program: ProgramRow) {
    const run = async () => {
      setBusy(true);
      setMessage(null);
      const result = await api.patch(`/api/v1/programs/${program.id}`);
      setBusy(false);
      if (!result.ok) { setMessage(result.message); return false; }
      router.refresh();
      return true;
    };
    if (!program.isActive) { await run(); return; }
    await confirm({
      tone: 'warning',
      title: 'Deactivate Program',
      description: 'It will no longer be offered on new applications or new student records. Its students, curricula, enrollments and grades are kept, and it can be activated again.',
      details: [
        { label: 'Program', value: `${program.code} · ${program.name}` },
        { label: 'Enrolled this term', value: String(program.enrolled) },
        { label: 'Student records', value: String(program.students) },
      ],
      confirmLabel: 'Deactivate program',
      pendingLabel: 'Deactivating…',
      action: run,
    });
  }

  function menuFor(p: ProgramRow) {
    return [
      { label: 'View program', href: `/programs/${p.id}` },
      ...(canViewStudents ? [{ label: 'View students', href: `/students?program=${p.id}` }] : []),
      ...(canUpdate
        ? [
            { label: 'Edit', onSelect: () => openEdit(p) },
            { label: p.isActive ? 'Deactivate…' : 'Activate', onSelect: () => toggle(p), danger: p.isActive, disabled: busy },
          ]
        : []),
    ];
  }

  /** A count, linked to the students behind it when the viewer may see them. */
  function count(p: ProgramRow, className: string) {
    const text = p.enrolled.toLocaleString();
    if (!canViewStudents) return <span className={className}>{text}</span>;
    return (
      <Link href={enrolledHref(p.id)} className={`${className} rounded hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600`}
        aria-label={`${text} students enrolled in ${p.code} this term — view them`}>
        {text}
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programs & Departments"
        subtitle={term ? `Diploma programs, their curricula, and who is enrolled in ${term}.` : 'Diploma programs and their curricula.'}
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            New Program
          </button>
        ) : null}
      />

      {!term && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No school year is active, so there is no current term and no one counts as enrolled. Activate a school year in the School Calendar to see enrollment.
        </p>
      )}

      {message && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message}</p>
      )}

      {/* Summary: the total, the active programs, and one card per active program. */}
      <section aria-label="Enrollment summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Students enrolled" value={totalEnrolled.toLocaleString()}
          note={term ?? 'No active term'} href={canViewStudents && term ? '/students?enrollment=current' : undefined} />
        <StatCard icon={Layers} label="Active programs" value={String(activePrograms)}
          note={`${rows.length} program${rows.length === 1 ? '' : 's'} in total`} />
        {programCards.map((p) => (
          <Card key={p.id} padding="p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex rounded-md bg-primary-50 px-2 py-0.5 font-mono text-xs font-semibold text-primary-700">{p.code}</span>
              <GraduationCap className="h-5 w-5 text-primary-600" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-ink">
              {count(p, "")}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-600" title={p.name}>{p.name}</p>
            <p className="mt-2 text-xs font-medium text-slate-500">{share(p.enrolled, totalEnrolled)} of enrolled students</p>
          </Card>
        ))}
      </section>

      {/* Program overview */}
      <Card padding="p-0">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Program overview</h2>
            <p className="text-xs text-slate-500" aria-live="polite">
              {visible.length === rows.length ? `${rows.length} program${rows.length === 1 ? '' : 's'}` : `${visible.length} of ${rows.length} programs`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row" role="search" aria-label="Find programs">
            <div className="relative">
              <label htmlFor="program-search" className="sr-only">Search by program name or code</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input id="program-search" type="search" className={`${INPUT_CLASS} pl-9 sm:w-64`} placeholder="Search name or code…"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <label htmlFor="program-status" className="sr-only">Status</label>
            <select id="program-status" className={`${INPUT_CLASS} sm:w-40`} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No programs yet" description="Create a diploma program to start building its curriculum." />
        ) : visible.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">No programs match</p>
            <p className="mt-1 text-sm text-slate-500">Nothing for {[query.trim() && `“${query.trim()}”`, status !== 'all' && status].filter(Boolean).join(' · ')}.</p>
            <button type="button" className={`${BUTTON_SECONDARY} mt-4`} onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</button>
          </div>
        ) : (
          <>
            {/* Wide screens: the table, every column and action in view without scrolling. */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Program</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Curriculum</th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-semibold text-slate-500">Enrolled</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((p) => (
                    <tr key={p.id} className="align-top">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex shrink-0 rounded-md bg-primary-50 px-2 py-0.5 font-mono text-xs font-semibold text-primary-700">{p.code}</span>
                          <div className="min-w-0 max-w-[15rem]">
                            <Link href={`/programs/${p.id}`} className="text-sm font-semibold text-ink hover:text-primary-700 hover:underline">{p.name}</Link>
                            {p.description && <p className="mt-0.5 truncate text-xs text-slate-500" title={p.description}>{p.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4"><Curricula p={p} /></td>
                      <td className="px-3 py-4 text-right">
                        {count(p, "text-sm font-semibold tabular-nums text-ink")}
                        <p className="whitespace-nowrap text-xs tabular-nums text-slate-500">{share(p.enrolled, totalEnrolled)} · {p.students.toLocaleString()} record{p.students === 1 ? '' : 's'}</p>
                      </td>
                      <td className="px-3 py-4"><Badge status={p.isActive ? 'active' : 'inactive'} /></td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {canViewStudents && (
                            <Link href={`/students?program=${p.id}`} className={`${BUTTON_SECONDARY} whitespace-nowrap !px-3 !py-1.5 text-xs`} aria-label={`View students: ${p.code}`}>
                              <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                              View Students
                            </Link>
                          )}
                          <OverflowMenu label={`More actions: ${p.code}`} items={menuFor(p)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones, tablets and small laptops: one card per program, nothing hidden. */}
            <ul className="divide-y divide-border xl:hidden">
              {visible.map((p) => (
                <li key={p.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex rounded-md bg-primary-50 px-2 py-0.5 font-mono text-xs font-semibold text-primary-700">{p.code}</span>
                      <Link href={`/programs/${p.id}`} className="mt-1 block text-sm font-semibold text-ink hover:text-primary-700">{p.name}</Link>
                    </div>
                    <Badge status={p.isActive ? 'active' : 'inactive'} />
                  </div>
                  <Curricula p={p} />
                  <p className="text-sm text-slate-600">
                    {count(p, "font-semibold tabular-nums text-ink")} enrolled · {share(p.enrolled, totalEnrolled)} · {p.students} record{p.students === 1 ? '' : 's'}
                  </p>
                  <div className="flex items-center gap-2">
                    {canViewStudents && (
                      <Link href={`/students?program=${p.id}`} className={`${BUTTON_SECONDARY} whitespace-nowrap !px-3 !py-1.5 text-xs`}>View Students</Link>
                    )}
                    <OverflowMenu label={`More actions: ${p.code}`} items={menuFor(p)} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Distribution */}
      <Card padding="p-5">
        <h2 className="text-base font-semibold text-ink">Student distribution</h2>
        <p className="text-xs text-slate-500">{term ? `Share of the ${totalEnrolled.toLocaleString()} students enrolled in ${term}` : 'No active term'}</p>
        {totalEnrolled === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-slate-500">
            {term ? `No students are enrolled in ${term} yet.` : 'Counts appear once a school year is active.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {distribution.map((p) => {
              const pct = (p.enrolled / totalEnrolled) * 100;
              return (
                <li key={p.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate"><span className="font-mono text-xs font-semibold text-primary-700">{p.code}</span> <span className="text-slate-600">{p.name}</span></span>
                    <span className="shrink-0 tabular-nums">{count(p, "font-semibold text-ink")} <span className="text-slate-500">· {share(p.enrolled, totalEnrolled)}</span></span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar"
                    aria-label={`${p.code} share of enrolled students`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={share(p.enrolled, totalEnrolled)}>
                    <span className="block h-full rounded-full bg-primary-600" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Program' : 'New Program'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="code">Code</label>
            <input id="code" className={INPUT_CLASS} value={form.code} maxLength={20} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            <FieldError messages={errors.code} />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="name">Name</label>
            <input id="name" className={INPUT_CLASS} value={form.name} maxLength={255} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <FieldError messages={errors.name} />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="description">Description</label>
            <textarea id="description" rows={3} className={INPUT_CLASS} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <FieldError messages={errors.description} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active
          </label>
          {message && <p className="text-sm text-red-600">{message}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Curricula({ p }: { p: ProgramRow }) {
  if (p.activeCurricula.length === 0) {
    return <p className="text-xs text-slate-500">{p.curriculaCount ? `${p.curriculaCount} version${p.curriculaCount === 1 ? '' : 's'}, none active` : 'No curriculum yet'}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <BookOpen className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden="true" />
      {p.activeCurricula.map((v) => (
        <span key={v} className="rounded-md border border-border bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">{v}</span>
      ))}
      {p.curriculaCount > p.activeCurricula.length && (
        <span className="text-xs text-slate-500">+{p.curriculaCount - p.activeCurricula.length} older</span>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, href }: { icon: typeof Users; label: string; value: string; note: string; href?: string }) {
  return (
    <Card padding="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-ink">
        {href ? <Link href={href} className="rounded hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600" aria-label={`${value} ${label.toLowerCase()} — view them`}>{value}</Link> : value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </Card>
  );
}

/** Shown while the page loads: the same shapes, no numbers. */
export function ProgramsSkeleton() {
  const bar = 'animate-pulse rounded bg-slate-100';
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading programs">
      <div className={`${bar} h-8 w-72`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Card key={i} padding="p-5"><div className={`${bar} h-4 w-24`} /><div className={`${bar} mt-3 h-8 w-16`} /><div className={`${bar} mt-2 h-3 w-32`} /></Card>)}
      </div>
      <Card padding="p-5">
        <div className={`${bar} h-5 w-40`} />
        {[0, 1, 2].map((i) => <div key={i} className={`${bar} mt-4 h-10 w-full`} />)}
      </Card>
    </div>
  );
}
