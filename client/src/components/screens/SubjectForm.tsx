import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BookOpen, ChevronDown, Info, Layers, Loader2, Save, X } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { SUBJECT_TYPES, SUBJECT_TYPE_LABELS, type SubjectType } from '@shared/types/domain';
import { hourFields } from '@shared/lib/subjects';
import { SEMESTER_LABELS, YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import type { MapEntry, MapProgram } from './CurriculumMap';

/**
 * Create Subject / Edit Subject.
 *
 * Two steps on one scrolling page, as in the reference design:
 *
 *   1  Subject details        code, title, units, type, description, active
 *                             (+ "More details": hours, class size, remarks)
 *   2  Curriculum placement   optional — program (or "map later"), year level,
 *                             semester, required/elective, prerequisites
 *
 * The step indicator follows where you are and jumps there when clicked. A
 * subject is one catalogue record; placing it creates its curriculum entry
 * in the same transaction (server-side), and skipping placement saves the
 * catalogue entry only. Save & Map Another keeps the placement and clears
 * the subject fields for the next entry. Every rule is re-checked by the
 * server; the form checks first so most mistakes need no round trip.
 * Total contact hours is lecture + laboratory hours, the two the data model
 * stores. Editing changes the catalogue entry only.
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

// The reference's palette: primary #087F5B, text #172B3A, secondary #647A73, pale green #E7F7F0.
const FIELD = 'mt-1.5 block h-10 w-full rounded-lg border border-[#D6E2DD] bg-white px-3 text-sm text-[#172B3A] placeholder:text-[#9AABA5] transition focus:border-[#087F5B] focus:outline-none focus:ring-2 focus:ring-[#087F5B]/20 aria-[invalid=true]:border-red-400';
// bg-none: the forms plugin draws its own arrow; these selects use the chevron icon.
const SELECT = `${FIELD} appearance-none bg-none pr-9`;
const LABEL = 'text-[13px] font-semibold text-[#172B3A]';
const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#087F5B] focus-visible:ring-offset-2';
const MUTED = 'text-[#647A73]';
const DESCRIPTION_MAX = 500;
const TYPE_ORDER: SubjectType[] = ['lecture', 'laboratory', 'lecture_laboratory', ...SUBJECT_TYPES.filter((t) => !['lecture', 'laboratory', 'lecture_laboratory'].includes(t))];
const MAP_LATER = '';

function Req() {
  return <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>;
}
function Err({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? <p id={id} className="mt-1 text-xs font-medium text-red-700">{messages[0]}</p> : null;
}
function Select({ id, value, onChange, children, invalid, describedBy }: { id: string; value: string | number; onChange: (v: string) => void; children: ReactNode; invalid?: boolean; describedBy?: string }) {
  return (
    <div className="relative">
      <select id={id} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 mt-[3px] h-4 w-4 -translate-y-1/2 text-[#647A73]" aria-hidden="true" />
    </div>
  );
}
function SectionHead({ icon: Icon, title, hint }: { icon: typeof BookOpen; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E7F7F0] text-[#087F5B]" aria-hidden="true"><Icon className="h-[18px] w-[18px]" /></span>
      <div>
        <h3 className="text-[15px] font-semibold text-[#172B3A]">{title}</h3>
        <p className={`text-xs ${MUTED}`}>{hint}</p>
      </div>
    </div>
  );
}

/** A row of mutually exclusive buttons, as a radio group (arrow keys move and choose). */
function Segmented<T extends number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const at = options.findIndex((o) => o.value === value);
    const next = options[(at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length]!;
    onChange(next.value);
    const group = e.currentTarget;
    requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus());
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={keys} className="mt-1.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} data-value={o.value} tabIndex={on ? 0 : -1} disabled={disabled} onClick={() => onChange(o.value)}
            className={`h-10 rounded-lg border px-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${RING} ${on ? 'border-[#087F5B] bg-[#087F5B] text-white shadow-sm' : 'border-[#D6E2DD] bg-white text-[#172B3A] hover:border-[#087F5B]/50 hover:bg-[#F4FBF8]'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type Form = {
  code: string; title: string; subjectType: string; defaultUnits: string; isActive: boolean;
  description: string; lectureHours: string; labHours: string; recommendedClassSize: string; remarks: string;
  programId: string; yearLevel: number; semester: number; isRequired: boolean; prerequisites: string[];
};

/** The checks the server makes too, run first. */
function check(f: Form, hours: { lecture: boolean; lab: boolean }): Record<string, string[]> {
  const e: Record<string, string[]> = {};
  if (!f.code.trim()) e.code = ['Enter the subject code.'];
  else if (f.code.trim().length > 20) e.code = ['At most 20 characters.'];
  if (!f.title.trim()) e.title = ['Enter the subject title.'];
  const units = Number(f.defaultUnits);
  if (f.defaultUnits.trim() === '') e.defaultUnits = ['Enter the units.'];
  else if (!Number.isFinite(units) || units <= 0) e.defaultUnits = ['Units must be more than 0.'];
  else if (units > 99) e.defaultUnits = ['At most 99 units.'];
  if (f.description.length > DESCRIPTION_MAX) e.description = [`At most ${DESCRIPTION_MAX} characters.`];
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
  /**
   * After a save. A placed subject says where it went (so the map can show
   * it); keepOpen is true for Save & Map Another.
   */
  onSaved: (message: string, placed?: { programId: string; yearLevel: number; semester: number }, keepOpen?: boolean) => void;
}) {
  const subjectFields = { code: '', title: '', subjectType: 'lecture', defaultUnits: '', isActive: true, description: '', lectureHours: '', labHours: '', recommendedClassSize: '', remarks: '', prerequisites: [] as string[] };
  const blank = (): Form => ({
    ...subjectFields,
    programId: programs.find((p) => p.id === scope.programId && p.curriculum)?.id ?? programs.find((p) => p.curriculum)?.id ?? MAP_LATER,
    yearLevel: scope.yearLevel, semester: scope.semester, isRequired: true,
  });
  const [f, setF] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<false | 'close' | 'another'>(false);
  const [more, setMore] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const first = useRef<HTMLInputElement>(null);
  const placementRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({}); setProblem(null); setSaved(null); setBusy(false); setStep(1);
    if (editing) {
      setF({
        ...blank(),
        code: editing.code, title: editing.title, subjectType: editing.subjectType, defaultUnits: String(editing.defaultUnits), isActive: editing.isActive,
        description: editing.description ?? '', lectureHours: editing.lectureHours?.toString() ?? '', labHours: editing.labHours?.toString() ?? '',
        recommendedClassSize: editing.recommendedClassSize?.toString() ?? '', remarks: editing.remarks ?? '',
      });
      setMore(Boolean(editing.lectureHours ?? editing.labHours ?? editing.recommendedClassSize ?? editing.remarks));
    } else {
      setF(blank());
      setMore(false);
    }
    requestAnimationFrame(() => first.current?.focus());
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // The step indicator follows the scroll position and the focus.
  useEffect(() => {
    if (!open || editing) return;
    const body = formRef.current?.parentElement;
    if (!body) return;
    const update = () => {
      const section = placementRef.current;
      if (!section) return;
      const inView = section.getBoundingClientRect().top < body.getBoundingClientRect().top + body.clientHeight * 0.55;
      setStep(inView || section.contains(document.activeElement) ? 2 : 1);
    };
    body.addEventListener('scroll', update, { passive: true });
    document.addEventListener('focusin', update);
    update();
    return () => { body.removeEventListener('scroll', update); document.removeEventListener('focusin', update); };
  }, [open, editing]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setSaved(null);
    if (errors[k as string]) setErrors((x) => { const n = { ...x }; delete n[k as string]; return n; });
  };
  const hours = hourFields(f.subjectType);
  const total = (hours.lecture && f.lectureHours !== '' ? Number(f.lectureHours) : 0) + (hours.lab && f.labHours !== '' ? Number(f.labHours) : 0);
  const placing = !editing && f.programId !== MAP_LATER;
  const program = programs.find((p) => p.id === f.programId) ?? null;
  const semesters = [1, 2, ...((program?.curriculum?.entries.some((e) => e.semester === 3) || f.semester === 3) ? [3] : [])];
  // Prerequisites: this curriculum's subjects in an earlier term.
  const candidates = useMemo<MapEntry[]>(() => (program?.curriculum?.entries ?? [])
    .filter((e) => e.yearLevel < f.yearLevel || (e.yearLevel === f.yearLevel && e.semester < f.semester))
    .sort((a, b) => a.yearLevel - b.yearLevel || a.semester - b.semester || a.subject.code.localeCompare(b.subject.code)), [program, f.yearLevel, f.semester]);
  useEffect(() => {
    const allowed = new Set(candidates.map((c) => c.subject.id));
    if (f.prerequisites.some((p) => !allowed.has(p))) setF((x) => ({ ...x, prerequisites: x.prerequisites.filter((p) => allowed.has(p)) }));
  }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = candidates.filter((c) => f.prerequisites.includes(c.subject.id));

  function goTo(n: 1 | 2) {
    if (n === 1) { formRef.current?.parentElement?.scrollTo({ top: 0, behavior: 'smooth' }); first.current?.focus({ preventScroll: true }); }
    else {
      // Scroll the form body only — scrollIntoView would also move the dialog itself.
      const body = formRef.current?.parentElement;
      const section = placementRef.current;
      if (body && section) body.scrollTo({ top: section.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8, behavior: 'smooth' });
      document.getElementById('sf-programId')?.focus({ preventScroll: true });
    }
    setStep(n);
  }

  async function submit(mode: 'close' | 'another') {
    if (busy) return;
    const found = check(f, hours);
    if (Object.keys(found).length) {
      setErrors(found);
      setProblem('Check the highlighted fields.');
      const firstKey = Object.keys(found)[0]!;
      if (['lectureHours', 'labHours', 'recommendedClassSize'].includes(firstKey)) setMore(true);
      requestAnimationFrame(() => document.getElementById(`sf-${firstKey}`)?.focus());
      return;
    }
    setBusy(mode); setErrors({}); setProblem(null); setSaved(null);
    const num = (v: string) => (v === '' ? null : Number(v));
    const body = {
      code: f.code.trim(), title: f.title.trim(), subjectType: f.subjectType, defaultUnits: f.defaultUnits, isActive: f.isActive,
      description: f.description.trim() || null,
      lectureHours: hours.lecture ? num(f.lectureHours) : null,
      labHours: hours.lab ? num(f.labHours) : null,
      recommendedClassSize: num(f.recommendedClassSize),
      remarks: f.remarks.trim() || null,
      ...(placing ? { placement: { programId: f.programId, yearLevel: f.yearLevel, semester: f.semester, isRequired: f.isRequired, prerequisiteSubjectIds: f.prerequisites } } : {}),
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
    const where = placing ? ` to ${program?.code} · ${yearLevelLabel(f.yearLevel)} · ${SEMESTER_LABELS[f.semester]}` : ' to the catalogue — map it to a curriculum term when ready';
    const message = editing ? `${body.code} was updated.` : `${body.code} was added${where}.`;
    const placed = placing ? { programId: f.programId, yearLevel: f.yearLevel, semester: f.semester } : undefined;
    if (mode === 'another' && !editing) {
      // Keep the placement; clear the subject for the next entry.
      onSaved(message, placed, true);
      setF((x) => ({ ...x, ...subjectFields }));
      setSaved(`${message} Add the next one.`);
      formRef.current?.parentElement?.scrollTo({ top: 0 });
      requestAnimationFrame(() => first.current?.focus());
      return;
    }
    onSaved(message, placed);
  }

  const e = errors;
  const header = editing ? null : (
    <nav aria-label="Steps" className="mt-4">
      <ol className="grid grid-cols-2 gap-4">
        {([[1, 'Subject details'], [2, 'Curriculum placement']] as const).map(([n, label]) => {
          const on = step === n;
          const done = step > n;
          return (
            <li key={n}>
              <button type="button" onClick={() => goTo(n)} aria-current={on ? 'step' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-md text-left text-sm ${RING}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition ${on || done ? 'bg-[#087F5B] text-white' : 'bg-[#EEF2F1] text-[#647A73]'}`}>{n}</span>
                <span className={on ? 'font-semibold text-[#172B3A]' : MUTED}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#E8EEEC]" aria-hidden="true">
        <div className="h-full rounded-full bg-[#087F5B] transition-all duration-300" style={{ width: step === 2 ? '100%' : '50%' }} />
      </div>
    </nav>
  );

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={onClose} disabled={Boolean(busy)}
        className={`inline-flex h-10 items-center justify-center rounded-lg border border-[#D6E2DD] bg-white px-4 text-sm font-semibold text-[#172B3A] transition hover:bg-slate-50 disabled:opacity-60 ${RING}`}>
        Cancel
      </button>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
        {!editing && (
          <button type="button" onClick={() => submit('another')} disabled={Boolean(busy)} aria-busy={busy === 'another'}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#087F5B] transition hover:bg-[#E7F7F0] disabled:opacity-60 ${RING}`}>
            {busy === 'another' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save &amp; Map Another
          </button>
        )}
        <button type="submit" form="subject-form" disabled={Boolean(busy)} aria-busy={busy === 'close'}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#087F5B] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#076A4C] disabled:cursor-not-allowed disabled:opacity-70 ${RING}`}>
          {busy === 'close' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {busy === 'close' ? 'Saving…' : 'Save Subject'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={editing ? 'Edit Subject' : 'Create Subject'}
      subtitle={editing ? `${editing.code} · update this subject in the TDMS catalogue.` : 'Add a reusable subject to the TDMS catalogue'}
      icon={<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E7F7F0] text-[#087F5B]" aria-hidden="true"><BookOpen className="h-[22px] w-[22px]" /></span>}
      headerExtra={header}
      titleClassName="text-xl font-bold tracking-[-0.01em] text-[#172B3A]"
      maxWidth="sm:max-w-[640px]"
      appearance="fluent"
      animate
      trapFocus
      footer={footer}
    >
      <form id="subject-form" ref={formRef} onSubmit={(ev) => { ev.preventDefault(); void submit('close'); }} className="space-y-5" noValidate>
        {problem && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
        {saved && <p role="status" className="rounded-lg bg-[#E7F7F0] px-4 py-3 text-sm text-[#08563F] ring-1 ring-inset ring-[#C8EEDD]">{saved}</p>}

        {/* 1 — Subject details */}
        <section aria-labelledby="sf-step1" className="space-y-4">
          <span id="sf-step1" className="sr-only">Step 1: Subject details</span>
          <SectionHead icon={BookOpen} title="Subject Details" hint="Enter the basic information for this subject." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sf-code" className={LABEL}>Subject Code<Req /></label>
              <input ref={first} id="sf-code" className={FIELD} maxLength={20} required autoComplete="off" placeholder="e.g. COMP-101"
                value={f.code} onChange={(ev) => set('code', ev.target.value)} aria-invalid={!!e.code || undefined} aria-describedby="sf-code-err" />
              <Err id="sf-code-err" messages={e.code} />
            </div>
            <div>
              <label htmlFor="sf-title" className={LABEL}>Subject Title<Req /></label>
              <input id="sf-title" className={FIELD} maxLength={255} required placeholder="e.g. Computer Programming 1"
                value={f.title} onChange={(ev) => set('title', ev.target.value)} aria-invalid={!!e.title || undefined} aria-describedby="sf-title-err" />
              <Err id="sf-title-err" messages={e.title} />
            </div>
            <div>
              <label htmlFor="sf-defaultUnits" className={LABEL}>Units<Req /></label>
              <input id="sf-defaultUnits" type="number" inputMode="decimal" step="0.5" min={0.5} max={99} required className={FIELD} placeholder="3.0"
                value={f.defaultUnits} onChange={(ev) => set('defaultUnits', ev.target.value)}
                onBlur={() => { const n = Number(f.defaultUnits); if (f.defaultUnits !== '' && Number.isFinite(n) && n > 0) setF((x) => ({ ...x, defaultUnits: n.toFixed(1) })); }}
                aria-invalid={!!e.defaultUnits || undefined} aria-describedby="sf-units-err" />
              <Err id="sf-units-err" messages={e.defaultUnits} />
            </div>
            <div>
              <label htmlFor="sf-subjectType" className={LABEL}>Subject Type<Req /></label>
              <Select id="sf-subjectType" value={f.subjectType} onChange={(v) => set('subjectType', v)} invalid={!!e.subjectType}>
                {TYPE_ORDER.map((t) => <option key={t} value={t}>{SUBJECT_TYPE_LABELS[t]}</option>)}
              </Select>
              <Err id="sf-type-err" messages={e.subjectType} />
            </div>
          </div>
          <div>
            <label htmlFor="sf-description" className={LABEL}>Description</label>
            <textarea id="sf-description" rows={3} maxLength={DESCRIPTION_MAX} className={`${FIELD} h-auto resize-y py-2.5`} placeholder="What will students learn in this subject?"
              value={f.description} onChange={(ev) => set('description', ev.target.value)} aria-describedby="sf-desc-count sf-desc-err" aria-invalid={!!e.description || undefined} />
            <div className="mt-1 flex justify-between gap-2">
              <Err id="sf-desc-err" messages={e.description} />
              <p id="sf-desc-count" className={`ml-auto text-xs tabular-nums ${f.description.length >= DESCRIPTION_MAX ? 'text-red-700' : MUTED}`} aria-live="polite">{f.description.length}/{DESCRIPTION_MAX}</p>
            </div>
          </div>

          <details open={more} onToggle={(ev) => setMore((ev.target as HTMLDetailsElement).open)} className="rounded-lg border border-[#E2EAE6]">
            <summary className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm ${RING}`}>
              <span><span className="font-semibold text-[#172B3A]">More details</span> <span className={MUTED}>(optional) — contact hours, class size, remarks</span></span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-[#647A73] transition ${more ? 'rotate-180' : ''}`} aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-[#E2EAE6] px-3 py-3">
              <div className={`grid grid-cols-1 gap-4 ${hours.lecture && hours.lab ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
                {hours.lecture && (
                  <div>
                    <label htmlFor="sf-lectureHours" className={LABEL}>Lecture hours</label>
                    <input id="sf-lectureHours" type="number" inputMode="decimal" step="0.5" min={0} max={60} className={FIELD} placeholder="per week"
                      value={f.lectureHours} onChange={(ev) => set('lectureHours', ev.target.value)} aria-invalid={!!e.lectureHours || undefined} aria-describedby="sf-lec-err" />
                    <Err id="sf-lec-err" messages={e.lectureHours} />
                  </div>
                )}
                {hours.lab && (
                  <div>
                    <label htmlFor="sf-labHours" className={LABEL}>Laboratory hours</label>
                    <input id="sf-labHours" type="number" inputMode="decimal" step="0.5" min={0} max={60} className={FIELD} placeholder="per week"
                      value={f.labHours} onChange={(ev) => set('labHours', ev.target.value)} aria-invalid={!!e.labHours || undefined} aria-describedby="sf-lab-err" />
                    <Err id="sf-lab-err" messages={e.labHours} />
                  </div>
                )}
                <div>
                  <label htmlFor="sf-total" className={LABEL}>Total contact</label>
                  <input id="sf-total" readOnly tabIndex={-1} className={`${FIELD} cursor-default bg-slate-50 text-[#647A73]`} value={total ? `${total} h/week` : '—'} />
                </div>
                <div>
                  <label htmlFor="sf-recommendedClassSize" className={LABEL}>Class size</label>
                  <input id="sf-recommendedClassSize" type="number" inputMode="numeric" min={1} max={200} step={1} className={FIELD} placeholder="e.g. 25"
                    value={f.recommendedClassSize} onChange={(ev) => set('recommendedClassSize', ev.target.value)} aria-invalid={!!e.recommendedClassSize || undefined} aria-describedby="sf-size-err" />
                  <Err id="sf-size-err" messages={e.recommendedClassSize} />
                </div>
              </div>
              <div>
                <label htmlFor="sf-remarks" className={LABEL}>Remarks</label>
                <textarea id="sf-remarks" rows={2} className={`${FIELD} h-auto py-2.5`} value={f.remarks} onChange={(ev) => set('remarks', ev.target.value)} />
              </div>
            </div>
          </details>

          <div className="border-t border-[#E8EEEC] pt-4">
            <div className="flex items-start gap-3">
              <button id="sf-active" type="button" role="switch" aria-checked={f.isActive} aria-labelledby="sf-active-label" aria-describedby="sf-active-hint" onClick={() => set('isActive', !f.isActive)}
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${RING} ${f.isActive ? 'bg-[#087F5B]' : 'bg-[#CBD5D1]'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${f.isActive ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
              <div>
                <p id="sf-active-label" className="text-sm font-semibold text-[#172B3A]">Active subject</p>
                <p id="sf-active-hint" className={`text-xs ${MUTED}`}>Inactive subjects will not be available for curriculum mapping and scheduling.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2 — Curriculum placement (optional; new subjects only) */}
        {!editing && (
          <section ref={placementRef} aria-labelledby="sf-step2" className="scroll-mt-4 space-y-4 border-t border-[#E8EEEC] pt-5">
            <span id="sf-step2" className="sr-only">Step 2: Curriculum placement</span>
            <SectionHead icon={Layers} title="Curriculum Placement (Optional)" hint="Choose where this subject belongs. You can also map this subject later." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sf-programId" className={LABEL}>Program</label>
                <Select id="sf-programId" value={f.programId} onChange={(v) => setF((x) => ({ ...x, programId: v, prerequisites: [] }))} invalid={!!e.programId} describedBy="sf-program-err sf-program-help">
                  <option value={MAP_LATER}>Not now — map it later</option>
                  {programs.map((p) => <option key={p.id} value={p.id} disabled={!p.curriculum}>{p.name} ({p.code}){p.curriculum ? '' : ' — no curriculum'}</option>)}
                </Select>
                <Err id="sf-program-err" messages={e.programId} />
              </div>
              <div>
                <span className={LABEL}>Year Level</span>
                <Segmented label="Year level" value={f.yearLevel} disabled={!placing}
                  options={YEAR_LEVELS.map((y) => ({ value: y, label: yearLevelLabel(y) }))} onChange={(v) => set('yearLevel', v)} />
              </div>
              <div className="sm:col-span-2">
                <span className={LABEL}>Semester</span>
                <div className="sm:w-1/2 sm:pr-2">
                  <Segmented label="Semester" value={f.semester} disabled={!placing}
                    options={semesters.map((s) => ({ value: s, label: SEMESTER_LABELS[s]! }))} onChange={(v) => set('semester', v)} />
                </div>
              </div>
            </div>
            <p id="sf-program-help" className={`text-xs ${MUTED}`} aria-live="polite">
              {placing && program?.curriculum
                ? <>Goes into {program.code}’s current curriculum, <b className="font-semibold text-[#172B3A]">{program.curriculum.version}</b> (from school year {program.curriculum.effective.replace('-', '–')}).</>
                : 'Saved to the catalogue only. Map it to a program, year level and semester later from the Curriculum Map.'}
            </p>

            {placing && (
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 text-sm text-[#172B3A]">
                  <input type="checkbox" className="h-4 w-4 rounded border-[#D6E2DD] text-[#087F5B] focus:ring-[#087F5B]" checked={f.isRequired} onChange={(ev) => set('isRequired', ev.target.checked)} />
                  <span className="font-semibold">Required subject</span> <span className={MUTED}>(untick for an elective)</span>
                </label>
                <details className="group rounded-lg border border-[#D6E2DD] bg-white">
                  <summary id="sf-prereq" className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm ${RING}`}>
                    <span><span className="font-semibold text-[#172B3A]">Prerequisite subjects</span> <span className={MUTED}>(optional{chosen.length ? ` · ${chosen.length} selected` : ''})</span></span>
                    <ChevronDown className="h-4 w-4 text-[#647A73] transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-[#D6E2DD] px-3 py-3">
                    {candidates.length === 0 ? (
                      <p className={`text-xs ${MUTED}`}>No subjects in an earlier term of this curriculum yet — prerequisites come from earlier terms.</p>
                    ) : (
                      <ul className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2" aria-label="Earlier subjects in this curriculum">
                        {candidates.map((c) => (
                          <li key={c.id}>
                            <label className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[#F4FBF8]">
                              <input type="checkbox" className="h-4 w-4 rounded border-[#D6E2DD] text-[#087F5B] focus:ring-[#087F5B]" checked={f.prerequisites.includes(c.subject.id)}
                                onChange={(ev) => set('prerequisites', ev.target.checked ? [...f.prerequisites, c.subject.id] : f.prerequisites.filter((x) => x !== c.subject.id))} />
                              <span><b className="text-[#172B3A]">{c.subject.code}</b> <span className={MUTED}>{yearLevelLabel(c.yearLevel)}, {SEMESTER_LABELS[c.semester]}</span></span>
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
                      <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[#E7F7F0] py-1 pl-2.5 pr-1 text-xs font-semibold text-[#08563F] ring-1 ring-inset ring-[#C8EEDD]">
                        {c.subject.code}
                        <button type="button" className={`rounded-full p-0.5 text-[#647A73] hover:bg-white hover:text-[#172B3A] ${RING}`} aria-label={`Remove prerequisite ${c.subject.code}`}
                          onClick={() => set('prerequisites', f.prerequisites.filter((x) => x !== c.subject.id))}>
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Err id="sf-prereq-err" messages={e.prerequisiteSubjectIds} />
              </div>
            )}

            <p className="flex items-start gap-2 rounded-lg bg-[#E7F7F0] px-3.5 py-2.5 text-xs text-[#08563F]">
              <Info className="mt-px h-4 w-4 shrink-0 text-[#087F5B]" aria-hidden="true" />
              You can schedule rooms, instructors and meeting times after mapping this subject to a curriculum and section.
            </p>
          </section>
        )}
      </form>
    </Modal>
  );
}
