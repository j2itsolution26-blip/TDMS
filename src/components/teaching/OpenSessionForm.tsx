'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAction } from './client-kit';
import { BTN, Field, Flash, INPUT } from './kit';

export interface OpenableClass {
  id: string;
  label: string;
  /** Today's meeting times for this class, if it meets today. */
  today: { startTime: string; endTime: string }[];
  /** Any meeting time, as a default when it does not meet today. */
  any: { startTime: string; endTime: string } | null;
}

/** Start Attendance: pick the class and meeting, then go straight to scanning. */
export default function OpenSessionForm({
  classes,
  today,
  initial,
}: {
  classes: OpenableClass[];
  today: string;
  initial: { classId: string | null; start: string | null; end: string | null };
}) {
  const router = useRouter();
  const { busy, error, errors, run } = useAction();
  const firstClass = classes.find((c) => c.id === initial.classId) ?? classes.find((c) => c.today.length > 0) ?? classes[0];
  const defaults = (c: OpenableClass | undefined) => c?.today[0] ?? c?.any ?? { startTime: '08:00', endTime: '10:00' };
  const [form, setForm] = useState({
    classId: firstClass?.id ?? '',
    meetingDate: today,
    startTime: initial.start ?? defaults(firstClass).startTime,
    endTime: initial.end ?? defaults(firstClass).endTime,
    lateAfterMinutes: '15',
  });

  if (classes.length === 0) {
    return <p className="text-sm text-tdms-muted">You have no classes in the current school year.</p>;
  }

  return (
    <form
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const session = await run(() => api.post<{ id: string }>('/api/attendance/sessions', form), { refresh: false });
        if (session) router.push(`/teaching/attendance/${session.id}`);
      }}
    >
      <Field label="Class" htmlFor="os-class" error={errors.classId} className="sm:col-span-2 lg:col-span-2">
        <select
          id="os-class"
          className={INPUT}
          value={form.classId}
          onChange={(e) => {
            const c = classes.find((x) => x.id === e.target.value);
            const d = defaults(c);
            setForm({ ...form, classId: e.target.value, startTime: d.startTime, endTime: d.endTime });
          }}
        >
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Date" htmlFor="os-date" error={errors.meetingDate}>
        <input id="os-date" type="date" className={INPUT} value={form.meetingDate} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} required />
      </Field>
      <Field label="Start" htmlFor="os-start" error={errors.startTime}>
        <input id="os-start" type="time" className={INPUT} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
      </Field>
      <Field label="End" htmlFor="os-end" error={errors.endTime}>
        <input id="os-end" type="time" className={INPUT} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
      </Field>
      <Field label="Late after (min)" htmlFor="os-late" error={errors.lateAfterMinutes}>
        <input id="os-late" type="number" min={0} max={120} className={INPUT} value={form.lateAfterMinutes} onChange={(e) => setForm({ ...form, lateAfterMinutes: e.target.value })} />
      </Field>
      {error && !Object.keys(errors).length && <div className="sm:col-span-2 lg:col-span-6"><Flash kind="error">{error}</Flash></div>}
      <div className="sm:col-span-2 lg:col-span-6">
        <button type="submit" className={BTN} disabled={busy}>{busy ? 'Starting…' : 'Start Attendance'}</button>
      </div>
    </form>
  );
}
