import { useState } from 'react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import {
  BADGES,
  BADGE_KEYS,
  INTERVENTIONS,
  REQUESTABLE_STATUSES,
  REQUESTABLE_STATUS_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
} from '@shared/lib/teaching';
import { useAction } from './client-kit';
import { BTN, BTN_SECONDARY, BTN_SMALL, Field, Flash, INPUT } from './kit';

/**
 * The three things an Instructor can do for one student in one class:
 * recommend a status change, record a Learning Support Recommendation, or
 * award a badge. The server re-checks that the student is on the class roster.
 */

export interface ActionStudent {
  id: string;
  name: string;
  studentNumber: string;
  status: string;
}

type Mode = 'status' | 'support' | 'badge' | null;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StudentActions({ classId, student, disabled }: { classId: string; student: ActionStudent; disabled?: boolean }) {
  const [mode, setMode] = useState<Mode>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5">
        <button type="button" className={BTN_SMALL} disabled={disabled} onClick={() => { setDone(null); setMode('badge'); }}>
          Award badge
        </button>
        <button type="button" className={BTN_SMALL} disabled={disabled} onClick={() => { setDone(null); setMode('support'); }}>
          Learning support
        </button>
        <button type="button" className={BTN_SMALL} disabled={disabled} onClick={() => { setDone(null); setMode('status'); }}>
          Status
        </button>
      </div>
      {done && <p className="sr-only" role="status">{done}</p>}
      <Modal open={mode === 'status'} onClose={() => setMode(null)} title={`Recommend a status change — ${student.name}`}>
        <StatusForm classId={classId} student={student} onDone={(m) => { setDone(m); setMode(null); }} onCancel={() => setMode(null)} />
      </Modal>
      <Modal open={mode === 'support'} onClose={() => setMode(null)} title={`Learning Support Recommendation — ${student.name}`}>
        <SupportForm classId={classId} studentId={student.id} onDone={(m) => { setDone(m); setMode(null); }} onCancel={() => setMode(null)} />
      </Modal>
      <Modal open={mode === 'badge'} onClose={() => setMode(null)} title={`Award a badge — ${student.name}`}>
        <BadgeForm classId={classId} studentId={student.id} onDone={(m) => { setDone(m); setMode(null); }} onCancel={() => setMode(null)} />
      </Modal>
    </>
  );
}

