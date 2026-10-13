import { useMemo, useState } from 'react';
import { ArrowUpDown, BookOpen, GraduationCap, Layers, Plus, Search, ShieldAlert, Trash2, UserCheck, Users, UsersRound } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { sectionCapacity, SECTION_CAPACITY, SECTION_YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import { FOCUS } from './kit';

/**
 * Sections Management — the Sections tab of Classes & Sections.
 *
 * Everything shown is computed from the sections the page already loads
 * (classSetupOverview): the KPI cards, each section's occupancy and the
 * filters. Nothing is fetched or stored separately. Changes go through the
 * existing endpoints, which enforce the rules (capacity, one section per
 * school year, only empty sections deleted); the screen only explains them.
 */

export interface SectionRow {
  id: string;
  name: string;
  yearLevel: number;
  label: string;
  program: { id: string; code: string; name: string };
  students: number;
  classes: number;
}

type SortKey = 'year' | 'name' | 'occupancy';

const TONE = {
  open: { bar: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  near: { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-800 ring-amber-200' },
  full: { bar: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 text-red-700 ring-red-200' },
} as const;

const SELECT = `h-10 rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-sm text-ink hover:border-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20`;
const BTN_STUDENTS = `inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 ${FOCUS}`;
const BTN_ICON = `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-500 ${FOCUS}`;

function Kpi({ icon: Icon, label, value, hint, tone = 'emerald' }: { icon: typeof Layers; label: string; value: number; hint: string; tone?: 'emerald' | 'red' }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:gap-3 sm:p-4 shadow-[0_1px_2px_rgba(16,42,67,0.04)] transition hover:shadow-[0_4px_14px_rgba(6,78,59,0.08)]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tone === 'red' ? 'bg-red-50 text-red-600 ring-red-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <p className="text-2xl font-bold leading-tight tracking-[-0.02em] text-ink tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    </div>
  );
}

export default function SectionsManagement({
  sections, archived, yearLabel, onStudents, onNewSection, onDeleted,
}: {
  sections: SectionRow[];
  archived: boolean;
  yearLabel: string;
  onStudents: (id: string) => void;
  onNewSection: () => void;
  onDeleted: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [sort, setSort] = useState<SortKey>('year');
  const [deleting, setDeleting] = useState<SectionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const students = sections.reduce((n, s) => n + s.students, 0);
    return {
      sections: sections.length,
      students,
      available: sections.reduce((n, s) => n + sectionCapacity(s.students).available, 0),
      full: sections.filter((s) => s.students >= SECTION_CAPACITY).length,
    };
  }, [sections]);

  const programs = useMemo(() => [...new Map(sections.map((s) => [s.program.id, s.program])).values()].sort((a, b) => a.code.localeCompare(b.code)), [sections]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sections.filter((s) =>
      (!q || `${s.label} ${s.name} ${s.program.code} ${s.program.name}`.toLowerCase().includes(q)) &&
      (!program || s.program.id === program) &&
      (!year || String(s.yearLevel) === year));
    const by: Record<SortKey, (a: SectionRow, b: SectionRow) => number> = {
      year: (a, b) => a.yearLevel - b.yearLevel || a.program.code.localeCompare(b.program.code) || a.name.localeCompare(b.name),
      name: (a, b) => a.label.localeCompare(b.label),
      occupancy: (a, b) => b.students - a.students || a.label.localeCompare(b.label),
    };
    return [...list].sort(by[sort]);
  }, [sections, query, program, year, sort]);

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    setDeleteError(null);
    const r = await api.del(`/api/v1/sections/${deleting.id}`);
    setBusy(false);
    if (!r.ok) { setDeleteError(r.message); return; }
    const label = deleting.label;
    setDeleting(null);
    onDeleted(`Section ${label} was deleted.`);
  }

  const filtered = query || program || year;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Layers} label="Total sections" value={totals.sections} hint={`School year ${yearLabel}`} />
        <Kpi icon={UserCheck} label="Students assigned" value={totals.students} hint="Across all sections" />
        <Kpi icon={Users} label="Available student slots" value={totals.available} hint={`${SECTION_CAPACITY} per section`} />
        <Kpi icon={ShieldAlert} label="Full sections" value={totals.full} hint={totals.full ? `At ${SECTION_CAPACITY} students` : 'None at capacity'} tone={totals.full ? 'red' : 'emerald'} />
      </div>

      <section aria-labelledby="sections-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,42,67,0.04)]">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-emerald-50/70 to-white px-4 py-4 sm:px-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <h2 id="sections-heading" className="text-base font-semibold text-ink">Sections</h2>
            <p className="text-xs text-muted">{filtered ? `${shown.length} of ${sections.length} sections` : `${sections.length} section${sections.length === 1 ? '' : 's'}`} · up to {SECTION_CAPACITY} students each</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <label htmlFor="sections-search" className="sr-only">Search sections</label>
              <input id="sections-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search section or program" className={`${SELECT} w-full pl-9`} />
            </div>
            <label className="sr-only" htmlFor="sections-program">Program</label>
            <select id="sections-program" className={SELECT} value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="">All programs</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
            <label className="sr-only" htmlFor="sections-year">Year level</label>
            <select id="sections-year" className={SELECT} value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All year levels</option>
              {SECTION_YEAR_LEVELS.map((y) => <option key={y} value={y}>{yearLevelLabel(y)}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Sort by</span>
              <select className={SELECT} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort sections">
                <option value="year">Year level</option>
                <option value="name">Section name</option>
                <option value="occupancy">Occupancy</option>
              </select>
            </label>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100" aria-hidden="true"><GraduationCap className="h-6 w-6" /></span>
            <p className="mt-3 text-base font-semibold text-ink">No sections yet for {yearLabel}</p>
            <p className="mt-1 text-sm text-muted">Create a section, add its students, then create its classes.</p>
            {!archived && (
              <button type="button" onClick={onNewSection} className={`mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 ${FOCUS}`}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Create First Section
              </button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-ink">No sections match these filters</p>
            <button type="button" className={`mt-2 text-sm font-semibold text-emerald-700 hover:underline ${FOCUS}`} onClick={() => { setQuery(''); setProgram(''); setYear(''); }}>Clear filters</button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                  <th scope="col" className="px-4 py-3 sm:px-5">Section</th>
                  <th scope="col" className="px-4 py-3">Program</th>
                  <th scope="col" className="px-4 py-3">Students / Capacity</th>
                  <th scope="col" className="px-4 py-3">Classes</th>
                  <th scope="col" className="px-4 py-3 text-right sm:px-5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((s) => {
                  const cap = sectionCapacity(s.students);
                  const tone = TONE[cap.level];
                  const deletable = s.students === 0 && s.classes === 0;
                  const why = deletable ? undefined : `Can't delete: remove its ${s.students ? `${s.students} student${s.students === 1 ? '' : 's'}` : ''}${s.students && s.classes ? ' and ' : ''}${s.classes ? `${s.classes} class${s.classes === 1 ? '' : 'es'}` : ''} first.`;
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-emerald-50/40">
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100" aria-hidden="true"><GraduationCap className="h-[18px] w-[18px]" /></span>
                          <div className="min-w-0">
                            <p className="min-w-[11rem] text-sm font-semibold text-ink">{s.label}</p>
                            <p className="text-xs text-muted">School year {yearLabel}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-ink">
                        <p className="min-w-[9rem]">{s.program.name}</p>
                        <p className="text-xs text-muted">{s.program.code}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="w-40">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold tabular-nums text-ink">{cap.count} / {cap.capacity} <span className="font-normal text-muted">students</span></p>
                            {cap.level !== 'open' && <span className={`rounded-full px-1.5 py-px text-[10px] font-bold uppercase ring-1 ring-inset ${tone.chip}`}>{cap.level === 'full' ? 'Full' : 'Near'}</span>}
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${s.label} occupancy`} aria-valuemin={0} aria-valuemax={cap.capacity} aria-valuenow={cap.count}>
                            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, (cap.count / cap.capacity) * 100)}%` }} />
                          </div>
                          <p className={`mt-1 text-xs ${cap.available === 0 ? tone.text : 'text-muted'}`}>{cap.available === 0 ? (cap.over ? 'Over capacity' : 'No seats available') : `${cap.available} seat${cap.available === 1 ? '' : 's'} available`}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink"><BookOpen className="h-3.5 w-3.5 text-muted" aria-hidden="true" />{s.classes} {s.classes === 1 ? 'class' : 'classes'}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" className={BTN_STUDENTS} onClick={() => onStudents(s.id)} title="Manage students in this section">
                            <UsersRound className="h-4 w-4" aria-hidden="true" /> Students
                          </button>
                          {!archived && (
                            <button type="button" className={BTN_ICON} disabled={!deletable} title={why ?? 'Delete this section'} aria-label={why ?? `Delete section ${s.label}`} onClick={() => { setDeleteError(null); setDeleting(s); }}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={deleting !== null} onClose={() => !busy && setDeleting(null)} title="Delete section?" maxWidth="sm:max-w-md">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-ink">Delete <b>{deleting.label}</b> from {yearLabel}? It has no students and no classes, so nothing else is affected. This cannot be undone.</p>
            {deleteError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={`inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 ${FOCUS}`} onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
              <button type="button" className={`inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 ${FOCUS}`} onClick={confirmDelete} disabled={busy} autoFocus>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> {busy ? 'Deleting…' : 'Delete section'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
