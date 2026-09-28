'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import AdminCredentialsModal from '@/components/AdminCredentialsModal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, FieldError, Alert,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_BADGE, type AccountStatus } from '@/types/domain';
import { PASSWORD_REQUIREMENTS, evaluatePassword } from '@/lib/password-policy';
import { generateTemporaryPassword } from '@/lib/temporary-password';
import { succeeded, type Notice } from '@/lib/notice';
import { formatDate } from '@/lib/dates';

/**
 * Super Admin Dashboard → Admin Accounts.
 *
 * Create an Admin, reissue their temporary password, suspend or reactivate
 * them. Access codes are NOT issued here: they live on Admin Access Codes, and
 * each row links there with the Admin preselected.
 *
 * A temporary password is shown once, in the response that created it, and
 * held only in component state — not localStorage, not the URL — so closing
 * the panel is genuinely the end of it. The server keeps only a bcrypt hash.
 *
 * Nothing here asks for the static Super Admin security code. The signed-in
 * dashboard is the trust boundary for these actions.
 */

export interface AdminRow {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  mustChangePassword: boolean;
  /** False for a leftover invitation that has never been set up. */
  setUp: boolean;
  /** PENDING_INITIAL_SETUP needs an access code at sign-in; ACTIVE does not. */
  setupState: 'PENDING_INITIAL_SETUP' | 'ACTIVE';
  lastLoginAt: string | null;
  createdAt: string | null;
  accessCodeExpiresInSeconds: number | null;
}

interface CreatedAdmin {
  id: string;
  name: string;
  email: string;
  temporaryPassword: string;
  /** Whether it can be shown again later from Credentials. */
  revealable: boolean;
}

interface ReissuedPassword {
  adminId: string;
  name: string;
  email: string;
  temporaryPassword: string;
  activated: boolean;
  codesRevoked: number;
  revealable: boolean;
}

interface Props {
  rows: AdminRow[];
  page: number;
  lastPage: number;
  total: number;
  currentUserId: string;
}

function countdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  temporaryPassword: '',
  temporaryPasswordConfirmation: '',
};

/** Link to the Access Codes page with this Admin preselected in Generate. */
function issueCodeHref(adminId: string): string {
  return `/admin-access-codes?generate=${encodeURIComponent(adminId)}`;
}

