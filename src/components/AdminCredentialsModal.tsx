'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import { Alert, Badge, BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui';
import { ACCOUNT_STATUS_BADGE, ACCOUNT_STATUS_LABELS, type AccountStatus } from '@/types/domain';
import { diffForHumans, formatDate } from '@/lib/dates';
import type { AccessCodeRow, AccessCodeStatus } from '@/components/screens/AdminAccessCodesScreen';

/**
 * An Admin's two credentials, side by side and never confused.
 *
 *   TEMPORARY PASSWORD   the first factor, while it is still temporary. Can be
 *                        shown on request (audited), because the server keeps an
 *                        encrypted copy until the Admin replaces it.
 *   ACCESS CODE          the second factor. Never shown after it was generated:
 *                        only a hash exists. Generate a new one instead.
 *
 * Where secrets live in this component: a revealed password is held in state
 * only while it is on screen — cleared on Hide, on close, and whenever the modal
 * opens for somebody else. Never localStorage, never the URL, never logged.
 */

type TemporaryPasswordState =
  | { state: 'none' }
  | { state: 'available'; issuedAt: string; issuedBy: string | null; revealExpiresInSeconds: number }
  | { state: 'unavailable'; reason: string; message: string };

interface Credentials {
  admin: {
    id: string;
    name: string;
    email: string;
    status: AccountStatus;
    setUp: boolean;
    mustChangePassword: boolean;
  };
  temporaryPassword: TemporaryPasswordState;
  currentCode: AccessCodeRow | null;
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

/** Hours and minutes, for the longer reveal window. */
function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function AdminCredentialsModal({
  open,
  onClose,
  adminId,
  codeId,
  title,
  onGenerateCode,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  adminId: string | null;
  /** A specific code to describe; otherwise the Admin's most recent one. */
  codeId?: string | null;
  title: string;
  onGenerateCode: (adminId: string) => void;
  onChanged: () => void;
}) {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [code, setCode] = useState<AccessCodeRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [justReset, setJustReset] = useState(false);

  const [elapsed, setElapsed] = useState(0);

  const load = useCallback(async () => {
    if (!adminId) return;
    const [c, specific] = await Promise.all([
      api.get<Credentials>(`/api/admins/${adminId}/credentials`),
      codeId ? api.get<AccessCodeRow>(`/api/admin-access-codes/${codeId}`) : Promise.resolve(null),
    ]);
    if (!c.ok) {
      setMessage(c.message);
      return;
    }
    setCreds(c.data);
    setCode(specific && specific.ok ? specific.data : c.data.currentCode);
    setElapsed(0);
  }, [adminId, codeId]);

  // Every open starts clean: no password left over from another Admin.
  useEffect(() => {
    if (!open) return;
    setCreds(null);
    setCode(null);
    setRevealed(null);
    setCopied(false);
    setConfirmReset(false);
    setJustReset(false);
    setMessage(null);
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [open]);

  function close() {
    setRevealed(null);
    onClose();
  }

  async function reveal() {
    if (!adminId) return;
    setBusy(true);
    setMessage(null);
    const result = await api.post<{ temporaryPassword: string }>(
      `/api/admins/${adminId}/temporary-password/reveal`,
    );
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      await load();
      return;
    }
    setRevealed(result.data.temporaryPassword);
  }

  async function resetPassword() {
    if (!adminId) return;
    setBusy(true);
    setMessage(null);
    const result = await api.post<{ temporaryPassword: string; codesRevoked: number }>(
      `/api/admins/${adminId}/reset-password`,
    );
    setBusy(false);
    setConfirmReset(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    // The new one is shown straight away: the Super Admin just asked for it.
    setRevealed(result.data.temporaryPassword);
    setJustReset(true);
    await load();
    onChanged();
  }

  async function revoke() {
    if (!code) return;
    setBusy(true);
    setMessage(null);
    const result = await api.post<AccessCodeRow>(`/api/admin-access-codes/${code.id}/revoke`);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setCode(result.data);
    setElapsed(0);
    onChanged();
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Could not reach the clipboard. Copy it by hand.');
    }
  }

  const admin = creds?.admin;
  const temp = creds?.temporaryPassword;
  const codeLeft = code?.expiresInSeconds != null ? Math.max(0, code.expiresInSeconds - elapsed) : null;
  const codeStatus: AccessCodeStatus | null = code
    ? code.status === 'ACTIVE' && codeLeft === 0
      ? 'EXPIRED'
      : code.status
    : null;
  const canIssue = admin ? admin.setUp && admin.status === 'ACTIVE' : false;

  const resetControl = confirmReset ? (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      A new temporary password will be generated and shown here. The current one stops working,
      their sessions end, and any unused access code is revoked.
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={resetPassword} className={BUTTON_PRIMARY} disabled={busy}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
        <button type="button" onClick={() => setConfirmReset(false)} className={BUTTON_SECONDARY}>
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setConfirmReset(true)}
      className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
      disabled={busy}
    >
      Reset Temporary Password
    </button>
  );

