import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { BookOpen, GraduationCap, Layers, Pencil, Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { sectionCapacity, SECTION_CAPACITY, SECTION_YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import { FOCUS } from './kit';

/**
 * Sections — the Sections tab of Classes & Sections, organised as
 * Program → Year Level → Sections → Students.
 *
 * A program is picked first (tabs), then one of its three year levels
 * (cards), and only that program's sections for that year level and the
 * chosen school year are listed. Every count is computed from the sections the
 * page already loads (classSetupOverview, one query with per-section counts),
 * so nothing is fetched per section, and each count says what it covers.
 *
 * The selection lives in the URL (?program=&level=) so a link or a refresh
 * keeps it, but it is written with history.replaceState: switching program or
 * year level does not reload the page's data.
 *
 * Changes go through the existing endpoints, which enforce the rules (25 per
 * section under a row lock, unique names per program/year level/school year,
 * only empty sections deleted); the screen only explains them.
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
interface Program { id: string; code: string; name: string }

const TONE = {
  open: { bar: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  near: { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-800 ring-amber-200' },
  full: { bar: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 text-red-700 ring-red-200' },
} as const;

const INPUT = `h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink hover:border-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20`;
const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60 ${FOCUS}`;
const BTN_SECONDARY = `inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 ${FOCUS}`;
const BTN_STUDENTS = `inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 ${FOCUS}`;
const BTN_ICON = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Arrow keys move between the buttons of a group (program tabs, year levels). */
function arrowKeys(event: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-choice]')];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : (at + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
  items[next]?.focus();
  items[next]?.click();
}

/** The selected program and year level, kept in the URL without reloading the page. */
export function useSectionScope(sections: SectionRow[], programs: Program[]) {
  // Active programs, plus any inactive program that still has sections this year.
  const allPrograms = useMemo(() => {
    const byId = new Map(programs.map((p) => [p.id, p]));
    for (const s of sections) if (!byId.has(s.program.id)) byId.set(s.program.id, s.program);
    return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [sections, programs]);

  const [requested, setRequested] = useState(() => {
    const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    return { program: q.get('program'), level: Number(q.get('level')) };
  });

  const programId = allPrograms.some((p) => p.id === requested.program)
    ? requested.program!
    : (allPrograms.find((p) => sections.some((s) => s.program.id === p.id)) ?? allPrograms[0])?.id ?? null;
  const level = (SECTION_YEAR_LEVELS as readonly number[]).includes(requested.level) ? requested.level : SECTION_YEAR_LEVELS[0];

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (programId) q.set('program', programId); else q.delete('program');
    q.set('level', String(level));
    const next = `${window.location.pathname}?${q}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', next);
  }, [programId, level]);

  return {
    programs: allPrograms,
    programId,
    level,
    setProgram: (id: string) => setRequested((r) => ({ ...r, program: id })),
    setLevel: (n: number) => setRequested((r) => ({ ...r, level: n })),
    show: (id: string, n: number) => setRequested({ program: id, level: n }),
  };
}
export type SectionScope = ReturnType<typeof useSectionScope>;

function Occupancy({ s, compact }: { s: SectionRow; compact?: boolean }) {
  const cap = sectionCapacity(s.students);
  const tone = TONE[cap.level];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums text-ink">{cap.count}/{cap.capacity} <span className="font-normal text-muted">students</span></p>
        <p className={`text-xs ${cap.available === 0 ? `font-semibold ${tone.text}` : 'text-muted'}`}>
          {cap.available === 0 ? (cap.over ? 'Over capacity' : 'No seats left') : `${plural(cap.available, 'seat')} left`}
        </p>
      </div>
      <div className={`${compact ? 'mt-1' : 'mt-1.5'} h-2 overflow-hidden rounded-full bg-slate-100`} role="progressbar" aria-label={`${s.label} occupancy`} aria-valuemin={0} aria-valuemax={cap.capacity} aria-valuenow={cap.count} aria-valuetext={`${cap.count} of ${cap.capacity} students`}>
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, (cap.count / cap.capacity) * 100)}%` }} />
      </div>
    </div>
  );
}

