import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileText, GraduationCap, Info, Loader2, Paperclip, Save, Send, User, Phone, BookMarked, ListChecks, Upload, X,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui';
import {
  BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Err, FIELD, IconTile, LABEL, MUTED, Opt, Req, RING, SectionHead, Select, StepNav,
} from '@/components/fluent-form';
import { api } from '@/lib/api-client';
import { sendForm } from '@/components/teaching/client-kit';
import {
  DOCUMENT_STATUS_LABELS, EDUCATION_LABELS, EDUCATION_LEVELS, SUFFIXES, isHandedIn, submissionProblems, type DocumentStatus,
} from '@shared/lib/applications';
import { dateOfBirthProblem, phoneProblem } from '@shared/lib/student-rules';
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from '@shared/lib/teaching';

/**
 * Record New Application / Edit Application — three steps:
 *
 *   1  Applicant details        name, birth date, contact, emergency contact,
 *                               diploma program and school year
 *   2  Educational background   attainment, previous school, year graduated
 *   3  Program & requirements   a summary and the requirements checklist
 *
 * Save Draft keeps whatever is filled in (names and program are enough).
 * Submit Application needs every required field and required document; the
 * form checks first and the server checks again against the stored record.
 *
 * Files chosen here are held until the save: the application is written
 * first, then each file is uploaded to it, then — for a submission — it is
 * submitted. If an upload fails the application stays a draft with nothing
 * typed lost, and the next press retries against the same record (never a
 * second one). Uploading never verifies a document; reviewers do that.
 */

export interface RequirementOption { id: string; name: string; isRequired: boolean; programId: string | null }
export interface ProgramOption { id: string; name: string; code: string }
export interface SchoolYearOption { id: string; label: string; status: string }

export interface ApplicationDetail {
  id: string;
  applicationNumber: string | null;
  fullName: string;
  firstName: string; middleName: string | null; lastName: string; suffix: string | null;
  email: string | null; phone: string | null; dateOfBirth: string | null; address: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null;
  highestEducation: string | null; previousSchool: string | null; yearGraduated: number | null; educationNotes: string | null;
  status: string; notes: string | null;
  createdAt: string | null; submittedAt: string | null; reviewedAt: string | null; createdBy: string | null;
  program: ProgramOption;
  schoolYear: { id: string; label: string; status: string } | null;
  reviewer: { name: string } | null;
  student: { id: string; studentNumber: string } | null;
  requirements: {
    requirementId: string; name: string; isRequired: boolean; documentId: string | null; status: string;
    file: { name: string; type: string | null; size: number | null } | null; remarks: string | null;
    submittedAt: string | null; submittedBy: string | null; verifiedAt: string | null; verifiedBy: string | null;
  }[];
  progress: { handedIn: number; verified: number; total: number };
  submissionProblems: Record<string, string[]>;
  approvalProblems: string[];
  possibleStudents: { id: string; studentNumber: string; fullName: string; email: string | null; status: string; programId: string; programCode: string }[];
}

type Form = {
  firstName: string; middleName: string; lastName: string; suffix: string; dateOfBirth: string;
  email: string; phone: string; address: string; emergencyContactName: string; emergencyContactPhone: string;
  programId: string; schoolYearId: string;
  highestEducation: string; previousSchool: string; yearGraduated: string; educationNotes: string;
};

/** What happens to a requirement on save: a file to upload, the paper copy received, or back to pending. */
type Staged = { file?: File; received?: boolean; clear?: boolean };

