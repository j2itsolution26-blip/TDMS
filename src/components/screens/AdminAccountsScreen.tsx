'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, FieldError, Alert,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { ACCOUNT_STATUS_LABELS, ACCOUNT_STATUS_BADGE, type AccountStatus } from '@/types/domain';
import { PASSWORD_REQUIREMENTS, evaluatePassword } from '@/lib/password-policy';
import { generateTemporaryPassword } from '@/lib/temporary-password';
import { succeeded, undelivered, type Notice } from '@/lib/notice';
import { formatDate } from '@/lib/dates';

/**
 * Administration → Admin Accounts.
 *
 * The Super Admin's console for administrator accounts: create one, issue it
 * an access code, reissue a temporary password, suspend it, bring it back.
 *
 * WHAT THIS SCREEN SHOWS ONCE AND NEVER AGAIN
 *
 * A temporary password and an access code are shown exactly once, in the
 * response to the request that created them. They are held in component
 * state and nowhere else — not in localStorage, not in the URL, not in a
 * router cache entry — so closing the panel is genuinely the end of them.
 * The server stores only bcrypt hashes and cannot reproduce either.
 *
 * That is why the panel is insistent about being read before it is dismissed.
 * "Generate a new one" is always available and costs nothing, so losing a
 * code is an inconvenience rather than a problem; the alternative — keeping
 * it retrievable — would mean a credential sitting in a database that
 * somebody can read back for the rest of the account's life.
 *
 * THE SECURITY CODE FIELD
 *
 * Each credential-issuing action asks for the static Super Admin security
 * code. It is typed here and checked on the server against an environment
 * variable; it is never fetched, never returned, and this component has no
 * way to learn it or to tell a wrong one from an unconfigured one — the
 * server says which.
 */

export interface AdminRow {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  accessCodeExpiresInSeconds: number | null;
}

interface IssuedAccount {
  id: string;
  name: string;
  email: string;
  temporaryPassword: string;
  accessCode: string;
  accessCodeExpiresInSeconds: number;
  mailDelivered: boolean;
  mailDetail?: string;
}

interface IssuedCode {
  adminId: string;
  name: string;
  email: string;
  accessCode: string;
  accessCodeExpiresInSeconds: number;
  mailDelivered: boolean;
  mailDetail?: string;
}

interface IssuedPassword {
  adminId: string;
  name: string;
  email: string;
  temporaryPassword: string;
  activated: boolean;
}

interface Props {
  rows: AdminRow[];
  page: number;
  lastPage: number;
  total: number;
  currentUserId: string;
  mailConfigured: boolean;
  securityCodeConfigured: boolean;
  accessCodeTtlMinutes: number;
}

/** mm:ss, for the code countdowns. */
function countdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  temporaryPassword: '',
  temporaryPasswordConfirmation: '',
  securityCode: '',
  emailAccessCode: false,
};

/** Which secondary action a modal is collecting a security code for. */
type PendingAction =
  | { kind: 'code'; row: AdminRow }
  | { kind: 'password'; row: AdminRow }
  | null;