  return (
    <Modal open={open} onClose={close} title={title} maxWidth="sm:max-w-lg">
      {loading || !admin || !temp ? (
        <p className="text-sm text-slate-500">{message ?? 'Loading…'}</p>
      ) : (
        <div className="space-y-5">
          {message && <Alert type="danger">{message}</Alert>}

          {/* --- The account ------------------------------------------- */}
          <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <dt className="text-slate-500">Admin</dt>
            <dd className="col-span-2 text-navy-900">
              {admin.name}
              <span className="block break-all text-slate-500">{admin.email}</span>
            </dd>

            <dt className="text-slate-500">Status</dt>
            <dd className="col-span-2">
              {admin.setUp ? (
                <Badge status={ACCOUNT_STATUS_BADGE[admin.status]} label={ACCOUNT_STATUS_LABELS[admin.status]} />
              ) : (
                <Badge status="pending" label="Not set up" />
              )}
            </dd>
          </dl>

          {/* --- Credential 1: the temporary password ------------------ */}
          <section className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Temporary password</p>

            {temp.state === 'available' && (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <p
                    className={`flex-1 break-all rounded-lg border border-border bg-slate-50 px-3 py-2 font-mono text-sm text-navy-900 ${revealed ? 'select-all' : 'select-none'}`}
                    aria-live="polite"
                  >
                    {revealed ?? '••••••••••••••••'}
                  </p>
                  {revealed ? (
                    <>
                      <button type="button" onClick={() => copy(revealed)} className={BUTTON_SECONDARY}>
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button type="button" onClick={() => setRevealed(null)} className={BUTTON_SECONDARY}>
                        Hide
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={reveal} className={BUTTON_SECONDARY} disabled={busy}>
                      {busy ? '…' : 'Show'}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {justReset ? 'Just issued' : `Issued ${diffForHumans(temp.issuedAt)}`}
                  {temp.issuedBy && ` by ${temp.issuedBy}`}. Can be shown until they choose their own
                  password
                  {temp.revealExpiresInSeconds > 0 && `, for up to ${duration(temp.revealExpiresInSeconds)}`}.
                  Each reveal is recorded.
                </p>
                {resetControl}
              </>
            )}

            {temp.state === 'none' && (
              <>
                <p className="mt-2 text-sm text-navy-900">No active temporary password.</p>
                <p className="mt-1 text-xs text-slate-500">
                  They have chosen their own password, which is never stored in a form that can be
                  shown.
                </p>
                {resetControl}
              </>
            )}

            {temp.state === 'unavailable' && (
              <>
                {revealed ? (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="flex-1 select-all break-all rounded-lg border border-border bg-slate-50 px-3 py-2 font-mono text-sm text-navy-900">
                      {revealed}
                    </p>
                    <button type="button" onClick={() => copy(revealed)} className={BUTTON_SECONDARY}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-navy-900">A temporary password is set, but it can’t be shown.</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {revealed
                    ? 'Copy it now — revealing is not configured, so it cannot be shown again after you close this.'
                    : temp.message}
                </p>
                {!revealed && resetControl}
              </>
            )}
          </section>

          {/* --- Credential 2: the access code ------------------------- */}
          <section className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access code</p>

            {!code || !codeStatus ? (
              <p className="mt-2 text-sm text-navy-900">No access code has been issued yet.</p>
            ) : (
              <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Status</dt>
                <dd className="col-span-2">
                  <Badge status={STATUS_BADGE[codeStatus]} label={STATUS_LABEL[codeStatus]} />
                  {codeStatus === 'REVOKED' && code.revokedReason && (
                    <span className="ml-2 text-xs text-slate-500">
                      {REVOKED_REASON[code.revokedReason] ?? code.revokedReason}
                      {code.revokedBy && ` · by ${code.revokedBy}`}
                    </span>
                  )}
                </dd>

                <dt className="text-slate-500">Created</dt>
                <dd className="col-span-2 text-navy-900">
                  {formatDate(code.createdAt)} · {diffForHumans(code.createdAt)}
                  {code.createdBy && <span className="block text-slate-500">by {code.createdBy}</span>}
                </dd>

                <dt className="text-slate-500">Expires</dt>
                <dd className="col-span-2 text-navy-900">
                  {codeStatus === 'ACTIVE' && codeLeft !== null ? `in ${countdown(codeLeft)}` : formatDate(code.expiresAt)}
                </dd>

                {code.usedAt && (
                  <>
                    <dt className="text-slate-500">Used</dt>
                    <dd className="col-span-2 text-navy-900">{formatDate(code.usedAt)}</dd>
                  </>
                )}

                <dt className="text-slate-500">Attempts</dt>
                <dd className="col-span-2 text-navy-900">
                  {code.attemptsUsed} of {code.maxAttempts} incorrect attempts used
                </dd>
              </dl>
            )}

            <p className="mt-3 text-xs text-slate-500">
              The access code itself is not stored in plaintext, so it cannot be shown again. Generate a
              new code if necessary.
            </p>
          </section>

          <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
            {canIssue && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onGenerateCode(admin.id);
                }}
                className={BUTTON_SECONDARY}
              >
                Generate New Code
              </button>
            )}
            {codeStatus === 'ACTIVE' && (
              <button type="button" onClick={revoke} className={BUTTON_DANGER} disabled={busy}>
                Revoke
              </button>
            )}
            <button type="button" onClick={close} className={BUTTON_PRIMARY}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
