'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOpenOnNew } from '@/lib/use-open-on-new';
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
import { succeeded, type Notice } from '@/lib/notice';
import { PASSWORD_REQUIREMENTS, evaluatePassword } from '@/lib/password-policy';
import { generateTemporaryPassword } from '@/lib/temporary-password';

/**
 * Staff accounts — the Admin's screen.
 *
 * Add Staff creates the account directly: ACTIVE, with a temporary password
 * shown here once. The staff member signs in with it and must choose their own
 * before doing anything else. Reset password issues a fresh temporary password
 * the same way. No email is involved, so onboarding never waits on delivery.
 *
 * A temporary password is held only in component state while its panel is open
 * — never localStorage, never the URL — and the server keeps only its hash.
 */

interface IssuedPassword {
  name: string;
  email: string;
  temporaryPassword: string;
  /** 'created' for a new account, 'reset' for a reissue. */
  kind: 'created' | 'reset';
  activated?: boolean;
}

const EMPTY_PASSWORDS = { temporaryPassword: '', temporaryPasswordConfirmation: '' };

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
  /** Enforced domain, or null when the restriction is off. */
  institutionalDomain: string | null;
}

export default function StaffScreen({
  rows, page, lastPage, total, roleOptions, currentUserId,
  canCreate, institutionalDomain,
}: Props) {
  const router = useRouter();
  useOpenOnNew(canCreate, openCreate);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'secretary' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  /*
   * A notice carries its tone, not just its text. It used to be a bare
   * string rendered unconditionally as a success alert, so "Could not send
   * the email" appeared in green with a tick — the one case where the
   * styling contradicted the words.
   */
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [revealPassword, setRevealPassword] = useState(false);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [resetTarget, setResetTarget] = useState<AccountRow | null>(null);
  const [copied, setCopied] = useState(false);

  const requirements = useMemo(
    () => evaluatePassword(passwords.temporaryPassword),
    [passwords.temporaryPassword],
  );

  function reset() { setErrors({}); setMessage(null); setNotice(null); }

  function openCreate() {
    setEditing(null);
    setForm({
      name: '', email: '',
      role: roleOptions.includes('secretary') ? 'secretary' : (roleOptions[0] ?? ''),
    });
    setPasswords(EMPTY_PASSWORDS);
    setRevealPassword(false);
    reset(); setShowForm(true);
  }

  function fillGeneratedPassword() {
    // Web Crypto, via the same generator the server uses for a reset.
    const generated = generateTemporaryPassword();
    setPasswords({ temporaryPassword: generated, temporaryPasswordConfirmation: generated });
    setRevealPassword(true);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ tone: 'warning', text: 'Could not reach the clipboard. Copy it by hand.' });
    }
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
      : await api.post<{ name: string; email: string; temporaryPassword: string }>('/api/staff', {
          ...form,
          ...passwords,
        });

    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }

    setShowForm(false);
    if (!editing) {
      const d = result.data as { name: string; email: string; temporaryPassword: string };
      setPasswords(EMPTY_PASSWORDS);
      setCopied(false);
      setIssued({ name: d.name, email: d.email, temporaryPassword: d.temporaryPassword, kind: 'created' });
    } else if ((result.data as { emailChanged: boolean }).emailChanged) {
      setNotice(succeeded('Email changed. Their sessions have been signed out.'));
    }
    router.refresh();
  }

  async function changeStatus(row: AccountRow, status: AccountStatus) {
    setBusy(true); reset();
    const result = await api.post(`/api/staff/${row.id}/status`, { status });
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    setNotice(succeeded(`${row.name} is now ${ACCOUNT_STATUS_LABELS[status].toLowerCase()}.`));
    router.refresh();
  }

  async function confirmReset() {
    if (!resetTarget) return;
    setBusy(true); reset();
    const result = await api.post<{ name: string; email: string; temporaryPassword: string; activated: boolean }>(
      `/api/staff/${resetTarget.id}/reset-password`,
    );
    setBusy(false);
    setResetTarget(null);
    if (!result.ok) { setMessage(result.message); return; }
    setCopied(false);
    setIssued({ ...result.data, kind: 'reset' });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        subtitle={
          institutionalDomain
            ? `Institutional accounts. Every address must be @${institutionalDomain}.`
            : 'Staff accounts. Each is created with a temporary password they change at first sign-in.'
        }
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Staff
          </button>
        ) : null}
      />

      {message && <Alert type="danger">{message}</Alert>}
      {notice && <Alert type={notice.tone}>{notice.text}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No staff accounts yet"
            description={
              institutionalDomain
                ? 'Add a colleague using their institutional email address.'
                : 'Add a colleague using their email address.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Email</th>
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
                          {row.emailVerified ? 'Set up' : 'Never set up — use Reset password'}
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

                          {row.id !== currentUserId && (
                            <button type="button" onClick={() => { reset(); setResetTarget(row); }} disabled={busy}
                              className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50">
                              Reset password
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Account' : 'Add Staff'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="sf-name">Full Name</label>
            <input id="sf-name" className={INPUT_CLASS} maxLength={255} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <FieldError messages={errors.name} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sf-email">
              {institutionalDomain ? 'Institutional Email' : 'Email Address'}
            </label>
            <input id="sf-email" type="email" className={INPUT_CLASS} maxLength={255} value={form.email}
              placeholder={institutionalDomain ? `name@${institutionalDomain}` : 'name@example.com'}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <p className="mt-1 text-xs text-slate-500">
              {institutionalDomain
                ? `Must end in @${institutionalDomain}. This is checked on the server.`
                : 'Any valid email address. The format is checked on the server.'}
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
            <>
              <div>
                <div className="flex items-center justify-between">
                  <label className={LABEL_CLASS} htmlFor="sf-password">Temporary Password</label>
                  <button type="button" onClick={fillGeneratedPassword}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                    Generate password
                  </button>
                </div>
                <input id="sf-password" type={revealPassword ? 'text' : 'password'}
                  className={`${INPUT_CLASS} font-mono`} autoComplete="new-password"
                  value={passwords.temporaryPassword}
                  onChange={(e) => setPasswords({ ...passwords, temporaryPassword: e.target.value })} required />
                <button type="button" onClick={() => setRevealPassword((v) => !v)}
                  className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                  {revealPassword ? 'Hide' : 'Show'}
                </button>
                {/* The same PASSWORD_REQUIREMENTS the server validates against. */}
                <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
                  {PASSWORD_REQUIREMENTS.map((r) => (
                    <li key={r.id} className={requirements[r.id] ? 'text-green-700' : 'text-slate-500'}>
                      <span aria-hidden="true">{requirements[r.id] ? '✓ ' : '· '}</span>{r.label}
                    </li>
                  ))}
                </ul>
                <FieldError messages={errors.temporaryPassword} />
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="sf-password-confirm">Confirm Temporary Password</label>
                <input id="sf-password-confirm" type={revealPassword ? 'text' : 'password'}
                  className={`${INPUT_CLASS} font-mono`} autoComplete="new-password"
                  value={passwords.temporaryPasswordConfirmation}
                  onChange={(e) => setPasswords({ ...passwords, temporaryPasswordConfirmation: e.target.value })} required />
                <FieldError messages={errors.temporaryPasswordConfirmation} />
              </div>

              <Alert type="info">
                The account is created Active. They sign in with this temporary password and must
                choose their own straight away. Admin accounts are not created here — a Super Admin
                creates those.
              </Alert>
            </>
          )}

          {message && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --- Reset password: confirm ---------------------------------- */}
      <Modal open={resetTarget !== null} onClose={() => setResetTarget(null)} title="Reset password" maxWidth="sm:max-w-lg">
        {resetTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              For <span className="font-medium text-navy-900">{resetTarget.name}</span> &lt;{resetTarget.email}&gt;
            </p>
            <p className="text-sm text-slate-600">
              A new temporary password will be generated and shown once. Their current password
              stops working, they are signed out everywhere, and they must choose their own at the
              next sign-in.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" className={BUTTON_SECONDARY} onClick={() => setResetTarget(null)}>Cancel</button>
              <button type="button" className={BUTTON_PRIMARY} onClick={confirmReset} disabled={busy}>
                {busy ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- One-shot: the temporary password ------------------------- */}
      <Modal open={issued !== null} onClose={() => setIssued(null)}
        title={issued?.kind === 'reset' ? 'Password reset' : 'Account created'} maxWidth="sm:max-w-lg">
        {issued && (
          <div className="space-y-4">
            <Alert type="warning" title="Shown once">
              Copy the temporary password now and give it to {issued.name} securely. Only its hash is
              stored, so it cannot be shown again — you would reset it.
            </Alert>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Account</p>
              <p className="mt-1 text-sm text-navy-900">{issued.name}</p>
              <p className="break-all text-sm text-slate-500">{issued.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Temporary password</p>
              <p className="mt-1 select-all break-all rounded-lg border border-border bg-slate-50 px-3 py-2 font-mono text-sm text-navy-900">
                {issued.temporaryPassword}
              </p>
            </div>
            {issued.activated && (
              <Alert type="success">This account had never been set up and is now active.</Alert>
            )}
            <p className="text-sm text-slate-600">
              They sign in with their email and this password, then choose their own.
            </p>
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button type="button" className={BUTTON_SECONDARY} onClick={() => copy(issued.temporaryPassword)}>
                {copied ? 'Copied' : 'Copy password'}
              </button>
              <button type="button" className={BUTTON_PRIMARY} onClick={() => setIssued(null)}>Done</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
