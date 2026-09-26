'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { FieldError } from '@/components/ui';

/**
 * Requests a password reset link.
 *
 * The response is identical whether or not an account exists, so this form
 * cannot be used to discover which addresses are registered.
 */
export default function ForgotPasswordForm({ domain }: { domain: string }) {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setSent(null);
    const result = await api.post<{ message: string }>('/api/auth/forgot-password', { email });
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); return; }
    setSent(result.data.message);
  }

  if (sent) {
    return (
      <div>
        <p className="text-sm text-green-700">{sent}</p>
        <p className="mt-2 text-xs text-slate-500">
          The link expires in an hour and can be used once.
        </p>
        <div className="tdms-bootstrap-wrap">
          <Link href="/login" className="tdms-bootstrap-link"><span>Back to sign in</span></Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={submit}>
        <div className="tdms-field">
          <label htmlFor="email">Institutional Email</label>
          <div className="tdms-input-wrap">
            <svg className="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 6L2 7" />
            </svg>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              placeholder={`name@${domain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <FieldError messages={errors.email} />
        </div>

        <button type="submit" className="tdms-submit" disabled={busy}>
          <span>{busy ? 'Sending…' : 'Send Reset Link'}</span>
        </button>
      </form>

      <div className="tdms-bootstrap-wrap">
        <Link href="/login" className="tdms-bootstrap-link"><span>Back to sign in</span></Link>
      </div>
    </div>
  );
}
