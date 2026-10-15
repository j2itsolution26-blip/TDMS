import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { SUBJECT_TYPES, SUBJECT_TYPE_LABELS, type SubjectType } from '@shared/types/domain';
import { hourFields } from '@shared/lib/subjects';
import { SEMESTER_LABELS, YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import type { MapEntry, MapProgram } from './CurriculumMap';

/**
 * New Subject / Edit Subject — a Fluent-style dialog.
 *
 *   SUBJECT                 code · title / type · units · status   (required)
 *   CURRICULUM PLACEMENT    program · year level · semester, required/elective,
 *                           prerequisites (new subjects only; prefilled from
 *                           the term being viewed)
 *   OPTIONAL DETAILS        hours (those the type uses) · total · class size,
 *                           description, remarks
 *
 * The server creates the subject and its curriculum entry in one transaction
 * and re-checks everything (unique code, curriculum, prerequisites in that
 * curriculum and never circular). The form checks the required fields first
 * so most mistakes are caught without a round trip; nothing typed is lost
 * when a save is refused. Total contact hours is lecture + laboratory hours,
 * the two the data model stores.
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

// Design tokens (the brief's): primary #07865B, dark #08634B, mint #F2FBF7,
// text #18313A, secondary #667C7A, input border #D4E0E8, section border #C8EEDD.
const FIELD = 'mt-1.5 block h-11 w-full rounded-lg border border-[#D4E0E8] bg-white px-3 text-sm text-[#18313A] placeholder:text-[#9AAAA8] transition focus:border-[#07865B] focus:outline-none focus:ring-2 focus:ring-[#07865B]/20 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-100 disabled:bg-slate-50';
// bg-none: the forms plugin draws its own arrow; this select has the chevron icon instead.
const SELECT = `${FIELD} appearance-none bg-none pr-9`;
const LABEL = 'text-[13px] font-semibold text-[#18313A]';
const SECTION = 'text-[11px] font-bold uppercase tracking-[0.08em] text-[#667C7A]';
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#07865B] focus-visible:ring-offset-2';
// The three most used first; practical, capstone and OJT stay available.
const TYPE_ORDER: SubjectType[] = ['lecture', 'laboratory', 'lecture_laboratory', ...SUBJECT_TYPES.filter((t) => !['lecture', 'laboratory', 'lecture_laboratory'].includes(t))];

function Req() {
  return <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>;
}
function Err({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? <p id={id} className="mt-1 text-xs font-medium text-red-700">{messages[0]}</p> : null;
}
function Select({ id, value, onChange, children, invalid, describedBy }: { id: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode; invalid?: boolean; describedBy?: string }) {
  return (
    <div className="relative">
      <select id={id} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 mt-[3px] h-4 w-4 -translate-y-1/2 text-[#667C7A]" aria-hidden="true" />
    </div>
  );
}

type Form = {
  code: string; title: string; subjectType: string; defaultUnits: string; isActive: boolean;
  description: string; lectureHours: string; labHours: string; recommendedClassSize: string; remarks: string;
  programId: string; yearLevel: number; semester: number; isRequired: boolean; prerequisites: string[];
};

/** The checks the server makes too, run first so most mistakes need no round trip. */
function check(f: Form, creating: boolean, hours: { lecture: boolean; lab: boolean }): Record<string, string[]> {
  const e: Record<string, string[]> = {};
  if (!f.code.trim()) e.code = ['Enter the subject code.'];
  else if (f.code.trim().length > 20) e.code = ['At most 20 characters.'];
  if (!f.title.trim()) e.title = ['Enter the subject title.'];
  const units = Number(f.defaultUnits);
  if (f.defaultUnits.trim() === '') e.defaultUnits = ['Enter the units.'];
  else if (!Number.isFinite(units) || units < 0 || units > 99) e.defaultUnits = ['Units must be between 0 and 99.'];
  const hour = (v: string, key: string) => {
    if (v === '') return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 60) e[key] = ['Between 0 and 60 hours a week.'];
  };
  if (hours.lecture) hour(f.lectureHours, 'lectureHours');
  if (hours.lab) hour(f.labHours, 'labHours');
  if (f.recommendedClassSize !== '') {
    const n = Number(f.recommendedClassSize);
    if (!Number.isInteger(n) || n < 1 || n > 200) e.recommendedClassSize = ['A whole number from 1 to 200.'];
  }
  if (creating && !f.programId) e.programId = ['Choose the program.'];
  return e;
}

