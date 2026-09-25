'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card,
  PageHeader,
  EmptyState,
  Badge,
  Pagination,
  FieldError,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT_CLASS,
  LABEL_CLASS,
} from '@/components/ui';

/**
 * Port of livewire/programs/index.blade.php.
 *
 * The Volt component kept form state on the server and round-tripped every
 * keystroke over the Livewire wire; here the form is local state and only
 * the save is a request. The visible result — modal, fields, table columns,
 * Activate/Deactivate toggle — is the same.
 *
 * `can*` flags are computed on the server and passed down. They decide what
 * is *shown*; every route re-checks the policy before it acts.
 */

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  curriculaCount: number;
}

interface Props {
  rows: ProgramRow[];
  page: number;
  lastPage: number;
  total: number;
  canCreate: boolean;
  canUpdate: boolean;
}

const EMPTY = { code: '', name: '', description: '', isActive: true };

export default function ProgramsScreen({ rows, page, lastPage, total, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProgramRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setMessage(null);
    setShowForm(true);
  }

  function openEdit(program: ProgramRow) {
    setEditing(program);
    setForm({
      code: program.code,
      name: program.name,
      description: program.description ?? '',
      isActive: program.isActive,
    });
    setErrors({});
    setMessage(null);
    setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);

    const result = editing
      ? await api.put(`/api/programs/${editing.id}`, form)
      : await api.post('/api/programs', form);

    setBusy(false);

    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }

    setShowForm(false);
    router.refresh();
  }

  async function toggleActive(program: ProgramRow) {
    setBusy(true);
    const result = await api.patch(`/api/programs/${program.id}`);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programs"
        subtitle="Diploma programs and their curriculum versions."
        actions={
          canCreate ? (
            <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Program
            </button>
          ) : null
        }
      />

      {message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
      )}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No programs yet"
            description="Create a diploma program to start building its curriculum."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Curricula</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((program) => (
                    <tr key={program.id}>
                      <td className="px-6 py-3.5 text-sm font-medium text-navy-900">{program.code}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-700">
                        <Link href={`/programs/${program.id}`} className="font-medium text-indigo-600 hover:text-indigo-700">
                          {program.name}
                        </Link>
                        {program.description && (
                          <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">{program.description}</p>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{program.curriculaCount}</td>
                      <td className="px-6 py-3.5">
                        <Badge status={program.isActive ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-6 py-3.5 text-right text-sm">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/programs/${program.id}`} className="font-medium text-slate-600 hover:text-indigo-600">
                            View
                          </Link>
                          {canUpdate && (
                            <>
                              <button type="button" onClick={() => openEdit(program)} className="font-medium text-slate-600 hover:text-indigo-600">
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleActive(program)}
                                disabled={busy}
                                className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50"
                              >
                                {program.isActive ? 'Deactivate' : 'Activate'}
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
            <Pagination page={page} lastPage={lastPage} total={total} basePath="/programs" />
          </>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Program' : 'New Program'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="code">Code</label>
            <input
              id="code"
              className={INPUT_CLASS}
              value={form.code}
              maxLength={20}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
            <FieldError messages={errors.code} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="name">Name</label>
            <input
              id="name"
              className={INPUT_CLASS}
              value={form.name}
              maxLength={255}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <FieldError messages={errors.name} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={3}
              className={INPUT_CLASS}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <FieldError messages={errors.description} />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
