import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { SUBJECT_TYPES, SUBJECT_TYPE_LABELS, type SubjectType } from '@shared/types/domain';
import { hourFields } from '@shared/lib/subjects';
import { SEMESTER_LABELS, YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import { FOCUS } from '@/components/teaching/kit';
import type { MapProgram } from './CurriculumMap';

/**
 * New Subject / Edit Subject.
 *
 * Required: code, title, type, units, status — and, for a new subject, its
 * place in a curriculum (program, year level, semester), prefilled from the
 * term being viewed. The server creates the subject and its mapping in one
 * transaction. Optional: description, contact hours (only the kinds that
 * apply to the type), recommended class size, prerequisites, remarks.
 *
 * Editing changes the catalogue entry only; once a class of the subject has
 * finalized grades the server refuses a code or units change and says why.
 */

export interface SubjectDetails {
  id: string;
  code: string;
  title: string;
  description: string | null;
  subjectType: string;
  defaultUnits: number;
  lectureHours: number | null;
  labHours: number | null;
  recommendedClassSize: number | null;
  remarks: string | null;
  isActive: boolean;
}

const INPUT = 'mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 aria-[invalid=true]:border-red-400';
const LABEL = 'text-sm font-semibold text-ink';
const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60 ${FOCUS}`;
const BTN_SECONDARY = `inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 ${FOCUS}`;
// The three the brief names first; practical, capstone and OJT stay available.
const TYPE_ORDER: SubjectType[] = ['lecture', 'laboratory', 'lecture_laboratory', ...SUBJECT_TYPES.filter((t) => !['lecture', 'laboratory', 'lecture_laboratory'].includes(t))];

function Err({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? <p id={id} className="mt-1 text-xs text-red-700">{messages[0]}</p> : null;
}

export default function SubjectForm({ open, editing, programs, scope, onClose, onSaved }: {
  open: boolean;
  /** The subject being edited, or null for a new one. */
  editing: SubjectDetails | null;
  programs: MapProgram[];
  /** Where a new subject goes by default: the term being viewed. */
  scope: { programId: string | null; yearLevel: number; semester: number };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const blank = () => ({
    code: '', title: '', subjectType: 'lecture' as string, defaultUnits: '', isActive: true,
    description: '', lectureHours: '', labHours: '', recommendedClassSize: '', remarks: '',
    programId: scope.programId ?? programs[0]?.id ?? '', yearLevel: scope.yearLevel, semester: scope.semester, isRequired: true, prerequisites: [] as string[],
  });
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({}); setProblem(null); setBusy(false);
    setF(editing ? {
      ...blank(),
      code: editing.code, title: editing.title, subjectType: editing.subjectType, defaultUnits: String(editing.defaultUnits), isActive: editing.isActive,
      description: editing.description ?? '', lectureHours: editing.lectureHours?.toString() ?? '', labHours: editing.labHours?.toString() ?? '',
      recommendedClassSize: editing.recommendedClassSize?.toString() ?? '', remarks: editing.remarks ?? '',
    } : blank());
    requestAnimationFrame(() => first.current?.focus());
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours = hourFields(f.subjectType);
  const total = (hours.lecture && f.lectureHours !== '' ? Number(f.lectureHours) : 0) + (hours.lab && f.labHours !== '' ? Number(f.labHours) : 0);
  const program = programs.find((p) => p.id === f.programId) ?? null;
  // Prerequisites: subjects already in the chosen program's curriculum.
  const candidates = useMemo(() => (program?.curriculum?.entries ?? []).slice().sort((a, b) => a.yearLevel - b.yearLevel || a.semester - b.semester || a.subject.code.localeCompare(b.subject.code)), [program]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({}); setProblem(null);
    const num = (v: string) => (v === '' ? null : Number(v));
    const body = {
      code: f.code, title: f.title, subjectType: f.subjectType, defaultUnits: f.defaultUnits, isActive: f.isActive,
      description: f.description || null,
      lectureHours: hours.lecture ? num(f.lectureHours) : null,
      labHours: hours.lab ? num(f.labHours) : null,
      recommendedClassSize: num(f.recommendedClassSize),
      remarks: f.remarks || null,
      ...(editing ? {} : { placement: { programId: f.programId, yearLevel: f.yearLevel, semester: f.semester, isRequired: f.isRequired, prerequisiteSubjectIds: f.prerequisites } }),
    };
    const r = editing ? await api.put(`/api/v1/subjects/${editing.id}`, body) : await api.post('/api/v1/subjects', body);
    setBusy(false);
    if (!r.ok) {
      const errs = r.errors ?? {};
      // Placement errors come back under their own names; show them by the placement fields.
      setErrors(errs);
      setProblem(Object.keys(errs).length ? 'Check the highlighted fields.' : r.message);
      return;
    }
    onSaved(editing
      ? `${f.code.toUpperCase()} was updated.`
      : `${f.code} was added to ${program?.code ?? 'the program'} · ${yearLevelLabel(f.yearLevel)} · ${SEMESTER_LABELS[f.semester]}.`);
  }

  const e = errors;
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={editing ? 'Edit Subject' : 'New Subject'} subtitle={editing ? `${editing.code} · catalogue details` : 'Add a subject to the catalogue and place it in a curriculum term.'} maxWidth="sm:max-w-2xl">
      <form onSubmit={save} className="space-y-5" noValidate>
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Subject</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="sf-code" className={LABEL}>Subject Code <span className="text-red-600" aria-hidden="true">*</span></label>
              <input ref={first} id="sf-code" className={INPUT} maxLength={20} required value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value })} aria-invalid={!!e.code} aria-describedby="sf-code-err" />
              <Err id="sf-code-err" messages={e.code} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="sf-title" className={LABEL}>Subject Title <span className="text-red-600" aria-hidden="true">*</span></label>
              <input id="sf-title" className={INPUT} maxLength={255} required value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} aria-invalid={!!e.title} aria-describedby="sf-title-err" />
              <Err id="sf-title-err" messages={e.title} />
            </div>
            <div>
              <label htmlFor="sf-type" className={LABEL}>Subject Type <span className="text-red-600" aria-hidden="true">*</span></label>
              <select id="sf-type" className={INPUT} value={f.subjectType} onChange={(ev) => setF({ ...f, subjectType: ev.target.value })}>
                {TYPE_ORDER.map((t) => <option key={t} value={t}>{SUBJECT_TYPE_LABELS[t]}</option>)}
              </select>
              <Err id="sf-type-err" messages={e.subjectType} />
            </div>
            <div>
              <label htmlFor="sf-units" className={LABEL}>Units <span className="text-red-600" aria-hidden="true">*</span></label>
              <input id="sf-units" type="number" step="0.5" min={0} max={99} required className={INPUT} value={f.defaultUnits} onChange={(ev) => setF({ ...f, defaultUnits: ev.target.value })} aria-invalid={!!e.defaultUnits} aria-describedby="sf-units-err" />
              <Err id="sf-units-err" messages={e.defaultUnits} />
            </div>
            <div>
              <label htmlFor="sf-status" className={LABEL}>Status <span className="text-red-600" aria-hidden="true">*</span></label>
              <select id="sf-status" className={INPUT} value={f.isActive ? 'active' : 'inactive'} onChange={(ev) => setF({ ...f, isActive: ev.target.value === 'active' })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </fieldset>

        {!editing && (
          <fieldset className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-emerald-800">Curriculum placement</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="sf-program" className={LABEL}>Program <span className="text-red-600" aria-hidden="true">*</span></label>
                <select id="sf-program" className={INPUT} value={f.programId} onChange={(ev) => setF({ ...f, programId: ev.target.value, prerequisites: [] })} aria-invalid={!!e.programId} aria-describedby="sf-program-err">
                  {programs.map((p) => <option key={p.id} value={p.id} disabled={!p.curriculum}>{p.code} — {p.name}{p.curriculum ? '' : ' (no curriculum)'}</option>)}
                </select>
                <Err id="sf-program-err" messages={e.programId} />
              </div>
              <div>
                <label htmlFor="sf-year" className={LABEL}>Year Level <span className="text-red-600" aria-hidden="true">*</span></label>
                <select id="sf-year" className={INPUT} value={f.yearLevel} onChange={(ev) => setF({ ...f, yearLevel: Number(ev.target.value) })}>
                  {YEAR_LEVELS.map((y) => <option key={y} value={y}>{yearLevelLabel(y)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="sf-sem" className={LABEL}>Semester <span className="text-red-600" aria-hidden="true">*</span></label>
                <select id="sf-sem" className={INPUT} value={f.semester} onChange={(ev) => setF({ ...f, semester: Number(ev.target.value) })}>
                  {[1, 2, 3].map((s) => <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
            {program?.curriculum && <p className="text-xs text-muted">Goes into {program.code}’s current curriculum, {program.curriculum.version}.</p>}
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" checked={f.isRequired} onChange={(ev) => setF({ ...f, isRequired: ev.target.checked })} />
              Required subject <span className="text-muted">(untick for an elective)</span>
            </label>
            {candidates.length > 0 && (
              <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <summary className={`cursor-pointer text-sm font-semibold text-ink ${FOCUS}`}>Prerequisite subjects <span className="font-normal text-muted">(optional{f.prerequisites.length ? ` · ${f.prerequisites.length} chosen` : ''})</span></summary>
                <ul className="mt-2 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                        <input type="checkbox" className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" checked={f.prerequisites.includes(c.subject.id)}
                          onChange={(ev) => setF({ ...f, prerequisites: ev.target.checked ? [...f.prerequisites, c.subject.id] : f.prerequisites.filter((x) => x !== c.subject.id) })} />
                        <span><b>{c.subject.code}</b> <span className="text-muted">{yearLevelLabel(c.yearLevel)}, {SEMESTER_LABELS[c.semester]}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Err id="sf-prereq-err" messages={e.prerequisiteSubjectIds} />
              </details>
            )}
          </fieldset>
        )}

        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Optional details</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {hours.lecture && (
              <div>
                <label htmlFor="sf-lec" className={LABEL}>Lecture hours</label>
                <input id="sf-lec" type="number" step="0.5" min={0} max={60} className={INPUT} value={f.lectureHours} onChange={(ev) => setF({ ...f, lectureHours: ev.target.value })} aria-describedby="sf-lec-err" />
                <Err id="sf-lec-err" messages={e.lectureHours} />
              </div>
            )}
            {hours.lab && (
              <div>
                <label htmlFor="sf-lab" className={LABEL}>Laboratory hours</label>
                <input id="sf-lab" type="number" step="0.5" min={0} max={60} className={INPUT} value={f.labHours} onChange={(ev) => setF({ ...f, labHours: ev.target.value })} aria-describedby="sf-lab-err" />
                <Err id="sf-lab-err" messages={e.labHours} />
              </div>
            )}
            <div>
              <p className={LABEL}>Total contact hours</p>
              <p className="mt-1 flex h-10 items-center rounded-lg bg-slate-50 px-3 text-sm tabular-nums text-ink ring-1 ring-inset ring-slate-200" aria-live="polite">{total ? `${total} per week` : '—'}</p>
            </div>
            <div>
              <label htmlFor="sf-size" className={LABEL}>Recommended class size</label>
              <input id="sf-size" type="number" min={1} max={200} className={INPUT} value={f.recommendedClassSize} onChange={(ev) => setF({ ...f, recommendedClassSize: ev.target.value })} aria-describedby="sf-size-err" />
              <Err id="sf-size-err" messages={e.recommendedClassSize} />
            </div>
          </div>
          <div>
            <label htmlFor="sf-desc" className={LABEL}>Description</label>
            <textarea id="sf-desc" rows={2} className={`${INPUT} h-auto py-2`} value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} />
          </div>
          <div>
            <label htmlFor="sf-remarks" className={LABEL}>Remarks</label>
            <textarea id="sf-remarks" rows={2} className={`${INPUT} h-auto py-2`} value={f.remarks} onChange={(ev) => setF({ ...f, remarks: ev.target.value })} />
          </div>
        </fieldset>

        {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create subject'}</button>
        </div>
      </form>
    </Modal>
  );
}