export default function AdminAccountsScreen({ rows, page, lastPage, total, currentUserId }: Props) {
  const router = useRouter();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);

  /** The one-shot results. */
  const [created, setCreated] = useState<CreatedAdmin | null>(null);
  const [reissued, setReissued] = useState<ReissuedPassword | null>(null);

  /** The Admin whose credentials modal is open. */
  const [credentialsFor, setCredentialsFor] = useState<string | null>(null);

  /** The row whose password is about to be reset. */
  const [resetTarget, setResetTarget] = useState<AdminRow | null>(null);

  const [copied, setCopied] = useState<string | null>(null);

  const requirements = useMemo(
    () => evaluatePassword(form.temporaryPassword),
    [form.temporaryPassword],
  );

  function clearFeedback() {
    setErrors({});
    setMessage(null);
    setNotice(null);
  }

  function openCreate() {
    clearFeedback();
    setForm(EMPTY_FORM);
    setRevealPassword(false);
    setShowCreate(true);
  }

  function fillGeneratedPassword() {
    // Web Crypto, via the same module the server uses for a reset.
    const generated = generateTemporaryPassword();
    setForm((f) => ({ ...f, temporaryPassword: generated, temporaryPasswordConfirmation: generated }));
    setRevealPassword(true);
    setErrors((e) => ({ ...e, temporaryPassword: [], temporaryPasswordConfirmation: [] }));
  }

  async function copy(labelText: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(labelText);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setNotice({ tone: 'warning', text: 'Could not reach the clipboard. Copy it by hand.' });
    }
  }

  async function createAdmin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();

    const result = await api.post<CreatedAdmin>('/api/admins', form);

    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }

    setShowCreate(false);
    setForm(EMPTY_FORM);
    setCreated(result.data);
    router.refresh();
  }

  async function confirmReset() {
    if (!resetTarget) return;
    setBusy(true);
    clearFeedback();

    const result = await api.post<ReissuedPassword>(`/api/admins/${resetTarget.id}/reset-password`);

    setBusy(false);
    if (!result.ok) {
      setResetTarget(null);
      setMessage(result.message);
      return;
    }

    setResetTarget(null);
    setReissued(result.data);
    router.refresh();
  }

  async function changeStatus(row: AdminRow, status: 'ACTIVE' | 'SUSPENDED') {
    setBusy(true);
    clearFeedback();
    const result = await api.post(`/api/admins/${row.id}/status`, { status });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setNotice(
      succeeded(
        status === 'ACTIVE'
          ? `${row.name} is active again. Issue them an access code when they need to sign in.`
          : `${row.name} is suspended. Their sessions and any unused access code have been revoked.`,
      ),
    );
    router.refresh();
  }

  function CopyButton({ labelText, value }: { labelText: string; value: string }) {
    return (
      <button type="button" onClick={() => copy(labelText, value)} className={BUTTON_SECONDARY}>
        {copied === labelText ? 'Copied' : `Copy ${labelText}`}
      </button>
    );
  }

  function SecretValue({ labelText, value }: { labelText: string; value: string }) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelText}</p>
        <p className="mt-1 select-all break-all rounded-lg border border-border bg-slate-50 px-3 py-2 font-mono text-sm text-navy-900">
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Accounts"
        subtitle="Create administrator accounts and manage their temporary passwords. Access codes are issued from Admin Access Codes."
        actions={
          <>
            <Link href="/admin-access-codes" className={BUTTON_SECONDARY}>
              Admin Access Codes
            </Link>
            <button type="button" onClick={openCreate} className={BUTTON_PRIMARY} disabled={busy}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Admin
            </button>
          </>
        }
      />

      {message && <Alert type="danger">{message}</Alert>}
      {notice && <Alert type={notice.tone}>{notice.text}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No administrator accounts yet"
            description="Create one, then issue them an access code from Admin Access Codes."
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
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Access code</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const isSelf = row.id === currentUserId;
                    // Can actually sign in. A never-set-up account cannot,
                    // whatever its status says.
                    const usable = row.setUp && row.status === 'ACTIVE';
                    // Codes are for initial setup only; a finished account needs none.
                    const inSetup = usable && row.setupState === 'PENDING_INITIAL_SETUP';
                    return (
                      <tr key={row.id}>
                        <td className="px-6 py-3.5 text-sm font-medium text-navy-900">
                          {row.name}
                          {!row.setUp ? (
                            <p className="text-xs font-normal text-amber-700">
                              Never set up — use Reset password
                            </p>
                          ) : (
                            row.mustChangePassword && (
                              <p className="text-xs font-normal text-amber-700">On a temporary password</p>
                            )
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">
                          {row.email}
                          <p className="text-xs text-slate-400">
                            {row.lastLoginAt
                              ? `Last signed in ${formatDate(row.lastLoginAt)}`
                              : 'Has not signed in yet'}
                            {row.createdAt && ` · added ${formatDate(row.createdAt)}`}
                          </p>
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">Admin</td>
                        <td className="px-6 py-3.5">
                          {!row.setUp ? (
                            <Badge status="pending" label="Not set up" />
                          ) : inSetup ? (
                            <Badge status="pending" label="Pending initial setup" />
                          ) : (
                            <Badge
                              status={ACCOUNT_STATUS_BADGE[row.status]}
                              label={ACCOUNT_STATUS_LABELS[row.status]}
                            />
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">
                          {row.setUp && row.setupState === 'ACTIVE' ? (
                            <span className="text-slate-400">Not needed — setup complete</span>
                          ) : row.accessCodeExpiresInSeconds === null ? (
                            <span className="text-slate-400">None active</span>
                          ) : (
                            <span className="font-mono text-xs">
                              Active · {countdown(row.accessCodeExpiresInSeconds)} left
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right text-sm">
                          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => setCredentialsFor(row.id)}
                                className="font-medium text-slate-600 hover:text-indigo-600"
                              >
                                Credentials
                              </button>
                            )}
                            {!isSelf && inSetup && (
                              <Link
                                href={issueCodeHref(row.id)}
                                className="font-medium text-slate-600 hover:text-indigo-600"
                              >
                                Issue code
                              </Link>
                            )}
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => {
                                  clearFeedback();
                                  setResetTarget(row);
                                }}
                                disabled={busy}
                                className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50"
                              >
                                Reset password
                              </button>
                            )}
                            {!isSelf && row.status === 'ACTIVE' && row.setUp && (
                              <button
                                type="button"
                                onClick={() => changeStatus(row, 'SUSPENDED')}
                                disabled={busy}
                                className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                              >
                                Suspend
                              </button>
                            )}
                            {!isSelf && row.status !== 'ACTIVE' && row.setUp && (
                              <button
                                type="button"
                                onClick={() => changeStatus(row, 'ACTIVE')}
                                disabled={busy}
                                className="font-medium text-green-700 hover:text-green-800 disabled:opacity-50"
                              >
                                Reactivate
                              </button>
                            )}
                            {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination page={page} lastPage={lastPage} total={total} basePath="/admins" />
          </>
        )}
      </Card>

      {/* --- Create ---------------------------------------------------- */}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Admin">
        <form onSubmit={createAdmin} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="admin-name">Full name</label>
            <input
              id="admin-name"
              className={INPUT_CLASS}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoComplete="off"
            />
            <FieldError messages={errors.name} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="admin-email">Email address</label>
            <input
              id="admin-email"
              type="email"
              className={INPUT_CLASS}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="off"
            />
            <FieldError messages={errors.email} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={LABEL_CLASS} htmlFor="admin-password">Temporary password</label>
              <button
                type="button"
                onClick={fillGeneratedPassword}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Generate password
              </button>
            </div>
            <input
              id="admin-password"
              type={revealPassword ? 'text' : 'password'}
              className={`${INPUT_CLASS} font-mono`}
              value={form.temporaryPassword}
              onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setRevealPassword((v) => !v)}
              className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              {revealPassword ? 'Hide' : 'Show'}
            </button>

            {/* The same PASSWORD_REQUIREMENTS the server validates against. */}
            <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
              {PASSWORD_REQUIREMENTS.map((requirement) => {
                const met = requirements[requirement.id];
                return (
                  <li key={requirement.id} className={met ? 'text-green-700' : 'text-slate-500'}>
                    <span aria-hidden="true">{met ? '✓ ' : '· '}</span>
                    {requirement.label}
                  </li>
                );
              })}
            </ul>
            <FieldError messages={errors.temporaryPassword} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="admin-password-confirm">
              Confirm temporary password
            </label>
            <input
              id="admin-password-confirm"
              type={revealPassword ? 'text' : 'password'}
              className={`${INPUT_CLASS} font-mono`}
              value={form.temporaryPasswordConfirmation}
              onChange={(e) => setForm({ ...form, temporaryPasswordConfirmation: e.target.value })}
              required
              autoComplete="new-password"
            />
            <FieldError messages={errors.temporaryPasswordConfirmation} />
          </div>

          <p className="text-sm text-slate-500">
            The account is created Active. They will also need an access code to sign in — issue
            one from Admin Access Codes once the account exists.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className={BUTTON_SECONDARY}>
              Cancel
            </button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>
              {busy ? 'Creating…' : 'Create Admin'}
            </button>
          </div>
        </form>
      </Modal>

      <AdminCredentialsModal
        open={credentialsFor !== null}
        onClose={() => setCredentialsFor(null)}
        adminId={credentialsFor}
        title="Admin credentials"
        onGenerateCode={(id) => router.push(issueCodeHref(id))}
        onChanged={() => router.refresh()}
      />

      {/* --- Reset temporary password: confirm -------------------------- */}

      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="Reset temporary password"
        maxWidth="sm:max-w-lg"
      >
        {resetTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              For <span className="font-medium text-navy-900">{resetTarget.name}</span>{' '}
              &lt;{resetTarget.email}&gt;
            </p>

            <p className="text-sm text-slate-600">
              A new temporary password will be generated and shown once. Their sessions are signed
              out, any unused access code is revoked, and they will choose a permanent password the
              next time they sign in.
            </p>

            {!resetTarget.setUp && (
              <Alert type="info">
                This account has never been set up. Resetting its password also confirms the address
                on your authority and activates it — the audit trail records that you confirmed it.
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setResetTarget(null)} className={BUTTON_SECONDARY}>
                Cancel
              </button>
              <button type="button" onClick={confirmReset} className={BUTTON_PRIMARY} disabled={busy}>
                {busy ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- One-shot: a created account -------------------------------- */}

      <Modal open={created !== null} onClose={() => setCreated(null)} title="Admin created successfully">
        {created && (
          <div className="space-y-4">
            {created.revealable ? (
              <Alert type="info" title="Temporary password">
                You can show it again from Credentials until {created.name} chooses their own
                password. Each reveal is recorded.
              </Alert>
            ) : (
              <Alert type="warning" title="Shown once">
                Copy the temporary password now. Revealing is not configured
                (TEMP_CREDENTIAL_KEY), so it cannot be shown again — it would have to be reset.
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</p>
                <p className="mt-1 text-sm text-navy-900">{created.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</p>
                <p className="mt-1 break-all text-sm text-navy-900">{created.email}</p>
              </div>
            </div>

            <SecretValue labelText="Temporary password" value={created.temporaryPassword} />

            <p className="text-sm text-slate-600">
              Next, issue {created.name} an access code. They need the password and the code together
              to sign in.
            </p>

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <CopyButton labelText="password" value={created.temporaryPassword} />
              <Link href={issueCodeHref(created.id)} className={BUTTON_PRIMARY}>
                Generate access code →
              </Link>
              <button type="button" onClick={() => setCreated(null)} className={BUTTON_SECONDARY}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- One-shot: a reissued temporary password -------------------- */}

      <Modal
        open={reissued !== null}
        onClose={() => setReissued(null)}
        title="Temporary password reset"
        maxWidth="sm:max-w-lg"
      >
        {reissued && (
          <div className="space-y-4">
            {reissued.revealable ? (
              <Alert type="info" title="Temporary password">
                The previous temporary password no longer works. This one can be shown again from
                Credentials until they choose their own.
              </Alert>
            ) : (
              <Alert type="warning" title="Shown once">
                Copy it now. Revealing is not configured (TEMP_CREDENTIAL_KEY), so it cannot be shown
                again.
              </Alert>
            )}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Admin</p>
              <p className="mt-1 text-sm text-navy-900">{reissued.name}</p>
              <p className="break-all text-sm text-slate-500">{reissued.email}</p>
            </div>

            <SecretValue labelText="Temporary password" value={reissued.temporaryPassword} />

            {reissued.activated && (
              <Alert type="success">
                The account had never been set up and is now active. You confirmed the address, and
                the audit trail says so.
              </Alert>
            )}

            <p className="text-sm text-slate-600">
              {reissued.codesRevoked > 0
                ? 'Their unused access code was revoked with the old password. '
                : ''}
              They need a new access code to sign in.
            </p>

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <CopyButton labelText="password" value={reissued.temporaryPassword} />
              <Link href={issueCodeHref(reissued.adminId)} className={BUTTON_PRIMARY}>
                Generate access code →
              </Link>
              <button type="button" onClick={() => setReissued(null)} className={BUTTON_SECONDARY}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
