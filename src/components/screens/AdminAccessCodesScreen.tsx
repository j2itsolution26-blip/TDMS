'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, Alert,
  BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_DANGER, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { succeeded, undelivered, type Notice } from '@/lib/notice';
import { diffForHumans, formatDate } from '@/lib/dates';

/**
 * Super Admin Dashboard → Admin Access Codes.
 *
 * Where the codes Admins type at sign-in are issued, watched and revoked.
 *
 * THE ONE RULE THIS SCREEN LIVES BY
 *
 * A code's digits appear exactly once: in the panel that opens straight after
 * it is generated. The list, the View dialog and every API response after that
 * carry the code's status and history, never the code — the server keeps only
 * a bcrypt hash and could not show it again if asked. Losing a code costs
 * nothing: generate another, and the old one is revoked automatically.
 */

export type AccessCodeStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface AccessCodeRow {
  id: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  status: AccessCodeStatus;
  expiresInSeconds: number | null;
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  revokedBy: string | null;
  attemptsUsed: number;
  maxAttempts: number;
}

export interface IssuableAdmin {
  id: string;
  name: string;
  email: string;
  blockedReason: string | null;
}

interface IssuedCode {
  codeId: string;
  adminId: string;
  name: string;
  email: string;
  accessCode: string;
  status: AccessCodeStatus;
  expiresInMinutes: number;
  accessCodeExpiresInSeconds: number;
  previousCodesRevoked: number;
  mailDelivered: boolean;
  mailDetail?: string;
}

interface Props {
  rows: AccessCodeRow[];
  page: number;
  lastPage: number;
  total: number;
  admins: IssuableAdmin[];
  expiryOptions: number[];
  defaultExpiry: number;
  mailConfigured: boolean;
  /** Open Generate on arrival — from ?generate=new or ?generate=<adminId>. */
  openGenerate: boolean;
  /** The Admin to preselect, when ?generate= named one. */
  preselectAdminId: string | null;
}

const STATUS_BADGE: Record<AccessCodeStatus, string> = {
  ACTIVE: 'active',
  USED: 'processing',
  EXPIRED: 'inactive',
  REVOKED: 'rejected',
};

