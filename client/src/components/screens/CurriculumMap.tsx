import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { BookOpen, Eye, Layers, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import Link from '@/lib/link';
import Modal from '@/components/Modal';
import Drawer from '@/components/Drawer';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { SEMESTER_LABELS, YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import { SUBJECT_TYPES, SUBJECT_TYPE_LABELS, type SubjectType } from '@shared/types/domain';
import { totalHours } from '@shared/lib/subjects';
import { FOCUS } from '@/components/teaching/kit';
import type { SubjectDetails } from './SubjectForm';

/**
 * The Curriculum Map — Subjects Management's main view:
 * Program → Year Level → Semester → Subjects.
 *
 * Program tabs, year-level cards (subjects and units), a semester control,
 * then that term's subjects in the program's current curriculum (its newest
 * active one: the one classes are scheduled from and students enroll into),
 * with search and type/status filters. A subject is one catalogue record
 * however many curricula use it; this view shows where it sits. Mapping,
 * changing a mapping and removing go through the curriculum endpoints, which
 * decide everything; editing the subject itself goes through the catalogue.
 * The selection is kept in the URL.
 */

export interface MapEntry {
  id: string;
  yearLevel: number;
  semester: number;
  units: number;
  isRequired: boolean;
  prerequisites: { id: string; code: string }[];
  classes: number;
  subject: {
    id: string; code: string; title: string; description: string | null; type: string; defaultUnits: number;
    lectureHours: number | null; labHours: number | null; recommendedClassSize: number | null; remarks: string | null; isActive: boolean;
  };
}
export interface MapProgram {
  id: string;
  code: string;
  name: string;
  curriculum: { id: string; version: string; effective: string; entries: MapEntry[] } | null;
}
export interface ActiveSubject { id: string; code: string; title: string; defaultUnits: number }

const INPUT = `h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20`;
const SELECT = `h-10 rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-sm text-ink focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20`;
const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60 ${FOCUS}`;
const BTN_SECONDARY = `inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 ${FOCUS}`;
const ICON_BTN = `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 ${FOCUS}`;
// Year levels told apart by a quiet accent.
const YEAR_ACCENT: Record<number, string> = { 1: 'bg-emerald-500', 2: 'bg-accent-blue', 3: 'bg-accent-violet' };

/** Arrow keys move between the buttons of a group. */
function arrowKeys(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-choice]')];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowLeft' ? -1 : 1) + items.length) % items.length;
  items[next]?.focus();
  items[next]?.click();
}

/** The term in view, kept in the URL without reloading the page. */
export function readMapScope(programs: MapProgram[]) {
  const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const program = programs.find((p) => p.id === q.get('program')) ?? programs[0] ?? null;
  const level = (YEAR_LEVELS as readonly number[]).includes(Number(q.get('level'))) ? Number(q.get('level')) : 1;
  const sem = [1, 2, 3].includes(Number(q.get('sem'))) ? Number(q.get('sem')) : 1;
  return { programId: program?.id ?? null, yearLevel: level, semester: sem };
}

function useMapScope(programs: MapProgram[]) {
  const [s, setS] = useState(() => readMapScope(programs));
  const program = programs.find((p) => p.id === s.programId) ?? programs[0] ?? null;
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set('view', 'map');
    if (program) q.set('program', program.id);
    q.set('level', String(s.yearLevel));
    q.set('sem', String(s.semester));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}`);
  }, [program, s.yearLevel, s.semester]);
  return { program, level: s.yearLevel, sem: s.semester, set: (next: Partial<{ programId: string; yearLevel: number; semester: number }>) => setS((x) => ({ ...x, ...next })) };
}

const hoursText = (e: MapEntry['subject']) => {
  const parts = [e.lectureHours !== null ? `Lec ${e.lectureHours}` : null, e.labHours !== null ? `Lab ${e.labHours}` : null].filter(Boolean);
  const total = totalHours({ lectureHours: e.lectureHours, labHours: e.labHours });
  return parts.length ? `${parts.join(' · ')} · ${total} h` : '—';
};
const asDetails = (s: MapEntry['subject']): SubjectDetails => ({
  id: s.id, code: s.code, title: s.title, description: s.description, subjectType: s.type, defaultUnits: s.defaultUnits,
  lectureHours: s.lectureHours, labHours: s.labHours, recommendedClassSize: s.recommendedClassSize, remarks: s.remarks, isActive: s.isActive,
});

