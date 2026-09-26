'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, FieldError, Alert,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import {
  ROLE_LABELS, ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_BADGE,
  type RoleName, type AccountStatus,
} from '@/types/domain';
import { formatDate } from '@/lib/dates';

/**
 * Account administration.
 *
 * Differs from the Laravel screen in one respect that matters: creating an
 * account no longer produces a password for the administrator to read out.
 * It sends an invitation, and the person sets their own password through the
 * verification link. So there is no "one-time password" panel here, because
 * there is no longer a moment at which anyone but the account holder knows
 * the password.
 */

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: AccountStatus;
  emailVerified: boolean;
  role: string | null;
  createdAt: string | null;
}

interface Props {
  rows: AccountRow[];
  page: number;
  lastPage: number;
  total: number;
  roleOptions: string[];
  currentUserId: string;
  canCreate: boolean;
  mailConfigured: boolean;
  institutionalDomain: string;
}

export default function StaffScreen({
  rows, page, lastPage, total, roleOptions, currentUserId,
  canCreate, mailConfigured, institutionalDomain,
}: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'secretary' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() { setErrors({}); setMessage(null); setNotice(null); }

  function openCreate() {
    setEditing(null);
    setForm({
      name: '', email: '',
      role: roleOptions.includes('secretary') ? 'secretary' : (roleOptions[0] ?? ''),
    });
    reset(); setShowForm(true);
  }

  function openEdit(row: AccountRow) {
    setEditing(row);
    setForm({ name: row.name, email: row.email, role: row.role ?? 'secretary' });
    reset(); setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); reset();

    const result = editing
      ? await api.put<{ emailChanged: boolean }>(`/api/staff/${editing.id}`, form)
      : await api.post<{ mailDelivered: boolean; mailDetail?: string }>('/api/staff', form);

    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }

    setShowForm(false);
    if (!editing) {
      const d = result.data as { mailDelivered: boolean; mailDetail?: string };
      setNotice(
        d.mailDelivered
          ? `Invitation sent to ${form.email}. They will set their own password from the link.`
          : `Account created, but the invitation email could not be sent${d.mailDetail ? ` — ${d.mailDetail}` : ''}. Use "Resend invite" once email is configured.`,
      );
    } else if ((result.data as { emailChanged: boolean }).emailChanged) {
      setNotice('Email changed. The account must verify the new address before signing in again.');
    }
    router.refresh();
  }

  async function changeStatus(row: AccountRow, status: AccountStatus) {
    setBusy(true); reset();
    const result = await api.post(`/api/staff/${row.id}/status`, { status });
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    setNotice(`${row.name} is now ${ACCOUNT_STATUS_LABELS[status].toLowerCase()}.`);
    router.refresh();
  }

  async function resendInvite(row: AccountRow) {
    setBusy(true); reset();
    const result = await api.post<{ mailDelivered: boolean; mailDetail?: string }>(
      `/api/staff/${row.id}/resend-verification`,
    );
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    setNotice(
      result.data.mailDelivered
        ? `Verification email re-sent to ${row.email}.`
        : `Could not send the email${result.data.mailDetail ? ` — ${result.data.mailDetail}` : ''}.`,
    );
  }

  async function sendReset(row: AccountRow) {
    setBusy(true); reset();
    const result = await api.post<{ mailDelivered: boolean; mailDetail?: string }>(
      `/api/staff/${row.id}/reset-password`,
    );
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    setNotice(
      result.data.mailDelivered
        ? `Password reset link sent to ${row.email}. Their sessions have been signed out.`
        : `Could not send the email${result.data.mailDetail ? ` — ${result.data.mailDetail}` : ''}.`,
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        subtitle={`Institutional accounts. Every address must be @${institutionalDomain}.`}
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Invite Staff
          </button>
        ) : null}
      />

      {!mailConfigured && (
        <Alert type="warning" title="Email is not configured">
          Invitations and password resets cannot be delivered until mail is configured
          (<code>MAIL_HOST</code> and <code>MAIL_FROM_ADDRESS</code>, or{' '}
          <code>RESEND_API_KEY</code>). Accounts can still be created, but the people invited
          will not receive anything.
        </Alert>
      )}

      {message && <Alert type="danger">{message}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No staff accounts yet"
            description="Invite a colleague using their institutional email address."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Institutional Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-3.5 text-sm font-medium text-navy-900">
                        {row.name}
                        {row.id === currentUserId && (
                          <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">
                        {row.email}
                        <p className="text-xs text-slate-400">
                          {row.emailVerified ? 'Verified' : 'Not verified'}
                          {row.createdAt && ` · added ${formatDate(row.createdAt)}`}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-sm capitalize text-slate-500">
                        {row.role ? (ROLE_LABELS[row.role as RoleName] ?? row.role.replace(/_/g, ' ')) : '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge status={ACCOUNT_STATUS_BADGE[row.status]} label={ACCOUNT_STATUS_LABELS[row.status]} />
                      </td>
                      <td className="px-6 py-3.5 text-right text-sm">
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                          <button type="button" onClick={() => openEdit(row)} disabled={busy}
                            className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                            Edit
                          </button>

                          {!row.emailVerified && (
                            <button type="button" onClick={() => resendInvite(row)} disabled={busy}
                              className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                              Resend invite
                            </button>
                          )}

                          {row.emailVerified && (
                            <button type="button" onClick={() => sendReset(row)} disabled={busy}
                              className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                              Send reset link
                            </button>
                          )}

                          {/* Refused by the server too, not merely hidden. */}
                          {row.id !== currentUserId && (
                            <>
                              {row.status !== 'ACTIVE' && row.emailVerified && (
                                <button type="button" onClick={() => changeStatus(row, 'ACTIVE')} disabled={busy}
                                  className="font-medium text-green-700 hover:text-green-800 disabled:opacity-50">
                                  Activate
                                </button>
                              )}
                              {row.status === 'ACTIVE' && (
                                <button type="button" onClick={() => changeStatus(row, 'INACTIVE')} disabled={busy}
                                  className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                                  Deactivate
                                </button>
                              )}
                              {row.status !== 'SUSPENDED' && (
                                <button type="button" onClick={() => changeStatus(row, 'SUSPENDED')} disabled={busy}
                                  className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
                                  Suspend
                                </button>
                              )}
                            </>
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Account' : 'Invite Staff'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="sf-name">Full Name</label>
            <input id="sf-name" className={INPUT_CLASS} maxLength={255} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <FieldError messages={errors.name} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sf-email">Institutional Email</label>
            <input id="sf-email" type="email" className={INPUT_CLASS} maxLength={255} value={form.email}
              placeholder={`name@${institutionalDomain}`}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <p className="mt-1 text-xs text-slate-500">
              Must end in @{institutionalDomain}. This is checked on the server.
            </p>
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

          {!editing && (
            <Alert type="info">
              No password is created. The account starts as pending, and an email is sent asking
              them to verify the address and choose their own password.
            </Alert>
          )}

          {message && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