function StatusForm({ classId, student, onDone, onCancel }: { classId: string; student: ActionStudent; onDone: (m: string) => void; onCancel: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [requestedStatus, setRequested] = useState<string>(REQUESTABLE_STATUSES.find((s) => s !== student.status) ?? 'dropped');
  const [reason, setReason] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => api.post('/api/v1/status-requests', { classId, studentId: student.id, requestedStatus, reason }));
        if (ok) onDone('Status request submitted for review.');
      }}
    >
      <p className="text-sm text-tdms-muted">
        Nothing changes on the student record until the TVET Director, Coordinator or Secretary approves it. They are notified now.
      </p>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-tdms-bg p-3 text-sm">
        <div><dt className="text-xs text-tdms-muted">Student</dt><dd className="font-semibold">{student.name} · {student.studentNumber}</dd></div>
        <div><dt className="text-xs text-tdms-muted">Current status</dt><dd className="font-semibold capitalize">{REQUESTABLE_STATUS_LABELS[student.status as keyof typeof REQUESTABLE_STATUS_LABELS] ?? student.status}</dd></div>
      </dl>
      <Field label="Requested status" htmlFor="sr-status" error={errors.requestedStatus}>
        <select id="sr-status" className={INPUT} value={requestedStatus} onChange={(e) => setRequested(e.target.value)}>
          {REQUESTABLE_STATUSES.map((s) => (
            <option key={s} value={s} disabled={s === student.status}>{REQUESTABLE_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </Field>
      <Field label="Reason" htmlFor="sr-reason" error={errors.reason}>
        <textarea id="sr-reason" rows={3} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={2000} placeholder="e.g. Transferred to another institution." />
      </Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</button>
      </div>
    </form>
  );
}

export function SupportForm({
  classId,
  studentId,
  initial,
  supportId,
  onDone,
  onCancel,
}: {
  classId: string;
  studentId: string;
  initial?: { difficulty: string; evidence: string | null; interventions: string[]; support: string | null; followUpOn: string | null; notes: string | null; status: string };
  supportId?: string;
  onDone: (m: string) => void;
  onCancel: () => void;
}) {
  const { busy, error, errors, run } = useAction();
  const [form, setForm] = useState({
    difficulty: initial?.difficulty ?? '',
    evidence: initial?.evidence ?? '',
    interventions: initial?.interventions ?? [],
    support: initial?.support ?? '',
    followUpOn: initial?.followUpOn ?? '',
    notes: initial?.notes ?? '',
    status: initial?.status ?? 'OPEN',
  });
  const toggle = (i: string) =>
    setForm((f) => ({ ...f, interventions: f.interventions.includes(i) ? f.interventions.filter((x) => x !== i) : [...f.interventions, i] }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = { ...form, followUpOn: form.followUpOn || null };
        const ok = supportId
          ? await run(() => api.put(`/api/v1/learning-supports/${supportId}`, body))
          : await run(() => api.post('/api/v1/learning-supports', { ...body, classId, studentId }));
        if (ok) onDone('Learning support saved.');
      }}
    >
      <p className="text-sm text-tdms-muted">Visible to you and to the TVET Director and Coordinator. Never shown to the student.</p>
      <Field label="Observed difficulty" htmlFor="ls-diff" error={errors.difficulty}>
        <textarea id="ls-diff" rows={2} className={INPUT} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} required />
      </Field>
      <Field label="Academic evidence" htmlFor="ls-evidence" error={errors.evidence}>
        <textarea id="ls-evidence" rows={2} className={INPUT} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} placeholder="e.g. Quiz 1–3 below passing; missed two activities." />
      </Field>
      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-tdms-ink">Recommended intervention</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {INTERVENTIONS.map((i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded border-tdms-hairline text-tdms-text focus:ring-tdms-text" checked={form.interventions.includes(i)} onChange={() => toggle(i)} />
              {i}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Suggested support" htmlFor="ls-support" error={errors.support}>
        <input id="ls-support" className={INPUT} value={form.support} onChange={(e) => setForm({ ...form, support: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Follow-up date" htmlFor="ls-follow" error={errors.followUpOn}>
          <input id="ls-follow" type="date" className={INPUT} value={form.followUpOn} onChange={(e) => setForm({ ...form, followUpOn: e.target.value })} />
        </Field>
        <Field label="Status" htmlFor="ls-status" error={errors.status}>
          <select id="ls-status" className={INPUT} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Instructor notes" htmlFor="ls-notes" error={errors.notes}>
        <textarea id="ls-notes" rows={2} className={INPUT} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy}>{busy ? 'Saving…' : 'Save recommendation'}</button>
      </div>
    </form>
  );
}

export function BadgeForm({ classId, studentId, onDone, onCancel }: { classId: string; studentId: string; onDone: (m: string) => void; onCancel: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [form, setForm] = useState({ badge: BADGE_KEYS[0] as string, reason: '', message: '', awardedOn: todayKey() });
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => api.post('/api/v1/badges', { ...form, classId, studentId }));
        if (ok) onDone('Badge awarded.');
      }}
    >
      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-tdms-ink">Badge</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BADGE_KEYS.map((k) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${form.badge === k ? 'border-tdms-text bg-tdms-wash' : 'border-tdms-hairline'}`}>
              <input type="radio" name="badge" className="sr-only" checked={form.badge === k} onChange={() => setForm({ ...form, badge: k })} />
              <span aria-hidden="true" className="text-xl">{BADGES[k].emoji}</span>
              <span className="font-semibold">{BADGES[k].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Reason" htmlFor="b-reason" error={errors.reason}>
        <input id="b-reason" className={INPUT} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required maxLength={255} placeholder="e.g. Perfect score in Quiz 2" />
      </Field>
      <Field label="Message to the student (optional)" htmlFor="b-msg" error={errors.message}>
        <textarea id="b-msg" rows={2} className={INPUT} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={1000} />
      </Field>
      <Field label="Date" htmlFor="b-date" error={errors.awardedOn}>
        <input id="b-date" type="date" className={INPUT} value={form.awardedOn} onChange={(e) => setForm({ ...form, awardedOn: e.target.value })} required />
      </Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy}>{busy ? 'Awarding…' : 'Award badge'}</button>
      </div>
    </form>
  );
}
