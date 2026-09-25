'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, FieldError,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';

/** Port of livewire/programs/show.blade.php. */

export interface CurriculumRow {
  id: string;
  versionLabel: string;
  effectiveSchoolYear: string;
  isActive: boolean;
  subjectCount: number;
}

interface Props {
  program: { id: string; code: string; name: string; description: string | null };
  rows: CurriculumRow[];
  canCreate: boolean;
  canUpdate: boolean;
}

const EMPTY = { versionLabel: '', effectiveSchoolYear: '', isActive: true };

export default function ProgramDetailScreen({ program, rows, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CurriculumRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditing(null); setForm(EMPTY); setErrors({}); setMessage(null); setShowForm(true);
  }

  function openEdit(c: CurriculumRow) {
    setEditing(c);
    setForm({ versionLabel: c.versionLabel, effectiveSchoolYear: c.effectiveSchoolYear, isActive: c.isActive });
    setErrors({}); setMessage(null); setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);
    const result = editing
      ? await api.put(`/api/curricula/${editing.id}`, form)
      : await api.post(`/api/programs/${program.id}/curricula`, form);
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.errors ? null : result.message); return; }
    setShowForm(false);
    router.refresh();
  }

  async function toggleActive(c: CurriculumRow) {
    setBusy(true);
    const result = await api.patch(`/api/curricula/${c.id}`);
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/programs" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          &larr; Back to Programs
        </Link>
      </div>

      <PageHeader
        title={program.name}
        subtitle={`${program.code}${program.description ? ` — ${program.description}` : ''}`}
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Curriculum
          </button>
        ) : null}
      />

      {message && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No curricula yet" description="Add a curriculum version for this program." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">School Year</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Subjects</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-3.5 text-sm font-medium text-navy-900">
                      <Link href={`/curricula/${c.id}`} className="text-indigo-600 hover:text-indigo-700">
                        {c.versionLabel}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{c.effectiveSchoolYear}</td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{c.subjectCount}</td>
                    <td className="px-6 py-3.5"><Badge status={c.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-6 py-3.5 text-right text-sm">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/curricula/${c.id}`} className="font-medium text-slate-600 hover:text-indigo-600">
                          Subjects
                        </Link>
                        {canUpdate && (
                          <>
                            <button type="button" onClick={() => openEdit(c)} className="font-medium text-slate-600 hover:text-indigo-600">Edit</button>
                            <button type="button" onClick={() => toggleActive(c)} disabled={busy}
                              className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                              {c.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Curriculum' : 'New Curriculum'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="c-version">Version Label</label>
            <input id="c-version" className={INPUT_CLASS} maxLength={50} value={form.versionLabel}
              onChange={(e) => setForm({ ...form, versionLabel: e.target.value })} required />
            <FieldError messages={errors.versionLabel} />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="c-year">Effective School Year</label>
            <input id="c-year" className={INPUT_CLASS} maxLength={20} placeholder="2025-2026"
              value={form.effectiveSchoolYear}
              onChange={(e) => setForm({ ...form, effectiveSchoolYear: e.target.value })} required />
            <FieldError messages={errors.effectiveSchoolYear} />
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
