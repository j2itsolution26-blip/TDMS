import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import Combobox, { type ComboboxOption } from '@/components/Combobox';
import { STUDENT_STATUSES, STUDENT_STATUS_LABELS, type StudentStatus } from '@shared/types/domain';
import { toDateInput } from '@shared/lib/dates';
import { localDayKey } from '@shared/lib/institution-time';
import { EARLIEST_BIRTH_DATE, dateOfBirthProblem, phoneProblem } from '@shared/lib/student-rules';
import type { CurriculumOption, ProgramOption, StudentRow } from './StudentsScreen';

/**
 * Add / edit a student: personal details, then the academic placement.
 *
 * The server is the authority — it re-checks every rule here, plus the
 * program/curriculum pairing and duplicate records — so these checks only
 * save a round trip. Field errors from either side appear under the field,
 * and nothing typed is lost when a save is refused.
 */

const EMPTY = {
  firstName: '', middleName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', programId: '', curriculumId: '',
  yearLevel: 1, status: 'active' as StudentStatus, enrollmentDate: '',
};
type Form = typeof EMPTY;
type Errors = Partial<Record<keyof Form, string[]>>;

const FIELD =
  'block h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600/20 disabled:bg-slate-50 disabled:text-slate-400';
const fieldBorder = (invalid: boolean) => (invalid ? 'border-red-400 focus:border-red-500' : 'border-slate-300 hover:border-slate-400 focus:border-primary-600');

