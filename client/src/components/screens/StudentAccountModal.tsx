import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, Check, Copy, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import Modal from '@/components/Modal';
import { Avatar } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';

/**
 * Create Student Account — for one officially Enrolled student, by an Admin.
 *
 * The server decides everything that matters (POST /api/v1/students/:id/account):
 * who may do it, that the enrollment is Enrolled, that the student has no
 * login and the address is free. This dialog only presents it: the student,
 * their enrollment, the sign-in address, one confirmation, and — once —
 * the temporary password the Admin hands over, hidden until they ask to see it.
 */

export interface StudentAccountCandidate {
  id: string;
  name: string;
  studentNumber: string;
  email: string | null;
  yearLevel: number;
  program: { code: string; name: string };
  enrollment: { schoolYear: string; semester: number; status: 'enrolled' } | null;
}

/** The format the browser checks; the server's check (domain policy, uniqueness) is the authority. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEMESTER = (n: number) => (n === 1 ? '1st Semester' : n === 2 ? '2nd Semester' : `Semester ${n}`);

const BTN_PRIMARY =
  'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none';
const BTN_SECONDARY =
  'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 disabled:opacity-60 sm:flex-none';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</dt>
      {/* Wraps rather than truncating: a one-line program name would widen the dialog past a phone screen. */}
      <dd className="mt-0.5 break-words text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default function StudentAccountModal({ student, onClose }: { student: StudentAccountCandidate | null; onClose: () => void }) {
  const router = useRouter();
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const successRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // A fresh form for each student; the one-time password never outlives the dialog.
  useEffect(() => {
    setEmail(student?.email ?? '');
    setTouched(false);
    setConfirming(false);
    setBusy(false);
    setError(null);
    setEmailError(null);
    setCreated(null);
    setReveal(false);
    setCopied(false);
    // Keyboard and screen-reader users start in the dialog, on the one field to check.
    if (student) requestAnimationFrame(() => emailRef.current?.focus());
  }, [student?.id]);

  useEffect(() => {
    if (created) successRef.current?.focus();
  }, [created]);

  if (!student) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const trimmed = email.trim();
  const formatProblem = !trimmed ? 'Enter the email address the student will sign in with.' : !EMAIL.test(trimmed) ? 'Enter a valid email address, like name@example.com.' : null;
  const shownEmailError = emailError ?? (touched ? formatProblem : null);

  function close() {
    if (busy) return;
    if (created) router.refresh();
    onClose();
  }

  async function create() {
    if (busy || !student) return;
    setBusy(true);
    setError(null);
    setEmailError(null);
    const result = await api.post<{ email: string; temporaryPassword: string }>(`/api/v1/students/${student.id}/account`, { email: trimmed });
    setBusy(false);
    if (!result.ok) {
      setConfirming(false);
      if (result.errors?.email?.[0]) {
        setEmailError(result.errors.email[0]);
        emailRef.current?.focus();
      } else {
        setError(result.message);
      }
      // Someone else created it, or the enrollment changed: show the current state behind the dialog.
      if (result.code === 'ACCOUNT_ALREADY_EXISTS' || result.code === 'STUDENT_NOT_ENROLLED') router.refresh();
      return;
    }
    setCreated(result.data);
  }

  function next() {
    setTouched(true);
    if (formatProblem) {
      emailRef.current?.focus();
      return;
    }
    setConfirming(true);
  }

  const footer = created ? (
    <div className="flex justify-end">
      <button type="button" className={BTN_PRIMARY} onClick={close}>Done</button>
    </div>
  ) : confirming ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink">Create a login for <b>{student.name}</b> with <b className="break-all">{trimmed}</b>?</p>
      <div className="flex gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(false)} disabled={busy}>Back</button>
        <button type="button" className={BTN_PRIMARY} onClick={create} disabled={busy} aria-busy={busy} autoFocus>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy ? 'Creating…' : 'Confirm & create'}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex gap-2 sm:justify-end">
      <button type="button" className={BTN_SECONDARY} onClick={close}>Cancel</button>
      <button type="submit" form="student-account-form" className={BTN_PRIMARY} disabled={busy}>Create Student Account</button>
    </div>
  );

  return (
    <Modal
      open
      onClose={close}
      title={created ? 'Student account created' : 'Create Student Account'}
      subtitle={created ? 'Hand these sign-in details to the student.' : 'A login for an officially enrolled student.'}
      maxWidth="sm:max-w-[600px]"
      appearance="fluent"
      footer={footer}
    >
      <div className="space-y-5">
        {/* Who */}
        <div className="flex items-center gap-4">
          <Avatar name={student.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-ink">{student.name}</p>
            <p className="text-sm text-muted">Student ID <span className="font-medium tabular-nums text-ink">{student.studentNumber}</span></p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Enrollment verified
          </span>
        </div>

        {/* Enrollment */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-3"><Info label="Program">{student.program.code} — {student.program.name}</Info></div>
          <Info label="School year">{student.enrollment?.schoolYear ?? '—'}</Info>
          <Info label="Semester">{student.enrollment ? SEMESTER(student.enrollment.semester) : '—'}</Info>
          <Info label="Year level">Year {student.yearLevel}</Info>
          <Info label="Enrollment status">
            <span className="inline-flex items-center gap-1 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />Enrolled</span>
          </Info>
          <Info label="Account role">Student</Info>
        </dl>

        {created ? (
          <section aria-labelledby={`${emailId}-done`} className="space-y-4">
            <h3 id={`${emailId}-done`} ref={successRef} tabIndex={-1} className="flex items-center gap-2 text-sm font-semibold text-emerald-800 focus:outline-none">
              <Check className="h-4 w-4" aria-hidden="true" /> The account is ready.
            </h3>
            <dl className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Sign in with</dt>
                <dd className="mt-0.5 break-all text-sm font-medium text-ink">{created.email}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Temporary password</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="min-w-[12rem] rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-ink ring-1 ring-inset ring-slate-200" aria-live="polite">
                    {reveal ? created.temporaryPassword : '•'.repeat(Math.min(created.temporaryPassword.length, 16))}
                    {!reveal && <span className="sr-only">Hidden. Use Show to reveal it.</span>}
                  </code>
                  <button type="button" className={`${BTN_SECONDARY} h-9`} onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
                    {reveal ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    {reveal ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    className={`${BTN_SECONDARY} h-9`}
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(created.temporaryPassword); setCopied(true); } catch { setReveal(true); }
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
            </dl>
            <p className="flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              This password is shown only now and is not stored anywhere readable. Give it to the student in person; they must replace it at their first sign-in.
            </p>
          </section>
        ) : (
          <form id="student-account-form" noValidate onSubmit={(e) => { e.preventDefault(); next(); }} className="space-y-4">
            <div>
              <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium text-ink">
                Sign-in email<span className="ml-0.5 text-red-600" aria-hidden="true">*</span><span className="sr-only"> (required)</span>
              </label>
              <input
                ref={emailRef}
                id={emailId}
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                value={email}
                disabled={busy || confirming}
                onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                onBlur={() => setTouched(true)}
                aria-invalid={!!shownEmailError || undefined}
                aria-describedby={`${emailId}-${shownEmailError ? 'error' : 'hint'}`}
                placeholder="name@example.com"
                className={`block h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600/20 disabled:bg-slate-50 ${shownEmailError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 hover:border-slate-400 focus:border-primary-600'}`}
              />
              {shownEmailError ? (
                <p id={`${emailId}-error`} className="mt-1.5 text-xs font-medium text-red-600" role="alert">{shownEmailError}</p>
              ) : (
                <p id={`${emailId}-hint`} className="mt-1.5 text-xs text-muted">
                  {student.email ? 'Taken from the student record. The student signs in with this address.' : 'The student record has no email. Enter the address the student will sign in with.'}
                </p>
              )}
            </div>

            <p className="flex gap-2.5 rounded-xl bg-primary-50 px-4 py-3 text-xs leading-relaxed text-primary-900 ring-1 ring-inset ring-primary-100">
              <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
              <span>
                TDMS generates a secure temporary password and shows it to you once. The student must choose their own password at their first sign-in before they can open the student dashboard.
              </span>
            </p>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200" role="alert">{error}</p>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
}
