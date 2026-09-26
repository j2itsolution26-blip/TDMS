'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { FieldError } from '@/components/ui';

/**
 * Sets a new password against a single-use token.
 *
 * Doubles as the final step of an invitation: `?welcome=1` is set when the
 * person arrives straight from verifying their address, so the copy asks them
 * to choose a password rather than to replace one.
 */
export default function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const welcome = params.get('welcome') === '1';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);
    const result = await api.post<{ next: string }>('/api/auth/reset-password', {
      token,
      password,
      passwordConfirmation: confirmation,
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.errors ? null : result.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace('/login'), 1200);
  }

  if (!token) {
    return (
      <div>
        <p className="text-sm text-slate-600">
          This link is missing its code. Open the link from your email exactly as it was sent.
        </p>
        <div className="tdms-bootstrap-wrap">
          <Link href="/forgot-password" className="tdms-bootstrap-link"><span>Request a new link</span></Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <p className="text-sm text-green-700">
          Password set. Taking you to the sign-in page…
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        {welcome
          ? 'Your email address is verified. Choose a password to finish setting up your account.'
          : 'Choose a new password for your TDMS account.'}
      </p>

      <form onSubmit={submit}>
        <div className="tdms-field">
          <label htmlFor="password">New Password</label>
          <div className="tdms-input-wrap">
            <svg className="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              id="password"
              type="password"
              required
              autoFocus
              autoComplete="new-password"
              placeholder="At least 12 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <FieldError messages={errors.password} />
        </div>

        <div className="tdms-field">
          <label htmlFor="password_confirmation">Confirm Password</label>
          <div className="tdms-input-wrap">
            <svg className="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              id="password_confirmation"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Re-enter the password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>
          <FieldError messages={errors.passwordConfirmation} />
        </div>

        {message && <p className="mt-2 text-sm text-red-600">{message}</p>}

        <button type="submit" className="tdms-submit" disabled={busy}>
          <span>{busy ? 'Saving…' : welcome ? 'Set Password' : 'Reset Password'}</span>
        </button>
      </form>
    </div>
  );
}
