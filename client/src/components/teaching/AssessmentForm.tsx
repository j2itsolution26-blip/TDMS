import { useState } from 'react';
import { useRouter } from '@/lib/navigation';
import { api } from '@/lib/api-client';
import { ASSESSMENT_KIND_LABELS, EXAM_TYPES, EXAM_TYPE_LABELS, timeToMinutes, type AssessmentKind } from '@shared/lib/teaching';
import { useAction } from './client-kit';
import { BTN, BTN_SECONDARY, Field, Flash, INPUT } from './kit';

export interface AssessmentFormValues {
  classId: string;
  examType: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  totalItems: number;
  totalPoints: number;
  passingScore: number | null;
  onlineEnabled: boolean;
}

/**
 * Create or edit a quiz, examination, online activity or performance task.
 * Quizzes and exams are scheduled to the minute — date, start and end — and
 * students can open them only inside that window.
 */
export default function AssessmentForm({
  kind,
  classes,
  initial,
  defaultClassId,
  assessmentId,
  onCancel,
}: {
  kind: AssessmentKind;
  classes: { id: string; label: string }[];
  initial?: AssessmentFormValues;
  defaultClassId?: string | null;
  assessmentId?: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { busy, error, errors, run } = useAction();
  const scheduled = kind === 'QUIZ' || kind === 'EXAM';
  const [f, setF] = useState({
    classId: initial?.classId ?? defaultClassId ?? classes[0]?.id ?? '',
    examType: initial?.examType ?? (kind === 'EXAM' ? 'MIDTERM' : ''),
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    instructions: initial?.instructions ?? '',
    date: initial?.date ?? '',
    startTime: initial?.startTime ?? '',
    endTime: initial?.endTime ?? '',
    durationMinutes: initial?.durationMinutes?.toString() ?? '',
    totalItems: initial?.totalItems?.toString() ?? '',
    totalPoints: initial?.totalPoints?.toString() ?? '',
    passingScore: initial?.passingScore?.toString() ?? '',
    onlineEnabled: initial?.onlineEnabled ?? kind !== 'PT',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const window = f.startTime && f.endTime ? timeToMinutes(f.endTime) - timeToMinutes(f.startTime) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      kind,
      classId: f.classId,
      examType: kind === 'EXAM' ? f.examType : null,
      title: f.title,
      description: f.description || null,
      instructions: f.instructions || null,
      date: f.date || null,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
      durationMinutes: f.durationMinutes ? Number(f.durationMinutes) : null,
      totalItems: f.totalItems ? Number(f.totalItems) : 0,
      totalPoints: f.totalPoints,
      passingScore: f.passingScore ? Number(f.passingScore) : null,
      onlineEnabled: f.onlineEnabled,
    };
    const saved = assessmentId
      ? await run(() => api.put<{ id: string }>(`/api/v1/assessments/${assessmentId}`, body))
      : await run(() => api.post<{ id: string }>('/api/v1/assessments', body), { refresh: false });
    if (saved) {
      if (assessmentId) onCancel();
      else router.push(`/teaching/assessments/${saved.id}`);
    }
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Subject / class" htmlFor="a-class" error={errors.classId} className="sm:col-span-2">
          <select id="a-class" className={INPUT} value={f.classId} onChange={set('classId')} disabled={Boolean(assessmentId)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        {kind === 'EXAM' && (
          <Field label="Type of examination" htmlFor="a-exam" error={errors.examType} className="sm:col-span-2">
            <select id="a-exam" className={INPUT} value={f.examType} onChange={set('examType')}>
              {EXAM_TYPES.map((t) => <option key={t} value={t}>{EXAM_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
        )}
        <Field label={`${kind === 'EXAM' ? 'Exam' : ASSESSMENT_KIND_LABELS[kind]} title`} htmlFor="a-title" error={errors.title} className="sm:col-span-2">
          <input id="a-title" className={INPUT} value={f.title} onChange={set('title')} required maxLength={255} placeholder={kind === 'QUIZ' ? 'Quiz 1 – Database Fundamentals' : kind === 'ACTIVITY' ? 'SQL Practice 01' : ''} />
        </Field>
        <Field label="Description" htmlFor="a-desc" error={errors.description} className="sm:col-span-2">
          <textarea id="a-desc" rows={2} className={INPUT} value={f.description} onChange={set('description')} />
        </Field>
        <Field label="Instructions" htmlFor="a-instr" error={errors.instructions} className="sm:col-span-2">
          <textarea id="a-instr" rows={2} className={INPUT} value={f.instructions} onChange={set('instructions')} />
        </Field>
      </div>

      <fieldset className="rounded-xl border border-tdms-hairline p-4">
        <legend className="px-1 text-[13px] font-semibold text-tdms-ink">Availability{scheduled ? '' : ' (optional)'}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Date" htmlFor="a-date" error={errors.date}>
            <input id="a-date" type="date" className={INPUT} value={f.date} onChange={set('date')} required={scheduled} />
          </Field>
          <Field label="Start time" htmlFor="a-start" error={errors.startTime}>
            <input id="a-start" type="time" className={INPUT} value={f.startTime} onChange={set('startTime')} required={scheduled} />
          </Field>
          <Field label="End time" htmlFor="a-end" error={errors.endTime}>
            <input id="a-end" type="time" className={INPUT} value={f.endTime} onChange={set('endTime')} required={scheduled} />
          </Field>
          <Field label="Duration (min)" htmlFor="a-dur" error={errors.durationMinutes} hint={window && window > 0 ? `Window is ${window} min` : undefined}>
            <input id="a-dur" type="number" min={1} max={600} className={INPUT} value={f.durationMinutes} onChange={set('durationMinutes')} placeholder={window && window > 0 ? String(window) : ''} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-tdms-muted">Students can open it only between the start and end time. Each attempt ends at its duration or the end time, whichever comes first.</p>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={kind === 'EXAM' ? 'Total items' : 'Number of questions'} htmlFor="a-items" error={errors.totalItems}>
          <input id="a-items" type="number" min={0} max={500} className={INPUT} value={f.totalItems} onChange={set('totalItems')} />
        </Field>
        <Field label="Total points" htmlFor="a-points" error={errors.totalPoints} hint="Set from the answer key once you save one.">
          <input id="a-points" type="number" min={0.5} step="0.5" className={INPUT} value={f.totalPoints} onChange={set('totalPoints')} required />
        </Field>
        <Field label="Passing score" htmlFor="a-pass" error={errors.passingScore}>
          <input id="a-pass" type="number" min={0} step="0.5" className={INPUT} value={f.passingScore} onChange={set('passingScore')} />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 rounded border-tdms-hairline text-tdms-text focus:ring-tdms-text" checked={f.onlineEnabled} onChange={(e) => setF({ ...f, onlineEnabled: e.target.checked })} />
        <span>
          <span className="font-semibold">Students answer online</span>
          <span className="block text-xs text-tdms-muted">Scored automatically from the answer key. Leave off for paper sheets (check them with the student&apos;s QR) or scores you enter yourself.</span>
        </span>
      </label>

      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy}>{busy ? 'Saving…' : assessmentId ? 'Save changes' : 'Create'}</button>
      </div>
    </form>
  );
}