const NOTES_MAX = 1000;
const STEPS = ['Applicant Details', 'Educational Background', 'Program & Requirements'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blankForm(programs: ProgramOption[], years: SchoolYearOption[]): Form {
  return {
    firstName: '', middleName: '', lastName: '', suffix: '', dateOfBirth: '',
    email: '', phone: '', address: '', emergencyContactName: '', emergencyContactPhone: '',
    programId: programs.length === 1 ? programs[0]!.id : '',
    schoolYearId: years.find((y) => y.status === 'ACTIVE')?.id ?? '',
    highestEducation: '', previousSchool: '', yearGraduated: '', educationNotes: '',
  };
}

function fromDetail(d: ApplicationDetail): Form {
  return {
    firstName: d.firstName, middleName: d.middleName ?? '', lastName: d.lastName, suffix: d.suffix ?? '', dateOfBirth: d.dateOfBirth ?? '',
    email: d.email ?? '', phone: d.phone ?? '', address: d.address ?? '',
    emergencyContactName: d.emergencyContactName ?? '', emergencyContactPhone: d.emergencyContactPhone ?? '',
    programId: d.program.id, schoolYearId: d.schoolYear?.id ?? '',
    highestEducation: d.highestEducation ?? '', previousSchool: d.previousSchool ?? '', yearGraduated: d.yearGraduated?.toString() ?? '', educationNotes: d.educationNotes ?? '',
  };
}

/** Format checks for whatever is filled in — run for drafts too. */
function formatProblems(f: Form): Record<string, string[]> {
  const e: Record<string, string[]> = {};
  if (!f.firstName.trim()) e.firstName = ['Enter the first name.'];
  if (!f.lastName.trim()) e.lastName = ['Enter the last name.'];
  if (!f.programId) e.programId = ['Choose the diploma program.'];
  if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = ['Enter a valid email address, e.g. name@example.com.'];
  const phone = phoneProblem(f.phone); if (phone) e.phone = [phone];
  const ecPhone = phoneProblem(f.emergencyContactPhone); if (ecPhone) e.emergencyContactPhone = [ecPhone];
  const dob = dateOfBirthProblem(f.dateOfBirth); if (dob) e.dateOfBirth = [dob];
  if (f.yearGraduated.trim()) {
    const y = Number(f.yearGraduated);
    if (!Number.isInteger(y) || y < 1950 || y > new Date().getFullYear() + 1) e.yearGraduated = ['Enter a year such as 2024.'];
  }
  if (f.educationNotes.length > NOTES_MAX) e.educationNotes = [`At most ${NOTES_MAX} characters.`];
  return e;
}

const STEP_OF: Record<string, 1 | 2 | 3> = {
  firstName: 1, middleName: 1, lastName: 1, suffix: 1, dateOfBirth: 1, email: 1, phone: 1, address: 1,
  emergencyContactName: 1, emergencyContactPhone: 1, programId: 1, schoolYearId: 1,
  highestEducation: 2, previousSchool: 2, yearGraduated: 2, educationNotes: 2,
};
const stepOf = (key: string) => (key.startsWith('documents.') ? 3 : STEP_OF[key] ?? 1);

function fileProblem(file: File): string | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!UPLOAD_TYPES[ext]) return 'Upload a PDF, Word, Excel, PowerPoint, JPG or PNG file.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > UPLOAD_MAX_BYTES) return 'The file is larger than 4 MB.';
  return null;
}