export default function AdminAccountsScreen({
  rows,
  page,
  lastPage,
  total,
  currentUserId,
  mailConfigured,
  securityCodeConfigured,
  accessCodeTtlMinutes,
}: Props) {
  const router = useRouter();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);

  /** The one-shot results. Only ever one of these is set at a time. */
  const [issuedAccount, setIssuedAccount] = useState<IssuedAccount | null>(null);
  const [issuedCode, setIssuedCode] = useState<IssuedCode | null>(null);
  const [issuedPassword, setIssuedPassword] = useState<IssuedPassword | null>(null);

  const [pending, setPending] = useState<PendingAction>(null);
  const [actionCode, setActionCode] = useState('');
  const [actionEmail, setActionEmail] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  const requirements = useMemo(
    () => evaluatePassword(form.temporaryPassword),
    [form.temporaryPassword],
  );

  /*
   * A live countdown on whichever code is currently on screen.
   *
   * Seconds remaining, counted down locally from a value the server produced,
   * rather than an absolute expiry time compared against the browser's clock.
   * A machine whose clock is wrong would otherwise show a live code as
   * expired, or worse the other way round.
   */
  const shownCode = issuedAccount ?? issuedCode;
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!shownCode) return;
    setSecondsLeft(shownCode.accessCodeExpiresInSeconds);
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [shownCode]);

  function reset() {
    setErrors({});
    setMessage(null);
    setNotice(null);
  }

  function openCreate() {
    reset();
    setForm(EMPTY_FORM);
    setRevealPassword(false);
    setShowCreate(true);
  }

  function fillGeneratedPassword() {
    /*
     * Generated in the browser with Web Crypto, by the same module the server
     * uses for a reissue — so the two cannot drift apart in alphabet, length
     * or which policy requirements they guarantee.
     */
    const generated = generateTemporaryPassword();
    setForm((f) => ({
      ...f,
      temporaryPassword: generated,
      temporaryPasswordConfirmation: generated,
    }));
    // Shown, because a password nobody can read is a password nobody can pass on.
    setRevealPassword(true);
    setErrors((e) => ({ ...e, temporaryPassword: [], temporaryPasswordConfirmation: [] }));
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused; the value is on screen either way.
      setNotice({ tone: 'warning', text: 'Could not reach the clipboard. Copy it by hand.' });
    }
  }

  // --- Create --------------------------------------------------------------

  async function createAdmin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    reset();

    const result = await api.post<IssuedAccount>('/api/admins', form);

    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }

    setShowCreate(false);
    setForm(EMPTY_FORM);
    setIssuedAccount(result.data);
    router.refresh();
  }

  // --- Secondary actions ---------------------------------------------------

  function askFor(action: NonNullable<PendingAction>) {
    reset();
    setActionCode('');
    setActionEmail(false);
    setPending(action);
  }

  async function confirmPending(event: React.FormEvent) {
    event.preventDefault();
    if (!pending) return;

    setBusy(true);
    reset();

    if (pending.kind === 'code') {
      const result = await api.post<IssuedCode>(`/api/admins/${pending.row.id}/access-code`, {
        securityCode: actionCode,
        emailAccessCode: actionEmail,
      });
      setBusy(false);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.errors ? null : result.message);
        return;
      }
      setPending(null);
      setIssuedCode(result.data);
    } else {
      const result = await api.post<IssuedPassword>(
        `/api/admins/${pending.row.id}/reset-password`,
        { securityCode: actionCode },
      );
      setBusy(false);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.errors ? null : result.message);
        return;
      }
      setPending(null);
      setIssuedPassword(result.data);
    }

    setActionCode('');
    router.refresh();
  }

  async function changeStatus(row: AdminRow, status: 'ACTIVE' | 'SUSPENDED') {
    setBusy(true);
    reset();
    const result = await api.post(`/api/admins/${row.id}/status`, { status });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setNotice(
      succeeded(
        status === 'ACTIVE'
          ? `${row.name} is active again.`
          : `${row.name} is suspended. Their sessions and any unused access code have been cancelled.`,
      ),
    );
    router.refresh();
  }

  // --- Rendering helpers ---------------------------------------------------

  function CopyButton({ label, value }: { label: string; value: string }) {
    return (
      <button
        type="button"
        onClick={() => copy(label, value)}
        className={BUTTON_SECONDARY}
      >
        {copied === label ? 'Copied' : `Copy ${label}`}
      </button>
    );
  }

  /** A credential on screen: monospaced, selectable, and clearly one-shot. */
  function SecretValue({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
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
        subtitle="Create administrator accounts and issue the one-time access codes they sign in with."
        actions={
          <button type="button" onClick={openCreate} className={BUTTON_PRIMARY} disabled={busy}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Admin
          </button>
        }
      />

      {/*
        Stated up front rather than only when an action fails. Without the
        security code nothing on this screen can issue a credential, and
        finding that out three fields into a form is worse than being told.
      */}
      {!securityCodeConfigured && (
        <Alert type="warning" title="The Super Admin security code is not configured">
          Creating an administrator, issuing an access code and reissuing a temporary password all
          require it. Set <code>SUPER_ADMIN_STATIC_CODE</code> in the server environment — it is
          never stored in this database and never sent to the browser.
        </Alert>
      )}

      {!mailConfigured && (
        <Alert type="warning" title="Email is not configured">
          Access codes cannot be emailed, so they have to be handed over another way. The code is
          shown on screen when it is generated, which is the only time it is available.
        </Alert>
      )}

      {message && <Alert type="danger">{message}</Alert>}
      {notice && <Alert type={notice.tone}>{notice.text}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No administrator accounts yet"
            description="Create one, and hand over the temporary password and access code it produces."
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
                    return (
                      <tr key={row.id}>
                        <td className="px-6 py-3.5 text-sm font-medium text-navy-900">
                          {row.name}
                          {row.mustChangePassword && (
                            <p className="text-xs font-normal text-amber-700">
                              On a temporary password
                            </p>
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
                          <Badge
                            status={ACCOUNT_STATUS_BADGE[row.status]}
                            label={ACCOUNT_STATUS_LABELS[row.status]}
                          />
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">
                          {row.accessCodeExpiresInSeconds === null ? (
                            <span className="text-slate-400">None issued</span>
                          ) : (
                            /*
                             * Time remaining, never the code. The code left
                             * this server once, when it was generated.
                             */
                            <span className="font-mono text-xs">
                              Live · {countdown(row.accessCodeExpiresInSeconds)} left
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right text-sm">
                          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                            {/*
                              Hidden for oneself, and refused by the server too:
                              a Super Admin suspending their own account locks
                              the institution out of its own system.
                            */}
                            {!isSelf && row.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => askFor({ kind: 'code', row })}
                                disabled={busy}
                                className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50"
                              >
                                Generate code
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => askFor({ kind: 'password', row })}
                                disabled={busy}
                                className="font-medium text-slate-600 hover:text-indigo-600 disabled:opacity-50"
                              >
                                Reset password
                              </button>
                            )}

                            {!isSelf && row.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => changeStatus(row, 'SUSPENDED')}
                                disabled={busy}
                                className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                              >
                                Suspend
                              </button>
                            )}

                            {!isSelf && row.status !== 'ACTIVE' && (
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

            {/*
              The same checklist as every other password field, built from the
              same PASSWORD_REQUIREMENTS list the server validates against. A
              temporary password is temporary, not exempt.
            */}
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
              onChange={(e) =>
                setForm({ ...form, temporaryPasswordConfirmation: e.target.value })
              }
              required
              autoComplete="new-password"
            />
            <FieldError messages={errors.temporaryPasswordConfirmation} />
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.emailAccessCode}
              onChange={(e) => setForm({ ...form, emailAccessCode: e.target.checked })}
              disabled={!mailConfigured}
            />
            <span>
              Email the access code to them.
              <span className="block text-xs text-slate-500">
                The temporary password is never emailed — hand that over yourself, so one mailbox
                is never a complete set of credentials.
              </span>
            </span>
          </label>

          <div className="border-t border-border pt-4">
            <label className={LABEL_CLASS} htmlFor="admin-security-code">
              Super Admin security code
            </label>
            <input
              id="admin-security-code"
              type="password"
              className={INPUT_CLASS}
              value={form.securityCode}
              onChange={(e) => setForm({ ...form, securityCode: e.target.value })}
              required
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-500">
              Confirms it is you and not a borrowed session. Checked on the server; it is not
              stored in this database.
            </p>
            <FieldError messages={errors.securityCode} />
          </div>

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

      {/* --- Security code prompt for the secondary actions ------------- */}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.kind === 'code' ? 'Generate access code' : 'Reset temporary password'}
        maxWidth="sm:max-w-lg"
      >
        {pending && (
          <form onSubmit={confirmPending} className="space-y-4">
            <p className="text-sm text-slate-600">
              For <span className="font-medium text-navy-900">{pending.row.name}</span>{' '}
              &lt;{pending.row.email}&gt;.
            </p>

            {pending.kind === 'code' ? (
              <Alert type="info">
                Any unused code this administrator already has is cancelled. The new code is shown
                once, lasts {accessCodeTtlMinutes} minutes, and works a single time.
              </Alert>
            ) : (
              <Alert type="warning">
                A new temporary password is generated and shown once. Every session for this
                account is signed out, any half-finished sign-in is dropped, and they will be asked
                to choose a permanent password the next time they get in.
                {pending.row.status === 'PENDING' && (
                  <span className="mt-2 block">
                    This account is still waiting on email verification, which would stop the new
                    password working. Issuing one confirms the address on your authority and
                    activates the account — the audit trail records that it was you who confirmed
                    it, not them.
                  </span>
                )}
              </Alert>
            )}

            {pending.kind === 'code' && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={actionEmail}
                  onChange={(e) => setActionEmail(e.target.checked)}
                  disabled={!mailConfigured}
                />
                Email the code to them as well
              </label>
            )}

            <div>
              <label className={LABEL_CLASS} htmlFor="pending-security-code">
                Super Admin security code
              </label>
              <input
                id="pending-security-code"
                type="password"
                className={INPUT_CLASS}
                value={actionCode}
                onChange={(e) => setActionCode(e.target.value)}
                required
                autoFocus
                autoComplete="off"
              />
              <FieldError messages={errors.securityCode} />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPending(null)} className={BUTTON_SECONDARY}>
                Cancel
              </button>
              <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>
                {busy ? 'Working…' : pending.kind === 'code' ? 'Generate code' : 'Reset password'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* --- One-shot: a created account -------------------------------- */}

      <Modal
        open={issuedAccount !== null}
        onClose={() => setIssuedAccount(null)}
        title="Admin created successfully"
      >
        {issuedAccount && (
          <div className="space-y-4">
            <Alert type="warning" title="Read this before closing">
              The password and code below are shown once and cannot be retrieved afterwards — only
              their hashes are stored. Copy them now. A new code can always be generated; the
              password would have to be reset.
            </Alert>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</p>
                <p className="mt-1 text-sm text-navy-900">{issuedAccount.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</p>
                <p className="mt-1 break-all text-sm text-navy-900">{issuedAccount.email}</p>
              </div>
            </div>

            <SecretValue label="Temporary password" value={issuedAccount.temporaryPassword} />
            <SecretValue label="Access code" value={issuedAccount.accessCode} />

            <p className="text-sm text-slate-600">
              Code expires in{' '}
              <span className="font-mono font-medium text-navy-900">{countdown(secondsLeft)}</span>
              {secondsLeft === 0 && ' — generate a new one from the table.'}
            </p>

            {issuedAccount.mailDelivered && (
              <Alert type="success">The access code has also been emailed to {issuedAccount.email}.</Alert>
            )}
            {!issuedAccount.mailDelivered && issuedAccount.mailDetail && (
              <Alert type="warning">
                {undelivered('The access code could not be emailed', issuedAccount.mailDetail).text}
              </Alert>
            )}

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <CopyButton label="password" value={issuedAccount.temporaryPassword} />
              <CopyButton label="code" value={issuedAccount.accessCode} />
              <CopyButton
                label="credentials"
                value={[
                  `TDMS administrator account`,
                  `Name: ${issuedAccount.name}`,
                  `Email: ${issuedAccount.email}`,
                  `Temporary password: ${issuedAccount.temporaryPassword}`,
                  `Access code: ${issuedAccount.accessCode}`,
                  `The code expires ${accessCodeTtlMinutes} minutes after it was generated and works once.`,
                  `Change the password as soon as you are in.`,
                ].join('\n')}
              />
              <button
                type="button"
                onClick={() => setIssuedAccount(null)}
                className={BUTTON_PRIMARY}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- One-shot: a reissued code ---------------------------------- */}

      <Modal
        open={issuedCode !== null}
        onClose={() => setIssuedCode(null)}
        title="Access code generated"
        maxWidth="sm:max-w-lg"
      >
        {issuedCode && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Admin</p>
              <p className="mt-1 text-sm text-navy-900">{issuedCode.name}</p>
              <p className="break-all text-sm text-slate-500">{issuedCode.email}</p>
            </div>

            <SecretValue label="Access code" value={issuedCode.accessCode} />

            <p className="text-sm text-slate-600">
              Expires in{' '}
              <span className="font-mono font-medium text-navy-900">{countdown(secondsLeft)}</span>.
              It works once, and any previous unused code has been cancelled.
            </p>

            {issuedCode.mailDelivered && (
              <Alert type="success">It has also been emailed to {issuedCode.email}.</Alert>
            )}
            {!issuedCode.mailDelivered && issuedCode.mailDetail && (
              <Alert type="warning">
                {undelivered('The code could not be emailed', issuedCode.mailDetail).text}
              </Alert>
            )}

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <CopyButton label="code" value={issuedCode.accessCode} />
              <button type="button" onClick={() => setIssuedCode(null)} className={BUTTON_PRIMARY}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- One-shot: a reissued temporary password -------------------- */}

      <Modal
        open={issuedPassword !== null}
        onClose={() => setIssuedPassword(null)}
        title="Temporary password reset"
        maxWidth="sm:max-w-lg"
      >
        {issuedPassword && (
          <div className="space-y-4">
            <Alert type="warning" title="Shown once">
              Copy it now. Only its hash is stored, so it cannot be shown again — it would have to
              be reset a second time.
            </Alert>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Admin</p>
              <p className="mt-1 text-sm text-navy-900">{issuedPassword.name}</p>
              <p className="break-all text-sm text-slate-500">{issuedPassword.email}</p>
            </div>

            <SecretValue label="Temporary password" value={issuedPassword.temporaryPassword} />

            {issuedPassword.activated && (
              <Alert type="success">
                The account was waiting on email verification and is now active. You confirmed the
                address, and the audit trail says so.
              </Alert>
            )}

            <p className="text-sm text-slate-600">
              They will also need a live access code to sign in. Generate one from the table when
              you are ready to hand both over.
            </p>

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <CopyButton label="password" value={issuedPassword.temporaryPassword} />
              <button
                type="button"
                onClick={() => setIssuedPassword(null)}
                className={BUTTON_PRIMARY}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