const STATUS_LABEL: Record<AccessCodeStatus, string> = {
  ACTIVE: 'Active',
  USED: 'Used',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

const REVOKED_REASON: Record<string, string> = {
  revoked: 'Revoked by a Super Admin',
  superseded: 'Replaced by a newer code',
  attempts_exhausted: 'Too many incorrect attempts',
  account_suspended: 'Account suspended',
  password_reset: 'Password reset',
};

function countdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function AdminAccessCodesScreen({
  rows,
  page,
  lastPage,
  total,
  admins,
  expiryOptions,
  defaultExpiry,
  mailConfigured,
  openGenerate: openOnArrival,
  preselectAdminId,
}: Props) {
  const router = useRouter();

  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const firstIssuable = admins.find((a) => a.blockedReason === null)?.id ?? '';

  const [showGenerate, setShowGenerate] = useState(false);
  const [adminId, setAdminId] = useState(firstIssuable);
  const [minutes, setMinutes] = useState(defaultExpiry);
  const [emailIt, setEmailIt] = useState(false);

  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [viewing, setViewing] = useState<AccessCodeRow | null>(null);

  /*
   * Live countdowns, ticking down locally from seconds the server supplied —
   * never computed from an absolute time against this machine's clock, which
   * could be wrong in either direction.
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [rows, issued]);

  const liveSeconds = useCallback((seconds: number | null) => (seconds === null ? null : Math.max(0, seconds - elapsed)), [elapsed]);

  // When a listed ACTIVE code runs out, ask the server for the new truth.
  const anyJustExpired = useMemo(
    () => rows.some((r) => r.status === 'ACTIVE' && r.expiresInSeconds !== null && r.expiresInSeconds - elapsed === 0),
    [rows, elapsed],
  );
  useEffect(() => {
    if (anyJustExpired) router.refresh();
  }, [anyJustExpired, router]);

  // ?generate=… from the dashboard or Admin Accounts: open Generate, with the
  // named Admin chosen when there is one and a code can be issued to them.
  useEffect(() => {
    if (!openOnArrival) return;
    const target = admins.find((a) => a.id === preselectAdminId);
    if (target && target.blockedReason === null) setAdminId(target.id);
    setShowGenerate(true);
    // Drop the query so a refresh does not reopen the dialog.
    router.replace('/admin-access-codes');
  }, [openOnArrival]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearFeedback() {
    setMessage(null);
    setNotice(null);
  }

  function openGenerate() {
    clearFeedback();
    setAdminId((current) => current || firstIssuable);
    setMinutes(defaultExpiry);
    setEmailIt(false);
    setShowGenerate(true);
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();

    const result = await api.post<IssuedCode>('/api/admin-access-codes', {
      adminId,
      expiresInMinutes: minutes,
      emailAccessCode: emailIt,
    });

    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      setShowGenerate(false);
      return;
    }

    setShowGenerate(false);
    setCopied(false);
    setIssued(result.data);
    router.refresh();
  }

  async function revoke(codeId: string, who: string) {
    setBusy(true);
    clearFeedback();
    const result = await api.post<AccessCodeRow>(`/api/admin-access-codes/${codeId}/revoke`);
    setBusy(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setIssued((current) => (current?.codeId === codeId ? null : current));
    setViewing((current) => (current?.id === codeId ? result.data : current));
    setNotice(succeeded(`${who}’s access code has been revoked. It can no longer be used to sign in.`));
    router.refresh();
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ tone: 'warning', text: 'Could not reach the clipboard. Copy the code by hand.' });
    }
  }

  const issuedSeconds = issued ? liveSeconds(issued.accessCodeExpiresInSeconds) : null;
  const noIssuable = firstIssuable === '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Access Codes"
        subtitle="Issue one-time login access codes for Admin accounts. Each code works once, for one Admin, and expires."
        actions={
          <>
            <Link href="/admins" className={BUTTON_SECONDARY}>
              Admin Accounts
            </Link>
            <button type="button" onClick={openGenerate} className={BUTTON_PRIMARY} disabled={busy}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Generate Access Code
            </button>
          </>
        }
      />

      {message && <Alert type="danger">{message}</Alert>}
      {notice && <Alert type={notice.tone}>{notice.text}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No access codes yet"
            description="Generate one for an Admin. They enter it after their password when they sign in."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Admin</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Code status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Expires</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Created</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const left = liveSeconds(row.expiresInSeconds);
                    // Shown as expired the moment the countdown reaches zero,
                    // before the refresh lands.
                    const status: AccessCodeStatus = row.status === 'ACTIVE' && left === 0 ? 'EXPIRED' : row.status;
                    return (
                      <tr key={row.id}>
                        <td className="px-6 py-3.5 text-sm font-medium text-navy-900">{row.adminName}</td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">{row.adminEmail}</td>
                        <td className="px-6 py-3.5">
                          <Badge status={STATUS_BADGE[status]} label={STATUS_LABEL[status]} />
                          {status === 'REVOKED' && row.revokedReason && (
                            <p className="mt-1 text-xs text-slate-400">
                              {REVOKED_REASON[row.revokedReason] ?? row.revokedReason}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">
                          {status === 'ACTIVE' && left !== null ? (
                            <span className="font-mono">{countdown(left)}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">
                          {diffForHumans(row.createdAt)}
                          {row.createdBy && <p className="text-xs text-slate-400">by {row.createdBy}</p>}
                        </td>
                        <td className="px-6 py-3.5 text-right text-sm">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setViewing(row)}
                              className="font-medium text-slate-600 hover:text-indigo-600"
                            >
                              View
                            </button>
                            {status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => revoke(row.id, row.adminName)}
                                disabled={busy}
                                className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination page={page} lastPage={lastPage} total={total} basePath="/admin-access-codes" />
          </>
        )}
      </Card>

      {/* --- Generate --------------------------------------------------- */}

      <Modal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        title="Generate Admin Access Code"
        maxWidth="sm:max-w-lg"
      >
        {noIssuable ? (
          <div className="space-y-4">
            <Alert type="info">
              No Admin can be issued a code right now. An account must exist, be set up and be
              active first.
            </Alert>
            <div className="flex justify-end gap-3">
              <Link href="/admins" className={BUTTON_PRIMARY}>Go to Admin Accounts</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={generate} className="space-y-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="code-admin">Admin</label>
              <select
                id="code-admin"
                className={INPUT_CLASS}
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                required
              >
                {admins.map((a) => (
                  <option key={a.id} value={a.id} disabled={a.blockedReason !== null}>
                    {a.name} — {a.email}
                    {a.blockedReason ? ` (${a.blockedReason})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="code-expiry">Expiration</label>
              <select
                id="code-expiry"
                className={INPUT_CLASS}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                {expiryOptions.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes{m === defaultExpiry ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={emailIt}
                onChange={(e) => setEmailIt(e.target.checked)}
                disabled={!mailConfigured}
              />
              <span>
                Also email the code to them
                <span className="block text-xs text-slate-500">
                  {mailConfigured
                    ? 'Only the code is emailed, never a password.'
                    : 'Email is not configured on this deployment.'}
                </span>
              </span>
            </label>

            <p className="text-sm text-slate-500">
              Any unused code this Admin already has is revoked, so only the new one works.
            </p>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowGenerate(false)} className={BUTTON_SECONDARY}>
                Cancel
              </button>
              <button type="submit" className={BUTTON_PRIMARY} disabled={busy || !adminId}>
                {busy ? 'Generating…' : 'Generate Code'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* --- One-shot: the code ---------------------------------------- */}

      <Modal open={issued !== null} onClose={() => setIssued(null)} title="Access code generated" maxWidth="sm:max-w-lg">
        {issued && (
          <div className="space-y-4">
            <Alert type="warning" title="Shown once">
              Copy the code now and give it to {issued.name} securely. Only its hash is stored, so it
              cannot be shown again — you would generate a new one.
            </Alert>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Admin</p>
              <p className="mt-1 text-sm text-navy-900">{issued.name}</p>
              <p className="break-all text-sm text-slate-500">{issued.email}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Access code</p>
              <p className="mt-1 select-all rounded-lg border border-border bg-slate-50 px-3 py-3 text-center font-mono text-3xl tracking-[0.4em] text-navy-900">
                {issued.accessCode}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Expires in</p>
                <p className="mt-1 font-mono text-sm text-navy-900">
                  {issuedSeconds !== null && issuedSeconds > 0 ? countdown(issuedSeconds) : 'Expired'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1">
                  <Badge
                    status={issuedSeconds === 0 ? 'inactive' : 'active'}
                    label={issuedSeconds === 0 ? 'Expired' : 'Active'}
                  />
                </p>
              </div>
            </div>

            {issued.previousCodesRevoked > 0 && (
              <p className="text-sm text-slate-500">Their previous unused code has been revoked.</p>
            )}
            {issued.mailDelivered && (
              <Alert type="success">It has also been emailed to {issued.email}.</Alert>
            )}
            {!issued.mailDelivered && issued.mailDetail && (
              <Alert type="warning">{undelivered('The code could not be emailed', issued.mailDetail).text}</Alert>
            )}

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <button type="button" onClick={() => copyCode(issued.accessCode)} className={BUTTON_SECONDARY}>
                {copied ? 'Copied' : 'Copy Code'}
              </button>
              <button
                type="button"
                onClick={() => revoke(issued.codeId, issued.name)}
                className={BUTTON_DANGER}
                disabled={busy}
              >
                Revoke
              </button>
              <button type="button" onClick={() => setIssued(null)} className={BUTTON_PRIMARY}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- View ------------------------------------------------------- */}

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title="Access code" maxWidth="sm:max-w-lg">
        {viewing && (
          <div className="space-y-4">
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <dt className="text-slate-500">Admin</dt>
              <dd className="col-span-2 text-navy-900">
                {viewing.adminName}
                <span className="block break-all text-slate-500">{viewing.adminEmail}</span>
              </dd>

              <dt className="text-slate-500">Status</dt>
              <dd className="col-span-2">
                <Badge status={STATUS_BADGE[viewing.status]} label={STATUS_LABEL[viewing.status]} />
              </dd>

              <dt className="text-slate-500">Created</dt>
              <dd className="col-span-2 text-navy-900">
                {formatDate(viewing.createdAt)} · {diffForHumans(viewing.createdAt)}
                {viewing.createdBy && <span className="block text-slate-500">by {viewing.createdBy}</span>}
              </dd>

              <dt className="text-slate-500">Expires</dt>
              <dd className="col-span-2 text-navy-900">
                {viewing.status === 'ACTIVE' && viewing.expiresInSeconds !== null
                  ? `in ${countdown(liveSeconds(viewing.expiresInSeconds) ?? 0)}`
                  : formatDate(viewing.expiresAt)}
              </dd>

              {viewing.usedAt && (
                <>
                  <dt className="text-slate-500">Used</dt>
                  <dd className="col-span-2 text-navy-900">{formatDate(viewing.usedAt)}</dd>
                </>
              )}

              {viewing.status === 'REVOKED' && (
                <>
                  <dt className="text-slate-500">Revoked</dt>
                  <dd className="col-span-2 text-navy-900">
                    {viewing.revokedAt ? formatDate(viewing.revokedAt) : '—'}
                    <span className="block text-slate-500">
                      {REVOKED_REASON[viewing.revokedReason ?? ''] ?? viewing.revokedReason}
                      {viewing.revokedBy && ` · by ${viewing.revokedBy}`}
                    </span>
                  </dd>
                </>
              )}

              <dt className="text-slate-500">Attempts</dt>
              <dd className="col-span-2 text-navy-900">
                {viewing.attemptsUsed} of {viewing.maxAttempts} incorrect attempts used
              </dd>
            </dl>

            <p className="text-xs text-slate-500">
              The code itself is not shown. It was displayed once when it was generated, and only a
              hash of it is stored.
            </p>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              {viewing.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => revoke(viewing.id, viewing.adminName)}
                  className={BUTTON_DANGER}
                  disabled={busy}
                >
                  Revoke
                </button>
              )}
              <button type="button" onClick={() => setViewing(null)} className={BUTTON_PRIMARY}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
