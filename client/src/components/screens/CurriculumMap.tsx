import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { BookOpen, Layers, Plus, Trash2 } from 'lucide-react';
import Link from '@/lib/link';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { SEMESTER_LABELS, YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import { SUBJECT_TYPE_LABELS, type SubjectType } from '@shared/types/domain';
import { FOCUS } from '@/components/teaching/kit';

/**
 * The Curriculum Map — Subjects → which program, year level and semester
 * each subject is taught in.
 *
 * Program tabs, then 1st/2nd/3rd Year, then a separate semester control,
 * then that term's subjects in the program's current curriculum (its newest
 * active one: the one classes are scheduled from and students enroll into).
 * Mapping and removing go through the existing curriculum endpoints, which
 * decide everything (one mapping per subject per curriculum; a mapping a
 * class teaches cannot be removed). The selection is kept in the URL.
 */

export interface MapEntry {
  id: string;
  yearLevel: number;
  semester: number;
  units: number;
  isRequired: boolean;
  prerequisite: string | null;
  classes: number;
  subject: { id: string; code: string; title: string; type: string; isActive: boolean };
}
export interface MapProgram {
  id: string;
  code: string;
  name: string;
  curriculum: { id: string; version: string; effective: string; entries: MapEntry[] } | null;
}
export interface ActiveSubject { id: string; code: string; title: string; defaultUnits: number }

const SEMESTERS = [1, 2, 3] as const;
const INPUT = `h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20`;
const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60 ${FOCUS}`;
const BTN_SECONDARY = `inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 ${FOCUS}`;

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

function useMapScope(programs: MapProgram[]) {
  const [s, setS] = useState(() => {
    const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    return { program: q.get('program'), level: Number(q.get('level')) || 1, sem: Number(q.get('sem')) || 1 };
  });
  const program = programs.find((p) => p.id === s.program) ?? programs[0] ?? null;
  const level = (YEAR_LEVELS as readonly number[]).includes(s.level) ? s.level : 1;
  const sem = (SEMESTERS as readonly number[]).includes(s.sem) ? s.sem : 1;
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set('view', 'map');
    if (program) q.set('program', program.id);
    q.set('level', String(level));
    q.set('sem', String(sem));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}`);
  }, [program, level, sem]);
  return { program, level, sem, set: (next: Partial<{ program: string; level: number; sem: number }>) => setS((x) => ({ ...x, ...next })) };
}