function SectionCard({ s, yearLabel, archived, onStudents, onEdit, onDelete }: {
  s: SectionRow; yearLabel: string; archived: boolean; onStudents: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const cap = sectionCapacity(s.students);
  const deletable = s.students === 0 && s.classes === 0;
  const why = deletable ? undefined : `Can't delete: remove its ${s.students ? plural(s.students, 'student') : ''}${s.students && s.classes ? ' and ' : ''}${s.classes ? plural(s.classes, 'class', 'classes') : ''} first.`;
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,42,67,0.04)] transition hover:border-emerald-200 hover:shadow-[0_4px_14px_rgba(6,78,59,0.08)]" aria-label={s.label}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100" aria-hidden="true"><GraduationCap className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-ink">Section {s.name}</h4>
            {cap.level === 'full' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${TONE.full.chip}`}>Section Full</span>}
            {cap.level === 'near' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${TONE.near.chip}`}>Nearly full</span>}
            {cap.count === 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">Empty</span>}
            {cap.level === 'open' && cap.count > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${TONE.open.chip}`}>Available</span>}
          </div>
          <p className="text-xs text-muted">{s.program.name}</p>
          <p className="text-xs text-muted">{s.program.code} · {yearLevelLabel(s.yearLevel)} · {yearLabel}</p>
        </div>
      </div>
      <div className="mt-4"><Occupancy s={s} /></div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{plural(s.classes, 'class', 'classes')}</p>
      <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3">
        <button type="button" className={BTN_STUDENTS} onClick={onStudents} title="Manage students in this section" aria-label={`Students of ${s.label}`}>
          <UsersRound className="h-4 w-4" aria-hidden="true" /> Students
        </button>
        {!archived && (
          <>
            <button type="button" className={`${BTN_ICON} hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800`} title="Rename this section" aria-label={`Rename section ${s.label}`} onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className={`${BTN_ICON} enabled:hover:border-red-200 enabled:hover:bg-red-50 enabled:hover:text-red-700`} disabled={!deletable} title={why ?? 'Delete this section'} aria-label={why ?? `Delete section ${s.label}`} onClick={onDelete}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export default function SectionsManagement({
  sections, scope, archived, yearLabel, onStudents, onNewSection, onChanged,
}: {
  sections: SectionRow[];
  scope: SectionScope;
  archived: boolean;
  yearLabel: string;
  onStudents: (id: string) => void;
  onNewSection: (programId: string | null, yearLevel: number) => void;
  /** After a rename or delete: announce it and reload the page's data. */
  onChanged: (message: string) => void;
}) {
  const { programs, programId, level } = scope;
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<SectionRow | null>(null);
  const [renaming, setRenaming] = useState<SectionRow | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const program = programs.find((p) => p.id === programId) ?? null;
  const inProgram = useMemo(() => sections.filter((s) => s.program.id === programId), [sections, programId]);
  const byLevel = useMemo(() => SECTION_YEAR_LEVELS.map((n) => {
    const list = inProgram.filter((s) => s.yearLevel === n).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return {
      level: n,
      list,
      students: list.reduce((t, s) => t + s.students, 0),
      seats: list.reduce((t, s) => t + sectionCapacity(s.students).available, 0),
      full: list.filter((s) => s.students >= SECTION_CAPACITY).length,
    };
  }), [inProgram]);
  const current = byLevel.find((g) => g.level === level)!;

  // Search looks across every program and year level of this school year, and
  // keeps the hierarchy in its results.
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const hits = sections.filter((s) => `section ${s.name} ${s.label} ${s.program.code} ${s.program.name}`.toLowerCase().includes(q));
    const groups = new Map<string, { program: Program; level: number; list: SectionRow[] }>();
    for (const s of hits) {
      const key = `${s.program.code}|${s.yearLevel}`;
      if (!groups.has(key)) groups.set(key, { program: s.program, level: s.yearLevel, list: [] });
      groups.get(key)!.list.push(s);
    }
    return [...groups.values()].sort((a, b) => a.program.code.localeCompare(b.program.code) || a.level - b.level);
  }, [sections, q]);
  const hitCount = results.reduce((n, g) => n + g.list.length, 0);

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true); setProblem(null);
    const r = await api.del(`/api/v1/sections/${deleting.id}`);
    setBusy(false);
    if (!r.ok) { setProblem(r.message); return; }
    const label = deleting.label;
    setDeleting(null);
    onChanged(`Section ${label} was deleted.`);
  }
  async function confirmRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming || busy) return;
    const name = newName.trim();
    if (!name) { setProblem('Enter a section name.'); return; }
    if (name === renaming.name) { setRenaming(null); return; }
    setBusy(true); setProblem(null);
    const r = await api.put(`/api/v1/sections/${renaming.id}`, { name });
    setBusy(false);
    if (!r.ok) { setProblem(r.errors?.name?.[0] ?? r.message); return; }
    setRenaming(null);
    onChanged(`Section ${renaming.name} was renamed to Section ${name}.`);
  }

  const card = (s: SectionRow) => (
    <SectionCard key={s.id} s={s} yearLabel={yearLabel} archived={archived}
      onStudents={() => onStudents(s.id)}
      onEdit={() => { setProblem(null); setNewName(s.name); setRenaming(s); }}
      onDelete={() => { setProblem(null); setDeleting(s); }} />
  );

  if (programs.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
        <p className="text-base font-semibold text-ink">No active programs</p>
        <p className="mt-1 text-sm text-muted">Sections belong to a program. Add or activate a program under Programs first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Program and search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Program" onKeyDown={arrowKeys} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {programs.map((p) => {
            const on = p.id === programId && !q;
            const count = sections.filter((s) => s.program.id === p.id).length;
            return (
              <button key={p.id} type="button" data-choice aria-pressed={on} tabIndex={p.id === programId ? 0 : -1} onClick={() => { setQuery(''); scope.setProgram(p.id); }}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-left transition ${on ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-slate-200 bg-white text-ink hover:border-emerald-300 hover:bg-emerald-50'} ${FOCUS}`}>
                <span>
                  <span className="block text-sm font-semibold">{p.code}</span>
                  <span className={`block max-w-[16rem] truncate text-xs ${on ? 'text-emerald-50' : 'text-muted'}`}>{p.name}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-slate-100 text-ink'}`} aria-label={plural(count, 'section')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="sections-search" className="sr-only">Search sections and programs</label>
          <input id="sections-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search section or program" className={`${INPUT} pl-9`} />
        </div>
      </div>

      {q ? (
        /* Search results, still grouped as Program → Year Level */
        <section aria-labelledby="search-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="search-heading" className="text-base font-semibold text-ink" aria-live="polite">
              {plural(hitCount, 'section')} match “{query.trim()}” <span className="font-normal text-muted">in every program, {yearLabel}</span>
            </h2>
            <button type="button" className={`inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline ${FOCUS}`} onClick={() => setQuery('')}><X className="h-4 w-4" aria-hidden="true" /> Clear search</button>
          </div>
          {results.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-muted">No section or program matches. Try a section letter such as “A”, or a program code.</p>
          ) : results.map((g) => (
            <div key={`${g.program.id}-${g.level}`}>
              <h3 className="mb-2 text-sm font-semibold text-emerald-900">{g.program.code} <span className="font-normal text-muted">·</span> {yearLevelLabel(g.level)}</h3>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{g.list.map(card)}</ul>
            </div>
          ))}
        </section>
      ) : (
        <>
          {/* Year levels of the selected program */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{program ? `${program.name} (${program.code})` : ''} · School year {yearLabel}</p>
            <div role="group" aria-label="Year level" onKeyDown={arrowKeys} className="grid grid-cols-3 gap-2 sm:gap-3">
              {byLevel.map((g) => {
                const on = g.level === level;
                return (
                  <button key={g.level} type="button" data-choice aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => scope.setLevel(g.level)}
                    className={`rounded-2xl border p-3 text-left transition sm:p-4 ${on ? 'border-emerald-700 bg-emerald-50 shadow-[0_0_0_1px_rgb(4,120,87)]' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'} ${FOCUS}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold sm:text-base ${on ? 'text-emerald-900' : 'text-ink'}`}>{yearLevelLabel(g.level)}</span>
                      <Layers className={`hidden h-5 w-5 sm:block ${on ? 'text-emerald-700' : 'text-slate-400'}`} aria-hidden="true" />
                    </span>
                    {/* Phones: the counts as two short lines; wider screens: three figures. */}
                    <span className="mt-1 block text-xs leading-snug text-muted sm:hidden"><span className="block">{plural(g.list.length, 'section')}</span><span className="block">{plural(g.students, 'student')}</span><span className="block">{g.seats} open</span></span>
                    <span className="mt-2 hidden grid-cols-3 gap-2 text-xs text-muted sm:grid">
                      <span><span className="block text-lg font-bold tabular-nums text-ink">{g.list.length}</span>{g.list.length === 1 ? 'section' : 'sections'}</span>
                      <span><span className="block text-lg font-bold tabular-nums text-ink">{g.students}</span>{g.students === 1 ? 'student' : 'students'}</span>
                      <span><span className="block text-lg font-bold tabular-nums text-ink">{g.seats}</span>{g.seats === 1 ? 'seat open' : 'seats open'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sections of that year level */}
          <section aria-labelledby="level-heading" className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="level-heading" className="text-base font-semibold text-ink">{program?.code} · {yearLevelLabel(level)} sections</h2>
                <p className="text-xs text-muted">
                  {plural(current.list.length, 'section')} · {plural(current.students, 'student')} · {plural(current.seats, 'seat')} open
                  {current.full ? ` · ${current.full} full` : ''} · up to {SECTION_CAPACITY} students each
                </p>
                <p className="mt-0.5 text-xs text-muted">Approved enrollments are placed here automatically: the first section with a free seat, or a new one when all are full.</p>
              </div>
              {!archived && (
                <button type="button" className={BTN_PRIMARY} onClick={() => onNewSection(programId, level)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> New {yearLevelLabel(level)} Section
                </button>
              )}
            </div>
            {current.list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100" aria-hidden="true"><GraduationCap className="h-6 w-6" /></span>
                <p className="mt-3 text-base font-semibold text-ink">No {yearLevelLabel(level)} sections in {program?.code} yet</p>
                <p className="mt-1 text-sm text-muted">{archived ? `School year ${yearLabel} is archived.` : `Create one for ${yearLabel}, then add its students.`}</p>
              </div>
            ) : (
              <>
                {current.seats === 0 && !archived && (
                  <p role="status" className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                    Every {yearLevelLabel(level)} section in {program?.code} is full. Create another {yearLevelLabel(level)} section to place more students.
                  </p>
                )}
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{current.list.map(card)}</ul>
              </>
            )}
          </section>
        </>
      )}

      <Modal open={deleting !== null} onClose={() => !busy && setDeleting(null)} title="Delete section?" maxWidth="sm:max-w-md">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-ink">Delete <b>{deleting.label}</b> from {yearLabel}? It has no students and no classes, so nothing else is affected. This cannot be undone.</p>
            {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
              <button type="button" className={`inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 ${FOCUS}`} onClick={confirmDelete} disabled={busy} autoFocus>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> {busy ? 'Deleting…' : 'Delete section'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={renaming !== null} onClose={() => !busy && setRenaming(null)} title="Rename section" maxWidth="sm:max-w-md">
        {renaming && (
          <form className="space-y-4" onSubmit={confirmRename}>
            <p className="text-sm text-muted">{renaming.program.code} · {yearLevelLabel(renaming.yearLevel)} · {yearLabel}. The program and year level stay the same; its students and classes are kept.</p>
            <div>
              <label htmlFor="rename-section" className="text-sm font-semibold text-ink">Section name</label>
              <input id="rename-section" className={`${INPUT} mt-1`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={50} required autoFocus aria-invalid={problem ? true : undefined} aria-describedby={problem ? 'rename-problem' : undefined} />
            </div>
            {problem && <p id="rename-problem" role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setRenaming(null)} disabled={busy}>Cancel</button>
              <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
