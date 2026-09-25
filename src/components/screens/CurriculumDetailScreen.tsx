'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, FieldError,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';

/** Port of livewire/curricula/show.blade.php. */

export interface EntryRow {
  id: string;
  yearLevel: number;
  semester: number;
  units: number;
  subject: { id: string; code: string; title: string };
  prerequisite: { id: string; code: string; title: string } | null;
}

export interface SubjectOption { id: string; code: string; title: string; defaultUnits: number }

interface Props {
  curriculum: {
    id: string;
    versionLabel: string;
    effectiveSchoolYear: string;
    program: { id: string; name: string; code: string };
  };
  entries: EntryRow[];
  subjects: SubjectOption[];
  canCreate: boolean;
  canDelete: boolean;
}

const EMPTY = { subjectId: '', prerequisiteSubjectId: '', yearLevel: 1, semester: 1, units: '' };

export default function CurriculumDetailScreen({
  curriculum, entries, subjects, canCreate, canDelete,
}: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** updatedSubjectId() in the Volt component prefilled units. */
  function chooseSubject(subjectId: string) {
    const subject = subjects.find((s) => s.id === subjectId);
    setForm((f) => ({
      ...f,
      subjectId,
      units: subject ? String(subject.defaultUnits) : f.units,
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);
    const result = await api.post(`/api/curricula/${curriculum.id}/subjects`, {
      ...form,
      prerequisiteSubjectId: form.prerequisiteSubjectId || null,
    });
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.errors ? null : result.message); return; }
    setShowForm(false); setForm(EMPTY);
    router.refresh();
  }

  async function remove(entry: EntryRow) {
    setBusy(true); setMessage(null);
    const result = await api.del(`/api/curricula/${curriculum.id}/subjects/${entry.id}`);
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/programs/${curriculum.program.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          &larr; Back to {curriculum.program.name}
        </Link>
      </div>

      <PageHeader
        title={`${curriculum.program.code} — ${curriculum.versionLabel}`}
        subtitle={`Effective ${curriculum.effectiveSchoolYear}`}
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={() => { setForm(EMPTY); setErrors({}); setShowForm(true); }}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Subject
          </button>
        ) : null}
      />

      {message && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>}

      <Card padding="p-0">
        {entries.length === 0 ? (
          <EmptyState title="No subjects in this curriculum" description="Attach subjects to build the study plan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Year</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Sem</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Prerequisite</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Units</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{e.yearLevel}</td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{e.semester}</td>
                    <td className="px-6 py-3.5 text-sm">
                      <p className="font-medium text-navy-900">{e.subject.code}</p>
                      <p className="text-xs text-slate-500">{e.subject.title}</p>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">
                      {e.prerequisite ? e.prerequisite.code : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{e.units.toFixed(1)}</td>
                    <td className="px-6 py-3.5 text-right text-sm">
                      {canDelete && (
                        <button type="button" onClick={() => remove(e)} disabled={busy}
                          className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Subject to Curriculum">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="cs-subject">Subject</label>
            <select id="cs-subject" className={INPUT_CLASS} value={form.subjectId} required
              onChange={(e) => chooseSubject(e.target.value)}>
              <option value="">Select a subject…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
            </select>
            <FieldError messages={errors.subjectId} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="cs-prereq">Prerequisite (optional)</label>
            <select id="cs-prereq" className={INPUT_CLASS} value={form.prerequisiteSubjectId}
              onChange={(e) => setForm({ ...form, prerequisiteSubjectId: e.target.value })}>
              <option value="">None</option>
              {subjects.filter((s) => s.id !== form.subjectId).map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.title}</option>
              ))}
            </select>
            <FieldError messages={errors.prerequisiteSubjectId} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="cs-year">Year Level</label>
              <input id="cs-year" type="number" min={1} max={4} className={INPUT_CLASS} value={form.yearLevel}
                onChange={(e) => setForm({ ...form, yearLevel: Number(e.target.value) })} required />
              <FieldError messages={errors.yearLevel} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="cs-sem">Semester</label>
              <input id="cs-sem" type="number" min={1} max={2} className={INPUT_CLASS} value={form.semester}
                onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })} required />
              <FieldError messages={errors.semester} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="cs-units">Units</label>
              <input id="cs-units" type="number" step="0.5" min="0" max="99" className={INPUT_CLASS}
                value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} required />
              <FieldError messages={errors.units} />
            </div>
          </div>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