export default function CurriculumMap({ programs, subjects, canMap }: { programs: MapProgram[]; subjects: ActiveSubject[]; canMap: boolean }) {
  const router = useRouter();
  const { program, level, sem, set: setScope } = useMapScope(programs);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MapEntry | null>(null);
  const [form, setForm] = useState({ subjectId: '', units: '', isRequired: true, prerequisiteSubjectId: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A notice belongs to the term it was about: moving on clears it.
  const set = (next: Parameters<typeof setScope>[0]) => { setNotice(null); setScope(next); };

  const entries = program?.curriculum?.entries ?? [];
  const count = (l: number, s?: number) => entries.filter((e) => e.yearLevel === l && (s === undefined || e.semester === s)).length;
  const term = entries.filter((e) => e.yearLevel === level && e.semester === sem).sort((a, b) => a.subject.code.localeCompare(b.subject.code));
  const units = term.reduce((n, e) => n + e.units, 0);
  const inCurriculum = useMemo(() => new Set(entries.map((e) => e.subject.id)), [entries]);
  const available = subjects.filter((s) => !inCurriculum.has(s.id));

  function openAdd() {
    setErrors({}); setProblem(null); setNotice(null);
    setForm({ subjectId: '', units: '', isRequired: true, prerequisiteSubjectId: '' });
    setAdding(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!program?.curriculum || busy) return;
    setBusy(true); setErrors({}); setProblem(null);
    const subject = subjects.find((s) => s.id === form.subjectId);
    const r = await api.post(`/api/v1/curricula/${program.curriculum.id}/subjects`, {
      subjectId: form.subjectId,
      yearLevel: level,
      semester: sem,
      units: form.units === '' ? subject?.defaultUnits ?? 0 : Number(form.units),
      isRequired: form.isRequired,
      prerequisiteSubjectId: form.prerequisiteSubjectId || null,
    });
    setBusy(false);
    if (!r.ok) { setErrors(r.errors ?? {}); setProblem(r.errors ? null : r.message); return; }
    setAdding(false);
    setNotice(`${subject?.code ?? 'The subject'} is now in ${program.code} · ${yearLevelLabel(level)} · ${SEMESTER_LABELS[sem]}.`);
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

  if (programs.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-muted">No active programs. Add one under Programs first.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Program */}
      <div role="group" aria-label="Program" onKeyDown={arrowKeys} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {programs.map((p) => {
          const on = p.id === program?.id;
          return (
            <button key={p.id} type="button" data-choice aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => set({ program: p.id })}
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
          <p className="mt-1 text-sm text-muted">Create one on the program’s page, then map its subjects here.</p>
          {program && <Link href={`/programs/${program.id}`} className={`mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline ${FOCUS}`}>Open {program.code}</Link>}
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{program.name} · Curriculum {program.curriculum.version} (from {program.curriculum.effective})</p>

          {/* Year level */}
          <div role="group" aria-label="Year level" onKeyDown={arrowKeys} className="grid grid-cols-3 gap-2 sm:gap-3">
            {YEAR_LEVELS.map((l) => {
              const on = l === level;
              return (
                <button key={l} type="button" data-choice aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => set({ level: l })}
                  className={`rounded-2xl border p-3 text-left transition sm:p-4 ${on ? 'border-emerald-700 bg-emerald-50 shadow-[0_0_0_1px_rgb(8,127,91)]' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'} ${FOCUS}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold sm:text-base ${on ? 'text-emerald-900' : 'text-ink'}`}>{yearLevelLabel(l)}</span>
                    <Layers className={`hidden h-5 w-5 sm:block ${on ? 'text-emerald-700' : 'text-slate-400'}`} aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xs text-muted">{count(l)} {count(l) === 1 ? 'subject' : 'subjects'}</span>
                </button>
              );
            })}
          </div>

          {/* Semester */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="group" aria-label="Semester" onKeyDown={arrowKeys} className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1">
              {SEMESTERS.map((s) => {
                const on = s === sem;
                return (
                  <button key={s} type="button" data-choice aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => set({ sem: s })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-forest text-white' : 'text-ink hover:bg-slate-50'} ${FOCUS}`}>
                    {SEMESTER_LABELS[s]} <span className={`ml-1 tabular-nums ${on ? 'text-white/80' : 'text-muted'}`}>{count(level, s)}</span>
                  </button>
                );
              })}
            </div>
            {canMap && <button type="button" className={BTN_PRIMARY} onClick={openAdd}><Plus className="h-4 w-4" aria-hidden="true" /> Map subject</button>}
          </div>

          {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">{notice}</p>}

          <section aria-labelledby="term-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
              <h2 id="term-heading" className="text-base font-semibold text-ink">{program.code} · {yearLevelLabel(level)} · {SEMESTER_LABELS[sem]}</h2>
              <p className="text-xs text-muted">{term.length} {term.length === 1 ? 'subject' : 'subjects'} · {units} units</p>
            </header>
            {term.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100" aria-hidden="true"><BookOpen className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-semibold text-ink">No subjects mapped to this term yet</p>
                <p className="mt-1 text-sm text-muted">{canMap ? 'Use Map subject to add one from the catalogue.' : 'The Coordinator maps subjects here.'}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {term.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-violet-50 text-accent-violet ring-1 ring-inset ring-violet-100" aria-hidden="true"><BookOpen className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{e.subject.code} <span className="font-normal text-muted">·</span> {e.subject.title}</p>
                      <p className="text-xs text-muted">
                        {SUBJECT_TYPE_LABELS[e.subject.type as SubjectType] ?? e.subject.type} · {e.units} units
                        {e.prerequisite ? ` · Prerequisite ${e.prerequisite}` : ''}
                        {e.classes ? ` · ${e.classes} ${e.classes === 1 ? 'class' : 'classes'} scheduled` : ''}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${e.isRequired ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-sky-50 text-sky-800 ring-sky-200'}`}>{e.isRequired ? 'Required' : 'Elective'}</span>
                    {!e.subject.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">Inactive subject</span>}
                    {canMap && (
                      <button type="button" className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 ${FOCUS}`}
                        aria-label={`Remove ${e.subject.code} from this term`} title="Remove from this term" onClick={() => { setProblem(null); setRemoving(e); }}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Modal open={adding} onClose={() => !busy && setAdding(false)} title="Map subject" subtitle={program ? `${program.code} · ${yearLevelLabel(level)} · ${SEMESTER_LABELS[sem]}` : undefined}>
        <form className="space-y-4" onSubmit={save}>
          <div>
            <label htmlFor="map-subject" className="text-sm font-semibold text-ink">Subject</label>
            <select id="map-subject" className={`${INPUT} mt-1`} value={form.subjectId} required onChange={(e) => setForm({ ...form, subjectId: e.target.value, units: '' })}>
              <option value="">Choose a subject…</option>
              {available.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
            </select>
            {available.length === 0 && <p className="mt-1 text-xs text-muted">Every active subject is already in this curriculum. Add one to the catalogue first.</p>}
            {errors.subjectId && <p className="mt-1 text-xs text-red-700">{errors.subjectId[0]}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="map-units" className="text-sm font-semibold text-ink">Units</label>
              <input id="map-units" type="number" min={0} max={99} step={0.5} className={`${INPUT} mt-1`}
                placeholder={String(subjects.find((s) => s.id === form.subjectId)?.defaultUnits ?? '')}
                value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
              <p className="mt-1 text-xs text-muted">Blank uses the subject’s default units.</p>
              {errors.units && <p className="mt-1 text-xs text-red-700">{errors.units[0]}</p>}
            </div>
            <div>
              <label htmlFor="map-prereq" className="text-sm font-semibold text-ink">Prerequisite</label>
              <select id="map-prereq" className={`${INPUT} mt-1`} value={form.prerequisiteSubjectId} onChange={(e) => setForm({ ...form, prerequisiteSubjectId: e.target.value })}>
                <option value="">None</option>
                {entries.filter((e) => e.subject.id !== form.subjectId).map((e) => <option key={e.id} value={e.subject.id}>{e.subject.code} ({yearLevelLabel(e.yearLevel)}, {SEMESTER_LABELS[e.semester]})</option>)}
              </select>
              {errors.prerequisiteSubjectId && <p className="mt-1 text-xs text-red-700">{errors.prerequisiteSubjectId[0]}</p>}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
            Required subject <span className="text-muted">(untick for an elective)</span>
          </label>
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
    </div>
  );
}