export default function SubjectForm({ open, editing, programs, scope, onClose, onSaved }: {
  open: boolean;
  /** The subject being edited, or null for a new one. */
  editing: SubjectDetails | null;
  programs: MapProgram[];
  /** Where a new subject goes by default: the term being viewed. */
  scope: { programId: string | null; yearLevel: number; semester: number };
  onClose: () => void;
  /** After a save; a new subject also says where it went, so the map can show it. */
  onSaved: (message: string, placed?: { programId: string; yearLevel: number; semester: number }) => void;
}) {
  const blank = (): Form => ({
    code: '', title: '', subjectType: 'lecture', defaultUnits: '', isActive: true,
    description: '', lectureHours: '', labHours: '', recommendedClassSize: '', remarks: '',
    programId: (programs.find((p) => p.id === scope.programId && p.curriculum) ?? programs.find((p) => p.curriculum))?.id ?? '',
    yearLevel: scope.yearLevel, semester: scope.semester === 3 ? 3 : scope.semester, isRequired: true, prerequisites: [],
  });
  const [f, setF] = useState<Form>(blank);
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

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k as string]) setErrors((x) => { const n = { ...x }; delete n[k as string]; return n; });
  };
  const hours = hourFields(f.subjectType);
  const total = (hours.lecture && f.lectureHours !== '' ? Number(f.lectureHours) : 0) + (hours.lab && f.labHours !== '' ? Number(f.labHours) : 0);
  const program = programs.find((p) => p.id === f.programId) ?? null;
  // Summer only when the program's curriculum uses it (or it is the term in view).
  const semesters = [1, 2, ...((program?.curriculum?.entries.some((e) => e.semester === 3) || f.semester === 3) ? [3] : [])];
  // Prerequisites: subjects of this curriculum taught in an earlier term.
  const candidates = useMemo<MapEntry[]>(() => (program?.curriculum?.entries ?? [])
    .filter((e) => e.yearLevel < f.yearLevel || (e.yearLevel === f.yearLevel && e.semester < f.semester))
    .sort((a, b) => a.yearLevel - b.yearLevel || a.semester - b.semester || a.subject.code.localeCompare(b.subject.code)), [program, f.yearLevel, f.semester]);
  // A term change can leave prerequisites that are no longer earlier: drop them.
  useEffect(() => {
    const allowed = new Set(candidates.map((c) => c.subject.id));
    if (f.prerequisites.some((p) => !allowed.has(p))) setF((x) => ({ ...x, prerequisites: x.prerequisites.filter((p) => allowed.has(p)) }));
  }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = candidates.filter((c) => f.prerequisites.includes(c.subject.id));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = check(f, !editing, hours);
    if (Object.keys(found).length) {
      setErrors(found);
      setProblem('Check the highlighted fields.');
      document.getElementById(`sf-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setBusy(true); setErrors({}); setProblem(null);
    const num = (v: string) => (v === '' ? null : Number(v));
    const body = {
      code: f.code.trim(), title: f.title.trim(), subjectType: f.subjectType, defaultUnits: f.defaultUnits, isActive: f.isActive,
      description: f.description.trim() || null,
      lectureHours: hours.lecture ? num(f.lectureHours) : null,
      labHours: hours.lab ? num(f.labHours) : null,
      recommendedClassSize: num(f.recommendedClassSize),
      remarks: f.remarks.trim() || null,
      ...(editing ? {} : { placement: { programId: f.programId, yearLevel: f.yearLevel, semester: f.semester, isRequired: f.isRequired, prerequisiteSubjectIds: f.prerequisites } }),
    };
    const r = editing ? await api.put(`/api/v1/subjects/${editing.id}`, body) : await api.post('/api/v1/subjects', body);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors ?? {});
      setProblem(r.errors && Object.keys(r.errors).length ? Object.values(r.errors)[0]?.[0] ?? r.message : r.message);
      const field = Object.keys(r.errors ?? {})[0];
      if (field) document.getElementById(`sf-${field === 'prerequisiteSubjectIds' ? 'prereq' : field}`)?.focus();
      return;
    }
    onSaved(editing
      ? `${body.code} was updated.`
      : `${body.code} was added to ${program?.code ?? 'the program'} · ${yearLevelLabel(f.yearLevel)} · ${SEMESTER_LABELS[f.semester]}.`,
      editing ? undefined : { programId: f.programId, yearLevel: f.yearLevel, semester: f.semester });
  }

  const e = errors;
  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button type="button" onClick={onClose} disabled={busy}
        className={`inline-flex h-11 items-center justify-center rounded-lg border border-[#D4E0E8] bg-white px-5 text-sm font-semibold text-[#18313A] transition hover:bg-slate-50 disabled:opacity-60 ${RING}`}>
        Cancel
      </button>
      <button type="submit" form="subject-form" disabled={busy} aria-busy={busy}
        className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#07865B] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#08634B] disabled:cursor-not-allowed disabled:opacity-70 ${RING}`}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? 'Saving…' : 'Save Subject'}
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={editing ? 'Edit Subject' : 'New Subject'}
      subtitle={editing ? `${editing.code} · update the catalogue details.` : 'Add a subject to the catalogue and place it in a curriculum term.'}
      maxWidth="sm:max-w-[752px]"
      maxHeight="sm:max-h-[90vh]"
      appearance="fluent"
      animate
      footer={footer}
    >
      <form id="subject-form" onSubmit={save} className="space-y-6" noValidate>
        {problem && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}

        {/* SUBJECT */}
        <section aria-labelledby="sf-sec-subject" className="space-y-4">
          <h3 id="sf-sec-subject" className={SECTION}>Subject</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <label htmlFor="sf-code" className={LABEL}>Subject Code<Req /></label>
              <input ref={first} id="sf-code" className={FIELD} maxLength={20} required autoComplete="off" placeholder="e.g. PROG1"
                value={f.code} onChange={(ev) => set('code', ev.target.value)} aria-invalid={!!e.code || undefined} aria-describedby="sf-code-err" />
              <Err id="sf-code-err" messages={e.code} />
            </div>
            <div>
              <label htmlFor="sf-title" className={LABEL}>Subject Title<Req /></label>
              <input id="sf-title" className={FIELD} maxLength={255} required placeholder="e.g. Computer Programming 1"
                value={f.title} onChange={(ev) => set('title', ev.target.value)} aria-invalid={!!e.title || undefined} aria-describedby="sf-title-err" />
              <Err id="sf-title-err" messages={e.title} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="sf-subjectType" className={LABEL}>Subject Type<Req /></label>
              <Select id="sf-subjectType" value={f.subjectType} onChange={(v) => set('subjectType', v)} invalid={!!e.subjectType}>
                {TYPE_ORDER.map((t) => <option key={t} value={t}>{SUBJECT_TYPE_LABELS[t]}</option>)}
              </Select>
              <Err id="sf-type-err" messages={e.subjectType} />
            </div>
            <div>
              <label htmlFor="sf-defaultUnits" className={LABEL}>Units<Req /></label>
              <input id="sf-defaultUnits" type="number" inputMode="decimal" step="0.5" min={0} max={99} required className={FIELD} placeholder="e.g. 3"
                value={f.defaultUnits} onChange={(ev) => set('defaultUnits', ev.target.value)} aria-invalid={!!e.defaultUnits || undefined} aria-describedby="sf-units-err" />
              <Err id="sf-units-err" messages={e.defaultUnits} />
            </div>
            <div>
              <label htmlFor="sf-status" className={LABEL}>Status<Req /></label>
              <Select id="sf-status" value={f.isActive ? 'active' : 'inactive'} onChange={(v) => set('isActive', v === 'active')}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
        </section>

        {/* CURRICULUM PLACEMENT */}
        {!editing && (
          <section aria-labelledby="sf-sec-placement" className="space-y-4 rounded-xl border border-[#C8EEDD] bg-[#F2FBF7] p-4 sm:p-5">
            <h3 id="sf-sec-placement" className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#08634B]">Curriculum placement</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="sf-programId" className={LABEL}>Program<Req /></label>
                <Select id="sf-programId" value={f.programId} onChange={(v) => setF((x) => ({ ...x, programId: v, prerequisites: [] }))} invalid={!!e.programId} describedBy="sf-program-err">
                  {programs.length === 0 && <option value="">No programs yet</option>}
                  {programs.map((p) => <option key={p.id} value={p.id} disabled={!p.curriculum}>{p.code} — {p.name}{p.curriculum ? '' : ' (no curriculum)'}</option>)}
                </Select>
                <Err id="sf-program-err" messages={e.programId} />
              </div>
              <div>
                <label htmlFor="sf-yearLevel" className={LABEL}>Year Level<Req /></label>
                <Select id="sf-yearLevel" value={f.yearLevel} onChange={(v) => set('yearLevel', Number(v))}>
                  {YEAR_LEVELS.map((y) => <option key={y} value={y}>{yearLevelLabel(y)}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="sf-semester" className={LABEL}>Semester<Req /></label>
                <Select id="sf-semester" value={f.semester} onChange={(v) => set('semester', Number(v))}>
                  {semesters.map((s) => <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>)}
                </Select>
              </div>
            </div>
            <p className="text-xs text-[#667C7A]" aria-live="polite">
              {program?.curriculum
                ? <>Goes into {program.code}’s current curriculum, <b className="font-semibold text-[#18313A]">{program.curriculum.version}</b>, effective from school year {program.curriculum.effective.replace('-', '–')}.</>
                : program ? <>{program.code} has no active curriculum yet — create one on the program’s page first.</> : 'Choose a program.'}
            </p>
            <label className="flex items-center gap-2.5 text-sm text-[#18313A]">
              <input type="checkbox" className={`h-4 w-4 rounded border-[#D4E0E8] text-[#07865B] focus:ring-[#07865B] ${RING}`} checked={f.isRequired} onChange={(ev) => set('isRequired', ev.target.checked)} />
              <span className="font-semibold">Required subject</span> <span className="text-[#667C7A]">(untick for an elective)</span>
            </label>
            <details className="group rounded-lg border border-[#D4E0E8] bg-white">
              <summary id="sf-prereq" className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm ${RING}`}>
                <span><span className="font-semibold text-[#18313A]">Prerequisite subjects</span> <span className="text-[#667C7A]">(optional{chosen.length ? ` · ${chosen.length} selected` : ''})</span></span>
                <ChevronDown className="h-4 w-4 text-[#667C7A] transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-[#D4E0E8] px-3 py-3">
                {candidates.length === 0 ? (
                  <p className="text-xs text-[#667C7A]">No subjects in an earlier term of this curriculum yet — prerequisites come from earlier terms.</p>
                ) : (
                  <ul className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2" aria-label="Earlier subjects in this curriculum">
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <label className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[#F2FBF7]">
                          <input type="checkbox" className="h-4 w-4 rounded border-[#D4E0E8] text-[#07865B] focus:ring-[#07865B]" checked={f.prerequisites.includes(c.subject.id)}
                            onChange={(ev) => set('prerequisites', ev.target.checked ? [...f.prerequisites, c.subject.id] : f.prerequisites.filter((x) => x !== c.subject.id))} />
                          <span><b className="text-[#18313A]">{c.subject.code}</b> <span className="text-[#667C7A]">{yearLevelLabel(c.yearLevel)}, {SEMESTER_LABELS[c.semester]}</span></span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
            {chosen.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Selected prerequisites">
                {chosen.map((c) => (
                  <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1 text-xs font-semibold text-[#08634B] ring-1 ring-inset ring-[#C8EEDD]">
                    {c.subject.code}
                    <button type="button" className={`rounded-full p-0.5 text-[#667C7A] hover:bg-[#F2FBF7] hover:text-[#18313A] ${RING}`} aria-label={`Remove prerequisite ${c.subject.code}`}
                      onClick={() => set('prerequisites', f.prerequisites.filter((x) => x !== c.subject.id))}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Err id="sf-prereq-err" messages={e.prerequisiteSubjectIds} />
          </section>
        )}

        {/* OPTIONAL DETAILS */}
        <section aria-labelledby="sf-sec-optional" className="space-y-4">
          <h3 id="sf-sec-optional" className={SECTION}>Optional details</h3>
          <div className={`grid grid-cols-1 gap-4 ${hours.lecture && hours.lab ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {hours.lecture && (
              <div>
                <label htmlFor="sf-lectureHours" className={LABEL}>Lecture Hours</label>
                <input id="sf-lectureHours" type="number" inputMode="decimal" step="0.5" min={0} max={60} className={FIELD} placeholder="per week"
                  value={f.lectureHours} onChange={(ev) => set('lectureHours', ev.target.value)} aria-invalid={!!e.lectureHours || undefined} aria-describedby="sf-lec-err" />
                <Err id="sf-lec-err" messages={e.lectureHours} />
              </div>
            )}
            {hours.lab && (
              <div>
                <label htmlFor="sf-labHours" className={LABEL}>Laboratory Hours</label>
                <input id="sf-labHours" type="number" inputMode="decimal" step="0.5" min={0} max={60} className={FIELD} placeholder="per week"
                  value={f.labHours} onChange={(ev) => set('labHours', ev.target.value)} aria-invalid={!!e.labHours || undefined} aria-describedby="sf-lab-err" />
                <Err id="sf-lab-err" messages={e.labHours} />
              </div>
            )}
            <div>
              <label htmlFor="sf-total" className={LABEL}>Total Contact Hours</label>
              <input id="sf-total" readOnly tabIndex={-1} className={`${FIELD} cursor-default bg-slate-50 text-[#667C7A]`} value={total ? `${total} per week` : '—'} aria-describedby="sf-total-help" />
              <p id="sf-total-help" className="mt-1 text-xs text-[#667C7A]">Lecture + laboratory hours.</p>
            </div>
            <div>
              <label htmlFor="sf-recommendedClassSize" className={LABEL}>Recommended Class Size</label>
              <input id="sf-recommendedClassSize" type="number" inputMode="numeric" min={1} max={200} step={1} className={FIELD} placeholder="e.g. 25"
                value={f.recommendedClassSize} onChange={(ev) => set('recommendedClassSize', ev.target.value)} aria-invalid={!!e.recommendedClassSize || undefined} aria-describedby="sf-size-err" />
              <Err id="sf-size-err" messages={e.recommendedClassSize} />
            </div>
          </div>
          <div>
            <label htmlFor="sf-description" className={LABEL}>Description</label>
            <textarea id="sf-description" rows={3} className={`${FIELD} h-auto py-2.5`} placeholder="What the subject covers"
              value={f.description} onChange={(ev) => set('description', ev.target.value)} />
          </div>
          <div>
            <label htmlFor="sf-remarks" className={LABEL}>Remarks</label>
            <textarea id="sf-remarks" rows={2} className={`${FIELD} h-auto py-2.5`}
              value={f.remarks} onChange={(ev) => set('remarks', ev.target.value)} />
          </div>
        </section>
      </form>
    </Modal>
  );
}