function bytes(n: number | null | undefined) {
  if (!n) return '';
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function ApplicationForm({ open, editingId, programs, schoolYears, requirements, canManageDocuments, onClose, onSaved }: {
  open: boolean;
  /** The application being edited, or null for a new one. */
  editingId: string | null;
  programs: ProgramOption[];
  schoolYears: SchoolYearOption[];
  requirements: RequirementOption[];
  canManageDocuments: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const openYears = schoolYears.filter((y) => y.status !== 'ARCHIVED');
  const [f, setF] = useState<Form>(() => blankForm(programs, openYears));
  const [initial, setInitial] = useState('');
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Set once the record exists — a retry after a failed upload updates it instead of recording another. */
  const [savedId, setSavedId] = useState<string | null>(null);
  const [staged, setStaged] = useState<Record<string, Staged>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<false | 'draft' | 'submit'>(false);
  const [progressText, setProgressText] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Open: a blank form, or the application loaded fresh from the server.
  useEffect(() => {
    if (!open) return;
    setErrors({}); setProblem(null); setBusy(false); setStep(1); setStaged({}); setFileErrors({}); setConfirmDiscard(false); setLoadError(null);
    setSavedId(editingId);
    if (!editingId) {
      const b = blankForm(programs, openYears);
      setF(b); setInitial(JSON.stringify(b)); setDetail(null);
      requestAnimationFrame(() => document.getElementById('af-firstName')?.focus());
      return;
    }
    let live = true;
    setLoading(true); setDetail(null);
    void api.get<ApplicationDetail>(`/api/v1/applications/${editingId}`).then((r) => {
      if (!live) return;
      setLoading(false);
      if (!r.ok) { setLoadError(r.message); return; }
      const loaded = fromDetail(r.data);
      setDetail(r.data); setF(loaded); setInitial(JSON.stringify(loaded));
      requestAnimationFrame(() => document.getElementById('af-firstName')?.focus());
    });
    return () => { live = false; };
  }, [open, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = detail?.status ?? 'draft';
  const canSubmit = status === 'draft' || status === 'returned';
  const dirty = JSON.stringify(f) !== initial || Object.keys(staged).length > 0;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((x) => { const n = { ...x }; delete n[k]; return n; });
  };

  // The requirements for the chosen program, with what is on file and what is staged.
  const docs = useMemo(() => requirements
    .filter((r) => r.programId === null || r.programId === f.programId)
    .map((r) => {
      const onFile = detail?.program.id === f.programId ? detail.requirements.find((d) => d.requirementId === r.id) : undefined;
      const s = staged[r.id];
      const stored = (onFile?.status ?? 'pending') as DocumentStatus;
      const effective: DocumentStatus = s?.clear ? 'pending' : s?.file || s?.received ? (stored === 'verified' ? 'verified' : 'submitted') : stored;
      return { ...r, onFile, staged: s, stored, effective };
    }), [requirements, f.programId, detail, staged]);

  const program = programs.find((p) => p.id === f.programId) ?? null;
  const year = schoolYears.find((y) => y.id === f.schoolYearId) ?? null;

  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function goTo(n: 1 | 2 | 3) {
    setStep(n);
    formRef.current?.parentElement?.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>(`[data-step="${n}"] input:not([type=hidden]):not([type=file]), [data-step="${n}"] select, [data-step="${n}"] button`);
      first?.focus({ preventScroll: true });
    });
  }

  /** Continue: the step's own required fields and formats must be right before moving on. */
  function next() {
    const found = { ...requiredProblems(), ...formatProblems(f) };
    const here = Object.fromEntries(Object.entries(found).filter(([k]) => stepOf(k) === step && !k.startsWith('documents.')));
    if (Object.keys(here).length) { show(here, 'Complete the highlighted fields to continue.'); return; }
    setProblem(null);
    goTo((step + 1) as 2 | 3);
  }

  function requiredProblems() {
    return submissionProblems(
      { ...f, programId: f.programId || null, schoolYearId: f.schoolYearId || null },
      docs.map((d) => ({ id: d.id, name: d.name, isRequired: d.isRequired, status: d.effective })),
    );
  }

  function show(found: Record<string, string[]>, message: string) {
    setErrors(found);
    setProblem(message);
    // The earliest step with a problem, and its first field.
    const stepToShow = Math.min(...Object.keys(found).map(stepOf)) as 1 | 2 | 3;
    setStep(stepToShow);
    requestAnimationFrame(() => {
      const key = Object.keys(found).find((k) => stepOf(k) === stepToShow)!;
      const el = document.getElementById(key.startsWith('documents.') ? `af-doc-${key.slice(10)}` : `af-${key}`);
      el?.focus();
      el?.scrollIntoView({ block: 'center' });
    });
  }

  function stage(reqId: string, change: Staged | null) {
    setStaged((x) => {
      const n = { ...x };
      if (change === null) delete n[reqId]; else n[reqId] = change;
      return n;
    });
    setFileErrors((x) => { const n = { ...x }; delete n[reqId]; return n; });
    if (errors[`documents.${reqId}`]) setErrors((x) => { const n = { ...x }; delete n[`documents.${reqId}`]; return n; });
  }

  function chooseFile(reqId: string, file: File | undefined) {
    if (!file) return;
    const p = fileProblem(file);
    if (p) { setFileErrors((x) => ({ ...x, [reqId]: p })); return; }
    stage(reqId, { file });
  }

  async function save(mode: 'draft' | 'submit') {
    if (busy) return;
    const format = formatProblems(f);
    if (Object.keys(format).length) { show(format, 'Check the highlighted fields.'); return; }
    if (mode === 'submit') {
      const missing = requiredProblems();
      if (Object.keys(missing).length) { show(missing, 'Complete the highlighted details and documents before submitting.'); return; }
    }
    setBusy(mode); setErrors({}); setProblem(null);

    const body = {
      ...f,
      firstName: f.firstName.trim(), lastName: f.lastName.trim(),
      yearGraduated: f.yearGraduated.trim() || null,
      schoolYearId: f.schoolYearId || null,
      highestEducation: f.highestEducation || null,
    };
    setProgressText('Saving the application…');
    const saved = savedId
      ? await api.put<{ id: string; applicationNumber: string | null }>(`/api/v1/applications/${savedId}`, body)
      : await api.post<{ id: string; applicationNumber: string | null }>('/api/v1/applications', body);
    if (!saved.ok) return fail(saved.message, saved.errors);
    const id = saved.data.id;
    const number = saved.data.applicationNumber ?? 'The application';
    setSavedId(id);
    setInitial(JSON.stringify(f));

    // Then the documents, one at a time; each success is removed from the queue.
    for (const d of docs) {
      const s = staged[d.id];
      if (!s) continue;
      if (s.file) {
        setProgressText(`Uploading ${d.name}…`);
        const form = new FormData();
        form.append('file', s.file);
        const r = await sendForm(`POST`, `/api/v1/applications/${id}/documents/${d.id}`, form);
        if (!r.ok) {
          setFileErrors((x) => ({ ...x, [d.id]: r.errors?.file?.[0] ?? r.message }));
          return fail(`${number} was saved as a draft, but ${d.name} could not be uploaded: ${r.message}`, undefined, 3);
        }
      } else if (s.received || s.clear) {
        const r = await api.post(`/api/v1/applications/${id}/documents/${d.id}/status`, { status: s.clear ? 'pending' : 'submitted' });
        if (!r.ok) return fail(`${number} was saved, but ${d.name} could not be updated: ${r.message}`, undefined, 3);
      }
      setStaged((x) => { const n = { ...x }; delete n[d.id]; return n; });
    }

    if (mode === 'submit' && canSubmit) {
      setProgressText('Submitting…');
      const r = await api.post(`/api/v1/applications/${id}/submit`);
      if (!r.ok) {
        if (r.errors && Object.keys(r.errors).length) { setBusy(false); setProgressText(''); show(r.errors, r.message); return; }
        return fail(`${number} was saved as a draft, but could not be submitted: ${r.message}`);
      }
      setBusy(false); setProgressText('');
      onSaved(`${number} was submitted for admission review.`);
      return;
    }
    setBusy(false); setProgressText('');
    onSaved(editingId ? `${number} was updated.` : `${number} was saved as a draft.`);
  }

  function fail(message: string, fieldErrors?: Record<string, string[]>, goStep?: 1 | 2 | 3) {
    setBusy(false); setProgressText('');
    if (fieldErrors && Object.keys(fieldErrors).length) { show(fieldErrors, message); return; }
    setProblem(message);
    if (goStep) setStep(goStep);
  }

  const e = errors;
  // Desktop: Cancel left; Save Draft, Back and the next step right.
  // Phone: two rows — Back and the next step, then Cancel and Save Draft.
  const primary = step < 3 || canSubmit;
  const footer = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
      <button type="button" onClick={requestClose} disabled={Boolean(busy)} className={`${BTN_SECONDARY} order-3 sm:order-none sm:mr-auto`}>Cancel</button>
      {progressText && <span role="status" className={`order-first col-span-2 text-center text-xs sm:order-none sm:col-span-1 ${MUTED}`}>{progressText}</span>}
      <button type="button" onClick={() => save('draft')} disabled={Boolean(busy) || loading || !!loadError} aria-busy={busy === 'draft'} className={`${BTN_GHOST} order-4 sm:order-none`}>
        {busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        {canSubmit ? 'Save Draft' : 'Save Changes'}
      </button>
      {step > 1 && (
        <button type="button" onClick={() => goTo((step - 1) as 1 | 2)} disabled={Boolean(busy)} className={`${BTN_SECONDARY} order-1 sm:order-none ${primary ? '' : 'col-span-2'}`}>Back</button>
      )}
      {step < 3 ? (
        <button type="button" onClick={next} disabled={Boolean(busy) || loading || !!loadError} className={`${BTN_PRIMARY} order-2 sm:order-none ${step === 1 ? 'col-span-2' : ''}`}>Continue</button>
      ) : canSubmit ? (
        <button type="button" onClick={() => save('submit')} disabled={Boolean(busy) || loading || !!loadError} aria-busy={busy === 'submit'} className={`${BTN_PRIMARY} order-2 sm:order-none`}>
          {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          {busy === 'submit' ? 'Submitting…' : status === 'returned' ? 'Resubmit Application' : 'Submit Application'}
        </button>
      ) : null}
    </div>
  );

  const title = editingId ? 'Edit Application' : 'Record New Application';
  const subtitle = editingId
    ? `${detail?.applicationNumber ?? 'Application'} · ${detail ? detail.fullName : 'loading…'}`
    : 'Create an applicant profile for admission review.';

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        title={title}
        subtitle={subtitle}
        icon={<IconTile icon={FileText} size="lg" />}
        headerExtra={<StepNav steps={STEPS} current={step} onSelect={(n) => goTo(n as 1 | 2 | 3)} />}
        titleClassName="text-xl font-bold tracking-[-0.01em] text-ink"
        maxWidth="sm:max-w-[760px]"
        appearance="fluent"
        animate
        trapFocus
        footer={footer}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the application…</div>
        ) : loadError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{loadError}</p>
        ) : (
          <form id="application-form" ref={formRef} onSubmit={(ev) => { ev.preventDefault(); if (step < 3) next(); else void save(canSubmit ? 'submit' : 'draft'); }} className="space-y-5" noValidate>
            {problem && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{problem}</p>}
            {status === 'returned' && detail?.notes && (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"><b>Returned for correction:</b> {detail.notes}</p>
            )}

            {/* 1 — Applicant details */}
            <div data-step="1" hidden={step !== 1} className="space-y-6">
              <section aria-labelledby="af-personal" className="space-y-4">
                <SectionHead id="af-personal" icon={User} title="Personal Information" hint="As written on the applicant's birth certificate." />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField k="firstName" label="First Name" required placeholder="e.g. Juan" max={100} f={f} e={e} set={set} autoComplete="given-name" />
                  <TextField k="middleName" label="Middle Name" placeholder="e.g. Santos" max={100} f={f} e={e} set={set} autoComplete="additional-name" />
                  <TextField k="lastName" label="Last Name" required placeholder="e.g. Dela Cruz" max={100} f={f} e={e} set={set} autoComplete="family-name" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="af-suffix" className={LABEL}>Suffix<Opt /></label>
                      <Select id="af-suffix" value={f.suffix} onChange={(v) => set('suffix', v)}>
                        <option value="">None</option>
                        {SUFFIXES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </div>
                    <div>
                      <label htmlFor="af-dateOfBirth" className={LABEL}>Date of Birth<Req /></label>
                      <input id="af-dateOfBirth" type="date" className={FIELD} value={f.dateOfBirth} max={new Date().toISOString().slice(0, 10)}
                        onChange={(ev) => set('dateOfBirth', ev.target.value)} aria-invalid={!!e.dateOfBirth || undefined} aria-describedby="af-dateOfBirth-err" aria-required="true" />
                      <Err id="af-dateOfBirth-err" messages={e.dateOfBirth} />
                    </div>
                  </div>
                </div>
              </section>

              <section aria-labelledby="af-contact" className="space-y-4 border-t border-[#E8EEEC] pt-5">
                <SectionHead id="af-contact" icon={Phone} title="Contact Information" hint="Where the office can reach the applicant about this application." />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField k="email" label="Email Address" required type="email" placeholder="name@example.com" max={255} f={f} e={e} set={set} autoComplete="email" />
                  <TextField k="phone" label="Mobile Number" required type="tel" placeholder="e.g. 0917 123 4567" max={30} f={f} e={e} set={set} autoComplete="tel" />
                  <div className="sm:col-span-2">
                    <label htmlFor="af-address" className={LABEL}>Complete Address<Req /></label>
                    <textarea id="af-address" rows={2} maxLength={500} className={`${FIELD} h-auto resize-y py-2.5`} placeholder="House no., street, barangay, city or municipality, province"
                      value={f.address} onChange={(ev) => set('address', ev.target.value)} aria-invalid={!!e.address || undefined} aria-describedby="af-address-err" aria-required="true" />
                    <Err id="af-address-err" messages={e.address} />
                  </div>
                  <TextField k="emergencyContactName" label="Emergency Contact Name" placeholder="Parent or guardian" max={255} f={f} e={e} set={set} />
                  <TextField k="emergencyContactPhone" label="Emergency Contact Number" type="tel" placeholder="e.g. 0918 765 4321" max={30} f={f} e={e} set={set} />
                </div>
              </section>

              <section aria-labelledby="af-program" className="space-y-4 border-t border-[#E8EEEC] pt-5">
                <SectionHead id="af-program" icon={BookMarked} title="Program Preference" hint="The diploma program and school year the applicant is applying for." />
                <fieldset>
                  <legend className={LABEL}>Diploma Program<Req /></legend>
                  {programs.length === 0 ? (
                    <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">No active programs yet. Add one under Programs first.</p>
                  ) : (
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-describedby="af-programId-err" aria-required="true">
                      {programs.map((p) => {
                        const on = f.programId === p.id;
                        return (
                          <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-600 has-[:focus-visible]:ring-offset-2 ${on ? 'border-primary-600 bg-[#F1FAF6]' : 'border-[#D6E2DD] bg-white hover:border-primary-600/50'}`}>
                            <input type="radio" name="af-program" id={on || (!f.programId && p === programs[0]) ? 'af-programId' : undefined} value={p.id} checked={on}
                              onChange={() => set('programId', p.id)} className="mt-0.5 h-4 w-4 border-[#B9C9C2] text-primary-600 focus:ring-primary-600" />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-ink">{p.name}</span>
                              <span className={`block text-xs ${MUTED}`}>{p.code}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <Err id="af-programId-err" messages={e.programId} />
                </fieldset>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="af-schoolYearId" className={LABEL}>Preferred School Year<Req /></label>
                    <Select id="af-schoolYearId" value={f.schoolYearId} onChange={(v) => set('schoolYearId', v)} invalid={!!e.schoolYearId} describedBy="af-schoolYearId-err">
                      <option value="">Choose a school year…</option>
                      {openYears.map((y) => <option key={y.id} value={y.id}>SY {y.label}{y.status === 'ACTIVE' ? ' (current)' : ''}</option>)}
                    </Select>
                    <Err id="af-schoolYearId-err" messages={e.schoolYearId} />
                  </div>
                </div>
              </section>
            </div>

            {/* 2 — Educational background */}
            <div data-step="2" hidden={step !== 2} className="space-y-4">
              <SectionHead icon={GraduationCap} title="Educational Background" hint="The applicant's most recent schooling. Only what admission needs." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="af-highestEducation" className={LABEL}>Highest Educational Attainment<Req /></label>
                  <Select id="af-highestEducation" value={f.highestEducation} onChange={(v) => set('highestEducation', v)} invalid={!!e.highestEducation} describedBy="af-highestEducation-err">
                    <option value="">Choose…</option>
                    {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{EDUCATION_LABELS[l]}</option>)}
                  </Select>
                  <Err id="af-highestEducation-err" messages={e.highestEducation} />
                </div>
                <TextField k="previousSchool" label="Previous School Name" required placeholder="e.g. Dagupan City National High School" max={255} f={f} e={e} set={set} />
                <div>
                  <label htmlFor="af-yearGraduated" className={LABEL}>Year Graduated<Opt /></label>
                  <input id="af-yearGraduated" type="number" inputMode="numeric" min={1950} max={new Date().getFullYear() + 1} step={1} className={FIELD} placeholder={`e.g. ${new Date().getFullYear() - 1}`}
                    value={f.yearGraduated} onChange={(ev) => set('yearGraduated', ev.target.value)} aria-invalid={!!e.yearGraduated || undefined} aria-describedby="af-yearGraduated-err" />
                  <Err id="af-yearGraduated-err" messages={e.yearGraduated} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="af-educationNotes" className={LABEL}>Relevant Educational Information<Opt /></label>
                  <textarea id="af-educationNotes" rows={3} maxLength={NOTES_MAX} className={`${FIELD} h-auto resize-y py-2.5`} placeholder="Strand or track, honors, related training or certificates"
                    value={f.educationNotes} onChange={(ev) => set('educationNotes', ev.target.value)} aria-describedby="af-notes-count af-educationNotes-err" />
                  <div className="mt-1 flex justify-between gap-2">
                    <Err id="af-educationNotes-err" messages={e.educationNotes} />
                    <p id="af-notes-count" className={`ml-auto text-xs tabular-nums ${MUTED}`}>{f.educationNotes.length}/{NOTES_MAX}</p>
                  </div>
                </div>
              </div>
              <p className="flex items-start gap-2 rounded-lg bg-primary-50 px-3.5 py-2.5 text-xs text-primary-800">
                <Info className="mt-px h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                Supporting documents such as Form 137 or the transcript of records are uploaded in the next step, with the other admission requirements.
              </p>
            </div>

            {/* 3 — Program & requirements */}
            <div data-step="3" hidden={step !== 3} className="space-y-5">
              <section aria-labelledby="af-summary" className="rounded-xl border border-[#E2EAE6] bg-[#F8FBFA] p-4">
                <h3 id="af-summary" className="text-[13px] font-semibold uppercase tracking-wide text-muted">Application summary</h3>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Summary label="Applicant" value={[f.firstName, f.middleName, f.lastName, f.suffix].filter((x) => x.trim()).join(' ') || '—'} />
                  <Summary label="Diploma program" value={program ? `${program.name} (${program.code})` : '—'} />
                  <Summary label="School year" value={year ? `SY ${year.label}` : '—'} />
                  <Summary label="Contact" value={[f.email, f.phone].filter((x) => x.trim()).join(' · ') || '—'} />
                  {detail?.applicationNumber && <Summary label="Application no." value={detail.applicationNumber} />}
                  {detail && <Summary label="Status" value={<Badge status={detail.status} />} />}
                </dl>
              </section>

              <section aria-labelledby="af-reqs" className="space-y-3">
                <SectionHead id="af-reqs" icon={ListChecks} title="Requirements Checklist" hint="Upload each document, or mark the paper copy as received. Reviewers verify them during review." />
                {!f.programId ? (
                  <p className={`text-sm ${MUTED}`}>Choose a diploma program in step 1 to see its requirements.</p>
                ) : docs.length === 0 ? (
                  <p className={`text-sm ${MUTED}`}>No admission requirements are set up for this program.</p>
                ) : (
                  <ul className="divide-y divide-[#E8EEEC] rounded-xl border border-[#E2EAE6]" aria-label="Requirements">
                    {docs.map((d) => {
                      const error = fileErrors[d.id] ?? e[`documents.${d.id}`]?.[0];
                      const locked = d.stored === 'verified' && !d.staged;
                      const showFile = d.staged?.file ? { name: d.staged.file.name, size: d.staged.file.size } : !d.staged?.clear && d.onFile?.file ? d.onFile.file : null;
                      return (
                        <li key={d.id} className="grid grid-cols-1 gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-ink">{d.name}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.isRequired ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{d.isRequired ? 'Required' : 'Optional'}</span>
                              <Badge status={d.effective} label={DOCUMENT_STATUS_LABELS[d.effective]} />
                              {d.staged && <span className="text-[11px] font-medium text-primary-600">· saved when you save</span>}
                            </div>
                            {showFile && (
                              <p className={`mt-1 flex items-center gap-1.5 text-xs ${MUTED}`}><Paperclip className="h-3.5 w-3.5" aria-hidden="true" /><span className="truncate">{showFile.name}</span>{bytes(showFile.size) && <span>· {bytes(showFile.size)}</span>}</p>
                            )}
                            {!showFile && (d.staged?.received || (!d.staged && isHandedIn(d.stored) && !d.onFile?.file)) && (
                              <p className={`mt-1 flex items-center gap-1.5 text-xs ${MUTED}`}><CheckCircle2 className="h-3.5 w-3.5 text-primary-600" aria-hidden="true" />Paper copy received</p>
                            )}
                            {d.onFile?.remarks && !d.staged && <p className="mt-1 text-xs text-ink"><span className={MUTED}>Reviewer remarks:</span> {d.onFile.remarks}</p>}
                            {error && <p className="mt-1 text-xs font-medium text-red-700" role="alert">{error}</p>}
                          </div>
                          {canManageDocuments && (
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              {locked ? (
                                <span className={`text-xs ${MUTED}`}>Verified — locked</span>
                              ) : (
                                <>
                                  <label className={`${BTN_SECONDARY} h-9 cursor-pointer px-3 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-600`}>
                                    <Upload className="h-4 w-4" aria-hidden="true" />
                                    {showFile ? 'Replace' : 'Upload'}
                                    <input id={`af-doc-${d.id}`} type="file" accept={UPLOAD_ACCEPT} className="sr-only" aria-label={`Upload ${d.name}`}
                                      onChange={(ev) => { chooseFile(d.id, ev.target.files?.[0]); ev.target.value = ''; }} />
                                  </label>
                                  {!showFile && !isHandedIn(d.effective) && (
                                    <button type="button" className={`${BTN_GHOST} h-9 px-2.5 text-[13px]`} onClick={() => stage(d.id, { received: true })}>Mark received</button>
                                  )}
                                  {d.staged ? (
                                    <button type="button" className={`rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-ink ${RING}`} onClick={() => stage(d.id, null)} aria-label={`Undo the change to ${d.name}`}>
                                      <X className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  ) : isHandedIn(d.stored) || d.stored === 'rejected' ? (
                                    <button type="button" className={`${BTN_GHOST} h-9 px-2.5 text-[13px] text-red-700 hover:bg-red-50`} onClick={() => stage(d.id, { clear: true })}>Remove</button>
                                  ) : null}
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className={`text-xs ${MUTED}`}>PDF, Word, Excel, PowerPoint, JPG or PNG · up to 4 MB each.</p>
              </section>

              <p className="flex items-start gap-2 rounded-lg bg-primary-50 px-3.5 py-2.5 text-xs text-primary-800">
                <Info className="mt-px h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                Recording an application does not enroll the applicant. Once approved, the applicant moves to Enrollments as a pending enrollment for the chosen school year.
              </p>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
        tone="danger"
        title="Discard Changes?"
        description={`What you entered${Object.keys(staged).length ? ' and the files you chose' : ''} will be lost. Save it as a draft instead to finish later.`}
        cancelLabel="Keep editing"
        confirmLabel="Discard"
      />
    </>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={`text-xs ${MUTED}`}>{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-ink">{value}</dd>
    </div>
  );
}

function TextField({ k, label, required, placeholder, max, type = 'text', f, e, set, autoComplete }: {
  k: keyof Form; label: string; required?: boolean; placeholder?: string; max: number; type?: string;
  f: Form; e: Record<string, string[]>; set: <K extends keyof Form>(k: K, v: Form[K]) => void; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={`af-${k}`} className={LABEL}>{label}{required ? <Req /> : <Opt />}</label>
      <input id={`af-${k}`} type={type} className={FIELD} maxLength={max} placeholder={placeholder} autoComplete={autoComplete}
        value={f[k]} onChange={(ev) => set(k, ev.target.value)} aria-invalid={!!e[k] || undefined} aria-describedby={`af-${k}-err`} aria-required={required || undefined} />
      <Err id={`af-${k}-err`} messages={e[k]} />
    </div>
  );
}