export default function CurriculumMap({ programs, subjects, canMap, onEdit, notice: outerNotice }: {
  programs: MapProgram[];
  subjects: ActiveSubject[];
  canMap: boolean;
  /** Open the subject form on a subject. */
  onEdit: (s: SubjectDetails) => void;
  notice?: string | null;
}) {
  const router = useRouter();
  const { program, level, sem, set: setScope } = useMapScope(programs);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MapEntry | null>(null);
  const [toggling, setToggling] = useState<MapEntry | null>(null);
  const [viewing, setViewing] = useState<MapEntry | null>(null);
  const [form, setForm] = useState({ subjectId: '', units: '', isRequired: true, prerequisites: [] as string[] });
  const [placement, setPlacement] = useState({ units: '', isRequired: true, prerequisites: [] as string[] });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A notice belongs to the term it was about: moving on clears it.
  const set = (next: Parameters<typeof setScope>[0]) => { setNotice(null); setScope(next); };
  useEffect(() => { if (outerNotice) setNotice(outerNotice); }, [outerNotice]);

  const entries = program?.curriculum?.entries ?? [];
  const inYear = (l: number) => entries.filter((e) => e.yearLevel === l);
  const unitsOf = (list: MapEntry[]) => list.reduce((n, e) => n + e.units, 0);
  // 1st and 2nd Semester always; Summer when it is used (or being viewed).
  const semesters = [1, 2, ...(entries.some((e) => e.semester === 3) || sem === 3 ? [3] : [])];
  const term = entries.filter((e) => e.yearLevel === level && e.semester === sem);
  const q = query.trim().toLowerCase();
  const shown = term
    .filter((e) => (!q || `${e.subject.code} ${e.subject.title}`.toLowerCase().includes(q)) && (!type || e.subject.type === type) && (!status || (status === 'active') === e.subject.isActive))
    .sort((a, b) => a.subject.code.localeCompare(b.subject.code));
  const inCurriculum = useMemo(() => new Set(entries.map((e) => e.subject.id)), [entries]);
  const available = subjects.filter((s) => !inCurriculum.has(s.id));
  const filtered = Boolean(q || type || status);

  // Keep an open details panel in step with refreshed data.
  useEffect(() => {
    if (viewing) setViewing(entries.find((e) => e.id === viewing.id) ?? null);
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setErrors({}); setProblem(null); setNotice(null);
    setForm({ subjectId: '', units: '', isRequired: true, prerequisites: [] });
    setAdding(true);
  }
  function openView(e: MapEntry) {
    setErrors({}); setProblem(null);
    setPlacement({ units: String(e.units), isRequired: e.isRequired, prerequisites: e.prerequisites.map((p) => p.id) });
    setViewing(e);
  }

  async function mapSubject(ev: React.FormEvent) {
    ev.preventDefault();
    if (!program?.curriculum || busy) return;
    setBusy(true); setErrors({}); setProblem(null);
    const subject = subjects.find((s) => s.id === form.subjectId);
    const r = await api.post(`/api/v1/curricula/${program.curriculum.id}/subjects`, {
      subjectId: form.subjectId, yearLevel: level, semester: sem,
      units: form.units === '' ? subject?.defaultUnits ?? 0 : Number(form.units),
      isRequired: form.isRequired, prerequisiteSubjectIds: form.prerequisites,
    });
    setBusy(false);
    if (!r.ok) { setErrors(r.errors ?? {}); setProblem(r.errors ? null : r.message); return; }
    setAdding(false);
    setNotice(`${subject?.code ?? 'The subject'} is now in ${program.code} · ${yearLevelLabel(level)} · ${SEMESTER_LABELS[sem]}.`);
    router.refresh();
  }

  async function savePlacement(ev: React.FormEvent) {
    ev.preventDefault();
    if (!program?.curriculum || !viewing || busy) return;
    setBusy(true); setErrors({}); setProblem(null);
    const r = await api.put(`/api/v1/curricula/${program.curriculum.id}/subjects/${viewing.id}`, {
      units: Number(placement.units), isRequired: placement.isRequired, prerequisiteSubjectIds: placement.prerequisites,
    });
    setBusy(false);
    if (!r.ok) { setErrors(r.errors ?? {}); setProblem(r.errors ? Object.values(r.errors)[0]?.[0] ?? r.message : r.message); return; }
    setNotice(`${viewing.subject.code}'s place in the curriculum was saved.`);
    router.refresh();
  }

  async function remove() {
    if (!program?.curriculum || !removing || busy) return;
    setBusy(true); setProblem(null);
    const r = await api.del(`/api/v1/curricula/${program.curriculum.id}/subjects/${removing.id}`);
    setBusy(false);
    if (!r.ok) { setProblem(r.message); return; }
    setNotice(`${removing.subject.code} was removed from ${program.code} · ${yearLevelLabel(level)} · ${SEMESTER_LABELS[sem]}.`);
    setRemoving(null);
    router.refresh();
  }

  async function toggle() {
    if (!toggling || busy) return;
    setBusy(true); setProblem(null);
    const r = await api.patch(`/api/v1/subjects/${toggling.subject.id}`);
    setBusy(false);
    if (!r.ok) { setProblem(r.message); return; }
    setNotice(`${toggling.subject.code} is now ${toggling.subject.isActive ? 'inactive' : 'active'}.`);
    setToggling(null);
    router.refresh();
  }

  if (programs.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-muted">No active programs. Add one under Programs first.</p>;
  }

  const prereqChoices = (exclude: string) => entries.filter((e) => e.subject.id !== exclude).sort((a, b) => a.yearLevel - b.yearLevel || a.semester - b.semester || a.subject.code.localeCompare(b.subject.code));
  const PrereqPicker = ({ value, onChange, exclude }: { value: string[]; onChange: (v: string[]) => void; exclude: string }) => (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">Prerequisites <span className="font-normal text-muted">(optional)</span></legend>
      {prereqChoices(exclude).length === 0 ? <p className="mt-1 text-xs text-muted">No other subject in this curriculum yet.</p> : (
        <ul className="mt-1 grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
          {prereqChoices(exclude).map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" checked={value.includes(c.subject.id)}
                  onChange={(ev) => onChange(ev.target.checked ? [...value, c.subject.id] : value.filter((x) => x !== c.subject.id))} />
                <span><b>{c.subject.code}</b> <span className="text-muted">{yearLevelLabel(c.yearLevel)}, {SEMESTER_LABELS[c.semester]}</span></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {errors.prerequisiteSubjectIds && <p className="mt-1 text-xs text-red-700">{errors.prerequisiteSubjectIds[0]}</p>}
    </fieldset>
  );

  return (
    <div className="space-y-5">
      {/* Program */}
      <div role="group" aria-label="Program" onKeyDown={arrowKeys} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {programs.map((p) => {
          const on = p.id === program?.id;
          return (
            <button key={p.id} type="button" data-choice aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => set({ programId: p.id })}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-left transition ${on ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-slate-200 bg-white text-ink hover:border-emerald-300 hover:bg-emerald-50'} ${FOCUS}`}>
              <span>
                <span className="block text-sm font-semibold">{p.code}</span>
                <span className={`block max-w-[16rem] truncate text-xs ${on ? 'text-emerald-50' : 'text-muted'}`}>{p.name}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-slate-100 text-ink'}`} aria-label={`${p.curriculum?.entries.length ?? 0} subjects mapped`}>{p.curriculum?.entries.length ?? 0}</span>
            </button>
          );
        })}
      </div>

      {!program?.curriculum ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">{program?.code} has no active curriculum</p>
          <p className="mt-1 text-sm text-muted">Create one on the program’s page, then add its subjects here.</p>
          {program && <Link href={`/programs/${program.id}`} className={`mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline ${FOCUS}`}>Open {program.code}</Link>}
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{program.name} · Curriculum {program.curriculum.version} (from {program.curriculum.effective})</p>

          {/* Year levels: subjects and units */}
          <div role="group" aria-label="Year level" onKeyDown={arrowKeys} className="grid grid-cols-3 gap-2 sm:gap-3">
            {YEAR_LEVELS.map((l) => {
              const on = l === level;
              const list = inYear(l);
              return (
                <button key={l} type="button" data-choice aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => set({ yearLevel: l })}
                  className={`relative overflow-hidden rounded-2xl border p-3 text-left transition sm:p-4 ${on ? 'border-emerald-700 bg-emerald-50 shadow-[0_0_0_1px_rgb(8,127,91)]' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'} ${FOCUS}`}>
                  <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${YEAR_ACCENT[l]} ${on ? 'opacity-100' : 'opacity-40'}`} />
                  <span className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold sm:text-base ${on ? 'text-emerald-900' : 'text-ink'}`}>{yearLevelLabel(l)}</span>
                    <Layers className={`hidden h-5 w-5 sm:block ${on ? 'text-emerald-700' : 'text-slate-400'}`} aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xs text-muted">{list.length} {list.length === 1 ? 'subject' : 'subjects'} · {unitsOf(list)} units</span>
                </button>
              );
            })}
          </div>

          {/* Semester */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="group" aria-label="Semester" onKeyDown={arrowKeys} className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1">
              {semesters.map((s) => {
                const on = s === sem;
                const n = inYear(level).filter((e) => e.semester === s).length;
                return (
                  <button key={s} type="button" data-choice aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => set({ semester: s })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-forest text-white' : 'text-ink hover:bg-slate-50'} ${FOCUS}`}>
                    {SEMESTER_LABELS[s]} <span className={`ml-1 tabular-nums ${on ? 'text-white/80' : 'text-muted'}`}>{n}</span>
                  </button>
                );
              })}
              {!semesters.includes(3) && canMap && (
                <button type="button" onClick={() => set({ semester: 3 })} className={`rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-slate-50 ${FOCUS}`} title="Show the Summer term">+ Summer</button>
              )}
            </div>
            {canMap && <button type="button" className={BTN_SECONDARY} onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Map an existing subject</button>}
          </div>

          {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">{notice}</p>}
          {problem && !removing && !toggling && !adding && !viewing && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}

          <section aria-labelledby="term-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <header className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-emerald-50/60 to-white px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="term-heading" className="text-base font-semibold text-ink">{program.code} · {yearLevelLabel(level)} · {SEMESTER_LABELS[sem]}</h2>
                <p className="text-xs text-muted">{term.length} {term.length === 1 ? 'subject' : 'subjects'} · {unitsOf(term)} units{filtered ? ` · ${shown.length} shown` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <label htmlFor="map-search" className="sr-only">Search subjects</label>
                  <input id="map-search" type="search" className={`${INPUT} pl-9`} placeholder="Search code or title" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <label htmlFor="map-type" className="sr-only">Subject type</label>
                <select id="map-type" className={SELECT} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">All types</option>
                  {SUBJECT_TYPES.map((t) => <option key={t} value={t}>{SUBJECT_TYPE_LABELS[t]}</option>)}
                </select>
                <label htmlFor="map-status" className="sr-only">Status</label>
                <select id="map-status" className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option>
                </select>
              </div>
            </header>
            {term.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100" aria-hidden="true"><BookOpen className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-semibold text-ink">No subjects in this term yet</p>
                <p className="mt-1 text-sm text-muted">{canMap ? 'Use New Subject above, or map one that is already in the catalogue.' : 'The Coordinator adds subjects here.'}</p>
              </div>
            ) : shown.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-semibold text-ink">No subject in this term matches</p>
                <button type="button" className={`mt-2 text-sm font-semibold text-emerald-700 hover:underline ${FOCUS}`} onClick={() => { setQuery(''); setType(''); setStatus(''); }}>Clear search and filters</button>
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                      <th scope="col" className="px-4 py-2.5 sm:px-5">Subject</th>
                      <th scope="col" className="px-3 py-2.5">Type</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Units</th>
                      <th scope="col" className="px-3 py-2.5">Hours / week</th>
                      <th scope="col" className="px-3 py-2.5">Status</th>
                      <th scope="col" className="px-4 py-2.5 text-right sm:px-5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shown.map((e) => (
                      <tr key={e.id} className="transition-colors hover:bg-emerald-50/40">
                        <td className="px-4 py-3 sm:px-5">
                          <p className="min-w-[12rem] font-semibold text-ink">{e.subject.code} <span className="font-normal text-muted">·</span> {e.subject.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                            <span className={`rounded-full px-1.5 py-px text-[10px] font-bold uppercase ring-1 ring-inset ${e.isRequired ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-sky-50 text-sky-800 ring-sky-200'}`}>{e.isRequired ? 'Required' : 'Elective'}</span>
                            {e.prerequisites.length > 0 && <span>Prerequisite{e.prerequisites.length === 1 ? '' : 's'}: {e.prerequisites.map((p) => p.code).join(', ')}</span>}
                            {e.classes > 0 && <span>· {e.classes} {e.classes === 1 ? 'class' : 'classes'}</span>}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{SUBJECT_TYPE_LABELS[e.subject.type as SubjectType] ?? e.subject.type}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{e.units}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted">{hoursText(e.subject)}</td>
                        <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ring-inset ${e.subject.isActive ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{e.subject.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right sm:px-5">
                          <div className="flex justify-end gap-1.5">
                            <button type="button" className={ICON_BTN} aria-label={`View ${e.subject.code}`} title="View details" onClick={() => openView(e)}><Eye className="h-4 w-4" aria-hidden="true" /></button>
                            {canMap && (
                              <>
                                <button type="button" className={ICON_BTN} aria-label={`Edit ${e.subject.code}`} title="Edit subject" onClick={() => onEdit(asDetails(e.subject))}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                                <button type="button" className={ICON_BTN} aria-label={`${e.subject.isActive ? 'Deactivate' : 'Activate'} ${e.subject.code}`} title={e.subject.isActive ? 'Deactivate' : 'Activate'} onClick={() => { setProblem(null); setToggling(e); }}><Power className="h-4 w-4" aria-hidden="true" /></button>
                                <button type="button" className={`${ICON_BTN} hover:border-red-200 hover:bg-red-50 hover:text-red-700`} aria-label={`Remove ${e.subject.code} from this term`} title="Remove from this term" onClick={() => { setProblem(null); setRemoving(e); }}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Details */}
      <Drawer open={viewing !== null} onClose={() => setViewing(null)} title="Subject details" width="sm:max-w-lg">
        {viewing && (
          <div className="space-y-5">
            <div>
              <p className="text-lg font-semibold text-ink">{viewing.subject.code} · {viewing.subject.title}</p>
              <p className="text-sm text-muted">{SUBJECT_TYPE_LABELS[viewing.subject.type as SubjectType] ?? viewing.subject.type} · {viewing.subject.isActive ? 'Active' : 'Inactive'}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([
                ['Default units', viewing.subject.defaultUnits],
                ['Contact hours', hoursText(viewing.subject)],
                ['Recommended class size', viewing.subject.recommendedClassSize ?? '—'],
                ['Classes scheduled', viewing.classes],
              ] as [string, string | number][]).map(([k, v]) => (
                <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{k}</dt><dd className="mt-0.5 text-ink">{v}</dd></div>
              ))}
            </dl>
            {viewing.subject.description && <p className="text-sm text-ink"><span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Description</span>{viewing.subject.description}</p>}
            {viewing.subject.remarks && <p className="text-sm text-ink"><span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Remarks</span>{viewing.subject.remarks}</p>}

            <form onSubmit={savePlacement} className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <p className="text-sm font-semibold text-emerald-900">In {program?.code} · {yearLevelLabel(viewing.yearLevel)} · {SEMESTER_LABELS[viewing.semester]}</p>
              {canMap ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pl-units" className="text-sm font-semibold text-ink">Units in this curriculum</label>
                      <input id="pl-units" type="number" min={0} max={99} step={0.5} className={`${INPUT} mt-1`} value={placement.units} onChange={(e) => setPlacement({ ...placement, units: e.target.value })} required />
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-sm text-ink">
                      <input type="checkbox" className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" checked={placement.isRequired} onChange={(e) => setPlacement({ ...placement, isRequired: e.target.checked })} /> Required
                    </label>
                  </div>
                  <PrereqPicker value={placement.prerequisites} onChange={(v) => setPlacement({ ...placement, prerequisites: v })} exclude={viewing.subject.id} />
                  {problem && <p role="alert" className="text-sm text-red-800">{problem}</p>}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={BTN_SECONDARY} onClick={() => onEdit(asDetails(viewing.subject))}>Edit subject</button>
                    <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save placement'}</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink">{viewing.isRequired ? 'Required' : 'Elective'} · {viewing.units} units{viewing.prerequisites.length ? ` · Prerequisites: ${viewing.prerequisites.map((p) => p.code).join(', ')}` : ''}</p>
              )}
            </form>
          </div>
        )}
      </Drawer>

      {/* Map an existing subject */}
      <Modal open={adding} onClose={() => !busy && setAdding(false)} title="Map an existing subject" subtitle={program ? `${program.code} · ${yearLevelLabel(level)} · ${SEMESTER_LABELS[sem]}` : undefined}>
        <form className="space-y-4" onSubmit={mapSubject}>
          <div>
            <label htmlFor="map-subject" className="text-sm font-semibold text-ink">Subject</label>
            <select id="map-subject" className={`${INPUT} mt-1`} value={form.subjectId} required onChange={(e) => setForm({ ...form, subjectId: e.target.value, units: '' })}>
              <option value="">Choose a subject…</option>
              {available.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
            </select>
            {available.length === 0 && <p className="mt-1 text-xs text-muted">Every active subject is already in this curriculum. Use New Subject to add one.</p>}
            {errors.subjectId && <p className="mt-1 text-xs text-red-700">{errors.subjectId[0]}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="map-units" className="text-sm font-semibold text-ink">Units</label>
              <input id="map-units" type="number" min={0} max={99} step={0.5} className={`${INPUT} mt-1`}
                placeholder={String(subjects.find((s) => s.id === form.subjectId)?.defaultUnits ?? '')}
                value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
              <p className="mt-1 text-xs text-muted">Blank uses the subject’s default units.</p>
            </div>
            <label className="flex items-center gap-2 self-center text-sm text-ink">
              <input type="checkbox" className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
              Required <span className="text-muted">(untick for an elective)</span>
            </label>
          </div>
          <PrereqPicker value={form.prerequisites} onChange={(v) => setForm({ ...form, prerequisites: v })} exclude={form.subjectId} />
          {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(false)} disabled={busy}>Cancel</button>
            <button type="submit" className={BTN_PRIMARY} disabled={busy || !form.subjectId}>{busy ? 'Mapping…' : 'Map subject'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={removing !== null} onClose={() => !busy && setRemoving(null)} title="Remove from this term?" maxWidth="sm:max-w-md">
        {removing && (
          <div className="space-y-4">
            <p className="text-sm text-ink">Remove <b>{removing.subject.code}</b> from {program?.code} · {yearLevelLabel(level)} · {SEMESTER_LABELS[sem]}? The subject stays in the catalogue.</p>
            {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setRemoving(null)} disabled={busy}>Cancel</button>
              <button type="button" className={`inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 ${FOCUS}`} onClick={remove} disabled={busy} autoFocus>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> {busy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={toggling !== null} onClose={() => !busy && setToggling(null)} title={toggling?.subject.isActive ? 'Deactivate subject?' : 'Activate subject?'} maxWidth="sm:max-w-md">
        {toggling && (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              {toggling.subject.isActive
                ? <>Deactivate <b>{toggling.subject.code}</b>? It stays in every curriculum and its classes keep their records, but it cannot be scheduled while inactive.</>
                : <>Activate <b>{toggling.subject.code}</b> so it can be scheduled again?</>}
            </p>
            {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setToggling(null)} disabled={busy}>Cancel</button>
              <button type="button" className={BTN_PRIMARY} onClick={toggle} disabled={busy} autoFocus>{busy ? 'Saving…' : toggling.subject.isActive ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
