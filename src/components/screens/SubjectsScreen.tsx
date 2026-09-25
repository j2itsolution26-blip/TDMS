'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, FieldError,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { SUBJECT_TYPES, SUBJECT_TYPE_LABELS, type SubjectType } from '@/types/domain';

/** Port of livewire/subjects/index.blade.php. */

export interface SubjectRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  subjectType: string;
  defaultUnits: number;
  isActive: boolean;
}

interface Props {
  rows: SubjectRow[];
  page: number;
  lastPage: number;
  total: number;
  canCreate: boolean;
  canUpdate: boolean;
}

const EMPTY = {
  code: '', title: '', description: '',
  subjectType: 'lecture' as SubjectType, defaultUnits: '', isActive: true,
};

export default function SubjectsScreen({ rows, page, lastPage, total, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditing(null); setForm(EMPTY); setErrors({}); setMessage(null); setShowForm(true);
  }

  function openEdit(s: SubjectRow) {
    setEditing(s);
    setForm({
      code: s.code, title: s.title, description: s.description ?? '',
      subjectType: s.subjectType as SubjectType,
      defaultUnits: String(s.defaultUnits), isActive: s.isActive,
    });
    setErrors({}); setMessage(null); setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);
    const body = { ...form, defaultUnits: form.defaultUnits };
    const result = editing
      ? await api.put(`/api/subjects/${editing.id}`, body)
      : await api.post('/api/subjects', body);
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.errors ? null : result.message); return; }
    setShowForm(false);
    router.refresh();
  }

  async function toggleActive(s: SubjectRow) {
    setBusy(true);
    const result = await api.patch(`/api/subjects/${s.id}`);
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        subtitle="The subject catalogue shared by every curriculum."
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Subject
          </button>
        ) : null}
      />

      {message && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No subjects yet" description="Add a subject so it can be attached to a curriculum." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Units</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-6 py-3.5 text-sm font-medium text-navy-900">{s.code}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-700">{s.title}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">
                        {SUBJECT_TYPE_LABELS[s.subjectType as SubjectType] ?? s.subjectType}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{s.defaultUnits.toFixed(1)}</td>
                      <td className="px-6 py-3.5"><Badge status={s.isActive ? 'active' : 'inactive'} /></td>
                      <td className="px-6 py-3.5 text-right text-sm">
                        {canUpdate && (
                          <div className="flex items-center justify-end gap-3">
                            <button type="button" onClick={() => openEdit(s)} className="font-medium text-slate-600 hover:text-indigo-600">Edit</button>
                            <button type="button" onClick={() => toggleActive(s)} disabled={busy} className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                              {s.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} lastPage={lastPage} total={total} basePath="/subjects" />
          </>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Subject' : 'New Subject'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="s-code">Code</label>
              <input id="s-code" className={INPUT_CLASS} maxLength={20} value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              <FieldError messages={errors.code} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="s-units">Default Units</label>
              <input id="s-units" type="number" step="0.5" min="0" max="99" className={INPUT_CLASS}
                value={form.defaultUnits} onChange={(e) => setForm({ ...form, defaultUnits: e.target.value })} required />
              <FieldError messages={errors.defaultUnits} />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="s-title">Title</label>
            <input id="s-title" className={INPUT_CLASS} maxLength={255} value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <FieldError messages={errors.title} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="s-type">Subject Type</label>
            <select id="s-type" className={INPUT_CLASS} value={form.subjectType}
              onChange={(e) => setForm({ ...form, subjectType: e.target.value as SubjectType })}>
              {SUBJECT_TYPES.map((t) => <option key={t} value={t}>{SUBJECT_TYPE_LABELS[t]}</option>)}
            </select>
            <FieldError messages={errors.subjectType} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="s-desc">Description</label>
            <textarea id="s-desc" rows={3} className={INPUT_CLASS} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <FieldError messages={errors.description} />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active
          </label>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
