import { useEffect, useId, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FieldError, INPUT_CLASS, LABEL_CLASS } from '@/components/ui';
import { ENROLLMENT_SEMESTERS, termTaken } from '@shared/lib/enrollment-term';
import { SEMESTER_LABELS, yearLevelLabel } from '@shared/lib/teaching';

/**
 * New Enrollment Term — open a pending enrollment for one student.
 *
 * Every choice is one the system supports, and nothing else can be typed:
 * school years that are set up and not archived (the active one first), the
 * 1st or 2nd semester, and year levels up to the student's curriculum's final
 * year. A term the student already has is flagged before submitting; the
 * server checks every rule again (createEnrollment) and its answer is shown
 * under the field it concerns.
 */

export interface TermOptions {
  schoolYears: { label: string; active: boolean; currentSemester: number }[];
  yearLevels: number[];
}

const yearDisplay = (label: string) => label.replace('-', '–');

function initial(options: TermOptions, studentYearLevel: number) {
  const year = options.schoolYears[0];
  const semester = year && (ENROLLMENT_SEMESTERS as readonly number[]).includes(year.currentSemester) ? year.currentSemester : 1;
  const yearLevel = options.yearLevels.includes(studentYearLevel) ? studentYearLevel : (options.yearLevels[0] ?? 1);
  return { schoolYear: year?.label ?? '', semester, yearLevel };
}

export default function NewEnrollmentTermDialog({
  open,
  onClose,
  onCreated,
  student,
  existing,
  options,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
  student: { id: string; fullName: string; studentNumber: string; yearLevel: number; programCode: string };
  /** The terms the student already has, of any status. */
  existing: { schoolYear: string; semester: number }[];
  options: TermOptions;
}) {
  const id = useId();
  const [form, setForm] = useState(() => initial(options, student.yearLevel));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLSelectElement>(null);

  // Every opening starts clean: the defaults, and no message from an earlier attempt.
  // Only the opening resets it — never a re-render while someone is choosing.
  useEffect(() => {
    if (!open) return;
    setForm(initial(options, student.yearLevel));
    setErrors({});
    setProblem(null);
    setBusy(false);
    // Focus moves here after Modal has noted the button that opened it (its
    // effect runs first, being the child), so Escape and Cancel return there.
    firstField.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const noYears = options.schoolYears.length === 0;
  const taken = !noYears && termTaken(existing, form.schoolYear, form.semester);
  const lastLevel = options.yearLevels[options.yearLevels.length - 1];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || taken || noYears) return;
    setBusy(true);
    setErrors({});
    setProblem(null);
    const result = await api.post(`/api/v1/students/${student.id}/enrollments`, form);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      if (!result.errors) setProblem(result.message);
      return;
    }
    onCreated(`Enrollment for ${SEMESTER_LABELS[form.semester]}, SY ${yearDisplay(form.schoolYear)} created as pending.`);
  }

  const described = (field: string, ...extra: (string | false)[]) =>
    [...extra, errors[field]?.length ? `${id}-${field}-error` : false].filter(Boolean).join(' ') || undefined;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="New Enrollment Term"
      subtitle={`${student.fullName} · ${student.studentNumber} · ${student.programCode}`}
      appearance="fluent"
      maxWidth="sm:max-w-lg"
      trapFocus
      animate
      icon={<CalendarPlus className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" className={BUTTON_SECONDARY} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form={`${id}-form`} className={BUTTON_PRIMARY} disabled={busy || taken || noYears} aria-disabled={busy || taken || noYears}>
            {busy ? 'Creating…' : 'Create enrollment'}
          </button>
        </div>
      }
    >
      {noYears ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          No school year is open. Set one up under School Years, then open the enrollment here.
        </p>
      ) : (
        <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
          <p className="text-sm text-muted">The enrollment starts as Pending. Approving it in Enrollments places the student in a section.</p>

          {problem && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{problem}</p>}

          <div>
            <label className={LABEL_CLASS} htmlFor={`${id}-year`}>School year</label>
            <select
              id={`${id}-year`}
              className={`${INPUT_CLASS} mt-1.5`}
              value={form.schoolYear}
              ref={firstField}
              disabled={busy}
              aria-invalid={Boolean(errors.schoolYear?.length) || taken}
              aria-describedby={described('schoolYear', taken && `${id}-taken`)}
              onChange={(e) => {
                const year = options.schoolYears.find((y) => y.label === e.target.value);
                const semester = year && (ENROLLMENT_SEMESTERS as readonly number[]).includes(year.currentSemester) ? year.currentSemester : form.semester;
                setForm({ ...form, schoolYear: e.target.value, semester });
                setErrors({ ...errors, schoolYear: [] });
              }}
            >
              {options.schoolYears.map((y) => (
                <option key={y.label} value={y.label}>SY {yearDisplay(y.label)}{y.active ? ' (active)' : ''}</option>
              ))}
            </select>
            <div id={`${id}-schoolYear-error`}><FieldError messages={errors.schoolYear} /></div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor={`${id}-sem`}>Semester</label>
              <select
                id={`${id}-sem`}
                className={`${INPUT_CLASS} mt-1.5`}
                value={form.semester}
                disabled={busy}
                aria-invalid={Boolean(errors.semester?.length) || taken}
                aria-describedby={described('semester', taken && `${id}-taken`)}
                onChange={(e) => { setForm({ ...form, semester: Number(e.target.value) }); setErrors({ ...errors, semester: [] }); }}
              >
                {ENROLLMENT_SEMESTERS.map((s) => <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>)}
              </select>
              <div id={`${id}-semester-error`}><FieldError messages={errors.semester} /></div>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor={`${id}-level`}>Year level</label>
              <select
                id={`${id}-level`}
                className={`${INPUT_CLASS} mt-1.5`}
                value={form.yearLevel}
                disabled={busy}
                aria-invalid={Boolean(errors.yearLevel?.length)}
                aria-describedby={described('yearLevel', `${id}-level-hint`)}
                onChange={(e) => { setForm({ ...form, yearLevel: Number(e.target.value) }); setErrors({ ...errors, yearLevel: [] }); }}
              >
                {options.yearLevels.map((l) => <option key={l} value={l}>{yearLevelLabel(l)}</option>)}
              </select>
              <p id={`${id}-level-hint`} className="mt-1.5 text-xs text-muted">
                {student.programCode} runs to {lastLevel ? yearLevelLabel(lastLevel) : 'its final year'}.
              </p>
              <div id={`${id}-yearLevel-error`}><FieldError messages={errors.yearLevel} /></div>
            </div>
          </div>

          {taken && (
            <p id={`${id}-taken`} role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              {student.fullName} already has an enrollment for {SEMESTER_LABELS[form.semester]}, SY {yearDisplay(form.schoolYear)}. Choose another term.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