/** The simple format the browser's email input enforces; the server's check is the authority. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form: Form): Errors {
  const e: Errors = {};
  if (!form.firstName.trim()) e.firstName = ['Enter the first name.'];
  if (!form.lastName.trim()) e.lastName = ['Enter the last name.'];
  if (form.email.trim() && !EMAIL.test(form.email.trim())) e.email = ['Enter a valid email address, like name@example.com.'];
  const phone = phoneProblem(form.phone);
  if (phone) e.phone = [phone];
  const dob = dateOfBirthProblem(form.dateOfBirth);
  if (dob) e.dateOfBirth = [dob];
  if (!form.programId) e.programId = ['Choose a program.'];
  if (!form.curriculumId) e.curriculumId = ['Choose a curriculum.'];
  if (!(form.yearLevel >= 1 && form.yearLevel <= 4)) e.yearLevel = ['Choose a year level from 1 to 4.'];
  return e;
}

function Field({
  id, label, required, error, hint, children,
}: { id: string; label: string; required?: boolean; error?: string[]; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error?.length && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && error.length > 0 && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600" role="alert">{error[0]}</p>
      )}
    </div>
  );
}

const describe = (id: string, error?: string[], hint?: string) =>
  error?.length ? `${id}-error` : hint ? `${id}-hint` : undefined;

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`section-${title}`} className="space-y-4">
      <div>
        <h3 id={`section-${title}`} className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function StudentFormModal({
  open, editing, programs, onClose, onSaved,
}: {
  open: boolean;
  /** The student being edited, or null to add one. */
  editing: StudentRow | null;
  programs: ProgramOption[];
  onClose: () => void;
  /** Called after a successful save with a sentence for the page's notice. */
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const initial = useRef<Form>(EMPTY);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [loadingCurricula, setLoadingCurricula] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  // Reset on every open; for an edit, load the full record (the list carries only a joined name).
  useEffect(() => {
    if (!open) return;
    setErrors({}); setMessage(null); setBusy(false); setConfirmDiscard(false);
    if (!editing) {
      setForm(EMPTY); initial.current = EMPTY;
      requestAnimationFrame(() => firstField.current?.focus());
      return;
    }
    setLoadingRecord(true);
    let cancelled = false;
    api.get<Record<string, unknown>>(`/api/v1/students/${editing.id}`).then((r) => {
      if (cancelled) return;
      setLoadingRecord(false);
      if (!r.ok) { setMessage(r.message); return; }
      const d = r.data as {
        firstName: string; middleName: string | null; lastName: string; email: string | null; phone: string | null;
        dateOfBirth: string | null; programId: string; curriculumId: string; yearLevel: number; status: string; enrollmentDate: string | null;
      };
      const loaded: Form = {
        firstName: d.firstName, middleName: d.middleName ?? '', lastName: d.lastName,
        email: d.email ?? '', phone: d.phone ?? '', dateOfBirth: toDateInput(d.dateOfBirth),
        programId: String(d.programId), curriculumId: String(d.curriculumId),
        yearLevel: d.yearLevel, status: d.status as StudentStatus, enrollmentDate: toDateInput(d.enrollmentDate),
      };
      setForm(loaded); initial.current = loaded;
      requestAnimationFrame(() => firstField.current?.focus());
    });
    return () => { cancelled = true; };
  }, [open, editing]);

  // Curricula follow the program; a curriculum from another program is cleared.
  useEffect(() => {
    if (!form.programId) { setCurricula([]); return; }
    let cancelled = false;
    setLoadingCurricula(true);
    api.get<CurriculumOption[]>(`/api/v1/programs/${form.programId}/curricula`).then((r) => {
      if (cancelled) return;
      setLoadingCurricula(false);
      const list = r.ok ? r.data : [];
      setCurricula(list);
      setForm((f) => (f.curriculumId && !list.some((c) => c.id === f.curriculumId) ? { ...f, curriculumId: '' } : f));
    });
    return () => { cancelled = true; };
  }, [form.programId]);

  const programOptions = useMemo<ComboboxOption[]>(
    () => programs.map((p) => ({ value: p.id, label: p.name, keywords: p.code })),
    [programs],
  );
  const codeOf = useMemo(() => new Map(programs.map((p) => [p.id, p.code])), [programs]);
  const curriculumOptions = useMemo<ComboboxOption[]>(
    () => curricula.map((c) => ({
      value: c.id,
      label: c.versionLabel,
      description: `Effective ${c.effectiveSchoolYear}${c.isActive === false ? ' · inactive' : ''}`,
      keywords: c.effectiveSchoolYear,
    })),
    [curricula],
  );

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial.current), [form]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setConfirmDiscard(false);
    // A corrected field stops showing its old complaint.
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function requestClose() {
    if (busy) return;
    if (dirty && !confirmDiscard) { setConfirmDiscard(true); return; }
    onClose();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setMessage('Check the highlighted fields.');
      const first = (Object.keys(found) as (keyof Form)[])[0];
      document.getElementById(`st-${first}`)?.focus();
      return;
    }
    setBusy(true); setErrors({}); setMessage(null);
    const result = editing
      ? await api.put<{ studentNumber?: string }>(`/api/v1/students/${editing.id}`, form)
      : await api.post<{ studentNumber?: string }>('/api/v1/students', form);
    setBusy(false);
    if (!result.ok) {
      setErrors((result.errors ?? {}) as Errors);
      setMessage(result.errors ? 'The student could not be saved. Check the highlighted fields.' : result.message);
      return;
    }
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
    onSaved(editing
      ? `${name}'s record was updated.`
      : `${name} was added${result.data?.studentNumber ? ` as ${result.data.studentNumber}` : ''}.`);
  }

  const today = localDayKey(new Date());
  const e = errors;

  const footer = confirmDiscard ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="alertdialog" aria-labelledby="discard-text">
      <p id="discard-text" className="text-sm font-medium text-ink">Discard the changes you made?</p>
      <div className="flex gap-2 sm:justify-end">
        <button type="button" className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40" onClick={() => setConfirmDiscard(false)} autoFocus>
          Keep editing
        </button>
        <button type="button" className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 focus-visible:ring-offset-2" onClick={onClose}>
          Discard
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted"><span className="text-red-600" aria-hidden="true">*</span> Required field</p>
      <div className="flex gap-2 sm:justify-end">
        <button type="button" className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 sm:flex-none" onClick={requestClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          form="student-form"
          disabled={busy || loadingRecord}
          aria-busy={busy}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy ? 'Saving…' : editing ? 'Save Changes' : 'Save Student'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={editing ? 'Edit Student' : 'Add New Student'}
      subtitle={editing ? `${editing.studentNumber} · Update the student's details and placement.` : 'Register a student and place them in a program and curriculum.'}
      maxWidth="sm:max-w-[880px]"
      appearance="fluent"
      footer={footer}
    >
      {loadingRecord ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the student's record…
        </div>
      ) : (
        <form id="student-form" onSubmit={save} noValidate className="space-y-6">
          {message && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{message}</div>
          )}

          <Section title="Personal information" description="The student's name, birth date and contact details.">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
              <Field id="st-firstName" label="First Name" required error={e.firstName}>
                <input ref={firstField} id="st-firstName" className={`${FIELD} ${fieldBorder(!!e.firstName)}`} maxLength={100} autoComplete="off"
                  value={form.firstName} onChange={(ev) => set('firstName', ev.target.value)}
                  aria-invalid={!!e.firstName || undefined} aria-required aria-describedby={describe('st-firstName', e.firstName)} />
              </Field>
              <Field id="st-middleName" label="Middle Name" error={e.middleName}>
                <input id="st-middleName" className={`${FIELD} ${fieldBorder(!!e.middleName)}`} maxLength={100} autoComplete="off"
                  value={form.middleName} onChange={(ev) => set('middleName', ev.target.value)}
                  aria-invalid={!!e.middleName || undefined} aria-describedby={describe('st-middleName', e.middleName)} />
              </Field>
              <Field id="st-lastName" label="Last Name" required error={e.lastName}>
                <input id="st-lastName" className={`${FIELD} ${fieldBorder(!!e.lastName)}`} maxLength={100} autoComplete="off"
                  value={form.lastName} onChange={(ev) => set('lastName', ev.target.value)}
                  aria-invalid={!!e.lastName || undefined} aria-required aria-describedby={describe('st-lastName', e.lastName)} />
              </Field>
              <Field id="st-dateOfBirth" label="Date of Birth" error={e.dateOfBirth}>
                <input id="st-dateOfBirth" type="date" className={`${FIELD} ${fieldBorder(!!e.dateOfBirth)}`} min={EARLIEST_BIRTH_DATE} max={today}
                  value={form.dateOfBirth} onChange={(ev) => set('dateOfBirth', ev.target.value)}
                  aria-invalid={!!e.dateOfBirth || undefined} aria-describedby={describe('st-dateOfBirth', e.dateOfBirth)} />
              </Field>
              <Field id="st-email" label="Email Address" error={e.email}>
                <input id="st-email" type="email" inputMode="email" className={`${FIELD} ${fieldBorder(!!e.email)}`} maxLength={255} autoComplete="off"
                  placeholder="name@example.com" value={form.email} onChange={(ev) => set('email', ev.target.value)}
                  aria-invalid={!!e.email || undefined} aria-describedby={describe('st-email', e.email)} />
              </Field>
              <Field id="st-phone" label="Phone Number" error={e.phone} hint="e.g. 0917 123 4567">
                <input id="st-phone" type="tel" inputMode="tel" className={`${FIELD} ${fieldBorder(!!e.phone)}`} maxLength={30} autoComplete="off"
                  value={form.phone} onChange={(ev) => set('phone', ev.target.value)}
                  aria-invalid={!!e.phone || undefined} aria-describedby={describe('st-phone', e.phone, 'e.g. 0917 123 4567')} />
              </Field>
            </div>
          </Section>

          <div className="border-t border-slate-200" role="presentation" />

          <Section title="Academic information" description="Where the student is placed. Curricula are listed for the chosen program only.">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <Field id="st-programId" label="Program" required error={e.programId}>
                <Combobox
                  id="st-programId"
                  labelledBy="st-programId-label"
                  value={form.programId}
                  onChange={(v) => { if (v !== form.programId) setForm((f) => ({ ...f, programId: v, curriculumId: '' })); setConfirmDiscard(false); setErrors((x) => ({ ...x, programId: undefined, curriculumId: undefined })); }}
                  options={programOptions}
                  placeholder="Select a program"
                  searchPlaceholder="Search by program code or name"
                  emptyText={programs.length === 0 ? 'No active programs yet.' : 'No program matches.'}
                  invalid={!!e.programId}
                  required
                  describedBy={describe('st-programId', e.programId)}
                  renderLead={(o) => (
                    <span className="mt-px shrink-0 rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                      {codeOf.get(o.value)}
                    </span>
                  )}
                />
              </Field>
              <Field
                id="st-curriculumId"
                label="Curriculum"
                required
                error={e.curriculumId}
                hint={form.programId && !loadingCurricula && curricula.length === 0 ? 'No curriculum is set up for this program yet. Add one under Programs.' : undefined}
              >
                <Combobox
                  id="st-curriculumId"
                  labelledBy="st-curriculumId-label"
                  value={form.curriculumId}
                  onChange={(v) => set('curriculumId', v)}
                  options={curriculumOptions}
                  placeholder={!form.programId ? 'Choose a program first' : loadingCurricula ? 'Loading curricula…' : curricula.length === 0 ? 'No curriculum available' : 'Select a curriculum'}
                  searchPlaceholder="Search curricula"
                  emptyText="No curriculum is set up for this program yet."
                  disabled={!form.programId || loadingCurricula || curricula.length === 0}
                  loading={loadingCurricula}
                  invalid={!!e.curriculumId}
                  required
                  describedBy={describe('st-curriculumId', e.curriculumId, form.programId && !loadingCurricula && curricula.length === 0 ? 'hint' : undefined)}
                />
              </Field>
              <Field id="st-yearLevel" label="Year Level" required error={e.yearLevel}>
                <select id="st-yearLevel" className={`${FIELD} ${fieldBorder(!!e.yearLevel)}`} value={form.yearLevel}
                  onChange={(ev) => set('yearLevel', Number(ev.target.value))}
                  aria-invalid={!!e.yearLevel || undefined} aria-describedby={describe('st-yearLevel', e.yearLevel)}>
                  {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </Field>
              <Field id="st-status" label="Student Status" required error={e.status}>
                <select id="st-status" className={`${FIELD} ${fieldBorder(!!e.status)}`} value={form.status}
                  onChange={(ev) => set('status', ev.target.value as StudentStatus)}
                  aria-invalid={!!e.status || undefined} aria-describedby={describe('st-status', e.status)}>
                  {STUDENT_STATUSES.map((s) => <option key={s} value={s}>{STUDENT_STATUS_LABELS[s]}</option>)}
                </select>
              </Field>
            </div>
          </Section>
        </form>
      )}
    </Modal>
  );
}
