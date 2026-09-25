'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, FieldError, Alert,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { ROLE_LABELS, type RoleName } from '@/types/domain';

/** Port of livewire/staff/index.blade.php. */

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isActive: boolean;
  role: string | null;
}

interface Props {
  rows: StaffRow[];
  page: number;
  lastPage: number;
  total: number;
  roleOptions: string[];
  currentUserId: string;
  canCreate: boolean;
}

export default function StaffScreen({
  rows, page, lastPage, total, roleOptions, currentUserId, canCreate,
}: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'secretary' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Shown once, then dismissed — the plain password is never stored.
  const [generated, setGenerated] = useState<{ password: string; forEmail: string } | null>(null);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', email: '', role: roleOptions.includes('secretary') ? 'secretary' : (roleOptions[0] ?? '') });
    setErrors({}); setMessage(null); setShowForm(true);
  }

  function openEdit(row: StaffRow) {
    setEditing(row);
    setForm({ name: row.name, email: row.email, role: row.role ?? 'secretary' });
    setErrors({}); setMessage(null); setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);

    if (editing) {
      const result = await api.put(`/api/staff/${editing.id}`, form);
      setBusy(false);
      if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.errors ? null : result.message); return; }
      setShowForm(false);
      router.refresh();
      return;
    }

    const result = await api.post<{ generatedPassword: string; generatedFor: string }>('/api/staff', form);
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.errors ? null : result.message); return; }
    setShowForm(false);
    setGenerated({ password: result.data.generatedPassword, forEmail: result.data.generatedFor });
    router.refresh();
  }

  async function toggleActive(row: StaffRow) {
    setBusy(true); setMessage(null);
    const result = await api.post(`/api/staff/${row.id}/toggle-active`);
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    router.refresh();
  }

  async function resetPassword(row: StaffRow) {
    setBusy(true); setMessage(null);
    const result = await api.post<{ generatedPassword: string; generatedFor: string }>(
      `/api/staff/${row.id}/reset-password`,
    );
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    setGenerated({ password: result.data.generatedPassword, forEmail: result.data.generatedFor });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        subtitle="Accounts for administrators, faculty and office staff."
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Staff Account
          </button>
        ) : null}
      />

      {message && <Alert type="danger">{message}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No staff accounts" description="Create an account to give someone access." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Sign-in</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-3.5 text-sm font-medium text-navy-900">{row.name}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">
                        {row.email}
                        {row.username && <p className="text-xs text-slate-400">or {row.username}</p>}
                      </td>
                      <td className="px-6 py-3.5 text-sm capitalize text-slate-500">
                        {row.role ? (ROLE_LABELS[row.role as RoleName] ?? row.role.replace(/_/g, ' ')) : '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge status={row.isActive ? 'active' : 'deactivated'} />
                      </td>
                      <td className="px-6 py-3.5 text-right text-sm">
                        <div className="flex items-center justify-end gap-3">
                          <button type="button" onClick={() => openEdit(row)} className="font-medium text-slate-600 hover:text-indigo-600">
                            Edit
                          </button>
                          <button type="button" onClick={() => resetPassword(row)} disabled={busy}
                            className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                            Reset Password
                          </button>
                          {/* Deactivating yourself is refused by the server too. */}
                          {row.id !== currentUserId && (
                            <button type="button" onClick={() => toggleActive(row)} disabled={busy}
                              className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                              {row.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} lastPage={lastPage} total={total} basePath="/staff" />
          </>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Staff Account' : 'New Staff Account'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="sf-name">Name</label>
            <input id="sf-name" className={INPUT_CLASS} maxLength={255} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <FieldError messages={errors.name} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sf-email">Email</label>
            <input id="sf-email" type="email" className={INPUT_CLASS} maxLength={255} value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <FieldError messages={errors.email} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sf-role">Role</label>
            <select id="sf-role" className={INPUT_CLASS} value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r as RoleName] ?? r}</option>
              ))}
            </select>
            <FieldError messages={errors.role} />
          </div>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/*
        One-time password display. This is the only moment the plain value
        exists anywhere: it is hashed before storage and is not written to
        the audit log, so once dismissed it cannot be recovered.
      */}
      <Modal open={generated !== null} onClose={() => setGenerated(null)} title="One-Time Password" maxWidth="sm:max-w-lg">
        {generated && (
          <div className="space-y-4">
            <Alert type="warning" title="Copy this now">
              This password is shown once and cannot be retrieved later. Give it to{' '}
              <span className="font-medium">{generated.forEmail}</span> over a channel you trust.
            </Alert>
            <code className="block rounded-lg border border-border bg-slate-50 px-4 py-3 font-mono text-sm break-all">
              {generated.password}
            </code>
            <div className="flex justify-end">
              <button type="button" className={BUTTON_PRIMARY} onClick={() => setGenerated(null)}>Done</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
